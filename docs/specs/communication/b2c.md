# Aplicação do Framework B2C — Protagonista B2C

> **Fonte canônica da comunicação B2C:** [Framework B2C](framework-b2c.md), congelado
> ([ADR-0012](../../adr/0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md)). Este arquivo **não repete o
> Framework**: ancora em IDs canônicos o que ele afirma sobre o modelo, responde às objeções, mapeia as páginas e
> registra o que o Framework não decide. Contrato: [`../communication.md`](../communication.md). Guardrails de todas as
> jornadas: [`luxtory.md`](luxtory.md) §4. A versão anterior deste arquivo (preenchimento de 2026-09-29, substituído em
> 2026-09-30) está no commit `846b2e8`.

## 1. Escopo e precedência

- Jornada B2C: site público, Discovery + Interesse (`02` §2). Protagonista: `[FW-B2C: §3]`.
- Um único Protagonista: Owner e Co-Owner são as duas modalidades do adquirente final, com peso equivalente sempre que
  aparecem juntas `[F: BR-005, REQ-103]`.
- A jornada B2C não leva à jornada Brand Partners (`D-LX-01`).
- Precedência. Fatos: `01 → 02 → 03` `[F: BR-380, REQ-104]`. Comunicação: Framework B2C > este arquivo > brief da
  página > i18n. O Framework orienta o que dizer; os canônicos limitam o que pode ser afirmado. Fato sem âncora
  canônica não é escrito: vira pendência.

## 2. Leitura canônica do Framework

Cada linha liga uma frase do Framework ao limite canônico que a copy respeita. Valem também, para todas as jornadas, os
guardrails de [`luxtory.md`](luxtory.md) §4.

| # | Frase do Framework | Âncora | Limite na copy |
|---|---|---|---|
| L1 | Patrimônio → Posse; Co-Owner "participação patrimonial real" `[FW-B2C: §2, §8 P4]` | BR-052, BR-065, BR-071, BR-373, `01` §8 | Owner tem 100% da Residence. Co-Owner tem Ação da SPE proprietária com Direito de Uso — nunca "possui a Residence". Ação e Direito de Uso só nascem na formalização. O termo "posse" passa pela revisão jurídica (`P-LX-03`) |
| L2 | "Co-Owner não compra diárias" `[FW-B2C: §8 P4]` | REQ-100, BR-373 | diretriz interna: a copy afirma em positivo (Ação com Direito de Uso) e não usa "diária(s)", nem negada |
| L3 | Luxchange, Luxplus e monetização `[FW-B2C: §2, §8 P4]` | BR-146, BR-147, BR-151, BR-190, BR-242, BR-258, BR-259, REQ-070, REQ-071, REQ-072, REQ-101 | condição na mesma frase: Membership vigente (o uso próprio não depende dele). Luxplus = noites do Inventário Luxtory, com receita da Luxtory — nunca forma de obter Direito de Uso. Co-Owner só monetiza data já reservada, por canais autorizados. Crédito não é moeda. Nenhuma receita é prometida; simulador, só como estimativa sem garantia |
| L4 | Gestão "reduz atritos" `[FW-B2C: §2, §8 P4]` | BR-072, BR-130, BR-148, BR-149 | Co-Owner: administração profissional obrigatória, com Taxa de Administração e despesas rateadas. Owner: administração integral opcional e despesas suportadas por ele. As duas administrações nunca se confundem (`03` §13); nunca "sem custos" |
| L5 | Aliados e convidados `[FW-B2C: §5]` | BR-330, BR-331, BR-332, REQ-092 | a copy afirma: o Titular **pode** receber familiares e amigos como convidados, e isso não consome Direito de Uso adicional. Há regras para convidados por Residence; detalhes ainda não definidos (P-5 do roadmap) não aparecem. O convidado não vira Titular. Convidar não é alugar |
| L6 | o Club amplia conexões entre pessoas `[FW-B2C: §8 P4]` | `01` §1, `02` §2 | comunidade é aspiração, nunca recurso existente. Club = Luxchange, Luxplus e locação autorizada |
| L7 | o PROOF da Home cita mecanismos ainda não construídos (R3) `[FW-B2C: §12]` | `02` §2 | apresentados como componentes do modelo; sem link nem CTA para superfície que ainda não existe |
| L8 | alienação e transferência `[FW-B2C: §8 P4]` | BR-340, BR-341, BR-342, BR-345, BR-374 | "conforme as regras aplicáveis"; nunca liquidez |
| L9 | Design & Build no mecanismo `[FW-B2C: §2]` | BR-003, BR-053, BR-054, BR-300, BR-301 | Residence sempre construída do zero, fiel a um Concept aprovado. A Luxtory **pode** coordenar a obra integralmente — não é promessa. Sem retrofit |

## 3. Posicionamento — fatos ancorados

Categoria, público de referência, problema, oferta, alternativas e trade-offs, diferencial, mecanismo, tríade e
declaração: `[FW-B2C: §2]`. Fatos que sustentam a oferta:

| Elemento | Fato | Âncora |
|---|---|---|
| Owner | 100% da Residence e de sua capacidade econômica e de uso; pode avançar com um único adquirente | BR-051, BR-052 |
| Co-Owner | Ação da SPE (S.A. fechada) proprietária da Residence, com Direito de Uso; participações e Direitos de Uso equivalentes; a Luxtory não é acionista | BR-071, BR-373, `01` §8 |
| Mecanismo | cadeia do modelo ([`luxtory.md`](luxtory.md) §5); Concept com especificação replicável e versões; Edition com região e condições comerciais; Design & Build que preserva o Concept | BR-013, BR-025, BR-031, BR-300, BR-301 |
| Gestão | administração profissional obrigatória e despesas rateadas no Co-Owner; administração integral opcional no Owner; Taxa de Administração obrigatória no Co-Owner e opcional no Owner | BR-072, BR-073, BR-130, BR-148 |
| Luxtory Club | Luxchange, Luxplus e locação pelo canal Luxtory exigem Membership vigente; o uso próprio independe de Membership | BR-146, BR-147 |

## 4. Narrativa, JTBD e Necessidade

Tema, Desejo, JTBD, Identidade e Pertencimento, Solução Desejada, camadas de especificidade e Necessidade:
`[FW-B2C: §4, §4.1, §4.2, §4.3, §4.4, §4.5]`.

## 5. Personagens e objeções

Protagonista, Mentor, Aliados, Antagonista e Vilão: `[FW-B2C: §5]`. As 13 objeções do Framework e o que a copy pode
responder:

| Objeção | Tipo | Resposta ancorada |
|---|---|---|
| "Vou usar o suficiente?" · "Comprar faz sentido para meu perfil?" | autoavaliação | qualificação do PUSH `[FW-B2C: §8 P5]`, com os fatos do uso: Owner tem toda a capacidade de uso; Co-Owner tem o Direito de Uso anual da sua configuração, que não acumula para o exercício seguinte `[F: BR-052, BR-075, BR-076]` |
| "Isso reduz minha liberdade?" | prova | Liberdade = possibilidades, não ausência de regras `[FW-B2C: §8 P4]`. No Co-Owner: limites por temporada que não se compensam, ordem de abertura sorteada e rotativa (vantagem de tempo, não exclusividade), permanência de até 14 dias seguidos. Mecanismos do Club com Membership vigente `[F: BR-082, BR-100, BR-101, BR-104, BR-111, BR-146]` |
| "Por que não continuar alugando?" · "Qual a diferença para uma second home tradicional?" | contraste | trade-offs das alternativas `[FW-B2C: §2, P2]`. Fatos: Residence construída do zero a partir de um Concept com especificação replicável; gestão aplicável a cada modalidade; mecanismos do Club `[F: BR-013, BR-053, BR-072, BR-130, BR-146]` |
| "Qual a diferença entre Owner e Co-Owner?" | fato | as duas modalidades do adquirente final: Owner tem 100% da Residence; Co-Owner tem Ação da SPE com Direito de Uso equivalente ao dos demais; Taxa de Administração obrigatória só no Co-Owner; nenhuma diferença além das do `01` `[F: BR-005, BR-052, BR-071, BR-148, BR-373, BR-376, REQ-103]` |
| "O que exatamente eu possuo?" | fato | Owner: a Residence. Co-Owner: Ação da SPE proprietária da Residence, com Direito de Uso. Ambos nascem na formalização `[F: BR-052, BR-065, BR-071, BR-373, 01 §8]` |
| "Como funciona meu uso?" | fato | Owner: toda a capacidade de uso. Co-Owner: Direito de Uso anual da configuração, limites por temporada, abertura do calendário em ordem rotativa sorteada, permanência de até 14 dias seguidos. O uso próprio não depende de Membership `[F: BR-052, BR-076, BR-082, BR-100, BR-101, BR-104, BR-111, BR-147]` |
| "Isso é timeshare?" | fato | **Não** (`D-B2C-15`): o Co-Owner tem Ação da SPE proprietária da Residence, com Direito de Uso — participação societária, não compra de tempo ou de dias; a Luxtory não é acionista `[F: BR-071, BR-373, 01 §8]` |
| "Como funcionam gestão e manutenção?" | fato | Co-Owner: administração profissional obrigatória, Taxa de Administração e despesas rateadas. Owner: administração integral pela Luxtory opcional; despesas suportadas por ele `[F: BR-072, BR-073, BR-130, BR-148, BR-149]` |
| "Consigo usar outros lugares?" | fato | sim, pelos mecanismos do Club, com Membership vigente, conforme regras e disponibilidade: Luxchange (Créditos não são moeda nem garantem disponibilidade; no Co-Owner, só data já reservada é cedida) e Luxplus (noites do Inventário Luxtory) `[F: BR-146, BR-150, BR-151, BR-190, BR-240, REQ-070]` |
| "O que acontece quando não utilizo?" | fato | Direito de Uso não utilizado não acumula. Co-Owner: a capacidade não reservada continua coletiva da SPE até o fim do exercício, e só data já reservada pode ir para Luxchange ou locação. Owner: escolhe quais datas mantém para uso próprio e quais autoriza para comercialização `[F: BR-075, BR-151, BR-162, BR-250, BR-252, BR-257]` |
| "Existe garantia de retorno, valorização ou liquidez?" | fato | não: patrimônio tem valor econômico e está exposto ao mercado, sem promessa de valorização, renda, liquidez ou retorno `[FW-B2C: §2]`; Crédito não é investimento `[F: BR-190, BR-374]` |

## 6. Crenças — MCR

Nível, input, Bloco Alfa, Bloco Ômega e diagnóstico: `[FW-B2C: §6, §6.1, §6.2, §6.3]`.

## 7. Variações por modalidade

Owner e Co-Owner aparecem lado a lado, com o mesmo peso visual e textual `[F: REQ-103]`. Conteúdo do pilar Patrimônio
por modalidade: `[FW-B2C: §8 P4]`; fatos: §3 deste arquivo. Personalização: o Owner personaliza elementos não
essenciais do Concept; a Residence Co-Owner é padronizada `[F: BR-017, BR-019]`. Limites L1, L2 e L4.

## 8. Jornada e 5Ps

**Mapa de páginas (`D-B2C-14`)** — a Home segue estritamente o Framework; as demais páginas começam no nível real do
Protagonista `[FW-B2C: §8.1, §13]`:

| Página | Função | Schwartz (entrada → saída) | 5Ps | CTA → destino |
|---|---|---|---|---|
| Home | a mais abrangente; segue estritamente o Brief Narrativo `[FW-B2C: §12]` | Unaware → Product Aware | arco completo; PICTURE = Hero | "Conheça as Residence Editions." (`D-B2C-13`) |
| Como funciona | aprofunda, em detalhe, como o produto funciona: modalidades, Direito de Uso, gestão, Luxtory Club e regras | Product Aware → Most Aware | PROOF → PUSH | "Conheça as Residence Editions." (`D-B2C-13`) |
| Coleção | as Second Homes: Concepts e suas Editions | Product Aware → Most Aware | PROOF → PUSH | "Ver o Concept" |
| Concept, com Edition e oferta quando existirem (REQ-022) | a Residence específica | Most Aware | PUSH + prova necessária | "Manifestar interesse", só quando o formulário existir (`D-B2C-10`, `P-B2C-01`) |
| Interesse | registrar o interesse | Most Aware → ação | PUSH | enviar → confirmação |

- **Disposição para mudança:** "Aberto" em todas as páginas, como contexto-base `[FW-B2C: §3.1]`; a ambivalência é
  tratada pelas objeções (§5) no PROOF e no PUSH `[FW-B2C: §7.1]`.
- **Prova:** a prova necessária por pilar é a do `[FW-B2C: §12]`, com os limites L1–L9.
- **Qualificação do PUSH:** a lista base é `[FW-B2C: §8 P5]`. Complementos factuais: imóvel existente não entra no
  modelo `[F: BR-054]`; no Co-Owner, a casa é padronizada e as datas não são as mesmas todos os anos
  `[F: BR-019, BR-101, BR-104]`.

## 9. Tom e expressão

Regra afetiva, personalidade do Mentor (OCEAN), contextos positivos e negativos e tom:
`[FW-B2C: §9, §10, §10.1, §10.2, §11]`. Volatilidade: `D-B2C-12`.

## 10. Input mínimo

`[FW-B2C: §15]`. Evidências disponíveis: os fatos ancorados neste arquivo e os dados registrados no catálogo; provas
externas (`P-LX-01`) e fotografia oficial (`P-LX-02`) ainda não existem.

## 11. Registro

| ID | Decisão | Status | Base |
|---|---|---|---|
| D-B2C-01 | Desejo prioritário e valores emocional e social | substituída em 2026-09-30 → `[FW-B2C: §4]` | DS spec §1, §4; `01` §1 |
| D-B2C-02 | Problema prioritário: imóvel genérico + esforço de fazer sozinho | substituída em 2026-09-30 → `[FW-B2C: §2, P2]` | `H-B2C-01`; DS ref §8 |
| D-B2C-03 | Diferencial central: a identidade vem antes da casa | substituída em 2026-09-30 → `[FW-B2C: §2]` | `01` §1, BR-013, BR-014 |
| D-B2C-04 | Declaração de posicionamento | substituída em 2026-09-30 → `[FW-B2C: §2]` | §2 da versão anterior |
| D-B2C-05 | Tema: a segunda casa como lugar de identidade | substituída em 2026-09-30 → `[FW-B2C: §4]` | DS spec §1 |
| D-B2C-06 | Antagonista: o peso de fazer sozinho | substituída em 2026-09-30 → `[FW-B2C: §5]` | `H-B2C-01`, `H-B2C-05` |
| D-B2C-07 | Vilão: a lógica do imóvel genérico | substituída em 2026-09-30 → `[FW-B2C: §5]` | DS ref §8; Mestre §4 |
| D-B2C-08 | Crença final desejada | substituída em 2026-09-30 → `[FW-B2C: §6]` | §5 da versão anterior |
| D-B2C-09 | Mapa de jornada B2C (Home → Como funciona → Coleção → Concept → Interesse) | substituída em 2026-09-30 → `D-B2C-14` | `02` §2; REQ-022, REQ-024, REQ-025 |
| D-B2C-10 | Sem CTA para destino inexistente enquanto o formulário não existir | aprovada em 2026-09-29 | `02` §2; W6 ⛔ P-3; D5c |
| D-B2C-11 | Luxtory Club só no "Como funciona", com condições | substituída em 2026-09-30 → `[FW-B2C: §8 P4, §12]` | BR-146, BR-190, BR-374 |
| D-B2C-12 | Volatilidade: traço alto do Mentor; na copy, só excepcionalmente, em baixa intensidade, em PROBLEM, nunca junto de Retraimento | aprovada em 2026-09-30 (fundador) | `[FW-B2C: §10, §10.2]` |
| D-B2C-13 | CTA da Home e do "Como funciona": "Conheça as Residence Editions." → Coleção, só com ao menos uma Edition publicada; sem Edition, a página fecha com a qualificação do PUSH e "Conheça os Residence Concepts" | aprovada em 2026-10-01 (fundador) | `[FW-B2C: §8 P5, §12]`; BR-004, BR-030, REQ-022, TECH-001; `D-B2C-10` |
| D-B2C-14 | Mapa de páginas (§8): as mesmas páginas do mapa anterior; Home a mais abrangente, seguindo estritamente o Framework; "Como funciona" aprofunda o produto em detalhe; Coleção mostra as Second Homes | aprovada em 2026-10-01 (fundador) | `[FW-B2C: §7, §8.1, §12, §13]`; `02` §2 |
| D-B2C-15 | "Isso é timeshare?" → não (§5) | aprovada em 2026-10-01 (fundador) | BR-071, BR-373, `01` §8 |
| D-B2C-16 | CTA da Home e do "Como funciona" por disponibilidade, complementando `D-B2C-13`: Edition publicada → "Conheça as Residence Editions." (leva à primeira oferta da Coleção); Concepts publicados sem nenhuma Edition → "Conheça os Residence Concepts"; nenhum Concept publicado → sem CTA para a Coleção (na Home, só o "Como funciona"); dados indisponíveis → estado desconhecido, nunca tratado como inexistência de Edition ou de Concept | aprovada em 2026-10-01 (fundador) | `D-B2C-13`; BR-004, BR-030, REQ-022, TECH-001 |
| D-B2C-17 | Nova versão do Framework B2C: no §2, "outros clubes de second homes, intercâmbio ou hospitalidade"; a Luxtory se apresenta como "clube de Branded Second Homes de alto padrão" | aprovada em 2026-10-01 (fundador) | `[FW-B2C: §2]`; ADR-0012 |
| D-B2C-18 | Copy da Home escrita pelo fundador (Hero → FAQ) é a fonte autorizada da Home; CTAs de catálogo com os nomes de `D-LX-08` nos estados de `D-B2C-16`: "Conheça as Home Editions", "Conheça os Home Concepts", "Entenda como funciona" | aprovada em 2026-10-01 (fundador) | `D-B2C-13`, `D-B2C-16`, `D-LX-08`; BR-146, BR-373, BR-374 |
| D-B2C-19 | GATE-COPY-W4 (Core Design System, CP2): a copy da Home é a da "Especificação Visual Final — Home Luxtory" do fundador, aplicada integralmente, com os parágrafos que ela referencia da revisão da Home pelo fundador de 2026-10-05 (Regra com painel de alternativas e qualificações escritas, Possibilidade, Luxtory, Pertencimento, Patrimônio, Liberdade, Gestão, PUSH e FAQ, com as frases de L1, L3 e L4 já aplicadas). Ajustes da especificação: Hero "histórias extraordinárias, com quem ama, …"; eyebrows sem ponto final e sem o nome do pilar ("Branded Residences", "Branded Second Home", "Muito além de um único endereço", "Sua Second Home. Não um segundo trabalho."); Owner "A Residence inteira é sua.". Os nomes dos CTAs de `D-B2C-18`/`D-B2C-16` permanecem; Como funciona, Coleção, Concept e 404 mantêm a copy vigente. A revisão de 2026-10-05 usa "Residence"/"Residence Edition"/"Residence Concept" em trechos da Home onde `D-LX-08` prevê os nomes públicos com "Home": aplicado como escrito, confirmado pelo fundador no Checkpoint Visual. Revisão do fundador de 2026-10-06 (aprovada): "Um estilo de vida." na lista do Pertencimento; Owner "Você como proprietário do imóvel." e Co-Owner "Você como acionista da SPE proprietária do imóvel."; Liberdade só com o essencial (Luxchange — intercâmbio da rede; Luxplus — reservas extras; Locação de temporada — monetizar tempo ocioso, com a restrição do Co-Owner), sem as frases de Membership e o aviso sobre Créditos, que continuam no Como funciona e no FAQ; no PUSH, "E para quem é a Luxtory?" como título dos três parágrafos de público | aprovada em 2026-10-06 (fundador) | `D-B2C-18`; `catalog.md` §13.10; REQ-100, REQ-101; BR-146, BR-373, BR-374 |
| D-B2C-20 | Copy do Como funciona: a da "Especificação Visual e Copy — Como funciona Luxtory" do fundador, aplicada integralmente (Hero "O lugar onde suas melhores histórias ainda vão acontecer.", jornada em três momentos, Patrimônio, Liberdade, Gestão, Luxtory Club, Pertencimento, condições, "Faz sentido para a sua vida?" com as listas da página e CTA final), com ajustes cirúrgicos de linguagem: "Você decide quando quer usá-la"; "O Direito de Uso que você não usar não passa automaticamente para o ano seguinte"; "A ideia é preservar seu uso…"; Owner do não uso em dois blocos ("Você escolhe quais datas mantém para uso próprio." / "Quando aplicável, também escolhe quais disponibiliza para outros mecanismos da Luxtory."); "coordena a Second Home compartilhada" (no lugar de "a propriedade compartilhada") e "a experiência de todos os Co-Owners" (no lugar de "todos os proprietários"), para nunca sugerir propriedade do imóvel pelo Co-Owner (L1). A condição de Membership vigente abre a lista do Club, uma vez, para os três mecanismos (L3). Refinamento aprovado em 2026-10-07: scrim uniforme no Hero e no CTA final sem mudar as cores da copy (D-A), e a Liberdade com `problema-imovel.jpg` (outro destino, sem repetir a foto do CTA; D-B). Revisão de consistência do fundador (2026-10-07), para nenhuma frase tratar regra do Co-Owner como se valesse para o Owner, limitar o uso do Owner ou transformar escopo atual em impossibilidade futura: "E quando eu não estiver usando?" (no lugar de "E se eu não usar todos os meus dias?"); "No Co-Owner, quanto tempo posso usar?"; Luxplus "não altera sua posição patrimonial nem, no Co-Owner, o seu Direito de Uso"; condição 04 "não faz parte do modelo atual"; "Pode não fazer sentido para quem" sem "exige disponibilidade absoluta" e sem "quer adaptar um imóvel que já possui", com os dois critérios do Co-Owner identificados | aprovada em 2026-10-06 e 2026-10-07 (fundador; ajustes de linguagem autorizados na mesma especificação) | `D-B2C-16`; `catalog.md` §13.11; REQ-100, REQ-101, REQ-103; BR-052, BR-071, BR-146, BR-373, BR-374 |
| D-B2C-21 | Coleção (`/colecao`) como discovery curatorial: Hero tipográfico com a headline "As suas próximas histórias começam antes mesmo de a casa existir." (fotografia de atmosfera autorizada e não vinculável a um Concept pode substituí-lo depois); card = Home Concept, com as Home Editions dentro (nunca duplicado); "Ainda sem Home Edition — por enquanto, sem oferta comercial."; Faixa de valor em duas etapas (Owner/Co-Owner → De/Até), só sobre Concepts com Home Edition e valor vigente; destaque editorial só explícito e com capa; jornada "Escolha o Home Concept → Escolha onde gostaria de vivê-lo → a Luxtory decide o lançamento e cria a Home Edition → Escolha como possuir → o Design & Build transforma o Concept em casa → Viva sua Second Home" (nunca "Edition ou Design & Build"); fechamento "Refinar a busca ↑" + "Entenda como funciona". Checkpoint A (2026-10-07): explicação do Hero "Home Concept é a ideia. Home Edition é o lançamento dessa ideia em uma região." + "Entenda como funciona ↓"; passo 03 "A Home Edition ganha forma — com demanda e viabilidade, a Luxtory estrutura o lançamento com região, modalidade e condições próprias."; com região escolhida, "Com Home Edition em [região]" e depois "Outros Home Concepts que combinam com suas escolhas" | aprovada em 2026-10-07 (fundador; checkpoint A) | `catalog.md` §13.12; REQ-020, REQ-022, REQ-024, REQ-025, REQ-100, REQ-103; BR-015, BR-030, BR-031, BR-053, BR-300, BR-301 |
| D-B2C-22 | Refinamento tipográfico solicitado pelo fundador: em "Quando abrir mão vira regra", opções Second Home, Hospedagem e Copropriedade sempre lado a lado; opções, atributos e resultados na mesma escala Newsreader menor, ajustada à largura do painel; opção selecionada em Warm Sand, com sublinhado e peso medium. Todos os fechamentos editoriais do B2C menores e em Newsreader itálico, proporcionais às seções; ações, copy e B2B preservados | solicitada pelo fundador em 2026-10-15; complementa `D-B2C-19`, `D-B2C-20` e `D-B2C-21` somente na apresentação | `catalog.md` §13.10–§13.12; ADR-0003 |

| ID | Hipótese | Como validar | Status |
|---|---|---|---|
| H-B2C-01 | Perfil: contexto e comportamento atual | conversas comerciais e origem dos interesses registrados (W5) | substituída em 2026-09-30 → `[FW-B2C: §3, §5]` |
| H-B2C-02 | Alternativas que o Protagonista considera | conversas comerciais | substituída em 2026-09-30 → `[FW-B2C: §2]` |
| H-B2C-03 | Critérios de decisão | conversas comerciais; perguntas mais frequentes | substituída em 2026-09-30 → `[FW-B2C: §5]` |
| H-B2C-04 | Objeções prováveis | conversas comerciais; perguntas mais frequentes | substituída em 2026-09-30 → `[FW-B2C: §5]` |
| H-B2C-05 | Riscos percebidos | conversas comerciais | substituída em 2026-09-30 → `[FW-B2C: §5]` |
| H-B2C-06 | Nível de conscientização (categoria desconhecida) | comportamento na jornada (Home → Como funciona) | substituída em 2026-09-30 → `[FW-B2C: §7]` |
| H-B2C-07 | Aliados | conversas comerciais | substituída em 2026-09-30 → `[FW-B2C: §5]` |
| H-B2C-08 | Mapa de crenças | conversas comerciais | substituída em 2026-09-30 → `[FW-B2C: §6]` |
| H-B2C-09 | Ênfase de desejo por modalidade | modalidade informada nos interesses (W5) | substituída em 2026-09-30 → `[FW-B2C: §8 P4]` |

| ID | Pendência | Bloqueia |
|---|---|---|
| P-B2C-01 | Formulário de interesse: campos, consentimento e aviso de privacidade (P-3 do roadmap) | CTA "Manifestar interesse" e página de Interesse |
