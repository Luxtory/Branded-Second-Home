# Filme Luxtory Club — produção, footage e integração (Etapa C · proposta para aprovação)

> Complementa `ROTEIRO.md`. Demonstração conceitual: imóveis, pessoas e valores fictícios; imagens ilustrativas nunca
> apresentadas como Second Homes reais disponíveis.

## 1. Recursos verificados e estratégia de footage

Neste ambiente **não há** gerador de vídeo, síntese de voz, biblioteca de música nem credencial de serviço de mídia. Há
Playwright + ffmpeg (com `xfade`, `perspective`, `drawtext`, `libass`), as fontes e os logos oficiais e o pipeline de
interfaces. Nada foi contratado nem gerado fora daqui.

| Caminho | Prós | Contras | Quando usar |
|---|---|---|---|
| A. Geração de vídeo por IA (imagem → vídeo) | controle total de arquitetura e luz; custo baixo por plano | artefatos em pessoas e mãos; exige QA plano a plano e licença comercial da ferramenta | planos de arquitetura e paisagem (S01, S06, S07, S11, S14) |
| B. Banco licenciado, **séries de um mesmo imóvel** | realismo imediato | difícil achar a mesma casa em todos os ângulos; estética genérica | complemento pontual |
| C. Filmagem própria (locação + elenco) | máximo realismo e direito de uso claro | maior custo e prazo | planos com pessoas (S02, S09, S10, S13, S17) |

**Recomendação:** híbrido **A + C** — arquitetura e paisagem por IA a partir de quadros de referência aprovados de cada
Second Home; momentos humanos filmados (ou, se o orçamento não permitir, gerados com enquadramentos que evitam
close-ups de rosto e mãos). Fluxo para A: (1) gerar e aprovar 3–4 imagens-chave por Second Home (bíblia, §2); (2) gerar
cada plano por imagem → vídeo usando a imagem-chave como primeiro quadro; (3) QA de continuidade e artefatos; (4)
upscale para 4K. A escolha da ferramenta e o orçamento são decisão da Luxtory (§7).

## 2. Bíblias de continuidade

| Second Home | Arquitetura e materiais | Paisagem e luz | Pessoas |
|---|---|---|---|
| **Mirante · Serra** (de Helena) | casa contemporânea em pedra clara, madeira e grandes panos de vidro; varanda em balanço; telhado plano com beiral fino | vale com neblina, mata atlântica de altitude; amanhecer frio → luz dourada | Helena (≈ 42, cabelo castanho na altura dos ombros, linho claro), parceiro (≈ 45), filhos (≈ 9 e 13) |
| **Varanda · Litoral** | volumes brancos, pérgolas de madeira escura, piscina de borda infinita voltada ao mar, piso de pedra bege | litoral tropical, mar calmo, falésia baixa; pôr do sol âmbar | Helena e o parceiro; o outro Titular aparece só de costas ou em detalhe (mãos, celular) |
| **Pátio · Campo** | casa térrea em torno de um pátio central, paredes de taipa/pedra, telhas cerâmicas, portas de madeira, oliveiras | campo ondulado, vinhedos e serra ao fundo; tarde dourada, noite com fogueira | família estendida (avós, Helena, crianças) |

Regras: o mesmo imóvel mantém volumes, materiais, posição da piscina e do sol entre planos; nenhuma placa, logo ou marca
visível; nenhuma pessoa real reconhecível; nada de arquitetura impossível.

## 3. Shot list e prompts (para ferramenta externa de imagem → vídeo)

Prompts em inglês, formato usual das ferramentas. Proporção do master 16:9; planos marcados com ⇕ ganham versão nativa
9:16 para a edição vertical. Duração gerada ≈ 1,5× a usada na montagem.

**Restrições comuns (negative prompt):** `no text, no logos, no signage, no watermark, no brand names, no distorted
hands, no extra fingers, no warped architecture, no flickering, no morphing faces, no fast camera moves, no fisheye, no
oversaturated colors, no CGI look`.

| Plano | Dur. | Second Home | Enquadramento · câmera | Prompt |
|---|---|---|---|---|
| S01 ⇕ | 6 s | Mirante · Serra | aberto, drone lento para frente | `Cinematic aerial dolly forward at dawn over a misty mountain valley in southern Brazil, revealing a contemporary second home of light stone, warm wood and large glass panels with a cantilevered terrace; soft cold light turning golden, realistic architecture, 35mm film look, gentle and steady movement` |
| S02 | 5 s | Mirante · Serra | médio, travelling lateral | `Family of four on a wooden terrace of a stone-and-glass mountain house at golden hour, a woman in her early forties in light linen laughing with her partner and two children, natural candid moment, shallow depth of field, slow lateral tracking shot, warm natural light` |
| S03 | 3 s | Mirante · Serra | detalhe, estático | `Close detail of morning light moving across a linen sofa and oak floor inside a minimalist mountain house, dust particles in sunlight, calm, static camera, photorealistic` |
| S04 | 5 s | Mirante · Serra | médio por cima do ombro | `Over-the-shoulder shot of a woman holding a smartphone on a terrace overlooking a misty valley, phone screen softly out of focus, golden light, subtle push-in, cinematic` (a interface entra na pós) |
| S06 ⇕ | 6 s | Varanda · Litoral | aberto, grua descendo | `Wide crane-down shot of a coastal second home with white volumes, dark timber pergolas and an infinity pool facing a calm tropical sea at amber sunset, low cliffs, photorealistic architecture, slow elegant movement` |
| S07 | 4 s | Varanda · Litoral | detalhe, travelling | `Slow tracking shot along the edge of an infinity pool with beige stone deck, sea horizon and warm sunset reflections, no people, cinematic calm` |
| S08 | 4 s | Varanda · Litoral | médio, estático | `Empty shaded veranda with timber pergola and white linen loungers at dusk, gentle sea breeze moving the curtains, static camera, serene` |
| S09 | 4 s | — (casa do outro Titular, interior neutro) | detalhe de mãos | `Close-up of hands holding a smartphone on a wooden table by a window, face out of frame, soft daylight, subtle movement` (interface na pós) |
| S10 | 5 s | Varanda · Litoral | médio, câmera na mão estabilizada | `A couple in their forties arriving through a timber door into a bright coastal house with sea view, the woman smiling as she looks out, warm late light, natural movement` |
| S11 ⇕ | 5 s | Pátio · Campo | aberto, dolly para dentro do pátio | `Dolly forward through a wooden doorway into the central courtyard of a single-story countryside house with rammed-earth and stone walls, terracotta roof tiles and olive trees, vineyards and mountains beyond, golden afternoon light, photorealistic` |
| S12 | 4 s | Pátio · Campo | detalhe, travelling | `Slow tracking shot over a long outdoor table set with ceramics and linen under olive trees in a courtyard, warm afternoon light, no faces` |
| S13 | 5 s | Pátio · Campo | médio, estático | `Three generations of a family relaxing in a stone courtyard at late afternoon, grandparents and children, candid laughter, warm light, shallow depth of field` |
| S14 ⇕ | 5 s | Pátio · Campo | aberto, noite | `The same countryside courtyard house at blue hour, a fire pit glowing, warm windows, vineyards in silhouette, slow push-in, cinematic` |
| S15 | 3 s | Pátio · Campo | detalhe | `Close detail of wine glasses and hands near a fire pit at night, warm flickering light, faces out of frame` |
| S16 | 4 s | Pátio · Campo | médio, amanhecer | `Morning in the stone courtyard, a woman with a coffee cup opening wooden shutters to the vineyards, soft golden light, slow movement` |
| S17 ⇕ | 11 s | as três | montagem de 3–4 planos | reuso de sobras de S01–S16 (sem novo imóvel) |

S05 (mapa de luz dos três destinos) é gráfico editorial, não footage.

## 4. Inventário de assets

| Asset | Estado | Onde |
|---|---|---|
| Interfaces Request · Direct · Luxplus (16:9 e 9:16), com alfa, determinísticas | prontas (Etapas A e B) | `node prototypes/luxtory-club-video/capture.mjs --seq=…` |
| Trechos ProRes 4444 por modalidade | um por modalidade e formato; demais trechos sob demanda | `out/etapa-a/<seq>-<fmt>-alpha-prores4444.mov` |
| Assinatura com logo oficial (16:9 e 9:16) | pronta (prova desta etapa) | `--seq=assinatura` |
| Marcas de tempo dos toques (efeitos de toque e som) | prontas | `window.__demo.marks` de cada sequência |
| Footage S01–S17 | **a produzir** (§1, §3) | — |
| Locução (voz feminina ou masculina, 30–45 anos, natural) | **a gravar**, com cessão de direitos | — |
| Trilha | **a licenciar ou encomendar** | — |
| Efeitos sonoros e ambientes | **a licenciar** | — |
| Legendas pt-BR (SRT/ASS) e linha legal | texto pronto em `ROTEIRO.md`; aprovação pendente | — |
| Gráfico editorial S05 e títulos de modalidade | a produzir na montagem (Etapa D) | — |

## 5. Especificação de integração

| Item | Definição |
|---|---|
| Resolução | master 1920×1080; vertical 1080×1920. Planos com zoom > 110% sobre a interface pedem render 4K do trecho |
| Cadência | **24 fps** para o master cinematográfico na web; 29,97/30 se houver TV. As interfaces renderizam em qualquer cadência (`--fps=24`) |
| Alfa | *straight* (não premultiplicado) nos PNG e no ProRes 4444; interpretar como Straight |
| Cor | Rec.709 (BT.709, faixa limitada) nos MP4/MOV; cores da marca conferidas por amostragem após o encode |
| Posição e escala | 16:9: tarefa à direita, contexto embaixo à esquerda; 9:16: contexto no alto, tarefa embaixo. Camadas com alfa de quadro inteiro: mover/espelhar na montagem para não cobrir rostos |
| Áreas seguras | 16:9: título em 90% do quadro, faixa inferior de 18% livre para legenda; 9:16: interfaces entre 8% e 80% da altura |
| Sincronia | a voz conduz; interfaces entram 4–8 quadros depois da palavra-chave; toques e sons alinhados às `marks` |
| Legendas | pt-BR, até 2 linhas, ≤ 42 caracteres por linha; queimadas no 9:16, arquivo separado no 16:9 |
| Áudio | voz −3 dB acima da trilha nos trechos explicativos; loudness pelo canal (≈ −14 LUFS web) |
| Entregas | master 16:9, vertical 9:16, versões por modalidade (opcional), projeto de montagem com camadas separadas |

## 6. Direitos e conformidade

- [ ] Footage, voz, trilha e efeitos com licença para publicidade (canais, território e prazo) arquivada.
- [ ] Ferramenta de IA com licença comercial e sem marca d'água; nenhuma pessoa real reconhecível sem cessão de imagem.
- [ ] Nenhuma marca de Brand Partner sem autorização (BR-015); nenhuma placa ou logo de terceiros.
- [ ] Selo "demonstração conceitual" nas interfaces e linha legal na assinatura; nada sugere reserva disponível hoje.
- [ ] Copy final (narração, títulos, assinatura e linha legal) aprovada pelo fundador; revisão jurídica aplicável.

## 7. Decisões pendentes (Luxtory)

1. Caminho de footage e orçamento (§1): A + C recomendado.
2. Assinatura: corte *"Seja protagonista de histórias extraordinárias."* ou a headline aprovada completa.
3. Cadência do master: 24 fps (web) ou 29,97 (TV).
4. Voz: timbre e locutor(a).
5. Trilha: encomenda original ou biblioteca licenciada.
