# Como separar agentes, aprovação humana e credenciais de produção no GitHub

Decisão: [ADR-0029](../adr/0029-governanca-do-repositorio-identidades-revisao-e-environment.md). Ameaças: T-1320 e
T-1323 em [`booking`](../security/threats/booking.md); secrets da CI em [`platform`](../security/threats/platform.md).

**Situação (2026-11-18):** passo 1 concluído (#97 → `5772c56`). Nada mais aplicado. Cada passo marcado *fundador*
exige aprovação específica dele; o agente só prepara PRs e confere por leitura. T-1320 e T-1323 só fecham com os
controles validados (seção final), não com este documento. Passo 2 com GO do fundador (2026-11-18, execução
assistida); passos 3 a 5 e o merge do #98 seguem sem autorização.
**v4 (2026-11-18, decisão definitiva do fundador): identidade única `Luxtory`**, sem segunda conta. A seção
[v4](#v4--identidade-única-luxtory-vigente) prevalece sobre os passos 2, 3, 5 e 7 onde divergir; o texto deles fica
como histórico. Nada da v4 foi aplicado.

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

## v4 — identidade única `Luxtory` (vigente)

**Decisão do fundador (2026-11-18):** sem segunda conta, e-mail ou conta de automação; `Luxtory` é a única identidade.
Sem aprovação humana independente, impossível com uma conta só: a `main` exige PR, os cinco checks verdes do GitHub
Actions e squash, e recusa push direto, exclusão e force push (só o `main-checks` do passo 3, sem bypass). O Environment
`production-ci` restrito à `main` e a migração dos secrets seguem os passos 4 a 6. Custo zero, nada novo para manter
além da renovação do token.

**Credencial limitada para os agentes:** token *fine-grained* da própria conta `Luxtory`. O usuário continua admin, mas
cada chamada fica limitada às permissões do token: sem *Administration*, *Secrets* e *Deployments*, os agentes não
alteram rulesets, Environments, secrets ou configurações e não aprovam deployment. No repositório da própria conta o
fine-grained funciona (a limitação da documentação vale para colaborador), e o `gh` 2.46 aceita token sem cabeçalho de
escopos (`HeaderHasMinimumScopes` retorna sem checar; conferido no código-fonte da v2.46.0). O fluxo de trabalho não
muda: push, PR, merge, reexecução de job e leitura da CI.

| Permissão do repositório | Acesso | Para quê |
|---|---|---|
| Contents | leitura e escrita | push de branch e merge de PR |
| Pull requests, Issues | leitura e escrita | criar, atualizar e comentar |
| Workflows | leitura e escrita | PR que altera `.github/workflows/`; omitir não protegeria, porque os checks rodam scripts do `package.json`, que *Contents* já altera |
| Actions | leitura e escrita | runs, logs e reexecução de job; ler o Environment e a regra de branch dele |
| Checks, Commit statuses, Environments | leitura | estado da CI; só os nomes dos secrets do Environment |
| Metadata | leitura | obrigatória; lê rulesets e regras da branch |
| Administration, Secrets, Deployments, Variables, Webhooks e as demais | sem acesso | — |

Repositórios: só os da conta em que os agentes trabalham. Expiração: 90 dias; renovar é repetir a ação 1.

**Sequência mínima (o fundador executa cada ação com autorização própria; o agente só confere por leitura):**

1. **Token dos agentes.** *Settings → Developer settings → Personal access tokens → Fine-grained tokens*, nome
   `agentes-luxtory`, permissões da tabela. Num terminal WSL separado (não pelo `!` do Claude Code):
   `gh auth login --hostname github.com --git-protocol https`, colando o token na entrada oculta (Git: Yes). Em
   seguida, em *Settings → Applications → Authorized OAuth Apps*, revogar **GitHub CLI** (encerra o token
   administrativo antigo do `gh`) e **Git Credential Manager**, se aparecer; apagar PATs classic sem uso; em *Installed
   GitHub Apps*, conferir que o conector do ChatGPT/Codex não tem *Administration* (se tiver, desinstalar).
   *Agente:* `gh auth status 2>&1 | grep -v -i token` → `Luxtory`;
   `gh api repos/Luxtory/Branded-Second-Home/actions/permissions` → 403 (sem *Administration*);
   `gh api repos/Luxtory/Branded-Second-Home/actions/secrets` → 403 (sem *Secrets*);
   `git push --dry-run origin HEAD:refs/heads/verificacao-token` → autentica sem enviar nada.
2. **Ruleset `main-checks`** (JSON do passo 3; o `main-revisao` sai): *Settings → Rules → Rulesets → New ruleset →
   Import a ruleset*. Opcional na mesma visita: política de Actions do item 8 da validação (pinning por SHA).
   *Agente:* `gh api repos/Luxtory/Branded-Second-Home/rules/branches/main` → `deletion`, `non_fast_forward`,
   `pull_request` (0 aprovações, só squash) e `required_status_checks` (cinco checks, `integration_id` 15368, strict);
   `…/rulesets/<id> --jq .current_user_can_bypass` → `never`. Nenhum push de teste na `main` real: o fluxo do #98
   (checks exigidos na tela de merge) é a prova de uso.
3. **Environment `production-ci` e secrets novos:** passo 4, itens 2 a 4, sem mudança (regra de branch `main` conferida
   pelo agente antes dos secrets).
4. **Merge do #98:** passo 5, mas merge comum (checks verdes, sem aprovação e sem bypass), pelo navegador ou pelo agente
   com autorização específica.
5. **Credenciais antigas:** passo 6; o fundador confere na tela os secrets do repositório vazios (o token dos agentes
   não lê secrets).

Depois da ação 5, desenvolvimento normal. Sem o congelamento geral da `main` do "princípio da ordem": o token dos agentes
altera workflow, então o #98 pode ser atualizado se a `main` andar. Fica só o congelamento do passo 4 quando a senha do
banco for trocada antes do merge.

**Recuperação:** o fundador entra como `Luxtory` no navegador, com 2FA e meio de recuperação fora do PC (confirmado em
2026-11-18). Ruleset errado: editar ou desligar na tela, com efeito imediato. Falha no primeiro run da `main` com o
Environment: passo 5 (Production fica no deployment anterior; os secrets antigos só saem no passo 6). Token vazado ou
vencido: revogar e repetir a ação 1.

**Riscos aceitos (registrados, sem controle novo):**

- Sem revisão independente, um agente pode integrar o próprio PR com checks verdes, e um PR pode alterar workflow ou
  scripts para passar sem testar nada; esse código roda o `migrate` com o secret do Environment. A fronteira é "toda
  mudança em produção passa por PR, CI verde e histórico". O fundador revisa a cadeia crítica (`.github/`, migrations,
  autorizador) antes do merge.
- A conta `Luxtory` segue admin: o token limitado tira dos agentes a mudança de controles pelo `gh` e pelo `git`, mas
  não de canais com a sessão do fundador (Claude in Chrome no perfil principal: não liberar `github.com` para a
  extensão; conectores do ChatGPT/Codex).
- Fora do GitHub, os conectores de escrita do Supabase e da Vercel (claude.ai, ChatGPT/Codex) e o MCP de gerência do
  Upstash chegam a produção sem a CI. Opcional, sem custo: desconectá-los (o agente perde a leitura de erros da Vercel).
- Autorizador (K1/K2, fechados): com uma só conta, quem dispara e quem aprova o Environment `booking-authorizer` são a
  mesma identidade, e o *Prevent self-review* bloquearia o próprio fundador. O token sem *Deployments* impede o agente de
  aprovar, mas T-1323 precisa de decisão própria antes de qualquer ativação.

**Sai do plano:** segunda conta e itens 2.2 a 2.7 (o 2.1 foi cumprido); `main-revisao`, regras de operação da última
push e ensaio no sandbox (um ruleset sem bypass, reversível na tela, sem tocar produção; a leitura das regras e o fluxo
do #98 bastam); PR "[NÃO INTEGRAR]"; passo 7 (os PRs legados seguem o fluxo comum ou são fechados). O sandbox deixa de
ser necessário; apagá-lo é decisão do fundador.

## Passo 1 — PR A: CODEOWNERS e documentação ✅

Mergeado: #97 → `5772c56` (CI da main verde). `.github/CODEOWNERS` com regra geral `*` e a cadeia crítica explícita.

## Passo 2 — identidade separada, por todos os canais (fundador)

> **v4:** substituído pela [identidade única](#v4--identidade-única-luxtory-vigente). O 2.1 foi cumprido; os itens 2.2
> a 2.7 ficam como histórico.

**GO do fundador (2026-11-18)** para a execução assistida: o fundador executa cada ação; o agente só confere por leitura
e registra. Nenhuma credencial é revogada ou alterada pelo agente.

**Resultado:** agentes só com a conta de máquina (escrita, sem admin, PAT classic com expiração); a conta `Luxtory` só
com o fundador, no navegador, com 2FA; nenhum canal de escrita em produção (GitHub, Supabase, Vercel, Upstash) ao alcance
de agentes. O que encerra um acesso é a **revogação no provedor**: trocar o `gh auth login` não desliga os outros canais,
e as cópias locais de uma credencial morrem quando ela é revogada lá.

**Tokens nunca aparecem** em terminal, prompt, log ou conversa: o fundador gera o token no navegador e o cola só em
entrada oculta. Token exposto → revogar e gerar outro.

Ordem: cada item só começa com a verificação do anterior ✅. Até o passo 3, a `main` continua aceitando push de quem tem
escrita: agentes não fazem push na `main` (regra já vigente), e o passo 3 fecha essa janela.

**2.1 Caminho de recuperação, antes de qualquer revogação (fundador).** Conta `Luxtory`: 2FA com pelo menos dois métodos
(passkey ou chave física, mais app autenticador), códigos de recuperação baixados e guardados fora deste PC, e-mail
principal acessível só ao fundador e não conectado a agentes. 2FA também nas contas Vercel, Supabase e Upstash. Admin
por linha de comando, se um dia for necessário: token curto, criado na hora, num terminal sem agentes, revogado em
seguida; nunca um token administrativo permanente.
*Verificação (fundador):* *Settings → Password and authentication* mostra o 2FA ativo e os métodos; login numa janela
anônima com a passkey funciona.

**2.2 Conta de máquina (fundador, janela anônima).** Criar `<conta-de-máquina>` (o GitHub permite uma conta de máquina
gratuita por pessoa), com e-mail próprio controlado pelo fundador e 2FA (autenticador no celular dele; códigos de
recuperação com ele, fora deste PC).
*Verificação (agente):* `gh api users/<conta-de-máquina> --jq '{login,type}'` → `"type": "User"`.

**2.3 Convite (fundador).** Como `Luxtory`, no repositório: *Settings → Collaborators → Add people*. Aceitar na janela
anônima da conta de máquina. Em repositório de conta pessoal, colaborador tem escrita e **não** é admin: não muda regras,
Environments, secrets ou colaboradores e não aprova Environment em que não é revisor.
*Verificação (agente, ainda com o token atual):* `gh api repos/Luxtory/Branded-Second-Home/collaborators --jq
'.[]|[.login,.role_name]|@tsv'` → `Luxtory admin` e `<conta-de-máquina> write`, mais ninguém.

**2.4 Token (fundador, mesma janela anônima).** *Settings → Developer settings → Personal access tokens → Tokens
(classic) → Generate new token (classic)*: nota `agentes-luxtory`, expiração de 90 dias, escopos **só `repo` e
`read:org`**. O `gh` 2.46 recusa token sem os dois (`HeaderHasMinimumScopes`, conferido no código-fonte); `read:org` só
lê organizações, e a conta não pertence a nenhuma. Sem `workflow` (o GitHub recusa push que altere
`.github/workflows/`), `gist`, `admin:*` ou `delete_repo`. O fine-grained não serve: a documentação do GitHub lista como
limitação contribuir em repositório onde o usuário é colaborador. Não salvar o token em arquivo nem no navegador: seguir
direto para o 2.5 e fechar a janela anônima depois dele.

**2.5 Troca no `gh` (fundador, num terminal WSL separado, não pelo `!` do Claude Code).**

```bash
gh auth login --hostname github.com --git-protocol https   # "Paste an authentication token" (entrada oculta); Git: Yes
gh auth logout --hostname github.com --user Luxtory        # apaga deste WSL o token da conta Luxtory
```

*Verificação (agente):*

```bash
gh auth status 2>&1 | grep -v -i 'token:'                    # só <conta-de-máquina>; escopos 'read:org', 'repo'
gh api repos/Luxtory/Branded-Second-Home --jq .permissions   # admin false, maintain false, push true
gh api repos/Luxtory/Branded-Second-Home/collaborators/<conta-de-máquina>/permission --jq .role_name   # write
gh api repos/Luxtory/Branded-Second-Home/hooks               # 404: só admin lista webhooks
git push --dry-run origin HEAD:refs/heads/verificacao-identidade   # autentica a escrita; nada é enviado
```

Em seguida o agente troca `user.name` e `user.email` do Git para a conta de máquina (e-mail `noreply` do GitHub).

**2.6 Revogação na conta `Luxtory` (fundador, navegador principal; só depois do 2.5 ✅).**

| Tela da conta `Luxtory` | Revogar | Manter |
|---|---|---|
| *Settings → Applications → Authorized OAuth Apps* | GitHub CLI, Git Credential Manager, Visual Studio Code e qualquer app usado por agente | apps com que o fundador entra em outros serviços (ex.: Vercel, Supabase) |
| *Installed GitHub Apps* e *Authorized GitHub Apps* | conectores de agentes (ChatGPT/Codex, Claude e similares): desinstalar e revogar | Vercel |
| *Developer settings → Personal access tokens* (classic e fine-grained) | todos | — |
| *SSH and GPG keys* | todas as chaves SSH | chaves GPG (só assinam) |
| *Sessions* | sessões fora do navegador principal do fundador | a sessão atual |

No Windows, *Gerenciador de Credenciais → Credenciais do Windows*: remover `git:https://github.com` e outras entradas do
GitHub.
*Verificação:* fundador: cada tela no estado da coluna "Manter" e, em *Settings → Security log*, os eventos de revogação
do dia. Agente: `gh auth status` segue só com a conta de máquina. Chaves de deploy no repositório: 0 (conferido em
2026-11-18).

**2.7 Canais fora do GitHub (fundador).** Para agentes, nenhum canal de escrita em produção; leitura continua.

| Canal | Ação | Verificação |
|---|---|---|
| ChatGPT/Codex | *Settings → Apps/Connectors*: desconectar GitHub, Supabase, Vercel e qualquer outro conector de escrita; no Codex, desconectar o GitHub | fundador: conectores ausentes |
| claude.ai (alimenta o Claude Code) | *Settings → Connectors*: desconectar Supabase e Vercel | agente, em sessão nova: sem ferramentas `claude_ai_Supabase` e `claude_ai_Vercel` |
| Upstash | `! claude mcp remove upstash -s user`; apagar o bloco `[mcp_servers.upstash]` de `~/.codex/config.toml`; no console, apagar a chave da Management API usada pelo Codex e a autorização do MCP hospedado. **Não** mexer no token REST do banco que a aplicação usa na Vercel | agente, em sessão nova: sem ferramentas `upstash`; fundador: chave ausente no console |
| Claude in Chrome | remover a extensão do perfil principal do Chrome, ou usá-la só num perfil sem sessões de GitHub, Vercel, Supabase e Upstash | fundador: `chrome://extensions` do perfil principal; agente: nenhum navegador conectado, ou só o perfil dedicado |
| CLIs da Vercel e do Supabase, se logados neste PC (WSL ou Windows) | `vercel logout` e `supabase logout`; revogar no painel os tokens restantes ligados a este PC ou a agentes | fundador: listas de tokens sem esses itens |
| Mantidos | `supabase-prod-read` (MCP hospedado com `read_only=true`, projeto fixo, recursos `database,docs`), `context7`, `playwright` (navegador próprio, sem sessões) | — |

Custo aceito: sem o conector da Vercel, a conferência depois de um merge usa os logs do job `deploy` no GitHub e os
endpoints públicos `/v1/version` e `/v1/health`; erros de runtime e o limitador no Upstash ficam com o fundador, nos
painéis.

**Atrito conhecido:** sem `workflow`, a conta de máquina não altera workflow nem atualiza branch cujo merge traga
mudança de workflow; nesses casos o fundador usa o navegador (*Update branch*, edição, merge) ou emite um token
temporário com `workflow` e expiração curta.

### Evidências para concluir o passo 2

Registradas pelo agente, sem token, e-mail ou captura de tela no repositório público:

- **E1** `gh auth status`: só `<conta-de-máquina>`, escopos `read:org` e `repo`, sem `workflow`.
- **E2** `.permissions` com `admin: false`, `maintain: false`, `push: true`; papel `write`; webhooks → 404.
- **E3** colaboradores: `Luxtory` (admin) e `<conta-de-máquina>` (write), mais ninguém.
- **E4** fundador confirma 2.1, 2.6 e 2.7 tela a tela, com os eventos do *Security log*.
- **E5** sessão nova do Claude Code sem ferramentas de escrita de Supabase, Vercel e Upstash; Claude in Chrome fora do
  perfil principal.
- **E6** `git push --dry-run` autentica como a conta de máquina; `user.name` e `user.email` da conta de máquina.

**Riscos residuais (registrados, sem controle novo):** o PAT da conta de máquina fica neste WSL, ao alcance dos agentes
(é o propósito), e vale para todo repositório que ela alcançar: colaborar só aqui e no sandbox durante o ensaio. Agentes
rodam com o usuário do sistema operacional: a credencial OAuth do `supabase-prod-read` fica guardada pelo Claude Code, e
a leitura é imposta pelo servidor MCP, não pela credencial; a fronteira contra um processo local deliberadamente
malicioso seria um usuário de sistema separado, fora do escopo agora. Até o passo 3, a conta de máquina ainda faz push
na `main`.

### GO/NO-GO para o passo 3

**GO** só com todos: E1 a E6 ✅; `main` em `5772c56` (ou mudança explicada) e sem run em andamento; rulesets 0 e os dois
secrets do repositório inalterados (nada aplicado fora de ordem); #98 no head auditado; sandbox presente; fundador entra
como `Luxtory` só pelo navegador, com 2FA.
**NO-GO** se: algum canal da conta `Luxtory` seguir ativo para agentes (ex.: `gh auth status` listando `Luxtory`,
conector do ChatGPT conectado); a conta de máquina ler o que só admin lê; um token aparecer em conversa ou log (revogar e
refazer o 2.4); surgir mudança não explicada em colaboradores, apps, Environments ou secrets.

## Passo 3 — rulesets da `main` (fundador)

> **v4:** só o `main-checks`, conferido por leitura (ação 2 da v4). O `main-revisao`, o ensaio no sandbox (A), os itens
> 5 e 7 e as regras de operação saem; o item 8 fica opcional.

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

Validação, nesta ordem, **sem nenhuma escrita na `main` real**: um ruleset errado deixaria entrar o push de teste, e
todo push na `main` roda o `migrate` com a credencial dona do schema e um deploy de Production.

**A. Ensaio no sandbox** `Luxtory/luxtory-e5-authorizer-sandbox` (público, sem segredo real; o workflow que já existe lá
só tem `workflow_dispatch`, então push e PR não disparam nada):

0. Fundador, pelo navegador e **antes** de importar: convidar a conta de máquina como colaboradora do sandbox e criar na
   `main` dele `.github/workflows/ci.yml`, com os cinco checks (falham só em branch `falha/…`; sem actions de
   terceiros). Depois, importar os **mesmos** dois JSONs.

   ```yaml
   name: ci
   on: pull_request
   permissions: {}
   jobs:
     lint: { runs-on: ubuntu-latest, steps: [{ run: "test ${{ startsWith(github.head_ref, 'falha/') }} = false" }] }
     typecheck: { runs-on: ubuntu-latest, steps: [{ run: "test ${{ startsWith(github.head_ref, 'falha/') }} = false" }] }
     test: { runs-on: ubuntu-latest, steps: [{ run: "test ${{ startsWith(github.head_ref, 'falha/') }} = false" }] }
     e2e: { runs-on: ubuntu-latest, steps: [{ run: "test ${{ startsWith(github.head_ref, 'falha/') }} = false" }] }
     security: { runs-on: ubuntu-latest, steps: [{ run: "test ${{ startsWith(github.head_ref, 'falha/') }} = false" }] }
   ```

1. Fundador: a tela do `main-revisao` mostra *Repository admin — For pull requests only* (confirma o `actor_id` 5, que
   vem de exportações do GitHub, não da documentação); o `main-checks` não tem bypass.
2. Agente (conta de máquina): `current_user_can_bypass` = `never` nos dois rulesets (`gh api
   repos/Luxtory/luxtory-e5-authorizer-sandbox/rulesets/<id> --jq .current_user_can_bypass`); push de um commit vazio na
   `main` do sandbox → recusado (`GH013`).
3. Agente: PR de branch comum → checks verdes, `reviewDecision` = `REVIEW_REQUIRED`, `mergeStateStatus` = `BLOCKED`;
   fundador aprova → `CLEAN`; novo push da conta de máquina → volta a `REVIEW_REQUIRED`.
4. Fundador (admin), PRs próprios pelo editor web: (a) branch `falha/admin` → checks vermelhos; tentar o merge pelo
   bypass → **recusado** (o admin não contorna o `main-checks`); (b) branch comum → checks verdes; merge pelo bypass, sem
   aprovação → aceito (é o caminho do #98 no passo 5). O editor web não oferece commit direto na `main`.

**B. Repositório real** (só depois do ensaio aprovado; o fundador importa os mesmos JSONs):

5. Fundador: as mesmas telas do item 1.
6. Agente, só leitura: `gh api repos/Luxtory/Branded-Second-Home/rules/branches/main` lista `deletion`,
   `non_fast_forward`, `pull_request` (dos dois rulesets) e `required_status_checks` com `integration_id` 15368;
   `current_user_can_bypass` = `never` e `enforcement` = `active` nos dois; `…/codeowners/errors` sem erros.
7. Agente: PR inofensivo da conta de máquina, sem intenção de merge (título começa com "[NÃO INTEGRAR]"): depois da CI,
   `mergeStateStatus` = `BLOCKED`, `reviewDecision` = `REVIEW_REQUIRED` e `Luxtory` pedido como revisor pelo
   CODEOWNERS. O agente nunca chama merge; o PR é fechado e a branch apagada.
8. **Políticas de Actions** (configuração do repositório, não regra do ruleset): ligar *Require actions to be pinned to
   a full-length commit SHA* (todas as actions já estão fixadas); manter desligado *Allow GitHub Actions to create and
   approve pull requests*; aprovação de workflows de fork em `first_time_contributors` (ou mais restrita).

**Riscos residuais (registrados):** (1) o admin, isto é, o fundador, ainda pode alterar ou desligar os rulesets: é o
caminho de recuperação e um ato só dele, no navegador, com 2FA; nada detecta a mudança automaticamente. (2) Exigir os
checks do app GitHub Actions impede *commit status* forjado, mas não um workflow alterado no próprio PR que fique verde
sem testar nada: a revisão humana das mudanças críticas (cadeia do CODEOWNERS: `.github/`, migrations, autorizador) segue
indispensável. A conta de máquina, sem `workflow`, nem consegue enviar mudança de workflow.

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

> **v4:** merge comum, sem bypass; condições e recuperação abaixo valem, com "passos 2, 3 e 4 validados" lido como as
> ações 1 a 3 da v4.

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

> **v4:** sai do plano; sem exigência de aprovação, os PRs legados seguem o fluxo comum ou são fechados.

#28 (superado pelo #32), #86 e #87: decisão do fundador. Integrar exige atualizar com a `main`, checks verdes e o bypass
por PR; ou fechar. Nenhum é reescrito pelo agente.

## Fechamento de T-1320 e T-1323

- T-1320: depois da validação do passo 3 (itens 1 a 4) e do passo 6.
- T-1323: depois da conferência do passo 2 em todos os canais; na ativação, o Environment `booking-authorizer` com o
  fundador como único revisor e *Prevent self-review* ligado ([runbook do autorizador](autorizador-de-reservas.md) §5).
- As evidências entram num PR de documentação depois das validações.
- **v4:** T-1320 fecha depois das ações 2 e 5; T-1323 fica aberta até a decisão sobre o autorizador com uma só conta.

## Histórico

- 2026-11-18, v1 (#97): PR B antes da identidade; ensaio do ruleset no sandbox; um ruleset sem bypass.
- 2026-11-18, v2 (auditoria do fundador, #98): identidade e revisão humana **antes** das credenciais novas, para que
  elas nunca fiquem ao alcance da conta administrativa dos agentes; dois rulesets (checks sem bypass; revisão com bypass
  por PR só do admin) para integrar PRs de autoria `Luxtory` sem reautoria nem bloqueio; ensaio no sandbox trocado pela
  validação no repositório real (commit vazio recusado e fluxo real), mais direta e reversível; token da Vercel só nos
  passos `pull` e `deploy`, pela variável de ambiente.
- 2026-11-18, v3 (segunda auditoria do fundador, #98): passo 2 em checklist operacional com verificação por item,
  caminho de recuperação antes das revogações e canais fora do GitHub (ChatGPT/Codex, claude.ai, Upstash, CLIs);
  escopos do PAT corrigidos para `repo` + `read:org` (o `gh` recusa token só com `repo`); o commit vazio na `main` real
  saiu do plano (com um ruleset errado, o push entraria e rodaria `migrate` e deploy de Production): ensaio no sandbox
  com os mesmos JSONs e um workflow mínimo dos cinco checks, e no repositório real só leitura
  (`current_user_can_bypass`) e um PR inofensivo sem merge; GO/NO-GO do passo 3 e riscos residuais registrados.
- 2026-11-18, v4 (decisão definitiva do fundador, #98): identidade única `Luxtory`, sem segunda conta; só o
  `main-checks` (PR, cinco checks, squash, sem push direto, sem bypass); agentes com token fine-grained da própria
  conta, sem *Administration*, *Secrets* e *Deployments*; Environment e migração dos secrets mantidos; ensaio no
  sandbox, `main-revisao` e passo 7 saem.
