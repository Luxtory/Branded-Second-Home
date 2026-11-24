import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  databaseBefore,
  differences,
  migrationDown,
  migrationsFromNewest,
  snapshot,
  type Snapshot,
} from '../support/catalog-snapshot';
import { createTestDatabase } from '../support/test-database';

/**
 * W20 E1 — prova de preservação (ADR-0036): a migration da W20 acrescenta o snapshot por noite, as funções do depósito,
 * a completude adiada e a consulta de invariantes; e muda só o CHECK da K6, a natureza `cession` (três CHECKs da
 * transição) e seis funções das W13, W14 e W17 — cada uma com o ramo do depósito **antes** do caminho existente, sem
 * remover regra. Nada mais das W10–W19 muda.
 */
const FIRST_W20 = '20261123211619_luxchange_deposit';
const LAST_W20 = FIRST_W20;

const CHANGED = [
  'constraint app.booking_state_transition.booking_state_transition_basis_shape',
  'constraint app.booking_state_transition.booking_state_transition_kind_check',
  'constraint app.booking_state_transition.conflict_booking_transition_pair',
  'constraint app.capability_activation.capability_activation_capability_check',
  'function app.assert_booking_closure_complete(uuid)',
  'function app.booking_state_transition_check()',
  'function app.credit_entry_write()',
  'function app.credit_lot_originate()',
  'function app.date_custody_close()',
  'function app.date_custody_open()',
  'function app.date_occupancy_release()',
];

const W20_OBJECTS = [
  /^(acl|constraint|trigger) app\.economic_snapshot_night\b/,
  /^acl app\.economic_snapshot_night_(pkey|prl_idx)$/,
  /^policy economic_snapshot_night\./,
  /^(trigger|constraint) app\.economic_snapshot\.economic_snapshot_operation_constraint$/,
  /^function(-acl)? app\.(economic_snapshot_night_write|economic_snapshot_in_current_transaction|economic_snapshot_operation_constraint|luxchange_deposit_notice_met|assert_luxchange_deposit_active|assert_luxchange_exchange_active|assert_luxchange_deposit_complete|luxchange_deposit_[a-z_]+|luxchange_invariant_breaches)\(/,
];

/**
 * Só inserções: as linhas de `before`, tirando as `replaced`, aparecem em `after` na mesma ordem (subsequência); devolve
 * as linhas acrescentadas. Cada item de `replaced` é uma linha única de `before` ou um bloco contíguo único (sai inteiro).
 * Uma regra removida ou reescrita fora do que foi declarado falha aqui.
 */
function insertionsOnly(
  before: string,
  after: string,
  replaced: readonly (string | readonly string[])[] = [],
) {
  const kept = before.split('\n');
  for (const item of replaced) {
    const block = typeof item === 'string' ? [item] : item;
    const at = kept
      .map((_, index) => index)
      .filter((index) => block.every((line, offset) => kept[index + offset] === line));
    expect(at).toHaveLength(1);
    kept.splice(at[0]!, block.length);
  }
  const added: string[] = [];
  let next = 0;
  for (const line of after.split('\n')) {
    if (next < kept.length && line === kept[next]) next += 1;
    else added.push(line);
  }
  expect(kept.slice(next)).toEqual([]);
  return added.join('\n');
}

describe('W20 — preservação do catálogo (E1)', () => {
  let w19: Awaited<ReturnType<typeof databaseBefore>>;
  let w19Snapshot: Snapshot;
  let after: Snapshot;
  let release: () => Promise<void>;

  beforeAll(async () => {
    w19 = await databaseBefore(FIRST_W20);
    w19Snapshot = await snapshot(w19.database);
    // Banco só até a W20: as waves seguintes (W21+) têm a própria prova de preservação.
    const newer = (await migrationsFromNewest(FIRST_W20)).filter((name) => name > LAST_W20);
    const upToW20 = newer.length > 0 ? await databaseBefore(newer.at(-1)!) : null;
    const subject = upToW20?.database ?? (await createTestDatabase());
    after = await snapshot(subject);
    release = () => (upToW20 ? upToW20.dispose() : subject.drop());
  });

  afterAll(async () => {
    await release?.();
    await w19?.dispose();
  });

  const added = (key: string, replaced: readonly (string | readonly string[])[] = []) =>
    insertionsOnly(w19Snapshot.get(key)!, after.get(key)!, replaced);

  it('[TECH-110][ADR-0036] a W20 só acrescenta os objetos do depósito e muda exatamente as definições previstas', () => {
    const changed = differences(w19Snapshot, after);
    expect(changed.filter((key) => w19Snapshot.has(key)).sort()).toEqual(CHANGED);
    const added = changed.filter((key) => !w19Snapshot.has(key));
    expect(added.length).toBeGreaterThan(0);
    expect(added.filter((key) => !W20_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);
    const check = after.get(CHANGED[3]!)!;
    expect(
      check.replace(", 'luxchange_deposit'::text", '').replace(", 'luxchange_exchange'::text", ''),
    ).toBe(w19Snapshot.get(CHANGED[3]!));
  });

  it('[REQ-060][ADR-0036] funções da W13/W14/W17: só o ramo do depósito, antes dos caminhos existentes', () => {
    // A trava do Titular passa a valer também para a cessão; nenhuma outra linha da W13 sai.
    const transition = added('function app.booking_state_transition_check()', [
      [
        "  IF NEW.kind = 'cancellation' THEN",
        '    PERFORM app.lock_own_use_titular(op, b, clock_timestamp());',
        '  END IF;',
      ],
    ]);
    expect(transition).toContain("ELSIF NEW.kind = 'cession' THEN");
    expect(transition).toContain('app.assert_luxchange_deposit_active()');
    expect(transition).toContain("IF NEW.kind IN ('cancellation', 'cession') THEN");
    expect(transition).toContain(
      "WHEN 'cession' THEN NEW.from_state = 'confirmed' AND NEW.to_state = 'cancelled'",
    );
    expect(transition).toContain('deposit_min_notice');
    expect(transition).toContain('custody_deposit_whole_booking');

    expect(added('function app.assert_booking_closure_complete(uuid)')).toContain(
      'app.assert_luxchange_deposit_complete(t.operation_id)',
    );

    const open = added('function app.date_custody_open()', [
      "    IF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'use_right'",
    ]);
    expect(open).toContain('app.luxchange_deposit_open(NEW)');
    expect(open).toContain(
      "    ELSIF v_found AND v_parent.holder_kind = 'spe_pool' AND NEW.holder_kind = 'use_right'",
    );

    const close = added('function app.date_custody_close()', ["    IF OLD.holder_kind = 'spe_pool'"]);
    expect(close).toContain('app.luxchange_deposit_close(NEW.closed_by_operation, OLD)');
    expect(close).toContain("    ELSIF OLD.holder_kind = 'spe_pool'");

    // O caminho da W13 (oito linhas) fica idêntico, só indentado dentro do `ELSE` do ramo do depósito.
    const w13Lines = w19Snapshot.get('function app.date_occupancy_release()')!.split('\n');
    const from = w13Lines.indexOf("    IF OLD.channel <> 'own_use' THEN");
    expect(from).toBeGreaterThan(0);
    const w13Path = w13Lines.slice(from, from + 8);
    const release = added('function app.date_occupancy_release()', [w13Path]);
    expect(release).toContain(w13Path.map((line) => `  ${line}`).join('\n'));
    expect(release).toContain('app.luxchange_deposit_release(');

    const lot = added('function app.credit_lot_originate()');
    expect(lot).toContain('credit_lot_deposit_quantity');
    expect(lot).toContain('app.assert_luxchange_exchange_active()');
    expect(added('function app.credit_entry_write()')).toContain('app.assert_luxchange_exchange_active()');
  });

  it('[TECH-110] desfazer a W20 restaura exatamente o catálogo da W19', async () => {
    const subject = await createTestDatabase();
    try {
      for (const name of await migrationsFromNewest(FIRST_W20))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w19Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });
});
