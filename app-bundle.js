// Dependencies
var fs = require('fs');
var path = require('path');
var nativeModulesList = require('./lib/nativeModulesList');
var regex = require('./lib/regex');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var semver = require('semver');
var extend = require('extend');


var mutexSemaphores = [];


if (semver.gt('0.12.0', process.version)) {
  var pathExtension = require('./lib/path');
  extend(true, path, pathExtension);
}


// extend string proto object
// very useful method
String.prototype.replaceBetween = function(start, end, what) {
  return this.substring(0, start) + what + this.substring(end);
};

// abbreviation of parseInt(val, 10)
function parseInt10(val) {
  return parseInt(val, 10);
}


function AppBundle(options) {
  options = options || {};

  if(!options.path) {
    throw new Error('The path to the input is required');
  }

  this.path = options.path;
  this.read = 0; // What has been read from the input
  this.length = 0; // original length of input

  this.ancestor = options.ancestor || false;
  this.output = '';
}

util.inherits(AppBundle, EventEmitter);


AppBundle.prototype.start = function (dirname) {
  var self = this;

  var filename = self.path;


  // TO-DO CHECK IF THIS CODE BLOCK IS STILL NEEDED
  //
  // If filename is a relative path
  // or just a name of the module
  // we need to resolve it to the actual path
  if (!path.isAbsolute(self.path)) {
    if (!dirname) {
      var err = new Error('If the first argument isn\'t an absolute path then the second argument must be defined');
      return self.emit('finished', err);
    }

    filename = AppBundle.resolvePath(self.path, dirname, self.ancestor);
  }

  self.dirname = path.dirname(filename);

  return fs.readFile(filename, 'utf8', function (err, data) {
    if (err) {
      return self.emit('finished', err);
    }

    // Store input length & data
    self.length = data.length;
    self.input = data;

    return self.traversal();
  });
};


AppBundle.prototype.traversal = function () {
  var self = this;

  var match = self.input.match(regex.require);

  if (match) {
    var matchedString = match.slice(0, 1)[0];

    self.index = {
      start: match.index,
      end: match.index + matchedString.length
    };

    // Replace everything until we
    // get the filename
    var requiredArg = matchedString
      .replace('require(', '')
      .replace(')', '')
      .replace(regex.singleQuotes, '')
      .replace(regex.doubleQuotes, '')
      .replace(';', '');

    // If isnt a native module
    if (nativeModulesList.indexOf(requiredArg) < 0) {

      var appBundleChild = new AppBundle({
        path: AppBundle.resolvePath(requiredArg, self.dirname, self),
        ancestor: self
      });

      appBundleChild.on('finished', function(err, data) {
        if (data) {
          self.input = self.input.replaceBetween(self.index.start, self.index.end, AppBundle.wrap(data));
          self.index.end += data.length;
        } else {
          self.input = self.input.replaceBetween(self.index.start, self.index.end, 'null;');
        }

        self.writeToOutput();
        return self.traversal();
      });

      return appBundleChild.start();
    } else {
      // Write to ouput what we have read
      self.writeToOutput();

      return self.traversal();
    }
  } else {
    // write the rest of the input to the ouput
    this.output += this.input;

    return self.emit('finished', null, this.output);
  }
};


AppBundle.resolvePath = function (filename, dirname, ancestor) {
  var possibleFinalPath;

  // Find the root directory
  var moduleRootDir = AppBundle.__findModuleRootDir(dirname);

  // TO-Do check if file is a basename

  var nodeModulePath = path.resolve(moduleRootDir, 'node_modules', filename);

  // If it is a node module resolve
  // which file should be load as
  // is specified in
  // http://nodejs.org/api/modules.html#modules_folders_as_modules
  if (fs.existsSync(nodeModulePath)) {
    var modulePackageJsonPath = path.resolve(nodeModulePath, 'pacakge.json');
    var modulePackageJson;

    // If the module as a package json, open it!
    if (fs.existsSync(modulePackageJsonPath)) {
      try {
        modulePackageJson = JSON.parse(fs.readFileSync(modulePackageJsonPath));
      } catch(e) {
        console.error('Error opening package.json of module', filename);
      }
    }
    var tempPath;

    // Method #1 - Try loading from main key of package.json
    if(modulePackageJson.main) {
      tempPath = path.resolve(nodeModulePath, modulePackageJson.main);

      // If has main key and the file exist, read it
      if (fs.existsSync(tempPath)) {
        return tempPath;
      }
    }

    // Method #2 - Try to load { path }/index.js
    tempPath = path.resolve(nodeModulePath, 'index.js');
    if (fs.existsSync(tempPath)) {
      return tempPath;
    }

    // Method #3 - Try to load { path }/index.node
    tempPath = path.resolve(nodeModulePath, 'index.node');
    if (fs.existsSync(tempPath)) {
      return tempPath;
    }

    throw new Error('Module "'+ filename +'" not found in '+ ancestor.path);
  }

  if (!dirname || !path.isAbsolute(dirname)) {
    throw new Error('something went bad on getting the parentPath');
  }

  var finalPath = path.resolve(dirname, filename);

  possibleFinalPath = path.resolve(finalPath, 'index.js');

  // Check if the final path is a dir
  // if yes return the dir + index.js
  if (fs.existsSync(possibleFinalPath)) {
    return possibleFinalPath;
  }

  return finalPath;
};


// Where it finds the nearast package.josn
// that is the root directory of that module
AppBundle.__findModuleRootDir = function (dirPath) {
  // TO-DO remove dependency of needing a present package.json to identify the root directory
  if (fs.existsSync(dirPath + '/package.json')) {
    return dirPath;
  } else {
    return this.__findModuleRootDir(path.dirname(dirPath));
  }
};


AppBundle.wrap = function (input, required) {
  var wrapper = [
    '(function() {\n',
    '\n})();'
  ];

  var hasModuleExports = input.match(regex.moduleExp);

  if(hasModuleExports) {
    // why +14 ? count how much characters 'module.exports' has
    var moduleExport = input.substring(hasModuleExports.index + 14, input.length);
    moduleExport = AppBundle.__resolveModuleExports(moduleExport);

    // Remove module.exports from the input
    input = input.replaceBetween(hasModuleExports.index, hasModuleExports.index + moduleExport.lengthCount + 14, '');


    // Act as module.export
    input += '\n return '+ moduleExport.variable + ';';
  }

  // wrap the script
  return wrapper[0] + input + wrapper[1];
};


AppBundle.__resolveModuleExports = function (input, count) {
  var equalMatch = input.match(regex.equalExp);

  // just to be sure we
  // dont throw any weird errors
  if(!count) {
    count = 0;
  }

  if(equalMatch) {
    var matchedString = equalMatch.slice(0, 1)[0];
    count += parseInt(matchedString.length, 10);

    // Remove matched regex
    input = input.replaceBetween(equalMatch.index, equalMatch.index + matchedString.length, '');
    var varMatch = input.match(regex.jsVariable);

    if(varMatch) {
      return this.__resolveModuleExports(input, count);
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


AppBundle.prototype.writeToOutput = function () {
  this.output += this.input.substring(0, this.index.end);
  this.input = this.input.substring(this.index.end, this.input.length);
  this.read += this.index.end;
};


var appBundle = new AppBundle({
  path: __dirname + '/test.js'
});

appBundle.on('finished', function(err, data) {
  console.log(data);
});


appBundle.start();
