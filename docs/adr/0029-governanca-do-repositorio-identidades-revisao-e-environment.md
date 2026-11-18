# 0029. Governança do repositório: identidade dos agentes, revisão obrigatória e Environment de produção

- **Date**: 2026-11-18
- **Status**: Proposed (PR draft de governança; aplicação operacional passo a passo com aprovação do fundador)
- **Deciders**: fundador (Luxtory)
- **Tags**: security, devsecops, ci-cd

## Context

Em 2026-11-18 (fechamento da W13 E5) o repositório público `Luxtory/Branded-Second-Home`, de conta **pessoal**, estava
assim: `main` sem proteção nem ruleset; único colaborador, a conta dona `Luxtory` (`admin`); agentes de IA operando com
o token do GitHub CLI dessa conta (`repo`, `workflow`) e com conectores próprios (Codex com merge de PR); secrets de
produção (`DATABASE_URL_MIGRATIONS`, papel dono do schema, e `VERCEL_TOKEN`) no nível do repositório, lidos por jobs sem
`environment:`. Consequências: qualquer agente aprova deployments da conta revisora (T-1323), faz push na `main`
(T-1320) e, com um workflow de branch, lê as credenciais de produção. A autorização independente da W13 (ADR-0027 §4)
depende de quem opera não ser quem aprova.

## Decision

1. **Identidades.** Os agentes usam uma conta de máquina colaboradora (escrita, sem admin), com PAT classic só `repo` e
   expiração de 90 dias; a conta `Luxtory` (dona, revisora, administradora de regras) fica só com o fundador, no
   navegador, com 2FA, e nenhum token dela fica em máquina de agente, conector ou perfil de navegador automatizado.
2. **Revisão obrigatória.** Ruleset na branch padrão: PR obrigatório com 1 aprovação, revisão de *code owner*,
   aprovação da última push, descarte de aprovação velha, só squash; checks `lint`, `typecheck`, `test`, `e2e` e
   `security` exigidos do app GitHub Actions (id 15368) e atualizados com a `main`; sem exclusão nem force push; sem
   bypass.
3. **CODEOWNERS** com regra geral `*` para o fundador e a cadeia crítica explícita, incluindo o próprio arquivo e a
   `ci.yml`.
4. **Secrets de produção** só no Environment `production-ci`, restrito à `main`, com nomes novos (`PROD_*`) para que o
   primeiro run prove as credenciais sem recair nas antigas; os secrets do repositório são apagados depois disso.
5. **Ordem:** PRs de autoria `Luxtory` entram antes do ruleset; identidade separada antes do ruleset; ensaio do ruleset
   no sandbox antes da `main`. Roteiro: [`governanca-do-repositorio.md`](../how-to/governanca-do-repositorio.md).

## Consequences

### Positive

- Nenhum agente aprova deployment, muda regra ou Environment, lê secret de produção ou integra código sem o fundador.
- Habilita *Prevent self-review* no Environment do autorizador (quem dispara ≠ quem aprova) e fecha T-1320/T-1323.
- A cadeia de deploy, migrations e autorizador só muda com revisão do fundador.

### Negative

- Todo PR espera a aprovação do fundador, também depois de atualizar a branch com a `main`.
- Mudança de workflow pede token temporário com `workflow` ou edição no navegador.
- PAT classic `repo` alcança todo repositório a que a conta de máquina tiver acesso: ela deve colaborar só aqui.

### Neutral / follow-ups

- Renovar o PAT e o token da Vercel antes da expiração.
- Conectores de escrita fora do GitHub (Supabase, Vercel, Upstash) também contornam a CI: para agentes, só leitura.

## Alternatives considered

**Token fine-grained:** recusado porque a documentação do GitHub lista como limitação contribuir em repositório onde o
usuário é colaborador, e a conta dona é pessoal. **GitHub App** (tokens de 1 h, permissões granulares): exige chave
privada na máquina e emissor de token, mais peças para o mesmo efeito com um único agente; reavaliar com mais agentes ou
repositórios. **Organização gratuita** (fine-grained, papéis): exige transferir o repositório e reconectar a Vercel, uma
mudança maior sem ganho imediato. **CODEOWNERS só com a cadeia do autorizador:** deixaria de fora a `ci.yml` e o próprio
CODEOWNERS; com dois escritores, `*` não custa nada a mais. **Reusar o Environment `Production`:** criado e usado pelo
`vercel[bot]`; um nome dedicado evita acoplar a regra de branch aos deployments da Vercel. **Mesmos nomes de secret no
Environment:** o secret do Environment tem precedência, mas não dá para provar o novo antes de apagar o antigo;
nomes novos tornam a prova o próprio run da `main`.

## References

- ADR-0027 §4 (autorização independente); ADR-0002 (plataforma).
- Ameaças: `docs/security/threats/booking.md` (T-1304, T-1320, T-1323), `docs/security/threats/platform.md`.
- GitHub Docs: *Managing your personal access tokens* (limitações do fine-grained); *Available rules for rulesets*;
  *Using environments for deployment*; *Re-running workflows and jobs*.
