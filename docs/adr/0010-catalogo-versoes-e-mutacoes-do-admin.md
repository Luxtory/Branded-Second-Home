# 0010. Catálogo: versões, aprovação comercial, Investor e mutações do Admin pela UI

- **Date**: 2026-09-27
- **Status**: Accepted
- **Deciders**: Luxtory, Engenharia
- **Tags**: catalog, admin, data-model, frontend, security

## Context

A W3 entrega o catálogo (REQ-020, REQ-027) e as primeiras telas de operação do Admin. O `03` §3.1 lista
`brand_partner`, `concept_version`, `edition` e `residence` com regras mínimas; faltam decisões de modelagem que os
canônicos não fixam e que não podem virar regra de negócio nova:

- a Residence fica presa à versão do Concept "vigente na data de sua aprovação comercial" (BR-025), e nenhum evento
  de aprovação comercial existe ainda no software;
- o Investor precisa de "autorização prévia da Luxtory" (BR-310), mas `party` só existe na W7 e um
  `authorization_grant` sem party é recusado (D-W2-1, ADR-0008);
- o encerramento da Brand Partner bloqueia novos usos da marca "salvo disposição contratual diferente" (BR-021) e
  preserva direitos sobreviventes (BR-022/023), que ainda não têm forma de registro;
- as telas do Admin precisam gravar pelo mesmo pipeline de commands da API (TECH-054) sem duplicar regras.

## Decision

1. **Concept com versões.** `concept` guarda a identidade (Brand Partner, título); `concept_version` guarda o conteúdo
   (elementos essenciais, premissas de preservação, especificação — BR-013/014), imutável. A única transição é
   `not_approved` → `approved`, com `approval_refs` (BR-010, BR-018), instante, usuário e papel. Versão vigente = a
   aprovada de maior número; só se aprova versão maior que a vigente (REQ-096).
2. **Aprovação comercial = `register_residence`.** O registro da Residence é o evento que registra a aprovação
   comercial: grava o instante e fixa a versão vigente do Concept naquele instante (BR-025). A versão fixada nunca muda
   (gatilho); FKs compostas garantem que Edition, versão e autorização de Investor são do mesmo Concept.
3. **Autorização do Investor em registro próprio (D-W3-1).** `investor_authorization`: Concept, referência estável do
   instrumento, vigência `[valid_from, valid_until)` (`valid_until` só se o instrumento tiver termo final), revogação
   única com base. Sem dado pessoal. A Residence referencia a autorização por `investor_authorization_id`; sem
   autorização válida no instante do registro, a Residence é recusada (REQ-027). A W7 acrescenta o vínculo com a
   `party` do Investor sem reescrever registros. Não é `authorization_grant`: aquele concede commands no software
   (TECH-051) e exige party; este registra a autorização de negócio do BR-310.
4. **Encerramento fechado para falhas (D-W3-4).** Depois de `terminated_effective_at`, todo novo uso da marca é
   recusado: Concept, versão, aprovação, Edition, autorização de Investor, Residence e autorização de exposição. Como os
   direitos sobreviventes ainda não são modelados, não há exceção — **limitação temporária**, não regra de negócio
   nova; BR-022/023 não são redefinidas e nada existente muda. A autorização de exposição (BR-015, D-W3-3) é registrada
   uma vez e **não é apagada** pelo encerramento: fica como histórico, e a exposição efetiva (W4) exige autorização
   registrada e eficácia do encerramento ainda não atingida.
5. **Terminologia como defesa complementar.** Todo texto registrado passa por checagem lexical dos termos vedados do
   `02` §1 e de expressões explícitas conhecidas de promessa de retorno (REQ-100/101). Não é interpretação semântica do
   REQ-101; o gate editorial é a aprovação humana da versão.
6. **Mutações do Admin pela UI.** Um único ponto de entrada no módulo `identity` serve a rota REST e a Server Action:
   origem → sessão → guard → executor (TECH-054). O **papel exercido é explícito** (a autoridade `admin` exerce o papel
   Admin) e fica na `operation` e no `audit_log`; Admin e Super Admin continuam não hierárquicos (ADR-0008). Cada
   formulário renderizado leva uma `Idempotency-Key` própria (envio repetido = replay); depois de uma recusa gravada, a
   tela gera chave nova. A tela valida os campos com o mesmo schema Zod do command, só para mostrar o erro no campo; a
   decisão é sempre do command.
7. **Leituras do Admin.** Como `luxtory_app`, depois de resolver o acesso de staff com o papel Admin exercido; cada
   leitura grava `admin_read` (TECH-092). RLS ligada em todas as tabelas, com política só para `luxtory_app`: `anon` e
   `authenticated` não leem nada (a leitura pública entra na W4).
8. **Travas do catálogo.** Ordem `brand_partner` → `investor_authorization`, por id, antes de qualquer classe do
   TECH-053 (que o catálogo não usa). Novos usos travam a Brand Partner em `FOR SHARE`; encerramento, exposição,
   versão nova e aprovação, em `FOR NO KEY UPDATE`. Travar `concept` exigiria privilégio de UPDATE numa tabela
   imutável, por isso a serialização das versões passa pela Brand Partner (contenção desprezível: operação de staff).
   O resto é contido por constraints.
9. **Lista de registros, sem tabela (D-W3-2).** `lx-record-list` (lista semântica com filetes e `lx-evidence--inline`)
   serve todas as listas do catálogo de 320 a 1920 px. Tabela e filtros entram quando houver comparação densa ou volume
   que peça filtro (candidatas: W5, W16, W17).
10. **Recusas.** Objeto referenciado inexistente → `ERR_NOT_FOUND` (o tipo de recusa do command passa a aceitar esse
    código geral, além dos do TECH-056); estado que não permite a operação → `ERR_STATE_TRANSITION`.
11. **Instantes digitados no Admin** são interpretados no fuso IANA do navegador, enviado com o formulário e mostrado
    ao lado do campo; sem fuso, recusa. A API exige ISO 8601 com deslocamento. O fuso da Residence é obrigatório e sem
    padrão (TECH-001).

## Consequences

### Positive

- BR-025 fica verificável por teste e garantido pelo banco; REQ-027 é entregue sem esperar a W7.
- Uma só regra para API e telas; o papel exercido fica auditado em toda mutação.
- Nenhum dado pessoal no catálogo.

### Negative

- Encerramento sem exceção até a Luxtory definir o registro de bases sobreviventes: um novo uso contratualmente
  permitido depois da eficácia precisa esperar essa definição.
- A autorização do Investor não identifica o Investor até a W7.
- Mais telas no Admin (uma por cadastro e confirmação), em troca de robustez no celular.

### Neutral / follow-ups

- W4: leitura pública do catálogo sob RLS para `anon`; exposição efetiva da marca.
- W7: vínculo `investor_authorization` → `party`, sem reescrever registros. **Executado na W7 (2026-10-21)**:
  `party_id` com FK, resolvido pelo HMAC do CPF/CNPJ informado; sem backfill (0 registros); ver spec `catalog` e
  [ADR-0020](0020-party-cifrada-e-delegacao.md).
- W8: trava da estrutura, alteração de modalidade e configuração da Residence (novas colunas; a versão fixada
  continua imutável).

## Alternatives considered

**Investor como `authorization_grant`.** Usaria o registro existente, mas fica fechado para falhas até a W7 e mistura
autorização de negócio com concessão de commands. Rejeitada: REQ-027 escorregaria para a W7/W8.

**Fixar a versão "no cadastro" sem evento de aprovação comercial.** Mais simples, mas não atende ao texto do BR-025.
Rejeitada em favor de tornar o registro o próprio evento.

**Apagar a autorização de exposição no encerramento.** Perderia o histórico e confundiria "exposição encerrada" com
"nunca autorizada". Rejeitada.

**Tabela responsiva (`data-label` em CSS).** Proibida pelo contrato do DS (`content:` só para glifos) e sem consumidor
denso na W3. Rejeitada.

**UI chamando a API por `fetch`.** Um só adaptador, mas exige JavaScript em todo formulário e perde o aprimoramento
progressivo. Rejeitada em favor de Server Actions sobre a mesma entrada.

## References

- Related ADRs: [ADR-0006](0006-acesso-a-dados.md), [ADR-0008](0008-autenticacao-e-autorizacao-administrativa.md),
  [ADR-0009](0009-superficies-de-produto-mobile-first.md)
- `docs/specs/catalog.md`, `docs/specs/admin.md`, `docs/plan/implementation-waves.md` → Wave 3
- `01`: BR-010, BR-013…015, BR-021…025, BR-310…314. `02`: REQ-020, REQ-027, REQ-095, REQ-096, REQ-100, REQ-101.
  `03`: §3.1, TECH-051…054, TECH-056, TECH-092.

## Atualização W4.2 (2026-10-19)

Superseded em parte pelo [ADR-0019](0019-ontologia-home-concept-home-edition-second-home.md): os objetos passam a
Home Concept (`home_concept`, `home_concept_version`), Home Edition (`home_edition`) e Second Home (`second_home`);
`register_residence` passa a `register_second_home` e exige Home Edition publicada; a Home Edition deixa de ter região,
modalidade e condições comerciais e ganha publicação com definição material imutável. As decisões 1, 3–7, 9–11 e a
ordem de travas (§8, agora `brand_partner` → `investor_authorization`, com os mesmos modos) continuam valendo com os
nomes novos.
