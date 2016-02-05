var http = require('http');
var url  = require('url');
var util = require('./util');

const PORT = 4003;

// From: http://youmightnotneedjquery.com/
var deepExtend = function(out) {
  out = out || {};

  for (var i = 1; i < arguments.length; i++) {
    var obj = arguments[i];

    if (!obj)
      continue;

    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (typeof obj[key] === 'object')
          out[key] = deepExtend(out[key], obj[key]);
        else
          out[key] = obj[key];
      }
    }
  }

  return out;
};

const _PROXY_IMAGE = 1;
const _PROXY_CHINA = 2;
var cache = {};

//We need a function which handles requests and send response
function handleRequest(request, response){
  console.info('[*] Proxy url %s', request.url);
  switch (cache[request.url]) {
    case _PROXY_IMAGE:
    default:
      handleImageDomain(request, response);
      break;

    case _PROXY_CHINA:
      handleChinaProxy(request, response);
      break;
  }
}

function handleChinaProxy (request, response, count) {
  var url_parts = url.parse(request.url);
  var opts = util.getProxy();
  var headers = deepExtend({}, request.headers);
  
  if (headers.cookie)
    delete headers.cookie;

  deepExtend(opts, {
    method: 'GET',
    path: url_parts.path,
    headers: headers
  });

  console.info('[*] Proxy via %s', opts.hostname);
  var req = http.request(opts, proxyResponse(response));
  req.on('error', () => {
    if (count == undefined) {
      count = 3;
    }

    if (count-- == 0) {
      console.info('[!] Proxy hang up, try another one.');
      response.end();
    } else {
      handleChinaProxy(request, response, count);
    }
  });
  req.end();
}

function handleImageDomain(request, response) {
  var url_parts = url.parse(request.url);
  var host = url_parts.hostname.replace('m', 'p');
  var headers = deepExtend({}, request.headers);
  var opts = {
    hostname: host,
    method: 'GET',
    path: url_parts.path,
    headers: headers
  };

  if (headers.hostname) delete headers.hostname;
  if (headers.host) delete headers.host;

  var req = http.request(opts, (res) => {
    // console.info(res);
    if (~~(res.statusCode / 10) != 20) {
      res.on('data', () => {});
      res.on('end',  () => {});
      handleImageDomainError() ;
      return ;
    }

    console.info('[*] p* domain works, proxy data though.');
    proxyResponse(response, true)(res);
  });
  req.on('error', handleImageDomainError);
  req.end();

  function handleImageDomainError () {
    // We need to proxy this file, and stop poking.
    console.info('[*] p* domain does not work, try proxy..');
    cache[request.url] = _PROXY_CHINA;
    handleChinaProxy (request, response);
  }
}

function proxyResponse(response, bFixHeader) {
  return (res) => {
    // 1 year cache, sounds good?
    res.headers['Cache-Control'] = 'max-age=31556926';

    if (bFixHeader)
      res.headers['Content-Type'] = 'audio/mpeg';

    for (var key in res.headers){
      response.setHeader(key, res.headers[key]);
    }
    response.writeHead(res.statusCode);
    
    res.on('data', (chunk) => {
      response.write(chunk);
      // console.info('[*] Proxied %d bytes.', chunk.length);
    });
    res.on('end', () => {
      response.end();
    });
  };
}

//Create a server
var server = http.createServer(handleRequest);

//Lets start our server
server.listen(PORT, function(){
  //Callback triggered when server is successfully listening. Hurray!
  console.log("[*] Proxy started at port %d", PORT);
});