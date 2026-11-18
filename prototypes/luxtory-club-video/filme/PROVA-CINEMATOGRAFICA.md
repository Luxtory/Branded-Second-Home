# Prova cinematográfica: kit de execução das três tomadas (v6.4)

> Material para executar a primeira prova visual (S06 Azzura, S02 Satori, S15 Olivar) depois da autorização. Nada foi
> gerado nem contratado. Complementa `DIRECAO-DE-ARTE.md` (descrições, bíblias, 17 planos). Fontes consultadas em
> 18/11/2026; preços e limites mudam e devem ser reconferidos na página oficial no dia da execução.

## 1. Ferramenta e cadência

**Fatos das fontes oficiais:**

| Ferramenta | Cadência | Resolução | Duração · formato | Outros pontos | Fonte |
|---|---|---|---|---|---|
| Google Veo 3.1 | **24 fps** | 720p, 1080p e 4K (4K conforme a versão do modelo) | 4, 6 ou 8 s; 16:9 e 9:16 | até 3 imagens de referência (no modo por referência: 8 s, e o 9:16 não está confirmado); a versão Lite não aceita referências; marca d'água invisível SynthID; arquivo fica 2 dias no servidor | [Veo 3.1 (Google Cloud)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate), [Gemini API: Veo](https://ai.google.dev/gemini-api/docs/veo) |
| Runway Gen-4 / Gen-4.5 | **24 fps** (Gen-4.5: 24 ou 25) | até 720p | 2 a 10 s | conversão de cadência em ferramenta separada | [Gen-4.5](https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5), [Gen-4](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video) |
| Kling 3.0 | sem especificação oficial (blogs da marca citam 30 fps) | 720p e 1080p | — | — | [API Kling](https://klingai.com/document-api/api/video/3-0-turbo/image-to-video) |

**Comparação:**
- **A. Master a 24 fps com Veo 3.1:**
  - o footage chega na cadência nativa e não há conversão;
  - as interfaces são determinísticas e renderizam nativamente a 24 fps (`capture.mjs --fps=24`), na mesma regeneração única do congelamento;
  - 24 fps é a cadência cinematográfica de referência;
  - Veo tem a maior resolução verificada entre as opções (1080p e 4K) e 9:16 nativo.
- **B. Manter 30 fps:**
  - exige ferramenta com saída de 30 fps documentada, e nenhuma das verificadas tem: o Runway é 24/25 fps em 720p, e o Kling não publica a cadência;
  - ou exige converter de 24 para 30 fps, que gera quadros repetidos (judder) ou interpolados (artefatos), o que a direção já vetou.

**Recomendação: A, master a 24 fps com Veo 3.1 executado pelo Google Cloud (Vertex), só vídeo.** Escolhida pela
qualidade verificável e pela ausência de conversão, não pela cadência em si. No Gemini API, o áudio do Veo 3.1 é
sempre gerado ([Gemini API: Veo](https://ai.google.dev/gemini-api/docs/veo)); a tarifa só vídeo aparece na tabela do
Google Cloud.

**Sequência aprovada para a cadência:**
1. confirmar a ferramenta no pré-voo (§3);
2. validar a primeira tomada;
3. só então capturar as interfaces a 24 fps, no congelamento, validando os arquivos codificados (não só o navegador).

Sem interpolação de quadros.

**Impactos de A,** todos dentro da regeneração única do congelamento:
- interfaces e prova capturadas a 24 fps;
- `check.mjs` varrendo os quadros a 24 fps;
- EDL da prova a 24 fps.

Os tempos da coreografia estão em milissegundos e não mudam. TV, se houver, define 23,976 ou 29,97 antes do master.

**Evidência sem custo:** `check.mjs --fps=24` varre todos os quadros a 24 fps. Request, Direct, Luxplus, Créditos e
assinatura, nos dois formatos, ficam conformes: sobreposição 0, axe, limites do quadro, área segura e determinismo.
Falta só a validação dos arquivos codificados, feita na captura do congelamento.

## 2. Pessoas menores de idade

**O que a documentação oficial diz:**
- `personGeneration` existe com os valores de adultos e de todas as idades
  ([parâmetros](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/Shared.Types/VideoGenerationModelParams)).
- O valor para todas as idades vale só para texto → vídeo e extensão de vídeo. Imagem → vídeo, interpolação e
  imagens de referência ficam restritos a adultos ([Gemini API: Veo](https://ai.google.dev/gemini-api/docs/veo)).
- A geração por referências usa por padrão "somente adultos" e não gera jovens nem crianças
  ([referências](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references)).
- Na UE, no Reino Unido, na Suíça e no Oriente Médio, só o valor de adultos é permitido.

**Consequência:** com o Veo, crianças só sairiam por texto → vídeo, sem imagem-chave nem referência de personagem.
Ou seja, sem consistência de casa e de rosto. Esse caminho não atende à continuidade exigida.

**Decisão aplicada:**
- **A família continua no filme.** Na prova, o S02 testa Helena e o parceiro: identidade, movimento natural,
  expressões, integração com a arquitetura e continuidade.
- **Na produção, os planos com crianças (S02 e S13 completos, sobras de S17)** seguem por footage licenciado com
  autorizações de imagem, por filmagem pontual com autorização dos responsáveis ou por outra ferramenta cujos termos
  permitam comprovadamente esses planos.
- **Nenhum método para contornar as restrições de segurança do gerador.**

## 3. Recursos reais: o que está confirmado e o pré-voo

| Recurso necessário | Situação nas fontes oficiais | Uso no pipeline |
|---|---|---|
| Só vídeo (sem áudio) | tarifa só vídeo na tabela do Google Cloud; no Gemini API o áudio é sempre gerado | executar pelo Vertex; confirmar no pré-voo o parâmetro de desligar o áudio no modelo escolhido |
| Imagem → vídeo (primeiro quadro) | documentado, com pessoas adultas | caminho principal das três tomadas |
| Primeiro quadro + imagens de referência na mesma chamada | **não confirmado** em documentação oficial | não usado: o primeiro quadro já sai composto com casa e personagens |
| Imagens de referência (até 3) | documentado; o modo por referência gera 8 s; o 9:16 com referências não está confirmado; a versão Lite não aceita | alternativa só se o primeiro quadro composto falhar em identidade |
| 16:9 e 9:16 | documentado na especificação geral | S06 nos dois formatos, cada um com o seu primeiro quadro derivado da mesma K-AZ |
| 1080p a 8 s | documentado ("8 s se 1080p ou 4K") | padrão da prova |
| Composição de imagem com até 3 entradas | documentado no Gemini 2.5 Flash Image (até 3 imagens por prompt; fusão de várias imagens) ([modelo](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-image)) | primeiro quadro do S02 e versão vertical da K-AZ; o modelo será aposentado em 15/03/2027, depois da prova |

**Pré-voo na conta, antes de qualquer geração paga:**
1. projeto do Google Cloud com Vertex AI ativado e região definida (ex.: `us-central1`, fora das regiões com restrição
   extra a pessoas);
2. modelos `veo-3.1` Standard e Fast, `imagen-4` Ultra e `gemini-2.5-flash-image` listados e disponíveis na região,
   pela consulta de modelos (metadado, sem geração);
3. limites de uso (quota) de vídeo e imagem do projeto;
4. no esquema da API do modelo escolhido: parâmetro de áudio desligável, `personGeneration` de adultos com imagem de
   entrada, `aspectRatio` 9:16 com imagem de entrada, `resolution` 1080p, `durationSeconds` 8 e `negativePrompt`;
5. confirmar se uma requisição rejeitada na validação gera cobrança: a primeira chamada real do estágio B confirma os
   parâmetros, e a fatura do dia confirma o custo.

Se o Fast não aceitar imagem de entrada sem áudio, o estágio B usa o Standard só vídeo (§4).

## 4. Orçamento

### 4.1 Preços oficiais (Google Cloud, consulta em 18/11/2026)

Fonte: [tabela de preços do Google Cloud para IA generativa](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
(referência da Luxtory: [Model Garden](https://cloud.google.com/model-garden/pricing)). A tabela usa a unidade "por
contagem"; o Gemini API informa preço por segundo. Confirmar a unidade no dia da execução.

| Modelo | 720p só vídeo | 720p com áudio | 1080p só vídeo | 1080p com áudio | 4K com áudio |
|---|---|---|---|---|---|
| Veo 3.1 Standard | US$ 0,20 | US$ 0,40 | **US$ 0,20** | US$ 0,40 | US$ 0,60 |
| Veo 3.1 Fast | não confirmado | US$ 0,10 | **US$ 0,10** | US$ 0,12 | US$ 0,30 |
| Veo 3.1 Lite | US$ 0,03 | US$ 0,05 | US$ 0,05 | US$ 0,08 | — (pagamento por uso em conflito na documentação) |

| Imagem | Preço oficial |
|---|---|
| Imagen 4 Ultra | US$ 0,06 por imagem ([preços](https://docs.cloud.google.com/vertex-ai/generative-ai/pricing)) |
| Gemini 2.5 Flash Image | US$ 0,039 por imagem até 1024 px ([preços do Gemini API](https://ai.google.dev/gemini-api/docs/pricing)) |

Upscale de vídeo do Veo existe ([anúncio](https://cloud.google.com/blog/products/ai-machine-learning/veo-3-1-lite-and-a-new-veo-upscaling-capability-on-vertex-ai)),
mas não entra na prova: o master é 1080p.

### 4.2 O teto anterior, corrigido

Com as mesmas quantidades da v6.3, só trocando para só vídeo:

| | Com áudio (v6.3) | Só vídeo |
|---|---|---|
| ~140 imagens + upscale | US$ 8,90 | US$ 8,90 |
| 30 clipes Fast de 8 s | US$ 28,80 | US$ 24,00 |
| 24 clipes Standard de 8 s | US$ 76,80 | US$ 38,40 |
| Reserva de 30% | US$ 31,70 | US$ 18,70 |
| **Total** | **≈ US$ 146** | **≈ US$ 90** |

Esse volume é um teto de experimentação, não o plano da primeira prova.

### 4.3 Plano escalonado da prova (preços só vídeo, 1080p, 8 s)

Cada estágio só começa com o anterior aprovado e o teto autorizado pela Luxtory.

| Estágio | O que se gera | Quantidade | Custo bruto estimado | Teto proposto |
|---|---|---|---|---|
| **A · Referências** | K-AZ, K-SA, K-HE, parceiro e K-OL no Imagen 4 Ultra, 3 candidatas cada; derivações no Gemini 2.5 Flash Image: K-OL-n (2), K-AZ vertical (2), primeiro quadro do S02 (3) e do S15 (2) | 15 + 9 imagens | ≈ US$ 1,25 | **US$ 5** |
| **B · Teste mínimo de vídeo** | uma candidata por tomada no Veo 3.1 Fast só vídeo: S06 16:9, S06 9:16, S02, S15 | 4 × 8 s × US$ 0,10 | ≈ US$ 3,20 (US$ 6,40 se for preciso usar o Standard) | **US$ 8** |
| **C · Refinamento seletivo** | só tomadas aprovadas no conceito, no Veo 3.1 Standard só vídeo; até 2 candidatas por tomada e formato, e mais só por defeito específico | até 8 × 8 s × US$ 0,20 | ≈ US$ 12,80 | **US$ 20** |
| **Custo bruto de geração (tetos)** | | | ≈ US$ 17 | **US$ 33** |

**Do custo bruto ao orçamento total da prova:**

| Item | Estimativa |
|---|---|
| Custo bruto de geração | até US$ 33 (tetos somados) |
| Tributos na contratação local no Brasil | +14% ([IVA do Google Cloud](https://docs.cloud.google.com/billing/docs/resources/vat-overview?hl=pt-br)) ≈ US$ 4,60; se for cartão internacional, o IOF e o câmbio são confirmados com o financeiro (alíquota não verificada aqui) |
| Armazenamento dos arquivos (Cloud Storage, poucos GB por um mês) e saída de dados | centavos; confirmar na tabela do Cloud Storage |
| **Orçamento total da prova** | **≈ US$ 38**, sem câmbio |

Não entram na prova: upscale, 4K, narração, trilha e efeitos, footage licenciado e filmagem. Esses itens são orçados
para a produção depois da prova, com o custo real por tomada aprovada.

## 5. Estágio A: kit enxuto das imagens-chave

Uma imagem-chave mestra por casa, aprovada antes de qualquer tomada. As derivações partem da imagem aprovada, nunca de
um texto novo que crie outra casa.

| Chave | Ferramenta | Candidatas | Prompt ou instrução |
|---|---|---|---|
| K-AZ | Imagen 4 Ultra, 16:9 | 3 | `Architectural photograph of a contemporary beachfront second home with white cantilevered volumes, frameless glass, a dark timber pergola over the terrace and an infinity pool facing a calm tropical sea, beige stone deck, low cliffs, amber sunset, house in the upper-left third and open sea and sky on the right, 24mm lens, view from the sea side at pool level, photorealistic, premium architectural photography` |
| K-AZ vertical | Gemini 2.5 Flash Image, edição da K-AZ aprovada | 2 | entrada: K-AZ. Instrução: `Extend this exact photograph to a 9:16 vertical frame. Keep the same house, materials, pergola, pool, horizon and light unchanged; add only sky above and stone deck below; do not redesign any part of the architecture.` |
| K-SA | Imagen 4 Ultra, 16:9 | 3 | `Architectural photograph of a contemporary hillside mountain second home built from two horizontal volumes of stacked light stone and warm timber, floor-to-ceiling frameless glass, a cantilevered stone terrace with a glass balustrade over a misty Atlantic-forest valley in southern Brazil, thin flat roof with a slim eave, golden hour, no sea, 35mm lens, photorealistic` |
| K-HE | Imagen 4 Ultra | 3 | `Character reference sheet of a Brazilian woman in her early forties, shoulder-length wavy brown hair, natural makeup, thin gold ring, light linen clothing; front, three-quarter, profile and full-body views on a neutral light-gray background, soft even studio light, photorealistic, no text` |
| Parceiro | Imagen 4 Ultra | 3 | `Character reference sheet of a Brazilian man in his mid-forties, short gray-flecked beard, light linen shirt; front, three-quarter, profile and full-body views on a neutral light-gray background, soft even studio light, photorealistic, no text` |
| K-OL | Imagen 4 Ultra, 16:9 | 3 | prompt K-OL de `DIRECAO-DE-ARTE.md` §3 |
| K-OL-n | Gemini 2.5 Flash Image, edição da K-OL aprovada | 2 | entrada: K-OL. Instrução: `Same photograph, same house, courtyard, olive tree and framing; change only the time to winter blue hour: a low steel fire bowl glowing in the stone courtyard and warm light in the windows. Do not change any architecture.` |
| Primeiro quadro do S02 | Gemini 2.5 Flash Image, composição | 3 | entradas: K-SA, K-HE e a folha do parceiro (as 3 permitidas). Instrução: `Using the house from image 1 and the two people from images 2 and 3, create a photorealistic medium shot of them standing together on the cantilevered stone terrace at golden hour, talking naturally; keep the architecture of image 1 and the faces and clothing of images 2 and 3 exactly; 16:9.` |
| Primeiro quadro do S15 | Gemini 2.5 Flash Image, edição da K-OL-n | 2 | entrada: K-OL-n. Instrução: `Close detail in the same stone courtyard at night: two wine glasses held by two hands in cream knitwear sleeves near the same low steel fire bowl; faces out of frame; shallow depth of field; 16:9.` |

**Aprovação do estágio A:** arquitetura, materiais, iluminação, enquadramento e continuidade (mesma casa nas
derivações). Rostos de Helena e do parceiro estáveis entre a folha e o primeiro quadro do S02.

## 6. Estágios B e C: prompts para os recursos suportados

Parâmetros (Vertex, Veo 3.1): imagem → vídeo com o primeiro quadro aprovado; áudio desligado; adultos com imagem de
entrada; 1080p; 8 s; uma amostra; semente fixa registrada para reprodutibilidade; `negativePrompt` com o negativo
comum de `DIRECAO-DE-ARTE.md` §0. Estágio B no Fast; estágio C no Standard.

| Tomada | Primeiro quadro | Formato | Prompt de movimento |
|---|---|---|---|
| **S06 · Azzura** | K-AZ e K-AZ vertical | 16:9 e 9:16 | `Slow cinematic crane-down toward pool level revealing the beachfront house, white cantilevered volumes, dark timber pergola and infinity pool facing a calm sea at amber sunset; the house stays in the upper-left third, sea and sky open on the right; calm water with soft reflections; straight architectural lines remain straight; steady motion; photorealistic` |
| **S02 · Satori** | primeiro quadro composto do S02 | 16:9 | `Helena and her partner talk and laugh naturally on the cantilevered stone terrace at golden hour; she turns toward him and touches his arm; candid, unposed, natural hand movement; misty valley behind them; slow lateral tracking from left to right; shallow depth of field; warm natural light; photorealistic` |
| **S15 · Olivar** | primeiro quadro do S15 | 16:9 | `The two hands gently touch the wine glasses in a toast near the low steel fire bowl; warm flickering firelight; faces out of frame; fire soft in the background; very slow push-in; shallow depth of field; photorealistic` |

**Alternativa só se o S02 falhar em identidade:** modo por referências (K-HE e a folha do parceiro como referências de
personagem, 8 s, 16:9), respeitando as suas restrições.

## 7. Critérios de aceitação e contingências

**Reprovação imediata,** sem média de notas, com qualquer um destes defeitos graves:
- casa diferente da imagem-chave;
- vidro, madeira, pedra ou volumes deformados;
- proporções erradas;
- mudança de rosto ou de identidade entre quadros;
- anatomia incorreta (mãos, dedos, membros);
- movimento artificial (flutuação, trancos, pulsos).

**Sem defeito grave,** nota de 1 a 5, com mínimo de 4 em cada item:

| Grupo | Itens |
|---|---|
| Arquitetura | mesma casa; proporções; materiais consistentes |
| Pessoas (S02) | rostos consistentes; expressões naturais; gestos plausíveis |
| Cinematografia | movimento suave; luz sofisticada; composição premium; cores naturais; nenhum artefato perceptível |
| Integração | espaço negativo para a interface; edição horizontal e vertical possível; continuidade com os planos previstos; 1080p real |

**Contingências:**
- **S06:** câmera 2,5D (paralaxe) sobre a K-AZ aprovada, se as linhas entortarem.
- **S02:** primeiro o modo por referências; se falhar, footage licenciado ou filmagem pontual.
- **S15:** enquadrar as mãos parcialmente fora do quadro; se o vidro ou o fogo falharem, detalhe licenciado ou
  filmagem.
- **Regra geral:** uma reprovação muda a fonte daquele plano, nunca a direção de arte.

## 8. Sem custo × com autorização

**Concluído sem custo:**
- orçamento corrigido;
- pipeline de referências revisado;
- kit enxuto, prompts para os recursos suportados, plano escalonado, critérios e contingências.

**Com autorização, em ordem:**
1. projeto do Google Cloud com faturamento e o pré-voo (§3);
2. estágio A (teto de US$ 5);
3. estágio B (teto de US$ 8), depois de aprovar as referências;
4. estágio C (teto de US$ 20), só para as tomadas aprovadas no conceito.

**Ao fim de cada estágio, apresentar:**
- as referências e os vídeos realmente gerados;
- o custo efetivamente consumido;
- a avaliação crítica pelos critérios do §7;
- se é preciso ou não uma nova rodada.

Prompt sem geração não é footage.
