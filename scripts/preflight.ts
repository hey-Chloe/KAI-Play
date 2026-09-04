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
  'web/index.html', 'web/app.js', 'web/catalog-carousel.js', 'web/sudoku6.js', 'web/xiangqi.js', 'web/minesweeper.js', 'web/gomoku.js', 'web/reversi.js', 'web/sokoban.js', 'web/sliding-puzzle.js', 'web/memory-match.js', 'web/snake.js', 'web/farm.js', 'web/game-agent.js', 'web/falling-blocks.js', 'web/match-three.js', 'web/maze.js', 'web/quick-games.js', 'web/styles.css', 'web/serve.mjs', 'web/Dockerfile',
  'scripts/evaluate-game-agent.mjs', 'scripts/generate-vlm-eval-fixtures.mjs', 'scripts/vlm-eval-lib.mjs', 'scripts/evaluate-vlm.mjs',
  'evals/kai-farm-vlm-v1/manifest.json', 'docs/GAME_AGENT_P0.md', 'docs/VLM_INTEGRATION.md',
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
assert.match(webDocker, /web\/catalog-carousel\.js/, 'The Web production image must include the catalog carousel engine');
assert.match(webDocker, /web\/sudoku6\.js/, 'The Web production image must include the standalone Sudoku engine');
assert.match(webDocker, /web\/xiangqi\.js/, 'The Web production image must include the standalone Xiangqi engine');
assert.match(webDocker, /web\/minesweeper\.js/, 'The Web production image must include the standalone Minesweeper engine');
assert.match(webDocker, /web\/gomoku\.js/, 'The Web production image must include the standalone Gomoku engine');
assert.match(webDocker, /web\/reversi\.js/, 'The Web production image must include the standalone Reversi engine');
assert.match(webDocker, /web\/sokoban\.js/, 'The Web production image must include the standalone Sokoban engine');
assert.match(webDocker, /web\/sliding-puzzle\.js/, 'The Web production image must include the standalone Sliding Puzzle engine');
assert.match(webDocker, /web\/memory-match\.js/, 'The Web production image must include the standalone Memory Match engine');
assert.match(webDocker, /web\/snake\.js/, 'The Web production image must include the standalone Snake engine');
assert.match(webDocker, /web\/farm\.js/, 'The Web production image must include the standalone Farm engine');
assert.match(webDocker, /web\/game-agent\.js/, 'The Web production image must include the Game Agent lab');
assert.match(webDocker, /web\/falling-blocks\.js/, 'The Web production image must include the standalone Falling Blocks engine');
assert.match(webDocker, /web\/match-three\.js/, 'The Web production image must include the standalone Match Three engine');
assert.match(webDocker, /web\/maze\.js/, 'The Web production image must include the standalone Maze engine');
assert.match(webDocker, /web\/quick-games\.js/, 'The Web production image must include the quick games engine');
const webApp = await read('web/app.js');
assert.match(webApp, /from ['"]\.\/catalog-carousel\.js['"]/, 'The Web application must load the catalog carousel engine');
assert.match(webApp, /from ['"]\.\/xiangqi\.js['"]/, 'The Web application must load the standalone Xiangqi engine');
assert.match(webApp, /from ['"]\.\/minesweeper\.js['"]/, 'The Web application must load the standalone Minesweeper engine');
assert.match(webApp, /from ['"]\.\/gomoku\.js['"]/, 'The Web application must load the standalone Gomoku engine');
assert.match(webApp, /from ['"]\.\/reversi\.js['"]/, 'The Web application must load the standalone Reversi engine');
assert.match(webApp, /from ['"]\.\/sokoban\.js['"]/, 'The Web application must load the standalone Sokoban engine');
assert.match(webApp, /from ['"]\.\/sliding-puzzle\.js['"]/, 'The Web application must load the standalone Sliding Puzzle engine');
assert.match(webApp, /from ['"]\.\/memory-match\.js['"]/, 'The Web application must load the standalone Memory Match engine');
assert.match(webApp, /from ['"]\.\/snake\.js['"]/, 'The Web application must load the standalone Snake engine');
assert.match(webApp, /from ['"]\.\/farm\.js['"]/, 'The Web application must load the standalone Farm engine');
assert.match(webApp, /from ['"]\.\/game-agent\.js['"]/, 'The Web application must load the Game Agent lab');
assert.match(webApp, /from ['"]\.\/falling-blocks\.js['"]/, 'The Web application must load the standalone Falling Blocks engine');
assert.match(webApp, /from ['"]\.\/match-three\.js['"]/, 'The Web application must load the standalone Match Three engine');
assert.match(webApp, /from ['"]\.\/maze\.js['"]/, 'The Web application must load the standalone Maze engine');
assert.match(webApp, /from ['"]\.\/quick-games\.js['"]/, 'The Web application must load the quick games engine');
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
assert.match(rootPackage.scripts.build ?? '', /node --check web\/catalog-carousel\.js/, 'The build must syntax-check the catalog carousel engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/xiangqi\.js/, 'The build must syntax-check the Xiangqi engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/minesweeper\.js/, 'The build must syntax-check the Minesweeper engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/gomoku\.js/, 'The build must syntax-check the Gomoku engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/reversi\.js/, 'The build must syntax-check the Reversi engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/sokoban\.js/, 'The build must syntax-check the Sokoban engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/sliding-puzzle\.js/, 'The build must syntax-check the Sliding Puzzle engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/memory-match\.js/, 'The build must syntax-check the Memory Match engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/snake\.js/, 'The build must syntax-check the Snake engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/farm\.js/, 'The build must syntax-check the Farm engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/game-agent\.js/, 'The build must syntax-check the Game Agent lab');
assert.match(rootPackage.scripts['agent:eval'] ?? '', /evaluate-game-agent\.mjs/, 'The project must expose a reproducible Game Agent evaluation command');
assert.match(rootPackage.scripts['agent:vlm-fixtures'] ?? '', /generate-vlm-eval-fixtures\.mjs/, 'The project must expose deterministic VLM fixture generation');
assert.match(rootPackage.scripts['agent:vlm-eval'] ?? '', /evaluate-vlm\.mjs/, 'The project must expose an authenticated VLM evaluation command');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/falling-blocks\.js/, 'The build must syntax-check the Falling Blocks engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/match-three\.js/, 'The build must syntax-check the Match Three engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/maze\.js/, 'The build must syntax-check the Maze engine');
assert.match(rootPackage.scripts.build ?? '', /node --check web\/quick-games\.js/, 'The build must syntax-check the quick games engine');
assert.match(rootPackage.scripts['test:coverage'] ?? '', /--test-coverage-lines=90/, 'Line coverage must have a release threshold');
assert.match(rootPackage.scripts['test:coverage'] ?? '', /--test-coverage-branches=80/, 'Branch coverage must have a release threshold');
assert.match(rootPackage.scripts.verify ?? '', /test:coverage/, 'The complete quality gate must enforce coverage thresholds');

for (const asset of [
  'web/assets/kai-card-back.svg', 'web/assets/kai-court-j.svg', 'web/assets/kai-court-q.svg',
  'web/assets/kai-court-k.svg', 'web/assets/kai-joker-court.svg', 'web/assets/kai-bamboo-bird.svg',
  'web/assets/kai-card-stock-6912c163.jpg',
  'web/assets/kai-felt-v5.jpg', 'web/assets/kai-leather-v5.jpg',
  'web/assets/cards/kai-court-j-club-3152a7a5.svg',
  'web/assets/cards/kai-court-j-diamond-1227624f.svg',
  'web/assets/cards/kai-court-j-heart-59743a5f.svg',
  'web/assets/cards/kai-court-j-spade-ef29a894.svg',
  'web/assets/cards/kai-court-q-club-023d6c89.svg',
  'web/assets/cards/kai-court-q-diamond-ff4c35ab.svg',
  'web/assets/cards/kai-court-q-heart-b9086e1d.svg',
  'web/assets/cards/kai-court-q-spade-6b8434bc.svg',
  'web/assets/cards/kai-court-k-club-d3bbb664.svg',
  'web/assets/cards/kai-court-k-diamond-d17bb7e9.svg',
  'web/assets/cards/kai-court-k-heart-5cece963.svg',
  'web/assets/cards/kai-court-k-spade-18b4c6ab.svg',
  'web/assets/cards/kai-joker-big-65f2baa2.svg',
  'web/assets/cards/kai-joker-small-3761b22b.svg',
  'web/assets/covers/kai-cover-1048-v1-2e7f659a.jpg',
  'web/assets/covers/kai-cover-ddz-v1-75734997.jpg',
  'web/assets/covers/kai-cover-falling-v1-15909f41.jpg',
  'web/assets/covers/kai-cover-farm-v1-fe9f4af5.jpg',
  'web/assets/covers/kai-cover-guess-v1-54e9241a.jpg',
  'web/assets/covers/kai-cover-gomoku-v1-926db038.jpg',
  'web/assets/covers/kai-cover-lights-v1-2eb6c98d.jpg',
  'web/assets/covers/kai-cover-mahjong-v1-7bb39c62.jpg',
  'web/assets/covers/kai-cover-match3-v1-2d4d94be.jpg',
  'web/assets/covers/kai-cover-math-v1-0c88eadf.jpg',
  'web/assets/covers/kai-cover-maze-v1-8f3ecb74.jpg',
  'web/assets/covers/kai-cover-memory-v1-f3108cd7.jpg',
  'web/assets/covers/kai-cover-minesweeper-v1-60e8515a.jpg',
  'web/assets/covers/kai-cover-reels-v1-284304fc.jpg',
  'web/assets/covers/kai-cover-reversi-v1-be8c8529.jpg',
  'web/assets/covers/kai-cover-rps-v1-7f42ee88.jpg',
  'web/assets/covers/kai-cover-sequence-v1-01763a18.jpg',
  'web/assets/covers/kai-cover-sliding-v1-58dc68a5.jpg',
  'web/assets/covers/kai-cover-snake-v1-558a8c35.jpg',
  'web/assets/covers/kai-cover-sokoban-v1-ea16bc36.jpg',
  'web/assets/covers/kai-cover-sudoku6-v1-88f1e623.jpg',
  'web/assets/covers/kai-cover-stroop-v1-aa565e9e.jpg',
  'web/assets/covers/kai-cover-tictactoe-v1-5b754a27.jpg',
  'web/assets/covers/kai-cover-three-v1-6e7a3e76.jpg',
  'web/assets/covers/kai-cover-xiangqi-v1-adc82f4c.jpg',
]) assert.equal((await stat(resolve(root, asset))).isFile(), true, `Production Web asset missing: ${asset}`);

console.log('KAI Play release preflight passed: SDK 57, package identity, play-only boundary, fairness, assets, proxy, and required docs.');
