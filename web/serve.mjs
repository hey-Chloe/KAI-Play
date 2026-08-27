import { createReadStream, statSync } from 'node:fs';
import { createServer, request as upstreamRequest } from 'node:http';
import { isIP } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zlibConstants, createBrotliCompress, createGzip } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const host = process.env.DOUJOY_WEB_HOST || '127.0.0.1';
const port = Number(process.env.DOUJOY_WEB_PORT || 8081);
const upstream = new URL(process.env.DOUJOY_WEB_UPSTREAM || 'http://127.0.0.1:4310');
const upstreamTimeoutMs = Number(process.env.DOUJOY_WEB_UPSTREAM_TIMEOUT_MS || 35_000);
const trustProxyValue = process.env.DOUJOY_WEB_TRUST_PROXY || 'false';
const trustProxy = ['1', 'true'].includes(trustProxyValue.toLowerCase());
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.avif':'image/avif', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2',
};
const compressible = new Set(['.html', '.js', '.css', '.json', '.svg']);
const securityHeaders = {
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'cross-origin-resource-policy':'same-origin',
  'content-security-policy':"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
};
const activeProxyRequests = new Set();
let shuttingDown = false;

if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('DOUJOY_WEB_PORT_INVALID');
if (upstream.protocol !== 'http:') throw new Error('DOUJOY_WEB_UPSTREAM_PROTOCOL_INVALID');
if (!Number.isInteger(upstreamTimeoutMs) || upstreamTimeoutMs < 1_000 || upstreamTimeoutMs > 120_000) {
  throw new Error('DOUJOY_WEB_UPSTREAM_TIMEOUT_MS_INVALID');
}
if (!['0', '1', 'false', 'true'].includes(trustProxyValue.toLowerCase())) throw new Error('DOUJOY_WEB_TRUST_PROXY_INVALID');

function clientAddress(req) {
  if (trustProxy && typeof req.headers['x-forwarded-for'] === 'string') {
    const forwarded = req.headers['x-forwarded-for'].split(',')[0].trim();
    if (isIP(forwarded)) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function proxy(req, res, pathname, search) {
  const headers = { ...req.headers, host: upstream.host };
  delete headers.origin;
  // Never forward a caller-supplied chain: this preview is the trust boundary.
  headers['x-forwarded-for'] = clientAddress(req);
  const sessionToken = headers['x-doujoy-token'];
  if (!headers.authorization && typeof sessionToken === 'string' && sessionToken) {
    headers.authorization = `Bearer ${sessionToken}`;
  }
  delete headers['x-doujoy-token'];

  const proxied = upstreamRequest({
    protocol:upstream.protocol,
    hostname:upstream.hostname,
    port:upstream.port,
    method:req.method,
    path:`${pathname.slice(4) || '/'}${search}`,
    headers,
  }, (response) => {
    res.writeHead(response.statusCode || 502, { ...response.headers, 'cache-control':'no-store' });
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  activeProxyRequests.add(proxied);

  const abortUpstream = () => proxied.destroy();
  const closeUpstream = () => { if (!res.writableEnded) proxied.destroy(); };
  const cleanup = () => {
    req.off('aborted', abortUpstream);
    res.off('close', closeUpstream);
    activeProxyRequests.delete(proxied);
  };
  req.once('aborted', abortUpstream);
  res.once('close', closeUpstream);
  proxied.setTimeout(upstreamTimeoutMs, () => proxied.destroy(new Error('UPSTREAM_TIMEOUT')));
  proxied.once('close', cleanup);
  proxied.on('error', () => {
    cleanup();
    if (shuttingDown) {
      if (!res.destroyed) res.destroy();
      return;
    }
    if (res.destroyed) return;
    if (res.headersSent) return res.destroy();
    res.writeHead(502, {
      ...securityHeaders,
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
    });
    res.end(JSON.stringify({ok:false,error:{code:'PREVIEW_UPSTREAM_UNAVAILABLE',message:'牌局服务连接暂不可用，请稍后重试。'}}));
  });
  req.pipe(proxied);
}

function reject(res, status, message, extraHeaders = {}) {
  res.writeHead(status, { ...securityHeaders, 'content-type':'text/plain; charset=utf-8', 'cache-control':'no-store', ...extraHeaders });
  res.end(message);
}

const server = createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
  } catch {
    return reject(res, 400, 'Bad request');
  }
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxy(req, res, url.pathname, url.search);
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) return reject(res, 405, 'Method not allowed', { allow:'GET, HEAD' });

  let requested;
  try {
    requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  } catch {
    return reject(res, 400, 'Malformed URL');
  }
  const file = resolve(root, requested);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return reject(res, 404, 'Not found');

  try {
    const metadata = statSync(file);
    if (!metadata.isFile()) throw new Error('not file');
    const extension = extname(file).toLowerCase();
    const etag = `W/"${metadata.size.toString(16)}-${Math.trunc(metadata.mtimeMs).toString(16)}"`;
    const cacheControl = url.pathname.startsWith('/assets/')
      ? 'public, max-age=3600, must-revalidate'
      : 'no-cache';
    const commonHeaders = {
      ...securityHeaders,
      'content-type':types[extension] || 'application/octet-stream',
      'cache-control':cacheControl,
      etag,
      'last-modified':metadata.mtime.toUTCString(),
      ...(compressible.has(extension) ? { vary:'accept-encoding' } : {}),
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, commonHeaders);
      return res.end();
    }

    const acceptedEncoding = req.headers['accept-encoding'] || '';
    const encoding = compressible.has(extension) && metadata.size >= 1_024
      ? acceptedEncoding.includes('br') ? 'br' : acceptedEncoding.includes('gzip') ? 'gzip' : null
      : null;
    res.writeHead(200, {
      ...commonHeaders,
      ...(encoding ? { 'content-encoding':encoding } : { 'content-length':String(metadata.size) }),
    });
    if (req.method === 'HEAD') return res.end();
    const source = createReadStream(file);
    source.on('error', () => res.destroy());
    if (encoding === 'br') {
      const compressor = createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } });
      compressor.on('error', () => res.destroy());
      source.pipe(compressor).pipe(res);
    } else if (encoding === 'gzip') {
      const compressor = createGzip({ level: 6 });
      compressor.on('error', () => res.destroy());
      source.pipe(compressor).pipe(res);
    }
    else source.pipe(res);
  } catch {
    reject(res, 404, 'Not found');
  }
});

server.listen(port, host, () => console.log(`DouJoy web preview listening on http://${host}:${port}; upstream ${upstream}`));

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`DouJoy web preview received ${signal}; draining requests`);
  for (const request of activeProxyRequests) request.destroy(new Error('PREVIEW_SHUTDOWN'));
  server.closeIdleConnections();
  const forceTimer = setTimeout(() => {
    console.error('DouJoy web preview graceful shutdown timed out');
    server.closeAllConnections();
    process.exitCode = 1;
  }, 10_000);
  forceTimer.unref();
  server.close((error) => {
    clearTimeout(forceTimer);
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
