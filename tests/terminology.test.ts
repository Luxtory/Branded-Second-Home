import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Mesmas regras de src/design-system/scripts/terminology.test.mjs (REQ-100, REQ-101), estendidas a todo o
// código em src/ e aos contratos em docs/api/.
const FORBIDDEN = [
  /\bcot(a|as|ista|istas|izar|ização)\b/i,
  /\bdi[aá]rias?\b/i,
  /\b(rentabilidade|valoriza[çc][ãa]o|renda) garantid[ao]s?\b/i,
  /\bretorno garantido\b/i,
];
const ROOTS = ['src', 'docs/api'];
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.md',
  '.svg',
  '.yaml',
  '.yml',
]);
// Fora da varredura: o arquivo ultron e os testes do Design System, que definem estas mesmas regras.
// Varre centenas de arquivos: no drvfs (/mnt/c) a leitura pode passar do limite padrão de 5 s.
const SCAN_TIMEOUT_MS = 30_000;
const NEVER_SCANNED = new Set(['activate-ultronpx.mjs', join('src', 'design-system', 'scripts')]);

function textFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (NEVER_SCANNED.has(name) || NEVER_SCANNED.has(path)) return [];
    if (statSync(path).isDirectory()) return textFiles(path);
    return TEXT_EXTENSIONS.has(extname(name)) ? [path] : [];
  });
}

describe('terminologia (02 §1)', () => {
  it(
    '[REQ-100] varredura de terminologia cobre src/ e docs/api',
    () => {
      const files = ROOTS.flatMap(textFiles);
      const hits = files.flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            FORBIDDEN.filter((rule) => rule.test(line)).map(
              (rule) => `${path}:${index + 1} ${rule}`,
            ),
          ),
      );

      expect(files.some((path) => path.startsWith('docs/api'))).toBe(true);
      expect(files.some((path) => path.startsWith(join('src', 'features')))).toBe(true);
      expect(hits).toEqual([]);
    },
    SCAN_TIMEOUT_MS,
  );
});
