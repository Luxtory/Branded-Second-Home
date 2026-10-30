import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TECH_090_JOBS } from '@/features/platform/application/jobs/names';
import { JobRegistry } from '@/features/platform/application/jobs/registry';
import {
  CommandRegistry,
  CommandRegistryError,
  commandRegistry,
  CRITICAL_COMMANDS,
  MODULES,
  NON_CRITICAL_OPERATIONS,
  SYSTEM_COMMANDS,
  type Authority,
  type CommandSpec,
  type MembershipRule,
} from '@/features/platform/application/commands/registry';

const technicalSpec = readFileSync('docs/specs/canonical/03-technical-spec.md', 'utf8');

function section(start: string, end: string): string[] {
  const from = technicalSpec.indexOf(start);
  return technicalSpec.slice(from, technicalSpec.indexOf(end, from)).split('\n');
}

const AUTHORITY: Record<string, Authority> = {
  Titular: 'titular',
  detentor: 'holder',
  solicitante: 'requester',
  ofertante: 'offerer',
  'Admin + base registrada': 'admin',
  'Admin ou Super Admin': 'admin_or_super_admin',
  'Super Admin': 'super_admin',
};
const MEMBERSHIP: Record<string, MembershipRule> = {
  não: 'not_required',
  elegível: 'eligible',
  '—': 'not_applicable',
};
// Linhas de PRL sem identificador no 03 (docs/specs/platform.md → W1.4).
const UNNAMED_ROWS: Record<string, string> = {
  'publicar PRL inicial': 'publish_initial_prl',
  'alterar PRL publicado': 'change_published_prl',
};

/** Tabela do TECH-051 lida do próprio 03: nome → [autoridade, Membership]. */
function tech051Table(): Map<string, [Authority, MembershipRule]> {
  const rows = section('**TECH-051', 'A tabela é fechada')
    .filter(
      (line) => line.startsWith('| ') && !line.startsWith('| Command') && !line.includes('---'),
    )
    .map((line) => line.split('|').map((cell) => cell.trim()));
  const table = new Map<string, [Authority, MembershipRule]>();
  for (const [, commands = '', authority = '', membership = ''] of rows) {
    const names = [...commands.matchAll(/`([a-z_]+)`/g)].map((match) => match[1] as string);
    for (const name of names.length > 0 ? names : [UNNAMED_ROWS[commands] ?? commands]) {
      table.set(name, [
        AUTHORITY[authority] as Authority,
        MEMBERSHIP[membership] as MembershipRule,
      ]);
    }
  }
  return table;
}

describe('registro de commands (TECH-051, TECH-011)', () => {
  it.each([
    'register_second_home_initial_allocation',
    'register_second_home_administration',
    'register_second_home_operation_start',
  ])('[REQ-095] auxiliar W8 %s usa Admin sem ampliar a tabela crítica', (name) => {
    expect(commandRegistry.get(name)).toEqual({
      name,
      module: 'ownership',
      authority: 'admin',
      membership: 'not_applicable',
      critical: false,
    });
  });

  it('[TECH-051] o registro crítico é exatamente a tabela fechada do 03, com autoridade e Membership', () => {
    const critical = commandRegistry.list().filter((spec) => spec.critical);
    const registered = new Map(
      critical.map((spec) => [spec.name, [spec.authority, spec.membership]]),
    );

    expect(registered).toEqual(tech051Table());
    expect(critical).toHaveLength(29);
  });

  it('[TECH-051] CRITICAL_COMMANDS é exatamente a tabela fechada; operações não críticas ficam fora dela', () => {
    const table = tech051Table();

    expect(
      new Map(CRITICAL_COMMANDS.map((spec) => [spec.name, [spec.authority, spec.membership]])),
    ).toEqual(table);
    expect(CRITICAL_COMMANDS.every((spec) => spec.critical)).toBe(true);
    expect(NON_CRITICAL_OPERATIONS.every((spec) => !spec.critical)).toBe(true);
    expect(NON_CRITICAL_OPERATIONS.filter((spec) => table.has(spec.name))).toEqual([]);
    expect(commandRegistry.list()).toEqual([
      ...CRITICAL_COMMANDS,
      ...NON_CRITICAL_OPERATIONS,
      ...SYSTEM_COMMANDS,
    ]);
  });

  it('[TECH-090] commands de sistema ficam fora do TECH-051 e cada um pertence a um único job', () => {
    expect(SYSTEM_COMMANDS).toEqual([
      {
        name: 'open_exercise',
        module: 'calendar',
        authority: 'system',
        membership: 'not_applicable',
        critical: false,
        job: 'open_exercise',
      },
      {
        name: 'close_exercise',
        module: 'calendar',
        authority: 'system',
        membership: 'not_applicable',
        critical: false,
        job: 'close_exercise',
      },
    ]);
    expect(SYSTEM_COMMANDS.filter((spec) => tech051Table().has(spec.name))).toEqual([]);
    expect(
      SYSTEM_COMMANDS.every((spec) => spec.job !== undefined && spec.authority === 'system'),
    ).toBe(true);
    expect(
      [...CRITICAL_COMMANDS, ...NON_CRITICAL_OPERATIONS].some(
        (spec) => spec.authority === 'system',
      ),
    ).toBe(false);
  });

  it('[REQ-014] na W2 o registro não tem operação concedível a parceiros (grantee)', () => {
    expect(commandRegistry.grantable()).toEqual([]);
    expect(commandRegistry.get('grant_authorization')).toMatchObject({
      module: 'identity',
      authority: 'admin',
      critical: false,
    });
  });

  it('[TECH-011] todo command pertence a um módulo do 03', () => {
    const canonicalModules = section('**TECH-011', 'Cada módulo')
      .find((line) => line.startsWith('`identity'))
      ?.split('·')
      .map((name) => name.replaceAll('`', '').trim());

    expect(canonicalModules).toEqual([...MODULES]);
    for (const spec of commandRegistry.list()) expect(MODULES).toContain(spec.module);
  });

  it('registro fechado: nome inválido ou repetido é recusado', () => {
    const spec: CommandSpec = {
      name: 'test_command',
      module: 'platform',
      authority: 'admin',
      membership: 'not_applicable',
      critical: false,
    };

    expect(new CommandRegistry([spec]).get('test_command')).toBe(spec);
    expect(new CommandRegistry([spec]).get('outro')).toBeUndefined();
    expect(() => new CommandRegistry([spec, spec])).toThrow(CommandRegistryError);
    expect(() => new CommandRegistry([{ ...spec, name: 'Inválido' }])).toThrow(
      CommandRegistryError,
    );
  });
});

describe('registro de jobs (TECH-090)', () => {
  it('[TECH-090] os nomes de job são exatamente os do 03', () => {
    const line = section('**TECH-090', 'Execução/item').find((text) =>
      text.startsWith('`open_exercise'),
    );

    expect(line?.split('·').map((name) => name.replaceAll('`', '').trim())).toEqual([
      ...TECH_090_JOBS,
    ]);
  });

  it('[TECH-090] o registro só devolve jobs do TECH-090 implementados', async () => {
    const registry = new JobRegistry({ outbox: () => Promise.resolve({ delivered: 0 }) });

    expect(registry.names()).toEqual(['outbox']);
    await expect(registry.get('outbox')?.()).resolves.toEqual({ delivered: 0 });
    expect(registry.get('reconciliation')).toBeUndefined();
    expect(registry.get('drop_everything')).toBeUndefined();
  });
});
