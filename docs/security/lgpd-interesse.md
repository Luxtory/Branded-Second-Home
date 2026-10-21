# Inventário técnico de dados — Solicitação de conversa na Home Edition (W6)

> **Natureza:** inventário técnico para a revisão jurídica. **Não é parecer jurídico** e não conclui que alguma base
> legal está correta: a base listada é proposta, sujeita ao gate de validação jurídica.
> **Fonte:** spec [`ownership`](../specs/ownership.md) §14,
> [ADR-0018](../adr/0018-contato-e-pre-qualificacao-do-interesse.md), [STRIDE `ownership`](threats/ownership.md)
> (W6); decisões do fundador de 2026-10-19 e 2026-10-20.
> **Estado:** a coleta está **fechada** em Production; nenhum dado real de contato existe até o go-live.

## 1. Tratamento

| Item | Registro |
|---|---|
| Finalidade de produto (D4) | Responder à solicitação de conversa e conduzir a pré-qualificação comercial relacionada à Home Edition (BR-041, BR-064). |
| Fora da finalidade | marketing, newsletter, campanha, compartilhamento com Brand Partners ou parceiros locais, venda ou cessão. Finalidade futura exige nova análise. |
| Base legal **proposta** | LGPD art. 7º, V (procedimentos preliminares relacionados a contrato, a pedido do titular) — **hipótese** a validar pelo jurídico; se algo ultrapassar isso, avaliar outra base. Sem consentimento presumido e sem checkbox. |
| Transparência | microcopy junto ao envio (P-3 e D4) + Aviso de Privacidade em `/privacidade`, que só pode ser marcado `approved` depois do checkpoint jurídico/fundador. |
| Titulares | visitantes que enviam a solicitação (e, por erro ou abuso, terceiros cujo contato foi digitado por outra pessoa — STRIDE T-410). |

## 2. Dados e locais

| Dado | Obrigatório | Tabela / local | Observação |
|---|---|---|---|
| Nome | sim | `app.interest_contact.name` | 1–200 caracteres |
| Telefone ou WhatsApp | sim | `app.interest_contact.phone` | `+` opcional e 8–15 dígitos; código do país nunca inferido |
| E-mail | sim | `app.interest_contact.email` | até 254; domínio em minúsculas |
| Dimensão de investimento | sim | `app.interest_qualification.investment_question`, `investment_answer` | código fechado; nunca valor, renda, patrimônio ou financiamento |
| Média projetada apresentada | quando houve | `app.interest_qualification.presented_projected_investment_id` | referência (FK) ao registro da Luxtory — não é dado do visitante |
| Unidade de decisão, horizonte | sim | `app.interest_qualification.decision_unit`, `decision_horizon` | códigos fechados; nenhum dado de terceiros |
| Home Edition, modalidade desejada, localização pretendida, `approx_days`, `origin`, `partner_ref` | conforme a modalidade | `app.interest` (W5/W4.2) | manifestação imutável; textos livres podem conter texto pessoal digitado |
| Instante do registro | — | `created_at` das três tabelas | `Clock` da aplicação |
| Hash do conteúdo (inclui contato e pré-qualificação) | — | `app.public_idempotency_key.request_hash` | **derivado pseudonimizado** (HMAC-SHA-256, `INTEREST_REQUEST_HMAC_SECRET`), com `hash_scheme`/`hash_key_id`; **não é anônimo** enquanto a chave existir |
| Contexto de apresentação | — | só em trânsito (página → formulário → envio) | assinado; sem PII; não é gravado |
| Pseudônimo da origem de rede | — | Upstash Redis (contadores com expiração) | HMAC de IP com o segredo da BP1 e domínio `interest`; nunca no PostgreSQL |
| Leituras do Admin | — | `app.audit_log` (`admin_read`) | só ids (usuário, interesse/Home Edition), papel e instante — sem PII do visitante |

## 3. Fluxo

1. O visitante preenche a seção "Solicitar uma conversa" na página da Home Edition; os dados ficam só na memória da
   página.
2. `POST /v1/interests` (TLS) → validação → limitador (Upstash, só o pseudônimo de rede) → uma transação no PostgreSQL
   grava a chave de idempotência (hash), o interesse, o contato e a pré-qualificação, depois de revalidar a Home
   Edition.
3. A resposta não devolve dado nem identificador. Logs estruturados levam só etapa, status, duração e códigos.
4. O Admin (AAL2, papel Admin) chega ao contato e à pré-qualificação por agregado → Home Edition → interesse →
   contato; cada leitura grava `admin_read`. Sem exportação, busca, e-mail automático ou integração.

## 4. Acesso técnico

| Quem | Como | Alcance |
|---|---|---|
| Admin da Luxtory (AAL2, papel exercido) | `/admin/interesses/[id]/contato` | um interesse por leitura, auditada |
| Aplicação (`luxtory_app`) | conexão direta server-side, RLS | `SELECT`/`INSERT`; **sem** `DELETE` |
| `anon`, `authenticated` (Supabase) | — | nenhum (RLS sem política; Data API desligada) |
| Dono do schema (migrations, CI) | pipeline `migrate` | DDL; não é caminho operacional de leitura ou eliminação |
| Operadores de infraestrutura | ver §5 | conforme os contratos de cada operador |

## 5. Operadores técnicos e regiões conhecidas

| Operador | Papel no fluxo | Região conhecida | Dado envolvido |
|---|---|---|---|
| Vercel | hospedagem, funções e logs da plataforma | funções em `gru1` (São Paulo); a empresa e parte do processamento de plataforma podem estar fora do Brasil — **a confirmar no contrato** | requisições em trânsito; logs sem PII da aplicação |
| Supabase | PostgreSQL e backups gerenciados | `sa-east-1` (São Paulo) | interesse, contato, pré-qualificação, hash, `audit_log` |
| Upstash | rate limit | região a confirmar no painel | só pseudônimo de rede e contadores |

Transferência internacional: depende das cláusulas e da infraestrutura de cada operador — item para o jurídico.

## 6. Logs, erros e backups

- **Logs da aplicação:** nunca nome, telefone, e-mail, pré-qualificação, localização pretendida, `origin`,
  `partner_ref`, corpo, contexto, IP, pseudônimo, chave ou hash; erros do banco registrados só pelo nome do erro.
- **Logs da plataforma (Vercel):** caminho e query das requisições; nenhuma URL do fluxo leva PII (o grupo do Admin é
  identificado pelo id da Home Edition; a localização pretendida não vai à URL).
- **Backups:** os do Supabase seguem o plano contratado (D2 pendente). Um contato eliminado pode permanecer em backup
  até a expiração dele — tratamento a definir no procedimento de go-live.

## 7. Retenção e eliminação propostas

- **Retenção proposta (P-3, sujeita ao jurídico):** até 12 meses sem relação comercial ativa, depois da última
  interação relevante ou do encerramento da oportunidade; depois, eliminação ou anonimização conforme a LGPD,
  preservadas as hipóteses legais de conservação. Com relação contratual, seguem as finalidades e obrigações
  correspondentes. Sem promessa de exclusão imediata.
- **Mecanismo de eliminação proposto:** remover a linha de `app.interest_contact` e/ou de
  `app.interest_qualification` — estruturalmente possível e testado (a manifestação em `app.interest` não muda). **Não
  há caminho na aplicação na W6**: o papel de aplicação não tem `DELETE`, não há ação no Admin nem workflow de
  direitos.
- **Antes do go-live:** procedimento operacional definindo quem executa, o fundamento da solicitação, a verificação de
  identidade quando necessária, a auditoria da ação, o tratamento de backups e retenções obrigatórias e quando é
  eliminação ou conservação legal. `DELETE` manual não auditado em Production não é solução.
- **Derivados:** o HMAC do conteúdo permanece no registro imutável de idempotência depois da eliminação; é
  pseudonimização, não anonimização. Rotação ou descarte do segredo não é mecanismo de eliminação.
- **Replay depois da eliminação:** não recria contato nem pré-qualificação (ADR-0018).

## 8. Gates de validação (pendentes)

1. Validação jurídica da base legal proposta.
2. Aviso de Privacidade final (controlador, finalidades, bases, categorias, retenção, acesso, operadores,
   compartilhamentos, transferências internacionais, direitos, canal) marcado `approved`.
3. Canal de atendimento aos direitos do titular.
4. Procedimento de retenção e de exercício de direitos (§7).
5. D2 (Supabase Pro) e reavaliação formal da D3 ([ADR-0007](../adr/0007-ambientes-pre-lancamento-sem-staging.md)).
6. Confirmação das regiões e cláusulas dos operadores (§5).
