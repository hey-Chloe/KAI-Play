import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFile(resolve(root, path), 'utf8');
const mobilePackage = JSON.parse(await read('mobile/package.json')) as { dependencies: Record<string, string> };
const appConfig = JSON.parse(await read('mobile/app.json')) as { expo: { android: { package: string }; ios: { bundleIdentifier: string } } };

assert.match(mobilePackage.dependencies.expo ?? '', /^~57\./, 'Expo must remain pinned to SDK 57');
assert.match(mobilePackage.dependencies['react-native'] ?? '', /^0\.86\./, 'SDK 57 React Native line is required');
assert.equal(appConfig.expo.android.package, 'com.kaicloud.doujoy');
assert.equal(appConfig.expo.ios.bundleIdentifier, 'com.kaicloud.doujoy');

const sourcePaths = [
  'server/src/server.ts', 'server/src/platform.ts', 'server/src/store.ts',
  'mobile/src/api.ts', 'core/engine.ts',
];
const source = (await Promise.all(sourcePaths.map(read))).join('\n').toLowerCase();
for (const forbidden of [
  'alipay-sdk', 'wechatpay', 'stripe', 'ethers.', 'walletconnect',
]) assert.equal(source.includes(forbidden), false, `Forbidden real-value capability found: ${forbidden}`);
assert.doesNotMatch(
  source,
  /['"`]\/(?:v\d+\/)?(?:topups?|withdrawals?|withdraw|redeem|transfer-token)(?:\/|['"`])/,
  'Forbidden real-value API route found',
);

for (const required of [
  'README.md', 'docs/PRODUCT.md', 'docs/SECURITY.md', 'docs/PRIVACY.md', 'docs/TERMS.md',
  'docs/DEPLOYMENT.md', 'docs/ENGINEERING_QUALITY.md', '.github/workflows/ci.yml',
  'mobile/package-lock.json', 'server/data/.gitignore', 'Dockerfile', 'docker-compose.yml', '.env.example',
  'scripts/benchmark-web.mjs',
  'web/index.html', 'web/app.js', 'web/sudoku6.js', 'web/styles.css', 'web/serve.mjs', 'web/Dockerfile',
]) assert.equal((await stat(resolve(root, required))).isFile(), true, `Required artifact missing: ${required}`);

const engine = await read('core/engine.ts');
assert.match(engine, /randomBytes\(16\)/, '128-bit fairness nonce is required');
assert.match(engine, /deckCommitment\(/, 'Deck commitment must be recorded at game creation');
const fairness = await read('core/fairness.ts');
assert.match(fairness, /createHash\('sha256'\)/, 'SHA-256 deck commitment is required');
assert.match(fairness, /timingSafeEqual/, 'Fairness verification must compare digests safely');
const platform = await read('server/src/platform.ts');
assert.match(platform, /expectedSequence !== game\.sequence/, 'Stale game protection is required');
assert.match(platform, /settlement:\$\{game\.id\}/, 'Idempotent settlement key is required');
const server = await read('server/src/server.ts');
assert.match(server, /DOUJOY_CORS_ORIGIN_REQUIRED_IN_PRODUCTION/, 'Production CORS must fail closed');
assert.match(server, /DOUJOY_TURN_TIMEOUT_MS_INVALID/, 'Turn timeout bounds are required');
assert.match(server, /DOUJOY_BACKUP_COUNT_INVALID/, 'Snapshot backup count bounds are required');
assert.match(server, /DOUJOY_WAIT_TIMEOUT_MAX_MS_INVALID/, 'Long-poll timeout bounds are required');
const compose = await read('docker-compose.yml');
assert.match(compose, /DOUJOY_BIND_IP:-127\.0\.0\.1/, 'Server must bind to loopback by default');
assert.match(compose, /DOUJOY_WEB_BIND_IP:-127\.0\.0\.1/, 'Web preview must bind to loopback by default');
assert.match(compose, /DOUJOY_TRUST_PROXY:\s*"true"/, 'The controlled Web proxy must preserve independent client limits');
assert.match(compose, /DOUJOY_WEB_UPSTREAM_TIMEOUT_MS:\s*"\$\{DOUJOY_WEB_UPSTREAM_TIMEOUT_MS:-35000\}"/, 'Compose must pass the documented Web upstream timeout');
assert.match(compose, /DOUJOY_WEB_TRUST_PROXY:\s*"\$\{DOUJOY_WEB_TRUST_PROXY:-false\}"/, 'Web upstream trust must remain explicit and fail closed');
const webDocker = await read('web/Dockerfile');
assert.match(webDocker, /COPY web\/assets \.\/assets/, 'The Web production image must include all local visual assets');
assert.match(webDocker, /web\/sudoku6\.js/, 'The Web production image must include the standalone Sudoku engine');
const webServer = await read('web/serve.mjs');
assert.match(webServer, /\.jpg':'image\/jpeg'/, 'JPEG table materials need the correct MIME type');
assert.match(webServer, /createBrotliCompress/, 'Text assets must support Brotli transfer compression');
assert.match(webServer, /if-none-match/, 'Static assets must support conditional requests');
assert.match(webServer, /content-security-policy/, 'The Web surface must send a Content Security Policy');
assert.match(webServer, /DOUJOY_WEB_TRUST_PROXY_INVALID/, 'Web proxy trust configuration must be validated');
assert.match(webServer, /process\.once\('SIGTERM'/, 'The Web proxy must drain on container shutdown');
assert.match(webServer, /server\.closeAllConnections/, 'The Web proxy must have a bounded shutdown fallback');
const benchmark = await read('scripts/benchmark-web.mjs');
assert.match(benchmark, /contentEncoding: 'br'/, 'The Web benchmark must require Brotli for text assets');
assert.match(benchmark, /unexpected Content-Encoding/, 'The Web benchmark must fail on compression regressions');
const ci = await read('.github/workflows/ci.yml');
assert.match(ci, /npm run verify/, 'CI must run the complete quality gate');
assert.match(ci, /docker compose config --quiet/, 'CI must validate the deployment graph');
assert.match(ci, /docker compose build/, 'CI must build both configured containers');
assert.match(ci, /docker compose up --detach --no-build --wait/, 'CI must start and health-check the built stack');
assert.match(ci, /127\.0\.0\.1:8081\/api\/health/, 'CI must smoke the complete Web-to-server proxy path');
const rootPackage = JSON.parse(await read('package.json')) as { scripts: Record<string, string> };
assert.match(rootPackage.scripts['test:coverage'] ?? '', /--test-coverage-lines=90/, 'Line coverage must have a release threshold');
assert.match(rootPackage.scripts['test:coverage'] ?? '', /--test-coverage-branches=80/, 'Branch coverage must have a release threshold');
assert.match(rootPackage.scripts.verify ?? '', /test:coverage/, 'The complete quality gate must enforce coverage thresholds');

for (const asset of [
  'web/assets/kai-card-back.svg', 'web/assets/kai-court-j.svg', 'web/assets/kai-court-q.svg',
  'web/assets/kai-court-k.svg', 'web/assets/kai-joker-court.svg', 'web/assets/kai-bamboo-bird.svg',
  'web/assets/kai-felt-v5.jpg', 'web/assets/kai-leather-v5.jpg',
]) assert.equal((await stat(resolve(root, asset))).isFile(), true, `Production Web asset missing: ${asset}`);

console.log('KAI Play release preflight passed: SDK 57, package identity, play-only boundary, fairness, assets, proxy, and required docs.');
