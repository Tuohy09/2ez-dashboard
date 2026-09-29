import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceOpening, openingCounts } from '../src/qbittorrent/opening.js';

const item = (state, progress = .4, extra = {}) => ({ state, progress, dlspeed: 0, downloaded: 400, ...extra });
const step = (previous, torrents, now = 0) => advanceOpening(previous, torrents, now, () => 0);
function tick(previous, torrents, until) {
  for (let now = previous.observedAt + 2500; now <= until; now += 2500) previous = step(previous, torrents, now);
  return previous;
}

test('counts queues, stalled downloads, stopped torrents and completed data separately', () => {
  const counts = openingCounts({ a: item('downloading'), b: item('queuedDL'), c: item('queuedUP', 1), d: item('stalledDL'), e: item('stalledUP', 1), f: item('pausedUP', 1), g: item('stoppedDL'), h: item('checkingDL'), i: item('metaDL'), j: item('missingFiles') });
  assert.deepEqual(counts, { downloading: 1, queued: 2, stalled: 1, metadata: 1, checking: 1, seeding: 1, stopped: 2, error: 1, completed: 3 });
  assert.equal(openingCounts({ a: item('stalledDL', .4, { dlspeed: 1 }) }).downloading, 1);
});

test('chooses quiet, single, few, busy, queue, seeding and maintenance openings', () => {
  assert.equal(step(null, {}).title, 'Hmm, bit quiet in here. Been busy, mate?');
  for (const [count, mode] of [[1, 'one'], [2, 'few'], [5, 'few'], [6, 'many']]) {
    const torrents = Object.fromEntries(Array.from({ length: count }, (_, i) => [i, item('downloading')]));
    assert.equal(step(null, torrents).mode, mode);
  }
  assert.equal(step(null, { a: item('queuedDL') }).title, '1 in the queue. Form an orderly download.');
  assert.equal(step(null, { a: item('uploading', 1), b: item('stoppedDL') }).mode, 'seeding');
  assert.equal(step(null, { a: item('checkingDL') }).mode, 'checking');
  assert.equal(step(null, { a: item('metaDL') }).mode, 'metadata');
  assert.equal(step(null, { a: item('pausedDL') }).mode, 'quiet');
});

test('stalled jokes require a continuous 30 seconds without progress and no running downloads', () => {
  const torrents = { a: item('stalledDL') };
  let state = step(null, torrents);
  state = tick(state, torrents, 27500); assert.equal(state.mode, 'waiting');
  state = step(state, torrents, 30000); assert.equal(state.title, 'All queued up and no peer to go.');
  state = step(state, { ...torrents, b: item('downloading') }, 32500); assert.equal(state.mode, 'one');
  state = step(state, { a: item('stalledDL', .5) }, 35000); assert.equal(state.mode, 'waiting');
  state = tick(state, { a: item('stalledDL', .5) }, 65000); assert.equal(state.mode, 'stalled');
  state = step(state, { a: item('stalledDL', .5, { downloaded: 600 }) }, 67500); assert.equal(state.mode, 'waiting');
});

test('celebrates observed completions briefly, aggregates a batch, and expires without resetting on each poll', () => {
  let state = step(null, { a: item('downloading'), b: item('downloading') });
  const first = { a: item('uploading', 1), b: item('downloading') };
  state = step(state, first, 2500); assert.equal(state.mode, 'completed'); assert.equal(state.completion.count, 1);
  const both = { a: item('uploading', 1), b: item('queuedUP', 1) };
  state = step(state, both, 5000); assert.equal(state.completion.count, 2);
  state = tick(state, both, 47500); assert.equal(state.mode, 'completed'); assert.equal(state.completion.count, 2);
  state = step(state, both, 50000); assert.equal(state.completion, null); assert.equal(state.mode, 'queued');
});

test('does not celebrate completed imports, initial data, or file rechecks', () => {
  let state = step(null, { a: item('uploading', 1) }); assert.equal(state.mode, 'seeding');
  state = step(state, { a: item('uploading', 1), b: item('uploading', 1) }, 2500); assert.equal(state.completion, null);
  state = step(state, { a: item('checkingDL', .8) }, 5000);
  state = step(state, { a: item('uploading', 1) }, 7500); assert.equal(state.completion, null);
});

test('reconnects reset stall observations and do not infer completion from stale data', () => {
  const torrents = { a: item('stalledDL') };
  let state = tick(step(null, torrents), torrents, 30000); assert.equal(state.mode, 'stalled');
  state = step(state, torrents, 60000); assert.equal(state.mode, 'waiting');
  state = step(state, { a: item('uploading', 1) }, 90000); assert.equal(state.completion, null);
});

test('errors take priority over jokes and completion notices', () => {
  let state = step(null, { a: item('downloading') });
  state = step(state, { a: item('uploading', 1), b: item('error') }, 2500);
  assert.equal(state.title, '1 transfer needs a hand. Check the errored transfers.');
  state = step(state, { a: item('unknown'), b: item('missingFiles') }, 5000);
  assert.equal(state.title, '2 transfers need a hand. Check the errored transfers.');
});

test('keeps a line stable across polling, updates its count, then rotates through every stalled opening', () => {
  let state = step(null, { a: item('downloading'), b: item('downloading') });
  state = step(state, { ...state.torrents, c: item('downloading') }, 2500);
  assert.equal(state.title, '3 on the go. Lovely little operation.');
  const torrents = { a: item('stalledDL') };
  state = tick(step(null, torrents), torrents, 30000);
  const titles = new Set([state.title]);
  for (let i = 1; i <= 6; i++) { state = tick(state, torrents, 30000 + 45000 * i); titles.add(state.title); }
  assert.equal(titles.size, 6); assert.equal(state.title, 'All queued up and no peer to go.');
});


test('prolonged metadata waits join stalled downloads, but active metadata transfers suppress stalled jokes', () => {
  const torrents = { a: item('stalledDL'), b: item('metaDL', 0) };
  let state = step(null, torrents); assert.equal(state.mode, 'metadata');
  state = tick(state, torrents, 30000); assert.equal(state.mode, 'stalled');
  assert.equal(state.counts.metadata, 1); assert.equal(state.counts.stalled, 1);
  state = step(state, { ...torrents, b: item('metaDL', 0, { dlspeed: 100 }) }, 32500);
  assert.equal(state.mode, 'metadata');
});
