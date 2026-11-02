import { sql } from 'kysely';
import type { JsonValue } from '../../domain/json';
import type { Database, DatabaseTransaction } from './connection';

/**
 * Claims de uma sessão cuja assinatura o servidor já verificou (ADR-0006 §6). Nunca claims vindas do navegador sem
 * verificação.
 */
export interface VerifiedClaims {
  readonly sub: string;
  readonly role: 'authenticated';
  readonly [claim: string]: JsonValue;
}

/**
 * Leitura de dados de usuário sob RLS (TECH-052): transação só de leitura em que o papel de aplicação vira
 * `authenticated` e as políticas enxergam as claims por `auth.uid()`/`auth.jwt()`. `SET LOCAL` e `set_config(…, true)`
 * valem só dentro da transação (Supavisor em modo transação).
 */
export async function withUserRead<T>(
  db: Database,
  claims: VerifiedClaims,
  read: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(tx);
    await sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`.execute(tx);
    await sql`SET LOCAL ROLE authenticated`.execute(tx);
    return read(tx);
  });
}

/**
 * Leitura em duas fases num único instantâneo (REPEATABLE READ, só leitura): `asUser` roda como `authenticated` sob a
 * RLS e prova a autorização (devolve `null` quando não há); depois o papel volta ao da aplicação e `asServer` lê, com o
 * autorizado em mãos, fatos que a RLS não expõe ao usuário (W12: janela, prévia, ativação). A mesma transação fecha a
 * janela entre provar a representação e ler os fatos; nada aqui escreve.
 */
export async function withUserThenServerRead<A, T>(
  db: Database,
  claims: VerifiedClaims,
  asUser: (tx: DatabaseTransaction) => Promise<A | null>,
  asServer: (tx: DatabaseTransaction, authorized: A) => Promise<T>,
): Promise<T | null> {
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .setAccessMode('read only')
    .execute(async (tx) => {
      await sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`.execute(
        tx,
      );
      await sql`SET LOCAL ROLE authenticated`.execute(tx);
      const authorized = await asUser(tx);
      await sql`RESET ROLE`.execute(tx);
      await sql`SELECT set_config('request.jwt.claims', '', true)`.execute(tx);
      if (authorized === null) return null;
      return asServer(tx, authorized);
    });
}
