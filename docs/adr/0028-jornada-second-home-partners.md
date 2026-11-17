# 0028. Jornada Second Home Partners: superfície, portão e contato próprios sobre a infraestrutura existente

- **Date**: 2026-11-12
- **Status**: Accepted (plano v3.3 aprovado pelo fundador em 2026-11-12; emissão dos canônicos no merge do PR da SHP1)
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: catalog, platform, communication, security

## Context

A Luxtory abriu uma frente comercial com incorporadoras de empreendimentos de lazer próprios (`01` v10.5 §1, §35;
`02` v4.5 REQ-105). É um terceiro Protagonista, com página, CTA e formulário próprios em `/second-home-partner`, e a
comunicação exige Framework próprio (`docs/specs/communication.md` §4). O Luxtory Club continua não operacional, e a
participação de imóveis parceiros depende de regras ainda não definidas (Escopo B).

A jornada Brand Partners já resolve contato público sem persistência (TECH-057): Resend, limitador Upstash, origem
permitida, `Idempotency-Key`, honeypot e logs sem PII. O fundador pediu reaproveitamento, sem refatorar Brand Partners.

## Decision

1. **Superfície própria.** Grupo de rotas `src/app/(second-home-partners)`, shell e navegação próprios, sem links para
   B2C ou Brand Partners (`D-LX-13`). Página e copy no slice `catalog` (`presentation/second-home-partners/`, i18n
   `second-home-partners-pt-br.ts`), pelo precedente de Brand Partners e Sobre; nenhum módulo novo.
2. **Portão independente.** `SECOND_HOME_PARTNERS_SITE` (`open`/`closed`), com a mesma semântica do portão Brand
   Partners: fechado em Production sem `open`, aberto fora dela sem `closed`. Verificado no layout, na página, nos
   metadados e no endpoint; fechado = 404 sem copy no payload.
3. **Contato com contrato próprio.** `POST /v1/second-home-partner-contacts` (TECH-057 estendida), com campos do
   REQ-105, assunto e destinatário próprios (`SECOND_HOME_PARTNERS_CONTACT_TO`) e namespace
   `luxtory:second-home-partner-contact:<env>` nos contadores do limitador e na chave de idempotência enviada ao
   provedor.
4. **Configuração compartilhada.** Reaproveita `RESEND_API_KEY`, `UPSTASH_*`, remetente, origens permitidas, segredo de
   pseudonimização, limites, timeouts e o modo `fake` do contato Brand Partners. São só valores: contadores, chaves e
   estados ficam separados pelo namespace, como o interesse (W5) já faz com o Upstash e o segredo de pseudonimização.
5. **Porta de envio própria.** A aplicação nova declara a própria porta, com a mesma forma da porta Brand Partners; os
   adaptadores existentes (Resend e fake) são ligados só na rota. O contrato novo não importa nada de Brand Partners, e
   uma mudança incompatível no adaptador quebra o typecheck.
6. **Copy sem flag.** O i18n leva só a copy autorizada, sem variante no código. Em 2026-11-13 o fundador definiu o
   modelo comercial e a página passou a comunicar a participação nos resultados (`D-SHP-07`, que substitui
   `D-SHP-04`); nada mudou na arquitetura, no contrato ou na configuração.

## Consequences

### Positive

- Ativar, desativar e receber contatos de uma jornada não depende da outra; nenhuma infraestrutura nova.
- Brand Partners não muda; a CI prova o isolamento (portões, limites, idempotência, destinatário, falha de
  configuração).

### Negative

- As chaves reaproveitadas têm prefixo `BRAND_PARTNERS_*`. Enquanto esta página existir, elas não podem ser removidas;
  a falta de uma delas recusa os dois contatos, de forma explícita.
- Pequena duplicação de validação de formulário entre as duas jornadas, aceita para não refatorar Brand Partners.

### Neutral / follow-ups

- Renomear as chaves compartilhadas ou unificar a validação é trabalho futuro, só com problema real que justifique.
- Imóveis parceiros no Luxtory Club exigem nova revisão de `01/02/03` (Escopo B), fora desta decisão.

## Alternatives considered

- **Reusar o endpoint Brand Partners com um campo de jornada.** Recusada: mistura leads, contratos e portões.
- **Chaves próprias para tudo (11 variáveis).** Recusada: mais operação sem ganho de isolamento, que o namespace já dá.
- **Extrair um módulo de contato compartilhado.** Recusada agora: exigiria refatorar Brand Partners sem problema real.
