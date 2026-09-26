import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Hook PostToolUse (.claude/settings.json): lembra de atualizar docs/ quando código muda; nunca bloqueia (exit 0).
const HOOK = '.claude/hooks/docs-reminder.js';
// Cada caso executa um processo node; com a suíte inteira em paralelo passa dos 5 s padrão.
const HOOK_PROCESS_TIMEOUT_MS = 30_000;

function runHook(input: string) {
  const result = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const edit = (filePath: unknown) =>
  JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } });

describe('docs-reminder.js', { timeout: HOOK_PROCESS_TIMEOUT_MS }, () => {
  it('código alterado: imprime o lembrete com o arquivo e sai com 0', () => {
    const { status, stdout, stderr } = runHook(
      edit('/repo/src/features/platform/infrastructure/logger.ts'),
    );

    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(stdout).toContain('[hook: docs-reminder]');
    expect(stdout).toContain('"logger.ts"');
  });

  it.each([
    ['docs/', edit('/repo/docs/specs/platform.md')],
    ['arquivo de teste', edit('/repo/tests/app/v1/contract.test.ts')],
    ['.claude/', edit('/repo/.claude/hooks/block-secrets.sh')],
  ])('ignorado (%s): sem lembrete', (_case, input) => {
    expect(runHook(input)).toMatchObject({ status: 0, stdout: '' });
  });

  it.each([
    ['JSON inválido', '{not json'],
    ['input vazio', ''],
    ['sem tool_input', JSON.stringify({ tool_name: 'Edit' })],
    ['file_path não é string', edit({ path: '/repo/src/app/layout.tsx' })],
    ['file_path numérico', edit(42)],
  ])('input inesperado (%s): sai com 0, sem erro e sem lembrete', (_case, input) => {
    expect(runHook(input)).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });
});
