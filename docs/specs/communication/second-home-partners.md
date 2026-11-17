# Aplicação do Framework Second Home Partners — parceiro especialista

> Fonte: [Framework Second Home Partners](framework-second-home-partners.md), versão aprovada de 2026-11-17 ([ADR-0028](../../adr/0028-jornada-second-home-partners.md)). Contrato: [communication](../communication.md). Guardrails: [luxtory](luxtory.md) §4.

## 1. Escopo e precedência

Uma página para incorporadoras, imobiliárias e corretores especialistas em imóveis de lazer de alto padrão `[FW-SHP: §3]`. `01` v10.6 §1/§35 → `02` v4.6 REQ-105 → `03` v3.18 TECH-057. Brief e aceite em [catalog §20.6](../catalog.md#206-revisão-aprovada--três-perfis-e-copy-de-lançamento-2026-11-17). Comunicação: Framework > aplicação > brief > i18n. Sem links para B2C/Brand Partners (`D-LX-13`).

## 2. Leitura canônica

| # | Tema | Âncora | Limite |
|---|---|---|---|
| L1 | Liberdade para os clientes `[FW-SHP: §2, §8 P1]` | REQ-105, revisão de 2026-11-17 | copy no presente preparada para lançamento; implementação editorial não comprova prontidão nem ativa Club |
| L2 | Luxchange `[FW-SHP: §8 P4]` | BR-146, BR-190, REQ-060 | associados disponibilizam períodos, recebem créditos e solicitam estadias; sem garantia |
| L3 | Luxplus `[FW-SHP: §8 P4]` | BR-146, BR-240, REQ-070 | estadias disponíveis pagas pela hospedagem, sem créditos |
| L4 | Locação `[FW-SHP: §8 P4]` | `01` §1/§35, BR-374 | gestão digital com apoio local, independente do Club e contratada por proprietário; decisão voluntária |
| L5 | Receita recorrente `[FW-SHP: §8 P3]` | `01` v10.6 §35, BR-352 | primeiros parceiros dos três perfis participam do faturamento dos imóveis afiliados; receitas, atribuição, percentuais e pagamento em contrato; sem mínimo ou garantia; expressão pública não redefine bases econômicas |
| L6 | Imóveis parceiros `[FW-SHP: §6.2]` | BR-053, BR-054 | não são Second Homes nem Branded Second Homes; fotos ilustrativas |
| L7 | CTA `[FW-SHP: §8 P5]` | REQ-105 | formulário da mesma página; envio não formaliza parceria nem afilia imóvel |

## 3. Posicionamento

Mais valor para o negócio e mais liberdade para os clientes `[FW-SHP: §2]`. Distribuição pelos parceiros, diferenciação comercial e oportunidade de receita além da venda. Fatos da gestão e separação econômica: `01` §1/§35; nenhuma nova base ou taxa na implementação.

## 4. Narrativa

Narrativa/JTBD `[FW-SHP: §4, §4.1]`. Mensagem comum preservada e bloco para intermediadores na própria página. Hipótese de vendas (`H-SHP-01`) não vira resultado.

## 5. Personagens

Personagens `[FW-SHP: §5]`. FAQ: quem pode ser parceiro; como ajuda as vendas; participação no faturamento; necessidade de empreendimento próprio; estágio; gestão; decisão do proprietário. As respostas seguem L1–L7 e REQ-105, sem repetição de indisponibilidade na copy de lançamento.

## 6. Crenças

`[FW-SHP: §6.1, §6.2]`: oportunidade recorrente dependente de faturamento/contrato; sem promessa, afiliação automática ou obrigação operacional para iniciar conversa.

## 7. Jornada e 5Ps

Problem Aware → Product Aware `[FW-SHP: §7]`. CTA “Conversar sobre uma parceria” → `#conversa`.

| Seção | Função | Âncora |
|---|---|---|
| Hero | PICTURE `[FW-SHP: P1]` | `#inicio` |
| A oportunidade | PROBLEM `[FW-SHP: P2]` | `#oportunidade` |
| Benefícios | PROMISE `[FW-SHP: P3]` | `#beneficios` |
| Contextos, soluções, intermediadores, processo, perguntas | PROOF `[FW-SHP: P4]` | `#empreendimentos`, `#solucoes`, `#imobiliarias-e-corretores`, `#como-funciona`, `#perguntas` |
| Conversa | PUSH `[FW-SHP: P5]` | `#conversa` |

## 8. Tom

Tom `[FW-SHP: §11]`, validação e execução `[FW-SHP: §13, §14]`. Blocos curtos, sem truncamento ou fonte reduzida; preservar contexto e mecanismos.

## 9. Input mínimo

`[FW-SHP: §15]`; contrato fechado por perfil em REQ-105 / [catalog §20.3](../catalog.md#203-formulário). Dados apenas para contato e avaliação da parceria, sem marketing não autorizado ou persistência.

## 10. Registro

D-SHP-14 a D-SHP-16 são vigentes. Linhas anteriores preservam as decisões históricas e ficam superadas onde indicado; pendências operacionais e jurídicas continuam sem impedir a preparação editorial aprovada. P-SHP-03 não limita mais o tempo verbal da versão de lançamento, mas segue bloqueando execução de serviços sem regras.


| ID | Decisão | Status | Base |
|---|---|---|---|
| D-SHP-01 | Hero “Mais valor para seu empreendimento. Mais liberdade para seus clientes.” com nota de programa em estruturação | aprovada pelo fundador em 2026-11-12 (plano v3.3) | REQ-105 |
| D-SHP-02 | CTA único “Conversar sobre seu empreendimento” | aprovada em 2026-11-12 | REQ-105 |
| D-SHP-03 | Sete seções: Hero, A oportunidade, Benefícios, Soluções para os proprietários (antes Luxtory Club), Como funciona, Perguntas, Conversa | aprovada em 2026-11-12; quarta seção renomeada em 2026-11-13 (`D-SHP-09`); sequência ampliada para oito por `D-SHP-13` | `[FW-SHP: §12]` |
| D-SHP-04 | Variantes: A com participação nos resultados, B sem claims econômicos; publica-se só a autorizada, sem flag | substituída em 2026-11-13 → `D-SHP-07` | `01` §35 |
| D-SHP-05 | Indexação: Preview e local sem indexação; fechada = 404; aberta em Production = indexável | aprovada em 2026-11-12 | REQ-105 |
| D-SHP-06 | Hero tipográfico, sem fotografia de banco | aprovada em 2026-11-12 | `P-LX-02` |
| D-SHP-07 | Três benefícios com o mesmo peso — diferenciação comercial, marketing e vendas, participação nos resultados —; participação nas locações como parte da proposta e no Club como possibilidade condicionada; sem percentual, fórmula, valor ou exemplo; nenhuma variante no código | aprovada pelo fundador em 2026-11-13 (modelo comercial) | `01` §35, BR-352 |
| D-SHP-08 | Modelo A (prioritário para validação comercial): a participação incide sobre a comissão bruta de gestão efetivamente auferida pela Luxtory nas locações dos imóveis do empreendimento, depois de estornos e ajustes contratuais; não sobre o lucro líquido nem sobre a parte do proprietário; operador local, tributos e despesas são custos da Luxtory. Percentual e demais condições ficam só no contrato (repositório público: nenhum número aqui) | aprovada pelo fundador em 2026-11-13 | `01` §35 |
| D-SHP-09 | Soluções para os proprietários na lista numerada da Home B2C, com o mesmo peso: Luxchange e Luxplus (mecanismos planejados do Luxtory Club, para associados) e locação de temporada (gestão da Luxtory, independente do Club, contratada por cada proprietário); uma nota separa os dois casos | aprovada pelo fundador em 2026-11-13 (refinamento de copy e UX; substitui a versão do mesmo dia que tirava a locação da seção) | `01` §1, BR-146 |
| D-SHP-10 | FAQ só com as dúvidas de uma incorporadora interessada: vendas e ociosidade, participação, operação das locações, decisão dos proprietários e fase; parceria em qualquer fase, sem prioridade para lançamentos | aprovada pelo fundador em 2026-11-13 | REQ-105 |
| D-SHP-11 | A página é de prospecção: publica-se com o aceite do fundador e a configuração de Production, sem esperar a operação. Revisão jurídica bloqueia contratos (`P-SHP-01`); definição operacional bloqueia a prestação dos serviços (`P-SHP-02`); definição do modelo B bloqueia sua contratação (`P-SHP-04`). O hero diz só que o programa está em estruturação; a indisponibilidade de Luxchange e Luxplus fica na nota das soluções | aprovada pelo fundador em 2026-11-13 | REQ-105 |
| D-SHP-12 | Identidade visual pela paleta institucional, só com superfícies do Core: Hero Deep, A oportunidade White, Benefícios Blue, Soluções Deep, Como funciona Wash, Perguntas Blue, Conversa White; a passagem Blue → Deep entre Benefícios e Soluções segue o Como funciona do Brand Partners | aprovada pelo fundador em 2026-11-13 | DS §13.3 |
| D-SHP-13 | Oito seções: acrescentar “Onde a parceria pode acontecer” entre Benefícios e Soluções; Wash, headline “Da concepção à entrega. Seu empreendimento pode fazer parte.”, três fotografias fornecidas (sob demanda em condomínios parceiros, em desenvolvimento e entregues), copy integral aprovada e nota de avaliação e imagens ilustrativas; sem CTA adicional, promessa de aprovação ou adesão obrigatória. CSS exclusivo da seção; demais seções e serviços preservados | aprovada pelo fundador em 2026-11-13 (brief da seção); amplia `D-SHP-03` e a transição de superfícies de `D-SHP-12` | REQ-105; L1, L4; DS §13.3 |

| D-SHP-14 | Página única para os três perfis, nove seções, novo bloco de intermediadores e formulário condicional; CTA “Conversar sobre uma parceria” e hero “Mais valor para seu negócio. Mais liberdade para seus clientes.” | aprovada pelo fundador em 2026-11-17; substitui D-SHP-01, D-SHP-02, D-SHP-03, D-SHP-10 e amplia D-SHP-13 | REQ-105; catalog §20.6 |
| D-SHP-15 | Primeiros parceiros dos três perfis participam do faturamento dos imóveis que afiliarem; oportunidade recorrente, dependente de receitas e contrato, sem taxa ou mínimo presumido; bases econômicas preservadas | aprovada pelo fundador em 2026-11-17; amplia D-SHP-07 e D-SHP-08, sem redefinir bases | `01` v10.6 §35, BR-352 |
| D-SHP-16 | Copy completa de lançamento no presente, sem notas de estruturação ou indisponibilidade; publicar quando o Club estiver pronto. Preparação editorial não comprova operação nem habilita serviço | aprovada pelo fundador em 2026-11-17; substitui os limites editoriais anteriores de D-SHP-09 e D-SHP-11; prontidão operacional segue pendente | REQ-105; catalog §20.6 |

| ID | Hipótese | Como validar |
|---|---|---|
| H-SHP-01 | A possibilidade de outros destinos ajuda a superar objeções e acelerar a decisão de compra | objeções registradas nos diagnósticos com incorporadoras e equipes de venda |
| H-SHP-02 | Incorporadoras valorizam o apoio comercial e a gestão das locações antes de o intercâmbio existir | conversão de conversas em parcerias-piloto |
| H-SHP-03 | A participação nas receitas de gestão leva a incorporadora a apresentar a gestão das locações aos compradores (Partner-Led Growth) | adesão dos proprietários dos empreendimentos parceiros à gestão |
| H-SHP-04 | Explicitar os tipos e fases de empreendimentos aumenta a proporção de visitantes qualificados que iniciam contato | proporção de contatos qualificados; hipótese a validar, sem resultado atribuído à seção |

| ID | Pendência | Bloqueia |
|---|---|---|
| P-SHP-01 | ~~Validação jurídica e econômica da participação nos resultados~~ — economia do modelo A definida pelo fundador em 2026-11-13 (`D-SHP-08`); resta a revisão jurídica do contrato do modelo A (apuração, estornos, prazo e forma de pagamento, vigência) | a formalização de contratos com incorporadoras; não bloqueia a página de prospecção (`D-SHP-11`) |
| P-SHP-02 | Definição operacional: quem executa estratégia, materiais e capacitação comercial, e como a gestão das locações é entregue aos primeiros parceiros | a prestação dos serviços; não bloqueia a página nem a captação de incorporadoras (`D-SHP-11`) |
| P-SHP-03 | Regras da participação de imóveis parceiros no Luxtory Club (Escopo B) | qualquer claim além de “previsto” sobre o Club |
| P-SHP-04 | Modelo B: percentual, atribuição dos associados e receitas ao empreendimento, apuração do resultado líquido e pagamento; o percentual do modelo A não se aplica automaticamente | a contratação e a execução do modelo B e qualquer claim além de “poderá”; não bloqueia a menção da possibilidade futura (`D-SHP-11`) |
