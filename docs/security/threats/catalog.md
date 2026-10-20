# Threat Model: catalog

- **Date**: 2026-09-27
- **Author(s)**: Engenharia
- **Status**: Reviewed
- **Scope**: W3 — tabelas do catálogo, 9 operações do Admin (`POST /v1/admin/*` e Server Actions das telas), telas
  `/admin/catalogo/**` e leituras administrativas
- **Linked spec**: `docs/specs/catalog.md`, `docs/specs/admin.md`
- **Linked ADR(s)**: ADR-0006, ADR-0008, ADR-0010

## 1. Overview

O staff com papel Admin (AAL2) registra Brand Partners, Concepts e versões, Editions, autorizações de Investor e
Residences. Toda mutação passa pelo guard e pelo executor (TECH-054) e grava `operation` + `audit_log`; toda leitura das
telas grava `admin_read`. Dados: nomes de marca, textos do Concept e da Edition, referências de instrumentos e rótulos
internos — nenhum dado pessoal. A superfície nova reusa sessão, guard e CSRF da W2 (`identity-admin`).

## 2. Assets

- Integridade do catálogo: vínculo Concept → Edition → Residence, versão fixada (BR-025), autorização do Investor.
- Histórico: versões aprovadas, encerramento, exposição e auditoria (sem `UPDATE`/`DELETE` funcional).
- Conformidade editorial dos textos (REQ-100/101) antes da exposição pública (W4).

## 3. Actors

| Actor | Trust level | Notes |
|---|---|---|
| Visitante anônimo | untrusted | alcança as rotas; sem sessão → 401 / redirect para `/entrar` |
| Usuário autenticado sem papel, AAL1 ou só Super Admin | low | 403 nas telas e nos `POST` do catálogo |
| Staff Admin AAL2 | medium | opera o catálogo, sempre pelo guard, com papel exercido auditado |
| Site de terceiros | hostile | tenta CSRF contra os `POST` e as Server Actions |

## 4. Data flow diagram

```
Navegador (staff) ──HTTPS──> Next (gru1) ──Server Action / POST /v1/admin/*──> guard (identity) ──> executor
                                          └─ telas (Server Components) ──> leitura como luxtory_app + admin_read
executor / leitura ──TLS verify-full──> PostgreSQL (schema app, RLS, gatilhos)
```

## 5. STRIDE analysis

| Component | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| `POST /v1/admin/*` do catálogo | — | C-001 | C-003 | — | C-006 | C-002 | origem, sessão, guard, idempotência |
| Server Actions das telas | — | C-001 | C-003 | — | — | C-002 | mesma entrada da API (ADR-0010 §6) |
| Tabelas do catálogo | — | C-004 | C-003 | C-005 | — | C-004 | RLS só `luxtory_app`; gatilhos de imutabilidade |
| Textos registrados | — | C-007 | — | — | — | — | checagem lexical + aprovação humana |
| Telas de leitura | — | — | C-003 | C-005 | — | C-002 | acesso relido a cada request; `admin_read` |

## 6. Threats (prioritized)

### C-002 [HIGH] Elevation — Operar o catálogo sem papel Admin ou sem MFA

- **Mitigação**: guard nega por padrão; autoridade `admin` aceita só o papel Admin ativo com AAL2, relido a cada
  command e a cada tela; papel exercido explícito (ADR-0008). Testes: sem sessão 401, AAL1/sem papel/só Super Admin 403.

### C-001 [HIGH] Tampering — CSRF contra `POST` e Server Actions

- **Mitigação**: `Origin` igual ao host nos `POST` (403); Server Actions comparam `Origin` e `Host`; cookies
  `SameSite=Lax`. Teste: `POST` com origem inválida → 403.

### C-004 [MEDIUM] Tampering — Reescrever a versão fixada, uma versão aprovada ou o histórico

- **Mitigação**: `luxtory_app` sem `DELETE`; `UPDATE` só nas colunas de transição (aprovação, exposição, encerramento,
  revogação), cada uma de vazio a preenchido uma vez; gatilhos recusam o resto; FKs compostas amarram Edition, versão e
  autorização ao mesmo Concept. Testes de banco para cada gatilho.

### C-007 [MEDIUM] Tampering — Texto com terminologia vedada ou promessa de retorno chegando ao público

- **Mitigação**: checagem lexical no command (recusa com o campo); aprovação humana da versão como gate editorial; a
  exposição pública só na W4. Risco residual: paráfrases não detectadas por padrão lexical.

### C-003 [MEDIUM] Repudiation — Mudança ou leitura sem rastro

- **Mitigação**: `operation` + `audit_log` com antes/depois e papel exercido em toda mutação (sem auditoria o commit é
  recusado); `admin_read` em cada leitura das telas.

### C-005 [LOW] Information disclosure — Catálogo lido por `anon`/`authenticated`

- **Mitigação**: RLS ligada com política só para `luxtory_app`; nenhum grant para `anon`/`authenticated`. Teste de RLS.
  Não há dado pessoal no catálogo; rótulo da Residence orientado a não conter nome nem endereço.

### C-006 [LOW] Denial of service — Volume de `POST` autenticados

- **Mitigação**: só staff AAL2 alcança; limites de tamanho em toda entrada. Rate limit chega com o port da W5 (P-10).
  (W5, 2026-10-19: o port foi aplicado só à escrita pública de interesse, conforme o plano; as rotas do Admin seguem
  sem limitador da aplicação — ver risco residual.)

## 7. Abuse cases

- Staff tenta registrar Residence com a autorização de outro Concept → recusada (FK composta e command).
- Staff tenta aprovar uma versão antiga para "voltar" o Concept → recusada (só versão maior que a vigente).
- Depois do encerramento, staff tenta criar uma Edition com data retroativa no corpo → o instante vem do servidor.

## 8. Residual risk

- Sem rate limit nas rotas do Admin até a W5 (aceito: superfície só de staff AAL2). Mantido depois da W5: o limitador
  da aplicação cobre só a escrita pública de interesse; reavaliar na W30 (aceito pela Engenharia, 2026-10-19).
- Checagem de terminologia é lexical (aceito: gate editorial humano).
- Encerramento sem exceção para bases sobreviventes (limitação temporária, ADR-0010 §4).

## 9. References

- `docs/security/threats/identity-admin.md` (sessão, guard, CSRF da W2)
- `03`: TECH-050…054, TECH-092, TECH-100, §13

---

## W4 — Discovery público: leitura anônima (2026-10-01)

- **Status**: Draft (revisado no fechamento da W4)
- **Scope**: páginas `/`, `/como-funciona`, `/colecao`, `/colecao/[conceptId]` (sem autenticação), leitura como `anon`
  sob RLS, portão de publicação, conteúdo público cadastrado no Admin
- **Linked spec / ADR**: `docs/specs/catalog.md` §13 · ADR-0014

### Superfície nova

| Component | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| Páginas públicas (Server Components) | — | C-W4-4 | — | C-W4-1 | C-W4-5 | — | leitura por requisição (Home e Como funciona só a disponibilidade), sem entrada além do id na URL |
| Papel `anon` no banco | — | — | — | C-W4-1 | — | C-W4-2 | grants por coluna, RLS, predicados `SECURITY DEFINER` |
| Data API do Supabase | — | — | — | C-W4-3 | — | — | desligada; `app` nunca exposto |
| Textos cadastrados no Admin | — | C-W4-4 | — | C-W4-6 | — | — | publicados literalmente depois da aprovação |

### C-W4-1 [HIGH] Information disclosure — Coluna ou linha não pública chegando ao site

- **Mitigação**: `anon` só tem `SELECT` nas colunas publicáveis (spec §13.2); visibilidade só pela RLS (versão aprovada,
  exposição autorizada, antes da eficácia do encerramento). Uma consulta errada falha no banco em vez de vazar. Testes
  `db` como `anon`: colunas e tabelas fora da lista → `permission denied`; linhas não públicas → invisíveis.

### C-W4-2 [MEDIUM] Elevation — `anon` executando funções de `app`

- **Mitigação**: o `USAGE` em `app` expõe a `anon` o que tem `EXECUTE` para `PUBLIC`. As funções sensíveis
  (`assign_staff_role`, `revoke_staff_role`, `record_operator_change`, `revoke_authorization_grant`,
  `authorization_grant_require_party`) já têm `EXECUTE` revogado de `PUBLIC`; os predicados novos têm `EXECUTE` só para
  `anon` e devolvem só booleano. Teste `db`: `anon` não executa nenhuma função de `app` além dos predicados e das
  funções puras de validação.

### C-W4-3 [HIGH] Information disclosure — Rota externa ao Next.js contornando o portão

- **Mitigação**: Data API desligada (verificado em 2026-09-29: `PGRST002` com `db-schemas=pg_pgrst_no_exposed_schemas`
  em `/rest/v1` e `/graphql/v1`; `pg_graphql` ausente); `anon` só é alcançável por `SET ROLE` de quem já é
  `luxtory_app`. Religar a Data API ou expor `app` é proibido (runbook); verificação repetida depois do `migrate`.

### C-W4-4 [MEDIUM] Tampering — XSS por texto cadastrado

- **Mitigação**: React escapa todo texto; nenhum `dangerouslySetInnerHTML`; parágrafos montados por divisão do texto,
  sem HTML. CSP com nonce e `'strict-dynamic'` (ADR-0014) limita o impacto de qualquer injeção.

### C-W4-5 [LOW] Denial of service — Leitura por requisição sem cache

- **Mitigação**: consultas pequenas e indexadas; `statement_timeout` de `anon` (3 s no Supabase); proteção de borda da
  Vercel. Portão fechado em Production até o go-live. Revisar cache no go-live.

### C-W4-6 [MEDIUM] Information disclosure — Nota interna digitada num campo público

- **Mitigação**: o Admin marca "Público no site" no rótulo de todo campo publicado literalmente e avisa a consequência
  nas telas que publicam (spec §13.5); a aprovação da versão é o gate editorial humano; checagem lexical de
  terminologia continua.

### Residual risk

- A regra de visibilidade usa o `now()` do banco e os commands usam o relógio do servidor: diferença de milissegundos
  no instante do encerramento (aceito).
- Enquanto a Data API estiver desligada, o risco C-W4-3 depende de configuração do console do Supabase (aceito com a
  verificação no runbook).

## Wave 4.1 — Coleção: vocabulários, capa, curadoria e valores de referência (2026-10-07)

- **Status**: Draft (Fase B, revisado no checkpoint B com a mídia no Storage; revisar no fechamento da Wave 4.1)
- **Scope**: 8 operações novas do Admin (`create/update_catalog_term`, `upload_concept_cover`,
  `approve/withdraw_concept_media`, `set_concept_curation`, `register/end_edition_reference_value`), upload de imagem
  pelo Admin, Supabase Storage privado (binários), rota pública `GET /media/concept-covers/{id}/{width}`, leitura `anon`
  das tabelas novas
- **Linked spec / ADR**: `docs/specs/catalog.md` §13.12 · ADR-0014 · ADR-0015

### Superfície nova

| Component | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| Upload da capa (Server Action e `POST /v1/admin/concepts/{id}/cover`) | — | C-41-1 | C-003 | C-41-2 | C-41-3 | C-002 | só staff Admin com MFA, mesma entrada das outras operações |
| Supabase Storage (bucket privado, chave secreta no servidor) | C-41-7 | C-41-7 | — | C-41-7 | — | C-41-7 | só o servidor lê e grava |
| Rota pública da capa | — | — | — | C-41-4 | C-41-5 | — | leitura `anon`, mesmo portão das páginas públicas |
| Papel `anon` nas tabelas novas | — | — | — | C-41-4 | — | C-W4-2 | grants por coluna, RLS, predicado `catalog_term_is_public` |
| Valores de referência | — | C-41-6 | C-003 | — | — | — | só inserção; um único encerramento |

### C-41-1 [HIGH] Tampering — Arquivo malicioso no decodificador de imagem

- **Mitigação**: só staff com papel Admin e AAL2 envia (C-002); tamanho ≤ 3 MiB validado antes do command (Server Action
  e schema); o formato vem do conteúdo decodificado (JPEG, PNG ou WebP), nunca da extensão nem do MIME declarado;
  `sharp` com `limitInputPixels` (40 MP), lado máximo de 12 000 px e `failOn: 'error'`; o arquivo é sempre reencodado
  em WebP e o cru nunca é guardado nem servido. Falha de decodificação vira `ERR_VALIDATION`, sem nada gravado. `sharp`
  fixado e auditado (`npm audit` sem vulnerabilidade de produção em 2026-10-07).

### C-41-2 [MEDIUM] Information disclosure — Metadados da foto (local, câmera, autoria) publicados

- **Mitigação**: a orientação do EXIF é aplicada antes do reencode; nenhuma saída — master ou largura de exibição — leva
  EXIF, XMP ou ICC (o `sharp` só copia quando pedido). Crédito e autoria ficam como metadado editorial no banco. Testes
  `db` provam WebP sem EXIF a partir de um JPEG com EXIF e com orientação 6. Só o SHA-256 do arquivo recebido fica.

### C-41-3 [LOW] Denial of service — Uploads grandes ou repetidos

- **Mitigação**: corpo da Server Action limitado a 4 MB (`serverActions.bodySizeLimit`), abaixo dos 4,5 MB da Vercel;
  base64 da API limitado ao equivalente a 3 MiB; operação só de staff com MFA e idempotente; processamento e gravação no
  Storage antes de qualquer trava do banco; chaves por conteúdo (reenvio não duplica objetos).

### C-41-4 [HIGH] Information disclosure — Capa pendente/retirada, master, valor futuro ou dado interno chegando ao site

- **Mitigação**: RLS para `anon`: mídia só `approved` de Concept público; versões só com papel `display` (o master
  nunca); valores só vigentes (`valid_from ≤ now()` e sem fim vencido) de Edition pública; termos só ativos e em uso por
  Concept público. Colunas de aprovação, retirada, autoria, operação, `active`, `sha256` e `source_sha256` fora dos
  grants. O bucket é privado e nenhuma URL do Storage chega ao navegador: a rota decide pela RLS e só então lê o objeto.
  Tudo que não é público responde 404 sem motivo. Testes `db` como `anon` cobrem cada caso.

### C-41-5 [LOW] Denial of service — Imagens servidas pelo servidor a cada requisição

- **Mitigação**: `ETag` forte por id e largura, `Cache-Control: public, no-cache` — a revalidação (304) só consulta o
  banco, sem tocar no Storage; proteção de borda da Vercel; portão fechado em Production até o go-live. Revisar CDN no
  go-live (ADR-0015).

### C-41-6 [MEDIUM] Tampering — Reescrever o valor que já foi exibido

- **Mitigação**: tabela só de inserção; gatilho permite um único encerramento e barra sobreposição de vigências por série
  (Edition + base + moeda); o command recusa início no passado (`ERR_VALIDATION`) e só encerra "agora"; auditoria
  antes/depois de cada mudança. Valores em `bigint` + moeda, sem ponto flutuante (TECH-033).

### C-41-7 [HIGH] Spoofing/Elevation — Vazamento ou abuso da chave secreta do Storage

- **Mitigação**: `SUPABASE_SECRET_KEY` só no servidor, só em Production (Sensitive na Vercel), validada no formato
  `sb_secret_…` (a `service_role` legada é recusada) e enviada só no cabeçalho `apikey` às rotas do Storage; nunca em
  log nem em mensagem de erro (só operação e status). Preview recusa o Storage como recusa o banco (ADR-0007); o adaptador
  local é recusado na Vercel. Só chaves geradas pelo command (`concept-media/<sha256>.webp`) chegam ao Storage — caminho
  vindo de fora é recusado antes de qualquer acesso (sem path traversal). Rotação da chave no runbook.

### Residual risk

- A retirada da capa vale na próxima requisição; uma cópia já baixada no navegador continua com o visitante (aceito).
- A curadoria (posição e destaque) é mutável por desenho; o histórico fica no `audit_log` (aceito).
- Objetos sem referência podem sobrar no bucket privado depois de uma transação desfeita (aceito; limpeza futura).

## Wave 4.2 — Ontologia Home Concept → Home Edition → Second Home (2026-10-19)

- **Status**: Draft (Fase B da W4.2; revisar no fechamento da wave)
- **Scope**: renomeação do schema e do código do catálogo; Home Edition com preparação editável, finalização material
  (definição imutável depois dela), visibilidade pública separada e correção editorial; mídia da Home Edition (imagens, renders, plantas) com rota pública
  `GET /media/home-edition-media/{id}/{width}`; média projetada de investimento; página pública
  `/colecao/[homeConceptId]/home-editions/[homeEditionId]`; `register_second_home` só de Home Edition publicada
- **Linked spec / ADR**: `docs/specs/catalog.md` §17 · ADR-0019 · ADR-0014 · ADR-0015 · `docs/plan/w4-2-ontologia.md`

### Superfície nova ou alterada

| Component | S | T | R | I | D | E | Notes |
|---|---|---|---|---|---|---|---|
| Commands da Home Edition (criar, publicar, retirar, corrigir, mídia, média projetada) | — | C-42-2, C-42-3 | C-003 | — | C-006 | C-002 | mesma entrada das outras operações do catálogo |
| Página pública da Home Edition e rota de mídia | — | — | — | C-42-1, C-42-4, C-42-5 | C-41-5 | — | leitura `anon` sob RLS, mesmo portão |
| Upload da mídia da Home Edition | — | C-41-1 | C-003 | C-41-2 | C-41-3 | C-002 | mesmo pipeline da capa |
| Migrations de renomeação | — | C-42-6 | — | C-42-6 | — | — | dependency map, precondições fail-closed |

### C-42-1 [HIGH] Information disclosure — Home Edition em preparação ou fora do público, mídia pendente ou média futura no site

- **Vector**: leitura pública que ignore a visibilidade, o estado material, o estado da mídia ou a vigência da média.
- **Mitigação**: visibilidade só pela RLS — Home Edition `visibility = 'public'` (que exige `finalized`) e Home
  Concept público; mídia `approved` de Home
  Edition pública; média vigente agora de Home Edition pública; master nunca público; grants de `anon` só nas colunas
  da §17.7 (sem estado material, dados de finalização, de quem registrou nem base de retirada). Testes `db` como `anon` para cada estado.

### C-42-2 [MEDIUM] Tampering — Alteração material silenciosa de Home Edition finalizada (BR-036)

- **Vector**: update direto, command novo ou Server Action que mude tipologia, área, suítes, capacidade, programa ou o
  Home Concept de uma Home Edition já finalizada, ou que reabra a preparação ao retirá-la do público.
- **Mitigação**: gatilho `home_edition_transition` recusa, depois da finalização, qualquer mudança da definição material
  e, sempre, do vínculo e do retorno a `draft`, em qualquer caminho (inclusive o dono da tabela); `public` exige
  `finalized` por constraint; a única edição material é `update_home_edition_draft`, que exige `draft`. Teste `db`
  por coluna material depois da finalização.

### C-42-3 [MEDIUM] Tampering / Repudiation — Correção editorial usada para mudar o produto

- **Vector**: reescrever a descrição para descrever outra configuração.
- **Mitigação**: correção editorial só de nome e descrição, com base obrigatória, `operation` e `audit_log` com antes e
  depois; checagem lexical; só staff Admin com MFA. **Residual**: o software não interpreta semântica de texto — a
  revisão humana é o controle (como a aprovação de versão, C-007).

### C-42-4 [MEDIUM] Information disclosure / misrepresentation — Média projetada lida como preço ou oferta

- **Vector**: valor exibido sem contexto, por modalidade ou como valor individual (REQ-100, REQ-101, BR-034).
- **Mitigação**: o dado não tem modalidade, base nem Ação; a página e a Coleção sempre exibem o rótulo "Média projetada
  de investimento" e a explicação obrigatória da §17.4; testes de copy e E2E verificam a presença da explicação junto do
  valor; checagem de terminologia sobre o texto renderizado.

### C-42-5 [LOW] Information disclosure — Enumeração de Home Editions por URL

- **Mitigação**: inexistente, em preparação, fora do público, de Home Concept não público ou de outro Home Concept → o mesmo 404 da
  plataforma, sem distinguir o motivo; ids são UUIDs aleatórios.

### C-42-6 [MEDIUM] Tampering / Information disclosure — Migration de renomeação com dano silencioso

- **Vector**: função SQL/PL/pgSQL com corpo apontando para nome antigo (falha só na execução), policy pública perdida,
  grant de `anon` que sobrevive numa coluna nova, perda de dado por `DROP` sem verificação.
- **Mitigação**: dependency map extraído do banco real; `CREATE OR REPLACE` de toda função citada na mesma migration;
  precondições fail-closed antes de qualquer `DROP`; nenhum `CASCADE`; `npm run db:check` (up → down → up), testes de
  banco das policies, grants e gatilhos com os nomes novos e teste das precondições.

### Residual risk

- Semântica dos textos editoriais (C-42-3) depende de revisão humana.
- Janela curta entre `migrate` e deploy em que o app anterior não lê o catálogo renomeado (sem dados em Production;
  ADR-0019).
