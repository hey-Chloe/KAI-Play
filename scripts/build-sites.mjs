import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const client = resolve(dist, 'client');
const server = resolve(dist, 'server');

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await cp(resolve(root, 'web'), client, { recursive: true });

const worker = `const securityHeaders = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function showcaseApiResponse() {
  return Response.json({
    ok: false,
    error: {
      code: 'SHOWCASE_MODE',
      message: '当前为在线展示模式；斗地主竞技局、战绩与好友房需要连接 KAI Play 服务端。',
    },
  }, { status: 503, headers: securityHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return showcaseApiResponse();

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return withSecurityHeaders(assetResponse);

    if (request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html')) {
      const fallback = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
      return withSecurityHeaders(fallback);
    }
    return withSecurityHeaders(assetResponse);
  },
};
`;

const wrangler = {
  name: 'kai-play-showcase',
  compatibility_date: '2026-09-03',
  compatibility_flags: ['nodejs_compat'],
  main: 'index.js',
  no_bundle: true,
  assets: { directory: '../client' },
  observability: { enabled: true },
};

await writeFile(resolve(server, 'index.js'), worker);
await writeFile(resolve(server, 'wrangler.json'), `${JSON.stringify(wrangler)}\n`);

const index = await readFile(resolve(client, 'index.html'), 'utf8');
if (!index.includes('KAI Play · 算力局')) throw new Error('Sites build is missing the KAI Play entry page.');

console.log('Sites build ready: dist/client + dist/server/index.js');
