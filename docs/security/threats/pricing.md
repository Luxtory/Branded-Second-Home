# Threat Model: pricing — PRL e parâmetros econômicos (W16)

- **Date**: 2026-11-20
- **Author(s)**: agente de engenharia (revisão: fundador + auditoria independente)
- **Status**: Reviewed no C1; atualizado na E4 (C2)
- **Scope**: `app.prl_publication`, `app.prl`, `app.prl_version`, `app.prl_at`, `app.prl_period_in_force`; chaves
  econômicas globais de `app.parameter`; commands `publish_initial_prl`, `change_published_prl`, `set_parameter`;
  rotas `POST /v1/admin/prl` e `POST /v1/admin/prl/changes`
- **Linked spec**: `docs/specs/pricing.md`, `docs/specs/admin.md` §14
- **Linked ADR(s)**: ADR-0032, ADR-0030, ADR-0008

## 1. Overview

O PRL é a referência econômica do Luxtory Club (BR-180): dele derivam Créditos, Fee e preço Luxplus nas waves
seguintes. A W16 só registra versões (por noite e por chave) e as lê no servidor; nenhum mecanismo as consome ainda.
Dado não pessoal, de alto impacto econômico: alterar o PRL ou um parâmetro fora da autoridade muda a economia de
operações futuras.

## 2. Assets

- Integridade do histórico de PRL e parâmetros (versões, autoridade, base, autor, instante).
- Exclusividade do Super Admin sobre o PRL publicado (BR-181) e prospectividade (BR-182).
- Ausência explícita (TECH-001): nenhum valor padrão.
- Confidencialidade comercial do PRL por noite (não exposto ao Titular; REQ-100).

## 3. Actors

| Actor | Trust level | Notes |
|---|---|---|
| Anônimo / Titular | untrusted / low | sem leitura de PRL ou de parâmetros globais |
| Admin | medium | publica PRL inicial e parâmetros, com MFA e base |
| Super Admin | high | único que altera PRL publicado |
| Servidor (`luxtory_app`) | medium | pode estar comprometido: o banco revalida tudo |
| Dono do schema | high | migrations e runbook |

## 4. Data flow

Tela Admin / rota REST → executor (guard AAL2 + papel, idempotência, operação `pending`) → handler → INSERT em
`app.prl_publication` + `app.prl` (ou `app.parameter`) → gatilhos (procedência, autoridade, trava, vigência) → audit
→ COMMIT (gatilho adiado: completude).

## 5. STRIDE

| Ameaça | Mitigação |
|---|---|
| T-1601 Elevation — Admin altera PRL publicado republicando a noite como "inicial" | Gatilho por noite: `initial` só em noite sem PRL; mistura recusada; `change` exige `super_admin` (gatilho + CHECK `prl_publication_change_authority`) |
| T-1602 Elevation — servidor ou SQL com a credencial do `luxtory_app` forja publicação | Operação `pending` da transação, command do tipo, Second Home, papel e autor da operação; atribuição de staff ativa do papel revalidada sob trava compartilhada (revogação exclusiva) |
| T-1603 Tampering — reescrever ou apagar versão, antecipar vigência | Sem UPDATE/DELETE para o `luxtory_app`; `forbid_change` em UPDATE/DELETE/TRUNCATE; início carimbado pelo banco, nunca retroativo, posterior ao último início |
| T-1604 Tampering — publicação parcial (cabeçalho sem linhas, linhas acrescentadas depois) | Linhas só com a operação da publicação `pending`; gatilho adiado recusa 0 ou mais de 366 noites no commit; FK composta trava Second Home e vigência da linha |
| T-1605 Tampering — leitura em vigor durante publicação resolve no meio dela | Trava `app.prl:<id>` exclusiva na publicação e compartilhada em `app.prl_period_in_force`; instante de resolução lido do banco depois da trava |
| T-1606 Tampering — parâmetro com valor fora do tipo, zero, negativo ou chave não autorizada | Lista fechada de chaves e CHECK de escopo, moeda e formato no banco, além do Zod |
| T-1607 Repudiation — quem publicou, com qual papel e base | `authority`, `authorization_ref`, `created_by`, `created_at` e `operation_id` em cada versão; audit por publicação |
| T-1608 Information disclosure — Titular ou anônimo lê PRL por noite ou parâmetros | Sem GRANT a `authenticated`/`anon` no PRL; política do Titular em `app.parameter` só alcança versões de Second Home |
| T-1609 DoS — publicação ou leitura gigante | 366 noites por publicação (Zod + gatilho adiado) e por leitura; rota sob sessão de staff, `Idempotency-Key` |
| T-1610 Spoofing — sessão de staff sem MFA | Guard exige AAL2 e papel ativo (TECH-050, ADR-0008) |
| T-1611 Elevation — papel exercido escolhido pelo servidor no PRL inicial | Lista fechada `admin`, `super_admin` na entrada única do Admin: vale o primeiro papel **ativo** do usuário, registrado na operação; o guard e o gatilho revalidam a atribuição; a alteração continua fixa em `super_admin` |

## 6. Residual risks

- Super Admin comprometido altera PRL: mitigado só por MFA, base registrada e trilha; sem segundo aprovador (não
  previsto no `01/02`).
- Production sem Super Admin ativo: alteração indisponível até atribuição pelo runbook (operacional).

## 7. Políticas comerciais (W18, ADR-0034)

Superfície nova: `POST /v1/admin/policies`, a Server Action de `/admin/politicas` e `app.commercial_policy`.

| Ameaça | Mitigação |
|---|---|
| T-1801 Tampering — política que contorna BR-163 ou INV (capacidade fora da origem, fração > 1, eixo de outro mecanismo) | Esquema fechado no Zod, no domínio e no CHECK `app.commercial_policy_config_valid` do banco; chaves extras recusadas |
| T-1802 Elevation — servidor ou SQL com a credencial do `luxtory_app` forja versão | Operação `publish_policy` `pending` da transação, papel e autor da operação, autoridade de staff revalidada sob trava |
| T-1803 Tampering — reescrever, apagar ou antecipar versão | Sem UPDATE/DELETE; `forbid_change`; início carimbado pelo banco, nunca retroativo, depois de todos os inícios |
| T-1804 Tampering — política muda entre a apresentação e a confirmação | Aceite carrega o id da versão; resolução sob trava compartilhada exige versão vigente = aceita (`ERR_POLICY_MISSING`) |
| T-1805 Repudiation — quem publicou, com qual base | `authority`, `authorization_ref`, `created_by`, `created_at`, `operation_id`; auditoria com o `config` |
| T-1806 Information disclosure — leitura de políticas por anônimo/Titular direto no banco | Sem GRANT a `anon`/`authenticated`; o Titular verá a política pela renderização do servidor (W21+) |
| T-1807 DoS — `config` gigante | Corpo até 16 KiB na rota; no máximo 5 faixas; validação antes de abrir transação |
| T-1808 Spoofing — política de teste em ambiente operacional | Nenhuma política por migration/seed; fixtures só nos bancos efêmeros de teste |

Risco residual: Admin comprometido publica política desfavorável — mitigado por MFA, base registrada, vigência
nunca retroativa (operações já vinculadas não mudam) e trilha.
