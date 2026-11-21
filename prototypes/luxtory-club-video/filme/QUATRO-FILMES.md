# Quatro filmes do Luxtory Club: nomenclatura, storyboard, ritmo e assinatura (v8.3 · checkpoint para aprovação)

> **Direção final de 2026-11-19.** Quatro filmes, cada um em 16:9 e 9:16:
> 1. Luxchange Request;
> 2. Luxchange Direct;
> 3. Luxplus;
> 4. Luxtory Club, o filme completo.
>
> Este documento prevalece sobre a estrutura e as células de copy de `ROTEIRO.md`. Continuam valendo:
> - direção de arte e Second Homes (`DIRECAO-DE-ARTE.md`);
> - fontes e direitos (`PROVA-CINEMATOGRAFICA.md`);
> - pipeline (`prova/montar.mjs`).
>
> Pessoas, Second Homes, datas e valores são ilustrativos. Os oito masters só são gerados depois da aprovação deste
> checkpoint, e nada é publicado antes da validação de direitos, das condições comerciais e da prontidão do produto.

## v9: fundo comum e os quatro filmes (prévias provisórias)

**Decisões:**
- **Fundo das simulações:** a foto original do hero da home (`luxury-property-facade-hero.jpg`), sem o overlay da
  página e sem mudar a página. Fica num plano contínuo do banner à confirmação (`filme/prova/fundo.js`): no 16:9, a
  composição original, aproximando de 1,00 a 1,05; no 9:16, o recorte A, entre três testados, com chaminé e fachada
  acima dos cartões e piscina abaixo. É ambientação do Luxtory Club; os nomes das Second Homes ficam só na interface.
  A fonte tem 1672 × 941 e é a única no repositório: o 9:16 amplia ≈ 2,1×. Uma versão maior entra por
  `out/entrada/HERO-9x16.*`.
- **Som:** só efeitos de operação. `audio.modo: 'efeitos'` dispensa voz e trilha no preflight da exportação final,
  que continua exigindo assets aprovados.
- **Direct (36,4 s) e Luxplus (32,4 s):** banner aprovado, simulação, família e assinatura. O cartão de Créditos mostra
  o saldo uma vez só, sem o número grande que duplicava a legenda. Marina: 39.000 → 27.500 no Direct, saldo inalterado
  no Luxplus. O Luxplus não tem Créditos, taxa nem desconto, e o valor da estadia é ilustrativo.
- **Filme completo (≈ 115 s):**
  1. abertura com a ideia aprovada ("Sua Second Home pode ser o ponto de partida — não o limite.");
  2. Créditos explicados uma vez (painel C04, com as ressalvas da L3);
  3. Request inteira;
  4. Direct e Luxplus só com o que os diferencia (a revisão corta para a confirmação);
  5. síntese das três modalidades;
  6. uma família e uma assinatura.
- **Painel dos Créditos no filme completo:** ele se monta por batidas, e a linha da Membership entra por último. Por
  isso, tem duas leituras: o que o Membro já tem mais o que gera, e depois o saldo único com a condição da Membership.
  O corte espera essa última linha e a ressalva, que pede pelo menos 1 s a cada 3 palavras + 0,5 s. Na primeira QA, o
  corte vinha antes disso: a linha ficava 1,3 s inteira na tela, quando a leitura rápida pede 1,6 s. Só o filme
  completo foi renderizado de novo.

**QA dos oito MP4 (24 fps):**
- **Arquivos:**
  - 0 erro de decodificação, 0 quadro preto e 0 parcial;
  - quadros iguais ao relatório da montagem;
  - assinatura decodificada em #0E4D65, de fonte #0F4E67.
- **Áudio:**
  - só os quatro efeitos (tap −17,5, check −24,4, estado −14,0 e confirmação −14,1 dBFS);
  - sem cliques, com silêncio entre os efeitos;
  - nenhum par de efeitos a menos de 150 ms.
- **Congelamentos acima de 2,5 s:** só nas pausas de leitura (banner de abertura e síntese) e na assinatura. O fundo
  contínuo se move devagar no filme completo, por durar ≈ 100 s.
- **Avisos que continuam:**
  - hero no 9:16 ampliado 2,12×;
  - família no 16:9 ampliada 1,62×, e o quadro azul da família no 9:16 é provisório.

## v8.4: refinamento de direção (prévia técnica provisória)

**Feito no código e na prévia:**
- **Som:** só efeitos de operação. São toque em botão e data, revalidação, depósito confirmado, envio e reserva
  confirmada, com picos medidos de −24 a −14 dBFS. Não há mar, vento, sala, acorde longo nem resolução, e a assinatura
  termina em silêncio. O áudio de efeitos esparsos não é normalizado para −20 LUFS.
- **Prazo:** a solicitação recebida usa o prazo derivado da simulação (48 h) na interface e na EDL.
- **Prévia limpa sem marcas:** etiqueta interna e ressalva saem da imagem e vão para a tarja da cópia de revisão.
- **Cartões:**
  - a solicitação recebida começa compacta e cresce até a revalidação em 480 ms;
  - na confirmação, os dois resultados têm a mesma estrutura e aparecem juntos (par centrado no 16:9, bloco no 9:16);
  - no 16:9, o controle da complementação fica no mesmo eixo do calendário.

**Depende de imagens novas** (prompts em `IMAGENS-MESTRAS.md`):
- fotografia consistente da Azzura e da Satori;
- família em 16:9 sem ampliação de 1,62×;
- família em 9:16 ocupando o quadro inteiro.

A moldura Moroccan Blue segue como placeholder interno e não é master.

**Critério de completude a decidir:** `preflightFinal()` ainda exige voz e trilha. Se a campanha for só com efeitos de
operação, o critério muda nessa decisão. Continuam obrigatórios: assets aprovados, licenças e regras comerciais.

## v8.3: correções obrigatórias antes dos quatro filmes

**Imagem da família: proveniência conferida.** O arquivo usado no encerramento é o enviado pela Luxtory, sem
alteração:
- o sha256 do `.webp` recebido é igual ao da cópia em `out/entrada/`;
- o PNG de trabalho e o `S17b-16x9.png` têm os mesmos pixels da decodificação de referência do WebP (libwebp, sRGB);
- correção na própria v8.3: até a prévia anterior, o PNG vinha da decodificação do ffmpeg. A diferença para a
  referência era de 1,7 nível em média (0–255), até 3 níveis em 81% dos pixels e no máximo 42 em bordas de cor, pela
  reamostragem do croma. Não era edição, mas o arquivo foi refeito pela referência e o anterior ficou guardado
  (`-ffmpeg.png`);
- no quadro do vídeo, a família é a mesma do original: SSIM de 0,87 em escala reduzida, com a diferença vinda da
  aproximação de câmera e da codificação.

A divergência percebida tinha outra origem: os placeholders provisórios da Azzura (foto do site) mostravam uma
segunda família, de outras pessoas, numa piscina, em S06, S07 e S10. A v8.3 usa só recortes sem pessoas dessas fotos.
A única família do filme é a da campanha, no encerramento.

**Formatos da família:**
- **16:9:** recorte da largura inteira do original. Amplia 1,62× (aviso na prévia; a exportação final recusa).
- **9:16:** a imagem inteira, nítida e sem ampliação, emoldurada no Moroccan Blue da assinatura, sem espelhamento nem
  extensão. A versão estendida da v8.2 foi descartada.

As duas são provisórias até as versões editadas no ChatGPT (prompts abaixo). Com elas, a arquitetura fica coerente com
a Azzura e os dois formatos não dependem de ampliação. Cada arquivo entra por nome em `out/entrada/`
(`S17b-16x9.png`, `S17b-9x16.png`), sem mudar código.

**Fotografia por Second Home:**

| Second Home | Momentos | Placeholder atual |
|---|---|---|
| Azzura | escolha da estadia (banner e datas), Créditos necessários (S07, borda infinita), solicitação recebida, confirmação | recortes sem pessoas da foto do litoral |
| Satori | contexto de Helena: complementação, depósito, revisão, envio e espera | quatro recortes diferentes da foto da serra |
| Família (campanha) | encerramento | imagem aprovada |

Duas trocas de imóvel, cada uma quando a história muda de lugar:
1. Azzura → Satori na complementação, quando Helena passa às datas do próprio Direito de Uso. O depósito confirmado
   nomeia o imóvel ("16/05/2027 · Satori Home").
2. Satori → Azzura em "Do outro lado", para quem recebe a solicitação.

Nenhum cartão com o nome "Azzura Home" aparece sobre foto da Satori como identificação do lugar. Na prévia final v8.3,
o cartão de contexto "Azzura Home" do 16:9 ficava sobre a foto da serra durante "Créditos necessários". O plano passou
para a S07 (Azzura). A revisão cita "Azzura Home · 04/06 a 07/06/2027" como destino da solicitação, logo depois de o
depósito nomear a Satori.

**Assinatura em Moroccan Blue (#0F4E67).** O cartão usa a superfície `blue` do Design System, que já existe, sem mudar
o DS global. A regra que permite: "Logo: Warm Sand sobre Blue/Deep" (`docs/specs/design-system.md`).

O manifest da logo associa a Warm Sand ao fundo "night" (Dark Moroccan Blue), o que vale para os fundos de página. O
cartão é uma superfície de componente, coberta pela regra acima.

| Elemento | Contraste sobre #0F4E67 | Mínimo |
|---|---|---|
| Logo Warm Sand (elemento gráfico) | 4,32:1 | 3:1 |
| Tagline Pure White | 9,11:1 | 4,5:1 |

Logo SVG, fade de 900 ms, frase posterior e 6 s não mudam.

**Taxa de intercâmbio.** Passa a ser o rótulo da taxa monetária da Request e do Direct: banner, revisão, narração e
roteiro. O conceito técnico continua Luxchange Fee, com a mesma fórmula, e o Luxplus continua sem taxa (o teste barra
os dois nomes nele). Pendente antes da publicação: revisão comercial e jurídica, porque o nome coincide com a tarifa
de intercâmbio dos cartões.

**Primeiras telas:**
- Banner: "Luxchange Request" / "Solicite noites reservadas por outro Membro." / "Use Créditos e pague a Taxa de
  intercâmbio."
- Azzura: "Esta reserva depende do aceite do Membro que reservou as noites solicitadas."

**Prazo de 48 horas (proposta comercial).** A Request simulada expira de fato em 48 h (`DEMO.requestExpiryHours`), e o
cartão de quem recebe deriva o prazo da própria simulação: (`expiresAt` − `sentAt`). O padrão do 02 continua em
`CANONICAL` (24 h, PD-005); nada muda em canônicos ou Production.

Verificado em teste:

| Verificação | Resultado |
|---|---|
| Expiração | exatamente 48 h depois do envio |
| Aceite | dentro do prazo |
| Garantia | só lotes válidos durante as 48 h; um lote que vence 36 h depois lastreia a de 24 h, mas não a de 48 h (PD-006) |
| Desfechos pré-aceite | recusa, expiração e retirada partem de Pendente, com liberação da Garantia e reversão da taxa |

Ficam para o produto: Requests concorrentes (a revalidação do primeiro aceite já resolve) e notificações (lembrete
antes da expiração). A adoção definitiva depende da aprovação comercial.

**Complementação:**
- Créditos necessários: "Faltam 7.000" em destaque e a nota "Datas elegíveis inteiras do meu Direito de Uso geram
  novos Créditos." (a regra das datas inteiras, uma vez).
- Controle, com a copy da direção, em três frases curtas: "Faltam 7.000 Créditos. Uma data elegível gera 14.000
  Créditos. O excedente permanece disponível."
- Números preservados: 48.000 → +14.000 → 62.000 → 55.000 em Garantia → 7.000 disponíveis.

**Prompts para o ChatGPT (imagem da família).** Enviar o arquivo original e pedir, em conversas separadas:

```text
Edit this exact photo. Keep the four people exactly as they are: same faces, expressions, poses, hair, swimwear,
skin, water and reflections; do not regenerate them. Change only the architecture: remove the olive tree and the
stone wall at the right; continue the white contemporary cantilevered volumes with large frameless glass façades in
their place; add a dark timber pergola over the terrace. Keep the infinity pool, the coastal view and the sunset light
identical. Output as a landscape 3:2 image at the highest resolution available. No text, no logos.
```

```text
Using the edited photo, create a vertical 2:3 version of the same scene: the same four people, exactly as they are and
at the same size relative to the frame width, all fully visible. Extend only the sky above and the pool water below,
continuing the scene naturally. Highest resolution available. No new people, no text, no logos.
```

Conferência antes de aprovar:
- rosto, expressão, pose e roupa dos quatro idênticos ao original, sobrepondo os dois;
- nenhuma mão ou dente alterado;
- arquitetura branca, com vidro e madeira escura;
- no 2:3, céu e água contínuos, sem espelhamento nem emenda visível, e os quatro com o mesmo tamanho em relação à
  largura;
- se algum rosto mudar, a edição é rejeitada, mesmo que pareça fotorrealista.

O 3:2 recortado para 16:9 e o 2:3 recortado para 9:16 ampliam ≈ 1,25×, dentro do limite de 1,35×.

**Som e acabamento (medidos nos arquivos da prévia final):**
- áudio e vídeo com a mesma duração nos dois formatos;
- som de cada lugar: mar na Azzura, vento na Satori;
- sem queda na entrada da família. Duas janelas seguidas do mesmo ambiente zeravam o som no corte; agora formam uma
  janela só;
- o mar sai em 1,8 s sob a assinatura e termina depois de a resolução entrar, sem silêncio digital no meio;
- fade final até o silêncio dentro do filme;
- moldura do 9:16 e fundo da assinatura com o mesmo valor decodificado: o dissolve não mostra emenda;
- nenhuma etiqueta interna sobre a família ou a assinatura: a etiqueta termina de sair 280 ms antes do dissolve da
  família (antes começava a sair junto com ele e aparecia sobre a imagem por ~300 ms);
- cortes entre ambientes diferentes com cruzamento de 300 ms centrado no corte, sem buraco nem clique;
- arquivos publicados de forma atômica: cada execução codifica num `.parcial-<pid>.mp4`, decodifica o arquivo inteiro,
  valida e só então renomeia;
- frase da assinatura com 9,11:1 de contraste.

Sem narração definitiva e sem trilha, a sincronia só pode ser conferida para efeitos e legenda-guia. Por isso a prévia
não é master.

**Ainda provisório:**
- imagens definitivas da Azzura e da Satori;
- versões editadas da família;
- trilha (Pixabay);
- narração da equipe;
- revisão comercial e jurídica de "Taxa de intercâmbio";
- aprovação comercial do prazo de 48 h;
- licenças de cada asset definitivo registradas em `out/entrada/direitos.csv`;
- Direct: o cartão de Créditos repete o saldo (número grande e legenda), a corrigir na passada do Direct.

## v8.2: revisão final da Request e continuidade

O ritmo da v8.1 fica como referência. As mudanças são de comunicação, lógica econômica da demonstração, composição e
encerramento.

**Primeiras telas:**
- **Banner:** "Luxchange Request" / "Solicite ao Membro que reservou as datas desejadas." / "Créditos + Taxa de
  intermediação." É a forma curta: a dependência do aceite vai para a segunda tela.
- **Azzura Home** (contexto): "Litoral · Second Home Luxtory" / "Esta reserva depende do aceite do Membro que reservou as
  noites solicitadas."
- **"Taxa de intercâmbio":** proposta registrada, ainda não aplicada. Até ser validada, os filmes mantêm "Taxa de
  intermediação". Atenção: no Brasil, "taxa de intercâmbio" é também o nome conhecido da tarifa dos cartões de pagamento.

**Depósito mínimo.** Helena deposita só 16/05, o menor depósito que cobre o que falta (14.000):

| Momento | Créditos |
|---|---|
| Saldo inicial | 48.000 |
| Necessários para a Request | 55.000 (faltam 7.000) |
| Depósito de 16/05 | + 14.000 |
| Saldo atualizado | 62.000 |
| Em Garantia no envio | 55.000 (30.000 + 18.000 + 7.000 do lote novo, pelo vencimento: FEFO) |
| Disponível depois do envio | 7.000, para experiências futuras |

A coreografia só leva o controle ao mínimo; o tempo parado até o depósito sai num corte invisível. A narração diz "e
o que sobrar fica para as próximas experiências". Ficam iguais:
- origem dos lotes;
- validade;
- FEFO;
- Garantia no envio;
- antecedência de 14 dias por data;
- datas inteiras.

**Continuidade entre modalidades.** O Direct passa a ser de outro Membro, Marina, de outra família, com carteira própria
e lotes de origem identificável (24.000 de depósito + 15.000 como cedente = 39.000). O Direct consome 11.500 pelo lote
que vence primeiro (39.000 → 27.500). O Luxplus é da mesma família e não toca nos Créditos (27.500 intocados). Nenhum
saldo de Helena aparece no Direct ou no Luxplus.

No filme completo, cada modalidade mostra a carteira de quem a usa: Helena na Request e Marina no Direct e no Luxplus.
Isso conversa com os planos do Direct, que já eram de outra família (três gerações na Olivar).

**Prazo de resposta.** O vídeo continua com 24 horas, o padrão do PD-005, que já diz que o prazo é administrável. O
cartão agora lê o valor do parâmetro da demonstração (`requestExpiryHours`), então mostra sempre o que estiver
configurado. Se a Luxtory aprovar 48 horas, basta mudar esse parâmetro. Impactos a validar antes:
- **Garantia:** só lotes válidos até a expiração podem lastreá-la (PD-006). Com 48 horas, lotes que vencem nesse
  intervalo deixam de servir, e os Créditos do solicitante ficam indisponíveis por mais tempo.
- **Taxa:** paga no envio e revertida na recusa ou expiração. Com 48 horas, o dinheiro fica retido por mais tempo
  antes de uma eventual devolução.
- **Concorrência:** a capacidade não fica bloqueada e várias Requests podem coexistir (PD-005). Uma janela maior
  aumenta a chance de outra operação confirmar antes, e a revalidação do aceite resolve isso. Quem recebe também pode
  usar ou ceder as noites nesse intervalo.
- **Notificações:** lembrete antes da expiração para quem recebe e aviso de expiração para quem solicita.
- **Testes:** `requestExpiresAt` (TECH-044) e os textos derivados mudam juntos com o parâmetro.

Nada disso altera canônicos nem Production: é configuração administrável.

**Cartões.**
- **16:9:**
  - contexto e tarefa na mesma linha de base;
  - colunas um pouco mais largas (contexto 25rem, tarefa 31rem);
  - o calendário de depósito, que ocupa quase a altura toda, continua centralizado.
- **Duplicações removidas:**
  - o cartão de Créditos só entra no envio (antes, o saldo aparecia junto com o depósito confirmado);
  - o cartão de Créditos necessários não repete "Azzura Home" ("04 a 07/06/2027 · 3 noites").
- **9:16:** um cartão principal por momento, com áreas seguras conferidas pelo `check.mjs`.
- **Pendência do Direct:** o cartão de Créditos ainda repete o saldo, em número grande e na legenda. Corrigir quando o
  Direct for produzido.

**Fundo da solicitação recebida.** No lugar do gradiente neutro, entra a arquitetura da Azzura: volumes brancos e vidro,
sem pessoas, recorte da placa litoral provisória. O fundo fica desfocado sob o cartão, como os demais.

**Encerramento com a imagem aprovada da família** (S17b, ≈ 4 s, sem cartão nem etiqueta por cima):
- **16:9:** recorte da largura inteira, com família, pôr do sol e casa, e aproximação lenta de até 6%. A imagem tem
  1254 px, então o 16:9 amplia 1,53×: o `montar.mjs` avisa na prévia e recusa na exportação final.
- **9:16:** a imagem inteira na largura (nítida, sem ampliar), com o céu estendido acima por degradê desfocado e a água
  abaixo por reflexo da própria água. Ninguém é cortado ou distorcido.
- **Transição:** dissolve de 0,5 s da confirmação para a família e de 0,8 s da família para o cartão da assinatura
  oficial, que fica intacto. A logo SVG é Warm Sand sobre o token Dark Moroccan Blue (#003D52) do Design System. O
  `#0F4E67` citado é o Moroccan Blue (`palette.moroccan-blue`); a assinatura segue o token aprovado.

**Continuidade da imagem com a Azzura.** A imagem tem volumes brancos, vidro sem caixilho, borda infinita e pôr do sol
sobre a baía, coerentes com a bíblia. Três elementos não são da Azzura:
- a oliveira, que é o elemento-assinatura da Olivar;
- a parede de pedra, material da Satori;
- a ausência da pérgola de madeira escura.

Para apresentá-la como a Azzura, a correção é uma edição no ChatGPT da própria imagem, preservando a família (prompts
abaixo). Sem a edição, ela funciona como encerramento da campanha, sem nome de imóvel.

```text
Edit this exact photo. Keep the four people exactly as they are: same faces, expressions, poses, hair, swimwear,
water and reflections. Change only the architecture at the right edge: remove the olive tree and the stone wall, and
continue the white cantilevered volume with frameless glass in their place; add a dark timber pergola over the
terrace. Keep the sunset, the bay and the light identical. No text, no logos.
```

```text
Extend this exact photo to a 16:9 landscape frame (and, separately, to a 9:16 portrait frame) without changing anything
that already exists: same family, faces, house, light and water. Add only sky above and water or deck at the edges,
continuing the scene naturally. No new people, no text, no logos.
```

Com as versões editadas em 16:9 e 9:16 na resolução máxima, o 16:9 deixa de ampliar e o 9:16 dispensa a extensão
local.

## 0. v8.1: ritmo cinematográfico e textos essenciais

A v8 ficou lenta (69 s): pausas longas e telas paradas depois de a informação principal ter sido lida. A v8.1 tem
54,4 s no 16:9 e 54,8 s no 9:16, com a assinatura, e mostra duas etapas que faltavam: a seleção das datas depositadas
e a revisão com a Taxa de intercâmbio e o envio.

**Edição.** A interface continua tocando no tempo da sequência, sem aceleração. O ritmo vem de três decisões:
- **cortes em tempo morto:** saída de cartões e processamento do pagamento;
- **entrada na ação:** a complementação começa com o controle já na tela, logo antes do primeiro movimento;
- **pausas curtas:** só quando a informação principal pede leitura.

**Textos que mudaram (cartões da Request):**

| Cartão | v8 | v8.1 |
|---|---|---|
| Revisão | Créditos necessários · Taxa de intercâmbio · Prazo para o aceite 24 horas | Créditos necessários ("Vão para a Garantia no envio") · Taxa de intercâmbio ("Paga no envio, separada dos Créditos; devolvida se não houver aceite") · política · Pagar taxa e enviar |
| Créditos (Garantia) | Saldo disponível · Créditos em Garantia + frase sobre o uso da Garantia | Créditos disponíveis 39.000 · Créditos em Garantia 55.000 |
| Pendente | Pendente · Solicitação enviada · duas frases (prazo, devolução, liberação) | Aguardando resposta · Solicitação enviada · "A reserva depende do aceite e da validação das condições." |
| Solicitação recebida | Visão do membro que recebe a solicitação · Solicitação de troca recebida · duas explicações | Membro que recebe · Solicitação recebida · Azzura Home · 04 a 07/06/2027 · 3 noites do seu Direito de Uso · Créditos a receber 55.000 · Responda em até 24 horas · "Ao aceitar, você cede as noites e recebe os Créditos após a confirmação." |
| Aceite | + validade de 24 meses | Membro que recebe · Solicitação aceita · 55.000 Créditos recebidos |
| Reserva | Visão do membro solicitante · 55.000 Créditos utilizados na confirmação | Membro que solicita · Reserva confirmada · Azzura Home · 04 a 07/06/2027 · 3 noites · 55.000 Créditos utilizados |
| Banner | 3 linhas | "Solicite noites reservadas por outro Membro." · "Créditos + Taxa de intercâmbio · depende do aceite." |

**Prazo e condições, uma vez cada:**
- o prazo de 24 horas aparece só para quem recebe;
- a devolução da taxa sem aceite aparece junto da taxa, na revisão;
- a validade dos Créditos fica no produto.

Aceite e reserva confirmada continuam entrando no mesmo instante: são a mesma operação (REQ-064). No 16:9 ficam lado a
lado; no 9:16, empilhados.

**C04 decidido.** A nota do painel diz "Nas Second Homes compartilhadas, só datas já reservadas podem ser depositadas."
Isso atende à L3 de `b2c.md` e ao BR-151 no contexto de propriedade compartilhada da D-B2C-20, sem estender a regra ao
Owner, e mantém a condição de Membership vigente no painel. É a forma curta da redação sugerida: a nota inteira cabe
no tempo de leitura já aprovado do painel (6,7 s), sem refazer a coreografia do C04. O `check.mjs` não tem mais
exceção.

## 1. Nomenclatura: o que mudou e onde

**Regra.** "Membro" é o termo comercial do filme para quem participa do Luxtory Club: o Titular com Membership vigente
(PD-001). É um rótulo de comunicação, não um papel novo; no domínio e nos documentos jurídicos, os papéis continuam
Owner e Co-Owner, e a Ação continua sendo a participação do Co-Owner (02 §1). A troca de palavras nunca troca a regra:
quem recebe a solicitação é Co-Owner nos dados da demonstração, e as noites cedidas são do Direito de Uso já reservado
(BR-151).

**Classificação das ocorrências auditadas** (protótipo do filme):

| Antes | Depois | Onde estava | Classe |
|---|---|---|---|
| Visão do Titular detentor · Co-Owner | Visão do membro que recebe a solicitação | cartão de solicitação recebida | texto comercial visível |
| Request recebida | Solicitação de troca recebida | idem | texto comercial visível |
| 3 noites da reserva de uso próprio desta Ação | Azzura Home · 04 a 07/06/2027 / 3 noites reservadas do seu Direito de Uso | idem | texto comercial visível |
| Créditos para esta Ação 55.000 | Créditos a receber 55.000 + "Receba esses Créditos se aceitar a solicitação e as condições forem confirmadas." | idem | texto comercial visível |
| Ao aceitar, as noites são cedidas e seguem consumidas do Direito de Uso desta Ação. | Ao aceitar, você cede essas noites e recebe Créditos Luxchange. | idem | texto comercial visível |
| Visão do Titular detentor · Co-Owner / Request aceita / Créditos para esta Ação, válidos por 24 meses | Visão do membro que recebeu a solicitação / Solicitação aceita / 55.000 Créditos recebidos / Válidos por 24 meses a partir da originação. | cartão de aceite | texto comercial visível |
| Visão de quem solicitou / período · horários / Créditos consumidos da Garantia, no momento do aceite | Visão do membro solicitante / Azzura Home / 04 a 07/06/2027 · 3 noites / 55.000 Créditos utilizados na confirmação. | cartão de reserva confirmada | texto comercial visível |
| Seu saldo, do lote que vence primeiro / Garantia pelos lotes que vencem primeiro (lista de lotes) | Saldo disponível 39.000 · Créditos em Garantia 55.000 + "Se a solicitação for aceita e validada, os Créditos em Garantia são utilizados para confirmar a reserva." | cartão de Créditos da Request | texto comercial visível |
| Request enviada / O Titular tem até 24 horas… / As noites não ficam bloqueadas… | Solicitação enviada / A reserva só se confirma com o aceite e a revalidação. / Quem recebe tem até 24 horas para responder. Sem aceite, a Taxa de intercâmbio é devolvida e a Garantia é liberada. | cartão pendente | texto comercial visível |
| Revisar Request / Reservados no envio; consumidos só com o aceite | Revisar solicitação / Garantia constituída no envio; utilizados só com o aceite | revisão | texto comercial visível |
| Membership dos dois Titulares / Request dentro do prazo | Membership vigente dos dois Membros / Solicitação dentro do prazo | revalidação | texto comercial visível |
| Noites de outro Titular · A reserva depende do aceite dele | Noites reservadas por outro Membro · A reserva depende do aceite | rota da Request | texto comercial visível |
| sem aceite de outro Titular · Créditos consumidos · do lote que vence primeiro | sem aceite de outro Membro · Créditos utilizados · Utilizados só na confirmação. | cartões do Direct | texto comercial visível |
| …com outro Titular… / …enquanto o Titular decide. / Do outro lado, o Titular aceita. / …aceite de outro Titular. | …com outro Membro… / Seus Créditos ficam em Garantia e a Taxa de intercâmbio é paga no envio. / Do outro lado, quem recebe a solicitação decide se aceita. / …aceite de outro Membro. | `ROTEIRO.md` §4 | narração |
| "No Co-Owner, só data já reservada é cedida." | "Nas Second Homes compartilhadas, só datas já reservadas podem ser depositadas." (v8.1, decidido) | nota do painel C04 | jurídico e canônico (L3 de `b2c.md`) |
| `role: 'co_owner'`, `holding`, lotes, `holdCreditsFefo`, comentários técnicos | sem mudança | `data.js`, `rules.js`, comentários | identificador de código ou regra de negócio |

**C04.** Decidido na v8.1 (§0).

**Fora do filme.** Se "Membro" passar a ser usado no site, entra antes no registro de decisões de `b2c.md`. Este
checkpoint não altera a comunicação pública nem os canônicos.

## 2. Storyboard dos quatro filmes

Os tempos são estimativas a partir das faixas do §3, com a interface tocada em tempo real e pausas de leitura. A
duração final sai da medição da prévia aprovada, sem acelerar interface.

### Filme 1 · Luxchange Request (≈ 54 s, medidos na prévia v8.1)

| # | Etapa | Plano | Tela | 16:9 |
|---|---|---|---|---|
| 1 | Banner | S06 Azzura, grua | Luxchange Request + 2 linhas | 4,25 s |
| 2 | Second Home e datas | S06 (continua) | contexto + calendário: toques em 04 e 07/06, 3 noites | 5,9 s |
| 3 | Créditos necessários × saldo | S05 Helena na Satori | 55.000 necessários × 48.000 disponíveis, faltam 7.000; Complementar saldo | 5,25 s |
| 4 | Complementação | S04 Helena com o celular | controle no mínimo (14.000, uma data) e mais duas datas do Direito de Uso (46.000); Depositar | 7,0 s |
| 5 | Depósito confirmado | S03 luz no interior | 46.000 novos Créditos, saldo 94.000 | 3,25 s |
| 6 | Revisão e envio | S03 (continua) | Créditos, Taxa de intercâmbio, política; Pagar taxa e enviar; processamento breve | 5,0 s |
| 7 | Solicitação enviada | S07 borda infinita | Aguardando resposta · 55.000 em Garantia · 39.000 disponíveis | 3,5 s |
| 8 | Solicitação recebida | S09 sem rosto | 55.000 Créditos a receber · Responda em até 24 horas · Aceitar ou Recusar | 4,1 s |
| 9 | Aceite e revalidação | S09 (continua) | Aceitar · quatro verificações | 2,4 s |
| 10 | Confirmações (mesma operação) | S10 chegada à Azzura | Solicitação aceita · 55.000 Créditos recebidos; Reserva confirmada · 3 noites · 55.000 Créditos utilizados | 4,25 s |
| 11 | Experiência | S17a gesto humano, dissolve | — | 3,5 s |
| 12 | Assinatura | dissolve para o cartão | logo oficial + frase | 6 s |

O 9:16 tem 54,8 s: a complementação vertical (um cartão por vez) começa um pouco antes, com o controle em 9,5 s.

**O que o espectador entende na complementação:**
- datas elegíveis do Direito de Uso originam Créditos;
- o depósito é uma operação própria, confirmada antes da revisão;
- o saldo sobe para 94.000, e os 55.000 da Request saem dele;
- o restante fica para outras experiências (narração).

A data nunca paga a reserva diretamente.

### Filme 2 · Luxchange Direct (≈ 34 s no ritmo da v8.1)

| # | Etapa | Plano | Tela | Tempo |
|---|---|---|---|---|
| 1 | Banner | S11 Olivar, pátio | Luxchange Direct + 3 linhas | 5 s |
| 2 | Datas disponíveis no Club | S11 (continua) | contexto + calendário; rota "sem aceite de outro Membro" | 8 s |
| 3 | Créditos necessários e saldo suficiente | S12 mesa sob a oliveira | saldo cobre; Continuar com meu saldo | 7,5 s |
| 4 | Revisão e Taxa de intercâmbio | S12 (continua) | Créditos utilizados na confirmação, taxa, política | 7 s |
| 5 | Pagamento e validações | S12 (continua) | pagamento aprovado; verificações | 3 s |
| 6 | Confirmação sem aceite de outro Membro | S13 três gerações | Reserva confirmada; saldo 39.000 → 27.500 | 6,5 s |
| 7 | Experiência | S13 (continua) | — | 5 s |
| 8 | Assinatura | dissolve | logo oficial + frase | 6 s |

O consumo continua pelo lote que vence primeiro (FEFO, PD-008), só nas regras; a tela diz "Utilizados só na
confirmação".

### Filme 3 · Luxplus (≈ 30 s no ritmo da v8.1)

| # | Etapa | Plano | Tela | Tempo |
|---|---|---|---|---|
| 1 | Banner | S14 Olivar à noite, fogo | Luxplus + 2 linhas | 4,5 s |
| 2 | Noites adicionais disponíveis no Club | S14 (continua) | contexto + calendário | 8 s |
| 3 | Valor da estadia em dinheiro, sem Créditos | S15 taças e fogo (real) | valor ilustrativo; Créditos não utilizados | 7 s |
| 4 | Política, pagamento e revalidação | S15 (continua) | política; Pagar e confirmar; verificações | 5 s |
| 5 | Confirmação | S16 manhã fria | Reserva confirmada; Créditos inalterados | 6,5 s |
| 6 | Experiência | S16 (continua) | — | 5 s |
| 7 | Assinatura | dissolve | logo oficial + frase | 6 s |

Sem Taxa de intercâmbio e sem desconto de Membership (BR-244, não publicado).

### Filme 4 · Luxtory Club, filme completo (≈ 115–130 s no ritmo da v8.1)

| # | Bloco | Conteúdo | Tempo |
|---|---|---|---|
| 1 | Abertura | S01 vale ao amanhecer; S02 gesto real da família no terraço; "Tudo começa na sua Second Home." | 10 s |
| 2 | Luxtory Club | S04 + painel C04 (Créditos que você já tem + depósito = um só saldo, com Membership vigente) | 13 s |
| 3 | Request | banner + datas + decisão de Créditos + depósito + Garantia + solicitação recebida + aceite + confirmação (o filme 1 sem revisão detalhada) | 60 s |
| 4 | Direct | banner + datas + saldo suficiente + confirmação sem aceite | 30 s |
| 5 | Luxplus | banner + noites adicionais + valor em dinheiro + confirmação | 26 s |
| 6 | Síntese | três colunas: Request (noites de outro Membro · Créditos + taxa · depende do aceite); Direct (noites disponíveis no Club · Créditos + taxa · sem aceite de outro Membro); Luxplus (noites adicionais · em dinheiro, sem Créditos) | 8 s |
| 7 | Montagem emocional | S17: mar, serra, campo, risos, no tempo da trilha | 11 s |
| 8 | Assinatura | dissolve para o cartão | 6 s |

**Sem repetição.** Os Créditos são explicados uma vez (bloco 2 e decisão da Request). Direct e Luxplus mostram só o que
os diferencia. Os tempos das tabelas de Direct, Luxplus e filme completo acima foram estimados na v8. No ritmo da v8.1,
cada etapa encolhe na mesma proporção da Request, sem copiar tempos.

Banners de cada modalidade (diferença em duas linhas):
- **Request:** "Solicite noites reservadas por outro Membro." · "Créditos + Taxa de intercâmbio · depende do aceite."
- **Direct:** "Reserve noites do Inventário Luxtory." · "Créditos + Taxa de intercâmbio · sem aceite de outro Membro."
- **Luxplus:** "Reserve noites adicionais no Luxtory Club." · "Pagamento em dinheiro, sem utilizar Créditos."

A confirmação continua sujeita às validações e ao pagamento, e nenhum banner promete disponibilidade.

### Vertical (9:16)

- **Ritmo próprio:** as mesmas etapas, com um cartão por vez e tempos da sequência vertical (`times('9x16')`). Não é
  acelerada para casar com o 16:9.
- **Banners:** no terço superior.
- **Assinatura:** a mesma.

## 3. Critérios de legibilidade aplicados (v8.1)

**A leitura começa quando a animação de entrada termina** (480 ms, `duration.slow`) e vai até a troca seguinte. Cada
tela tem um tipo e uma faixa editorial, que protege contra excesso e contra insuficiência. O texto essencial só exige
uma leitura rápida (5 palavras por segundo) dentro da faixa. Texto secundário não precisa ser lido inteiro e não
alonga a tela.

| Tipo | Faixa | Uso na prévia |
|---|---|---|
| banner | 2,5–3,5 s, desde a primeira linha | Luxchange Request (3,05 s) |
| ação | 0,7–1,5 s | datas escolhidas antes do depósito; aceite e revalidação |
| mensagem | 2,5–4 s | 3 noites; depósito confirmado; revisão; solicitação enviada |
| decisão com números | 3,5–5,5 s | Créditos necessários × saldo; solicitação recebida |
| etapa complexa | 5–7 s, só se indispensável | não usada |
| confirmação | 3–4,5 s | Créditos recebidos e reserva confirmada (3,3 s) |
| assinatura | 6 s | logo oficial + frase |

Transições de 300–600 ms: entrada e saída do Core, dissolve de 500 ms para o plano humano e de 700 ms para a
assinatura.

**Implementação** (`prova/blocos.js`):
- `READING` e `legibility(edl)` medem a janela real de cada tela;
- o teste exige todas dentro da faixa, nos dois formatos, a duração total entre 46 e 56 s, a ordem dos fatos incluindo
  complementação e envio, e a narração sem sobreposição.

A fórmula não substitui a revisão: a aprovação final é a reprodução contínua em velocidade normal, no computador e no
celular, com e sem som.

## 4. Saldo, Garantia e solicitação recebida

Antes, o cartão de Créditos da Request listava lotes: "Créditos anteriores 30.000 / 18.000 / Novo depósito 7.000 de
46.000". Agora traz dois indicadores e uma frase:

- **Saldo disponível:** 39.000;
- **Créditos em Garantia:** 55.000;
- "Se a solicitação for aceita e validada, os Créditos em Garantia são utilizados para confirmar a reserva."

**O que continua igual nas regras:** FEFO, origem dos lotes, quantidades, validade, Garantia, consumo e saldos (`rules.js`, `data.js`). O teste
"filme: saldo e Garantia sem lotes na tela" confere as duas coisas. Recusa ou expiração seguem liberando a Garantia e devolvendo a
Taxa de intercâmbio, o que o cartão pendente diz.

A solicitação recebida usa a copy aprovada, e a originação dos Créditos de quem cede só acontece com o aceite válido, a
revalidação e a confirmação, na mesma operação (REQ-064).

## 5. Prévia da Request (v8.1)

`prova/edl-request-curta.js` reúne:
- o banner;
- as datas;
- uma decisão de Créditos (complementar) e o depósito confirmado;
- a solicitação enviada, com saldo e Garantia;
- a solicitação recebida;
- o aceite e a revalidação;
- os Créditos recebidos e a reserva confirmada;
- o plano humano;
- a assinatura oficial.

Tem 54,4 s no 16:9 e 54,8 s no 9:16, com todas as telas dentro das faixas do §3 (a v8 tinha 69 s). Para inspeção
rápida de ritmo e composição, `--rascunho` renderiza sem superamostragem e com codificação rápida, numa pasta
própria.

**Comandos:**

```bash
node prototypes/luxtory-club-video/filme/prova/montar.mjs --edl=request-curta --fmt=16x9
```

```bash
node prototypes/luxtory-club-video/filme/prova/montar.mjs --edl=request-curta --fmt=9x16
```

Saída em `out/request-curta/`: cópia limpa, cópia de revisão com tarja e legenda-guia.

**Banners.** Título e linhas com o fade-up curto do Core, uma linha por vez, sobre a sombra de canto do Design System:
no 16:9, no terço inferior esquerdo; no 9:16, no terço superior.

**Assinatura.** `sequence-assinatura.js` e o arquivo da logo oficial não mudam:
- o cartão Dark Moroccan Blue entra por dissolve de 700 ms sobre a última imagem (aprovada e intacta na v8.1);
- a logo Warm Sand entra em fade puro de 900 ms, sem deslocamento, escala ou efeito;
- a frase vem depois, em 6 s no total;
- na resolução sonora entra um acorde grave e aberto sob a frase, e o som silencia nos últimos 200 ms;
- a etiqueta interna sai antes da assinatura.

## 6. Assets

| Asset | Estado |
|---|---|
| Interfaces Request, Direct e Luxplus com a copy nova; painel C04; assinatura com a logo oficial | **disponíveis** (renderizadas a 24 fps do palco) |
| Footage humano S17a (Mixkit 44490 em 16:9, 1224 em 9:16; licença conferida na página do item) | disponível para prévia; o 16:9 tem casal distante e precisa de substituto para o master |
| Imagens exclusivas da Azzura, Satori e Olivar (K-AZ, K-SA, K-OL e derivadas) | **provisórias:** placeholders (fotos do site e gradientes) até o lote do ChatGPT |
| Footage de S02, S13, S15, S16 e S09 | a escolher (lista em `PROVA-CINEMATOGRAFICA.md` §6); Pexels e Pixabay só por download no navegador |
| Trilha (Pixabay) | a baixar no navegador, com certificado |
| Narração | a gravar (voz da equipe); hoje só legenda-guia |

**Status de master publicável: bloqueado.** Enquanto houver placeholder, voz ou trilha ausentes, `montar.mjs --final`
recusa a exportação.

## 7. Testes e bloqueios

- **Testes:**
  - `prototype.test.mjs`: copy nova, Garantia sem lotes com FEFO preservado, ordem dos fatos, prévia curta (legibilidade,
    grade, assinatura, vocabulário, narração aprovada);
  - `check.mjs --fps=24`: textos esperados, sobreposição, área segura, axe e vocabulário do filme por quadro;
  - DS, lint e typecheck.
- **Correção do áudio.** Em todas as provas até a v7.1, o áudio era mais curto que o vídeo (19,6 s em 24 s) e os efeitos
  saíam fora do instante. A causa era o `adelay` deslocar os carimbos de tempo. Agora `asetpts` renumera as amostras e
  a validação recusa áudio mais curto que o vídeo.
- **Bloqueios reais:**
  - imagens exclusivas, footage definitivo, trilha e voz;
  - decisão sobre a nota do C04 (§1);
  - o projeto `db` do Vitest não sobe neste contêiner (PostgreSQL embutido sem acesso ao diretório temporário), sem
    relação com o protótipo.
