




















var net = require('net');
var util = require('util');

var cares = process.binding('cares_wrap');
var uv = process.binding('uv');

var isIp = net.isIP;


function errnoException(err, syscall, hostname) {
  
  
  if (err === uv.UV_EAI_MEMORY ||
      err === uv.UV_EAI_NODATA ||
      err === uv.UV_EAI_NONAME) {
    err = 'ENOTFOUND';
  }
  var ex = null;
  if (typeof err === 'string') {  
    ex = new Error(syscall + ' ' + err + (hostname ? ' ' + hostname : ''));
    ex.code = err;
    ex.errno = err;
    ex.syscall = syscall;
  } else {
    ex = util._errnoException(err, syscall);
  }
  if (hostname) {
    ex.hostname = hostname;
  }
  return ex;
}


















function makeAsync(callback) {
  if (!util.isFunction(callback)) {
    return callback;
  }
  return function asyncCallback() {
    if (asyncCallback.immediately) {
      
      callback.apply(null, arguments);
    } else {
      var args = arguments;
      process.nextTick(function() {
        callback.apply(null, args);
      });
    }
  };
}


function onlookup(err, addresses) {
  if (err) {
    return this.callback(errnoException(err, 'getaddrinfo', this.hostname));
  }
  if (this.family) {
    this.callback(null, addresses[0], this.family);
  } else {
    this.callback(null, addresses[0], addresses[0].indexOf(':') >= 0 ? 6 : 4);
  }
}




exports.lookup = function lookup(hostname, options, callback) {
  var hints = 0;
  var family = -1;

  
  if (hostname && typeof hostname !== 'string') {
    throw TypeError('invalid arguments: hostname must be a string or falsey');
  } else if (typeof options === 'function') {
    callback = options;
    family = 0;
  } else if (typeof callback !== 'function') {
    throw TypeError('invalid arguments: callback must be passed');
  } else if (util.isObject(options)) {
    hints = options.hints >>> 0;
    family = options.family >>> 0;

    if (hints !== 0 &&
        hints !== exports.ADDRCONFIG &&
        hints !== exports.V4MAPPED &&
        hints !== (exports.ADDRCONFIG | exports.V4MAPPED)) {
      throw new TypeError('invalid argument: hints must use valid flags');
    }
  } else {
    family = options >>> 0;
  }

  if (family !== 0 && family !== 4 && family !== 6)
    throw new TypeError('invalid argument: family must be 4 or 6');

  callback = makeAsync(callback);

  if (!hostname) {
    callback(null, null, family === 6 ? 6 : 4);
    return {};
  }

  var matchedFamily = net.isIP(hostname);
  if (matchedFamily) {
    callback(null, hostname, matchedFamily);
    return {};
  }

  var req = {
    callback: callback,
    family: family,
    hostname: hostname,
    oncomplete: onlookup
  };

  var err = cares.getaddrinfo(req, hostname, family, hints);
  if (err) {
    callback(errnoException(err, 'getaddrinfo', hostname));
    return {};
  }

  callback.immediately = true;
  return req;
};


function onlookupservice(err, host, service) {
  if (err)
    return this.callback(errnoException(err, 'getnameinfo', this.host));

  this.callback(null, host, service);
}



exports.lookupService = function(host, port, callback) {
  if (arguments.length !== 3)
    throw new Error('invalid arguments');

  if (cares.isIP(host) === 0)
    throw new TypeError('host needs to be a valid IP address');

  callback = makeAsync(callback);

  var req = {
    callback: callback,
    host: host,
    port: port,
    oncomplete: onlookupservice
  };
  var err = cares.getnameinfo(req, host, port);
  if (err) throw errnoException(err, 'getnameinfo', host);

  callback.immediately = true;
  return req;
};


function onresolve(err, result) {
  if (err)
    this.callback(errnoException(err, this.bindingName, this.hostname));
  else
    this.callback(null, result);
}


function resolver(bindingName) {
  var binding = cares[bindingName];

  return function query(name, callback) {
    if (!util.isString(name)) {
      throw new Error('Name must be a string');
    } else if (!util.isFunction(callback)) {
      throw new Error('Callback must be a function');
    }

    callback = makeAsync(callback);
    var req = {
      bindingName: bindingName,
      callback: callback,
      hostname: name,
      oncomplete: onresolve
    };
    var err = binding(req, name);
    if (err) throw errnoException(err, bindingName);
    callback.immediately = true;
    return req;
  }
}


var resolveMap = {};
exports.resolve4 = resolveMap.A = resolver('queryA');
exports.resolve6 = resolveMap.AAAA = resolver('queryAaaa');
exports.resolveCname = resolveMap.CNAME = resolver('queryCname');
exports.resolveMx = resolveMap.MX = resolver('queryMx');
exports.resolveNs = resolveMap.NS = resolver('queryNs');
exports.resolveTxt = resolveMap.TXT = resolver('queryTxt');
exports.resolveSrv = resolveMap.SRV = resolver('querySrv');
exports.resolveNaptr = resolveMap.NAPTR = resolver('queryNaptr');
exports.resolveSoa = resolveMap.SOA = resolver('querySoa');
exports.reverse = resolveMap.PTR = resolver('getHostByAddr');


exports.resolve = function(hostname, type_, callback_) {
  var resolver, callback;
  if (util.isString(type_)) {
    resolver = resolveMap[type_];
    callback = callback_;
  } else if (util.isFunction(type_)) {
    resolver = exports.resolve4;
    callback = type_;
  } else {
    throw new Error('Type must be a string');
  }

  if (util.isFunction(resolver)) {
    return resolver(hostname, callback);
  } else {
    throw new Error('Unknown type "' + type_ + '"');
  }
};


exports.getServers = function() {
  return cares.getServers();
};


exports.setServers = function(servers) {
  
  
  var orig = cares.getServers();

  var newSet = [];

  servers.forEach(function(serv) {
    var ver = isIp(serv);

    if (ver)
      return newSet.push([ver, serv]);

    var match = serv.match(/\[(.*)\](:\d+)?/);

    
    if (match) {
      ver = isIp(match[1]);
      if (ver)
        return newSet.push([ver, match[1]]);
    }

    var s = serv.split(/:\d+$/)[0];
    ver = isIp(s);

    if (ver)
      return newSet.push([ver, s]);

    throw new Error('IP address is not properly formatted: ' + serv);
  });

  var r = cares.setServers(newSet);

  if (r) {
    
    cares.setServers(orig.join(','));

    var err = cares.strerror(r);
    throw new Error('c-ares failed to set servers: "' + err +
                    '" [' + servers + ']');
  }
};


exports.ADDRCONFIG = cares.AI_ADDRCONFIG;
exports.V4MAPPED = cares.AI_V4MAPPED;


exports.NODATA = 'ENODATA';
exports.FORMERR = 'EFORMERR';
exports.SERVFAIL = 'ESERVFAIL';
exports.NOTFOUND = 'ENOTFOUND';
exports.NOTIMP = 'ENOTIMP';
exports.REFUSED = 'EREFUSED';
exports.BADQUERY = 'EBADQUERY';
exports.ADNAME = 'EADNAME';
exports.BADFAMILY = 'EBADFAMILY';
exports.BADRESP = 'EBADRESP';
exports.CONNREFUSED = 'ECONNREFUSED';
exports.TIMEOUT = 'ETIMEOUT';
exports.EOF = 'EOF';
exports.FILE = 'EFILE';
exports.NOMEM = 'ENOMEM';
exports.DESTRUCTION = 'EDESTRUCTION';
exports.BADSTR = 'EBADSTR';
exports.BADFLAGS = 'EBADFLAGS';
exports.NONAME = 'ENONAME';
exports.BADHINTS = 'EBADHINTS';
exports.NOTINITIALIZED = 'ENOTINITIALIZED';
exports.LOADIPHLPAPI = 'ELOADIPHLPAPI';
exports.ADDRGETNETWORKPARAMS = 'EADDRGETNETWORKPARAMS';
exports.CANCELLED = 'ECANCELLED';
