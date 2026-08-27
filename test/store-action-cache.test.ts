import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { JsonGameStore, MAX_ACTION_RESULT_ENTRIES } from '../server/src/store.ts';

test('durable idempotency cache retains only the most recent 512 action results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doujoy-action-cache-'));
  const path = join(directory, 'state.json');
  try {
    const store = new JsonGameStore(path);
    await store.load();
    for (let index = 0; index <= MAX_ACTION_RESULT_ENTRIES; index += 1) {
      store.setActionResult(`action-${index.toString().padStart(3, '0')}`, `fingerprint-${index}`, { index });
    }

    assert.equal(store.actionResult('action-000'), undefined, 'the oldest entry should be evicted at the bound');
    assert.equal(store.actionResultCount(), MAX_ACTION_RESULT_ENTRIES);
    assert.deepEqual(store.actionResult('action-001'), { requestFingerprint: 'fingerprint-1', result: { index: 1 } });
    assert.deepEqual(store.actionResult('action-512'), { requestFingerprint: 'fingerprint-512', result: { index: 512 } });
    await store.save();

    const reloaded = new JsonGameStore(path);
    await reloaded.load();
    assert.equal(reloaded.actionResult('action-000'), undefined);
    assert.equal(reloaded.actionResultCount(), MAX_ACTION_RESULT_ENTRIES);
    assert.deepEqual(reloaded.actionResult('action-001'), { requestFingerprint: 'fingerprint-1', result: { index: 1 } });
    assert.deepEqual(reloaded.actionResult('action-512'), { requestFingerprint: 'fingerprint-512', result: { index: 512 } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
