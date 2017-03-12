var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var fs = require("fs");

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["analysis.js"];
	}
	var filePath = args[0];
	
	String.prototype.endsWith = function(suffix) {
	  return this.indexOf(suffix, this.length - suffix.length) !== -1;
	};

	var walkSync = function(dir, filelist) {
            var path = path || require('path');
            var fs = fs || require('fs'),
                files = fs.readdirSync(dir);
            filelist = filelist || [];
            files.forEach(function(file) {
                if (fs.statSync(path.join(dir, file)).isDirectory()) {
                    filelist = walkSync(path.join(dir, file), filelist);
                }
                else {
                    filelist.push(path.join(dir, file));
                }
            });
            return filelist;
        };

    filelist = []

    filelist = walkSync(__dirname,filelist);
    //console.log("Filelist: ", filelist);

    for( i=0; i < filelist.length; i++)
    {   
	//console.log("i: " + filelist[i])
	if(filelist[i].endsWith('.js') && filelist[i].indexOf('node_modules')==-1 && filelist[i].indexOf('analysis.js')==-1)
    	{
    		console.log("XML File: ", filelist[i]);

    		builders = {};

		    complexity(filelist[i]);
			// Report
			for( var node in builders )
			{
				var builder = builders[node];
				
				builder.report();

				if(builder.MaxConditions > 8)
					process.exit(-1);
				if(builder.lineCount > 100)
					process.exit(-1);
				if(builder.MaxNestingDepth > 3)
					process.exit(-1);
			}
    	}
    }

    process.exit(0);
}



var builders = {};

// Represent a reusable "class" following the Builder pattern.
function FunctionBuilder()
{
	this.StartLine = 0;
	this.FunctionName = "";
	// The number of parameters for functions
	this.ParameterCount  = 0,
	// Number of if statements/loops + 1
	this.SimpleCyclomaticComplexity = 1;
	// The max depth of scopes (nested ifs, loops, etc)
	this.MaxNestingDepth    = 0;
	// The max number of conditions if one decision statement.
	this.MaxConditions      = 0;

	this.lineCount = 0;

	this.report = function()
	{
		console.log(
		   (
		   	"{0}(): {1}\n" +
		   	"============\n" +
			   "SimpleCyclomaticComplexity: {2}\t" +
				"MaxNestingDepth: {3}\t" +
				"MaxConditions: {4}\t" +
				"LineCount: {5}\t" +
				"Parameters: {6}\n\n"
			)
			.format(this.FunctionName, this.StartLine,
				     this.SimpleCyclomaticComplexity, this.MaxNestingDepth,
			        this.MaxConditions, this.lineCount, this.ParameterCount)
		);
	}
};

// A builder for storing file level information.
function FileBuilder()
{
	this.FileName = "";
	// Number of strings in a file.
	this.Strings = 0;
	// Number of imports in a file.
	this.ImportCount = 0;

	this.report = function()
	{
		console.log (
			( "{0}\n" +
			  "~~~~~~~~~~~~\n"+
			  "ImportCount {1}\t" +
			  "Strings {2}\n"
			).format( this.FileName, this.ImportCount, this.Strings ));
	}
}

// A function following the Visitor pattern.
// Annotates nodes with parent objects.
function traverseWithParents(object, visitor)
{
    var key, child;

    visitor.call(null, object);


    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && key != 'parent') 
            {
            	child.parent = object;
					traverseWithParents(child, visitor);
            }
        }
    }
}

function traverseNestingsWithParents(object, nestingLevel, visitor)
{
    var key, child;

    //console.log("Inside Traverse Nesting");

    visitor.call(null, object, nestingLevel);


    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            //console.log("Checking Key: ", key);
            if (typeof child === 'object' && child !== null && key != 'parent' && child.type == 'BlockStatement')
            {
            	//console.log("Found Block Statement");
            	//console.log("Child: ", child);
            	traverseNestingsWithParents(child, nestingLevel, visitor);
            }
            else if (typeof child === 'object' && child !== null && key != 'parent' && isLoop(child)) 
            {
            	//console.log("Found inner loops");
            	child.parent = object;
            	traverseNestingsWithParents(child, nestingLevel+1, visitor);
            }
            else if (typeof child === 'object' && child !== null && key != 'parent')
            {
            	traverseNestingsWithParents(child, nestingLevel, visitor);
            }
        }
    }
}



function visit(object, visitor)
{

	var key, child;

    visitor.call(null, object);

    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && key != 'parent') 
            {
            	child.parent = object;
            	if(object.type === 'CallExpression')
				{
					visit(child,visitor);
				}
				traverseWithParents(child, visitor);
            }
        }
    }

}

function visitNestedLoops(object, visitor)
{

	var key, child;

    visitor.call(null, object);

    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null && key != 'parent') 
            {
            	child.parent = object;
            	if(isLoop(object))
				{
					visitNestedLoops(child,visitor);
				}
				traverseWithParents(child, visitor);
            }
        }
    }

}


function visitLogicalExpressions(object, visitor)
{
	var key, left, right;
	visitor.call(null, object);

	if(typeof object.left == 'object' && object.left !== null)
	{
		//if(object.left.type == 'LogicalExpression')
		//{
	//		console.log("Moving to Left Child");
			visitLogicalExpressions(object.left, visitor);
		//}
	}


	if(typeof object.right == 'object' && object.right !== null)
	{
		//if(object.right.type == 'LogicalExpression')
		//{
		//	console.log("Moving to Right Child");
			visitLogicalExpressions(object.right, visitor);
		//}
	}
}



function complexity(filePath)
{
	var buf = fs.readFileSync(filePath, "utf8");
	var ast = esprima.parse(buf, options);

	//console.log("AST: " + ast)
	var i = 0;

	// A file level-builder:
	var fileBuilder = new FileBuilder();
	fileBuilder.FileName = filePath;
	fileBuilder.ImportCount = 0;
	builders[filePath] = fileBuilder;

	/*
	traverseWithParents(ast, function (node)
	{
		if (node.type === 'FunctionDeclaration' && functionName(node) == 'visit')
		{
			traverseWithParents(node, function (node)
			{
				console.log(node);
			});
		} 
	});
	*/


	// Tranverse program with a function visitor.
	traverseWithParents(ast, function (node) 
	{


	    if(node.type === 'CallExpression')
	    {
	    	if(node.callee.name === "require")
	    	{
	    		fileBuilder.ImportCount++;
	    	}
	    }



		if (node.type === 'FunctionDeclaration') 
		{

			//console.log("Node Start: ", node.loc.start.line);
			//console.log("Node End: ", node.loc.end.line);
			var builder = new FunctionBuilder();

			builder.FunctionName = functionName(node);
			builder.StartLine    = node.loc.start.line;
			builder.ParameterCount = node.params.length;
			builder.lineCount = parseInt(node.loc.end.line) - parseInt(node.loc.start.line);

			traverseWithParents(node, function(child)
			{
				if(isDecision(child))
				{
					builder.SimpleCyclomaticComplexity++;
				}
			});

			traverseWithParents(node, function(child)
			{


				var ifConditions = 0;

				if (child.type == 'IfStatement' && child.test.type == 'LogicalExpression') 
				{

					

					visitLogicalExpressions(child.test, function(childTest)
					{
						if(childTest.type == 'BinaryExpression')
						{
							ifConditions++;
						}
					})
				}

				//console.log("Function: ", builder.FunctionName, " Comparing Between: ", ifConditions, " and ", builder.MaxConditions);
				builder.MaxConditions = Math.max(ifConditions,builder.MaxConditions);
				

			});

			var nestingLevel = 0;
			
			traverseNestingsWithParents(node, 0, function(child, nest) {

						nestingLevel = Math.max(nestingLevel, nest);

			});

			builder.MaxNestingDepth = Math.max(nestingLevel,builder.MaxNestingDepth);

			builders[builder.FunctionName] = builder;
		}



	});



}

// Helper function for counting children of node.
function childrenLength(node)
{
	var key, child;
	var count = 0;
	for (key in node) 
	{
		if (node.hasOwnProperty(key)) 
		{
			child = node[key];
			if (typeof child === 'object' && child !== null && key != 'parent') 
			{
				count++;
			}
		}
	}	
	return count;
}


// Helper function for checking if a node is a "decision type node"
function isDecision(node)
{
	if( node.type == 'IfStatement' || node.type == 'ForStatement' || node.type == 'WhileStatement' ||
		 node.type == 'ForInStatement' || node.type == 'DoWhileStatement')
	{
		return true;
	}
	return false;
}


// Helper function for checking if a node is a "loop type node"
function isLoop(node)
{
	if( node.type == 'ForStatement' || node.type == 'WhileStatement' ||
		 node.type == 'ForInStatement' || node.type == 'DoWhileStatement')
	{
		return true;
	}
	return false;
}

// Helper function for printing out function name.
function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "anon function @" + node.loc.start.line;
}

// Helper function for allowing parameterized formatting of strings.
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();

function Crazy (argument) 
{

	var date_bits = element.value.match(/^(\d{4})\-(\d{1,2})\-(\d{1,2})$/);
	var new_date = null;
	if(date_bits && date_bits.length == 4 && parseInt(date_bits[2]) > 0 && parseInt(date_bits[3]) > 0)
    new_date = new Date(parseInt(date_bits[1]), parseInt(date_bits[2]) - 1, parseInt(date_bits[3]));

    var secs = bytes / 3500;

      if ( secs < 59 )
      {
          return secs.toString().split(".")[0] + " seconds";
      }
      else if ( secs > 59 && secs < 3600 )
      {
          var mints = secs / 60;
          var remainder = parseInt(secs.toString().split(".")[0]) -
(parseInt(mints.toString().split(".")[0]) * 60);
          var szmin;
          if ( mints > 1 )
          {
              szmin = "minutes";
          }
          else
          {
              szmin = "minute";
          }
          return mints.toString().split(".")[0] + " " + szmin + " " +
remainder.toString() + " seconds";
      }
      else
      {
          var mints = secs / 60;
          var hours = mints / 60;
          var remainders = parseInt(secs.toString().split(".")[0]) -
(parseInt(mints.toString().split(".")[0]) * 60);
          var remainderm = parseInt(mints.toString().split(".")[0]) -
(parseInt(hours.toString().split(".")[0]) * 60);
          var szmin;
          if ( remainderm > 1 )
          {
              szmin = "minutes";
          }
          else
          {
              szmin = "minute";
          }
          var szhr;
          if ( remainderm > 1 )
          {
              szhr = "hours";
          }
          else
          {
              szhr = "hour";
              for ( i = 0 ; i < cfield.value.length ; i++)
				  {
				    var n = cfield.value.substr(i,1);
				    if ( n != 'a' && n != 'b' && n != 'c' && n != 'd'
				      && n != 'e' && n != 'f' && n != 'g' && n != 'h'
				      && n != 'i' && n != 'j' && n != 'k' && n != 'l'
				      && n != 'm' && n != 'n' && n != 'o' && n != 'p'
				      && n != 'q' && n != 'r' && n != 's' && n != 't'
				      && n != 'u' && n != 'v' && n != 'w' && n != 'x'
				      && n != 'y' && n != 'z'
				      && n != 'A' && n != 'B' && n != 'C' && n != 'D'
				      && n != 'E' && n != 'F' && n != 'G' && n != 'H'
				      && n != 'I' && n != 'J' && n != 'K' && n != 'L'
				      && n != 'M' && n != 'N' &&  n != 'O' && n != 'P'
				      && n != 'Q' && n != 'R' && n != 'S' && n != 'T'
				      && n != 'U' && n != 'V' && n != 'W' && n != 'X'
				      && n != 'Y' && n != 'Z'
				      && n != '0' && n != '1' && n != '2' && n != '3'
				      && n != '4' && n != '5' && n != '6' && n != '7'
				      && n != '8' && n != '9'
				      && n != '_' && n != '@' && n != '-' && n != '.' )
				    {
				      window.alert("Only Alphanumeric are allowed.\nPlease re-enter the value.");
				      cfield.value = '';
				      cfield.focus();
				    }
				    cfield.value =  cfield.value.toUpperCase();
				  }
				  return;
          }
          return hours.toString().split(".")[0] + " " + szhr + " " +
mints.toString().split(".")[0] + " " + szmin;
      }
  }
 
