import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hook PreToolUse (.claude/settings.json): exit 0 = permite, exit 2 = bloqueia; qualquer outro código NÃO bloqueia,
// por isso toda falha ao interpretar o input precisa terminar em 2 (fail-closed).
const HOOK = '.claude/hooks/block-secrets.sh';
const BASH = '/bin/bash';
const ALLOW = 0;
const BLOCK = 2;

function runHook(input: string, env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(BASH, [HOOK], { input, env, encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

const toolCall = (toolName: string, toolInput: Record<string, unknown>) =>
  JSON.stringify({ tool_name: toolName, tool_input: toolInput });

describe('block-secrets.sh', () => {
  it.each([
    ['Write em .env.local', toolCall('Write', { file_path: '/repo/.env.local', content: 'x' })],
    ['Edit de chave SSH', toolCall('Edit', { file_path: '/home/u/.ssh/id_ed25519' })],
    ['Bash lendo .env', toolCall('Bash', { command: 'cat .env' })],
    ['Bash destrutivo', toolCall('Bash', { command: 'rm -rf ~' })],
  ])('bloqueia: %s', (_case, input) => {
    const { status, stderr } = runHook(input);

    expect(status).toBe(BLOCK);
    expect(stderr).toContain('[block-secrets] BLOCKED');
  });

  it.each([
    [
      'Edit de código',
      toolCall('Edit', { file_path: '/repo/src/features/platform/infrastructure/env.ts' }),
    ],
    ['Bash de teste', toolCall('Bash', { command: 'npm test' })],
    ['tool_input sem campos verificados', toolCall('Write', {})],
  ])('permite: %s', (_case, input) => {
    expect(runHook(input).status).toBe(ALLOW);
  });

  it.each([
    ['JSON inválido', '{not json'],
    ['input vazio', ''],
    ['sem tool_input', JSON.stringify({ tool_name: 'Bash' })],
    ['tool_input não é objeto', JSON.stringify({ tool_input: 'rm -rf ~' })],
    ['command com tipo inesperado', toolCall('Bash', { command: ['cat', '.env'] })],
    ['JSON que não é objeto', '[]'],
  ])('fail-closed — input ilegível bloqueia: %s', (_case, input) => {
    const { status, stderr } = runHook(input);

    expect(status).toBe(BLOCK);
    expect(stderr).toContain('fail-closed');
  });

  it('fail-closed — sem node no PATH, bloqueia em vez de liberar', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'hook-path-'));
    symlinkSync('/bin/cat', join(binDir, 'cat'));
    const onlyCat = { PATH: binDir, NODE_ENV: 'test' } as const;
    const { status, stderr } = runHook(toolCall('Bash', { command: 'npm test' }), onlyCat);

    expect(status).toBe(BLOCK);
    expect(stderr).toContain('node indisponível');
  });
});
