/* */ 
if (System._nodeRequire) {
  module.exports = System._nodeRequire('http');
} else {
  var http = module.exports;
  var EventEmitter = require('events').EventEmitter;
  var Request = require('./lib/request');
  var url = require('url');
  http.request = function(params, cb) {
    if (typeof params === 'string') {
      params = url.parse(params);
    }
    if (!params)
      params = {};
    if (!params.host && !params.port) {
      params.port = parseInt(window.location.port, 10);
    }
    if (!params.host && params.hostname) {
      params.host = params.hostname;
    }
    if (!params.protocol) {
      if (params.scheme) {
        params.protocol = params.scheme + ':';
      } else {
        params.protocol = window.location.protocol;
      }
    }
    if (!params.host) {
      params.host = window.location.hostname || window.location.host;
    }
    if (/:/.test(params.host)) {
      if (!params.port) {
        params.port = params.host.split(':')[1];
      }
      params.host = params.host.split(':')[0];
    }
    if (!params.port)
      params.port = params.protocol == 'https:' ? 443 : 80;
    var req = new Request(new xhrHttp, params);
    if (cb)
      req.on('response', cb);
    return req;
  };
  http.get = function(params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
  };
  http.Agent = function() {};
  http.Agent.defaultMaxSockets = 4;
  var xhrHttp = (function() {
    if (typeof window === 'undefined') {
      throw new Error('no window object present');
    } else if (window.XMLHttpRequest) {
      return window.XMLHttpRequest;
    } else if (window.ActiveXObject) {
      var axs = ['Msxml2.XMLHTTP.6.0', 'Msxml2.XMLHTTP.3.0', 'Microsoft.XMLHTTP'];
      for (var i = 0; i < axs.length; i++) {
        try {
          var ax = new (window.ActiveXObject)(axs[i]);
          return function() {
            if (ax) {
              var ax_ = ax;
              ax = null;
              return ax_;
            } else {
              return new (window.ActiveXObject)(axs[i]);
            }
          };
        } catch (e) {}
      }
      throw new Error('ajax not supported in this browser');
    } else {
      throw new Error('ajax not supported in this browser');
    }
  })();
  http.STATUS_CODES = {
    100: 'Continue',
    101: 'Switching Protocols',
    102: 'Processing',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    203: 'Non-Authoritative Information',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    207: 'Multi-Status',
    300: 'Multiple Choices',
    301: 'Moved Permanently',
    302: 'Moved Temporarily',
    303: 'See Other',
    304: 'Not Modified',
    305: 'Use Proxy',
    307: 'Temporary Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Time-out',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Request Entity Too Large',
    414: 'Request-URI Too Large',
    415: 'Unsupported Media Type',
    416: 'Requested Range Not Satisfiable',
    417: 'Expectation Failed',
    418: 'I\'m a teapot',
    422: 'Unprocessable Entity',
    423: 'Locked',
    424: 'Failed Dependency',
    425: 'Unordered Collection',
    426: 'Upgrade Required',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    431: 'Request Header Fields Too Large',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Time-out',
    505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates',
    507: 'Insufficient Storage',
    509: 'Bandwidth Limit Exceeded',
    510: 'Not Extended',
    511: 'Network Authentication Required'
  };
}
