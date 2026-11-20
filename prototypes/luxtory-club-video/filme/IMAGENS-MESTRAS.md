# Imagens mestras da Request (v8.4): inventário e prompts para o ChatGPT

Os fundos atuais são placeholders: recortes de duas fotos do site. Nenhum deles é a Azzura Home nem a Satori Home.
Este arquivo lista as imagens que faltam e os prompts para gerá-las no ChatGPT, já contratado, sem API paga.

## Como entregar

- Cada arquivo vai para `prototypes/luxtory-club-video/out/entrada/` com o nome `<plano>-16x9.png` ou
  `<plano>-9x16.png`. A montagem usa o arquivo automaticamente e o relatório mostra "entrada" no lugar de "placeholder".
- Resolução: pedir a maior disponível, 1536 × 1024 na horizontal e 1024 × 1536 na vertical. O recorte para 16:9 ou
  9:16 amplia 1,25×, abaixo do limite de 1,35× da montagem; abaixo disso, a exportação final recusa o arquivo.
- Registrar cada imagem aprovada em `out/entrada/direitos.csv`, com a ferramenta, a data e os termos de uso.

## Ordem

0. **K-AZ, a mestra da Azzura.** É só referência e não entra no filme. Vem primeiro porque a família também acontece
   na Azzura: a edição da família usa a K-AZ como referência de arquitetura.
1. Família em 16:9 (`S17b-16x9.png`).
2. Família em 9:16 (`S17b-9x16.png`).
3. Azzura: S06, S07, S09 e S10, nos dois formatos.
4. K-SA, a mestra da Satori, seguida de S04, S03 e S05b, nos dois formatos.

| Arquivo | Tela no filme | Second Home | Área calma para os cartões (16:9 · 9:16) |
|---|---|---|---|
| `S17b-16x9.png` · `S17b-9x16.png` | família, antes da assinatura | Azzura | sem cartões; os quatro inteiros e grandes no quadro |
| `S06-*` | banner e escolha das datas | Azzura | metade direita e terço inferior esquerdo · terço superior e centro |
| `S07-*` | Créditos necessários | Azzura | metade direita e terço inferior esquerdo · centro e metade inferior |
| `S09-*` | solicitação recebida | Azzura | metade direita · metade inferior |
| `S10-*` | confirmação | Azzura | faixa inferior central · metade inferior |
| `S04-*` | complementação (controle e calendário) | Satori | quase todo o quadro: imagem calma, horizonte baixo · metade superior |
| `S03-*` | depósito confirmado e revisão | Satori | metade direita · metade inferior |
| `S05b-*` | solicitação enviada e espera | Satori | faixa inferior · alto e baixo |

## Regras de continuidade

- Gere a mestra primeiro. Para cada derivada, anexe a mestra na mesma conversa e peça a mesma casa.
- A Azzura tem sempre os mesmos elementos: volumes brancos em balanço, vidro sem caixilho, pérgola de madeira escura,
  piscina de borda infinita, deque de pedra bege, mar calmo e pôr do sol âmbar.
- A Satori tem sempre os mesmos elementos: pedra clara empilhada, madeira quente, vidro sem caixilho, terraço de pedra
  em balanço, vale com névoa e luz dourada.
- Fundos de interface sem pessoas, sem texto, sem logos e sem marcas.
- A área dos cartões (tabela acima) deve ser calma: céu, água, parede lisa ou vale, sem detalhe forte.
- Linhas da arquitetura retas, sem deformação de grande-angular.

## Prompts

**K-AZ (mestra da Azzura, referência).**

```text
Architectural photograph of a contemporary beachfront second home on the Brazilian coast: white cantilevered volumes,
floor-to-ceiling frameless glass, a dark timber pergola over the terrace, an infinity pool with a beige stone deck
facing a calm tropical sea, low cliffs, amber sunset. Realistic materials, straight architectural lines, 24mm lens,
view from the pool level. No people, no text, no logos. Landscape 3:2, highest resolution available.
```

**Família 16:9.** Anexe o original (`familia-piscina-original.webp`) e a K-AZ.

```text
Edit the first attached photo. Keep the four people exactly as they are: same faces, expressions, poses, hair,
swimwear, skin, water around them and reflections. Do not regenerate or move them. Change only the architecture so it
matches the house in the second attached image: white cantilevered volumes, frameless glass, a dark timber pergola,
the infinity pool edge and the calm sea at amber sunset; remove the olive tree and the stone wall. Extend the scene to
the left and right so the four people sit in the central part of a landscape 3:2 frame with natural headroom. No text,
no logos. Highest resolution available.
```

**Família 9:16.** Na mesma conversa, a partir do resultado aprovado em 16:9.

```text
Using the approved edited photo, create a vertical 2:3 version of the same scene. Keep the four people exactly as they
are, all fully visible and at the same size relative to the frame width. Extend only the sky and architecture above
and the pool water below, continuing the scene naturally: no mirrored water, no visible seams, no new people, no text.
Highest resolution available.
```

**Azzura, planos derivados.** Anexe a K-AZ em cada pedido e comece por: `Same house as the attached reference,
same materials and the same amber sunset light. No people, no text, no logos.` Depois acrescente o pedido do plano.

| Plano | Horizontal (3:2) | Vertical (2:3) |
|---|---|---|
| S06 | `Wide view with the house in the left third and open sea and sky filling the right two thirds; calm lower left area.` | `The white cantilevered volume in the lower half seen from the pool deck; wide calm sky in the upper half.` |
| S07 | `Low-angle detail along the infinity pool edge and beige stone deck, sea horizon, warm reflections; calm water across the right half.` | `The infinity pool edge leading to the sea horizon; calm water filling the lower half.` |
| S09 | `Corner of the white volume with frameless glass and the dark timber pergola, the sea glimpsed at the left edge; the right half is calm white wall and sky.` | `White façade and glass in the upper half; calm pool deck and water in the lower half.` |
| S10 | `Terrace under the dark timber pergola with white linen loungers facing the sea at dusk, warm interior light through the glass; calm lower third.` | `The same terrace and pergola in the upper half; calm deck and pool in the lower half.` |

**K-SA (mestra da Satori, referência).**

```text
Architectural photograph of a contemporary hillside mountain second home in southern Brazil: two horizontal volumes
of stacked light stone and warm timber, floor-to-ceiling frameless glass, a cantilevered stone terrace with a glass
balustrade over a misty Atlantic-forest valley, thin flat roof, golden hour, no sea. Realistic materials, straight
lines, 35mm lens. No people, no text, no logos. Landscape 3:2, highest resolution available.
```

**Satori, planos derivados.** Anexe a K-SA em cada pedido e comece por: `Same house as the attached reference, same
materials and the same golden light. No people, no text, no logos.` Depois acrescente o pedido do plano.

| Plano | Horizontal (3:2) | Vertical (2:3) |
|---|---|---|
| S04 | `The cantilevered stone terrace overlooking the misty valley, low horizon, calm sky and valley across most of the frame.` | `The terrace edge in the lower third; misty valley and calm sky in the upper two thirds.` |
| S03 | `Double-height living room with the stacked stone fireplace wall, oak floor and linen sofas, soft morning light; the right half is calm glass with the valley beyond.` | `The stone wall and glass in the upper half; calm floor and soft light in the lower half.` |
| S05b | `The terrace with a small infinity pool at dusk, warm lights inside the house; calm water and deck in the lower third.` | `The house lights in the middle; calm sky above and calm pool below.` |

## Conferência antes de aprovar

- Coloque todas as imagens de cada Second Home lado a lado: tem de ser a mesma arquitetura em todos os planos.
- Na família, sobreponha o resultado ao original. Rostos, expressões, mãos, cabelos e trajes devem ser idênticos.
  Se algum rosto mudar, a imagem é rejeitada, mesmo que pareça fotorrealista.
- Confira se a área dos cartões está calma, se não há pessoas, texto ou logos e se a resolução tem pelo menos
  1536 px no lado maior.
- Depois de copiar para `out/entrada/`, rode a montagem e confira o relatório: cada plano deve aparecer como "entrada"
  e com ampliação de até 1,35×.
