import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, exportCSV, importCSV, parseCSV } from '../src/domain.js';

test('CSV spreadsheet protection covers leading whitespace while preserving every literal value', () => {
  for (const note of ['  =1+1', '  @SUM(A1)', ' \t+cmd', '\v-1', '\u00a0=1+1', '\tordinary', "'literal", 'ordinary text']) {
    const state = emptyWorkspace();
    state.note = note;
    state.lines = [{ id: 'unknown-' + note, quantity: 1, label: note, note }];
    state.favorites = [note];
    const csv = exportCSV(state, new Map()), rows = parseCSV(csv);
    if (/^\s*[=+@-]|^[\t\r\n']/.test(note)) {
      assert.ok(rows[1][4].startsWith("'"), 'workspace note needs spreadsheet protection: ' + JSON.stringify(note));
      assert.ok(rows[2][3].startsWith("'"), 'line label needs spreadsheet protection');
      assert.ok(rows[2][4].startsWith("'"), 'line note needs spreadsheet protection');
      assert.ok(rows[3][1].startsWith("'"), 'favorite identifier needs spreadsheet protection');
    }
    assert.deepEqual(importCSV(csv), state, 'CSV round trip must retain original whitespace and quote characters');
  }
});
