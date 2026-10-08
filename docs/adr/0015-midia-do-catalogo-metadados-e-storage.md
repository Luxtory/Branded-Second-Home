# 0015. Mídia do catálogo: metadados no PostgreSQL, binários no Supabase Storage, entrega pelo próprio domínio

- **Date**: 2026-10-07
- **Status**: Accepted (checkpoint B da Wave 4.1, com a correção do fundador: binários fora do banco)
- **Deciders**: Luxtory, Engenharia
- **Tags**: catalog, security, database, media

## Context

A Coleção final (spec [`catalog`](../specs/catalog.md) §13.12, `D-B2C-21`) precisa da capa oficial de cada Home Concept,
com ciclo próprio (pendente → aprovada → retirada) e só a aprovada pública. Um Concept tem zero ou uma capa vigente: a
capa não é exigida para publicar (sem capa, a Coleção usa o quadro tipográfico do Core e o Concept não pode ser destaque).
A proposta do checkpoint B guardava os bytes no PostgreSQL; o fundador recusou: o banco transacional não deve carregar
object storage, backups de imagem nem crescimento binário. A leitura pública é `anon` sob RLS e sem cache
([ADR-0014](0014-discovery-publico-leitura-anonima-csp-e-publicacao.md) §1, §8); a CSP permite `img-src 'self'`; a Vercel
limita o corpo da requisição a 4,5 MB; os testes rodam em PostgreSQL real embutido, sem o Supabase
([ADR-0005](0005-testes-com-postgresql-real-sem-docker.md)).

## Decision

1. **PostgreSQL = metadados e estado; Supabase Storage = binários.** O banco guarda o Concept, a referência do objeto
   (`storage_key`), alt, crédito (metadado editorial — nunca no EXIF), estado e aprovação, dimensões, MIME, tamanho,
   SHA-256, as versões e a auditoria. Os binários ficam num bucket **privado** do Supabase Storage, acessado só pelo
   servidor com a chave secreta `sb_secret_…` (`SUPABASE_SECRET_KEY`, cabeçalho `apikey`), atrás da porta
   `MediaStorage`. Em desenvolvimento e na CI, um adaptador de diretório local (`MEDIA_STORAGE=local`, recusado na
   Vercel); em Preview o Storage é recusado como o banco (ADR-0007).
2. **Pipeline da imagem.** Aceita só conteúdo decodificado JPEG, PNG ou WebP (nunca pela extensão ou MIME declarado), até
   3 MiB (limite de corpo da Vercel), 40 megapixels e 12 000 px por lado. A orientação do EXIF é aplicada antes de tudo;
   nenhuma saída leva metadado (EXIF, localização, câmera, autoria). Nada é ampliado. Guarda:
   - um **master sanitizado** em WebP (qualidade 90, até 4096 px no lado maior) — permite novos recortes e larguras sem
     novo envio; o arquivo cru nunca é guardado (só o SHA-256 dele, para rastreio); o master nunca é público;
   - as **larguras de exibição** 480, 800, 1200 e 1600 px (WebP, qualidade 80), só as que cabem na imagem.
3. **Tamanhos tirados do uso real** (Core, container de 1440 px e margens do layout): card 4:5 ≈ 416×520 px (3 colunas),
   335×419 (2 colunas, md), 343×257 (4:3, celular) e o destaque 3:2 ≈ 720×480. Em densidade 2–3× pedem ≈ 670–1440 px —
   cobertos por 480/800/1200/1600. O mínimo aceito é **720 × 520 px**: preencher, sem ampliar, o maior quadro em 1×
   (a largura do destaque e a altura do card 4:5). A regra genérica "lado menor ≥ 1200 px" foi descartada: recusava
   imagens perfeitamente aproveitáveis.
4. **Chave por conteúdo e ordem.** `concept-media/<sha256>.webp`: o command grava os objetos antes da transação (sem
   travas) e registra as referências dentro dela. Repetir é inofensivo (mesma chave); uma transação desfeita deixa no
   máximo objetos sem referência num bucket privado (limpeza futura por job, se o volume justificar).
5. **Entrega pelo próprio domínio** em `GET /media/concept-covers/{id}/{width}`: a visibilidade vem da RLS como `anon`
   (só larguras de exibição da capa aprovada de Concept público; o resto é 404 sem motivo); os bytes, do Storage pelo
   servidor. `ETag` forte por id e largura e `Cache-Control: public, no-cache` — a revalidação (304) só consulta o banco,
   e a retirada vale na próxima requisição. A CSP não muda; nenhuma URL do Storage chega ao navegador.

## Consequences

### Positive

- O banco não cresce com imagens nem as carrega em backups; o Storage cuida dos objetos.
- O master permite novos recortes e larguras no futuro sem pedir a imagem de novo.
- RLS, auditoria e testes de banco continuam cobrindo quem vê o quê; o bucket é privado e só o servidor o lê.
- Reencode remove metadados e normaliza formato e peso.

### Negative

- Uma credencial nova no runtime de Production (`SUPABASE_SECRET_KEY`) e um bucket a criar (`MEDIA_BUCKET`) — runbook.
- Dois sistemas: objeto sem referência é possível depois de uma transação desfeita (inofensivo; limpeza futura).
- Cada exibição passa pelo servidor (revalidação barata; bytes do Storage). Revisar CDN no go-live (D1).
- O arquivo enviado tem 3 MiB no máximo (corpo da Vercel); acima disso, envio direto ao Storage com URL assinada.

### Neutral / follow-ups

- Runbook: criar o bucket privado, configurar `SUPABASE_SECRET_KEY` e `MEDIA_BUCKET` só em Production.
- Fotografia oficial de cada Concept é insumo da Luxtory (P-1).

## Alternatives considered

- **Bytes no PostgreSQL (proposta do checkpoint B).** Simples e transacional, mas põe object storage, backups de imagem
  e crescimento binário no banco transacional. Recusada pelo fundador.
- **URL assinada do Storage no `<img>`.** Mudaria a CSP, exporia URLs temporárias e tiraria da RLS a decisão de
  visibilidade. Rejeitada.
- **Otimização de imagem da Vercel (`next/image`).** Cache de longa duração conflita com a retirada imediata; cota no
  plano atual. Rejeitada.

## References

- Spec: [`catalog`](../specs/catalog.md) §13.12 · threat model [`catalog`](../security/threats/catalog.md)
- `03`: TECH-002, TECH-052, TECH-100, ADR-001, ADR-002
- [ADR-0002](0002-plataforma-e-adaptacoes-economicas.md), [ADR-0005](0005-testes-com-postgresql-real-sem-docker.md),
  [ADR-0007](0007-ambientes-pre-lancamento-sem-staging.md), [ADR-0010](0010-catalogo-versoes-e-mutacoes-do-admin.md),
  [ADR-0014](0014-discovery-publico-leitura-anonima-csp-e-publicacao.md)
