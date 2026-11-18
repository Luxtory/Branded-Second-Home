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
   única entrada pública: nenhuma reserva, data, nome ou evidência vai para o GitHub (o repositório é público).
2. No GitHub, abra **Actions → booking-authorizer → Run workflow**, com a branch **`main`**, `action = authorize` e
   `id = <id opaco>`.
3. Abra o run. Ele fica **Waiting**: nenhum passo roda e o secret não é carregado até a aprovação.
4. Antes de aprovar, confira no run:
   - a branch é `main` e o commit é o HEAD esperado da `main`;
   - o workflow não mudou desde a última versão revisada: `git log --oneline -- .github/workflows/booking-authorizer.yml scripts/booking-authorizer.mjs`;
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

1. **Proteger a `main`** (critério 1: mudança no workflow só por PR revisado). Hoje a `main` **não tem** proteção nem
   ruleset. Crie um ruleset na `main`: PR obrigatório, checks da CI obrigatórios, sem force push e sem exclusão. Com um
   único mantenedor, aprovação obrigatória de PR por outra pessoa não é viável: o PR com checks verdes é o controle.
2. **Criar o Environment `booking-authorizer` antes de qualquer secret e antes do primeiro disparo.** Se um job
   referenciar um Environment inexistente, o GitHub o cria **sem proteção**. Sem o secret, o programa falha fechado
   (`configuration_missing`), mas não dispare antes de configurar. Configure:
   - **Required reviewers:** o fundador;
   - **Deployment branches and tags:** *Selected branches*, uma regra do tipo *branch* com o nome `main`;
   - **Prevent self-review:** com uma única identidade GitHub disparando e aprovando, deixe **desligado**; ligado, o
     único revisor não consegue aprovar o próprio disparo. Assim não há separação entre quem dispara e quem aprova.
     A independência do ADR-0027 é em relação ao `luxtory_app`, não entre duas pessoas.
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
   - `gh api repos/Luxtory/Branded-Second-Home/environments/booking-authorizer` mostra as duas regras;
   - `gh api repos/Luxtory/Branded-Second-Home/actions/secrets` **não** lista `BOOKING_AUTHORIZER_DATABASE_URL`;
   - no banco, `SELECT rolpassword IS NOT NULL FROM pg_authid WHERE rolname = 'luxtory_booking_authorizer'` dá `true`,
     e `app.assert_own_use_activation_ready()` não lança erro.
6. **Credencial do revisor.** O GitHub aceita a aprovação também pela API, com qualquer token da conta do revisor que
   tenha escopo `repo`. Quem tem esse token aprova sem a interface. Mantenha 2FA, não deixe token da conta do revisor em
   máquinas de agentes ou de CI, ou use para revisar uma conta separada, sem token de CLI.

## 6. Rotação e incidente

- **Rotação:** repita os passos 3 e 4 da seção 5. A senha antiga deixa de valer no `ALTER ROLE`.
- **Suspeita de autorização indevida:** revogue as autorizações vivas (seção 3). Para desligar o autorizador, apague o
  secret do Environment e rode `ALTER ROLE luxtory_booking_authorizer WITH PASSWORD NULL;` no SQL Editor.
- **Credencial do `luxtory_app` comprometida:** contenção do ADR-0027 §5 e de [`operacao.md`](operacao.md). Não aprove
  nada enquanto a aplicação não for confiável (seção 1).
