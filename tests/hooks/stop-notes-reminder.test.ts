import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Hook Stop (.claude/settings.json): stdout vazio encerra o turno; {"decision":"block"} força mais um turno;
// {"systemMessage"} avisa o usuário. Com stop_hook_active=true nunca bloqueia de novo (guarda de loop).
const HOOK = '.claude/hooks/stop-notes-reminder.sh';
const BASH = '/bin/bash';
// Cada caso executa bash/node/git; com a suíte inteira em paralelo passa dos 5 s padrão.
const HOOK_PROCESS_TIMEOUT_MS = 30_000;
const HOUR_MS = 3_600_000;
const ROADMAP = '| Wave | Deliverable | Status |\n|---|---|---|\n| 0 | Fundação | ⬜ |\n';
const ROADMAP_DONE = '| Wave | Deliverable | Status |\n|---|---|---|\n| 0 | Fundação | ✅ |\n';

/** Repositório git temporário com NOTES.md ignorado (como no projeto) e uma mudança real no working tree. */
function fixture(notes: string, { staleNotes }: { staleNotes: boolean }) {
  const repo = mkdtempSync(join(tmpdir(), 'hook-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  writeFileSync(join(repo, '.gitignore'), 'NOTES.md\n');
  writeFileSync(join(repo, 'feature.ts'), 'export const feature = 1;\n');
  writeFileSync(join(repo, 'NOTES.md'), notes);
  if (staleNotes) {
    const past = new Date(Date.now() - HOUR_MS);
    utimesSync(join(repo, 'NOTES.md'), past, past);
  }
  return { repo, state: mkdtempSync(join(tmpdir(), 'hook-state-')) };
}

function run(fx: { repo: string; state: string }, input: Record<string, unknown>) {
  const result = spawnSync(BASH, [HOOK], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: fx.repo, TMPDIR: fx.state },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  return result.stdout.trim() === '' ? null : (JSON.parse(result.stdout) as Record<string, string>);
}

describe('stop-notes-reminder.sh', { timeout: HOOK_PROCESS_TIMEOUT_MS }, () => {
  it('mudança real sem NOTES.md atualizado: bloqueia uma vez com o lembrete de continuidade', () => {
    const fx = fixture(ROADMAP, { staleNotes: true });
    const output = run(fx, { stop_hook_active: false });

    expect(output?.decision).toBe('block');
    expect(output?.reason).toContain('Continuity reminder');
    expect(run(fx, { stop_hook_active: false })).toBeNull();
  });

  it('guarda de loop: com stop_hook_active=true não bloqueia', () => {
    const fx = fixture(ROADMAP, { staleNotes: true });

    expect(run(fx, { stop_hook_active: true })).toBeNull();
  });

  it('wave marcada ✅: bloqueia para o passe final e depois sugere /compact', () => {
    const fx = fixture(ROADMAP, { staleNotes: false });
    expect(run(fx, { stop_hook_active: false })).toBeNull();

    writeFileSync(join(fx.repo, 'NOTES.md'), ROADMAP_DONE);
    const block = run(fx, { stop_hook_active: false });
    const message = run(fx, { stop_hook_active: false });

    expect(block?.decision).toBe('block');
    expect(block?.reason).toContain('Wave completion detected');
    expect(message?.systemMessage).toContain('Wave complete');
  });

  it('wave marcada ✅ dentro de continuação forçada: só avisa, sem bloquear', () => {
    const fx = fixture(ROADMAP, { staleNotes: false });
    run(fx, { stop_hook_active: false });

    writeFileSync(join(fx.repo, 'NOTES.md'), ROADMAP_DONE);
    const output = run(fx, { stop_hook_active: true });

    expect(output?.decision).toBeUndefined();
    expect(output?.systemMessage).toContain('Wave marked ✅');
  });
});
