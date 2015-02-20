// Dependencies
var fs = require('fs');
var path = require('path');
var nativeModulesList = require('./lib/nativeModulesList');
var regex = require('./lib/regex');

// extend string proto object
// very useful method
String.prototype.replaceBetween = function(start, end, what) {
  return this.substring(0, start) + what + this.substring(start + end);
};

var readInput = function (filename, parentPath, cb) {
  if(typeof parentPath === 'function') {
    cb = parentPath;
    parentPath = '';
  }

  // nasty
  if(path.isAbsolute(filename)) {
    parentPath = filename;
  }

  filename = resolvePath(filename, parentPath);


  fs.readFile(filename, 'utf8', function (err, data) {
    if (err) {
      return cb(err);
    }



    return scanRequire(data, parentPath, function(err, bundle) {
      return cb(err, bundle, filename);
    });
  });
};


var resolvePath = function (originalPath, parentPath) {
  if(path.isAbsolute(originalPath)) {
    return originalPath;
  }

  if(!parentPath || !path.isAbsolute(parentPath)) {
    throw new Error('something went bad on getting the parentPath');
  }

  // Get directory
  parentPath = path.dirname(parentPath);

  return path.resolve(parentPath, originalPath);
};



var scanRequire = function (input, parentPath, cb) {
  var match = input.match(regex.require);

  if (match) {
    var matchedString = match.slice(0, 1)[0];

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

          return scanRequire(newInput, newParentPath, cb);
        }
      );
    }
  } else {
    return cb(null, input);
  }
};


var replaceRequire = function (input, required, cb) {
  var wrapper = [
    '(function() {\n',
    '\n})();'
  ];

  return readInput(required.arg, required.parentPath, function(err, bundle, newParentPath) {
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
