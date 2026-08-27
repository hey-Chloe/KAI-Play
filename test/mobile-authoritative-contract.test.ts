import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const appSource = await readFile(resolve(root, 'mobile/App.tsx'), 'utf8');
const apiSource = await readFile(resolve(root, 'mobile/src/api.ts'), 'utf8');
const typesSource = await readFile(resolve(root, 'mobile/src/types.ts'), 'utf8');
const gameSyncSource = await readFile(resolve(root, 'mobile/src/use-game-sync.ts'), 'utf8');
const roomSyncSource = await readFile(resolve(root, 'mobile/src/use-room-sync.ts'), 'utf8');
const retrySource = await readFile(resolve(root, 'mobile/src/sync-retry.ts'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker ${end}`);
  return source.slice(startIndex, endIndex);
}

test('mobile countdown uses the authoritative per-turn deadline returned by the server', () => {
  assert.match(typesSource, /turn:\s*[\s\S]{0,220}?\|\s*null/);
  assert.match(typesSource, /deadline:\s*string/);
  const tableSource = sourceBetween(appSource, 'function Table(', 'function HistoryScreen(');
  assert.match(tableSource, /game\.turn(?:\?\.|\.)deadline/);
  assert.match(tableSource, /Date\.parse\([^)]*game\.turn(?:\?\.|\.)deadline/);
});

test('leaving an active mobile game forfeits through the authoritative abandon endpoint', () => {
  assert.match(apiSource, /export async function abandonGame\(gameId:\s*string\)/);
  assert.match(apiSource, /`\/v1\/games\/\$\{gameId\}\/abandon`/);
  assert.match(apiSource, /method:\s*'POST'/);
  assert.match(appSource, /import\s*\{[^}]*abandonGame[^}]*\}\s*from\s*'\.\/src\/api'/);

  const appLogic = sourceBetween(appSource, 'export default function App()', 'const styles = StyleSheet.create(');
  assert.match(appLogic, /await abandonGame\(game\.id\)/);
  assert.match(appLogic, /onExit=\{[A-Za-z_$][\w$]*\}/, 'Table should receive an async exit handler');
  assert.doesNotMatch(appLogic, /onExit=\{\(\)\s*=>\s*\{\s*setGame\(null\)/, 'active games must not be discarded only in local state');
});

test('mobile game updates stay monotonic and API timeouts cover response-body parsing', () => {
  const appLogic = sourceBetween(appSource, 'export default function App()', 'const styles = StyleSheet.create(');
  assert.match(appLogic, /const gameRef = useRef<GameView \| null>/);
  assert.match(appLogic, /current\.id !== next\.id \|\| next\.sequence < current\.sequence/);
  assert.match(appLogic, /acceptGame\(result\.game, result\.profile\)/);
  assert.match(appLogic, /onGame: \(next\) => \{[\s\S]{0,100}?acceptGame\(next\)/);

  assert.match(apiSource, /path\.includes\('\/wait\?'\) \? 30_000 : 12_000/);
  assert.ok(apiSource.indexOf('payload = await response.json()') < apiSource.indexOf('clearTimeout(timeout)'), 'timeout must remain active while JSON is read');
  assert.match(apiSource, /externalSignal\?\.removeEventListener\('abort', forwardAbort\)/);
});

test('mobile sync uses bounded jittered backoff and surfaces terminal failures', () => {
  assert.match(retrySource, /Math\.min\(8_000/);
  assert.match(retrySource, /Math\.random/);
  for (const source of [gameSyncSource, roomSyncSource]) {
    assert.match(source, /let failureCount = 0/);
    assert.match(source, /failureCount \+= 1/);
    assert.match(source, /syncRetryDelay\(signal, failureCount\)/);
    assert.match(source, /onError\?\.\(error, terminal\)/);
  }
  const appLogic = sourceBetween(appSource, 'export default function App()', 'const styles = StyleSheet.create(');
  assert.match(appLogic, /function handleSyncError\(value: unknown, terminal: boolean\)/);
  assert.match(appLogic, /if \(terminal\) showError\(value\)/);
});
