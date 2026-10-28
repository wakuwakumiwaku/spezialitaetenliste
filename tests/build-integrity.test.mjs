import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {artifactFiles} from '../scripts/files.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = fileURLToPath(new URL('../', import.meta.url));
async function manifest(root, prefix = '') {
  const entries = {};
  for (const entry of await readdir(root, {withFileTypes: true})) {
    const name = prefix + entry.name, file = join(root, entry.name);
    if (entry.isDirectory()) Object.assign(entries, await manifest(file, name + '/'));
    else entries[name] = digest(await readFile(file));
  }
  return entries;
}
const build = root => spawnSync(process.execPath, ['scripts/build.mjs'], {cwd: root, encoding: 'utf8'});
async function fixture(action) {
  const root = await mkdtemp(join(tmpdir(), 'sl-build-integrity-'));
  try {
    for (const name of ['scripts', 'src', 'public', 'index.html', 'package.json']) {
      await cp(join(source, name), join(root, name), {recursive: true});
    }
    const initial = build(root);
    assert.equal(initial.status, 0, initial.stderr);
    await writeFile(join(root, 'dist', 'previous-build-marker.txt'), 'synthetic previous artifact\n');
    await action(root, await manifest(join(root, 'dist')));
  } finally { await rm(root, {recursive: true, force: true}); }
}
for (const missing of ['index.html', 'src/styles.css']) {
  test(`failed CLI build preserves the entire previous artifact when ${missing} is missing`, async () => {
    await fixture(async (root, before) => {
      await unlink(join(root, missing));
      const failed = build(root);
      assert.notEqual(failed.status, 0, 'missing required input must reject the real build');
      assert.match(failed.stderr, /ENOENT/);
      assert.deepEqual(await manifest(join(root, 'dist')), before, 'input-copy failure must not destroy or partially replace the previous complete build');
      assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.dist-build-')), [], 'failed staging must be cleaned');
    });
  });
}

// Fault only the filesystem publication boundary; the real CLI, verification,
// staging, rollback and cleanup still execute unchanged.
for (const rollbackFails of [false, true]) {
  test(`publication failure ${rollbackFails ? 'retains the previous build if rollback also fails' : 'restores the previous build'}`, async () => {
    await fixture(async (root, before) => {
      const preload = join(root, 'synthetic-rename-failure.mjs');
      await writeFile(preload, `import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {basename} from 'node:path';
const original = fs.promises.rename;
fs.promises.rename = async function(from, to) {
  if (basename(to) === 'dist' && (basename(from) === 'next' || (${rollbackFails} && basename(from) === 'previous'))) {
    throw Object.assign(new Error('synthetic publication I/O failure'), {code: 'EIO'});
  }
  return original.call(this, from, to);
};
syncBuiltinESMExports();
`);
      const failed = spawnSync(process.execPath, ['--import', preload, 'scripts/build.mjs'], {cwd: root, encoding: 'utf8'});
      assert.notEqual(failed.status, 0, 'a failed publication must exit unsuccessfully');
      assert.match(failed.stderr, /synthetic publication I\/O failure/);
      const remaining = (await readdir(root)).filter(name => name.startsWith('.dist-build-'));
      if (rollbackFails) {
        assert.equal(remaining.length, 1, 'the last complete artifact must not be deleted after a rollback refusal');
        const retained = join(root, remaining[0], 'previous');
        assert.ok(failed.stderr.includes(retained), 'operator must receive the exact recovery path');
        assert.deepEqual(await manifest(retained), before);
      } else {
        assert.deepEqual(await manifest(join(root, 'dist')), before);
        assert.deepEqual(remaining, []);
      }
    });
  });
}

test('catalog-integrity refusal preserves the previous complete build', async () => {
  await fixture(async (root, before) => {
    await writeFile(join(root, 'public/data/catalog.json'), '{}');
    const failed = build(root);
    assert.notEqual(failed.status, 0);
    assert.deepEqual(await manifest(join(root, 'dist')), before);
  });
});
test('successful CLI rebuild replaces stale files with exactly the verified allowlist', async () => {
  await fixture(async root => {
    const valid = build(root);
    assert.equal(valid.status, 0, valid.stderr);
    const actual = await manifest(join(root, 'dist'));
    assert.deepEqual(Object.keys(actual).sort(), [...artifactFiles].sort());
    for (const name of artifactFiles) {
      if (name === '.nojekyll') assert.equal(actual[name], digest(''));
      else {
        const base = name.startsWith('data/') || name === 'favicon.svg' ? 'public' : '';
        assert.equal(actual[name], digest(await readFile(join(root, base, name))), name);
      }
    }
    assert.deepEqual((await readdir(root)).filter(name => name.startsWith('.dist-build-')), []);
  });
});
