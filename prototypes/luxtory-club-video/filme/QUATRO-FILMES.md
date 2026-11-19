# Quatro filmes do Luxtory Club: nomenclatura, storyboard, ritmo e assinatura (v8 · checkpoint para aprovação)

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
| "No Co-Owner, só data já reservada é cedida." | **pendente:** "Na Second Home compartilhada, só data já reservada é cedida." | nota do painel C04 | jurídico e canônico (L3 de `b2c.md`) |
| `role: 'co_owner'`, `holding`, lotes, `holdCreditsFefo`, comentários técnicos | sem mudança | `data.js`, `rules.js`, comentários | identificador de código ou regra de negócio |

**Decisão pendente (C04).** A L3 de `b2c.md` exige a regra do Co-Owner sempre que se fala em ceder ou monetizar datas.
Tirar só o rótulo ("só data já reservada é cedida") estenderia a regra ao Owner, que deposita capacidade própria. A
proposta usa a expressão já aprovada na D-B2C-20, "Second Home compartilhada". Enquanto não houver aprovação, o painel
C04 mantém a frase atual, como exceção registrada no `check.mjs` (`allowTerms`).

**Fora do filme.** Se "Membro" passar a ser usado no site, entra antes no registro de decisões de `b2c.md`. Este
checkpoint não altera a comunicação pública nem os canônicos.

## 2. Storyboard dos quatro filmes

Os tempos são estimativas a partir das faixas do §3, com a interface tocada em tempo real e pausas de leitura. A
duração final sai da medição da prévia aprovada, sem acelerar interface.

### Filme 1 · Luxchange Request (≈ 85–90 s)

| # | Etapa | Plano | Tela | Tempo |
|---|---|---|---|---|
| 1 | Banner | S06 Azzura, grua | Luxchange Request + 3 linhas | 5 s |
| 2 | Second Home e datas | S06 (continua) | contexto + calendário, 3 noites, rota | 9,5 s |
| 3 | Créditos necessários × saldo | S05 Helena na Satori | 55.000 × 48.000, faltam 7.000; Complementar saldo | 9,5 s |
| 4 | Complementação | S03 luz no interior | controle no mínimo (14.000) e duas datas no calendário (46.000) | 10 s |
| 5 | Depósito confirmado | S03 (continua) | 46.000 novos Créditos, saldo 94.000 | 5,5 s |
| 6 | Revisão, Taxa de intermediação e política | S04 Helena com o celular | Créditos necessários, taxa, prazo, aceite da política | 7,5 s |
| 7 | Pagamento e envio | S04 (continua) | Processando pagamento | 2 s |
| 8 | Garantia e solicitação pendente | S07 borda infinita | Saldo disponível 39.000 · Créditos em Garantia 55.000; Solicitação enviada | 8,5 s |
| 9 | Quem recebe a solicitação | S09 sem rosto | Solicitação de troca recebida · 55.000 Créditos a receber · 24 horas | 9 s |
| 10 | Aceite e revalidação | S09 (continua) | Aceitar · quatro verificações | 3 s |
| 11 | Créditos recebidos e reserva confirmada | S10 chegada à Azzura | Solicitação aceita · 55.000 Créditos recebidos; Reserva confirmada | 7 s |
| 12 | Experiência | S17a gesto humano, dissolve | — | 6,5 s |
| 13 | Assinatura | dissolve para o cartão | logo oficial + frase | 6 s |

### Filme 2 · Luxchange Direct (≈ 50 s)

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

### Filme 3 · Luxplus (≈ 45 s)

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

### Filme 4 · Luxtory Club, filme completo (≈ 165–175 s)

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
os diferencia.

### Vertical (9:16)

- **Ritmo próprio:** as mesmas etapas, com um cartão por vez e tempos da sequência vertical (`times('9x16')`). Não é
  acelerada para casar com o 16:9.
- **Banners:** no terço superior.
- **Assinatura:** a mesma.

## 3. Critérios de legibilidade aplicados

**A leitura começa quando a animação de entrada termina** (480 ms, `duration.slow`) e vai até a troca seguinte. Cada
tela tem um tipo, com faixa de tempo, e um texto essencial; a pausa garante 1 s de orientação mais 2,5 palavras por
segundo desse texto:

| Tipo | Faixa | Uso |
|---|---|---|
| banner | 2,5–4 s, contados desde a primeira linha (as linhas entram uma a uma) | título da modalidade + até 3 linhas |
| clique | 1–2 s | aceite, revalidação, botão |
| mensagem | 4,5–6 s | datas, depósito confirmado |
| multi | 7–10 s | Créditos necessários × saldo, Garantia, solicitação recebida |
| confirmação | 5–7 s | Créditos recebidos e reserva confirmada |
| assinatura | 6 s | logo oficial + frase |

**Implementação** (`prova/blocos.js`):
- a pausa (`hold`) congela o quadro da interface depois da entrada, enquanto a imagem continua em movimento por baixo;
- `legibility(edl)` mede a janela real de cada tela;
- o teste exige todas dentro da faixa, nos dois formatos;
- textos longos primeiro foram simplificados: o cartão pendente perdeu uma frase e o cartão de Créditos perdeu a lista
  de lotes.

**Validação visual a fazer na prévia, sem pausar:**
- computador e celular;
- vertical em tamanho típico;
- com e sem áudio (legenda-guia `.srt`).

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

## 5. Prévia curta da Request (etapa 4)

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

Tem ≈ 69 s nos dois formatos e todas as telas dentro das faixas do §3.

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
- o cartão Dark Moroccan Blue entra por dissolve de 700 ms sobre a última imagem;
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
