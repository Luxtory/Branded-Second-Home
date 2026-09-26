import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hook PreCompact (.claude/settings.json): grava o snapshot de continuidade em $TMPDIR e nunca bloqueia.
const HOOK = '.claude/hooks/pre-compact-snapshot.sh';
const BASH = '/bin/bash';
// Cada caso executa bash/node/git; com a suíte inteira em paralelo passa dos 5 s padrão.
const HOOK_PROCESS_TIMEOUT_MS = 30_000;

function snapshotFor(input: string) {
  const repo = mkdtempSync(join(tmpdir(), 'hook-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const state = mkdtempSync(join(tmpdir(), 'hook-state-'));
  const result = spawnSync(BASH, [HOOK], {
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, TMPDIR: state },
    encoding: 'utf8',
  });
  const [file] = readdirSync(state).filter((name) => name.startsWith('.claude-compact-snapshot-'));
  return { result, snapshot: file === undefined ? '' : readFileSync(join(state, file), 'utf8') };
}

describe('pre-compact-snapshot.sh', { timeout: HOOK_PROCESS_TIMEOUT_MS }, () => {
  it('registra no snapshot o trigger recebido e imprime a orientação de preservação', () => {
    const { result, snapshot } = snapshotFor(JSON.stringify({ trigger: 'manual' }));

    expect(result.status).toBe(0);
    expect(snapshot).toContain('trigger: manual,');
    expect(result.stdout).toContain('When compacting, preserve');
  });

  it('sem trigger no input, registra "unknown"', () => {
    expect(snapshotFor('{}').snapshot).toContain('trigger: unknown,');
  });
});
