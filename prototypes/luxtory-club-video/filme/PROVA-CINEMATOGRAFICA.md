# Prova cinematográfica: kit de execução das três tomadas (v6.5)

> Material para executar a primeira prova visual (S06 Azzura, S02 Satori, S15 Olivar) depois da autorização. Nada foi
> gerado nem contratado. Complementa `DIRECAO-DE-ARTE.md` (descrições, bíblias, 17 planos). Fontes consultadas em
> 18/11/2026; preços e limites mudam e devem ser reconferidos na página oficial no dia da execução.

## 1. Ferramenta e cadência

**Fatos das fontes oficiais:**

| Ferramenta | Cadência | Resolução | Duração · formato | Outros pontos | Fonte |
|---|---|---|---|---|---|
| Google Veo 3.1 | **24 fps** | 720p, 1080p e 4K (4K conforme a versão do modelo) | 4, 6 ou 8 s; 16:9 e 9:16 | até 3 imagens de referência (no modo por referência: 8 s, e o 9:16 não está confirmado); a versão Lite não aceita referências; marca d'água invisível SynthID; arquivo fica 2 dias no servidor | [Veo 3.1 (Google Cloud)](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate), [Gemini API: Veo](https://ai.google.dev/gemini-api/docs/veo) |
| Runway Gen-4 / Gen-4.5 | **24 fps** (Gen-4.5: 24 ou 25) | até 720p | 2 a 10 s | conversão de cadência em ferramenta separada | [Gen-4.5](https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5), [Gen-4](https://help.runwayml.com/hc/en-us/articles/37327109429011-Creating-with-Gen-4-Video) |
| Google Gemini Omni 1.2 Flash (`gemini-omni-1.2-flash`, GA) | **não documentada** na geração (24 fps documentado no upscale) | 360p, 720p (padrão), 1080p e 4K | 3 a 15 s; 16:9 e 9:16 | imagem → vídeo com primeiro quadro (`task: image_to_video`); **cobrança por uso em tokens** no Gemini API e no Google Cloud; SynthID | [modelo](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-1-2-flash), [GA](https://cloud.google.com/blog/products/ai-machine-learning/gemini-omni-1-2-flash-generally-available), [Gemini API](https://ai.google.dev/gemini-api/docs/omni) |
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

**Acesso ao Veo 3.1 no Google Cloud (v6.5).** As páginas dos modelos GA (`veo-3.1-generate-001` e
`veo-3.1-fast-generate-001`, região `us-central1`, aposentadoria a partir de 04/05/2027) marcam "pay-as-you-go: não
suportado", "fixed quota: suportado" e "Provisioned Throughput: suportado"
([Veo 3.1](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/veo/3-1-generate)).

- **"Fixed quota":** nenhuma página oficial indexada define o termo. Não está provado que um projeto com faturamento
  compre poucas gerações avulsas.
- **Provisioned Throughput:** é assinatura de prazo e custo fixos, inadequada para uma prova de quatro clipes
  ([PT](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/provisioned-throughput/overview)).
- **Unidade da tabela:** "por contagem"; só no Provisioned Throughput a unidade aparece em segundos de vídeo.
- **Áudio:** nenhum parâmetro oficial para desligar foi encontrado.

**Recomendação de ferramenta (v6.5):**
- **Cadência:** master a 24 fps, mantido.
- **Vídeo da prova: Gemini Omni 1.2 Flash, pelo Gemini API.** É GA, com cobrança por uso confirmada em tokens,
  primeiro quadro, 1080p, 16:9 e 9:16. O próprio Google o indica como sucessor do Veo 3.1 Fast e Quality no Flow,
  que saem de linha em 05/12/2026 ([modelos do Flow](https://support.google.com/flow/answer/16352836?hl=en)).
- **Veo 3.1 Standard:** fica como candidato de qualidade só se o pré-voo provar o acesso sem compromisso (§3).
- **Cadência do Omni:** não está documentada. O primeiro clipe do estágio B é medido com `ffprobe`. Se não vier a 24
  fps nativo, o vídeo passa ao Veo, se acessível, ou a decisão de cadência é reaberta antes de qualquer master.
  Nunca interpolar.

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

## 3. Pré-voo técnico e financeiro

| Ponto | Situação nas fontes oficiais | Como fecha |
|---|---|---|
| 1. Unidade de cobrança do vídeo | Omni: tokens de saída (US$ 12 por 1M; 1080p = 8.688 tokens por segundo). Veo sob demanda: "por contagem", unidade não definida | Omni confirmado; Veo, só com o consumo real no relatório de faturamento |
| 2. Poucas requisições com cobrança proporcional | Omni: sim, por uso | Veo: não comprovado ("pay-as-you-go: não suportado") |
| 3. Fixed quota do Veo | não definido em documentação indexada | Console de limites de uso (quota) do projeto e, se preciso, o suporte do Google Cloud; sem compra de Provisioned Throughput |
| 4. Contratação mínima | Omni e imagens: sem compromisso documentado; Provisioned Throughput: assinatura de prazo fixo | não contratar Provisioned Throughput para a prova |
| 5. Disponibilidade no projeto e na região | Veo GA em `us-central1`; Omni e Nano Banana 2.1 GA no Gemini API e no endpoint global do Google Cloud | consulta de modelos com a chave do projeto (metadado, sem geração) |
| 6. Áudio desligável | Veo: nenhum parâmetro oficial; Omni: preço de saída "com áudio" | o áudio é descartado na montagem; o custo já inclui áudio |
| 7. IDs atuais (GA, sem preview) | imagem `gemini-nano-banana-2.1`; vídeo `gemini-omni-1.2-flash`; candidato `veo-3.1-generate-001` | não usar `veo-3.1-generate-preview` (encerrado no Gemini API em out/2026) nem `gemini-2.5-flash-image` (aposentado em 15/03/2027) |
| Cadência e pessoas no Omni | não documentadas | primeiro clipe: `ffprobe` (24 fps?) e a resposta à imagem com adultos |

**Modelo de imagem: Gemini Nano Banana 2.1** (`gemini-nano-banana-2.1`, GA), um único modelo para gerar e editar
([modelo](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1),
[Gemini API](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1)).
- **Capacidades:** até 14 imagens de entrada, consistência de até 4 personagens, edição conversacional, saída em 1K,
  2K ou 4K e formatos 16:9 e 9:16.
- **Frente ao Gemini 3.1 Flash Image:** este está em preview no Google Cloud e, na própria documentação do Gemini API,
  aparece como geração anterior; além disso, custa o dobro em 2K.
- **Frente ao 3.1 Flash-Lite Image:** este só gera 1K e custa o mesmo que o 2.1 em 1K.

Ou seja, o Nano Banana 2.1 cobre as imagens-chave em 2K e as iterações em 1K sem contratar um segundo serviço. Se a
composição do S02 não convencer em identidade ou arquitetura, aquele estágio é reprovado, e não "aceito porque o
modelo leu três imagens".

## 4. Orçamento revisado

### 4.1 Preços oficiais usados (Gemini API, nível pago, consulta em 18/11/2026)

| Item | Preço | Fonte |
|---|---|---|
| Nano Banana 2.1, entrada | US$ 1,50 por 1M tokens; 1.120 tokens por imagem de entrada (≈ US$ 0,0017) | [preços](https://ai.google.dev/gemini-api/docs/pricing), [modelo](https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1) |
| Nano Banana 2.1, saída | US$ 30 por 1M tokens: ≈ US$ 0,034 (1K), US$ 0,050 (2K), US$ 0,113 (4K) por imagem | [preços](https://ai.google.dev/gemini-api/docs/pricing) |
| Omni 1.2 Flash, saída (com áudio) | US$ 12 por 1M tokens: 720p = 5.792 tokens por segundo (≈ US$ 0,07/s); 1080p = 8.688 (≈ US$ 0,104/s); 4K = 17.376 (≈ US$ 0,21/s) | [preços do Google Cloud](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), [GA](https://cloud.google.com/blog/products/ai-machine-learning/gemini-omni-1-2-flash-generally-available) |
| Veo 3.1 Standard só vídeo (candidato) | US$ 0,20 "por contagem", unidade e acesso não confirmados | [preços do Google Cloud](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) |

### 4.2 Estágios

| Estágio | O que se gera | Custo bruto estimado | Teto |
|---|---|---|---|
| **A · Referências** (Nano Banana 2.1, 2K) | 5 chaves × 3 candidatas (K-AZ, K-SA, K-HE, parceiro, K-OL) + 9 edições (K-AZ vertical 2, K-OL-n 2, primeiro quadro do S02 3, do S15 2), com 1 a 3 imagens de entrada | 24 × US$ 0,050 + entradas ≈ **US$ 1,25** | **US$ 5** |
| **B · Teste mínimo** (Omni 1.2 Flash, 1080p, 8 s) | 1 candidata por tomada: S06 16:9, S06 9:16, S02, S15 | 4 × 8 s × US$ 0,104 ≈ **US$ 3,34** | **US$ 8** |
| **C · Refinamento** (só tomadas aprovadas no conceito) | até 2 candidatas por tomada e formato: Veo 3.1 Standard se o acesso for comprovado, ou Omni 1.2 Flash em 1080p (4K só para as finais) | Omni 1080p: 8 × US$ 0,83 ≈ **US$ 6,70**; Omni 4K: 8 × US$ 1,67 ≈ US$ 13,40 | **US$ 20** |
| **Custo bruto (estimativa · tetos)** | | **≈ US$ 11 a 18 · US$ 33** | |

| Do bruto ao total | Estimativa |
|---|---|
| Tributos: contratação local no Brasil | +14% ([IVA do Google Cloud](https://docs.cloud.google.com/billing/docs/resources/vat-overview?hl=pt-br)); com cartão internacional, IOF e câmbio a confirmar com o financeiro |
| Armazenamento | os arquivos do Gemini API ficam 2 dias no servidor e são baixados; o armazenamento próprio custa centavos |
| Cobrança mínima ou compromisso | nenhum no caminho recomendado; Provisioned Throughput fora da prova |
| **Orçamento total da prova** | **≈ US$ 13 a 21 estimados; até ≈ US$ 38 com os tetos e os tributos** |

Os tetos de US$ 5, 8 e 20 continuam compatíveis com os preços confirmados. O valor é estimativa condicionada ao
consumo real, não custo final.

## 5. Estágio A: kit enxuto das imagens-chave (Nano Banana 2.1, 2K)

Uma imagem-chave mestra por casa, aprovada antes de qualquer tomada. As variações saem por edição da imagem aprovada,
nunca por texto novo que recrie a arquitetura. Prompts e instruções são os da v6.4, só com o modelo trocado.

| Chave | Operação | Candidatas | Prompt ou instrução |
|---|---|---|---|
| K-AZ | geração, 16:9 | 3 | `Architectural photograph of a contemporary beachfront second home with white cantilevered volumes, frameless glass, a dark timber pergola over the terrace and an infinity pool facing a calm tropical sea, beige stone deck, low cliffs, amber sunset, house in the upper-left third and open sea and sky on the right, 24mm lens, view from the sea side at pool level, photorealistic, premium architectural photography` |
| K-AZ vertical | edição da K-AZ aprovada, 9:16 | 2 | `Extend this exact photograph to a 9:16 vertical frame. Keep the same house, materials, pergola, pool, horizon and light unchanged; add only sky above and stone deck below; do not redesign any part of the architecture.` |
| K-SA | geração, 16:9 | 3 | `Architectural photograph of a contemporary hillside mountain second home built from two horizontal volumes of stacked light stone and warm timber, floor-to-ceiling frameless glass, a cantilevered stone terrace with a glass balustrade over a misty Atlantic-forest valley in southern Brazil, thin flat roof with a slim eave, golden hour, no sea, 35mm lens, photorealistic` |
| K-HE | geração | 3 | `Character reference sheet of a Brazilian woman in her early forties, shoulder-length wavy brown hair, natural makeup, thin gold ring, light linen clothing; front, three-quarter, profile and full-body views on a neutral light-gray background, soft even studio light, photorealistic, no text` |
| Parceiro | geração | 3 | `Character reference sheet of a Brazilian man in his mid-forties, short gray-flecked beard, light linen shirt; front, three-quarter, profile and full-body views on a neutral light-gray background, soft even studio light, photorealistic, no text` |
| K-OL | geração, 16:9 | 3 | prompt K-OL de `DIRECAO-DE-ARTE.md` §3 |
| K-OL-n | edição da K-OL aprovada | 2 | `Same photograph, same house, courtyard, olive tree and framing; change only the time to winter blue hour: a low steel fire bowl glowing in the stone courtyard and warm light in the windows. Do not change any architecture.` |
| Primeiro quadro do S02 | composição (entradas: K-SA, K-HE, parceiro) | 3 | `Using the house from image 1 and the two people from images 2 and 3, create a photorealistic medium shot of them standing together on the cantilevered stone terrace at golden hour, talking naturally; keep the architecture of image 1 and the faces and clothing of images 2 and 3 exactly; 16:9.` |
| Primeiro quadro do S15 | edição da K-OL-n | 2 | `Close detail in the same stone courtyard at night: two wine glasses held by two hands in cream knitwear sleeves near the same low steel fire bowl; faces out of frame; shallow depth of field; 16:9.` |

**Aprovação do estágio A:**
- arquitetura, materiais, luz, enquadramento e continuidade;
- a mesma casa nas derivações, comparada lado a lado com a imagem-chave;
- rostos de Helena e do parceiro estáveis entre as folhas e o primeiro quadro do S02;
- aspecto fotográfico real, sem acabamento de CGI.

## 6. Estágios B e C: parâmetros e prompts de movimento

- **Estágio B (Omni 1.2 Flash):** `task: image_to_video` com o primeiro quadro aprovado, `aspect_ratio` 16:9 ou 9:16,
  `resolution` 1080p, duração de 8 s. O negativo comum de `DIRECAO-DE-ARTE.md` §0 vai como restrição no texto.
- **Estágio C:** a mesma entrada no Veo 3.1 Standard (adultos com imagem de entrada, 1080p, 8 s), se o acesso for
  comprovado; senão, no Omni.
- **Os prompts de movimento não mudam:**
  - **S06:** `Slow cinematic crane-down toward pool level revealing the beachfront house, white cantilevered volumes, dark timber pergola and infinity pool facing a calm sea at amber sunset; the house stays in the upper-left third, sea and sky open on the right; calm water with soft reflections; straight architectural lines remain straight; steady motion; photorealistic`
  - **S02:** `Helena and her partner talk and laugh naturally on the cantilevered stone terrace at golden hour; she turns toward him and touches his arm; candid, unposed, natural hand movement; misty valley behind them; slow lateral tracking from left to right; shallow depth of field; warm natural light; photorealistic`
  - **S15:** `The two hands gently touch the wine glasses in a toast near the low steel fire bowl; warm flickering firelight; faces out of frame; fire soft in the background; very slow push-in; shallow depth of field; photorealistic`
- **Alternativa se o S02 falhar em identidade:** o modo por referências (`reference_to_video` no Omni, ou referências
  no Veo), respeitando as restrições do fornecedor.

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

## 8. Autorização e execução

**Indispensável para começar:** autorizar uma chave do Gemini API no nível pago (projeto do Google Cloud com
faturamento), com alerta de orçamento no teto do estágio, e o estágio A (teto de US$ 5).

**Depois, em ordem:**
1. estágio B (teto de US$ 8), depois de aprovar as imagens-chave;
2. estágio C (teto de US$ 20), só com as tomadas aprovadas no conceito.

O pedido de acesso ao Veo (limites de uso do projeto ou suporte) pode correr em paralelo, sem compra de Provisioned
Throughput.

**Ao fim de cada estágio, apresentar:**
- as imagens e os vídeos realmente gerados, por imóvel;
- o custo consumido segundo o relatório de faturamento;
- a avaliação pelos critérios do §7;
- se é preciso ou não uma nova rodada.

Prompt sem geração não é footage.
