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
 * W21 E1 — prova de preservação (ADR-0037): a migration da W21 acrescenta a Request, o complemento por datas, o
 * consentimento, a política no snapshot, o encerramento pré-aceite, os ramos de recusa por data comprometida e as travas
 * consultivas; e muda só sete funções das W17, W19 e W20 — o ledger (Garantia vinculada à Request, FEFO, liberação só pelo
 * encerramento, chaves só para movimento novo), a reversão do Fee (encerramentos da W21 sem a K5), quatro gatilhos de
 * pagamento/estorno/inbox (sem a K5: obrigações existentes, ADR-0037 §10) e a consulta de invariantes (acréscimo). Nada mais
 * das W10–W20 muda.
 */
const FIRST_W21 = '20261125012516_luxchange_request';
const LAST_W21 = FIRST_W21;

const CHANGED = [
  'function app.credit_entry_write()',
  'function app.fee_charge_reversal_write()',
  'function app.luxchange_invariant_breaches()',
  'function app.payment_advance()',
  'function app.refund_advance()',
  'function app.refund_open()',
  'function app.webhook_inbox_write()',
];

const W21_TABLES =
  'luxchange_request|luxchange_request_transition|luxchange_request_night|luxchange_request_complement_unit|luxchange_request_complement_night|luxchange_request_consent|economic_snapshot_policy';
const W21_OBJECTS = [
  new RegExp(`^(acl|constraint|trigger) app\\.(${W21_TABLES})\\b`),
  new RegExp(`^acl app\\.(${W21_TABLES})_[a-z_]+$`),
  /^acl app\.luxchange_(request|complement)_[a-z_]+$/,
  /^acl app\.conflict_luxchange_request_closed$/,
  new RegExp(`^policy (${W21_TABLES})\\.`),
  /^(view|acl) app\.luxchange_request_received$/,
  /^function(-acl)? app\.(luxchange_request_[a-z_]+|luxchange_complement_[a-z_]+|luxchange_snapshot_parameter|luxchange_night_credits|economic_snapshot_policy_write|assert_luxchange_request_[a-z_]+|fee_charge_write_request|lock_night|lock_booking)\(/,
  // Ramos de recusa por data comprometida e vínculo do Fee: gatilhos novos em tabelas existentes.
  /^trigger app\.date_occupancy\.date_occupancy_complement_guard$/,
  /^trigger app\.booking_state_transition\.booking_state_transition_complement_guard$/,
  /^trigger app\.date_custody\.date_custody_complement_guard$/,
  /^trigger app\.fee_charge\.fee_charge_write_request$/,
];

/**
 * Só inserções: as linhas de `before`, tirando as `replaced`, aparecem em `after` na mesma ordem (subsequência); devolve
 * as linhas acrescentadas. Cada item de `replaced` é uma linha única de `before` ou um bloco contíguo único (sai inteiro).
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
    expect(at, block.join('\n')).toHaveLength(1);
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

describe('W21 — preservação do catálogo (E1)', () => {
  let w20: Awaited<ReturnType<typeof databaseBefore>>;
  let w20Snapshot: Snapshot;
  let after: Snapshot;
  let release: () => Promise<void>;

  beforeAll(async () => {
    w20 = await databaseBefore(FIRST_W21);
    w20Snapshot = await snapshot(w20.database);
    // Banco só até a W21: as waves seguintes (W22+) têm a própria prova de preservação.
    const newer = (await migrationsFromNewest(FIRST_W21)).filter((name) => name > LAST_W21);
    const upToW21 = newer.length > 0 ? await databaseBefore(newer.at(-1)!) : null;
    const subject = upToW21?.database ?? (await createTestDatabase());
    after = await snapshot(subject);
    release = () => (upToW21 ? upToW21.dispose() : subject.drop());
  });

  afterAll(async () => {
    await release?.();
    await w20?.dispose();
  });

  const added = (key: string, replaced: readonly (string | readonly string[])[] = []) =>
    insertionsOnly(w20Snapshot.get(key)!, after.get(key)!, replaced);

  it('[TECH-110][ADR-0037] a W21 só acrescenta os objetos da Request e muda exatamente as definições previstas', () => {
    const changed = differences(w20Snapshot, after);
    expect(changed.filter((key) => w20Snapshot.has(key)).sort()).toEqual(CHANGED);
    const fresh = changed.filter((key) => !w20Snapshot.has(key));
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.filter((key) => !W21_OBJECTS.some((pattern) => pattern.test(key)))).toEqual([]);
  });

  it('[ADR-0037 §10] pagamento, estorno e inbox: só a exigência da K5 sai — obrigação existente nunca fica presa', () => {
    for (const key of [
      'function app.payment_advance()',
      'function app.refund_advance()',
      'function app.refund_open()',
      'function app.webhook_inbox_write()',
    ]) {
      const inserted = added(key, ['  PERFORM app.assert_payments_active();']);
      expect(inserted).toBe('  -- W21 (ADR-0037 §10): sem a K5 — objeto preexistente; nada novo é criado aqui.');
    }
  });

  it('[TECH-071][ADR-0037 §4] ledger: Garantia vinculada à Request com FEFO; liberação só pelo encerramento; K4/K7 só para movimento novo', () => {
    const ledger = added('function app.credit_entry_write()', [
      '  PERFORM app.assert_credits_active();',
      [
        "  IF op.command IN ('send_request', 'accept_request', 'create_direct', 'withdraw_request', 'reject_request') THEN",
        '    -- W20 auditoria (ADR-0036 §7): Garantia, consumo e liberação de Request/Direct só com a K7 (W21–W23).',
        '    PERFORM app.assert_luxchange_exchange_active();',
        '  END IF;',
      ],
      "    IF op.command NOT IN ('withdraw_request', 'reject_request') THEN",
    ]);
    expect(ledger).toContain("IF NEW.movement NOT IN ('release', 'expire') THEN");
    expect(ledger).toContain("CONSTRAINT = 'credit_hold_request'");
    expect(ledger).toContain("CONSTRAINT = 'credit_hold_fefo'");
    expect(ledger).toContain("IF op.command IN ('withdraw_request', 'expire_requests', 'close_ineligible_request', 'send_request') THEN");
    expect(ledger).toContain("ELSIF op.command <> 'reject_request' THEN");
  });

  it('[PD-006][ADR-0037 §10] reversão do Fee: encerramentos da W21 ligados à Request e sem a K5; demais desfechos como na W19', () => {
    const reversal = added('function app.fee_charge_reversal_write()', [
      '  PERFORM app.assert_payments_active();',
      "  IF op.command NOT IN ('withdraw_request', 'reject_request', 'accept_request', 'expire_requests') THEN",
      [
        '  SELECT o.command, f.payment_id INTO fee_op, v_payment',
        '    FROM app.fee_charge f JOIN app.operation o ON o.id = f.operation_id WHERE f.id = NEW.fee_charge_id;',
      ],
      "  IF fee_op IS DISTINCT FROM 'send_request' THEN",
      'DECLARE op app.operation; fee_op text; v_payment uuid;',
      '  -- Desfechos pré-aceite do PD-006 nomeados na TECH-051/TECH-090; perda de elegibilidade entra com a W21.',
    ]);
    expect(reversal).toContain("'close_ineligible_request', 'send_request') THEN");
    expect(reversal).toContain('    PERFORM app.assert_payments_active();');
    expect(reversal).toContain("CONSTRAINT = 'billing_fee_reversal_origin'");
  });

  it('[TECH-110] invariantes: a consulta da W20 fica intacta e ganha as da Request', () => {
    const invariants = added('function app.luxchange_invariant_breaches()', [
      'DECLARE v_operation uuid;',
    ]);
    expect(invariants).toContain("invariant := 'PD-012/request';");
    expect(invariants).toContain("invariant := 'TECH-071/hold-without-request';");
  });

  it('[TECH-110] desfazer a W21 restaura exatamente o catálogo da W20', async () => {
    const subject = await createTestDatabase();
    try {
      for (const name of await migrationsFromNewest(FIRST_W21))
        await subject.pool.query(await migrationDown(name));
      expect(differences(w20Snapshot, await snapshot(subject))).toEqual([]);
    } finally {
      await subject.drop();
    }
  });
});
