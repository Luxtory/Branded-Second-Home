import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guarda de regressão: todo hook registrado em .claude/settings.json precisa rodar no ambiente do projeto, que não
// tem o binário `jq` (sem ele, block-secrets.sh chegou a liberar tudo). `gh … --jq` é embutido no gh e é permitido.
interface HookGroup {
  hooks: { command: string }[];
}
const settings = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
  hooks: Record<string, HookGroup[]>;
};
const HOOK_PATH = /\.claude\/hooks\/[\w.-]+/;
const JQ_BINARY = /(^|[^-\w])jq(\s|$)/;

const registered = [
  ...new Set(
    Object.values(settings.hooks)
      .flat()
      .flatMap((group) => group.hooks)
      .map((hook) => HOOK_PATH.exec(hook.command)?.[0])
      .filter((path): path is string => path !== undefined),
  ),
];

describe('hooks registrados', () => {
  it('existem hooks registrados para verificar', () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  it.each(registered)('%s não chama o binário jq', (path) => {
    const calls = readFileSync(path, 'utf8')
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => !line.trim().startsWith('#') && !line.trim().startsWith('//'))
      .filter(({ line }) => JQ_BINARY.test(line))
      .map(({ line, number }) => `${number}: ${line.trim()}`);

    expect(calls).toEqual([]);
  });

  it.each(registered.filter((path) => path.endsWith('.sh')))(
    '%s tem sintaxe bash válida',
    (path) => {
      expect(spawnSync('/bin/bash', ['-n', path]).status).toBe(0);
    },
  );

  // O package.json declara "type": "module": um hook .js com `require` quebra em todo uso (docs-reminder.js, W0).
  it.each(registered.filter((path) => path.endsWith('.js')))(
    '%s executa com o tipo de módulo do projeto',
    (path) => {
      const result = spawnSync(process.execPath, [path], { input: '{}', encoding: 'utf8' });

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );
});
