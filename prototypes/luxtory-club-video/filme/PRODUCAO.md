# Filme Luxtory Club: produção, footage e integração (v2, após a auditoria das Etapas B/C · proposta para aprovação)

> Complementa `ROTEIRO.md`. Demonstração conceitual: imóveis, pessoas e valores fictícios; imagens ilustrativas nunca
> apresentadas como Second Homes reais disponíveis. Revisões em relação à v1: §8.

## 1. Recursos e estratégia de footage

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
| S06 | arquitetura e paisagem, continuidade com a imagem-chave de Varanda · Litoral |
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
| `luxury-property-facade-hero.jpg` | casa em pedra empilhada clara, madeira e vidro em encosta, terraços e piscina de borda ao entardecer, água ao fundo | **materiais** de Mirante · Serra (a paisagem não: a bíblia pede vale de serra, sem mar) |
| `hero-lifestyle.jpg` | volumes brancos, vidro, piscina de borda infinita voltada ao mar, pôr do sol, família na água | coerente com **Varanda · Litoral**; placeholder da prova |
| `home-solucao-firepit-family.jpg` | três gerações ao redor do fogo, casa de pedra e vidro, montanhas | só **tom humano** (calor, espontaneidade); a arquitetura não serve a Pátio · Campo |
| `kaizen-k05/k07/k09.jpg` | anteprojeto real Kaizen: suíte, pavilhão e fachada com brises de madeira, jardim tropical | **não representa nenhuma Second Home fictícia**. Nos previews de Direct e Luxplus, a K05 foi só placa de teste de legibilidade |
| `problema-imovel.jpg` | casa mediterrânea com telhas cerâmicas, imagem do "problema" no Como funciona | **nunca** como Second Home |

**Pátio · Campo: incoerência corrigida.** A v1 descrevia uma casa rústica (taipa ou pedra, telhas cerâmicas, portas de
madeira, oliveiras, vinhedos). Essa descrição:

- não combina com o interior contemporâneo dos previews;
- ecoa a imagem do "problema";
- foge da arquitetura contemporânea de toda a imagem da Luxtory.

A v2 redefine Pátio · Campo como casa contemporânea em torno de um pátio (§2.2). Os vinhedos saem, porque aproximariam o
lugar da serra, e a K05 deixa de ser referência.

### 2.2 Bíblias e imagem-chave mestra

Cada imóvel tem uma **imagem-chave mestra exterior** (K-MS, K-VL, K-PC) e uma **interior** (K-MS-i, K-VL-i, K-PC-i), as
duas geradas e aprovadas antes de qualquer vídeo. Todos os planos daquele imóvel partem delas.

| Second Home | Arquitetura e materiais | Paisagem e luz | Quem aparece |
|---|---|---|---|
| **Mirante · Serra** (de Helena) | casa contemporânea em pedra empilhada clara, madeira quente e grandes panos de vidro; varanda em balanço; cobertura plana com beiral fino | vale de serra com neblina e mata atlântica de altitude, sem mar; amanhecer frio → luz dourada | Helena, o parceiro e os dois filhos |
| **Varanda · Litoral** | volumes brancos em balanço, vidro sem caixilho aparente, pérgola de madeira escura na varanda, piscina de borda infinita voltada ao mar, deque de pedra bege | litoral tropical, mar calmo, falésia baixa; pôr do sol âmbar | Helena e o parceiro; o outro Titular nunca aqui (interior neutro, S09) |
| **Pátio · Campo** | casa térrea contemporânea em torno de um pátio; paredes de taipa de pilão ocre; panos de vidro com perfis finos escuros; cobertura plana com beiral fino de madeira; pátio de pedra com uma oliveira antiga | campo ondulado de capim dourado, árvores isoladas, serra baixa e azulada ao longe; tarde de outono dourada (Direct) e noite de inverno com fogo no pátio (Luxplus) | Direct: três gerações (os pais de Helena, Helena, as crianças). Luxplus: Helena e o parceiro |

Regras de continuidade:

- O mesmo imóvel mantém volumes, materiais, proporção das aberturas, posição da piscina e direção do sol entre planos.
- Nenhuma placa, logo ou marca visível; nenhuma arquitetura impossível; nenhuma pessoa real reconhecível.
- Nenhum elemento de um imóvel aparece em outro: a pedra é da serra, os volumes brancos do litoral, a taipa do campo.

Prompts das imagens-chave mestras (ferramenta de imagem; mesmas restrições do §3):

- **K-MS:** `Architectural photograph of a contemporary mountain second home of stacked light stone, warm timber and floor-to-ceiling glass, cantilevered terrace and thin flat roof, set on a slope above a misty Atlantic-forest valley in southern Brazil at golden hour, no sea, realistic materials, 35mm, natural light`
- **K-VL:** `Architectural photograph of a contemporary coastal second home with white cantilevered volumes, frameless glass, a dark timber pergola on the veranda and an infinity pool facing a calm tropical sea, beige stone deck, low cliffs, amber sunset, realistic, 35mm`
- **K-PC:** `Architectural photograph of a contemporary single-story countryside second home arranged around a stone courtyard with one old olive tree, ochre rammed-earth walls, slim dark-framed glass panels, thin flat roof with a timber eave, rolling golden grassland and distant bluish hills, autumn afternoon light, realistic, 35mm`
- Os interiores (`-i`) repetem materiais, aberturas e vista do exterior aprovado.

### 2.3 Personagens

- **Helena.** Co-Owner de Mirante · Serra; cerca de 42 anos; cabelo castanho na altura dos ombros, ondulado;
  maquiagem natural; anel fino de ouro (única joia constante).
  - Folha de personagem K-HE (frente, três quartos, perfil e corpo inteiro, luz neutra), gerada antes dos planos e usada
    como referência em todos os planos em que ela aparece.
  - Figurino por lugar, sempre sem logos:

    | Lugar | Figurino |
    |---|---|
    | Mirante · Serra | linho claro e tricô leve |
    | Varanda · Litoral | linho branco |
    | Pátio · Campo, Direct | algodão e cáqui |
    | Pátio · Campo, Luxplus | suéter de tricô cru e casaco |

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
| S01 ⇕ | 6 s | Mirante · K-MS | — | aberto, drone lento para frente | `Cinematic aerial dolly forward at dawn over a misty mountain valley in southern Brazil, revealing the same contemporary second home of stacked light stone, warm timber and large glass panels with a cantilevered terrace (match reference image), soft cold light turning golden, realistic architecture, 35mm film look, gentle steady movement` |
| S02 | 5 s | Mirante · K-MS + K-HE | — | médio, travelling lateral | `Helena (match character reference), early forties, light linen, laughing with her partner and two children on the timber terrace of the same stone-and-glass mountain house at golden hour, candid unposed moment, shallow depth of field, slow lateral tracking shot, warm natural light` |
| S03 | 3 s | Mirante · K-MS-i | — | detalhe, estático | `Close detail of morning light moving across a linen sofa and oak floor inside the same minimalist stone-and-glass mountain house, misty valley soft through the glass, dust particles in sunlight, static camera, photorealistic` |
| S04 ⇕ | 5 s | Mirante · K-MS + K-HE | — | médio por cima do ombro | `Over-the-shoulder shot of Helena (match character reference) holding a smartphone on the stone house terrace overlooking the misty valley, phone screen softly out of focus, golden light, subtle push-in, cinematic` (a interface entra na pós) |
| S06 ⇕ | 6 s | Varanda · K-VL | ✓ | aberto, grua descendo; casa no terço superior esquerdo, mar e céu à direita | `Wide crane-down shot of the same coastal second home with white cantilevered volumes, dark timber pergola and an infinity pool facing a calm tropical sea at amber sunset (match reference image), house in the upper-left third, open sea and sky filling the right half, low cliffs, photorealistic, slow elegant movement` |
| S07 | 4 s | Varanda · K-VL | ✓ | detalhe, travelling | `Slow tracking shot along the edge of the same infinity pool with beige stone deck, sea horizon and warm sunset reflections, no people, calm water texture across the frame, cinematic` |
| S08 | 4 s | Varanda · K-VL | ✓ | médio, estático | `Empty shaded veranda under the same dark timber pergola with white linen loungers at dusk, gentle sea breeze moving light curtains, static camera, serene` |
| S09 | 4 s | interior neutro (não é nenhuma das três) | ✓ | detalhe de mãos no corredor central | `Close-up of hands holding a smartphone on a wooden table by a window in a neutral apartment interior, face out of frame, hands in the center of the frame, soft daylight, subtle movement` (interface na pós) |
| S10 | 5 s | Varanda · K-VL-i + K-HE | ✓ (2,6 s) | aberto → médio; Helena entra pelo terço esquerdo | `Helena (match character reference) and her partner arriving through a timber door into the bright white coastal house with sea view, wide shot that settles into a medium shot as she smiles looking out, warm late light, natural movement` |
| S11 ⇕ | 5 s | Pátio · K-PC | ✓ | aberto, dolly para dentro do pátio | `Dolly forward through a wooden doorway into the stone courtyard of the same contemporary rammed-earth countryside house with an old olive tree (match reference image), rolling golden grassland and distant hills beyond, autumn golden afternoon light, photorealistic` |
| S12 | 4 s | Pátio · K-PC | ✓ | detalhe, travelling | `Slow tracking shot over a long outdoor table set with ceramics and linen under the olive tree in the same rammed-earth courtyard, warm autumn afternoon light, no faces` |
| S13 | 5 s | Pátio · K-PC + K-HE | ✓ (3 s) | aberto; família pequena no terço superior esquerdo | `Wide shot of three generations relaxing in the same rammed-earth courtyard at late autumn afternoon, grandparents, Helena (match character reference) and two children, candid laughter, family small in the upper-left third, warm light` |
| S14 ⇕ | 5 s | Pátio · K-PC | ✓ | aberto, noite | `The same contemporary rammed-earth courtyard house on a cold winter blue hour, a low fire bowl glowing in the courtyard, warm windows, grassland and hills in silhouette, slow push-in, cinematic` |
| S15 | 3 s | Pátio · K-PC | ✓ | detalhe | `Close detail of two wine glasses and hands near a fire bowl on a winter night in a stone courtyard, warm flickering light, faces out of frame, knitwear sleeves` |
| S16 | 4 s | Pátio · K-PC-i + K-HE | ✓ (3 s) | médio, amanhecer frio | `Cold winter morning in the same rammed-earth courtyard house, Helena (match character reference) in a cream knit sweater with a coffee cup sliding open a glass panel to the golden grassland, breath faintly visible, soft low sun, slow movement` |
| S17 ⇕ | 13 s | os três | — | montagem de 4 planos | sobras de S01–S16, sem novo imóvel nem nova pessoa |

S05 (três lugares em linhas de luz) é gráfico editorial, não footage.

## 4. Inventário de assets

| Asset | Estado | Onde |
|---|---|---|
| Interfaces Request · Direct · Luxplus (16:9 e 9:16), com alfa, determinísticas | prontas e aprovadas (Etapas A e B) | `node prototypes/luxtory-club-video/capture.mjs --seq=…` |
| Trechos ProRes 4444 por modalidade | um por modalidade e formato; demais trechos sob demanda | `out/etapa-a/<seq>-<fmt>-alpha-prores4444.mov` |
| Assinatura v2 (9 s, linha legal num segundo tempo), 16:9 e 9:16 | pronta para aprovação | `--seq=assinatura` |
| Marcas de tempo dos toques (efeitos de toque e som) | prontas | `window.__demo.marks` de cada sequência |
| **Prova de montagem** (Request, ≈ 19 s, placeholders identificados) | pronta para avaliação interna | `node prototypes/luxtory-club-video/filme/prova/montar.mjs` → `out/prova/` |
| Imagens-chave mestras K-MS, K-VL, K-PC (+ interiores) e folhas de personagem | **a gerar e aprovar** (§2) | — |
| Footage S01–S17 | **a produzir** (§1, §3) | entra em `out/entrada/S06.mp4` etc. (a prova já usa o arquivo quando existe) |
| Locução (voz natural, 30–45 anos) | **a gravar**, com cessão de direitos | `out/entrada/vo.wav` |
| Trilha | **a licenciar ou encomendar** | `out/entrada/trilha.wav` |
| Efeitos e ambientes | **a licenciar**; na prova, sons sintéticos gerados aqui | — |
| Legendas pt-BR (SRT/ASS), supers e linha legal | texto em `ROTEIRO.md` §4–§5; aprovação pendente | — |
| Gráfico editorial S05 e títulos de modalidade | títulos já na prova (camada do protótipo); S05 a produzir | `sequence-prova.js` |

## 5. Especificação de integração

| Item | Definição |
|---|---|
| Cadência | **30 fps**, padrão provisório de edição: todos os assets atuais estão nela. 24 fps só por razão criativa decidida antes dos masters finais; nesse caso, as interfaces são renderizadas nativamente (`--fps=24`) e o footage gerado ou filmado na mesma cadência. Nenhuma conversão de cadência. TV, se houver: definir 29,97 antes do master |
| Resolução | timeline de web em 1920×1080 (16:9) e 1080×1920 (9:16). Interfaces em 1080p; render maior só dos trechos com push-in acima de 110% ou recorte. Footage na maior resolução nativa da ferramenta (ideal ≥ 4K UHD), para permitir reenquadrar. Master 4K só se o destino exigir, decidido antes da montagem final |
| Alfa | *straight* (não premultiplicado) nos PNG e no ProRes 4444; interpretar como Straight |
| Cor | Rec.709 (BT.709, faixa limitada) nos MP4/MOV; composição em RGB com matriz BT.709 explícita; cores da marca conferidas por amostragem depois do encode |
| Interface sobre pessoas | ver a ordem de soluções logo abaixo |
| Áreas seguras | 16:9: títulos dentro de 90% do quadro; a faixa abaixo de 90% da altura fica livre dos cartões e recebe ressalvas (o 16:9 entrega legenda em arquivo separado). 9:16: interfaces de 6% a 87% da altura; legendas e ressalvas só nos planos sem cartão, entre 60% e 80% da altura, ou omitidas quando o cartão já diz o mesmo |
| Profundidade | quando a interface entra, a imagem suaviza o foco (desfoque leve, transição de 0,5 s) e volta a ficar nítida quando ela sai |
| Sincronia | a voz conduz; interfaces entram 4–8 quadros depois da palavra-chave; toques e sons alinhados às `marks` |
| Legendas | pt-BR, até 2 linhas, ≤ 42 caracteres por linha; queimadas no 9:16, arquivo separado no 16:9 |
| Áudio | equilíbrio voz × trilha por inteligibilidade, com ducking ou automação, testado em celular, fones e caixa comum; loudness pelo canal (≈ −14 LUFS integrado em web; padrão da emissora em TV); true peak ≤ −1 dBTP; sem clipping |
| Entregas | master 16:9, vertical 9:16, legendas, projeto de montagem com camadas separadas e a EDL em dados (`prova/edl.js` como modelo); versões por modalidade só depois da aprovação do filme |

**Interface sobre pessoas: ordem de soluções**

1. Enquadramento certo na geração ou na filmagem (espaço livre previsto no §3).
2. Reenquadrar o footage: posição, escala ou recorte da imagem de fundo, sem tocar na interface.
3. Reposicionar a camada de interface inteira, sem cortar conteúdo e dentro das áreas seguras.
4. Variante de layout, só se as anteriores falharem, gerada pelo próprio protótipo (nunca editada na pós).

Camadas com texto, calendário, números ou logo **nunca** são espelhadas. Espelhar só a imagem de fundo pode ser avaliado
quando não houver texto, placa, assimetria arquitetônica conhecida, direção de sol ou continuidade entre planos que
denuncie a inversão.

## 6. Direitos e conformidade

- [ ] Footage, voz, trilha e efeitos com licença para publicidade (canais, território e prazo) arquivada.
- [ ] Ferramenta de IA com licença comercial e sem marca d'água; nenhuma pessoa real reconhecível sem cessão de imagem.
- [ ] Fotos de `public/images/` só como referência de direção de arte e placeholder interno; Kaizen não representa
      imóvel fictício.
- [ ] Nenhuma marca de Brand Partner sem autorização (BR-015); nenhuma placa ou logo de terceiros.
- [ ] Selo "demonstração conceitual" nas interfaces, ressalvas de C04/C05, linha legal na assinatura e texto completo na
      descrição (`ROTEIRO.md` §5); nada sugere reserva disponível hoje.
- [ ] "Ainda não disponíveis para reservas" confirmado na data da publicação.
- [ ] Copy final (narração, títulos, assinatura e ressalvas) aprovada pelo fundador; revisão jurídica aplicável.

## 7. Decisões pendentes (Luxtory)

1. **Footage:** autorizar o teste de viabilidade de A (§1), com a escolha da ferramenta, a licença e o orçamento.
2. **Ressalvas:** aprovar a distribuição e a copy legal (`ROTEIRO.md` §5), com revisão jurídica.
3. **Assinatura:** confirmar o corte *"Seja protagonista de histórias extraordinárias."* (ou a headline aprovada
   completa).
4. **Voz:** timbre e locutor(a); voz sintética só com licença comercial explícita.
5. **Trilha:** encomenda original ou biblioteca licenciada.
6. **Cadência:** manter 30 fps, salvo razão criativa para 24 fps decidida antes dos masters.

## 8. Revisões

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
