# Quatro filmes do Luxtory Club: nomenclatura, storyboard, ritmo e assinatura (v8.1 · checkpoint para aprovação)

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

## 0. v8.1: ritmo cinematográfico e textos essenciais

A v8 ficou lenta (69 s): pausas longas e telas paradas depois de a informação principal ter sido lida. A v8.1 tem
54,4 s no 16:9 e 54,8 s no 9:16, com a assinatura, e mostra duas etapas que faltavam: a seleção das datas depositadas
e a revisão com a Taxa de intermediação e o envio.

**Edição.** A interface continua tocando no tempo da sequência, sem aceleração. O ritmo vem de três decisões:
- **cortes em tempo morto:** saída de cartões e processamento do pagamento;
- **entrada na ação:** a complementação começa com o controle já na tela, logo antes do primeiro movimento;
- **pausas curtas:** só quando a informação principal pede leitura.

**Textos que mudaram (cartões da Request):**

| Cartão | v8 | v8.1 |
|---|---|---|
| Revisão | Créditos necessários · Taxa de intermediação · Prazo para o aceite 24 horas | Créditos necessários ("Vão para a Garantia no envio") · Taxa de intermediação ("Paga no envio, separada dos Créditos; devolvida se não houver aceite") · política · Pagar taxa e enviar |
| Créditos (Garantia) | Saldo disponível · Créditos em Garantia + frase sobre o uso da Garantia | Créditos disponíveis 39.000 · Créditos em Garantia 55.000 |
| Pendente | Pendente · Solicitação enviada · duas frases (prazo, devolução, liberação) | Aguardando resposta · Solicitação enviada · "A reserva depende do aceite e da validação das condições." |
| Solicitação recebida | Visão do membro que recebe a solicitação · Solicitação de troca recebida · duas explicações | Membro que recebe · Solicitação recebida · Azzura Home · 04 a 07/06/2027 · 3 noites do seu Direito de Uso · Créditos a receber 55.000 · Responda em até 24 horas · "Ao aceitar, você cede as noites e recebe os Créditos após a confirmação." |
| Aceite | + validade de 24 meses | Membro que recebe · Solicitação aceita · 55.000 Créditos recebidos |
| Reserva | Visão do membro solicitante · 55.000 Créditos utilizados na confirmação | Membro que solicita · Reserva confirmada · Azzura Home · 04 a 07/06/2027 · 3 noites · 55.000 Créditos utilizados |
| Banner | 3 linhas | "Solicite noites reservadas por outro Membro." · "Créditos + Taxa de intermediação · depende do aceite." |

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
| Request enviada / O Titular tem até 24 horas… / As noites não ficam bloqueadas… | Solicitação enviada / A reserva só se confirma com o aceite e a revalidação. / Quem recebe tem até 24 horas para responder. Sem aceite, a Taxa de intermediação é devolvida e a Garantia é liberada. | cartão pendente | texto comercial visível |
| Revisar Request / Reservados no envio; consumidos só com o aceite | Revisar solicitação / Garantia constituída no envio; utilizados só com o aceite | revisão | texto comercial visível |
| Membership dos dois Titulares / Request dentro do prazo | Membership vigente dos dois Membros / Solicitação dentro do prazo | revalidação | texto comercial visível |
| Noites de outro Titular · A reserva depende do aceite dele | Noites reservadas por outro Membro · A reserva depende do aceite | rota da Request | texto comercial visível |
| sem aceite de outro Titular · Créditos consumidos · do lote que vence primeiro | sem aceite de outro Membro · Créditos utilizados · Utilizados só na confirmação. | cartões do Direct | texto comercial visível |
| …com outro Titular… / …enquanto o Titular decide. / Do outro lado, o Titular aceita. / …aceite de outro Titular. | …com outro Membro… / Seus Créditos ficam em Garantia e a Taxa de intermediação é paga no envio. / Do outro lado, quem recebe a solicitação decide se aceita. / …aceite de outro Membro. | `ROTEIRO.md` §4 | narração |
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
| 6 | Revisão e envio | S03 (continua) | Créditos, Taxa de intermediação, política; Pagar taxa e enviar; processamento breve | 5,0 s |
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
| 4 | Revisão e Taxa de intermediação | S12 (continua) | Créditos utilizados na confirmação, taxa, política | 7 s |
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

Sem Taxa de intermediação e sem desconto de Membership (BR-244, não publicado).

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
- **Request:** "Solicite noites reservadas por outro Membro." · "Créditos + Taxa de intermediação · depende do aceite."
- **Direct:** "Reserve noites do Inventário Luxtory." · "Créditos + Taxa de intermediação · sem aceite de outro Membro."
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
Taxa de intermediação, o que o cartão pendente diz.

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
