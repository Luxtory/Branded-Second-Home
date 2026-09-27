# 0008. Autenticação e autorização administrativa

- **Date**: 2026-09-26
- **Status**: Accepted
- **Deciders**: Luxtory (decisões D-W2-1…4 do plano), Engenharia
- **Tags**: security, architecture, identity

## Context

O `03` fixa: Supabase Auth autentica e Admin/Super Admin exigem MFA (TECH-050); o guard de domínio autoriza, com a
cadeia `user → party_delegation → party → holding/Ação ou authorization_grant` (TECH-050/051); RLS protege leitura
(TECH-052); PostgREST/`supabase-js` não executam mutations e o navegador nunca recebe credencial privilegiada
(ADR-002). O plano (Wave 2) pede login por código, MFA TOTP, papéis de staff atribuídos por script auditado, guard que
nega por padrão, `authorization_grant`, CSRF por origem e autenticação de teste (ADR-0005 §7).

Fatos verificados em 2026-09-26: o Supabase Auth do projeto assina os JWT com chave **ES256** publicada no JWKS; o
projeto tem chave `sb_publishable_…`; o papel `postgres` tem ADMIN OPTION em `authenticated`. GoTrue e Supavisor não
rodam localmente (ADR-0005) e não há staging (ADR-0007).

## Decision

1. **Auth só no servidor.** Login, MFA e sessão usam `@supabase/ssr` em Server Actions, route handlers e no
   `proxy.ts` (renovação da sessão só em `/admin` e `/entrar`). O cliente do Supabase é exposto ao resto do código
   **só pelo namespace `.auth`**: nenhuma consulta a tabelas passa por ele. Cookies de sessão `httpOnly`, `Secure`,
   `SameSite=Lax`; o navegador não carrega `supabase-js`.
2. **Sessão verificada.** Identidade e nível de garantia (`sub`, `aal`) vêm de `getClaims()`, que verifica a
   assinatura ES256 pelo JWKS. Nada lido do cookie sem essa verificação decide acesso.
3. **Staff em `app.staff_role`**, papéis `admin` e `super_admin`, **sem hierarquia presumida**: o usuário pode ter os
   dois e o guard registra o papel exercido (D-W2-2). Atribuição e revogação só por funções do dono das tabelas
   (`app.assign_staff_role`, `app.revoke_staff_role`), executadas pelo runbook no SQL Editor; cada chamada grava
   `operation` + `audit_log` com a base informada. `luxtory_app` só lê.
4. **Guard que nega por padrão** implementa o `CommandGuard` da W1: autoridades de staff exigem sessão AAL2 e papel
   ativo aceito pela autoridade; `grantee` exige grant ativo da party que liste o command e cubra o escopo; os demais
   caminhos (Titular, sistema) negam até a wave que os constrói. Papéis e grants são lidos a cada command.
5. **`authorization_grant`** com comandos explícitos, escopo, vigência, concedente, base e revogação (sem `DELETE`).
   `grantee_party_id` sem FK até a W7 é **dívida transitória deliberada e fechada para falhas** (D-W2-1): gatilho no
   banco recusa grant sem `app.party` correspondente e a validação só aceita operações concedíveis (nenhuma na W2).
   Revogação operacional pela função `app.revoke_authorization_grant`, auditada.
6. **Registro de commands em duas partes.** `CRITICAL_COMMANDS` continua exatamente a tabela fechada do TECH-051; as
   operações não críticas do REQ-095 (W2: `grant_authorization`) ficam num registro separado, composto no registro do
   executor, com o mesmo guard, idempotência e auditoria.
7. **Leituras de usuário sob RLS**: `luxtory_app` é membro de `authenticated` com `SET TRUE, INHERIT FALSE`; cada
   leitura roda em transação com `SET LOCAL ROLE authenticated` + claims verificadas (ADR-0006 §6). Papéis e grants
   não são legíveis por `anon` nem `authenticated`. Leitura administrativa grava `audit_log` `admin_read` (TECH-092).
8. **CSRF por origem** (TECH-100): Server Actions já comparam `Origin` e `Host`; os `POST` de `/v1` exigem `Origin`
   igual ao host do request (403 caso contrário). `SameSite=Lax` completa a defesa.
9. **Ambientes** (D-W2-3): Auth real só com `VERCEL_ENV=production` enquanto a D3 estiver adiada; em Preview e
   Development da Vercel a recusa ocorre quando o Auth é usado (o build não depende das variáveis). Autenticação de
   teste (`AUTH_MODE=test`: código e TOTP determinísticos, JWT HS256 com chave aleatória por processo) só local e na
   CI, recusada quando `VERCEL_ENV` existe.
10. **Chave pública validada**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` precisa ter o formato `sb_publishable_…`; a
    chave `anon` legada e chaves secretas são recusadas como configuração inválida.

## Consequences

### Positive

- Nenhuma credencial privilegiada nem SDK de dados no navegador; mutations continuam só pelo executor (ADR-002).
- Revogar papel ou grant tem efeito no command seguinte, sem esperar o JWT expirar.
- Um só guard para commands críticos e operações não críticas; cada autorização vira `authorization_ref` na
  `operation`.

### Negative

- Login e MFA reais só são provados em Production depois do merge (sem staging, sem GoTrue local).
- O SMTP padrão do Supabase só envia a membros da organização e com limite baixo por hora, até a decisão D4.
  **Resolvido em 2026-09-27**: D4 → Resend (SMTP customizado do Supabase Auth); a restrição deixou de valer.
- Sessão continua válida até o JWT expirar para o que não passa pelo guard (ex.: navegação sem command); o layout do
  Admin relê os papéis a cada request.

### Neutral / follow-ups

- W7: FK validada de `grantee_party_id`, fim do gatilho transitório, caminho do Titular no guard.
- Revogação de grant por API e telas de grants quando houver a primeira operação concedível.

## Alternatives considered

**Papel de staff como claim do JWT (Custom Access Token Hook).** Evita consulta ao banco, mas a revogação só valeria na
expiração do token e a fonte de verdade sairia do PostgreSQL (ADR-001). Rejeitada.

**Super Admin como superconjunto do Admin.** Simplifica, mas presume uma regra que o `03` não escreve (a tabela do
TECH-051 distingue "Admin" de "Admin ou Super Admin"). Rejeitada (D-W2-2).

**Login e MFA no navegador com `createBrowserClient`.** Padrão comum, mas leva `supabase-js` e tokens legíveis por
script ao navegador. Rejeitada: tudo passa por Server Actions.

**Adiar `authorization_grant` para a W7.** Tiraria o REQ-014 da W2 e deixaria o guard sem o caminho de parceiros.
Rejeitada em favor da dívida transitória fechada para falhas.

## References

- Related ADRs: [ADR-0005](0005-testes-com-postgresql-real-sem-docker.md), [ADR-0006](0006-acesso-a-dados.md),
  [ADR-0007](0007-ambientes-pre-lancamento-sem-staging.md)
- `docs/specs/identity.md`, `docs/specs/admin.md`
- `03`: TECH-050, TECH-051, TECH-052, TECH-092, TECH-100, ADR-002. `02`: REQ-014, REQ-095.
