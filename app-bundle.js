// Dependencies
var fs = require('fs');
var path = require('path');
var nativeModulesList = require('./lib/nativeModulesList');
var regex = require('./lib/regex');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

var mutexSemaphores = [];

// extend string proto object
// very useful method
String.prototype.replaceBetween = function(start, end, what) {
  return this.substring(0, start) + what + this.substring(start + end);
};

// abbreviation of parseInt(val, 10)
function parseInt10(val) {
  return parseInt(val, 10);
}


function AppBundle(options) {
  options = options || {};

  this.input = {};

  if(!options.path) {
    throw new Error('The path to the input is required');
  }

  this.input.path = options.path;
  this.input.read = 0; // What has been read from the input

  this.ancestor = options.ancestor || false;
}

util.inherits(AppBundle, EventEmitter);


AppBundle.prototype.read = function (dirname) {
  var self = this;

  var filename = self.input.path;

  // If filename is a relative path
  // or just a name of the module
  // we need to resolve it to the actual path
  if (!path.isAbsolute(self.input.path)) {
    if (!dirname) {
      var errMsg = 'If the first argument isn\'t an absolute path then the second argument must be defined';
      return console.log(new Error(errMsg));
    }

    filename = self.__resolvePath(self.input.path, dirname);
  }

  self.dirname = path.dirname(filename);

  return fs.readFile(filename, 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }

    // Store input length & data
    self.input.length = data.length;
    self.input.data = data;

    return AppBundle.traversal();
  });
};


AppBundle.prototype.traversal = function () {
  var self = this;

  var match = self.input.data.match(regex.require);

  if (match) {
    var matchedString = match.slice(0, 1)[0];

    // get the last index read
    var lastIndex = match.index + matchedString.length;

    self.writeToOutput(lastIndex);


    // Replace everything until we
    // get the filename
    var requiredArg = matchedString
      .replace('require(', '')
      .replace(')', '')
      .replace(regex.singleQuotes, '')
      .replace(regex.doubleQuotes, '');

    // If isnt a native module
    if (nativeModulesList.indexOf(requiredArg) < 0) {

      return replaceRequire(input,
        {
          arg: requiredArg,
          index: match.index,
          length: matchedString.length,
          parentPath: parentPath
        },
        function (err, newInput, newParentPath) {
          if (err) {
            return cb(err);
          }

          return scanLoop(newInput, newParentPath);
        }
      );
    } else {
      return scanLoop(input, parentPath);
    }
  } else {
    return cb(null, this.output);
  }
};


AppBundle.__resolvePath = function (filename, parentPath) {
  var moduleRootDir = findModuleRootDir(parentPath);

  var nodeModulePath = path.resolve(moduleRootDir, 'node_modules', path.basename(filename));

  // If it is a node module
  if (fs.existsSync(nodeModulePath)) {
    return nodeModulePath;
  }


  if(!parentPath || !path.isAbsolute(parentPath)) {
    throw new Error('something went bad on getting the parentPath');
  }

  // Get directory
  parentPath = path.dirname(parentPath);

  return path.resolve(parentPath, filename);
};


// Where it finds the nearast package.josn
// that is the root directory of that module
var findModuleRootDir = function findNearestPackageJSONLoop(dirPath) {
  if (fs.existsSync(dirPath + '/package.json')) {
    return dirPath;
  } else {
    return findNearestPackageJSONLoop(path.dirname(dirPath));
  }
};


var replaceRequire = function (input, required, cb) {
  var wrapper = [
    '(function() {\n',
    '\n})();'
  ];

  return readInput(required.arg, required.parentPath, function(err, bundle, newParentPath) {
    if (err) {
      return console.log(err);
    }

    var hasModuleExports = bundle.match(regex.moduleExp);

    if(hasModuleExports) {
      // why +14 ? count how much chars 'module.exports' has
      var moduleExport = bundle.substring(hasModuleExports.index + 14, bundle.length);
      moduleExport = resolveModuleExports(moduleExport);

      // Remove module.exports from the bundle
      bundle = bundle.replaceBetween(hasModuleExports.index, moduleExport.lengthCount + 14, '');


      // Act as module.export
      bundle += '\n return '+ moduleExport.variable + ';';
    }

    // Wrap the script
    bundle = wrapper[0] + bundle + wrapper[1];

    input = input.replaceBetween(required.index, required.length, bundle);

    console.log(input);
    //return cb(err, bundle, newParentPath)
  });
};


var resolveModuleExports = function resolveModuleExportsFn(input, count) {
  var equalMatch = input.match(regex.equalExp);

  // just to be sure
  if(!count) {
    count = 0;
  }

  if(equalMatch) {
    var matchedString = equalMatch.slice(0, 1)[0];
    count += parseInt(matchedString.length, 10);

    // Remove matched regex
    input = input.replaceBetween(equalMatch.index, matchedString.length, '');

    var varMatch = input.match(regex.jsVariable);

    if(varMatch) {
      return resolveModuleExportsFn(input, count);
    } else {
      throw new Error('Something is wrong');
    }
  } else {
    count += parseInt(input.length, 10);

    return {
      variable: input.trim().replace(';', ''),
      lengthCount: count // used to remove module.exports
    };
  }
};


AppBundle.prototype.writeToOutput = function (index) {
  this.output = this.input.substring(0, index);
  this.input = this.input.substring(index + 1, this.input.length);
};

var appBundle = new AppBundle({
  path: __dirname + '/test.js'
});

appBundle.on('finished', function(err, data) {
  console.log(data);
});
