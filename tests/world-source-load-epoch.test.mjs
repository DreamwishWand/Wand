import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSourceLoadEpoch } from '../src/lib/world/world-source-load-epoch.ts';

test('a later local World load supersedes a pending ZIP result', () => {
  const gate = new WorldSourceLoadEpoch();
  const first = gate.begin();
  const second = gate.begin();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.isCurrent(0), false);
  assert.equal(gate.isCurrent(Number.NaN), false);
});

test('clearing a local World source rejects an earlier late completion and error', () => {
  const gate = new WorldSourceLoadEpoch();
  const prior = gate.begin();
  gate.invalidate();
  assert.equal(gate.isCurrent(prior), false);
  const afterClear = gate.begin();
  assert.equal(gate.isCurrent(afterClear), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(afterClear), false);
});

test('out-of-order asynchronous ZIP results never replace the current source', async () => {
  const gate = new WorldSourceLoadEpoch();
  let finishFirst, finishSecond;
  const first = new Promise(resolve => { finishFirst = resolve; });
  const second = new Promise(resolve => { finishSecond = resolve; });
  let visible = null;
  const open = async (promise, ticket) => {
    const result = await promise;
    if (gate.isCurrent(ticket)) visible = result;
  };
  const firstTicket = gate.begin();
  const older = open(first, firstTicket);
  const secondTicket = gate.begin();
  const newer = open(second, secondTicket);
  finishSecond('new-world');
  await newer;
  finishFirst('old-world');
  await older;
  assert.equal(visible, 'new-world');
  gate.invalidate();
  assert.equal(gate.isCurrent(secondTicket), false);
});
