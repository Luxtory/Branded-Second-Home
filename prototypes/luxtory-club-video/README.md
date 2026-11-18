# Luxtory Club — protótipo de assets para vídeo (demonstração conceitual)

> **Demonstração conceitual com dados fictícios.** Não é produto, não especifica UX, não acessa banco, API, rede
> externa, Supabase, Vercel ou Production, e não implementa nada do R3. Serve só para gerar assets de interface
> (transparentes, editáveis) que a pós-produção compõe sobre imagens cinematográficas.

| Etapa | Conteúdo | Estado |
|---|---|---|
| A | Luxchange Request (25 s): escolha das noites, revisão, política, Fee, Pendente, aceite do detentor, revalidação e Request Aceita + Reserva Confirmada na mesma operação | aprovada; substituída pela revisão de UX (abaixo) |
| B | Luxchange Direct (14 s) e Luxplus (15,5 s) sobre a mesma arquitetura | aprovada (auditoria de 2026-11-14) |
| C | Pré-produção do comercial de lançamento (`filme/ROTEIRO.md`, `filme/PRODUCAO.md`, v3), assinatura só da marca (6 s), painel dos Créditos (C04, 11 s) e prova de montagem da Request (`filme/prova/`, ≈ 19,8 s, placeholders) | em avaliação |
| UX | Revisão de UX e comercial (2026-11-15): passo de Créditos e depósito na Request (35 s) e no Direct (16,7 s), "Taxa de intermediação", cartões sem selo nem jargão, Luxplus e Créditos harmonizados, prova de 24,8 s | em avaliação |
| v5 | Auditoria final de UX e identidade (2026-11-15): todas as combinações do controle de Créditos, depósito uma única vez (C04 conceitual, 10,5 s), Satori/Azzura/Olivar Home, placas por imóvel, calendário do 9:16 na área segura, prova de 26,4 s | em avaliação |
| D | Montagem e finalização | depende de footage, voz, trilha e aprovações |

## Ver

```bash
node prototypes/luxtory-club-video/serve.mjs
```

Abra `http://127.0.0.1:4173/prototypes/luxtory-club-video/?seq=request&fmt=16x9`. `seq` = `request`, `direct`,
`luxplus`, `creditos` (painel dos Créditos, C04), `assinatura` ou `prova` (camada editorial da prova de montagem, só
16:9); `fmt` = `16x9` ou `9x16`; `&final=1` mostra a versão da exportação final (sem etiqueta interna). Toca sozinho; **espaço** pausa e continua, **R** reinicia.
`&t=13800` congela um instante; `&bg=plate` mostra uma placa de prévia por trás.

## Regenerar e validar

```bash
node --test prototypes/luxtory-club-video/prototype.test.mjs
```

```bash
node prototypes/luxtory-club-video/check.mjs
```

```bash
node prototypes/luxtory-club-video/capture.mjs --seq=direct,luxplus
```

`--seq=` escolhe as sequências (padrão: `request,direct,luxplus`; a assinatura com `--seq=assinatura`), `--fps=24`
muda a cadência e `--realtime` refaz a comparação com captura em tempo real.

- `prototype.test.mjs` — fórmulas, datas, FEFO, saldos, estados, ordem da coreografia, tokens (`scanCss` do DS),
  terminologia e isolamento.
- `check.mjs` — no navegador, por sequência, nos dois formatos e nos instantes do `qa` de cada sequência: valores exibidos, selo, sobreposição, limites do
  quadro, texto mínimo no arquivo final, axe (WCAG 2.2 AA), fontes, rede, console, calendário, varredura de sobreposição em todos os quadros e determinismo.
- `capture.mjs` — quadros RGBA → prévias H.264, composições sobre placas com movimento, um trecho ProRes 4444 com
  alfa e stills 4K; valida o que foi **codificado** (codec, alfa, dimensões, fps, duração, quadros, PSNR, cores) e
  (opcional) compara com captura em tempo real. Saída em `out/etapa-a/<seq>-<fmt>-…` (fora do Git). Requer `npm ci` (Playwright, axe) e ffmpeg.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` · `demo.css` | Palco transparente; composições locais só com tokens e classes do Core (`data-lx="core"`) |
| `stage.js` | Motor de tempo: o estado de cada quadro é função de `t`; tokens de movimento do DS |
| `sequence-request.js` · `sequence-direct.js` · `sequence-luxplus.js` | Coreografia de cada modalidade nos dois formatos (cartões, instantes, marcas) e seu `qa` (pontos de verificação e de captura) |
| `sequence-assinatura.js` | Assinatura só da marca: logo oficial do manifest e a frase (6 s) |
| `sequence-creditos.js` | Painel editorial dos Créditos, conceitual e sem números: Créditos que você já tem + novos Créditos de datas depositadas = um só saldo → Request ou Direct |
| `placas.mjs` · `placas-caminhos.js` | Placas internas de teste por Second Home (Azzura à noite, Olivar de tarde e de noite), geradas com ffmpeg em `out/placas/` · caminhos usados pelas sequências |
| `sequence-prova.js` · `filme/prova/edl.js` · `filme/prova/montar.mjs` | Prova de montagem: camada editorial (título, ressalva, etiqueta interna) · EDL em dados (planos, trechos de interface, textos, narração-guia, efeitos) · montagem e validação com ffmpeg |
| `shared.js` | Peças comuns: ícones, calendário do DS, toque, faixa de noites |
| `credits-step.js` | Passo de Créditos da Request e do Direct: necessários × saldo, controle "Créditos adicionais desejados", calendário do Direito de Uso (acordeão), depósito confirmado; textos de Owner e Co-Owner |
| `rules.js` · `data.js` · `format.js` | Fórmulas canônicas · parâmetros canônicos e dados fictícios · formatação pt-BR |
| `serve.mjs` | Servidor local (127.0.0.1) restrito ao protótipo, ao DS e às fotos públicas usadas como placa |
| `check.mjs` · `capture.mjs` · `prototype.test.mjs` | Validação no navegador · captura e validação de arquivos · testes |
| `evidencias/etapa-a/` | Folhas de contato das composições, zoom das bordas do alfa e antes/depois da confirmação |
| `filme/` | Roteiro, storyboard, narração, música, motion (`ROTEIRO.md`); shot list, prompts, integração (`PRODUCAO.md`); masters atuais e verificações (`INVENTARIO.md`) |

## Fatos, decisões da demonstração e dados fictícios

**Fatos canônicos** (em `rules.js`/`data.js`, com testes):

- Créditos = PRL do período × 10 (01 §20, BR-201); validade de 24 meses por adição calendárica em UTC (BR-191,
  TECH-044).
- Luxchange Fee (na tela, "Taxa de intermediação") = maior entre 10% do PRL do período e R$ 120 (01 §24, BR-230, BR-231), com HALF_UP no valor final
  (TECH-033).
- Request: Membership, Créditos em Garantia, Fee pago antes do envio, prazo de 24 h com `expires_at = sent_at + 24 h`
  e snapshot de PRL, Créditos e Fee (PD-005, PD-007, TECH-044). Pendente não bloqueia as noites (PD-005, REQ-063).
- Garantia por FEFO, só com lotes válidos até a expiração da Request (PD-006, PD-008, TECH-071).
- Política exibida e aceita antes do envio (PD-009); sem política vigente nada avança.
- Aceite expresso do detentor; o solicitante nunca aceita a própria (BR-210, BR-211). No aceite, revalidação e, sendo
  válida, cessão + reserva + consumo da Garantia + Créditos ao cedente com originação própria, numa só operação
  (REQ-064, BR-212, BR-213). Não existe "aceita aguardando confirmação".
- Detentor Co-Owner só cede data já reservada, que segue consumida do Direito de Uso; Owner cede capacidade própria
  disponível (BR-151, TECH-022, TECH-023). Noites de [entrada, saída), check-in 14h e check-out 10h (PD-002).
- Direct: capacidade do Inventário Luxtory, sem aceite de outro Titular (BR-220); Fee pago antes da confirmação
  (TECH-082); pagamento não reserva — revalidação e então confirmação (ADR-008, TECH-080); Créditos consumidos na
  confirmação, por FEFO (BR-221, PD-008).
- Luxplus: noites adicionais do Inventário Luxtory pagas em dinheiro (01 §25, BR-240); não usa Créditos (BR-241);
  sem Luxchange Fee (BR-230 alcança só Request e Direct); política antes da confirmação (PD-009). O PRL do período é a
  referência de preço — Preço Luxplus = PRL × (1 − desconto aplicável), congelado na compra (01 §25, BR-180, BR-243,
  REQ-070); descontos e condições podem variar por Membership (BR-244).

**Decisões da demonstração** (hipóteses visuais, não especificação):

- Palco transparente com cartões sólidos `deep` (sem glass, blur ou glow — DS §13.3) e selo "Demonstração conceitual ·
  dados fictícios" em todo cartão.
- Quem solicita escolhe o período e recebe a rota ("Noites de outro Titular → Luxchange Request"). O 02 não define como
  essa capacidade é descoberta: o protótipo **não** exibe calendário, disponibilidade nem identidade de outro Titular.
- Política como etapa conceitual de aceite, sem conteúdo. Pagamento simulado, sem meio ou marca de pagamento.
- Lista de revalidação, cartão de Créditos com barra, visões "do Titular detentor" e "de quem solicitou".
- 9:16 com composição própria: um cartão por vez quando dois não cabem; nem tudo do 16:9 aparece no vertical.

**Dados fictícios** (`FICTITIOUS` em `data.js`, horário de Brasília): Second Homes *Satori Home* (Serra), *Azzura
Home* (Litoral) e *Olivar Home* (Campo) — até a v4, "Mirante · Serra", "Varanda · Litoral" e "Pátio · Campo"; solicitante "Helena", Co-Owner; PRLs, lotes e instantes sintéticos. Valores monetários
são **ilustrativos** (PRL fictício). O Luxplus usa um valor ilustrativo de estadia **não derivado** de PRL × (1 −
desconto), porque o desconto aplicável não está publicado (BR-244, P-5) e presumir 0% seria inventar um parâmetro
(TECH-001). A tela não exibe PRL, desconto nem condição comercial; o princípio canônico (PRL como referência) fica nesta
documentação, não no vídeo.

| Instante | Fato fictício derivado |
|---|---|
| Lotes de Helena | L-0001 30.000 (depósito, 18/01/2027 09:30, vence 18/01/2029 09:30) · L-0002 18.000 (cedente de Request, 22/02/2027 16:05, vence 22/02/2029 16:05) · L-0003 46.000 (depósito, 12/04/2027 10:02, vence 12/04/2029 10:02) |
| Envio 12/04/2027 10:06 | Azzura Home, 04/06 a 07/06/2027 (3 noites) · PRL R$ 5.500,00 · 55.000 em Garantia (30.000 + 18.000 + 7.000) · Fee R$ 550,00 · expira 13/04/2027 10:06 |
| Aceite 12/04/2027 10:14 | Request Aceita + Reserva Confirmada (Luxchange Request) · 55.000 consumidos · cedente recebe L-0104, 55.000, vence 12/04/2029 10:14 |
| Direct 12/04/2027 10:20 | Olivar Home, 28/05 a 29/05/2027 (1 noite) · PRL R$ 1.150,00 · 11.500 Créditos do L-0003 (FEFO) · Fee R$ 120,00 (mínimo: 10% seria R$ 115,00) · Créditos 39.000 → 27.500 |
| Luxplus 12/04/2027 10:24 | Olivar Home, 13/08 a 15/08/2027 (2 noites) · valor da estadia R$ 2.480,00 ilustrativo, em dinheiro · Créditos inalterados (27.500) |

## Coreografia (marcas de tempo)

| ms | Evento |
|---|---|
| 0 | palco vazio (entra sobre a imagem) |
| 2.400 · 3.100 | toques: entrada 04/06 · saída 07/06 (faixa de noites) |
| 4.200 | rota: noites de outro Titular → Luxchange Request |
| 5.500 | corte sugerido · início de R2 |
| 8.800 · 10.000 | toques: aceite da política (conceitual) · Pagar Fee e enviar |
| 11.700 | commit do envio: Request Pendente e Garantia constituída no mesmo instante (barra de Créditos) |
| 15.900 | corte sugerido · início de R3/R4 · **marcador narrativo**: "O outro Titular recebe a solicitação" |
| 18.500 | toque: Aceitar (Titular detentor) → revalidação |
| 20.300 | o cartão do detentor sai (revalidação concluída) |
| 20.600 | aceite válido: Request Aceita + Reserva Confirmada entram juntas (mesma operação) |
| 25.000 | fim (pausas estáveis servem a narração, legendas, som e cortes) |

As marcas também estão em `window.__demo.marks`, para sincronizar efeitos de toque e som na pós. Regra das trocas: num
mesmo lugar do quadro, o cartão novo só entra depois da saída do anterior (`duration.moderate`), nunca em crossfade de
textos diferentes; `check.mjs` varre os 750 quadros de cada formato.

## Direção de arte para a pós

- Preservar os elementos principais da fotografia: nenhum cartão sobre rostos, pessoas ou pontos focais. Os assets são
  quadros inteiros com alfa — mover ou espelhar a camada na montagem resolve o enquadramento sem nova variante.
- Escolher imagens com espaço negativo do lado do cartão (16:9: terço direito; 9:16: faixa central e inferior). Na placa
  clara de teste o cartão da direita encobre as pessoas na piscina: é caso de reposicionar a camada ou trocar a foto.
- Manter a mesma Second Home ao longo da jornada (o nome nos cartões é "Azzura Home" do início ao fim, com "Litoral ·
  Second Home Luxtory" em segundo plano).
- Cartão `deep` sobre céu azul escuro perde separação (só a hairline Warm Sand marca a borda): preferir zonas mais
  claras da imagem atrás do cartão.
- Fotos ilustrativas nunca como prova de imóvel real disponível: identificar como imagem ilustrativa e não usar marca de
  Brand Partner sem aprovação (BR-015). As placas deste protótipo são só teste interno, não footage aprovado.
- Mudança de perspectiva (solicitante → detentor): o cartão diz "Visão do Titular detentor · Co-Owner" e "Request
  recebida"; sem áudio, usar o marcador narrativo de 15,9 s (texto e duração definidos com a narração).

## Evidências da Etapa A

Medidas pelos scripts acima (`out/etapa-a/check.json` e `validation.json`). Em `evidencias/etapa-a/`: folhas de
contato, zoom de borda do alfa e `transicao-*.jpg` — a confirmação antes (linha de cima: 20,00 · 20,13 · 20,20 · 20,27 ·
20,40 s, textos misturados) e depois da correção (linha de baixo: 20,00 · 20,33 · 20,53 · 20,67 · 21,00 s), extraídas
dos MP4 codificados sobre a placa escura.

| Verificação | 16:9 | 9:16 |
|---|---|---|
| Testes (`prototype.test.mjs`) | 15/15 | — |
| `check.mjs`: 7 instantes, valores e estados, selo, sobreposição, axe | conforme, axe 0 | conforme, axe 0 |
| Varredura dos 750 quadros: cartões que se cruzam visíveis juntos | 0 (antes da correção: 7) | 0 (antes: 16) |
| Texto mínimo no arquivo final | 20 px (1080p) | 32 px (1920 de altura) |
| Determinismo (mesmo quadro, dois caminhos) | bytes idênticos | bytes idênticos |
| Prévia H.264 | 1920×1080 · 30 fps · 750 quadros · 25,0 s · BT.709 · 1,5 MB | 1080×1920 · idem · 1,8 MB |
| ProRes 4444 (aceite → confirmação, 18,3–22,3 s) | 1920×1080 · `yuva444p12le` · 120 quadros · 4,0 s · 45 MB | 1080×1920 · 64 MB |
| Fidelidade do alfa num quadro de transição (PSNR R/G/B/A) | 51 / 56 / 54 / 79 dB | 49 / 54 / 51 / 78 dB |
| Deep `#003D52` (0,61,82) no cartão | ProRes (0,61,81) · MP4 (0,60,83) | ProRes (0,60,81) · MP4 (0,58,79) |
| Fora dos cartões (alfa) | 0 | 0 |
| Placa com push-in (salto máx. / mediana, luma) | clara 0,096 / 0,039 · escura 0,176 / 0,157 | clara 0,062 / 0,019 · escura 0,139 / 0,120 |
| Transição da interface (entrada do cartão) | 13 quadros, nenhum repetido | 13 quadros, nenhum repetido |

**Captura automatizada × tempo real, ambas em 1920×1080 pixels reais.** A automatizada é exata por construção
(750/750 quadros a 30 fps, `seek(t)`), tem alfa e repete os mesmos bytes; ~100 ms por quadro (25 s em ~75 s). A
gravação em tempo real (screencast do Chromium, equivalente a gravar a tela) não tem transparência, entrega quadros
irregulares (8 atrasados durante o movimento em 12 s, intervalo máximo de 245 ms) e não se repete igual. Para
composição sobre vídeo, a automatizada é a escolha; a prévia ao vivo continua útil para revisão e gravação informal.
O `zoompan` do ffmpeg foi descartado para a placa: anda em pixels inteiros (saltos de até 2,69 de luma).

## Evidências das Etapas B e C

Mesma régua da Etapa A (`out/etapa-a/check.json`, `validation-<seq>.json`; folhas de contato e zoom de borda
`*-direct-*`, `*-luxplus-*` em `evidencias/etapa-a/`). A Request refatorada (peças comuns em `shared.js`) gera os
mesmos bytes da aprovada: 14 quadros de referência idênticos por sha256.

| Verificação | Direct | Luxplus | Assinatura |
|---|---|---|---|
| Testes (`prototype.test.mjs`, total 23) | Créditos 11.500, Fee mínimo R$ 120, FEFO L-0003, 39.000 → 27.500, sem Garantia nem aceite | R$ 2.480 ilustrativo, Créditos 27.500 intocados, sem Fee/PRL/desconto | logo do manifest (chave + sha256), `<img>`, fade puro 900 ms, linha legal |
| `check.mjs` (16:9 e 9:16) | 5 instantes, axe 0, sobreposição 0 | 5 instantes, axe 0, sobreposição 0 | axe 0, sobreposição 0 |
| Prévia H.264 | 420 quadros · 14,0 s · 30 fps | 465 quadros · 15,5 s · 30 fps | 180 quadros · 6,0 s |
| ProRes 4444 (trecho) | pagamento → confirmação, 5 s, 67–73 MB | pagamento → confirmação, 5 s, 65–66 MB | 6 s, 27–35 MB (opaco) |
| Alfa decodificado (PSNR R/G/B/A) | ≥ 50 / 55 / 52 / 77 dB | ≥ 50 / 55 / 52 / 75 dB | ≥ 50 dB (RGB) |
| Cor Deep `#003D52` no cartão (ProRes) · fora do cartão | (0,61–62,82,255) · alfa 0 | (0,61,82,255) · alfa 0 | (0,61,82,255) |
| Transição de entrada da reserva | nenhum quadro repetido | nenhum quadro repetido | — |

Placa de teste de Direct e Luxplus (até a v4): a mesma imagem de interior (espaço negativo, sem pessoas) para o imóvel
do campo — continuidade de uma só Second Home nas duas modalidades. Só teste interno. Correção da v2: a K05 é do
anteprojeto Kaizen e **não** representa o imóvel do campo; a referência de cada imóvel fictício passa a ser a
imagem-chave mestra gerada e aprovada (`filme/PRODUCAO.md` §2). Na v5, Direct e Luxplus usam campos neutros da *Olivar
Home* (`placas.mjs`).

## Prova de montagem (Etapa C v2)

```bash
node prototypes/luxtory-club-video/filme/prova/montar.mjs
```

Monta um trecho da Request como no master (C05, C07, C08, C09 de `filme/ROTEIRO.md`) a partir da EDL
(`filme/prova/edl.js`). Camadas: imagem → foco suavizado enquanto há interface → interface (quadros de `out/etapa-a`,
sem reanimar) → camada editorial do DS (`?seq=prova`) → fade. Áudio com efeitos e ambientes sintéticos gerados aqui,
loudness medido (−20 LUFS só com efeitos; −14 LUFS com voz) e true peak ≤ −1 dBTP.

- **Placeholders identificados:** foto provisória do site para a Azzura Home e um fundo neutro para S09; etiqueta
  "Prova interna · imagens e sons provisórios" em todos os quadros. Não é o filme.
- **Pronta para receber os assets:** footage aprovado em `out/entrada/<plano>.mp4|.mov` (ex.: `S06.mp4`), voz em
  `out/entrada/vo.wav` e trilha em `out/entrada/trilha.wav`, alinhadas ao tempo da prova. O script usa o arquivo no
  lugar do placeholder (cadência, escala e duração ajustadas; trilha com ducking sob a voz). `--entrada=` e `--saida=`
  trocam as pastas. Caminho testado com arquivos fictícios fora do repositório.
- **Saídas** (`out/prova/`, fora do Git): `prova-request-16x9.mp4` (limpa), `prova-request-16x9-revisao.mp4` (tarja com
  plano, status do placeholder, narração-guia e timecode), `prova-request-vo-guia.srt`, folha de contato e
  `prova.json` (o que entrou e medições).
- **Validação do arquivo codificado:** 1920×1080 (revisão 1920×1200), 30 fps, 594/594 quadros, BT.709, áudio 48 kHz
  estéreo, loudness e true peak. Continuidade por luma: só os três cortes previstos; a interface sai em fade (o teste
  da EDL impede que ela suma num quadro).

## Prévia interna × exportação final

Um único parâmetro separa as duas, sem ambientes nem feature flags. A prévia interna é o padrão e carrega as
identificações úteis ao QA ("Demonstração conceitual · dados fictícios", "Prova interna", tarja de revisão). A
exportação final é para o comercial:

```bash
node prototypes/luxtory-club-video/check.mjs --final --seq=request,direct,luxplus
```

```bash
node prototypes/luxtory-club-video/capture.mjs --final --seq=request
```

```bash
node prototypes/luxtory-club-video/filme/prova/montar.mjs --final
```

- **Cartões.** Sem selo em modo algum desde a revisão comercial de 2026-11-15; `check.mjs` barra jargões e marcas de
  protótipo em todos os quadros-chave, e `--final` acrescenta a etiqueta "Prova interna".
- **Saída separada.** `out/final/`, sem tocar nas evidências.
- **Recusa de placeholders.** A montagem final para antes de renderizar se algum plano não tiver footage aprovado em
  `out/entrada/` ou se faltar voz ou trilha.

Exportar não é publicar: a publicação depende da verificação de prontidão do produto e da aprovação da comunicação
(`filme/PRODUCAO.md` §5).

## Revisão de UX e comercial (2026-11-15)

**Passo de Créditos** (`credits-step.js`), na Request e no Direct, depois da escolha da estadia:

1. **Créditos necessários × saldo válido disponível**, e quanto falta. Uma decisão: continuar com o saldo (Direct:
   39.000 para 11.500) ou complementar (Request: 48.000 para 55.000, faltam 7.000).
2. **Complementação opcional:**
   - o controle "Créditos adicionais desejados" só oferece metas possíveis com datas inteiras (na v4, por erro, só as
     somas acumuladas 0, 16.000, 32.000 e 46.000; corrigido na v5 para todas as combinações, abaixo);
   - o calendário navegável "Selecionar datas do meu Direito de Uso" fica num acordeão e mostra elegível, indisponível
     (menos de 14 dias), comprometida e não reservada, com a classificação do mês e a legenda;
   - os dois têm uma fonte única de verdade: as datas selecionadas. Na v5, o controle leva a 14.000 (16/05, o mínimo);
     os toques em 14/05 e 15/05, a 30.000 e 46.000.
3. **Depósito confirmado** como operação própria: 46.000 novos Créditos, saldo de 94.000. Só então vem a revisão.

Depois do depósito: Taxa de intermediação de R$ 550,00, envio, Garantia de 55.000 (30.000 + 18.000 + 7.000 do lote novo,
mostrados por origem), aceite, revalidação e confirmação; restam 39.000. O Owner tem textos e estados próprios (sem
Direito de Uso), e o Luxplus continua em dinheiro, sem passo de Créditos.

**Revisão comercial.** Nas interfaces:
- "Taxa de intermediação" no lugar de "Luxchange Fee";
- sem "PRL do período", "Second Home fictícia", selos, "Pagamento simulado", "Etapa conceitual", IDs de lote nem
  timestamps;
- no Luxplus, a menção ao dinheiro sem repetição.

O conceito canônico continua no domínio (`luxchangeFee`). O nome comercial ainda deve ser harmonizado com os documentos
comerciais e jurídicos.

**Inventário.** `filme/INVENTARIO.md` lista os masters atuais (duração, formato, tamanho, sha256), o que mudou em cada um e as verificações; comparativos antes/depois em `evidencias/revisao-ux/`.

**Versões anteriores.** Os entregáveis do commit `2e6e68c` (vídeos, ProRes, stills, relatórios e evidências) e os
quadros legados da Etapa A estão em `out/referencia-2e6e68c/`, só como referência de regressão. Os masters atuais
mantêm os mesmos nomes em `out/etapa-a/` e `out/prova/`.

## Auditoria final de UX e identidade (v5, 2026-11-15)

**Combinações do controle.** As metas são todas as somas distintas de datas elegíveis inteiras (`rules.js#depositStops`,
por enumeração exata dos subconjuntos; recusa acima de 16 datas em vez de presumir). No cenário (14/05 = 16.000,
15/05 = 16.000, 16/05 = 14.000): **0, 14.000, 16.000, 30.000, 32.000 e 46.000**. O mínimo que cobre os 7.000 que faltam
é 14.000, com 16/05 (`rules.js#minimumCovering`, `dep.minimum`).

**Sugestão determinística** (`rules.js#selectionForTarget`), usada só quando é o controle que se move. Entre as seleções
com exatamente aquela soma, vence:

1. a que mais preserva as datas já escolhidas;
2. a com menos datas;
3. a com as datas mais cedo.

A escolha explícita do Titular no calendário sempre prevalece: o calendário não passa pela sugestão. Exemplos testados:
de [] para 30.000 → 14 e 16/05; de [15/05] para 30.000 → 15 e 16/05; 32.000 → 14 e 15/05; e de volta de 46.000 para
14.000 → 16/05.

**Coreografia da Request.** Controle a 14.000 (16/05, o mínimo) → toque em 14/05 (30.000) → toque em 15/05 (46.000),
"para as próximas experiências". A dica no cartão diz: "Mínimo para esta reserva: 14.000 (1 data). O que passar disso
fica no saldo para as próximas experiências." A trilha tem uma marca por meta e a escala mostra só 0 e o máximo.
Cada valor troca sem crossfade (saída de 280 ms + entrada de 480 ms), então os toques ficam espaçados para que cada meta
seja lida. Tempo plenamente visível, medido no navegador:

| Meta | 16:9 | 9:16 |
|---|---|---|
| 14.000 | 0,93 s | 2,57 s |
| 30.000 | 0,83 s (antes ≈ 0,04 s) | 0,77 s (antes nunca chegava à opacidade plena) |
| 46.000 | 1,47 s | 1,07 s |

O valor final segue visível até a saída do cartão. Tempos: controle em 10,7 s / 9,5 s; toques em 12,2 e 13,6 s /
12,65 e 14,0 s.

**O controle é coreografado para o vídeo.** No protótipo ele é `role="slider"` com `aria-valuemin/max/now/valuetext`,
mas `tabindex="-1"`: não recebe foco nem teclado, porque o filme não é interativo e o valor vem da linha do tempo.
Especificação para o produto, quando existir:

- foco visível do DS (`:focus-visible`), alvo mínimo de toque;
- setas e Page Up/Page Down andam para a meta alcançável anterior ou seguinte (nunca valores intermediários);
- Home vai a 0 e End, ao máximo;
- `aria-valuetext` com Créditos e datas ("30.000 Créditos, 14 e 16 de maio");
- arrastar solta na meta mais próxima;
- os dias do calendário são botões com `aria-pressed` e o estado no nome acessível (no protótipo, só rótulos).

A ausência de violações detectadas pelo axe não substitui essa validação de interação, que fica para o produto.

**Depósito uma única vez.** O C04 (`sequence-creditos.js`) passa a ser conceitual e sem números: "Créditos válidos que
você já tem" + "Novos Créditos, de datas elegíveis depositadas" = "Um só saldo para viver outras Second Homes", 10,5 s. O saldo de
Helena (48.000 + 46.000 = 94.000) se forma só na Request. O teste garante que o markup do C04 não tem dígitos nem
"Helena".

**Second Homes.** *Satori Home* (Serra), *Azzura Home* (Litoral) e *Olivar Home* (Campo), propostas sujeitas à
validação comercial e de marca. O nome é o protagonista e a região vem em segundo plano ("Litoral · Second Home
Luxtory"); os cartões não repetem "Home Edition". Os identificadores internos (`mirante`, `varanda`, `patio`) não
mudam.

**Placas por imóvel** (`placas.mjs`, `out/placas/`, fora do Git):

| Sequência | Placa |
|---|---|
| Request | Azzura: litoral (clara) e a mesma foto escurecida (escura) |
| Direct | Olivar: campo neutro de tarde |
| Luxplus | Olivar: campo neutro de noite |
| Créditos | Satori: pedra (`luxury-property-facade-hero.jpg`) |

```bash
node prototypes/luxtory-club-video/placas.mjs --force
```

`capture.mjs` gera as que faltam antes de capturar.

**Estados e área segura.**

- "Selecionada" ganha um traço de check, além da cor. O ponto marca a reserva, e o riscado marca o que está indisponível
  ou comprometido.
- No 9:16, o calendário do depósito começa a 8,5% da altura (antes 3,6%), sem reduzir a tipografia do calendário: o
  resumo do acordeão cabe em uma linha e a legenda passa a três colunas.
- `check.mjs` reprova qualquer instante do 9:16 com conteúdo acima de 8%.

**Evidências.** `evidencias/v5/`: combinações do controle nos dois formatos e antes/depois da v4 para a v5, extraídos
dos arquivos codificados. Inventário dos masters vigentes em `filme/INVENTARIO.md`.

**Versões anteriores.** Os entregáveis do commit `f5810a6` (v4) estão em `out/referencia-f5810a6/`, com os mesmos nomes.

## Auditoria econômica e ajustes pontuais (v6, 2026-11-18)

**Economia.** Benchmark de mercado, matriz de PRL por Second Home e simulação de impacto em `filme/ECONOMIA.md`.
Nenhum PRL, Crédito, taxa ou valor do Luxplus foi alterado: a mudança depende de aprovação comercial e acontece uma
única vez, no congelamento da biblioteca.

**Ajustes de UX** (no código e nos testes; os vídeos só são regenerados no congelamento):

- **Unidade:** o número principal do controle leva "Créditos" ao lado (no 9:16) ou logo abaixo (no 16:9, para o
  rótulo seguir em uma linha). Nenhum valor em reais nem PRL entra na tela de seleção.
- **Depósito:** "Depositar datas e gerar Créditos" nasce desabilitada (`aria-disabled`, estilo do Core) enquanto
  nenhuma data está selecionada e se habilita na primeira seleção. O estado vem da linha do tempo, porque o motor
  remove o atributo antes do primeiro passo.
- **C04 mais enxuto:**
  - a soma termina em "Um só saldo para viver outras Second Homes" (sai "lotes", termo técnico);
  - a nota fica numa linha só: "Com Membership vigente, em Luxchange Request ou Direct.";
  - a ressalva passa a usar a frase aprovada do FAQ: "Créditos não são moeda nem garantem disponibilidade.";
  - permanecem as condições exigidas pela L3 de `b2c.md`: Membership vigente, Crédito não é moeda e a regra do
    Co-Owner.

**Placas.**
- A métrica de movimento lia números em notação científica pela metade (9.645e-05 virava 9,645). Por isso as placas
  lisas da Olivar "falhavam", e o grão da v5 só mascarava a leitura errada.
- Correções:
  - leitor corrigido em `capture.mjs`;
  - grão removido;
  - as placas sem fotografia (`STATIC_PLATES` em `placas-caminhos.js`) passam a placeholders estáticos: sem push-in,
    validados como parados (variação máxima de 0,057 nível de luma na codificação final, contra o limiar de 0,25).
- As placas fotográficas mantêm o push-in e a validação de movimento contínuo.

## Auditoria crítica da v6 (v6.1, 2026-11-18)

- **Economia** (`filme/ECONOMIA.md`):
  - o Luxplus de agosto não é declarado irregular: faltam os PRLs de 13 e 14/08 e o desconto aplicável;
  - a comparação separa preço público, PRL, perfil, porte e serviços, estadia mínima, sazonalidade do destino,
    classificação canônica e condições pendentes;
  - entram os anúncios verificados diretamente pela Luxtory;
  - a sensibilidade econômica (só o PRL muda) fica separada do cenário narrativo (lotes reconfigurados);
  - posicionamento recomendado: alto padrão, sem adotar números antes das decisões.
- **Calendário do depósito:** abre direto no primeiro mês com datas elegíveis (`credits-step.js#openingMonth`). Sai o
  toque de navegação de abril para maio; os demais meses continuam navegáveis no produto.
- **Depósito:** os testes garantem que nenhuma ação (toque, processamento, confirmação) acontece enquanto o botão está
  desabilitado, que a habilitação coincide com a primeira seleção e que toda data selecionada é elegível. No
  protótipo, a ação é coreografada e não tem manipulador de clique. No produto, o botão desabilitado precisa bloquear
  a ativação (`disabled`, ou `aria-disabled` com a ativação impedida).
- **C04:** as ressalvas exigidas pela L3 ficam numa nota só, no rodapé do painel, com a frase aprovada do FAQ. Ela
  entra quando o depósito é mencionado e fica 6,7 s, para 15 palavras. A faixa inferior do quadro fica livre.
  Contrapartida: entre a menção ao depósito e a soma, o espaço das linhas seguintes fica reservado acima da nota.
- **Sem captura completa nesta rodada:** os vídeos são regenerados uma única vez no congelamento.

## Transição para a produção cinematográfica (v6.2, 2026-11-18)

- **Proposta de congelamento econômico** (`filme/ECONOMIA.md` §12): uma recomendada e uma conservadora, com PRLs por
  data, lotes fictícios, taxas e Luxplus pela fórmula. Conferida numa cópia descartável do repositório: `check.mjs`
  conforme e números de 6 dígitos cabendo nos dois formatos. `data.js` segue inalterado até a aprovação.
- **Pacote de direção de arte** das três Second Homes e plano da prova de viabilidade em `filme/DIRECAO-DE-ARTE.md`.
  Só há prompts e especificações; nenhum footage foi produzido.

## Preparação da prova cinematográfica (v6.3, 2026-11-18)

- **Kit de execução:** `filme/PROVA-CINEMATOGRAFICA.md`, para as três tomadas (S06, S02, S15). Inclui master a 24 fps
  com Veo 3.1 (fontes oficiais), orçamento com preços oficiais (≈ US$ 146), imagens-chave e prompts, critérios de
  aprovação e contingências. Nada foi gerado nem contratado.
- **Restrição oficial:** os modos de imagem → vídeo e por referência do Veo não geram crianças. O S02 da prova usa
  Helena e o parceiro, e os planos com crianças dependem de decisão da Luxtory.
- **Congelamento econômico:**
  - Direct de 1 noite validado nos canônicos (REQ-035, REQ-065, PD-009);
  - Luxplus aguarda a decisão do desconto (recomendado: Membership de demonstração sem desconto, se aprovado);
  - os 12 testes estão classificados regra × literal em `filme/ECONOMIA.md` §12.5;
  - os testes da taxa (com o ramo do mínimo de R$ 120) e da sugestão determinística usam valores sintéticos fixos e
    não dependem mais do PRL do filme. Com a proposta recomendada, restam 10 falhas, todas de números literais.
- **24 fps:** `check.mjs --fps=24` (a varredura quadro a quadro segue a cadência pedida; o padrão continua 30) dá
  conforme nas 5 sequências e nos 2 formatos.

## Prova cinematográfica escalonada (v6.4, 2026-11-18)

- **Kit corrigido:** `filme/PROVA-CINEMATOGRAFICA.md`.
  - Orçamento só vídeo pela tabela oficial do Google Cloud. O teto anterior cai de ≈ US$ 146 para ≈ US$ 90 com as
    mesmas quantidades, e a primeira prova vira três estágios com tetos (A US$ 5, B US$ 8, C US$ 20; ≈ US$ 38 com
    tributos).
  - Primeiro quadro composto antes de animar, mais um pré-voo na conta antes de qualquer geração paga.
- **Luxplus:** `rules.js#luxplusPrice` aplica a fórmula canônica e recusa calcular sem desconto explícito. Fica pronto
  para o congelamento; o filme continua com o valor ilustrativo até a decisão.

## Liberação técnica da prova (v6.5, 2026-11-18)

- **Vídeo:** Gemini Omni 1.2 Flash (`gemini-omni-1.2-flash`, GA, cobrança por uso em tokens). O Veo 3.1 GA no Google
  Cloud não oferece pagamento por uso: o acesso é "fixed quota" ou Provisioned Throughput. Ele fica como candidato de
  qualidade se o acesso for comprovado sem compromisso.
- **Imagem:** Gemini Nano Banana 2.1 (`gemini-nano-banana-2.1`, GA; até 14 imagens de entrada; 1K, 2K e 4K).
- **Orçamento:** ≈ US$ 13 a 21 estimados, dentro dos tetos de US$ 5, 8 e 20.
- **Cadência:** a do Omni não é documentada e será medida no primeiro clipe. Detalhes em
  `filme/PROVA-CINEMATOGRAFICA.md`.

## Integração na pós (Etapa A)

- **Alfa straight** (não premultiplicado) nos PNG e no ProRes 4444; interpretar como *Straight* no editor.
- **Rec.709** (matriz BT.709, faixa limitada) nos MP4 e no MOV; validado por amostragem de cor após o encode.
- **30 fps** por padrão; outra cadência é um parâmetro (`--fps=24`, `--fps=25`), sem retrabalho.
- Câmera (push-in, parallax) é da pós, sobre os stills 4K e os quadros transparentes; na interface o movimento segue os
  tokens do DS (fade-up de 8 px, 160–900 ms, sem zoom, pulse ou drift).
- Placas usadas nas composições de teste: fotos públicas do site, só para avaliação interna; não fazem parte dos assets.
