# Como autorizar (ou revogar) um ato da reserva de uso próprio

Runbook do autorizador independente da W13 ([ADR-0027](../adr/0027-ciclo-da-reserva-de-uso-proprio-e-autorizacao-independente.md)
§4; spec [`booking`](../specs/booking.md) §10.7 e §10.16). Workflow: `.github/workflows/booking-authorizer.yml`; programa:
`scripts/booking-authorizer.mjs`.

> **Estado (2026-11-18):** o workflow está no repositório e **inerte**. O Environment real, o revisor e a senha do papel
> autorizador **não existem** em Production. Configurá-los é decisão futura do fundador, fora da W13 (seção 5). Com a
> K2 (`own_use_lifecycle`) fechada, nenhum ato do ciclo executa, autorizado ou não.

Quatro atos exigem autorização independente do `luxtory_app`: **no-show**, **recuperação de capacidade futura**,
**cancelamento de exceção operacional (P-A)** e **invalidação de reserva não autorizada (P-B)**. O cancelamento do
Titular não exige. A autorização vale para uma reserva, uma finalidade, o escopo derivado dos fatos e uma única execução.

## 1. Antes de aprovar: verifique os fundamentos por fontes próprias

O workflow só confere escopo e validade. A solicitação vem do papel da aplicação e **não prova legitimidade**: com a
credencial do `luxtory_app`, qualquer solicitação pode ser forjada. Antes de aprovar, confira por fontes que o
`luxtory_app` não escreve:

| Finalidade (`purpose`) | O aprovador confere |
|---|---|
| `no_show` | registro de não comparecimento da administração profissional da Second Home, ou contato com a party por canal próprio (não pelo app) |
| `recovery` | a reserva está em no-show ou cancelada com atraso. **Se veio de exceção operacional (P-A):** disponibilidade real das noites e compatibilidade com a situação do bloqueio (atestação obrigatória, BR-123) |
| `exception_cancellation` | o evento extraordinário que abriu a P-A, por evidência externa (administração profissional, fornecedor, autoridade) |
| `invalidation` | declaração da party, por canal verificado, de que não fez a reserva, e análise de fontes que o `luxtory_app` não escreve: logs da Vercel e do Supabase Auth do instante da criação |

Se o servidor da aplicação estiver inteiro comprometido, a tela Admin que mostra a solicitação deixa de ser confiável
(limite da fronteira, ADR-0024 §3, R1). Nesse caso, não aprove. Siga a contenção da seção 6.

## 2. Autorizar

1. Na área Admin, em **Reservas → reserva → Autorização**, registre a solicitação e copie o **id opaco** exibido. É a
   única entrada: nenhuma reserva, data, nome ou evidência vai para o GitHub (o repositório é público). O programa lê o
   id do evento do disparo e não o imprime no log, mas o evento do GitHub não é confidencial: informe só o id opaco.
2. No GitHub, com a conta de automação (seção 5, passo 0), abra **Actions → booking-authorizer → Run workflow**,
   com a branch **`main`**, `action = authorize` e
   `id = <id opaco>`.
3. Abra o run. Ele fica **Waiting**: nenhum passo roda e o secret não é carregado até a aprovação.
4. Antes de aprovar, confira no run:
   - a branch é `main` e o commit é o HEAD esperado da `main`;
   - nada da cadeia executada mudou desde a última versão revisada. O job executa, no commit do run, o workflow, o
     programa, as dependências instaladas pelo `package.json`, `package-lock.json` e `.npmrc` (o `npm ci` confere a
     integridade pelo lockfile) e a CA lida de `supabase-root-ca.ts`: `git log --oneline <commit revisado>..<commit do
     run> -- .github/workflows/booking-authorizer.yml scripts/booking-authorizer.mjs package.json package-lock.json .npmrc
     src/features/platform/infrastructure/database/supabase-root-ca.ts` não lista nada. As actions estão fixadas por SHA;
     a imagem do runner e o Node 22.x vêm do GitHub;
   - os fundamentos da seção 1.
5. Em **Review deployments**, marque `booking-authorizer`, escreva um comentário curto sem dado pessoal e clique em
   **Approve and deploy** (ou **Reject**).
6. Leia o resultado no passo **Authorize**: `result=authorized` e `authorization_id=<uuid>`. A autorização grava a
   referência `github-run:<id do run>:<tentativa>`.
7. Volte à área Admin e execute o ato. O banco exige o uso da autorização na mesma operação, uma única vez, dentro do
   escopo e da validade gravados.

**Base registrada do ato:** não cite o número do run. Ele já fica gravado na autorização, e a validação da base (M1,
pendente) recusa sequências de 10 ou mais dígitos, e os ids de run do GitHub têm 11.

## 3. Revogar

Uma autorização viva (não usada, não revogada, dentro da validade) é revogada pelo mesmo workflow, com
`action = revoke` e `id = <authorization_id>`, aprovado da mesma forma. Resultado: `result=revoked`. Autorização usada
nunca é revogada (`authorization_already_used`).

## 4. Resultados do passo `Authorize`

O programa imprime só uma destas linhas, nunca a mensagem do erro, a conexão ou dado da reserva. Recusa sai com código 1
(run vermelho).

| Resultado | Significado | O que fazer |
|---|---|---|
| `authorized` (+ `authorization_id`) | autorização gravada | executar o ato na área Admin |
| `revoked` | revogação gravada | — |
| `input_missing` | o programa não encontrou a entrada do disparo (arquivo do evento ou id do run) | disparar de novo pelo **Run workflow** |
| `input_invalid` | ação, id ou referência fora do formato fechado (checado antes de conectar) | conferir o id copiado |
| `configuration_missing` | o secret do Environment não chegou ao passo | conferir o Environment (seção 5) |
| `configuration_invalid` | conexão de outro papel, sem senha, com parâmetro extra ou sem `sslmode=verify-full` | corrigir o secret |
| `role_mismatch` | o servidor confirmou outro papel que não `luxtory_booking_authorizer` | corrigir o secret; investigar |
| `connection_failed`, `sqlstate_28P01`, `sqlstate_53300` | sem conexão, senha recusada, ou outra sessão do papel aberta (`CONNECTION LIMIT 1`) | conferir o secret ou aguardar o outro run |
| `sqlstate_57014` | a trava da reserva demorou mais que o limite do passo (command da aplicação em curso) | disparar de novo |
| `authorization_request_unknown` | a solicitação não existe | conferir o id |
| `authorization_request_already_authorized`, `authorization_live_exists` | a solicitação já foi autorizada, ou já existe autorização viva para a reserva e a finalidade | usar ou revogar a existente |
| `authorization_scope_mismatch` | o escopo esperado da solicitação difere do derivado dos fatos (por exemplo, uma noite começou) | registrar nova solicitação |
| `authorization_emission_window`, `authorization_emission_exception`, `authorization_emission_nights`, `authorization_emission_recovery`, `authorization_emission_expired` | a finalidade não pode ser emitida agora (janela, exceção, noites, custódias ou validade) | conferir os fatos na área Admin |
| `authorization_attestation_missing` | recuperação de origem P-A sem a atestação de disponibilidade | registrar nova solicitação com a atestação |
| `authorization_unknown`, `authorization_already_revoked`, `authorization_already_used` | revogação de autorização inexistente, já revogada ou usada | — |

## 5. Configuração real (decisão futura do fundador; fora da W13)

Nada desta seção está feito. Faça na ordem; cada passo é conferível.

0. **Separar identidades (T-1323, bloqueia a ativação).** Hoje o `gh` desta máquina de desenvolvimento, usado por
   agentes, está autenticado na conta dona `Luxtory`, com `admin` no repositório e escopos `repo` e `workflow`. Com esse
   token, um agente consegue aprovar o deployment, mudar as regras do Environment (como o sandbox da E5 foi configurado)
   e fazer push na `main`. Modelo mínimo:
   - **conta de automação**, separada e sem `admin`, para agentes e CLI, com token fine-grained só deste repositório,
     sem as permissões *Administration*, *Environments* e *Secrets*; ela dispara o workflow e abre os PRs;
   - **conta do fundador** (`Luxtory`, dona e revisora), usada só no navegador, com 2FA (de preferência passkey).
     Revogue os tokens dela nas máquinas de agentes e de CI (`gh auth logout` e revogação em *Settings → Developer
     settings*);
   - com isso, quem dispara é diferente de quem aprova, e o *Prevent self-review* pode ser ligado.
   Criar contas e tokens é ação do fundador; nada disso foi feito.
1. **Proteger a `main` (T-1320, bloqueia a configuração real).** Hoje a `main` **não tem** proteção clássica (API: 404
   "Branch not protected") nem ruleset. Crie um ruleset na branch padrão, ativo:
   - sem exclusão e sem force push;
   - PR obrigatório, com os checks da CI obrigatórios e atualizados com a `main` (`lint`, `typecheck`, `test`, `e2e`,
     `security`);
   - revisão de *code owner* obrigatória para a cadeia do autorizador. Crie um `CODEOWNERS` com
     `.github/workflows/booking-authorizer.yml`, `scripts/booking-authorizer.mjs`, `package.json`, `package-lock.json`,
     `.npmrc` e `src/features/platform/infrastructure/database/supabase-root-ca.ts`, com dono `@Luxtory`;
   - nenhum ator com bypass; em emergência, o fundador desativa o ruleset, e o desligamento fica no histórico.
   **O que a plataforma impõe:** sem os checks verdes, nada entra na `main`. A revisão humana só passa a ser imposta com
   o passo 0: o dono de código (`Luxtory`) não pode ser a mesma identidade que o agente usa. Com uma única conta, o
   ruleset garante "só por PR com checks", não revisão. Confirme na configuração que a regra de *code owner* vale com o
   número de aprovações que você escolher.
2. **Criar o Environment `booking-authorizer` antes de qualquer secret e antes do primeiro disparo.** Se um job
   referenciar um Environment inexistente, o GitHub o cria **sem proteção**. Sem o secret, o programa falha fechado
   (`configuration_missing`), mas não dispare antes de configurar. Configure:
   - **Required reviewers:** só a conta do fundador;
   - **Deployment branches and tags:** *Selected branches*, uma regra do tipo *branch* com o nome `main`;
   - **Prevent self-review:** **ligado**, o que exige o passo 0. Com uma única identidade disparando e aprovando, ele
     impediria a aprovação; nesse caso a ativação fica bloqueada (T-1323). A independência do ADR-0027 em relação ao
     `luxtory_app` não supre a falta de separação entre quem opera e quem aprova.
3. **Senha do papel autorizador.** Gere no gerenciador de senhas ao menos 32 caracteres de ASCII visível, sem espaço.
   Rode `npm run db:password-verifier -- luxtory_booking_authorizer`, cole a senha (não aparece) e execute a linha
   `ALTER ROLE luxtory_booking_authorizer WITH PASSWORD 'SCRAM-SHA-256$…';` no **SQL Editor** do Supabase. Só o
   verificador chega ao servidor.
4. **Secret do Environment** (nunca no nível do repositório, nunca na Vercel): `BOOKING_AUTHORIZER_DATABASE_URL` =
   `postgresql://luxtory_booking_authorizer.<project-ref>:<senha codificada para URL>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`.
   Use o Supavisor: os runners do GitHub não alcançam o endereço IPv6 da conexão direta. Prefira o modo sessão (porta
   5432), que mantém uma conexão de servidor por cliente, coerente com o `CONNECTION LIMIT 1`; confirme na primeira
   conexão real. Outro `sslmode` ou parâmetro extra é recusado pelo programa.
5. **Conferências somente leitura:**
   - `gh api repos/Luxtory/Branded-Second-Home/rules/branches/main` lista as regras do passo 1;
   - `gh api repos/Luxtory/Branded-Second-Home/environments/booking-authorizer` mostra revisor, `prevent_self_review: true` e a regra de branch;
   - `gh api repos/Luxtory/Branded-Second-Home/actions/secrets` **não** lista `BOOKING_AUTHORIZER_DATABASE_URL`;
   - no banco, `SELECT rolpassword IS NOT NULL FROM pg_authid WHERE rolname = 'luxtory_booking_authorizer'` dá `true`,
     e `app.assert_own_use_activation_ready()` não lança erro.
6. **Credencial do revisor.** O GitHub aceita a aprovação também pela API, com qualquer token da conta revisora que
   tenha escopo `repo`; quem tem esse token aprova sem a interface. Por isso o passo 0: nenhum token da conta do
   fundador em máquina de agente ou de CI.

## 6. Rotação e incidente

- **Rotação:** repita os passos 3 e 4 da seção 5. A senha antiga deixa de valer no `ALTER ROLE`.
- **Suspeita de autorização indevida:** revogue as autorizações vivas (seção 3). Para desligar o autorizador, apague o
  secret do Environment e rode `ALTER ROLE luxtory_booking_authorizer WITH PASSWORD NULL;` no SQL Editor.
- **Credencial do `luxtory_app` comprometida:** contenção do ADR-0027 §5 e de [`operacao.md`](operacao.md). Não aprove
  nada enquanto a aplicação não for confiável (seção 1).
