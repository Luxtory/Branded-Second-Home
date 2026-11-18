# Filme Luxtory Club: produção, footage e integração (v7.1, custo adicional zero · proposta para aprovação)

> Complementa `ROTEIRO.md`. Imóveis, pessoas e valores ilustrativos, nunca apresentados como Second Homes reais à venda
> ou disponíveis. A publicação depende da verificação de prontidão do produto e da aprovação da comunicação (§5).
> Revisões: §8.

## 1. Recursos e estratégia de footage

> **Histórico (v7.1).** Os caminhos A, B e C abaixo pressupunham ferramenta de vídeo, banco licenciado e filmagem com orçamento. O plano ativo, sem custo adicional, está em `PROVA-CINEMATOGRAFICA.md`: fotografia exclusiva do ChatGPT em movimento, footage real gratuito e filmagem própria pontual como contingência.

**O que existe neste ambiente:**

- Playwright e ffmpeg (`xfade`, `perspective`, `blend`, `gblur`, `drawtext`, `libass`, `loudnorm`, `ebur128`);
- as fontes e os logos oficiais;
- o pipeline determinístico de interfaces;
- o projeto da prova de montagem (`prova/`, §4).

**O que não existe:** gerador de vídeo, síntese de voz, biblioteca de música e credencial de serviço de mídia. Nada foi
contratado nem gerado fora daqui.

| Caminho | Prós | Contras | Papel |
|---|---|---|---|
| **A. Integral com IA generativa**, a partir de imagens-chave aprovadas (§2) | controle total de arquitetura, luz e continuidade; custo e prazo baixos por plano; iteração rápida | pessoas e mãos exigem QA plano a plano; consistência de personagem depende da ferramenta; licença comercial da ferramenta obrigatória | **ponto de partida**: teste de viabilidade antes de qualquer outra opção |
| **B. Híbrido**: IA + banco licenciado (+ filmagem pontual) | resolve com realismo imediato os planos humanos que a IA não sustentar | difícil achar a mesma casa ou pessoa no banco; estética genérica; licença por clipe | complemento, plano a plano, onde A reprovar |
| **C. Filmagem própria** | máximo realismo e direito de uso claro | maior custo e prazo; locação precisa casar com as bíblias | só se houver orçamento **e** vantagem perceptível sobre A ou B no teste |

**Teste de viabilidade de A** (três planos, antes de gerar o filme):

| Plano | O que prova |
|---|---|
| S06 | arquitetura e paisagem, continuidade com a imagem-chave da Azzura Home |
| S02 | Helena e a família em plano médio: consistência de rosto, anatomia, expressão natural, movimento |
| S15 | detalhe com mãos e taças: mãos, luz de fogo, textura |

Critérios: mesma casa e mesma pessoa entre planos; nenhum artefato visível a 100% em 1080p; movimento de câmera
estável; luz e cor coerentes com a bíblia; espaço livre para a interface (§3); licença comercial sem marca d'água.

Decisão por plano:

- aprovado em A → segue em A;
- reprovado em pessoas → B para aquele plano;
- C só se A e B não chegarem ao nível pedido.

Escolha da ferramenta, licença e orçamento: decisão da Luxtory (§7).

Fluxo de A:

1. Gerar e aprovar as imagens-chave mestras (§2) e a folha de personagem de Helena.
2. Gerar cada plano por imagem → vídeo, com a imagem-chave como primeiro quadro ou referência e a folha de personagem
   nos planos com pessoas.
3. QA de continuidade e artefatos, plano a plano.
4. Upscale, só nos planos que forem reenquadrados (§5).

## 2. Continuidade: referências, bíblias e personagens

### 2.1 Coerência das fotografias existentes

As fotos em `public/images/` são provisórias. Estão autorizadas para o site como referência visual, sem autorização
definitiva de produção (`docs/specs/catalog.md` §13.10). No filme servem só como referência de direção de arte e como
placeholder interno da prova; nunca como footage final.

| Foto | O que mostra | Leitura para o filme |
|---|---|---|
| `luxury-property-facade-hero.jpg` | casa em pedra empilhada clara, madeira e vidro em encosta, terraços e piscina de borda ao entardecer, água ao fundo | **materiais** da Satori Home (a paisagem não: a bíblia pede vale de serra, sem mar); placa provisória de C04 e C06 |
| `hero-lifestyle.jpg` | volumes brancos, vidro, piscina de borda infinita voltada ao mar, pôr do sol, família na água | coerente com a **Azzura Home**; placeholder da prova e, escurecida, placa noturna da Request (`out/placas/azzura-noite.jpg`) |
| `home-solucao-firepit-family.jpg` | três gerações ao redor do fogo, casa de pedra e vidro, montanhas | só **tom humano** (calor, espontaneidade); a arquitetura não serve à Olivar Home |
| `kaizen-k05/k07/k09.jpg` | anteprojeto real Kaizen: suíte, pavilhão e fachada com brises de madeira, jardim tropical | **não representa nenhuma Second Home fictícia**. Até a v4, a K05 foi placa de teste de legibilidade de Direct e Luxplus; na v5 elas usam campos neutros da Olivar Home (`out/placas/olivar-tarde.png` e `olivar-noite.png`) |
| `problema-imovel.jpg` | casa mediterrânea com telhas cerâmicas, imagem do "problema" no Como funciona | **nunca** como Second Home |

**Olivar Home (antes Pátio · Campo): incoerência corrigida.** A v1 descrevia uma casa rústica (taipa ou pedra, telhas
cerâmicas, portas de madeira, oliveiras, vinhedos). Essa descrição:

- não combina com o interior contemporâneo dos previews;
- ecoa a imagem do "problema";
- foge da arquitetura contemporânea de toda a imagem da Luxtory.

A v2 redefine o imóvel do campo como casa contemporânea em torno de um pátio (§2.2). Os vinhedos saem, porque aproximariam o
lugar da serra, e a K05 deixa de ser referência.

**Placas internas por imóvel (v5).** Para conferir a legibilidade das interfaces sobre imagem, cada sequência usa uma
placa coerente com o imóvel que mostra: Satori (pedra, `luxury-property-facade-hero.jpg`), Azzura (litoral,
`hero-lifestyle.jpg` e a variante noturna) e Olivar (campos neutros quentes de tarde e de noite, sem fingir uma
arquitetura que ainda não existe em imagem). `placas.mjs` gera as placas em `out/placas/` (fora do Git), sem tocar nas
fotos do repositório. São só placas de teste: não são footage nem representam o imóvel final.

### 2.2 Bíblias e imagem-chave mestra

Cada imóvel tem uma **imagem-chave mestra exterior** (K-SA, K-AZ, K-OL) e uma **interior** (K-SA-i, K-AZ-i, K-OL-i), as
duas geradas e aprovadas antes de qualquer vídeo. Todos os planos daquele imóvel partem delas. (Até a v4: K-MS, K-VL e
K-PC.)

**Nomes (v5).** *Satori Home*, *Azzura Home* e *Olivar Home* são propostas, sujeitas à validação comercial e de marca
(§6, §7); o filme não afirma exclusividade. Nos cartões e títulos, o nome é o protagonista e a região vem em segundo
plano: "Azzura Home" / "Litoral · Second Home Luxtory". Os cartões não repetem "Home Edition". Os identificadores
internos dos dados do protótipo não mudam (`mirante`, `varanda`, `patio`), para preservar papéis, datas, Créditos e
relações.

| Second Home | Arquitetura e materiais | Paisagem e luz | Quem aparece |
|---|---|---|---|
| **Satori Home** · Serra (de Helena) | casa contemporânea em pedra empilhada clara, madeira quente e grandes panos de vidro; terraço em balanço; cobertura plana com beiral fino | vale de serra com neblina e mata atlântica de altitude, sem mar; amanhecer frio → luz dourada | Helena, o parceiro e os dois filhos |
| **Azzura Home** · Litoral | volumes brancos em balanço, vidro sem caixilho aparente, pérgola de madeira escura na varanda, piscina de borda infinita voltada ao mar, deque de pedra bege | litoral tropical, mar calmo, falésia baixa; pôr do sol âmbar | Helena e o parceiro; o outro Titular nunca aqui (interior neutro, S09) |
| **Olivar Home** · Campo | casa térrea contemporânea em torno de um pátio; paredes de taipa de pilão ocre; panos de vidro com perfis finos escuros; cobertura plana com beiral fino de madeira; pátio de pedra com uma oliveira antiga | campo ondulado de capim dourado, árvores isoladas, serra baixa e azulada ao longe; tarde de outono dourada (Direct) e noite de inverno com fogo no pátio (Luxplus) | Direct: três gerações (os pais de Helena, Helena, as crianças). Luxplus: Helena e o parceiro |

Regras de continuidade:

- O mesmo imóvel mantém volumes, materiais, proporção das aberturas, posição da piscina e direção do sol entre planos.
- Nenhuma placa, logo ou marca visível; nenhuma arquitetura impossível; nenhuma pessoa real reconhecível.
- Nenhum elemento de um imóvel aparece em outro: a pedra é da serra, os volumes brancos do litoral, a taipa do campo.

Prompts das imagens-chave mestras (ferramenta de imagem; mesmas restrições do §3):

- **K-SA:** `Architectural photograph of a contemporary mountain second home of stacked light stone, warm timber and floor-to-ceiling glass, cantilevered terrace and thin flat roof, set on a slope above a misty Atlantic-forest valley in southern Brazil at golden hour, no sea, realistic materials, 35mm, natural light`
- **K-AZ:** `Architectural photograph of a contemporary coastal second home with white cantilevered volumes, frameless glass, a dark timber pergola on the veranda and an infinity pool facing a calm tropical sea, beige stone deck, low cliffs, amber sunset, realistic, 35mm`
- **K-OL:** `Architectural photograph of a contemporary single-story countryside second home arranged around a stone courtyard with one old olive tree, ochre rammed-earth walls, slim dark-framed glass panels, thin flat roof with a timber eave, rolling golden grassland and distant bluish hills, autumn afternoon light, realistic, 35mm`
- Os interiores (`-i`) repetem materiais, aberturas e vista do exterior aprovado.

### 2.3 Personagens

- **Helena.** Co-Owner da Satori Home; cerca de 42 anos; cabelo castanho na altura dos ombros, ondulado;
  maquiagem natural; anel fino de ouro (única joia constante).
  - Folha de personagem K-HE (frente, três quartos, perfil e corpo inteiro, luz neutra), gerada antes dos planos e usada
    como referência em todos os planos em que ela aparece.
  - Figurino por lugar, sempre sem logos:

    | Lugar | Figurino |
    |---|---|
    | Satori Home | linho claro e tricô leve |
    | Azzura Home | linho branco |
    | Olivar Home, Direct | algodão e cáqui |
    | Olivar Home, Luxplus | suéter de tricô cru e casaco |

- **Parceiro** (cerca de 45 anos, barba curta grisalha), **filhos** (cerca de 9 e 13 anos) e **pais de Helena** (cerca
  de 70 anos): uma folha de referência cada, com o mesmo critério.
- **O outro Titular:** nunca o rosto; mãos e celular num interior neutro, sem identidade de Second Home.

Atuação: expressões naturais e momentos espontâneos (conversa, riso, descanso), sem pose nem sorriso publicitário.
Nenhuma semelhança com pessoa real.

## 3. Shot list e prompts (ferramenta externa de imagem → vídeo)

A shot list continua com 17 planos; a v2 só refina onde era preciso.

**Formato:**

- Prompts em inglês, formato usual das ferramentas.
- Proporção do master 16:9; planos marcados com ⇕ ganham versão nativa 9:16, nunca recorte.
- Duração gerada ≈ 1,5× a usada na montagem.
- "UI" = plano com interface por cima.

**Planos com interface:** pessoas só em plano aberto e fora das áreas dos cartões; closes e emoção ficam nos trechos sem
interface. No 16:9, os cartões ocupam:

- de 52% a 94% da largura, de 5% a 90% da altura (tarefa);
- de 6% a 38% da largura, de 17% a 83% da altura (contexto).

O que importa na imagem fica no terço superior esquerdo e no corredor central (38–52%), e o resto do quadro é textura
(céu, água, parede, paisagem).

**Restrições comuns (negative prompt):** `no text, no logos, no signage, no watermark, no brand names, no distorted
hands, no extra fingers, no warped architecture, no flickering, no morphing faces, no identity drift between shots, no
fast camera moves, no fisheye, no oversaturated colors, no CGI look, no posed advertising smiles`.

| Plano | Dur. | Lugar · ref. | UI | Enquadramento · câmera | Prompt |
|---|---|---|---|---|---|
| S01 ⇕ | 6 s | Satori · K-SA | — | aberto, drone lento para frente | `Cinematic aerial dolly forward at dawn over a misty mountain valley in southern Brazil, revealing the same contemporary second home of stacked light stone, warm timber and large glass panels with a cantilevered terrace (match reference image), soft cold light turning golden, realistic architecture, 35mm film look, gentle steady movement` |
| S02 | 5 s | Satori · K-SA + K-HE | — | médio, travelling lateral | `Helena (match character reference), early forties, light linen, laughing with her partner and two children on the timber terrace of the same stone-and-glass mountain house at golden hour, candid unposed moment, shallow depth of field, slow lateral tracking shot, warm natural light` |
| S03 | 8 s (C02 e C05c) | Satori · K-SA-i | ✓ em C05c | detalhe, estático; na segunda parte, luz no centro e nas bordas, sem objeto sob os cartões | `Close detail of morning light moving across a linen sofa and oak floor inside the same minimalist stone-and-glass mountain house, misty valley soft through the glass, dust particles in sunlight, static camera, photorealistic` |
| S04 ⇕ | 10 s (C03 e C05b) | Satori · K-SA + K-HE | ✓ em C05b | médio por cima do ombro; Helena no corredor central, celular fora de foco | `Over-the-shoulder shot of Helena (match character reference) holding a smartphone on the stone house terrace overlooking the misty valley, phone screen softly out of focus, golden light, subtle push-in, cinematic` (a interface entra na pós) |
| S05 ⇕ | 12 s | Satori · K-SA + K-HE | ✓ (painel dos Créditos) | aberto e estável; Helena no terço direito, de perfil, olhando o vale; metade esquerda livre para o painel | `Wide steady shot on the stone terrace of the same mountain second home at golden hour, Helena (match character reference) in light linen standing in the right third, seen in profile looking at the misty valley, calm and contemplative, the left half of the frame open to the valley and sky, very slow push-in, photorealistic` |
| S06 ⇕ | 6 s | Azzura · K-AZ | ✓ | aberto, grua descendo; casa no terço superior esquerdo, mar e céu à direita | `Wide crane-down shot of the same coastal second home with white cantilevered volumes, dark timber pergola and an infinity pool facing a calm tropical sea at amber sunset (match reference image), house in the upper-left third, open sea and sky filling the right half, low cliffs, photorealistic, slow elegant movement` |
| S07 | 4 s | Azzura · K-AZ | ✓ | detalhe, travelling | `Slow tracking shot along the edge of the same infinity pool with beige stone deck, sea horizon and warm sunset reflections, no people, calm water texture across the frame, cinematic` |
| S08 | 4 s | Azzura · K-AZ | ✓ | médio, estático | `Empty shaded veranda under the same dark timber pergola with white linen loungers at dusk, gentle sea breeze moving light curtains, static camera, serene` |
| S09 | 5 s | apartamento do outro Titular (não é nenhuma das três Second Homes) | ✓ | por cima do ombro, rosto fora de foco; pessoa no terço esquerdo | `Over-the-shoulder shot of a man in his fifties on a sofa in a contemporary city apartment at blue hour, holding a smartphone, the screen softly out of focus, warm lamp light inside and city lights through floor-to-ceiling windows, his face turned away and out of focus, person in the left third, calm and elegant, slow push-in, photorealistic` (interface na pós) |
| S10 | 5 s | Azzura · K-AZ-i + K-HE | ✓ (2,6 s) | aberto → médio; Helena entra pelo terço esquerdo | `Helena (match character reference) and her partner arriving through a timber door into the bright white coastal house with sea view, wide shot that settles into a medium shot as she smiles looking out, warm late light, natural movement` |
| S11 ⇕ | 5 s | Olivar · K-OL | ✓ | aberto, dolly para dentro do pátio | `Dolly forward through a wooden doorway into the stone courtyard of the same contemporary rammed-earth countryside house with an old olive tree (match reference image), rolling golden grassland and distant hills beyond, autumn golden afternoon light, photorealistic` |
| S12 | 4 s | Olivar · K-OL | ✓ | detalhe, travelling | `Slow tracking shot over a long outdoor table set with ceramics and linen under the olive tree in the same rammed-earth courtyard, warm autumn afternoon light, no faces` |
| S13 | 5 s | Olivar · K-OL + K-HE | ✓ (3 s) | aberto; família pequena no terço superior esquerdo | `Wide shot of three generations relaxing in the same rammed-earth courtyard at late autumn afternoon, grandparents, Helena (match character reference) and two children, candid laughter, family small in the upper-left third, warm light` |
| S14 ⇕ | 5 s | Olivar · K-OL | ✓ | aberto, noite | `The same contemporary rammed-earth courtyard house on a cold winter blue hour, a low fire bowl glowing in the courtyard, warm windows, grassland and hills in silhouette, slow push-in, cinematic` |
| S15 | 3 s | Olivar · K-OL | ✓ | detalhe | `Close detail of two wine glasses and hands near a fire bowl on a winter night in a stone courtyard, warm flickering light, faces out of frame, knitwear sleeves` |
| S16 | 4 s | Olivar · K-OL-i + K-HE | ✓ (3 s) | médio, amanhecer frio | `Cold winter morning in the same rammed-earth courtyard house, Helena (match character reference) in a cream knit sweater with a coffee cup sliding open a glass panel to the golden grassland, breath faintly visible, soft low sun, slow movement` |
| S17 ⇕ | 8 s | os três | — | montagem de 3 planos | sobras de S01–S16, sem novo imóvel nem nova pessoa |

S05 recebe o painel editorial dos Créditos (`sequence-creditos.js`); o gráfico de "três lugares em linhas de luz" da v1
saiu. S09 muda de perspectiva com clareza: outra pessoa, outro lugar (cidade, anoitecer), sem expor identidade e sem
usar nenhuma das três Second Homes. O placeholder escuro da prova nunca é footage final.

## 4. Inventário de assets

| Asset | Estado | Onde |
|---|---|---|
| Interfaces Request (35 s, com o passo de Créditos e o depósito) · Direct (16,7 s, saldo suficiente) · Luxplus (15,5 s), 16:9 e 9:16, com alfa, determinísticas | regeneradas na v5 (combinações do controle, nomes das Second Homes, calendário do 9:16); aguardam aprovação | `node prototypes/luxtory-club-video/capture.mjs --seq=…` |
| Trechos ProRes 4444 por modalidade | um por modalidade e formato; demais trechos sob demanda | `out/etapa-a/<seq>-<fmt>-alpha-prores4444.mov` |
| Assinatura (6 s, só a marca), 16:9 e 9:16 | pronta para aprovação; igual na prévia e na exportação final | `--seq=assinatura` |
| Painel dos Créditos (C04, 10,5 s, conceitual e sem números), 16:9 e 9:16, com alfa | regenerado na v5; aguarda aprovação | `--seq=creditos` |
| Marcas de tempo dos toques (efeitos de toque e som) | prontas | `window.__demo.marks` de cada sequência |
| **Prova de montagem** (Request com a complementação até o depósito e o saldo de 94.000, ≈ 26,4 s, placeholders identificados) | pronta para avaliação interna | `node prototypes/luxtory-club-video/filme/prova/montar.mjs` → `out/prova/` |
| Imagens-chave mestras K-SA, K-AZ, K-OL (+ interiores) e folhas de personagem | **a gerar e aprovar** (§2) | — |
| Footage S01–S17 | **a produzir** (§1, §3) | entra em `out/entrada/S06.mp4` etc. (a prova já usa o arquivo quando existe) |
| Locução (voz natural, 30–45 anos) | **a gravar**, com cessão de direitos | `out/entrada/vo.wav` |
| Trilha | **a licenciar ou encomendar** | `out/entrada/trilha.wav` |
| Efeitos e ambientes | **a licenciar**; na prova, sons sintéticos gerados aqui | — |
| Legendas pt-BR (SRT/ASS) e supers | texto em `ROTEIRO.md` §4–§5; aprovação pendente | — |
| Títulos de modalidade | Request pronto na prova (camada do protótipo); Direct e Luxplus seguem a mesma gramática | `sequence-prova.js` |
| Prova curta do passo de Créditos (16:9 e 9:16) | validação dos momentos alterados, feita antes do render completo | `out/prova-curta/` |
| Placas internas por imóvel (Azzura à noite, Olivar de tarde e de noite) | geradas de forma determinística, fora do Git | `node prototypes/luxtory-club-video/placas.mjs` → `out/placas/` |
| Versões anteriores (commits `2e6e68c` e `f5810a6`) | arquivadas só como referência de regressão, nunca como entrega | `out/referencia-2e6e68c/`, `out/referencia-f5810a6/` |
| Exportação final das interfaces | sob demanda, só dos trechos usados | `capture.mjs --final --seq=…` → `out/final/` |

## 5. Especificação de integração

| Item | Definição |
|---|---|
| Cadência | **30 fps**, padrão provisório de edição: todos os assets atuais estão nela. 24 fps só por razão criativa decidida antes dos masters finais; nesse caso, as interfaces são renderizadas nativamente (`--fps=24`) e o footage gerado ou filmado na mesma cadência. Nenhuma conversão de cadência. TV, se houver: definir 29,97 antes do master. **Recomendação v6.3: master a 24 fps**, porque o Veo 3.1 gera a 24 fps e as interfaces renderizam nativamente a 24 no congelamento (`PROVA-CINEMATOGRAFICA.md` §1). **v7.1:** master a 24 fps sem gerador de vídeo; footage gratuito em qualquer cadência comum, retemporizado sem quadros inventados ou descartados (`PROVA-CINEMATOGRAFICA.md` §7) |
| Resolução | timeline de web em 1920×1080 (16:9) e 1080×1920 (9:16). Interfaces em 1080p; render maior só dos trechos com push-in acima de 110% ou recorte. Footage na maior resolução nativa da ferramenta (ideal ≥ 4K UHD), para permitir reenquadrar. Master 4K só se o destino exigir, decidido antes da montagem final |
| Alfa | *straight* (não premultiplicado) nos PNG e no ProRes 4444; interpretar como Straight |
| Cor | Rec.709 (BT.709, faixa limitada) nos MP4/MOV; composição em RGB com matriz BT.709 explícita; cores da marca conferidas por amostragem depois do encode |
| Interface sobre pessoas | ver a ordem de soluções logo abaixo |
| Áreas seguras | 16:9: títulos dentro de 90% do quadro; a faixa abaixo de 90% da altura fica livre dos cartões e recebe ressalvas (o 16:9 entrega legenda em arquivo separado). 9:16: interfaces de 8% a 87% da altura (`check.mjs` reprova conteúdo acima de 8%); legendas e ressalvas só nos planos sem cartão, entre 60% e 80% da altura, ou omitidas quando o cartão já diz o mesmo |
| Profundidade | quando a interface entra, a imagem suaviza o foco (desfoque leve, transição de 0,5 s) e volta a ficar nítida quando ela sai |
| Sincronia | a voz conduz; interfaces entram 4–8 quadros depois da palavra-chave; toques e sons alinhados às `marks` |
| Legendas | pt-BR, até 2 linhas, ≤ 42 caracteres por linha; queimadas no 9:16, arquivo separado no 16:9 |
| Áudio | equilíbrio voz × trilha por inteligibilidade, com ducking ou automação, testado em celular, fones e caixa comum; loudness pelo canal (≈ −14 LUFS integrado em web; padrão da emissora em TV); true peak ≤ −1 dBTP; sem clipping |
| Entregas | master 16:9, vertical 9:16, legendas, projeto de montagem com camadas separadas e a EDL em dados (`prova/edl.js` como modelo); versões por modalidade só depois da aprovação do filme |
| Exportação | prévia interna é o padrão; a exportação final usa `--final` (abaixo) |

**Interface sobre pessoas: ordem de soluções**

1. Enquadramento certo na geração ou na filmagem (espaço livre previsto no §3).
2. Reenquadrar o footage: posição, escala ou recorte da imagem de fundo, sem tocar na interface.
3. Reposicionar a camada de interface inteira, sem cortar conteúdo e dentro das áreas seguras.
4. Variante de layout, só se as anteriores falharem, gerada pelo próprio protótipo (nunca editada na pós).

Camadas com texto, calendário, números ou logo **nunca** são espelhadas. Espelhar só a imagem de fundo pode ser avaliado
quando não houver texto, placa, assimetria arquitetônica conhecida, direção de sol ou continuidade entre planos que
denuncie a inversão.

**Prévia interna × exportação final**

A separação é um único parâmetro, sem ambientes nem feature flags.

| | Prévia interna (padrão) | Exportação final (`--final`) |
|---|---|---|
| Selo nos cartões | nenhum (revisão comercial) | nenhum |
| Etiqueta "Prova interna" e tarja de revisão | sim | não |
| Placeholders | permitidos e identificados | recusados: a montagem para antes de renderizar se algum plano não tiver footage aprovado ou se faltar voz ou trilha |
| Onde | `out/etapa-a/`, `out/prova/` | `out/final/` (fora do Git) |
| Verificação | `check.mjs` | `check.mjs --final`: as verificações de sempre, mais nenhuma marca interna visível em quadro algum |

**Antes de publicar** (exportar não é publicar):

1. **Prontidão do produto.** Request, Direct, Luxplus, Créditos, depósito e Membership existem em Production e se
   comportam como o filme mostra; as políticas do PD-009 estão publicadas.
2. **Compatibilidade das imagens.** As interfaces do filme correspondem ao produto real na data da publicação, ou ficam
   cobertas pelo lettering de material ilustrativo. Revisar também textos de demonstração dentro dos cartões, como
   "Second Home fictícia" e "ilustrativo" nos valores.
3. **Condições anunciadas.** Nada no filme promete disponibilidade, preço, desconto ou rentabilidade; os valores em tela
   são exemplos.
4. **Comunicação aprovada.** Narração, títulos, supers, assinatura e descrição aprovados pelo fundador, com revisão
   jurídica aplicável.
5. **Direitos arquivados** (§6).

## 6. Direitos e conformidade

- [ ] Footage, voz, trilha e efeitos com licença para publicidade (canais, território e prazo) arquivada.
- [ ] Ferramenta de IA com licença comercial e sem marca d'água; nenhuma pessoa real reconhecível sem cessão de imagem.
- [ ] Fotos de `public/images/` só como referência de direção de arte e placeholder interno; Kaizen não representa
      imóvel fictício.
- [ ] Nenhuma marca de Brand Partner sem autorização (BR-015); nenhuma placa ou logo de terceiros.
- [ ] Nomes *Satori Home*, *Azzura Home* e *Olivar Home* validados comercialmente e com busca de anterioridade de marca
      antes de qualquer uso público; nenhuma afirmação de exclusividade. Atenção: "Azzura" e "Olivar" são grafias
      criadas (de "azzurra" e "olival"); "Satori" está no mesmo registro de "Kaizen" (palavras japonesas) e não deve
      sugerir vínculo com aquele projeto.
- [ ] Nota do C04, lettering de C05 e texto completo na descrição (`ROTEIRO.md` §5); cartões sem selo nem jargão;
      a assinatura é só a marca.
- [ ] "Taxa de intermediação" harmonizada com os documentos comerciais e jurídicos (conceito canônico: Luxchange Fee,
      01 §24).
- [ ] Exportação final conferida com `check.mjs --final` e montada com `montar.mjs --final` (nenhuma marca interna,
      nenhum placeholder).
- [ ] Verificação de prontidão do produto feita na data da publicação (§5).
- [ ] Copy final (narração, títulos, supers, assinatura e descrição) aprovada pelo fundador; revisão jurídica aplicável.

## 7. Decisões pendentes (Luxtory)

> **Histórico (v7.1).** Itens 1, 4, 5 e 6 resolvidos pela restrição de custo zero: sem ferramenta paga, voz da equipe, trilha gratuita da Pixabay com registro de direitos e master a 24 fps (`PROVA-CINEMATOGRAFICA.md` §1 e §7). Continuam pendentes os itens 2, 3 e 7.

1. **Footage:** autorizar o teste de viabilidade de A (§1), com a escolha da ferramenta, a licença e o orçamento.
2. **Créditos, nomenclatura e ressalvas:** aprovar a nova experiência de Créditos (Request e Direct), o nome "Taxa de
   intermediação", a copy da complementação, o painel de C04 e sua nota, o lettering de C05 e o texto da descrição
   (`ROTEIRO.md` §1, §4–§5), com revisão jurídica.
3. **Assinatura:** confirmar o corte *"Seja protagonista de histórias extraordinárias."* (ou a headline aprovada
   completa).
4. **Voz:** timbre e locutor(a); voz sintética só com licença comercial explícita.
5. **Trilha:** encomenda original ou biblioteca licenciada.
6. **Cadência:** manter 30 fps, salvo razão criativa para 24 fps decidida antes dos masters.
7. **Nomes das Second Homes:** validar *Satori Home*, *Azzura Home* e *Olivar Home* (comercial e marca) ou indicar
   outros; a troca é um dado (`data.js`) e não muda papéis, datas nem Créditos.

## 8. Revisões

**v7.1 (custo adicional zero, 2026-11-18):**
- Correções do plano em `PROVA-CINEMATOGRAFICA.md`: Vids opcional (exportar não é licença); footage em qualquer cadência
  comum, retemporizado; Blender só com ganho perceptível; Drive opcional.
- Os 17 planos reclassificados com fonte gratuita principal e alternativa.
- Prova de 20–30 s implementada (`prova/edl-cinema.js`, `montar.mjs --edl=cinema`).
- Caminhos pagos deste documento (§1, §7, §9.4) marcados como históricos.

**v7.0 (sem ferramentas pagas, 2026-11-18):**
- Restrição da Luxtory: só o Claude Code e o ChatGPT (com o Codex), mais planos gratuitos.
- O Sora foi descontinuado em 26/04/2026, então o ChatGPT não gera mais vídeo.
- O filme passa a "fotografia em movimento": imagens do ChatGPT com câmera 2,5D e footage real gratuito para os gestos
  humanos. O Vids gratuito fica só como teste até a confirmação do uso comercial.
- Bíblias, 17 planos, prompts e critérios mantidos.

**v6.5 (liberação técnica da prova, 2026-11-18):** pré-voo com fontes oficiais.
- **Veo 3.1 GA no Google Cloud:** sem pagamento por uso ("fixed quota" não definido; Provisioned Throughput é
  assinatura). O vídeo da prova passa ao Gemini Omni 1.2 Flash, GA com cobrança por uso.
- **Imagens:** passam ao Nano Banana 2.1, GA, no lugar do Gemini 2.5 Flash Image, que será aposentado.
- **Orçamento:** ≈ US$ 13 a 21 estimados, dentro dos mesmos tetos.
- **Cadência do Omni:** a confirmar no primeiro arquivo.

**v6.4 (execução eficiente da prova, 2026-11-18):** `PROVA-CINEMATOGRAFICA.md` corrigido:
- orçamento só vídeo pela tabela oficial do Google Cloud, executado pelo Vertex (no Gemini API o áudio do Veo 3.1 é
  sempre gerado);
- plano escalonado A → B → C com tetos (≈ US$ 33 de custo bruto; ≈ US$ 38 com tributos);
- primeiro quadro composto antes de animar, porque a combinação com referências não está confirmada;
- pré-voo na conta;
- reprovação imediata por defeito grave;
- famílias com crianças preservadas para a produção por caminhos autorizados.

**v6.3 (preparação da prova cinematográfica, 2026-11-18):**

- Kit de execução da prova em `PROVA-CINEMATOGRAFICA.md`. Inclui:
  - recomendação de master a 24 fps com Veo 3.1 (fontes oficiais);
  - orçamento discriminado (≈ US$ 146);
  - imagens-chave e prompts de S06, S02 e S15;
  - critérios e contingências.
- Restrição oficial do Veo: os modos com imagem não geram crianças. O S02 da prova usa Helena e o parceiro, e a Luxtory
  decide o caminho dos planos com crianças.
- Cadência (§5): a recomendação passa a 24 fps, a decidir antes do master.

**v6.2 (transição para a produção cinematográfica, 2026-11-18):**

- Pacote de direção de arte por imóvel em `DIRECAO-DE-ARTE.md`. Inclui:
  - descrição única de cada imóvel;
  - prompts das imagens-chave exteriores, interiores e noturna da Olivar;
  - os 17 planos com espaço para a interface, critérios de continuidade e a prova de viabilidade (S06, S02, S15) com
    ferramentas e ordem de grandeza de custo.
- Ajustes mínimos nos prompts:
  - S02 no terraço de pedra em balanço;
  - S08 com o mar ao fundo;
  - S15 com a mesma fogueira e o mesmo pátio de S14.
- Proposta econômica de congelamento em `ECONOMIA.md` §12.

**v6.1 (auditoria crítica da v6, 2026-11-18):**

- `ECONOMIA.md` corrigido: Luxplus de agosto sem acusação de irregularidade (os PRLs de agosto e o desconto não estão
  definidos); oito dimensões de comparação; anúncios verificados pela Luxtory; sensibilidade econômica separada do
  cenário narrativo; posicionamento recomendado.
- §9.3 sem meta de porcentagem; §9.6 com o inventário de materiais cinematográficos pendentes.

**v6 (auditoria econômica e direção audiovisual final, 2026-11-18):**

- Economia em `ECONOMIA.md`: benchmark por Second Home, matriz de PRL e simulação; nada alterado sem aprovação.
- Placas da Olivar como placeholders estáticos (sem push-in nem grão), validadas como paradas; a métrica de movimento
  lia notação científica errado.
- Plano da fase cinematográfica, com recursos e custos que pedem autorização (§9).

**v5 (auditoria final de UX, identidade das Second Homes e consistência audiovisual, 2026-11-15):**

- Nomes: Mirante · Serra → *Satori Home*; Varanda · Litoral → *Azzura Home*; Pátio · Campo → *Olivar Home* (propostas
  sujeitas à validação comercial e de marca). Bíblias, figurino, shot list e chaves (K-SA, K-AZ, K-OL) atualizados; a
  arquitetura de cada imóvel não muda.
- Placas internas por imóvel (`placas.mjs`): Direct e Luxplus deixam a K05 do Kaizen e passam a campos neutros da
  Olivar Home; a Request usa o litoral da Azzura também no teste escuro.
- Painel de C04 conceitual, 10,5 s; prova de montagem com a complementação até o depósito, ≈ 26,4 s; arquivo de
  referência do commit `f5810a6`.
- 9:16: interfaces a partir de 8% da altura.

**v4 (UX de Créditos e revisão comercial, 2026-11-15):**

- S03 e S04 ganham uma segunda parte (C05c e C05b, a complementação em Mirante · Serra); S17 passa a 8 s. A shot list
  continua com 17 planos.
- Inventário com as interfaces regeneradas (Request de 35 s, Direct de 16,7 s), a prova curta, a prova de 24,8 s e o
  arquivo de referência do commit `2e6e68c`.
- Cartões sem selo em qualquer modo; checklist com a harmonização de "Taxa de intermediação".

**v3 (direção comercial final):**

- S05 passa a ser o plano de fundo do painel dos Créditos (Helena no terço direito).
- S09 redefinido: o outro Titular no próprio apartamento na cidade, ao anoitecer, por cima do ombro.
- Inventário com a assinatura de 6 s, o painel dos Créditos e a exportação final.
- Prévia interna × exportação final num único parâmetro, com recusa de placeholders e a lista "antes de publicar".
- Conformidade sem aviso de indisponibilidade; prontidão do produto verificada na data da publicação.

**v2 (auditoria das Etapas B/C):**

- Estratégia: A primeiro, com teste de três planos; B onde A reprovar; C só com orçamento e vantagem perceptível.
  Filmagem própria deixa de ser condição.
- Continuidade:
  - fotos existentes analisadas;
  - Pátio · Campo redefinido como casa contemporânea, sem os vinhedos e sem a K05 do anteprojeto Kaizen;
  - imagem-chave mestra por imóvel;
  - folha de personagem de Helena;
  - Direct e Luxplus distinguidos por estação e companhia.
- Shot list: mesmos 17 planos; prompts com referência de imóvel e personagem, espaço livre para a interface e as
  restrições de deriva de identidade e sorriso posado.
- Integração:
  - o espelhamento da interface sai e entra a ordem enquadramento → reenquadramento → reposicionamento → variante;
  - 30 fps como padrão;
  - resolução definida por plano aprovado;
  - mixagem por inteligibilidade.

## 9. Fase cinematográfica: plano de execução e autorizações (v6)

> **v7.0 (decisão da Luxtory, 18/11/2026):** nenhuma ferramenta paga além do Claude Code e do ChatGPT (com o Codex).
> Fontes de imagem do filme:
> - arquitetura e atmosfera: fotografia gerada no ChatGPT com câmera 2,5D feita pelo Claude Code;
> - gesto humano: footage real gratuito (Pexels, Pixabay, Mixkit) com as autorizações necessárias, ou filmagem própria;
> - trilha e efeitos: Pixabay;
> - narração: voz da equipe.
>
> O plano e a divisão de tarefas estão em `PROVA-CINEMATOGRAFICA.md`. Os passos e custos abaixo que pressupõem
> contratação (ferramentas pagas, locução, trilha encomendada) deixam de valer.
A biblioteca de interfaces está pronta para a fase cinematográfica. Duas condições: a decisão econômica
(`ECONOMIA.md`) e o congelamento dos valores e nomes (Etapa 3). Nada abaixo foi contratado nem gerado.

### 9.1 Sequência de trabalho

| Passo | O que se faz | Sai daqui | Depende de |
|---|---|---|---|
| 1. Decisões | posicionamento e PRLs por data, valor do Luxplus (`ECONOMIA.md` §11); nomes Satori, Azzura e Olivar Home liberados para uso interno de produção; ferramenta de IA, voz e trilha (§7) | parâmetros congelados | Luxtory |
| 2. Congelamento | `data.js` com os valores aprovados; uma única regeneração de Request, Direct e Luxplus (16:9 e 9:16), da prova e da prova curta; C04 e assinatura não mudam | biblioteca final com alfa | passo 1 |
| 3. Referências por imóvel | imagens-chave mestras K-SA, K-AZ e K-OL (exterior e interior, com os prompts de `DIRECAO-DE-ARTE.md`) a partir das bíblias (§2.2), folha de personagem K-HE e folhas da família; uma prancha de aprovação por imóvel (arquitetura, materiais, paisagem, luz, figurino) | referências aprovadas | ferramenta autorizada |
| 4. Teste de viabilidade | S06 (arquitetura, Azzura), S02 (pessoas, Satori), S15 (mãos e fogo, Olivar), com o plano e os critérios de `DIRECAO-DE-ARTE.md` §5 | decisão por plano: A, B ou C | passo 3 |
| 5. Footage | 17 planos (§3), ≈ 1,5× a duração usada, na cadência decidida (30 fps); QA plano a plano: continuidade, mãos, rostos, arquitetura sem deriva, espaço livre para os cartões | planos aprovados em `out/entrada/` | passo 4 |
| 6. Voz e trilha | seleção de locução (voz natural, 30–45 anos) com cessão de direitos; trilha original ou de biblioteca com licença para publicidade (**v7.1:** voz da equipe e trilha gratuita da Pixabay com registro de direitos) | `vo.wav`, `trilha.wav` | autorização |
| 7. Montagem | master 16:9 (≈ 105,5 s) e vertical 9:16 (≈ 58 s) a partir da EDL; a prova já troca placeholder por footage automaticamente | cortes para aprovação | passos 2, 5, 6 |
| 8. Finalização | mixagem por inteligibilidade, loudness por canal, legendas; `check.mjs --final` e `montar.mjs --final` (nenhum placeholder, nenhuma marca interna) | masters | passo 7 |
| 9. Antes de publicar | lista do §5: prontidão do produto, compatibilidade das interfaces, comunicação e direitos aprovados | publicação autorizada | Luxtory |

### 9.2 Referências consistentes de cada Second Home

- Uma Second Home é uma casa só. Todos os planos de um imóvel partem da mesma imagem-chave mestra (exterior e
  interior) e repetem volumes, materiais, aberturas, posição da piscina e direção do sol.
- Imóveis diferentes nunca passam pela mesma propriedade: a pedra é da serra (Satori), os volumes brancos e o vidro
  sobre o mar são do litoral (Azzura), a taipa e o pátio com oliveira são do campo (Olivar).
- As fotos de `public/images/` e as placas internas continuam só como referência e teste. Nenhuma delas vai para o
  master.
- Pessoas: as mesmas folhas de personagem em todos os planos; rostos nos planos sem interface; nenhuma semelhança com
  pessoa real.

### 9.3 Equilíbrio entre momentos funcionais e emocionais

Medido no roteiro atual (§3 do `ROTEIRO.md`), sobre 105,5 s:

| Camada | Tempo | Parte do filme |
|---|---|---|
| Cartões de interface | 51,4 s | 49% |
| Painel editorial dos Créditos (C04) | 10,5 s | 10% |
| Sem nenhuma camada (arquitetura, pessoas, celebração, assinatura) | 43,6 s | 41% |

Por modalidade, a interface ocupa 28,1 s na Request, 11,6 s no Direct e 11,7 s no Luxplus.

A porcentagem é diagnóstico, não meta: nenhuma cena necessária sai para atingir um número. O equilíbrio se avalia no
primeiro corte com footage, por ritmo e compreensão:

- **Compreensão:** cada estado da narrativa única (escolha → necessários → saldo → complemento → depósito → Request →
  aceite → confirmação; Direct com o saldo; Luxplus em dinheiro) fica legível uma vez, sem estado repetido. Os tempos
  de leitura já medidos são o piso; por exemplo, as metas do controle ficam visíveis por 0,77 a 2,57 s.
- **Ritmo:** nenhum trecho de cartões passa de cerca de 5 s sem corte de imagem (regra do `ROTEIRO.md` §2).
- **Respiro:** cada modalidade termina com a interface saindo em fade e um plano humano sem tela; a celebração e a
  assinatura ficam limpas.
- **Teste:** uma exibição para pessoas que não conhecem o produto. Se alguém não entende o complemento ou a diferença
  entre as modalidades, a interface fica; se a atenção cai num trecho sem informação nova, ele encurta. A decisão é
  de montagem.

### 9.4 Recursos e custos externos que pedem autorização

> **Histórico (v7.1).** Tabela de referência de um cenário com contratação, que não está ativo. Pela restrição da Luxtory, nada aqui é contratado. A busca de anterioridade de marca e a revisão jurídica continuam necessárias antes da publicação.

Nenhum deles foi contratado. Valores dependem de orçamento com fornecedores; nada aqui é estimativa de preço.

| Recurso | Para quê | Natureza do custo | O que conferir antes |
|---|---|---|---|
| Ferramenta de imagem (imagens-chave e folhas de personagem) | §2.2, passo 3 | assinatura ou créditos de uso | licença comercial, sem marca d'água, direitos sobre o resultado |
| Ferramenta de imagem → vídeo | 17 planos, passo 5 | assinatura ou créditos por segundo gerado | licença comercial para publicidade, resolução nativa, consistência de personagem |
| Upscale ou reenquadramento | planos reenquadrados (§5) | assinatura ou por arquivo | licença comercial |
| Banco de imagens (caminho B) | só os planos que A reprovar | licença por clipe | mesma casa ou pessoa nos planos vizinhos; direitos de imagem |
| Filmagem própria (caminho C) | só se houver vantagem perceptível | produção, locação, elenco | locação compatível com as bíblias; cessão de imagem |
| Locução | narração pt-BR | cachê com cessão de direitos (canais, território, prazo) | voz sintética só com licença comercial explícita |
| Trilha | master e vertical | composição original ou licença de biblioteca | uso em publicidade web (e TV, se houver), território e prazo; documento arquivado |
| Efeitos e ambientes | desenho de som | licença de biblioteca | uso comercial |
| Busca de anterioridade de marca | nomes Satori, Azzura e Olivar Home | pesquisa e parecer | INPI e uso de mercado; nenhuma afirmação de exclusividade |
| Revisão jurídica | narração, supers, descrição, "Taxa de intermediação" | honorários | §6 |

### 9.5 Próxima decisão para iniciar a produção definitiva

1. Decidir o posicionamento (recomendado: alto padrão) e a intenção econômica do PRL; depois, os PRLs por data e o
   desconto Luxplus ou a regra de exibição (`ECONOMIA.md` §8, §9 e §11).
2. Autorizar o passo 3 (referências por imóvel) e o teste de viabilidade do passo 4, com a ferramenta e o orçamento
   escolhidos.

### 9.6 Inventário de materiais cinematográficos

| Material | Satori Home (Serra) | Azzura Home (Litoral) | Olivar Home (Campo) | Estado |
|---|---|---|---|---|
| Bíblia arquitetônica | §2.2 | §2.2 | §2.2 | pronta; aprovação pendente |
| Imagem-chave mestra exterior e interior | K-SA, K-SA-i | K-AZ, K-AZ-i | K-OL, K-OL-i | a gerar e aprovar |
| Planos (§3) | S01–S05; S03 e S04 em duas partes | S06–S08, S10 | S11–S16 | a produzir |
| Pessoas | Helena, parceiro e filhos (K-HE + folhas) | Helena e parceiro | três gerações (Direct); Helena e parceiro (Luxplus) | folhas a gerar; nenhuma pessoa real |
| Plano do outro Titular | — | S09: apartamento na cidade, ao anoitecer, sem rosto | — | a produzir |
| Montagem final (S17) | sobras de S01–S16 | idem | idem | depende do footage |

| Material comum | Estado |
|---|---|
| Interfaces Request, Direct e Luxplus (16:9 e 9:16, alfa) | base aprovada; regeneração única no congelamento |
| Painel do C04 | base aprovada; regeneração no congelamento (nota no painel) |
| Assinatura com a logo oficial (6 s) | pronta; não muda |
| Logo oficial | kit oficial no repositório (`src/design-system/brand/logo/`) |
| Narração pt-BR | texto em `ROTEIRO.md` §4; locução a contratar |
| Trilha | a licenciar ou encomendar |
| Efeitos e ambientes | a licenciar |
| Legendas (16:9 em arquivo, 9:16 queimadas) | texto pronto; geração na finalização |
| EDL e montagem automática | prontas (`prova/`); a EDL do master sai do primeiro corte |

