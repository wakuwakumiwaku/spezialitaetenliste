import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, WorkspaceStore, STORAGE_KEY, exportCSV, importCSV, validateWorkspace } from '../src/domain.js';

const workspace = note => ({ ...emptyWorkspace(), note,
  lines: [{ id: 'synthetic-package', quantity: 2, label: 'Synthetic pack', note: 'Original line note' }],
  favorites: ['synthetic-package'] });
function memory(value) {
  const writes = [];
  return { getItem(key) { assert.equal(key, STORAGE_KEY); return value; },
    setItem(key, raw) { assert.equal(key, STORAGE_KEY); writes.push(raw); value = raw; },
    external(raw) { value = raw; }, raw: () => value, writes };
}

for (const [name, external] of [
  ['replacement', JSON.stringify(workspace('Other tab'))], ['removal', null]
]) test(`a refused ordinary edit after storage ${name} remains in JSON and CSV exports`, () => {
  const original = workspace('Original'), initial = JSON.stringify(original), m = memory(initial), store = new WorkspaceStore(m);
  const next = workspace('Local unsaved note'); next.lines[0].quantity = 7; next.lines[0].note = 'New local line note';
  m.external(external);
  assert.equal(store.replace(next), false);
  assert.equal(m.raw(), external, 'the other tab owns the persistent raw state');
  assert.equal(m.writes.length, 0); assert.equal(store.raw, initial);
  assert.equal(store.paused, true); assert.match(store.problem, /exportieren/);
  assert.deepEqual(JSON.parse(JSON.stringify(store.value)), next, 'the very edit that detected drift must remain exportable');
  assert.deepEqual(importCSV(exportCSV(store.value, new Map())), next, 'CSV must include the same unsaved draft');
  next.note = 'Caller mutated later'; assert.equal(store.value.note, 'Local unsaved note', 'retain a validated clone');
  const later = structuredClone(store.value); later.note = 'Continued transient edit';
  assert.equal(store.replace(later), false); assert.deepEqual(store.value, later);
  assert.equal(m.raw(), external); assert.equal(m.writes.length, 0);
  const reloaded = new WorkspaceStore(m);
  assert.deepEqual(reloaded.value, external === null ? emptyWorkspace() : workspace('Other tab'));
});

test('a refused explicit recovery must not adopt the incoming workspace', () => {
  const original = workspace('Original'), initial = JSON.stringify(original), m = memory(initial), store = new WorkspaceStore(m);
  const external = JSON.stringify(workspace('Other tab')); m.external(external);
  assert.equal(store.replace(workspace('Rejected import'), true), false);
  assert.deepEqual(store.value, original); assert.equal(store.raw, initial);
  assert.equal(m.raw(), external); assert.equal(m.writes.length, 0); assert.equal(store.paused, true);
});

test('no-drift ordinary writes persist complete validated work', () => {
  for (const initial of [null, JSON.stringify(workspace('Original'))]) {
    const m = memory(initial), store = new WorkspaceStore(m);
    for (const note of ['First own write', 'Second own write']) {
      const next = workspace(note);
      assert.equal(store.replace(next), true); assert.deepEqual(store.value, next);
      assert.deepEqual(JSON.parse(m.raw()), next); assert.equal(store.raw, m.raw());
      assert.equal(store.paused, false); assert.equal(store.problem, '');
    }
    assert.equal(m.writes.length, 2);
  }
});

test('invalid local proposals cannot change memory or persistent state, even after drift', () => {
  const original = workspace('Original'), initial = JSON.stringify(original), m = memory(initial), store = new WorkspaceStore(m);
  const external = JSON.stringify(workspace('Other tab')); m.external(external);
  const invalid = workspace('Invalid'); invalid.lines[0].quantity = 0;
  assert.throws(() => store.replace(invalid)); assert.deepEqual(store.value, validateWorkspace(original));
  assert.equal(store.raw, initial); assert.equal(m.raw(), external); assert.equal(m.writes.length, 0);
});

test('quota-failed ordinary edits stay transient but quota-failed recovery stays unadopted', () => {
  const original = workspace('Original'), raw = JSON.stringify(original);
  for (const recovery of [false, true]) {
    const store = new WorkspaceStore({ getItem: () => raw, setItem() { throw new Error('synthetic quota'); } });
    const next = workspace('Attempted edit');
    assert.equal(store.replace(next, recovery), false);
    assert.deepEqual(store.value, recovery ? original : next); assert.equal(store.raw, raw); assert.equal(store.paused, true);
  }
});

test('a known-paused draft remains exportable without attempting a write', () => {
  const m = memory(JSON.stringify(workspace('Original'))), store = new WorkspaceStore(m);
  store.externalChange(); const next = workspace('Transient edit after delivered event');
  assert.equal(store.replace(next), false); assert.deepEqual(store.value, next); assert.equal(m.writes.length, 0);
});
