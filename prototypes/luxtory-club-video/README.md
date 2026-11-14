# Luxtory Club — protótipo de assets para vídeo (demonstração conceitual)

> **Demonstração conceitual com dados fictícios.** Não é produto, não especifica UX, não acessa banco, API, rede
> externa, Supabase, Vercel ou Production, e não implementa nada do R3. Serve só para gerar assets de interface
> (transparentes, editáveis) que a pós-produção compõe sobre imagens cinematográficas.

**Etapa A — prova de conceito:** Luxchange Request completa — escolha das noites (R1), revisão, política, pagamento
do Fee e Pendente (R2), aceite do Titular detentor, revalidação e, na mesma operação, Request Aceita + Reserva
Confirmada (R3/R4 resumidos). 16:9 e 9:16, 25 s cada. Etapas B (biblioteca) e C (pacote de pós) ainda não começaram.

## Ver

```bash
node prototypes/luxtory-club-video/serve.mjs
```

Abra `http://127.0.0.1:4173/prototypes/luxtory-club-video/?fmt=16x9` (ou `?fmt=9x16`). Toca sozinho; **espaço** pausa
e continua, **R** reinicia. `&t=13800` congela um instante; `&bg=plate` mostra uma placa de prévia por trás.

## Regenerar e validar

```bash
node --test prototypes/luxtory-club-video/prototype.test.mjs
```

```bash
node prototypes/luxtory-club-video/check.mjs
```

```bash
node prototypes/luxtory-club-video/capture.mjs
```

- `prototype.test.mjs` — fórmulas, datas, FEFO, saldos, estados, ordem da coreografia, tokens (`scanCss` do DS),
  terminologia e isolamento.
- `check.mjs` — no navegador, nos dois formatos e em 7 instantes: valores exibidos, selo, sobreposição, limites do
  quadro, texto mínimo no arquivo final, axe (WCAG 2.2 AA), fontes, rede, console, calendário e determinismo.
- `capture.mjs` — quadros RGBA → prévias H.264, composições sobre placas com movimento, um trecho ProRes 4444 com
  alfa e stills 4K; valida o que foi **codificado** (codec, alfa, dimensões, fps, duração, quadros, PSNR, cores) e
  compara com captura em tempo real. Saída em `out/etapa-a/` (fora do Git). Requer `npm ci` (Playwright, axe) e ffmpeg.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` · `demo.css` | Palco transparente; composições locais só com tokens e classes do Core (`data-lx="core"`) |
| `stage.js` | Motor de tempo: o estado de cada quadro é função de `t`; tokens de movimento do DS |
| `sequence-request.js` | Coreografia da Request nos dois formatos (cartões, instantes, marcas) |
| `rules.js` · `data.js` · `format.js` | Fórmulas canônicas · parâmetros canônicos e dados fictícios · formatação pt-BR |
| `serve.mjs` | Servidor local (127.0.0.1) restrito ao protótipo, ao DS e às fotos públicas usadas como placa |
| `check.mjs` · `capture.mjs` · `prototype.test.mjs` | Validação no navegador · captura e validação de arquivos · testes |
| `evidencias/etapa-a/` | Folhas de contato das composições e zoom das bordas do alfa |

## Fatos, decisões da demonstração e dados fictícios

**Fatos canônicos** (em `rules.js`/`data.js`, com testes):

- Créditos = PRL do período × 10 (01 §20, BR-201); validade de 24 meses por adição calendárica em UTC (BR-191,
  TECH-044).
- Luxchange Fee = maior entre 10% do PRL do período e R$ 120 (01 §24, BR-230, BR-231), com HALF_UP no valor final
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

**Decisões da demonstração** (hipóteses visuais, não especificação):

- Palco transparente com cartões sólidos `deep` (sem glass, blur ou glow — DS §13.3) e selo "Demonstração conceitual ·
  dados fictícios" em todo cartão.
- Quem solicita escolhe o período e recebe a rota ("Noites de outro Titular → Luxchange Request"). O 02 não define como
  essa capacidade é descoberta: o protótipo **não** exibe calendário, disponibilidade nem identidade de outro Titular.
- Política como etapa conceitual de aceite, sem conteúdo. Pagamento simulado, sem meio ou marca de pagamento.
- Lista de revalidação, cartão de Créditos com barra, visões "do Titular detentor" e "de quem solicitou".
- 9:16 com composição própria: um cartão por vez quando dois não cabem; nem tudo do 16:9 aparece no vertical.

**Dados fictícios** (`FICTITIOUS` em `data.js`, horário de Brasília): Second Homes "Mirante · Serra", "Varanda ·
Litoral", "Pátio · Campo"; solicitante "Helena", Co-Owner; PRLs, lotes e instantes sintéticos. Valores monetários
são **ilustrativos** (PRL fictício). O Luxplus usa um valor ilustrativo de estadia **não derivado** de PRL × (1 −
desconto), porque o desconto aplicável não está definido (BR-244, P-5).

| Instante | Fato fictício derivado |
|---|---|
| Lotes de Helena | L-0001 30.000 (depósito, 18/01/2027 09:30, vence 18/01/2029 09:30) · L-0002 18.000 (cedente de Request, 22/02/2027 16:05, vence 22/02/2029 16:05) · L-0003 46.000 (depósito, 12/04/2027 10:02, vence 12/04/2029 10:02) |
| Envio 12/04/2027 10:06 | Varanda · Litoral, 04/06 a 07/06/2027 (3 noites) · PRL R$ 5.500,00 · 55.000 em Garantia (30.000 + 18.000 + 7.000) · Fee R$ 550,00 · expira 13/04/2027 10:06 |
| Aceite 12/04/2027 10:14 | Request Aceita + Reserva Confirmada (Luxchange Request) · 55.000 consumidos · cedente recebe L-0104, 55.000, vence 12/04/2029 10:14 |

## Coreografia (marcas de tempo)

| ms | Evento |
|---|---|
| 0 | palco vazio (entra sobre a imagem) |
| 2.400 · 3.100 | toques: entrada 04/06 · saída 07/06 (faixa de noites) |
| 4.200 | rota: noites de outro Titular → Luxchange Request |
| 5.500 | corte sugerido · início de R2 |
| 8.800 · 10.000 | toques: aceite da política (conceitual) · Pagar Fee e enviar |
| 11.600 | Request Pendente; Garantia constituída (barra de Créditos) |
| 15.900 | corte sugerido · início de R3/R4 |
| 18.500 | toque: Aceitar (Titular detentor) → revalidação |
| 20.100 | aceite válido: Request Aceita + Reserva Confirmada no mesmo quadro |
| 25.000 | fim |

As marcas também estão em `window.__demo.marks`, para sincronizar efeitos de toque e som na pós.

## Integração na pós (Etapa A)

- **Alfa straight** (não premultiplicado) nos PNG e no ProRes 4444; interpretar como *Straight* no editor.
- **Rec.709** (matriz BT.709, faixa limitada) nos MP4 e no MOV; validado por amostragem de cor após o encode.
- **30 fps** por padrão; outra cadência é um parâmetro (`--fps=24`, `--fps=25`), sem retrabalho.
- Câmera (push-in, parallax) é da pós, sobre os stills 4K e os quadros transparentes; na interface o movimento segue os
  tokens do DS (fade-up de 8 px, 160–900 ms, sem zoom, pulse ou drift).
- Placas usadas nas composições de teste: fotos públicas do site, só para avaliação interna; não fazem parte dos assets.
