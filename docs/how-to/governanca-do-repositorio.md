# Como separar agentes, aprovação humana e credenciais de produção no GitHub

Decisão: [ADR-0029](../adr/0029-governanca-do-repositorio-identidades-revisao-e-environment.md). Ameaças: T-1320 e
T-1323 em [`booking`](../security/threats/booking.md); secrets da CI em [`platform`](../security/threats/platform.md).

**Nada deste roteiro está aplicado (2026-11-18).** Cada passo marcado *fundador* exige aprovação específica dele; o
agente só prepara PRs e confere por leitura. Faça na ordem: os PRs de autoria `Luxtory` precisam entrar antes do
ruleset, porque o autor não aprova o próprio PR quando a revisão de *code owner* é obrigatória.

## Estado conferido (2026-11-18)

- Conta dona `Luxtory` é **pessoal** (não organização); repositório público; único colaborador: `Luxtory` (`admin`).
- `main` sem proteção clássica (API: 404 "Branch not protected") e sem ruleset (`[]`).
- `DATABASE_URL_MIGRATIONS` (papel dono do schema) e `VERCEL_TOKEN` são secrets **do repositório** (desde 2026-09-26);
  os jobs `migrate` e `deploy` não usam `environment:`. Os Environments `Preview` e `Production` foram criados pelo
  `vercel[bot]` (deployments de setembro), sem regras nem secrets.
- Canais dos agentes nesta máquina: `gh` com token OAuth do GitHub CLI da conta `Luxtory` (escopos `repo`, `workflow`,
  `gist`, `read:org`); `git push` usa o `gh` como *credential helper* (`~/.gitconfig`); Codex com conector GitHub
  (criar, atualizar, marcar pronto e **mergear** PR), conector Supabase (`execute_sql`) e Vercel; Claude Code com
  conectores Supabase e Vercel de escrita, MCP Upstash de gerência e `supabase-prod-read` (só leitura); Claude in
  Chrome atua no Chrome do fundador, com as sessões dele. **O fundador confere** (o agente não lista): chaves SSH e PATs
  da conta, Git Credential Manager do Windows e *Settings → Applications* (OAuth Apps e GitHub Apps autorizados).

### Exposição dos secrets de produção hoje

| Origem do workflow | Recebe os secrets? | Quem consegue |
|---|---|---|
| PR de fork | Não: o GitHub não entrega secrets a fork (só `GITHUB_TOKEN` de leitura); contribuidor de primeira vez precisa de aprovação (`first_time_contributors`) | ninguém |
| Branch do próprio repositório (push ou PR interno) | **Sim:** roda a versão do arquivo **da branch**; uma `ci.yml` alterada ou um workflow novo com `on: push` lê os dois secrets | quem tem push no repositório; por token, com escopo `workflow`. Hoje: a conta `Luxtory` e qualquer agente com o token dela |
| `main` | Sim | push direto de qualquer token da conta dona; `migrate` e `deploy` automáticos |

## Passo 1 — PR A: CODEOWNERS e esta documentação

`.github/CODEOWNERS` com regra geral `*` e a cadeia crítica explícita (o próprio arquivo, `ci.yml`, workflow e
programa do autorizador, `db-migrate`, `package.json`, lockfile, `.npmrc`, `vercel.json`, `migrations/`, CA). Inerte até
o passo 4. Merge com autorização do fundador, sem pré-requisito.

## Passo 2 — PR B: secrets de produção num Environment só da `main`

1. **Inventário.** `DATABASE_URL_MIGRATIONS` só é lido pelo job `migrate` (`scripts/db-migrate.mjs`); a aplicação usa
   `DATABASE_URL` (papel de aplicação) na Vercel; o `supabase-prod-read` usa usuário só leitura. `VERCEL_TOKEN` só é
   lido pelo job `deploy`. *Fundador:* confirme no gerenciador de senhas se há outro uso das duas credenciais.
2. *Fundador* cria o Environment **`production-ci`**: *Deployment branches and tags* = *Selected branches*, uma regra do
   tipo *branch* com o nome `main`; sem revisores (o merge já passa pela aprovação dele; ligar é opcional). Secrets do
   Environment, com **nomes novos**:
   - `PROD_VERCEL_TOKEN`: token **novo** da Vercel (escopo do time, expiração definida, lembrete de renovação);
   - `PROD_DATABASE_URL_MIGRATIONS`: o valor atual, se estiver guardado; senão, nova senha do papel (veja 6).
   Os secrets antigos ficam intactos.
3. *Agente* confere por leitura: `gh api repos/Luxtory/Branded-Second-Home/environments/production-ci` (regra de
   branch) e `…/environments/production-ci/secrets` (só os nomes).
4. *Fundador* autoriza o merge do PR B. Os dois jobs passam a declarar `environment: production-ci` e a ler **só** os
   nomes novos. Como os nomes diferem dos antigos, não há recaída silenciosa no secret do repositório: o primeiro run
   da `main` prova as credenciais novas, nos dois jobs.
5. **Sucesso** (run da `main` do merge): jobs `migrate` e `deploy` verdes, ambos com o Environment `production-ci`;
   `migrate` com o preflight `dbmate status` e "Applied N / Pending 0" (sem migration nova); deployment Production
   READY no SHA do merge; `GET /v1/version` = SHA; erros de runtime em 1 h = 0.
6. **Falha e recuperação (sem indisponibilidade).** `migrate` falha (secret ausente ou errado, regra de branch) →
   `deploy` não roda (depende dele) e Production continua no deployment anterior. Corrija o secret do Environment e
   reexecute o job `migrate` desse run (o GitHub reexecuta junto o `deploy`, que depende dele; confira pelos
   *attempts*). Se a primeira correção não bastar, reverta o PR B: os jobs voltam aos secrets antigos, ainda
   existentes. Falha só no `deploy` → corrija `PROD_VERCEL_TOKEN` e reexecute só o `deploy`. Nunca apague secret antigo
   durante uma falha. Se o valor do banco não estiver guardado: congele merges, gere a nova senha do papel, grave-a só
   no secret novo e faça o merge do PR B em seguida (o secret antigo deixa de funcionar, mas nada mais o usa depois do
   merge; um merge intermediário teria `migrate` vermelho, sem deploy).
7. *Fundador*, só depois de 5 verde: apaga `DATABASE_URL_MIGRATIONS` e `VERCEL_TOKEN` do nível do repositório e revoga
   o token antigo na Vercel. Conferência: `gh api repos/Luxtory/Branded-Second-Home/actions/secrets` vazio. Nenhum run
   precisa ser repetido, porque nada mais lê os nomes antigos. A troca posterior da senha do banco (se 2 reutilizou o
   valor) muda só o secret do Environment; prova: reexecutar o job `migrate` do último run da `main`.

## Passo 3 — identidade separada para os agentes

1. *Fundador:* conta de máquina (o GitHub permite uma gratuita por pessoa), e-mail próprio, 2FA. Conta `Luxtory` com
   2FA, de preferência passkey, usada só no navegador.
2. *Fundador* convida a conta de máquina como colaboradora. Em repositório de conta pessoal, colaborador tem escrita e
   **não** é admin: não muda regras, Environments, secrets ou colaboradores e não aprova Environment em que não é
   revisor.
3. **Token:** PAT classic da conta de máquina, só o escopo `repo`, expiração de 90 dias. O token fine-grained não serve:
   a documentação do GitHub lista como limitação contribuir em repositório onde o usuário é colaborador. O limite
   efetivo é o papel da conta (escrita), não o escopo. Sem `workflow`, o GitHub recusa push que altere
   `.github/workflows/`; quando um PR precisar mudar workflow, o fundador emite um token temporário com `workflow`
   (expiração curta) ou aplica a mudança no navegador.
4. *Fundador* troca o login nesta máquina, sem mostrar o token ao agente: `! gh auth login` (colar o token da conta de
   máquina). O `git push` passa junto, porque usa o `gh`. O Codex desta máquina usa o mesmo `gh`.
5. *Fundador*, outros canais: reconectar (ou desconectar) o conector GitHub do Codex com a conta de máquina; usar o
   Claude in Chrome só num perfil do Chrome **sem** sessão da conta `Luxtory`; para agentes, manter só leitura em
   Supabase (`supabase-prod-read`) e desligar os conectores de escrita (Supabase, Vercel) e o MCP Upstash quando não
   forem necessários, porque também contornam a CI.
6. *Fundador* revoga os acessos da conta `Luxtory` usados por agentes: *Settings → Applications → Authorized OAuth Apps
   → GitHub CLI → Revoke* (revoga o `gh` dessa conta em todas as máquinas); revisa chaves SSH, PATs, Git Credential
   Manager do Windows e apps autorizados, mantendo só o que ele usa no navegador.
7. *Agente* confere: `gh api user --jq .login` = conta de máquina; `gh api repos/Luxtory/Branded-Second-Home --jq
   .permissions` com `admin: false`, `push: true`.

## Passo 4 — ruleset da `main`

1. **PRs abertos de autoria `Luxtory`** (#28, #86, #87): decidir antes, porque depois o fundador não aprova o próprio PR.
   Caminhos sem reescrever commits: mergear antes do ruleset (depois de atualizado e verde) ou, depois, a conta de
   máquina abre um PR novo da mesma branch e o fundador fecha o antigo.
2. **Ensaio no sandbox** `Luxtory/luxtory-e5-authorizer-sandbox`, antes de apagá-lo: mesmo ruleset; workflow trivial com
   jobs `lint`, `typecheck`, `test`, `e2e` e `security`; a conta de máquina abre um PR → `BLOCKED`; push direto na
   `main` → recusado; aprovação do fundador → mergeável; novo push da conta de máquina → aprovação descartada; merge
   pela conta de máquina só com tudo satisfeito.
3. *Fundador* importa o ruleset na `main` (*Settings → Rules → Rulesets → New ruleset → Import a ruleset*):

   ```json
   {
     "name": "main-protegida",
     "target": "branch",
     "enforcement": "active",
     "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
     "bypass_actors": [],
     "rules": [
       { "type": "deletion" },
       { "type": "non_fast_forward" },
       {
         "type": "pull_request",
         "parameters": {
           "required_approving_review_count": 1,
           "dismiss_stale_reviews_on_push": true,
           "require_code_owner_review": true,
           "require_last_push_approval": true,
           "required_review_thread_resolution": false,
           "allowed_merge_methods": ["squash"]
         }
       },
       {
         "type": "required_status_checks",
         "parameters": {
           "strict_required_status_checks_policy": true,
           "do_not_enforce_on_create": false,
           "required_status_checks": [
             { "context": "lint", "integration_id": 15368 },
             { "context": "typecheck", "integration_id": 15368 },
             { "context": "test", "integration_id": 15368 },
             { "context": "e2e", "integration_id": 15368 },
             { "context": "security", "integration_id": 15368 }
           ]
         }
       }
     ]
   }
   ```

   O `integration_id` 15368 é o app GitHub Actions, de onde vêm os cinco checks da `ci.yml`: sem ele, quem tem escrita
   publica um *commit status* com o mesmo nome e satisfaz o check. O PR obrigatório já impede push direto.
4. **Políticas de Actions** (configuração do repositório, não regra do ruleset): ligar *Require actions to be pinned to
   a full-length commit SHA* (todas as actions já estão fixadas); manter desligado *Allow GitHub Actions to create and
   approve pull requests*; aprovação de workflows de fork em `first_time_contributors` (ou mais restrita).
5. **Prova no repositório real:** o primeiro PR da conta de máquina fica `BLOCKED` até a aprovação do fundador;
   `gh api repos/Luxtory/Branded-Second-Home/rules/branches/main` lista as quatro regras.

**Regras de operação:** o fundador não faz commit em PR (a regra da última push exigiria outro aprovador); atualizar a
branch com a `main` descarta a aprovação e pede outra; sem bypass: em emergência, o fundador desativa o ruleset, e o
desligamento fica no histórico.

## Depois — configuração real do autorizador

Fora deste roteiro: [runbook do autorizador](autorizador-de-reservas.md) §5, passos 2 a 6 (Environment
`booking-authorizer` com o fundador como revisor, só `main`, *Prevent self-review* ligado; a conta de máquina dispara).
