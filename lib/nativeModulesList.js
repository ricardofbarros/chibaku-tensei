var nativeModulesList = {};


nativeModulesList['0.12'] = [
  '_debugger',
  '_linklist',
  'assert',
  'buffer',
  'child_process',
  'console',
  'constants',
  'crypto',
  'cluster',
  'dgram',
  'dns',
  'domain',
  'events',
  'freelist',
  'fs',
  'http',
  '_http_agent',
  '_http_client',
  '_http_common',
  '_http_incoming',
  '_http_outgoing',
  '_http_server',
  'https',
  'module',
  'net',
  'os',
  'path',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'smalloc',
  'stream',
  '_stream_readable',
  '_stream_writable',
  '_stream_duplex',
  '_stream_transform',
  '_stream_passthrough',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  '_tls_common',
  '_tls_legacy',
  '_tls_wrap',
  'tty',
  'url',
  'util',
  'vm',
  'zlib'
];


module.exports = (function() {
  // TO-DO version check
  return nativeModulesList['0.12'];
})();
