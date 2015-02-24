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

  // If filename is a relative path
  // or just a name of the module
  // we need to resolve it to the actual path
  if (!path.isAbsolute(self.path)) {
    if (!dirname) {
      var err = new Error('If the first argument isn\'t an absolute path then the second argument must be defined');
      return self.emit('finished', err);
    }

    filename = AppBundle.resolvePath(self.path, dirname);
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
        path: AppBundle.resolvePath(requiredArg, self.dirname),
        ancestor: self
      });

      appBundleChild.on('finished', function(err, data) {
        if (data) {
          self.input = self.input.replaceBetween(self.index.start, self.index.end, AppBundle.wrap(data));
          self.writeToOutput();
        }
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


AppBundle.resolvePath = function (filename, dirname) {
  var moduleRootDir = AppBundle.__findModuleRootDir(dirname);

  var nodeModulePath = path.resolve(moduleRootDir, 'node_modules', path.basename(filename));

  // If it is a node module
  if (fs.existsSync(nodeModulePath)) {
    return nodeModulePath;
  }

  if(!dirname || !path.isAbsolute(dirname)) {
    throw new Error('something went bad on getting the parentPath');
  }

  return path.resolve(dirname, filename);
};


// Where it finds the nearast package.josn
// that is the root directory of that module
AppBundle.__findModuleRootDir = function (dirPath) {
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
    input = input.replaceBetween(hasModuleExports.index, moduleExport.lengthCount + 14, '');


    // Act as module.export
    input += '\n return '+ moduleExport.variable + ';';
  }

  // wrap the script
  return wrapper[0] + input + wrapper[1];
};


AppBundle.__resolveModuleExports = function (input, count) {
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
  this.input = this.input.substring(this.index.end + 1, this.input.length);
  this.read += this.index.end;
};




var appBundle = new AppBundle({
  path: __dirname + '/test.js'
});

appBundle.on('finished', function(err, data) {
  console.log(data);
});


appBundle.start();
