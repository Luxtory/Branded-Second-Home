// Fonts: free (OFL) self-hosted files, licenses present, download weight within the performance limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DS_ROOT } from './lib/tokens.mjs';

const FONTS = join(DS_ROOT, 'fonts');
const manifest = JSON.parse(readFileSync(join(FONTS, 'manifest.json'), 'utf8'));
const size = (file) => statSync(join(FONTS, file.path)).size;

test('every manifest file exists and ships with its OFL license', () => {
  for (const file of manifest.files) {
    assert.ok(existsSync(join(FONTS, file.path)), file.path);
    const license = readFileSync(join(FONTS, dirname(file.path), 'OFL.txt'), 'utf8');
    assert.match(license, /SIL Open Font License/, `${file.path} license`);
  }
});

test('fonts.css declares exactly the manifest files', () => {
  const css = readFileSync(join(DS_ROOT, 'styles', 'fonts.css'), 'utf8');
  const declared = [...css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(declared, manifest.files.map((f) => f.path).sort());
});

test('total font weight stays within the performance limit', () => {
  const total = manifest.files.reduce((sum, f) => sum + size(f), 0);
  assert.ok(total <= manifest.budget.totalBytes, `total ${total} > ${manifest.budget.totalBytes}`);
});

test('preloaded (critical) fonts: at most 2 files and 100 KB', () => {
  const critical = manifest.files.filter((f) => f.preload);
  const bytes = critical.reduce((sum, f) => sum + size(f), 0);
  assert.ok(critical.length <= manifest.budget.preloadFiles, `${critical.length} preload files`);
  assert.ok(bytes <= manifest.budget.preloadBytes, `preload ${bytes} > ${manifest.budget.preloadBytes}`);
});
