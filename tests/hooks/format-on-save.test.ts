import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hook PostToolUse (.claude/settings.json): formata o arquivo editado e nunca bloqueia (sempre exit 0).
const HOOK = '.claude/hooks/format-on-save.sh';
const BASH = '/bin/bash';
// `npx prettier` no drvfs (/mnt/c) pode levar alguns segundos.
const PRETTIER_TIMEOUT_MS = 60_000;

function runHook(input: string, projectDir: string) {
  return spawnSync(BASH, [HOOK], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
}

function projectWithFile(content: string) {
  const projectDir = mkdtempSync(join(tmpdir(), 'hook-project-'));
  const file = join(projectDir, 'sample.ts');
  writeFileSync(file, content);
  return { projectDir, file };
}

describe('format-on-save.sh', () => {
  it(
    'formata com o Prettier do projeto o arquivo informado em tool_input.file_path',
    () => {
      const { projectDir, file } = projectWithFile('const  answer =  42\n');
      const result = runHook(JSON.stringify({ tool_input: { file_path: file } }), projectDir);

      expect(result.status).toBe(0);
      expect(readFileSync(file, 'utf8')).toBe('const answer = 42;\n');
    },
    PRETTIER_TIMEOUT_MS,
  );

  it('não toca arquivos fora do projeto', () => {
    const { file } = projectWithFile('const  answer =  42\n');
    const otherProject = mkdtempSync(join(tmpdir(), 'hook-project-'));
    const result = runHook(JSON.stringify({ tool_input: { file_path: file } }), otherProject);

    expect(result.status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('const  answer =  42\n');
  });

  it('input ilegível: não formata nada e não bloqueia', () => {
    const { projectDir } = projectWithFile('x');

    expect(runHook('{not json', projectDir).status).toBe(0);
    expect(runHook('', projectDir).status).toBe(0);
  });
});
