// this was taken from node.js native lib path 0.12
var posix = {};
var win32 = {};

var splitDeviceRe = /^([a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/;

posix.isAbsolute = function (path) {
  return path.charAt(0) === '/';
};


win32.isAbsolute = function (path) {
  var result = splitDeviceRe.exec(path);
  var device = result[1] || '';
  var isUnc = !!device && device.charAt(1) !== ':';

  return !!result[2] || isUnc;
};


if (process.platform === 'win32') {
  module.exports = win32;
} else {
  module.exports = posix;
}
