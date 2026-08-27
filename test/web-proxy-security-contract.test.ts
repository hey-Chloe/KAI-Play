import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const source = await readFile(resolve(import.meta.dirname, '../web/serve.mjs'), 'utf8');

test('preview proxy overwrites spoofed forwarding identity with the connected client address', () => {
  const proxyStart = source.indexOf('function proxy(');
  const proxyEnd = source.indexOf('createServer(', proxyStart);
  assert.notEqual(proxyStart, -1);
  assert.notEqual(proxyEnd, -1);
  const proxySource = source.slice(proxyStart, proxyEnd);
  const copiedHeaders = proxySource.indexOf('const headers = { ...req.headers');
  const forwardedOverride = proxySource.indexOf("headers['x-forwarded-for'] = clientAddress(req)");

  assert.ok(copiedHeaders >= 0, 'proxy should begin from the incoming header set');
  assert.ok(forwardedOverride > copiedHeaders, 'trusted forwarding identity must overwrite any incoming spoofed value');
  assert.doesNotMatch(proxySource, /headers\[['"]x-forwarded-for['"]\]\s*\|\|=/);
  assert.match(proxySource, /delete headers\[['"]x-doujoy-token['"]\]/, 'the preview-only token header must not reach upstream');
});

test('an upstream forwarding chain is trusted only behind explicit Web proxy configuration', () => {
  assert.match(source, /DOUJOY_WEB_TRUST_PROXY/);
  assert.match(source, /const trustProxy = \['1', 'true'\]\.includes/);
  assert.match(source, /if \(trustProxy && typeof req\.headers\['x-forwarded-for'\] === 'string'\)/);
  assert.match(source, /if \(isIP\(forwarded\)\) return forwarded/);
  assert.match(source, /return req\.socket\.remoteAddress \|\| 'unknown'/);
});
