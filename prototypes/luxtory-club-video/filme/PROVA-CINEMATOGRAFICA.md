# Prova cinematográfica: produção premium com custo adicional zero (v7.1)

> **Restrição da Luxtory (18/11/2026):** usar só o que já está pago (ChatGPT, com geração e edição de imagens no plano
> atual; Claude Code; Codex no acesso existente) e ferramentas locais ou gratuitas (FFmpeg, Blender, Kdenlive,
> Audacity), stock gratuito com licença comercial verificada e vídeo gerado gratuito só com direito de reuso
> verificado.
>
> Não entra:
> - contratação, assinatura ou teste que peça cartão;
> - pagamento por API ou créditos de geração (a assinatura de um aplicativo não é crédito de API);
> - funcionalidade premium de ferramenta gratuita.
>
> Os planos v6.3 a v6.5, que dependiam de APIs pagas, ficam só no histórico do Git.
>
> Complementa `DIRECAO-DE-ARTE.md` (bíblias, descrições e prompts de referência). Fontes consultadas em 18/11/2026;
> licenças e limites gratuitos mudam e são reconferidos no dia do download.

## 1. Ferramentas e o que cada uma faz

| Função | Ferramenta | O que está verificado | Limites e cuidados |
|---|---|---|---|
| Arquitetura exclusiva: imagens-chave, edições, variações verticais | **ChatGPT, imagens** (plano atual) | a saída pertence ao usuário pelos [Termos de Uso](https://openai.com/policies/row-terms-of-use/); as imagens trazem C2PA e SynthID ([proveniência](https://help.openai.com/en/articles/8912793-c2pa-and-synthid-in-openai-generated-images)) | ≈ 1,5 MP (paisagem 3:2, retrato 2:3, quadrado); cada formato do filme pede a sua imagem; uma edição regenera a imagem, então a continuidade é conferida a cada versão |
| Vídeo gerado pelo ChatGPT | **não existe mais:** o Sora foi descontinuado em 26/04/2026 ([OpenAI](https://openai.com/index/sora-is-here/)) | — | — |
| Vídeo gerado gratuito | **Google Vids** (conta pessoal, "Animate" de 8 s, limite mensal) — **opcional** | gratuito para contas pessoais ([ajuda](https://support.google.com/docs/answer/16143507?hl=en), [disponibilidade](https://support.google.com/docs/answer/15609411?hl=en)) | exportar em MP4 é uma função do produto, não uma licença; o direito de reuso comercial fora do Vids não está confirmado nos termos oficiais. Uma orientação da comunidade não equivale a proibição contratual, nem a exportação equivale a autorização. **Sem confirmação oficial, clipe do Vids é só prova interna.** Nenhum plano depende dele |
| Câmera sobre imagem | **Claude Code + FFmpeg** (`montar.mjs --edl=cinema`, já implementado) | push-in, pan, tilt e grua simulada com superamostragem 2× e interpolação subpixel; tremor medido de 0,02 px por quadro no teste | é movimento de **enquadramento**, não paralaxe: a foto não tem profundidade nem o que estava oculto atrás dos objetos |
| Paralaxe real | **Blender** (gratuito, instalado só quando houver ganho perceptível num plano) | — | exige camadas reais: fundo e primeiro plano gerados separadamente no ChatGPT, com o fundo completo atrás do objeto. Profundidade estimada de uma foto única estica bordas e dá aspecto de CGI. Um quadro estático elegante é melhor que movimento artificial. Modelos locais de profundidade só com necessidade demonstrada num plano |
| Gesto humano real | **Pexels, Pixabay, Mixkit** | Pexels e Pixabay permitem uso comercial sem atribuição ([Pexels](https://www.pexels.com/license/), [Pixabay](https://pixabay.com/service/license-summary/)); a Mixkit tem itens com licença gratuita e itens com licença restrita, conferidos clipe a clipe ([Mixkit](https://mixkit.co/license/)) | as licenças não garantem autorização das pessoas filmadas (§6); casa do clipe ≠ casa do filme: só planos sem arquitetura identificável |
| Trilha e efeitos | **Pixabay Music**; Mixkit só com a licença do item conferida | uso em vídeo comercial como parte da obra, sem distribuição avulsa ([FAQ Pixabay](https://pixabay.com/service/faq/)) | faixas com escudo têm Content ID: reclamação possível no YouTube, contestável com o certificado. A YouTube Audio Library não serve: a licença fora do YouTube não é clara |
| Narração | **voz humana da equipe**, tratada no Audacity ou no FFmpeg (redução de ruído, de-esser, compressão) e mixada pelo `montar.mjs` | sem custo | a qualidade depende da sala: gravar num cômodo com tecidos, a 20 cm do celular |
| Montagem, cor, legendas, interfaces e QA | **Claude Code** (`montar.mjs`, `capture.mjs`, `check.mjs`); **Kdenlive** opcional para ajuste manual; **Codex** opcional para código em paralelo | sem custo | — |
| Entrega de arquivos ao Claude Code | **pasta no Google Drive** (conector disponível nesta sessão; busca testada em 18/11/2026) ou **anexo no chat** para avaliação rápida | sem custo | o Drive é o caminho mais simples, não uma obrigação. O anexo serve para aprovar a imagem, mas não verifiquei se chega como o arquivo original, com resolução e C2PA, então para a montagem prefira o Drive. Os arquivos ficam fora do Git (`out/entrada/`) |

**O que nenhum caminho gratuito tem:** gerador de vídeo com a mesma casa e as mesmas pessoas em movimento e com licença
comercial clara. Por isso a linguagem do filme combina fotografia exclusiva em movimento com footage humano real
(§2), sem mudar a direção de arte.

## 2. Linguagem: fotografia em movimento sem cara de slideshow

O risco das fotos com movimentos pequenos é o filme parecer uma sequência de slides. As regras abaixo evitam isso:

1. **Movimento real a cada 6–8 s.** Footage humano, água, fogo, tecido ao vento ou a própria interface animada. Nunca
   três fotos seguidas sem um desses elementos.
2. **Um movimento motivado por plano, com direção variada.** Grua, travelling lateral, push-in ou plano fixo. Nunca dois
   push-ins seguidos, e o corte acontece com a câmera ainda em movimento.
3. **Fotos curtas.** De 2,5 a 4,5 s, ou mais só com interface por cima ou som ambiente forte. A escala varia entre planos
   vizinhos (aberto, detalhe, médio).
4. **Quadro estático quando o movimento não convence.** Um quadro bem composto e parado, com som de ambiente, vence um
   movimento que denuncia a foto.
5. **Som dá vida.** Mar, vento, fogo e passos entram e saem com cada plano. A trilha conduz o ritmo dos cortes.
6. **Transições.** Corte seco no movimento como regra; dissolve curto (0,5–0,7 s) só para entrar num momento humano ou
   num bloco novo; fade para a assinatura.

## 3. Os 17 planos: fonte gratuita principal e alternativa

**Legenda:** **F** foto do ChatGPT + movimento controlado · **R** footage real gratuito · **H** híbrido (camadas do
ChatGPT animadas no Blender, ou foto com elemento real) · **P** filmagem própria (celular, voluntários com
autorização) · **G** vídeo gerado com direito de reuso confirmado (hoje nenhum).

| Plano | Conteúdo | Principal | Alternativa | Observação |
|---|---|---|---|---|
| S01 | vale ao amanhecer, a Satori Home ao longe | F (K-SA aberta, grua lenta) | R: névoa no vale, sem casa | a casa só aparece em imagem exclusiva |
| S02 | Helena e a família no terraço de pedra | **R: gesto em movimento** (criança correndo descalça na pedra, mãos do casal, de costas), sem arquitetura identificável | P: voluntários num terraço qualquer, enquadrado sem arquitetura | **não é zoom sobre foto**; Vids só como prova interna |
| S03 | luz da manhã no interior da Satori | R: luz atravessando cortina de linho sobre madeira | F (K-SA-i, travelling lateral) | — |
| S04 | Helena com o celular, horizonte ao fundo | F (Helena no terraço, plano fixo) | R: mulher de costas ou de perfil com o celular diante da paisagem | título "Luxtory Club" por cima |
| S05 | terraço da Satori e o vale, Helena no terço direito (painel C04, 10,5 s) | F + R: dividido em dois planos (foto do terraço e detalhe real de mão e celular) | F com plano fixo e som de vento | 10,5 s numa foto só viraria slide |
| S06 ⇕ | Azzura Home, plano aberto ao entardecer | F (K-AZ, grua descendo) | R: mar ao entardecer, sem casa | **na prova** |
| S07 | borda infinita da Azzura | F (edição da K-AZ, travelling) | R: água de borda infinita com o mar, sem arquitetura identificável | **na prova**; a alternativa R traz movimento real de água |
| S08 | pérgola vazia, o mar ao fundo, luz caindo | F (edição da K-AZ, push-in) | H: sombra real de ripado ao vento sobre deque | **na prova** |
| S09 | o outro Titular no apartamento, sem rosto | R: por cima do ombro, celular, cidade ao anoitecer | P: voluntário, sem rosto | — |
| S10 | chegada à Azzura | F (K-AZ-i: interior aberto ao mar, malas à porta, sem rosto) | R: mãos abrindo porta de vidro ou deixando a mala | **na prova** (sem pessoas) |
| S11 | Olivar Home, pátio numa tarde de outono | F (K-OL, travelling) | H: oliveira em camada separada no Blender (folhas ao vento) | — |
| S12 | mesa posta sob a oliveira | F (edição da K-OL) | R: mesa posta com luz filtrada por folhas, sem arquitetura | — |
| S13 | três gerações no pátio, fim de tarde | R com avaliação de direitos (rostos visíveis) | P: família voluntária com autorização (crianças com a dos responsáveis) | §6 |
| S14 | Olivar à noite, fogo no pátio | F (K-OL-n, plano fixo) | H: fogo real recortado sobre a K-OL-n | — |
| S15 | taças, mãos, luz quente | **R: brinde e fogo reais, sem rosto** | F (edição da K-OL-n) | real tem prioridade |
| S16 | manhã fria no pátio | R: mãos com caneca fumegando, sem rosto | F (K-OL de manhã) | — |
| S17 | montagem emocional final | **R: montagem nova** de 3 a 4 gestos reais (mar, risos, mãos, crianças), cortada na trilha | P: gestos filmados com voluntários autorizados | não é sobra dos planos anteriores |

**Nunca:** casa de stock apresentada como Satori, Azzura ou Olivar; pessoa de footage associada a uma identidade
(nome, depoimento, Titular).

## 4. Prova de 20–30 s

**Objetivo:** num só trecho, arquitetura exclusiva, movimento convincente, um gesto humano real, interface aprovada,
transição, trilha gratuita e narração de teste. Escolha: a Request na Azzura Home, porque as imagens da Azzura são as
primeiras a gerar.

**Montagem (24 s, 24 fps, 16:9 e 9:16; `filme/prova/edl-cinema.js`; cortes na grade de 3 quadros):**

| Tempo | Plano | Imagem | Interface e texto | Narração de teste | Asset |
|---|---|---|---|---|---|
| 0–6,625 s | S06 | K-AZ, grua descendo devagar | título 0,3–2,0 s; Request, datas e rota (sequência 0–4,625 s); ressalva | "Quando as noites que você deseja estão com outro Titular, você envia uma Request." | **falta** a K-AZ |
| 6,625–9,625 s | S07 | borda infinita, travelling | Request Pendente e Garantia | "Seus Créditos ficam em Garantia enquanto o Titular decide." | **falta** a S07 |
| 9,625–14,125 s | S08 | pérgola, push-in | o outro Titular recebe e aceita; verificações | "Do outro lado, o Titular aceita." | **falta** a S08 |
| 14,125–17,25 s | S10 | interior aberto ao mar, push-in suave | Reserva confirmada; a interface sai | "Estando tudo certo, a reserva se confirma na mesma operação." | **falta** a K-AZ-i |
| 17,25–24 s | S17a | gesto humano real: casal na praia ao entardecer, sem rosto (dissolve de 15 quadros) | — | "Mais lugares para viver com quem você ama." | **falta** o clipe |
| todo | — | — | — | trilha gratuita; voz da equipe | **faltam** a faixa e a voz |

**O que já existe:**
- pipeline completo: `montar.mjs --edl=cinema --fmt=16x9|9x16`;
- interface aprovada, renderizada do palco a 24 fps nativos;
- camada editorial do Design System nos dois formatos;
- câmera subpixel, conformação de footage e dissolve;
- efeitos e ambientes sintéticos;
- validação dos arquivos codificados (cadência, quadros, cor, loudness, true peak);
- aviso de ampliação acima de 1,35× sobre a fonte.

A versão atual usa placeholders identificados: foto provisória do site e gradientes. Ela serve para avaliar ritmo,
leitura e interface, não a imagem.

**Para o Claude montar a prova:** colocar os arquivos aprovados em `out/entrada/` com estes nomes:
- `S06-16x9.png`, `S07-16x9.png`, `S08-16x9.png`, `S10-16x9.png`;
- `S06-9x16.png`, `S07-9x16.png`, `S08-9x16.png`, `S10-9x16.png`;
- `S17a.mp4` (ou `S17a-9x16.mp4` para um clipe vertical próprio);
- `prova-cinema-trilha.mp3` e `prova-cinema-vo.wav`.

Depois, rodar:

```bash
node prototypes/luxtory-club-video/filme/prova/montar.mjs --edl=cinema --fmt=16x9
```

```bash
node prototypes/luxtory-club-video/filme/prova/montar.mjs --edl=cinema --fmt=9x16
```

Cada plano troca sozinho do placeholder para o asset.

## 5. Primeiras imagens no ChatGPT (prompts para copiar)

**Como gerar:**
- uma conversa nova por imóvel;
- 2 a 3 candidatas da imagem-chave e escolha de uma;
- as demais imagens partem dela, enviada como referência na mesma conversa;
- exportar em PNG na maior resolução oferecida.

**Lote 1, 16:9 (formato paisagem 3:2):**

**1 · K-AZ → `S06-16x9.png`**

```text
Photorealistic architectural photograph, landscape 3:2. A contemporary beachfront second home in Brazil: two white
cantilevered volumes with frameless glass, a dark timber pergola over the terrace, an infinity pool facing a calm
tropical sea, beige stone deck, low cliffs to the left. Amber sunset light from the right, soft reflections on the
water. Camera at pool level from the sea side, 24mm lens, straight vertical lines. The house sits in the upper-left
third; open sea and sky fill the right half of the frame. No people. True-to-life materials, subtle 35mm film grain,
gentle contrast, premium architectural photography color grade. No text, no logos, no signage, no watermark, no
warped architecture, no bending lines, no CGI look, no oversaturated colors.
```

**2 · S07 → `S07-16x9.png`** (enviar a K-AZ aprovada como referência)

```text
Using the attached photo as the exact reference for this house, create a new photorealistic detail photograph of the
same place, landscape 3:2: the edge of the same infinity pool with the same beige stone deck, the water line meeting
the sea horizon, the same amber sunset light and sun direction, warm reflections across the water. Only a sliver of
the white volume may appear at the far left edge. No people, no furniture in front, calm water texture across the
frame, 50mm lens at deck height. Same materials, same color grade, subtle 35mm film grain. No text, no logos, no
watermark, no CGI look.
```

**3 · S08 → `S08-16x9.png`** (enviar a K-AZ aprovada)

```text
Using the attached photo as the exact reference for this house, create a new photorealistic photograph of the same
place, landscape 3:2: the empty shaded terrace under the same dark timber pergola, two white linen loungers, light
linen curtains, the same beige stone deck, the sea in the background, light falling at dusk with long soft shadows of
the pergola slats on the floor. Keep the pergola, materials and sea side identical to the reference. Medium shot,
35mm lens, keep the center of the frame calm and uncluttered. No people. Same color grade, subtle 35mm film grain. No
text, no logos, no watermark, no warped architecture, no CGI look.
```

**4 · K-AZ-i → `S10-16x9.png`** (enviar a K-AZ aprovada)

```text
Using the attached photo as the exact reference for this house, create a photorealistic interior photograph of the
same beachfront second home, landscape 3:2: an open living area with white walls, light oak floor, low linen
furniture, and a large frameless glass wall slid open to the pool deck and the sea horizon. Two leather weekend bags
were just set down near the entrance, suggesting an arrival. Warm late-afternoon light, minimal decor, no visible
brands. No people. 24mm lens, straight vertical lines, same color grade as the reference, subtle 35mm film grain. No
text, no logos, no watermark, no CGI look.
```

**Lote 2, 9:16 (formato retrato 2:3):** só depois da aprovação do lote 1. Para cada imagem aprovada, enviá-la e pedir:

```text
Create a vertical portrait 2:3 version of this exact photograph: the same place, the same architecture, materials,
light, sun direction and color grade. Do not redesign anything; extend the scene with more sky above and more deck or
floor below, keeping the main subject in the upper half of the frame. No people, no text, no logos, no watermark.
```

Salvar como `S06-9x16.png`, `S07-9x16.png`, `S08-9x16.png` e `S10-9x16.png`.

**Se a casa mudar entre as imagens:**
- repetir o pedido em uma frase: "keep the house exactly as in the reference: same volumes, glass, pergola and pool";
- mudou de novo? Gerar outra vez a partir da K-AZ, nunca da imagem derivada.

## 6. Footage e trilha identificados (para validação)

Encontrados por busca em 18/11/2026. As páginas dos bancos estão bloqueadas pela rede deste ambiente, então licença,
cadência e resolução **não foram conferidas na fonte**. A validação acontece na página, no dia do download, e a
cadência é medida com `ffprobe` na chegada.

| Uso | Clipe | Licença indicada | Observação |
|---|---|---|---|
| **Prova, S17a (16:9)** | [Sunset on a beach (Mixkit 44490)](https://mixkit.co/free-stock-video/sunset-on-a-beach-44490/) | Mixkit, licença gratuita (conferir no item) | casal caminhando ao pôr do sol, 12 s, 1080p, 24 fps; conferir se as casas de palafita ao fundo não parecem a Azzura |
| **Prova, S17a (9:16)** | [A couple's silhouette on the beach at sunset (Mixkit 1224)](https://mixkit.co/free-stock-video/a-couples-silhouette-on-the-beach-at-sunset-1224/) | Mixkit, licença gratuita (conferir) | vertical nativo, 19 s; silhuetas, sem rosto identificável |
| S15 | [Couple clinking their glasses in a toast (Mixkit 22738)](https://mixkit.co/free-stock-video/couple-clinking-their-glasses-in-a-toast-22738/) | Mixkit (conferir) | mãos e taças, fundo desfocado com luzes |
| S15 | [Two glasses of wine colliding during a toast (Mixkit 41259)](https://mixkit.co/free-stock-video/two-glasses-of-wine-colliding-during-a-toast-41259/) | Mixkit (conferir) | vertical, ≈ 7 s |
| S14 alt / S15 | [Mesmerizing Outdoor Fire Pit at Night (Pexels 29376046)](https://www.pexels.com/video/mesmerizing-outdoor-fire-pit-at-night-29376046/) | Licença Pexels | 4K vertical, 32 s, sem pessoas |
| S13 | [Heartwarming Multigenerational Family Gathering (Pexels 38875102)](https://www.pexels.com/video/heartwarming-multigenerational-family-gathering-38875102/) | Licença Pexels | rostos visíveis: avaliação de direitos de imagem antes de usar |
| S16 | [Hands Holding Hot Coffee Cup (Pexels 11877573)](https://www.pexels.com/video/hands-holding-hot-coffee-cup-11877573/) | Licença Pexels | sem rosto |
| S01 alt | [Stunning Aerial View of Fog-Covered Mountains (Pexels 39640550)](https://www.pexels.com/video/stunning-aerial-view-of-fog-covered-mountains-39640550/) | Licença Pexels | sem pessoas, 1080p |
| S04 alt | [Back View of a Woman Walking on Mountain (Pexels 5418492)](https://www.pexels.com/video/back-view-of-a-woman-walking-on-mountain-5418492/) | Licença Pexels | 4K, 6 s, de costas, ao entardecer |
| **Trilha da prova** | [Cinematic Ambient Piano, Lexin_Music (Pixabay 118668)](https://pixabay.com/music/beautiful-plays-cinematic-ambient-piano-118668/) | Licença de Conteúdo Pixabay | piano e pads; conferir escudo de Content ID e restrições da página; baixar o certificado |
| ⚠ excluído | [Couple holding hands walking on beach towards sea (Mixkit 48409)](https://mixkit.co/free-stock-video/couple-holding-hands-walking-on-beach-towards-sea-48409/) | licença restrita (uso não comercial) | exemplo de por que cada item é conferido |

**Registro de direitos e proveniência** (um por asset; guardado fora do Git com os arquivos, em `out/entrada/direitos.csv`):

| Campo | Exemplo |
|---|---|
| asset e plano | `S17a.mp4` · S17a |
| fonte, autor, título | Mixkit · (autor) · Sunset on a beach |
| URL da página | link do item |
| licença e versão | Mixkit Stock Video Free License (texto ou print do dia) |
| data do download | 2026-11-?? |
| prova arquivada | print da página com a licença; certificado (Pixabay) |
| pessoas identificáveis | não / sim (autorização: …) |
| Content ID (trilha) | sem escudo / com escudo (certificado guardado) |
| cadência e resolução medidas | `ffprobe`: 23,976 fps · 1920×1080 |
| uso aprovado | prova interna / filme |

**Imagens do ChatGPT:** data, conversa e prompt, mais o PNG original com C2PA.

## 7. Requisitos técnicos

- **Cadência do master: 24 fps.** A interface é renderizada nativamente a 24 fps.
- **Footage em qualquer cadência comum** (23,976, 24, 25, 30, 50 ou 60 fps), avaliada visualmente plano a plano.
  Regra do `montar.mjs`: **retemporização**, em que cada quadro da fonte vira um quadro do master, sem quadros
  inventados nem descartados. A velocidade fica proporcional à cadência da fonte:

  | Fonte | Velocidade no master |
  |---|---|
  | 23,976 fps | +0,1% (imperceptível) |
  | 25 fps | 96% |
  | 30 fps | 80% |
  | 50 fps | 48% (câmera lenta) |
  | 60 fps | 40% (câmera lenta) |

  Quando o plano precisa da velocidade real, `conform: 'realtime'` descarta ou repete quadros. É marcado no relatório
  e só passa sem judder visível na verificação a 100%. **Interpolação de movimento** (quadros sintetizados) não é
  usada.
- **Resolução:** o `montar.mjs` mede a ampliação efetiva sobre os pixels da fonte, avisa na prévia acima de 1,35× e
  recusa na exportação final.
  - Imagens do ChatGPT em 16:9 ficam em ≈ 1,3× com o push-in máximo de 1,06.
  - O 9:16 usa a imagem vertical própria, nunca um recorte da horizontal.
  - Footage em 1080p só serve ao 9:16 se for vertical nativo; para recortar do horizontal, a fonte tem de ser 4K.
- **Cor:** Rec.709 nos arquivos; footage com grade suave para casar com a luz das imagens (âmbar no litoral).
- **Proveniência:** C2PA preservado nos originais; registro de direitos (§6) completo antes de qualquer uso fora da
  prova.

## 8. Critérios de aprovação da prova

**Reprovação imediata:**
- casa diferente da imagem-chave;
- vidro, madeira, pedra ou volumes deformados;
- mudança de rosto ou anatomia incorreta;
- movimento artificial, judder ou aspecto de CGI;
- maciez de ampliação visível a 100%;
- interface sem espaço;
- aparência de slideshow.

**Avaliação de 1 a 5, com mínimo 4 em cada item:**
- qualidade fotográfica premium;
- consistência arquitetônica;
- naturalidade do movimento;
- integração elegante da interface;
- continuidade de luz e cor;
- ritmo e montagem;
- transições;
- qualidade sonora (trilha, voz, efeitos);
- legibilidade em 16:9 e 9:16;
- desejo e sofisticação.

**Contingência:** se foto + movimento + footage gratuito não chegarem ao padrão, a alternativa sem custo é a filmagem
própria pontual (voluntários com autorização), não a contratação de ferramentas.

## 9. Quem faz o quê

| Você (Luxtory) | Claude Code |
|---|---|
| gerar o lote 1 no ChatGPT com os prompts do §5 | avaliar pelos critérios e pedir a correção específica |
| colocar os PNGs numa pasta do Drive, por exemplo `Luxtory/prova-cinema`, e me dizer o nome | baixar pelo conector, nomear, montar as duas versões e validar |
| conferir as licenças do §6 nas páginas e baixar os clipes e a trilha aprovados, se a rede do ambiente continuar bloqueada para esses sites | conformar o footage, mixar e registrar os direitos |
| gravar a narração de teste (5 frases do §4, celular, cômodo silencioso) | tratar a voz, ajustar os tempos e entregar a prova |

## 10. Pendências sem custo

- **Vids:** confirmar com o Google, por fonte oficial, o reuso comercial fora do Vids, se ele vier a ser usado.
- **Pessoas identificáveis:** autorização ou clipe sem rosto.
- **Revisão jurídica:** narração, supers, descrição e uso de IA.
