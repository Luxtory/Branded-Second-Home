# Como separar agentes, aprovação humana e credenciais de produção no GitHub

Decisão: [ADR-0029](../adr/0029-governanca-do-repositorio-identidades-revisao-e-environment.md). Ameaças: T-1320 e
T-1323 em [`booking`](../security/threats/booking.md); secrets da CI em [`platform`](../security/threats/platform.md).

**Situação (2026-11-18):** passo 1 concluído (#97 → `5772c56`). Nada mais aplicado. Cada passo marcado *fundador*
exige aprovação específica dele; o agente só prepara PRs e confere por leitura. T-1320 e T-1323 só fecham com os
controles validados (seção final), não com este documento.

**Princípio da ordem:** nenhuma credencial nova enquanto um agente alcançar a conta administrativa, e nenhuma credencial
nova antes de a `main` exigir revisão humana. Do passo 2 ao passo 5, **nenhum merge na `main` além do #98** (evita
reatualizar o #98 com uma identidade que não pode mais alterar workflow).

## Estado conferido (2026-11-18)

- Conta dona `Luxtory` é **pessoal** (não organização); repositório público; único colaborador: `Luxtory` (`admin`).
- `main` sem proteção clássica (API: 404 "Branch not protected") e sem ruleset (`[]`); `.github/CODEOWNERS` na `main`
  desde `5772c56`, inerte até o passo 3.
- `DATABASE_URL_MIGRATIONS` (papel dono do schema) e `VERCEL_TOKEN` são secrets **do repositório** (desde 2026-09-26);
  na `main`, os jobs `migrate` e `deploy` ainda não usam `environment:` (muda com o #98). Os Environments `Preview` e
  `Production` foram criados pelo `vercel[bot]`, sem regras nem secrets.
- Canais dos agentes com a conta `Luxtory`: `gh` (token OAuth do GitHub CLI: `repo`, `workflow`, `gist`, `read:org`);
  `git push` pelo `gh` (*credential helper* em `~/.gitconfig`); **conector GitHub do ChatGPT/Codex**, autenticado como
  `Luxtory` com permissão administrativa (confirmado pelo fundador), com ferramentas de criar, atualizar, marcar pronto e
  mergear PR; Claude in Chrome no Chrome do fundador, com as sessões dele. Fora do GitHub: conectores Supabase
  (`execute_sql`) e Vercel de escrita (claude.ai e ChatGPT/Codex), MCP Upstash de gerência; `supabase-prod-read` só lê.
  **O fundador confere** (o agente não lista): chaves SSH, PATs, Git Credential Manager do Windows e apps autorizados.

### Exposição dos secrets de produção hoje

| Origem do workflow | Recebe os secrets? | Quem consegue |
|---|---|---|
| PR de fork | Não: o GitHub não entrega secrets a fork (só `GITHUB_TOKEN` de leitura); contribuidor de primeira vez precisa de aprovação (`first_time_contributors`) | ninguém |
| Branch do próprio repositório (push ou PR interno) | **Sim:** roda a versão do arquivo **da branch**; uma `ci.yml` alterada ou um workflow novo com `on: push` lê os dois secrets | quem tem push no repositório; por token, com escopo `workflow`. Hoje: a conta `Luxtory` e qualquer agente com o token dela |
| `main` | Sim | push direto de qualquer token da conta dona; `migrate` e `deploy` automáticos |

## Passo 1 — PR A: CODEOWNERS e documentação ✅

Mergeado: #97 → `5772c56` (CI da main verde). `.github/CODEOWNERS` com regra geral `*` e a cadeia crítica explícita.

## Passo 2 — identidade separada, por todos os canais (fundador)

1. Conta de máquina (o GitHub permite uma gratuita por pessoa), e-mail próprio, 2FA. Conta `Luxtory` com 2FA, de
   preferência passkey, usada só pelo fundador no navegador.
2. Convite da conta de máquina como colaboradora. Em repositório de conta pessoal, colaborador tem escrita e **não** é
   admin: não muda regras, Environments, secrets ou colaboradores e não aprova Environment em que não é revisor.
3. Token: PAT classic da conta de máquina, só o escopo `repo`, expiração de 90 dias. O fine-grained não serve: a
   documentação do GitHub lista como limitação contribuir em repositório onde o usuário é colaborador. Sem `workflow`,
   o GitHub recusa push que altere `.github/workflows/`.
4. Segregação. O que vale é a **revogação no lado do GitHub**: com os acessos da conta `Luxtory` revogados lá, cópias
   locais deixam de funcionar.

   | Canal | Ação | Conferência |
   |---|---|---|
   | `gh` e `git push` | `! gh auth login` com o PAT da conta de máquina; depois *Settings → Applications → Authorized OAuth Apps → GitHub CLI → Revoke* na conta `Luxtory` | agente: `gh api user --jq .login` = conta de máquina; `gh api repos/Luxtory/Branded-Second-Home --jq .permissions` com `admin: false` |
   | Conector GitHub do ChatGPT/Codex (`Luxtory`, admin) | desconectar nas configurações do ChatGPT e revogar o app em *Settings → Applications* (OAuth Apps e GitHub Apps); reconectar só com a conta de máquina, se necessário | fundador: conector desconectado ou mostrando a conta de máquina; app ausente na lista da conta `Luxtory` |
   | Claude in Chrome e outros navegadores automatizados | usar só num perfil do Chrome sem sessão da conta `Luxtory`; *Settings → Sessions*: encerrar sessões de navegadores usados por agentes | fundador |
   | Chaves SSH, PATs, Git Credential Manager, VS Code | remover chaves de máquinas de agentes; revogar PATs (classic e fine-grained) e as autorizações *Git Credential Manager*/*Visual Studio Code* que o fundador não usar; apagar a credencial `git:https://github.com` no Windows | fundador |
   | Fora do GitHub (recomendado) | conectores de escrita Supabase e Vercel e MCP Upstash também levam a produção sem a CI: para agentes, só leitura (`supabase-prod-read`) | decisão do fundador |

5. **Atrito conhecido:** sem `workflow`, a conta de máquina não altera workflow nem atualiza branch cujo merge traga
   mudança de workflow; nesses casos o fundador usa o navegador (*Update branch*, edição, merge) ou emite um token
   temporário com `workflow` e expiração curta.

## Passo 3 — rulesets da `main` (fundador)

Dois rulesets, importados em *Settings → Rules → Rulesets → New ruleset → Import a ruleset*. Os dois valem juntos; regra
repetida vale na versão mais restritiva (documentação do GitHub).

- **`main-checks`**, sem bypass para ninguém: sem exclusão nem force push; mudança só por PR, só squash; os cinco checks
  da `ci.yml` exigidos do app GitHub Actions (`integration_id` 15368: sem ele, quem tem escrita publica um *commit
  status* com o mesmo nome) e branch atualizada com a `main`.

  ```json
  {
    "name": "main-checks",
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
          "required_approving_review_count": 0,
          "dismiss_stale_reviews_on_push": false,
          "require_code_owner_review": false,
          "require_last_push_approval": false,
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

- **`main-revisao`**: 1 aprovação, revisão de *code owner* (o fundador), aprovação da última push e descarte de
  aprovação velha. Bypass só do papel *Repository admin* (`actor_id` 5, como o GitHub exporta) e **só por PR**: depois
  do passo 2 o único admin é o fundador, que assim integra PRs de autoria `Luxtory` (#98 e os legados) sem poder
  aprovar a si mesmo e sem escapar dos checks do `main-checks`.

  ```json
  {
    "name": "main-revisao",
    "target": "branch",
    "enforcement": "active",
    "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
    "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }],
    "rules": [
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
      }
    ]
  }
  ```

Validação, nesta ordem:

1. Fundador: a tela do `main-revisao` mostra *Repository admin — For pull requests only*; o `main-checks` não tem bypass.
2. Agente (conta de máquina): `gh api repos/Luxtory/Branded-Second-Home/rules/branches/main` lista `deletion`,
   `non_fast_forward`, `pull_request` e `required_status_checks`.
3. Agente: push direto de um commit vazio sobre a `main` → recusado (`GH013`). Se fosse aceito, a árvore seria a mesma
   (a CI só republicaria o mesmo código), e o ruleset seria revisto antes de seguir.
4. Fluxo real: o próximo PR da conta de máquina fica bloqueado (`REVIEW_REQUIRED`) até a aprovação do fundador; com a
   aprovação e os checks verdes, fica mergeável; um novo push da conta de máquina descarta a aprovação.
5. **Políticas de Actions** (configuração do repositório, não regra do ruleset): ligar *Require actions to be pinned to
   a full-length commit SHA* (todas as actions já estão fixadas); manter desligado *Allow GitHub Actions to create and
   approve pull requests*; aprovação de workflows de fork em `first_time_contributors` (ou mais restrita).

**Regras de operação:** o fundador não faz commit em PR da conta de máquina (a regra da última push exigiria outro
aprovador); atualizar a branch com a `main` pode descartar a aprovação; o bypass por PR é só para PR de autoria
`Luxtory` ou emergência, e fica registrado.

## Passo 4 — Environment `production-ci` e credenciais novas (fundador)

1. Inventário: `DATABASE_URL_MIGRATIONS` só é lido pelo job `migrate` (`scripts/db-migrate.mjs`); a aplicação usa
   `DATABASE_URL` (papel de aplicação) na Vercel; o `supabase-prod-read` usa usuário só leitura; `VERCEL_TOKEN` só é
   lido pelo job `deploy`. Fundador: confirme no gerenciador de senhas se há outro uso.
2. Crie o Environment `production-ci` e, **antes de qualquer secret**, defina *Deployment branches and tags* =
   *Selected branches and tags* com uma regra do tipo *branch* chamada `main`; sem revisores. Salve e pare.
3. Agente confere por leitura: `gh api repos/Luxtory/Branded-Second-Home/environments/production-ci` com
   `deployment_branch_policy` = `{protected_branches: false, custom_branch_policies: true}` e
   `…/environments/production-ci/deployment-branch-policies` com exatamente uma regra: `main`, tipo `branch`.
4. Só então os secrets do Environment: `PROD_VERCEL_TOKEN` (token **novo** da Vercel, escopo do time, expiração
   definida) e `PROD_DATABASE_URL_MIGRATIONS` (o valor atual, se guardado; senão, nova senha do papel, com a `main`
   congelada até o passo 5). Os secrets antigos ficam intactos. Agente confere só os nomes.

## Passo 5 — merge do #98 (fundador, no navegador)

**GO** só com todos: head do #98 igual ao auditado e atualizado com a `main`; CI do PR 5/5 verde; passos 2, 3 e 4
validados; secrets antigos do repositório ainda presentes (caminho de volta); nenhum run em andamento na `main`;
conferência somente leitura de Production igual à anterior; fundador disponível para acompanhar o run (~15 min).
**NO-GO** se qualquer item falhar, se a `main` andar ou se aparecer mudança não explicada em Environment ou secret.

O #98 é de autoria `Luxtory`: o fundador o integra pelo bypass por PR do `main-revisao`, com os checks do `main-checks`
satisfeitos (a tela de merge deve mostrar os checks verdes).

- **Sucesso** (run da `main` do merge): `migrate` (preflight + "Applied N / Pending 0") e `deploy` verdes, os dois com o
  Environment `production-ci`; Production READY no SHA; `GET /v1/version` = SHA; erros de runtime em 1 h = 0.
- **Falha e recuperação (Production nunca fica sem deployment):** `migrate` falha → `deploy` não roda e Production fica
  no deployment anterior. Corrija o secret do Environment e reexecute o job `migrate` desse run (o GitHub reexecuta junto
  o `deploy`, que depende dele). Se não bastar, use *Revert* no #98 pelo navegador e integre o PR de reversão: os jobs
  voltam aos secrets antigos, ainda presentes. Falha só no `pull`/`deploy` → corrija `PROD_VERCEL_TOKEN` e reexecute só
  o `deploy`. Falha no `build` (não esperada: o CLI 60.0.1 dispensa token no `build` com as configurações baixadas) →
  reversão. Nunca apague secret antigo durante uma falha.

## Passo 6 — retirar as credenciais antigas (fundador)

Só depois do sucesso do passo 5: apagar `DATABASE_URL_MIGRATIONS` e `VERCEL_TOKEN` do nível do repositório e revogar o
token antigo na Vercel. Agente confere `gh api repos/Luxtory/Branded-Second-Home/actions/secrets` vazio. Nada mais lê os
nomes antigos. A troca posterior da senha do banco muda só o secret do Environment; prova: reexecutar o job `migrate`
do último run da `main`.

## Passo 7 — PRs legados de autoria `Luxtory`

#28 (superado pelo #32), #86 e #87: decisão do fundador. Integrar exige atualizar com a `main`, checks verdes e o bypass
por PR; ou fechar. Nenhum é reescrito pelo agente.

## Fechamento de T-1320 e T-1323

- T-1320: depois da validação do passo 3 (itens 1 a 4) e do passo 6.
- T-1323: depois da conferência do passo 2 em todos os canais; na ativação, o Environment `booking-authorizer` com o
  fundador como único revisor e *Prevent self-review* ligado ([runbook do autorizador](autorizador-de-reservas.md) §5).
- As evidências entram num PR de documentação depois das validações.

## Histórico

- 2026-11-18, v1 (#97): PR B antes da identidade; ensaio do ruleset no sandbox; um ruleset sem bypass.
- 2026-11-18, v2 (auditoria do fundador, #98): identidade e revisão humana **antes** das credenciais novas, para que
  elas nunca fiquem ao alcance da conta administrativa dos agentes; dois rulesets (checks sem bypass; revisão com bypass
  por PR só do admin) para integrar PRs de autoria `Luxtory` sem reautoria nem bloqueio; ensaio no sandbox trocado pela
  validação no repositório real (commit vazio recusado e fluxo real), mais direta e reversível; token da Vercel só nos
  passos `pull` e `deploy`, pela variável de ambiente.
