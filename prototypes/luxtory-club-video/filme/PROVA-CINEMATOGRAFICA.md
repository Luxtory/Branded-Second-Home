# Prova cinematográfica: kit de execução das três tomadas (v6.3)

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

**Recomendação: A, master a 24 fps com Veo 3.1 Standard como ferramenta principal.** Escolhida pela qualidade
verificável e pela ausência de conversão, não pela cadência em si.

**Impactos de A,** todos dentro da regeneração única do congelamento:
- interfaces e prova capturadas a 24 fps;
- `check.mjs` varrendo os quadros a 24 fps;
- EDL da prova a 24 fps.

Os tempos da coreografia estão em milissegundos e não mudam. TV, se houver, define 23,976 ou 29,97 antes do master.

## 2. Restrição a resolver antes da prova: pessoas menores de idade

A documentação oficial do Google Cloud diz que, nos modos de imagem → vídeo e por referência, o padrão é "Allow
(Adults only)", que "não gera jovens nem crianças" ([referências](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references),
[imagem → vídeo](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-an-image)).
Não há caminho oficial para gerar menores com consistência de personagem.

- **Planos afetados:** S02 (Helena com o parceiro e os dois filhos), S13 (três gerações, com as crianças) e as sobras
  com crianças em S17.
- **Prova sem bloqueio:** o S02 da prova testa a capacidade crítica (movimento humano natural e identidade de Helena)
  com **Helena e o parceiro**, sem crianças.
- **Decisão criativa da Luxtory** para o filme, escolher um caminho:
  1. manter as crianças e produzir S02 e S13 com footage licenciado (com autorização de imagem) ou filmagem pontual
     (com autorização dos responsáveis), mantendo a IA nos demais planos;
  2. redefinir a família dos planos com IA só com adultos (por exemplo Helena, o parceiro e os pais dela) e ajustar a
     bíblia de personagens.

## 3. Orçamento discriminado da prova

Preços oficiais por uso, sem assinatura. Requer conta de faturamento no Gemini API (nível pago) ou no Google Cloud.
Valores em dólar, sem impostos nem câmbio.

| Item | Preço oficial | Quantidade | Subtotal |
|---|---|---|---|
| Imagens-chave, Imagen 4 Ultra | US$ 0,06 por imagem ([preços Google Cloud](https://docs.cloud.google.com/vertex-ai/generative-ai/pricing)) | ~140 candidatas (K-AZ 16:9 e 9:16, K-SA, K-HE, parceiro, K-OL, K-OL-n) | ≈ US$ 8,40 |
| Upscale das imagens aprovadas | US$ 0,06 por imagem | 8 | ≈ US$ 0,50 |
| Exploração, Veo 3.1 Fast 1080p | US$ 0,12/s ([preços Gemini API](https://ai.google.dev/gemini-api/docs/pricing)) | 30 clipes × 8 s | ≈ US$ 28,80 |
| Candidatas finais, Veo 3.1 Standard 1080p | US$ 0,40/s (US$ 3,20 por clipe de 8 s) | S06 16:9 × 6, S06 9:16 × 4, S02 × 8, S15 × 6 = 24 clipes | ≈ US$ 76,80 |
| Reserva para tentativas rejeitadas (30% de exploração + finais) | — | — | ≈ US$ 31,70 |
| **Total da prova** | | | **≈ US$ 146** |
| Opcional: 4K das tomadas aprovadas | US$ 0,60/s | 4 clipes × 8 s | ≈ US$ 19,20 |
| Opcional: clipe licenciado de família com crianças, como comparação ao S02 | por clipe, conforme o banco | 1–2 | a orçar |

**Observações:**
- **Áudio:** o Veo 3.1 gera áudio nativamente e o preço listado é de vídeo com áudio. O áudio é descartado; o som do
  filme vem de trilha e efeitos licenciados.
- **Licença comercial:** a documentação do Google Cloud permite uso em produção e comercial do Veo 3.1 sob o contrato
  do Google Cloud, e o Google anuncia indenização para serviços de IA generativa no Vertex
  ([anúncio](https://cloud.google.com/blog/products/ai-machine-learning/announcing-veo-3-imagen-4-and-lyria-2-on-vertex-ai)). Para o Gemini API, os
  termos do nível pago devem ser conferidos antes. Recomendo executar pelo Google Cloud (Vertex).
- **Fora da prova, para a produção:**
  - **Trilha e efeitos:** licença por faixa para anúncios digitais (exemplo oficial: Epidemic Sound, US$ 99,99 por faixa)
    ou plano empresarial; TV exige licença própria ([Epidemic Sound](https://www.epidemicsound.com/pricing/)).
  - **Locução humana:** cachê com cessão de direitos, a orçar com locutores.
  - **Footage dos 14 planos restantes:** orçado depois da prova, a partir do custo real por tomada aprovada.

## 4. Imagens-chave da prova (gerar e aprovar antes de qualquer vídeo)

Ferramenta: Imagen 4 Ultra, 16:9, com a versão 9:16 só para a K-AZ (S06 é ⇕). Escolher uma e congelar: daí em diante,
ela é a referência de todas as tomadas daquele imóvel.

| Chave | Para | Prompt |
|---|---|---|
| K-AZ (16:9 e 9:16) | S06 | `Architectural photograph of a contemporary beachfront second home with white cantilevered volumes, frameless glass, a dark timber pergola over the terrace and an infinity pool facing a calm tropical sea, beige stone deck, low cliffs, amber sunset, house in the upper-left third and open sea and sky on the right, realistic materials, 24mm lens, view from the sea side at pool level, photorealistic, premium architectural photography` |
| K-SA | S02 | `Architectural photograph of a contemporary hillside mountain second home built from two horizontal volumes of stacked light stone and warm timber, floor-to-ceiling frameless glass, a cantilevered stone terrace with a glass balustrade over a misty Atlantic-forest valley in southern Brazil, thin flat roof with a slim eave, golden hour, no sea, 35mm lens, photorealistic` |
| K-HE | S02 | `Character reference sheet of a Brazilian woman in her early forties, shoulder-length wavy brown hair, natural makeup, thin gold ring, light linen clothing; front, three-quarter, profile and full-body views on a neutral light-gray background, soft even studio light, photorealistic, no text` |
| Parceiro | S02 | `Character reference sheet of a Brazilian man in his mid-forties, short gray-flecked beard, light linen shirt; front, three-quarter, profile and full-body views on a neutral light-gray background, soft even studio light, photorealistic, no text` |
| K-OL e K-OL-n | S15 | K-OL: prompt de `DIRECAO-DE-ARTE.md` §3. K-OL-n: o mesmo prompt com `at winter blue hour, a low steel fire bowl glowing in the stone courtyard, warm light in the windows`. Se a geometria mudar, gerar a noite por edição da K-OL aprovada, não por novo texto. |

Negativo comum em todas: `no text, no logos, no signage, no watermark, no brand names, no distorted hands, no extra
fingers, no warped architecture, no CGI look`.

## 5. Tomadas da prova (Veo 3.1)

Parâmetros: `resolution: 1080p`, `durationSeconds: 8`, 24 fps (nativo), `negativePrompt` com o negativo comum de
`DIRECAO-DE-ARTE.md` §0. Usar a imagem-chave como primeiro quadro (imagem → vídeo). Para personagens, usar as folhas
como imagens de referência. Fazer a exploração no Fast e as candidatas finais no Standard.

| Tomada | Entrada | Formato | Prompt de vídeo |
|---|---|---|---|
| **S06 · Azzura** (arquitetura) | primeiro quadro: K-AZ | 16:9 e 9:16 (gerações separadas, cada uma da sua K-AZ) | `Slow cinematic crane-down shot revealing the same beachfront second home, white cantilevered volumes, dark timber pergola and infinity pool facing a calm tropical sea at amber sunset, the camera descends gently toward pool level, the house stays in the upper-left third with open sea and sky on the right, water surface calm with soft reflections, straight architectural lines remain perfectly straight, steady motion, photorealistic, premium architectural film look` |
| **S02 · Satori** (pessoas, versão da prova) | primeiro quadro: K-SA com Helena e o parceiro compostos no terraço; referências: K-HE e folha do parceiro | 16:9 | `Medium shot on the cantilevered stone terrace of the same mountain house at golden hour, Helena and her partner talk and laugh naturally, she turns toward him and touches his arm, candid unposed moment, natural hand movement, misty valley behind them, slow lateral tracking shot from left to right, shallow depth of field, warm natural light, photorealistic` |
| **S15 · Olivar** (detalhe e atmosfera) | primeiro quadro: detalhe gerado a partir da K-OL-n (mesma fogueira e mesmo piso de pedra) | 16:9 | `Close detail at night in the stone courtyard of the same countryside house: two wine glasses held by two hands in cream knitwear sleeves gently touch in a toast near a low steel fire bowl, warm flickering firelight, faces out of frame, the fire soft in the background bokeh, shallow depth of field, very slow push-in, photorealistic` |

## 6. Critérios de aprovação e contingências

Avaliação a 100% em 1080p, por duas pessoas, de 1 a 5 em cada critério. Uma tomada só é aprovada com nota mínima 4 em
todos e nota 5 em fidelidade arquitetônica, nos planos de imóvel, e em ausência de artefatos.

| Critério | Nota 5 = |
|---|---|
| Realismo | indistinguível de fotografia real em tela grande |
| Sofisticação fotográfica | luz, cor e composição de fotografia de arquitetura e lifestyle premium |
| Fidelidade arquitetônica | mesma casa da imagem-chave, sem deriva de volumes, materiais, aberturas ou piscina |
| Continuidade | mesma pessoa, figurino, vegetação, móveis e luz das referências |
| Movimento | contínuo e lento, sem trancos, pulsos ou "flutuação" |
| Expressões humanas (S02) | naturais, sem sorriso publicitário nem olhar vazio |
| Artefatos | nenhuma mão, dedo, rosto, água, vidro ou fogo defeituoso |
| Integração com a interface | espaço livre onde os cartões entram (§0 de `DIRECAO-DE-ARTE.md`) |
| 16:9 e vertical | S06 aprovado nos dois formatos nativos; S02 e S15 com enquadramento vertical possível sem perder o assunto |

**Contingências por tomada:**
- **S06:** se as linhas entortarem no movimento, usar a K-AZ aprovada com movimento de câmera 2,5D (paralaxe) na pós.
  Se a água cintilar, encurtar o trecho ou reduzir o movimento.
- **S02:** se identidade ou mãos falharem depois das candidatas finais, usar footage licenciado de casal ou família em
  terraço de serra, ou filmagem pontual. Isso vale também para o caminho com crianças (§2).
- **S15:** se as mãos falharem, enquadrar as taças com as mãos parcialmente fora do quadro. Se o vidro ou o fogo não
  convencerem, usar detalhe licenciado ou filmagem de mesa.
- **Regra geral:** nenhum plano reprovado entra no filme. Uma reprovação muda só a fonte daquele plano, nunca a
  direção de arte.

## 7. Sem custo × com autorização

**Sem custo** (pode seguir agora):
- este kit, os prompts e a planilha de avaliação;
- a classificação dos testes para o congelamento econômico (`ECONOMIA.md` §12.5);
- a decisão de cadência;
- a revisão da bíblia de personagens, se a Luxtory escolher o caminho só com adultos.

**Com autorização:**
- conta de faturamento e gasto da prova (≈ US$ 146, mais US$ 19 opcionais em 4K);
- clipe licenciado de comparação para o S02;
- aceite comercial dos PRLs e decisão do desconto Luxplus;
- escolha do caminho para as crianças (§2);
- depois da prova: footage dos demais planos, locução, trilha e efeitos.
