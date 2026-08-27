import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8081/');
const samples = Number.parseInt(process.argv[3] || '20', 10);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 200, 'samples must be an integer from 1 to 200');

function request(path, headers = {}, method = 'GET') {
  const url = new URL(path, base);
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const req = transport.request(url, { method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        bytes: chunks.reduce((total, chunk) => total + chunk.length, 0),
        durationMs: performance.now() - startedAt,
      }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error(`request timed out: ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

function distribution(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const percentile = value => ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * value) - 1)];
  return {
    medianMs: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
  };
}

const definitions = [
  { name: 'css', path: '/styles.css', contentType: /^text\/css/, contentEncoding: 'br' },
  { name: 'javascript', path: '/app.js', contentType: /^text\/javascript/, contentEncoding: 'br' },
  { name: 'jpg', path: '/assets/kai-felt-v5.jpg', contentType: /^image\/jpeg/, contentEncoding: undefined },
];
const results = {};

for (const definition of definitions) {
  const first = await request(definition.path, { 'accept-encoding': 'br, gzip' });
  assert.equal(first.status, 200, `${definition.path} must return 200`);
  assert.match(String(first.headers['content-type']), definition.contentType, `${definition.path} has an unexpected Content-Type`);
  assert.equal(first.headers['content-encoding'], definition.contentEncoding, `${definition.path} has an unexpected Content-Encoding`);
  const durations = [first.durationMs];
  for (let index = 1; index < samples; index += 1) {
    const sample = await request(definition.path, { 'accept-encoding': 'br, gzip' });
    assert.equal(sample.status, 200, `${definition.path} sample ${index + 1} must return 200`);
    assert.equal(sample.headers['content-encoding'], definition.contentEncoding, `${definition.path} sample ${index + 1} changed encoding`);
    durations.push(sample.durationMs);
  }
  const cached = await request(definition.path, { 'if-none-match': String(first.headers.etag) });
  assert.equal(cached.status, 304, `${definition.path} must support ETag revalidation`);
  assert.equal(cached.bytes, 0, `${definition.path} 304 must not include a body`);
  results[definition.name] = {
    path: definition.path,
    status: first.status,
    contentType: first.headers['content-type'],
    contentEncoding: first.headers['content-encoding'] || 'identity',
    transferBytes: first.bytes,
    cacheStatus: cached.status,
    cacheBytes: cached.bytes,
    ...distribution(durations),
  };
}

const document = await request('/');
assert.match(String(document.headers['content-security-policy']), /default-src 'self'/, 'document must include the expected CSP');
assert.equal(document.headers['x-content-type-options'], 'nosniff', 'document must prevent MIME sniffing');

console.log(JSON.stringify({ base: base.href, samples, resources: results }, null, 2));
