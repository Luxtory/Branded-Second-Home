# 02 — Product Spec — Luxtory Branded Second Home

2026-10-09 · Luxtory (fundador) · Versão 4.2 — final · Base normativa: 01 v10.1 (188 BRs) · PD-001 a PD-011 ratificados

Revisão BP0 autorizada pelo fundador: acrescenta REQ-028 e REQ-029 à v4.1, sem alterar Business Rules,
PDs ou invariantes. A superfície pública entra na BP1; o portal é capacidade planejada para BP2, condicionada
aos seus critérios de entrada. Rastreabilidade técnica em `03` v3.14; impacto e aceite em
[`catalog` §14](../catalog.md#14-discovery-público-b2b-brand-partners-bp1). Total normativo: **65 REQ · 6 INV · 11 PD**.

## 1. Autoridade, escopo e convenções

Hierarquia: **01 Business Model & Business Rules → 02 Product Spec → 03 Technical Spec → Software.**

Este documento herda conceitos, regras e parâmetros do `01`, define apenas comportamento funcional e não replica valores já fixados lá. Divergência aparente resolve-se em favor do `01`.

Não pertencem ao `02`: banco de dados, schema, APIs, arquitetura, serviços, locks, concorrência técnica, idempotência, RLS, migrations, infraestrutura e observabilidade técnica.

Formato: **REQ-xxx \[BR-xxx, PD-xxx\] — comportamento funcional.** REQ, INV e PD são normativos neste documento; havendo PODE ou NÃO PODE, prevalece a modalidade expressa.

| Marca | Significado |
| --- | --- |
| *(sem marca)* | Implementa diretamente uma BR |
| **\[D\]** | Derivação necessária — consequência indispensável de uma ou mais BRs |
| **\[R\]** | Recomendação; não vincula |

### Critério de lacuna

Ausência de autorização no `01` **não é lacuna**: o comportamento simplesmente não existe no produto (BR-352, BR-375). Lacuna existe quando um comportamento **autorizado** produz consequência que o `01` não define. Sem esse critério, toda modalidade não prevista vira "GAP" e o `01` passa a ter de proibir o infinito.

### Terminologia

**Ação** — participação societária do Co-Owner na SPE. Limite sazonal e Direito de Uso — quantidades de dias. O termo “cota” e seus derivados não são utilizados: participação societária é sempre Ação; quantidades de dias são Direito de Uso ou limite sazonal, conforme o contexto.

**Data-Residence** é a unidade funcional: uma data do calendário civil em uma Residence. Todo saldo, reserva, cessão, Crédito, preço e inventário opera sobre ela.

## 2. Superfícies funcionais

| Superfície | Finalidade |
| --- | --- |
| Discovery | Concepts, Editions e ofertas |
| Interesse | Manifestações Owner e Co-Owner |
| Área do Titular | Residences, Membership, reservas e convidados |
| Calendário | Disponibilidade e Direito de Uso |
| Luxtory Club | Luxchange, Luxplus e locação autorizada |
| Carteira | Créditos Luxchange |
| Admin | Operação, parâmetros, conformidade e exceções |
| Brand Partners público (BP1) | Home `/brand-partner`, Como funciona `/brand-partner/como-funciona` e formulário para iniciar conversa com a Luxtory (REQ-028) |
| Portal Brand Partner (planejado, BP2) | Representantes autorizados consultam informações pertinentes à própria parceria; somente leitura, após os critérios de entrada do REQ-029 |

Existir no modelo de negócio não concede acesso ao software.

## 3. Decisões funcionais (PD)

Decisões funcionais desta camada, **ratificadas e canônicas**. Não são derivações ocultas do `01`. O `02` as implementa; o `03` não as rediscute.

**PD-001 — Membership e papéis.** Um Membership por CPF/CNPJ. Cada vínculo com Residence identifica o papel Owner ou Co-Owner; o mesmo Titular PODE exercer papéis diferentes em Residences distintas. Membership é condição do Titular, nunca um terceiro papel.

**PD-002 — Unidade de hospedagem.** Check-in 14h, check-out 10h. Cada data reservada representa a noite iniciada nela; a data de check-out não consome Direito de Uso. Exemplo: 10 a 12/03 consome 10 e 11/03.

**PD-003 — Janela de Carnaval.** Contém exatamente 10 datas adicionais de Alta/Super Alta. Começa na sexta-feira anterior à terça de Carnaval; se essa sexta cair em janeiro, começa em 1º de fevereiro. Selecionam-se em ordem cronológica as 10 primeiras datas válidas, ignorando 29 de fevereiro e datas já Alta/Super Alta por mês.

**PD-004 — 29 de fevereiro.** O Co-Owner contemplado PODE reservá-lo a partir de 15 de setembro do ano anterior, ou imediatamente após a formalização se ela ocorrer depois dessa data. Não utilizado, o direito extraordinário expira com a data, sem rollover nem transferência automática — único desfecho compatível com a BR-161, que esgota as origens do Inventário Luxtory e não inclui essa capacidade.

**PD-005 — Request.** Prazo padrão 24 horas, administrável. Para enviar, o solicitante DEVE ter Membership elegível, Créditos suficientes em Garantia e pagar antecipadamente o Luxchange Fee. A capacidade NÃO fica bloqueada enquanto pendente; múltiplas Requests PODEM coexistir.

**PD-006 — Garantia e vinculação.** Créditos em Garantia ficam indisponíveis para outras operações e não têm validade prorrogada; somente lotes válidos até a expiração prevista da Request PODEM lastreá-la. Recusa, expiração, retirada pré-aceite, perda de elegibilidade ou confirmação concorrente liberam os Créditos e revertem integralmente o Fee. O primeiro aceite que passar pela revalidação final confirma a operação. Após o aceite, cancelamento segue a política aplicável e não desfaz unilateralmente os Créditos originados ao cedente.

**PD-007 — Snapshot da Request.** PRL, Créditos necessários e Fee apresentados no envio permanecem vinculados à Request até seu encerramento. Esta é decisão de produto com efeito econômico, e não derivação da BR-182: a BR-182 é silente sobre operação pendente. Ela existe porque o PD-005 cobra o Fee antecipadamente, e não se cobra para depois alterar o preço.

**PD-008 — Consumo de Créditos.** Primeiro o lote de expiração mais próxima; em empate, o de originação mais antiga.

**PD-009 — Política comercial de cancelamento e no-show.** Request aceita, Direct, Luxplus e locação externa só PODEM operar com política vigente e versionada aplicável ao mecanismo. Na Request a política é exibida e aceita **antes do envio**, porque o aceite do cedente PODE tornar a operação vinculante; nos demais mecanismos, antes da confirmação. A política fica vinculada à operação e define prazo e efeitos sobre capacidade, Créditos, Fee, valores monetários e remuneração. Seus valores e regras são configuração comercial versionada. Sem política vigente, a operação não avança ao respectivo compromisso.

**Limite do espaço de configuração.** Nenhuma política PODE contrariar a BR-163 — devolução à origem econômica imediatamente anterior — nem qualquer invariante da seção 5, em especial o INV-2. Configuração comercial não contorna regra estrutural (BR-360, BR-361). As políticas são pré-requisito de operação, não de implementação: sem elas o produto funciona, mas nenhuma operação desses quatro mecanismos confirma.

**PD-010 — Exceção extraordinária.** Manutenção emergencial, segurança, sinistro, caso fortuito ou força maior colocam a operação afetada em tratamento de exceção. O produto não transfere capacidade à Luxtory nem cria restituição, Crédito, indenização ou compensação não previstos; aplica a política vigente e permite resolução administrativa auditável.

**PD-011 — Auditabilidade funcional.** Toda ação econômica ou que altere inventário DEVE permitir comprovar ator, papel, data e hora, objeto e autorização ou base. Sorteios DEVEM permitir comprovar participantes, método ou insumo de aleatoriedade e resultado. O `03` define como registrar e proteger essas evidências.

## 4. Atores, permissões e auditabilidade

**REQ-010 \[BR-005, BR-150\]** — Owner e Co-Owner são papéis distintos. Regras dirigidas ao Titular aplicam-se a ambos, salvo exceção expressa no `01`.

**REQ-011 \[BR-140 a BR-147, PD-001\]** — Permissões são avaliadas pelo papel exercido em cada Residence, e o Membership é verificado no instante da ação.

**REQ-012 \[BR-261, BR-330 a BR-332\]** — Convidado e locatário externo não recebem direitos patrimoniais, Ação, Membership autônomo, Direito de Uso recorrente nem Créditos.

**REQ-013 \[BR-181, BR-360, BR-361\]** — Admin opera apenas ações e parâmetros autorizados; somente o Super Admin altera PRL já publicado.

**REQ-014 \[BR-010 a BR-015, BR-042, BR-043, BR-303, BR-310\]** — Brand Partner, Investor e parceiros só agem dentro de autorização registrada. Existir no modelo de negócio não concede acesso ao software.

**REQ-015 \[BR-161, BR-375, PD-011\]** — Ações econômicas, movimentos de inventário, exceções e intervenções administrativas DEVEM ser auditáveis.

| Ação | Owner | Co-Owner | Condição principal |
| --- | --- | --- | --- |
| Uso próprio | Sim | Sim | Independe de Membership |
| Depósito Luxchange | Sim | Sim | Membership; Co-Owner cede data já reservada |
| Request e Direct | Sim | Sim | Membership |
| Luxplus | Sim | Sim | Membership |
| Locação pelo canal Luxtory | Sim | Sim | Membership; capacidade elegível |
| Indicar convidado | Sim | Sim | Responsabilidade do Titular |
| Selecionar capacidade Luxtory | Não | Não | Admin |
| Alterar PRL publicado | Não | Não | Super Admin |

## 5. Invariantes

Nenhuma jornada, parâmetro ou ação administrativa PODE violá-los. São verificáveis a qualquer instante.

**INV-1 \[BR-165\]** — Uma data-Residence não possui duas reservas confirmadas.

**INV-2 \[BR-270\]** — Uma data-Residence não gera dois benefícios econômicos incompatíveis.

**INV-3 \[BR-161\]** — Toda data no Inventário Luxtory tem exatamente uma das três origens autorizadas. Nenhuma outra.

**INV-4 \[BR-080 a BR-082, BR-120, BR-122\]** — Em cada configuração e categoria sazonal, a soma dos limites dos Co-Owners com a capacidade Luxtory **iguala exatamente** a capacidade ordinária: folga zero. Cada Co-Owner permanece limitado à sua própria parcela, avaliada por categoria e sem compensação entre elas; reserva acima do limite individual é bloqueada ainda que exista capacidade ociosa de outro Co-Owner.

**INV-5 \[BR-075\]** — Direito de Uso não utilizado não sobrevive ao exercício.

**INV-6 \[BR-190, BR-192\]** — Todo Crédito tem lote de originação identificável; não há movimentação fora dos mecanismos autorizados.

**REQ-016 \[D\] \[INV-4, BR-122\]** — Como a Luxtory abre por último e o agregado tem folga zero, a capacidade dela só se preserva pelo bloqueio duro do limite individual de cada Co-Owner. A seleção da Luxtory é direito a quantitativo por categoria, não escolha garantida de datas.

## 6. Concept, Edition, Residence e aquisição

**REQ-020 \[BR-001 a BR-004\]** — Residence Concept, Residence Edition e Residence permanecem objetos distintos e corretamente vinculados. Nenhuma Residence sem Concept aprovado; nenhuma oferta comercial sem Edition.

**REQ-021 \[BR-010 a BR-015, BR-017 a BR-025\]** — O produto identifica versão e elementos essenciais do Concept, registra as aprovações aplicáveis, diferencia personalização permitida de não conformidade material, aplica as suspensões autorizadas pela BR-020 sem alterar direitos patrimoniais nem reservas confirmadas de terceiros, e impede novos usos de marca após o encerramento da parceria, preservando os direitos sobreviventes registrados. Cada Residence permanece vinculada à versão do Concept de sua aprovação comercial.

**REQ-022 \[BR-030 a BR-033\]** — Interesse PODE existir antes da Edition; oferta comercial não. A Edition PODE permanecer Owner, Co-Owner ou ambas enquanto a estrutura estiver aberta; após a formalização, mudança não ocorre por simples configuração administrativa.

**REQ-023 \[BR-040 a BR-043\]** — O produto PODE registrar origem da demanda e parceiros autorizados, sem criar prerrogativas adicionais.

**REQ-024 \[BR-050 a BR-054\]** — Jornada Owner: Concept → interesse e região → qualificação → Edition e oferta → formalização com um único adquirente. Interesse não constitui aquisição. A formalização ativa propriedade integral e capacidade econômica e de uso, respeitados compromissos válidos. O modelo atual não admite retrofit, adaptação ou imóvel preexistente.

**REQ-025 \[BR-060 a BR-065\]** — Jornada Co-Owner: Concept → região e necessidade aproximada de dias → qualificação → agrupamento pela Luxtory → definição da configuração → formalização. Dias informados antes da formalização são preferência comercial, jamais direito adquirido, e o produto não os oferece como produto comprável. Somente a formalização cria Ação e Direito de Uso.

**REQ-026 \[BR-070 a BR-073, BR-076, BR-077\]** — Ação, Direito de Uso, reserva e Crédito permanecem objetos distintos. Ações e Direitos de Uso são equivalentes entre os Co-Owners da mesma Residence; administração profissional é obrigatória; despesas seguem a Ação ou regra válida da SPE; adota-se exatamente uma configuração canônica do `01`, imutável por parametrização.

**REQ-027 \[BR-310 a BR-314\]** — O Investor exige autorização registrada, PODE desenvolver antes do adquirente final e comercializar como Owner, Co-Owner ou ambas enquanto a estrutura estiver aberta. Sua margem permanece economicamente própria e o adquirente final segue as mesmas regras Luxtory.

### 6.1. Jornada Brand Partners

**REQ-028 \[BR-010, BR-015, BR-040, BR-041, BR-374\]** — A jornada pública Brand Partners possui Home em
`/brand-partner` e Como funciona em `/brand-partner/como-funciona`, com navegação B2B própria e sem links para
a jornada B2C. O CTA **“Explore o potencial residencial da sua marca.”** leva ao formulário da Home
(`/brand-partner#conversa`). A comunicação segue o Framework Brand Partners, dentro dos limites deste documento
e do `01`. A página pública de Concepts depende de exposição autorizada e não bloqueia essas duas páginas nem
o formulário.

O formulário solicita Nome, Marca, E-mail e Mensagem obrigatórios; Site da marca é opcional. Não solicita CNPJ,
telefone, faturamento, orçamento ou documentos. Envia a solicitação à caixa corporativa da Luxtory, com estados
acessíveis de validação, envio, sucesso e erro. O sucesso significa aceite do envio pelo provedor, não entrega
garantida na caixa nem aprovação comercial. Em falha, o visitante pode corrigir ou tentar novamente, sem perder
os dados da tela; não se afirma sucesso sem aceite.

A submissão inicia conversa ou qualificação estratégica: não constitui parceria, autorização de uso de marca,
aquisição, promessa de lançamento, criação de conta ou cadastro de Brand Partner. Não cria CRM, histórico de
contatos ou dashboard de leads na aplicação. O propósito comunicado é: **“Os dados enviados são utilizados para
responder à solicitação e avaliar uma possível parceria com a Luxtory.”** Não há consentimento de marketing
presumido nem uso de marketing autorizado por essa submissão. O tratamento pelo serviço de envio e pela caixa
corporativa permanece sujeito a acesso e retenção definidos operacionalmente antes do go-live e à validação
jurídica aplicável. Esses parâmetros não impedem a implementação técnica.

**REQ-029 \[BR-010, BR-015, BR-021, BR-022, BR-025\]** — O Portal Brand Partner é capacidade planejada do produto,
fora da BP1. Permitirá a representantes autenticados e autorizados consultar, somente em leitura, informações
pertinentes à própria parceria: vendas/aquisições atribuíveis à marca, seus Concepts e Editions relevantes.
Outros indicadores exigem fonte canônica real e autorização funcional. Não autoriza métricas financeiras,
royalties ou settlement nesta entrega.

A BP2 só entra em implementação quando existirem: Brand Partner real com necessidade concreta; definição
canônica do evento de venda/aquisição (unidade, data e estados relevantes); fonte verificável e integrada;
regra de atribuição à marca; campos visíveis definidos, inclusive eventual exposição necessária de dados do adquirente;
representação do usuário perante a parte e a Brand Partner; autorização e revogação; e isolamento entre marcas
especificado de forma testável. Os controles devem ser comprovados antes de disponibilizar o portal.
Fonte ausente ou indisponível é apresentada como **“dados indisponíveis”**, nunca como “zero vendas”.
O acesso respeita REQ-014 e os direitos sobreviventes aplicáveis; não decorre do envio do formulário.

## 7. Direito de Uso, calendário e capacidade

**REQ-030 \[BR-074 a BR-083, PD-003\]** — Direito de Uso é controlado por ano civil e saldo não utilizado não acumula. Os limites Alta/Super Alta e Média/Baixa são separados e não intercambiáveis. Cada data é classificada em uma das duas categorias; a janela de Carnaval segue o PD-003.

**REQ-031 \[BR-090 a BR-095, PD-004\]** — 29 de fevereiro é capacidade extraordinária da SPE, classificada Média/Baixa, fora dos limites ordinários e da capacidade ordinária da Luxtory, com rotação própria fixada na primeira ocorrência posterior ao início da operação e que nunca se rederiva da rotação ordinária. Reserva que o inclua consome o direito extraordinário, mas a data conta para o limite de permanência e para a adjacência.

**REQ-032 \[BR-100 a BR-106, PD-011\]** — A ordem inicial resulta de sorteio auditável, rotaciona conforme o `01` e aplica cumulativamente suas datas e intervalos de abertura. A janela gera vantagem temporal, não exclusividade sobre datas, e a posição nunca é usada como penalidade nem alterada por plano de Membership.

**REQ-033 \[BR-107 a BR-109\]** — O primeiro exercício parcial usa apenas datas futuras disponíveis e a distribuição definida pela Residence Edition, preservando igualdade de Direito de Uso e distribuição sazonal equivalente. Se a formalização ocorrer após a abertura ordinária, a ordem sorteada aplica-se imediatamente, com os intervalos do `01` contados da formalização. **Nenhuma fórmula proporcional é presumida**: a BR-107 atribui essa definição à Edition.

**REQ-034 \[BR-110 a BR-112, PD-002\]** — Reserva de Direito de Uso respeita mínimo, máximo e adjacência do `01`; reservas contíguas do mesmo Co-Owner na mesma Residence contam como permanência única. Períodos que cruzem categorias ou exercícios são validados data a data contra os respectivos saldos e janelas. Uso próprio não exige Membership.

**REQ-035 \[D\] \[BR-111\]** — O limite de permanência é regra do Direito de Uso e não se estende a Request, Direct, Luxplus ou locação, que o `01` não limita.

**REQ-036 \[BR-120 a BR-122\]** — A Luxtory abre após a última posição Co-Owner, no intervalo do `01`, seleciona sua capacidade dentro dos limites sazonais e identifica a finalidade autorizada de cada data selecionada. Manutenção programada consome essa capacidade e só é agendável a partir dessa janela.

**REQ-037 \[BR-052, BR-151\]** — O Owner controla sua capacidade própria disponível e não comprometida, sem rotação, janelas ou capacidade reservada à Luxtory.

**REQ-038 \[BR-130 a BR-132\]** — Administração integral é opcional para o Owner; Property Services são contratáveis à parte; a participação da Residence no Club depende de conformidade registrada.

**REQ-039 \[BR-162\]** — Capacidade ainda não reservada permanece coletiva da SPE e disponível aos demais Co-Owners, dentro de seus limites, até o encerramento do exercício.

## 8. Inventário e disponibilidade

**REQ-040 \[BR-160 a BR-163\]** — Inventário Central e Inventário Luxtory são distintos. O Inventário Luxtory recebe somente as origens autorizadas, cada entrada com origem, autorização e tratamento econômico identificáveis; sem os três, a entrada é recusada. Capacidade Co-Owner não reservada permanece coletiva da SPE. Cancelamento, reversão ou liberação retorna a capacidade à origem econômica imediatamente anterior, salvo exceção expressa.

**REQ-041 \[D\] \[BR-161, BR-250, BR-257\]** — Capacidade autorizada para locação externa é pool distinto e **não** integra o Inventário Luxtory: a BR-161 esgota as origens admitidas e não a inclui. A Luxtory atua como canal; a titularidade econômica permanece do Titular.

**REQ-042 \[BR-164 a BR-167\]** — Capacidade PODE ser exibida em vários canais antes da confirmação; exibição, oferta, autorização e Request pendente não são reserva. Uma mesma capacidade não possui reservas confirmadas incompatíveis e, confirmada uma, deixa de estar disponível aos demais usos incompatíveis no mesmo ato.

**REQ-043 \[BR-170, BR-171\]** — Capacidade voluntariamente oferecida PODE ser retirada até constituir Crédito, reserva confirmada ou outro compromisso vinculante.

## 9. Membership, PRL e Carteira

**REQ-050 \[BR-140 a BR-149, BR-320, BR-321, PD-001\]** — Membership é único por CPF/CNPJ e individualiza os vínculos Owner e Co-Owner. Planos PODEM alterar condições comerciais e prioridade apenas sobre o Inventário Luxtory, nunca propriedade, Ação, Direito de Uso ou rotação. Membership, Taxa de Administração e despesas são independentes: a Taxa é obrigatória no Co-Owner e opcional no Owner; despesas são integrais no Owner e rateadas no Co-Owner. Suspensão e encerramento produzem efeitos prospectivos e preservam compromissos já constituídos.

**REQ-051 \[BR-146, BR-147, BR-150, BR-151\]** — Owner e Co-Owner seguem as mesmas regras do Club salvo diferença expressa no `01`. O Owner cede capacidade própria disponível; o Co-Owner só cede, deposita ou monetiza data previamente reservada de seu Direito de Uso. Depósito, Request, Direct, Luxplus e locação pelo canal Luxtory exigem Membership elegível vigente; uso próprio não.

**REQ-052 \[BR-180 a BR-182, PD-007\]** — O PRL é aplicado por data e somado por período. Alterações são prospectivas: operações já originadas ou confirmadas preservam o PRL que as formou, e Request pendente preserva o snapshot do PD-007. O PRL utilizado permanece funcionalmente associado à operação. Data sem PRL aplicável não é ofertável em mecanismo que o utilize.

**REQ-053 \[BR-190 a BR-196, PD-006, PD-008\]** — Créditos são unidade operacional interna, não financeira: a Carteira não os apresenta como dinheiro, investimento ou saldo resgatável, nem permite venda, cessão ou transferência. A Carteira identifica lote, origem, quantidade, fato gerador e validade. Suspensão ou encerramento do Membership não extingue Créditos nem pausa validade, mas impede seu uso enquanto o Membership não for elegível; a reativação antes da expiração restabelece o saldo ainda válido. Vencido o prazo, o lote deixa de ser utilizável.

**REQ-054 \[D\] \[BR-190\]** — O extrato registra cada movimento com data, tipo, quantidade, lote afetado e operação de origem.

## 10. Luxchange

**REQ-060 \[BR-151, BR-200 a BR-203\]** — O Owner deposita capacidade própria disponível; o Co-Owner, somente data já reservada. Respeitada a antecedência do `01`, a originação dos Créditos e a entrada da capacidade no Inventário Luxtory constituem o mesmo resultado funcional. O dia depositado pelo Co-Owner **permanece consumido** de seu Direito de Uso: a contraprestação são os Créditos, não a devolução do saldo. Uso posterior pela Luxtory não gera nova remuneração ao cedente.

**REQ-061 \[BR-151, BR-210, BR-211\]** — A rota é determinada pela titularidade: capacidade elegível de outro Titular fora do Inventário Luxtory → Request; capacidade já no Inventário Luxtory → Direct. O detentor PODE aceitar ou recusar, sem aceite automático ou tácito; o solicitante nunca aceita a própria Request.

**REQ-062 \[BR-230 a BR-232, PD-005 a PD-007\]** — Para enviar Request aplicam-se prazo, Créditos em Garantia, pagamento antecipado do Fee e snapshot econômico definidos nos PDs. O Fee é monetário, devido pelo solicitante e apresentado separadamente dos Créditos.

**REQ-063 \[BR-164 a BR-167, PD-005, PD-006\]** — Request pendente não constitui reserva nem bloqueia capacidade. Múltiplas Requests PODEM coexistir; a confirmação válida de uma encerra as concorrentes, sem penalidade a nenhum solicitante.

**REQ-064 \[BR-212 a BR-214, PD-006\]** — No aceite, o produto revalida capacidade, Membership de ambos os Titulares, garantia e demais condições. Válidas, confirma cessão e reserva, consome os Créditos em Garantia e origina Créditos ao cedente com data de originação própria. Recusa, expiração, perda de elegibilidade ou encerramento pré-aceite não constituem cessão nem reserva e liberam as garantias conforme o PD-006.

**REQ-065 \[BR-220, BR-221, BR-230 a BR-232\]** — O Direct dispensa aceite de terceiro, exige Membership e Créditos suficientes e só confirma após validação e pagamento do Fee aplicável.

**REQ-066 \[D\] \[BR-165, BR-220, BR-240\]** — Direct e Luxplus disputam o mesmo Inventário Luxtory; a mesma data não é confirmada nos dois canais.

## 11. Luxplus e locação externa

**REQ-070 \[BR-240 a BR-245, PD-009\]** — O Luxplus usa somente Inventário Luxtory, exige Membership, independe de saldo de Créditos e usa o PRL como referência, com preço congelado na compra. A receita pertence à Luxtory; capacidade previamente cedida em troca de Créditos não gera nova remuneração ao cedente.

**REQ-071 \[BR-250 a BR-256, PD-009\]** — O Owner escolhe expressamente as datas próprias que monetiza; Membership não transfere automaticamente capacidade ociosa. Com Membership vigente, a comercialização ocorre pela Luxtory ou por canais e operadores autorizados, e a receita líquida pertence ao Owner após as deduções aplicáveis. Sem Membership, PODE operar independentemente, sem uso comercial das marcas e da rede salvo autorização. As obrigações de preservação do Concept e as restrições que sobrevivam contratualmente permanecem registradas e ativas em qualquer dos casos.

**REQ-072 \[BR-257 a BR-261, PD-009\]** — O Co-Owner só monetiza data já reservada, disponível e sem compromisso incompatível, por mecanismos e canais autorizados. A receita líquida pertence ao Co-Owner após deduções; o dia locado permanece consumido do Direito de Uso e não gera Créditos; o locatário não adquire direitos recorrentes.

**REQ-073 \[BR-270\]** — A mesma capacidade não gera benefícios econômicos incompatíveis simultaneamente.

## 12. Cancelamento, no-show e exceções

**REQ-080 \[BR-280 a BR-284\]** — Uso próprio Co-Owner: cancelamento tempestivo devolve cada data ao respectivo limite sazonal do mesmo exercício; tardio e no-show mantêm o consumo, e a consequência é exibida antes de confirmar o cancelamento. A classificação como tempestivo ou tardio é determinada no momento do cancelamento e permanece associada à reserva, sem reclassificação posterior. Em período parcialmente iniciado, apenas a capacidade futura é recuperável e PODE integrar o Inventário Luxtory, sem devolver Direito de Uso nem gerar Créditos ou remuneração.

**REQ-081 \[D\] \[BR-163, BR-283\]** — A BR-283 está na seção do Direito de Uso Co-Owner e **não alcança o Owner**: cancelamento e no-show do Owner devolvem a capacidade a ele, pela BR-163. Registrado por extenso porque a BR-161 menciona capacidade recuperada sem restringir a modalidade.

**REQ-082 \[PD-009\]** — Request aceita, Direct, Luxplus e locação aplicam a política versionada vinculada à operação. O produto bloqueia a confirmação sem política aplicável e não cria tratamento econômico por default.

**REQ-083 \[BR-123, PD-010\]** — Indisponibilidade extraordinária é tratada como exceção auditável, sem transferência econômica nem compensação automática não prevista.

## 13. Inadimplência, convidados, transferência e Design & Build

**REQ-090 \[BR-290 a BR-298\]** — A inadimplência **PODE** suspender novas reservas e mecanismos do Club conforme os instrumentos aplicáveis; não é automática pela simples existência de débito, e reservas confirmadas permanecem. A comercialização de Direito de Uso exige autorização expressa registrada sobre débito vencido e exigível, limita-se ao exercício atual, aos saldos e limites disponíveis e ao necessário ao débito, e não gera Créditos ao inadimplente. A receita líquida quita primeiro débitos e custos; o excedente pertence ao Co-Owner; quitado o débito, a autorização cessa e o acesso é restabelecido. A posição na rotação nunca é afetada.

**REQ-091 \[BR-300, BR-301, BR-303\]** — O produto preserva o vínculo da Residence à versão do Concept, a conformidade exigida e as autorizações dos parceiros de execução. Gestão detalhada de obra não é requisito obrigatório deste `02`.

**REQ-092 \[BR-330 a BR-332\]** — O Titular PODE indicar convidado conforme as regras da Residence, parametrizáveis por Residence. O convidado não adquire direitos, a indicação não consome Direito de Uso adicional e o Titular permanece responsável. A indicação não é canal de monetização e não substitui os canais autorizados.

**REQ-093 \[BR-340 a BR-346\]** — A transferência preserva compromissos, reservas futuras e obrigações de preservação do Concept. O Owner não transfere automaticamente Membership nem direitos pessoais. No Co-Owner, o adquirente adere às regras aplicáveis e recebe a Ação, o Direito de Uso remanescente do exercício e as posições e histórico das rotações ordinária e bissexta associadas à Ação.

**REQ-094 \[BR-016, BR-302, BR-350 a BR-352, BR-360, BR-361\]** — Remuneração da Brand Partner, margem do Investor, Design & Build, Membership, administração e demais receitas permanecem economicamente separadas conforme o `01`, e nenhum relatório as consolida como receita única. Valores ausentes não são inventados: campo sem valor bloqueia a função que depende dele. Parâmetros só variam dentro da autoridade e da Business Rule que os originam, e nenhuma combinação PODE quebrar um invariante da seção 5.

## 14. Admin, estados, notificações e erros

**REQ-095 \[BR-143, BR-181, BR-232, BR-360, BR-361, PD-009 a PD-011\]** — O Admin opera apenas Concepts, Editions e Residences, formalizações, calendário e rotações, Membership, parâmetros autorizados, Inventário, mecanismos do Club e locação, inadimplência, transferências, conformidade, políticas vigentes e exceções autorizadas. A alteração de PRL publicado permanece exclusiva do Super Admin. Todo parâmetro tem autoridade, histórico e vigência.

**REQ-096 \[BR-191, BR-196, BR-214, BR-280 a BR-282, BR-320, BR-321, PD-005 a PD-010\]** — Estados mínimos:

| Objeto | Estados |
| --- | --- |
| Residence Concept | Não aprovado · Aprovado (versão N) |
| Membership | Vigente · Suspenso · Encerrado |
| Crédito | Disponível · Em Garantia · Consumido · Expirado · Indisponível por Membership |
| Request | Pendente · Aceita · Recusada · Expirada · Cancelada pré-aceite |
| Reserva | Confirmada · Em uso · Concluída · Cancelada · No-show · Em exceção |

Estados adicionais só existem quando necessários à jornada e nunca criam consequência econômica nova.

**REQ-097 \[BR-092, BR-100, BR-103, BR-191, BR-210 a BR-214, BR-290, BR-340 a BR-346, PD-005 a PD-011\]** — Notificar o ator afetado sobre: abertura da elegibilidade anual e resultado do sorteio; direito ao 29 de fevereiro no exercício; confirmação, cancelamento ou exceção de reserva; Request recebida e seu resultado; entrada e saída de Créditos em Garantia; pagamento e reversão do Fee; originação e expiração próxima de lotes; mudança de elegibilidade do Membership; suspensão e regularização por inadimplência; transferência concluída. Notificações de calendário e uso próprio alcançam também Titular sem Membership. Notificação não cria direito, prazo nem consequência econômica própria.

**REQ-098 \[BR-103 a BR-112, BR-146, BR-165, BR-166, BR-195, BR-352, PD-005 a PD-010\]** — Operação recusada informa causa funcional clara: permissão; elegibilidade ou disponibilidade da capacidade; janela não aberta; saldo ou limite sazonal; duração ou adjacência; Membership; Créditos ou garantia; pagamento; política ou parâmetro obrigatório ausente; conflito com reserva confirmada. Códigos técnicos pertencem ao `03`.

## 15. Edge cases obrigatórios

Tratados sem criar regra econômica nova:

1. período atravessando categorias sazonais ou exercícios;
2. reservas adjacentes que juntas excedam a permanência máxima;
3. janela de Carnaval colidindo com janeiro ou com 29 de fevereiro;
4. 29 de fevereiro dentro do período solicitado, e 29 de fevereiro não utilizado pelo contemplado;
5. Co-Owners esgotando seus limites antes da abertura da janela Luxtory;
6. Créditos próximos da expiração ao entrar em Garantia;
7. Membership ou capacidade perdendo elegibilidade durante Request pendente;
8. múltiplas Requests sobre a mesma capacidade;
9. alteração de PRL durante Request pendente;
10. cancelamento tardio ou no-show após início parcial do período;
11. transferência com reservas e compromissos futuros;
12. bloqueio extraordinário sobre reserva confirmada;
13. Residence suspensa por não conformidade com reservas de terceiros confirmadas.

Toda confirmação revalida as condições aplicáveis. Falhando qualquer uma, a operação não confirma e aplica apenas consequências já definidas no `01`, em PD ou em política vigente.

## 16. Guardrails e aceite transversal

**REQ-100 \[BR-373\]** — O Co-Owner é comunicado como Ação com Direito de Uso, nunca como compra de diárias. O produto não exibe preço por diária, pacote de diárias ou equivalente para Co-Owner. Interface, textos, DTOs e documentação seguem a terminologia do §1.

**REQ-101 \[BR-374\]** — O produto não promete rentabilidade, valorização, liquidez ou renda garantidas. Simulador de receita de locação, se existir, é rotulado como estimativa sem garantia.

**REQ-102 \[BR-375\]** — Nenhuma capacidade é exposta ou comercializada sem direito, autorização ou base válida registrada.

**REQ-103 \[BR-376\]** — A implementação não cria diferença econômica entre Owner e Co-Owner ausente do `01`. As diferenças expressas no `01` — entre outras, origem da capacidade elegível, Taxa de Administração, administração integral, rateio de despesas, canais de comercialização e consequências de cancelamento e inadimplência — permanecem válidas e são lidas do `01`.

**REQ-104 \[BR-380\]** — Nenhum fluxo, parâmetro ou implementação redefine Business Rule.

Uma funcionalidade só está pronta quando: implementa regra identificável; revalida pré-condições antes do compromisso; não permite confirmações incompatíveis nem benefício econômico incompatível; preserva a origem econômica nas reversões; respeita limites, rotações e Membership sem tocar em direitos patrimoniais; produz a auditabilidade exigida; trata cancelamento e exceção aplicáveis; e não transfere decisão de produto ao `03`.

## 17. Matriz BR → REQ

As 188 BRs do `01` v10.1, uma a uma. Serve como mecanismo de auditoria contra omissão e interpretação incorreta. `01-only` = Business Rule contratual sem comportamento adicional de software.

| BR | REQ | BR | REQ |
| --- | --- | --- | --- |
| BR-001 | REQ-020 | BR-182 | REQ-052 |
| BR-002 | REQ-020 | BR-190 | REQ-053, INV-6 |
| BR-003 | REQ-020 | BR-191 | REQ-053 |
| BR-004 | REQ-020 | BR-192 | REQ-053, 093, INV-6 |
| BR-005 | REQ-010 | BR-193 | REQ-053, 093 |
| BR-010 | REQ-021, 028, 029 | BR-194 | REQ-053, 093 |
| BR-011 | REQ-021 | BR-195 | REQ-053, 093 |
| BR-012 | `01-only` | BR-196 | REQ-053, 093 |
| BR-013 | REQ-021 | BR-200 | REQ-060 |
| BR-014 | REQ-021 | BR-201 | REQ-060 |
| BR-015 | REQ-021, 028, 029 | BR-202 | REQ-060 |
| BR-016 | REQ-094 | BR-203 | REQ-060 |
| BR-017 | REQ-021 | BR-210 | REQ-061 |
| BR-018 | REQ-021 | BR-211 | REQ-061 |
| BR-019 | REQ-021 | BR-212 | REQ-064 |
| BR-020 | REQ-021 | BR-213 | REQ-064 |
| BR-021 | REQ-021, 029 | BR-214 | REQ-064 |
| BR-022 | REQ-021, 029 | BR-220 | REQ-061, 065 |
| BR-023 | `01-only` | BR-221 | REQ-065 |
| BR-024 | REQ-021 | BR-230 | REQ-062, 065 |
| BR-025 | REQ-021, 029 | BR-231 | REQ-062, 065 |
| BR-030 | REQ-022 | BR-232 | REQ-062, 065, 095 |
| BR-031 | REQ-022 | BR-240 | REQ-070, 066 |
| BR-032 | REQ-022 | BR-241 | REQ-070 |
| BR-033 | REQ-022 | BR-242 | REQ-070 |
| BR-040 | REQ-023, 028 | BR-243 | REQ-070 |
| BR-041 | REQ-023, 028 | BR-244 | REQ-070 |
| BR-042 | REQ-023, 014 | BR-245 | REQ-070 |
| BR-043 | REQ-023, 014 | BR-250 | REQ-071, 041 |
| BR-050 | REQ-024 | BR-251 | REQ-071 |
| BR-051 | REQ-024 | BR-252 | REQ-071 |
| BR-052 | REQ-024, 037 | BR-253 | REQ-071 |
| BR-053 | REQ-024 | BR-254 | REQ-071 |
| BR-054 | REQ-024 | BR-255 | REQ-071 |
| BR-060 | REQ-025 | BR-256 | REQ-071 |
| BR-061 | REQ-025 | BR-257 | REQ-072, 041 |
| BR-062 | REQ-025 | BR-258 | REQ-072 |
| BR-063 | REQ-025 | BR-259 | REQ-072 |
| BR-064 | REQ-025 | BR-260 | REQ-072 |
| BR-065 | REQ-025 | BR-261 | REQ-072, 012 |
| BR-070 | REQ-026 | BR-270 | REQ-073, INV-2 |
| BR-071 | REQ-026 | BR-280 | REQ-080 |
| BR-072 | REQ-026 | BR-281 | REQ-080 |
| BR-073 | REQ-026 | BR-282 | REQ-080 |
| BR-074 | REQ-030 | BR-283 | REQ-080, 081 |
| BR-075 | REQ-030, INV-5 | BR-284 | REQ-080 |
| BR-076 | REQ-026 | BR-290 | REQ-090 |
| BR-077 | REQ-026 | BR-291 | REQ-090 |
| BR-080 | REQ-030, INV-4 | BR-292 | REQ-090 |
| BR-081 | REQ-030, INV-4 | BR-293 | REQ-090 |
| BR-082 | REQ-030, INV-4 | BR-294 | REQ-090 |
| BR-083 | REQ-030, 031 | BR-295 | REQ-090 |
| BR-090 | REQ-031 | BR-296 | REQ-090 |
| BR-091 | REQ-031 | BR-297 | REQ-090 |
| BR-092 | REQ-031, 097 | BR-298 | REQ-090 |
| BR-093 | REQ-031 | BR-300 | REQ-091 |
| BR-094 | REQ-031 | BR-301 | REQ-091 |
| BR-095 | REQ-031 | BR-302 | REQ-094 |
| BR-100 | REQ-032, 097 | BR-303 | REQ-091, 014 |
| BR-101 | REQ-032 | BR-310 | REQ-027, 014 |
| BR-102 | REQ-032 | BR-311 | REQ-027 |
| BR-103 | REQ-032, 097 | BR-312 | REQ-027 |
| BR-104 | REQ-032 | BR-313 | REQ-027, 094 |
| BR-105 | REQ-032 | BR-314 | REQ-027 |
| BR-106 | REQ-032 | BR-320 | REQ-050 |
| BR-107 | REQ-033 | BR-321 | REQ-050 |
| BR-108 | REQ-033 | BR-330 | REQ-092 |
| BR-109 | REQ-033 | BR-331 | REQ-092, 012 |
| BR-110 | REQ-034 | BR-332 | REQ-092 |
| BR-111 | REQ-034, 035 | BR-340 | REQ-093 |
| BR-112 | REQ-034 | BR-341 | REQ-093 |
| BR-120 | REQ-036, INV-4 | BR-342 | REQ-093 |
| BR-121 | REQ-036 | BR-343 | REQ-093, 071 |
| BR-122 | REQ-036, 016, INV-4 | BR-344 | REQ-093 |
| BR-123 | REQ-083 | BR-345 | REQ-093 |
| BR-130 | REQ-038 | BR-346 | REQ-093 |
| BR-131 | REQ-038 | BR-350 | REQ-094 |
| BR-132 | REQ-038 | BR-351 | REQ-094 |
| BR-140 | REQ-050 | BR-352 | REQ-094, 098 |
| BR-141 | REQ-050 | BR-360 | REQ-094, 095 |
| BR-142 | REQ-050 | BR-361 | REQ-094, 095 |
| BR-143 | REQ-050, 095 | BR-373 | REQ-100 |
| BR-144 | REQ-050 | BR-374 | REQ-101, 028 |
| BR-145 | REQ-050 | BR-375 | REQ-102, 015 |
| BR-146 | REQ-051, 011 | BR-376 | REQ-103 |
| BR-147 | REQ-050, 034 | BR-380 | REQ-104 |
| BR-148 | REQ-050 |  |  |
| BR-149 | REQ-050 |  |  |
| BR-150 | REQ-010, 051 |  |  |
| BR-151 | REQ-051, 060, 061, 072 |  |  |
| BR-160 | REQ-040 |  |  |
| BR-161 | REQ-040, 041, INV-3 |  |  |
| BR-162 | REQ-039, 040 |  |  |
| BR-163 | REQ-040, 081, PD-009 |  |  |
| BR-164 | REQ-042 |  |  |
| BR-165 | REQ-042, INV-1 |  |  |
| BR-166 | REQ-042 |  |  |
| BR-167 | REQ-042 |  |  |
| BR-170 | REQ-043 |  |  |
| BR-171 | REQ-043 |  |  |
| BR-180 | REQ-052 |  |  |
| BR-181 | REQ-052, 013 |  |  |

188 BRs mapeadas. Duas são contratuais e não geram requisito: **BR-012** (direitos preexistentes sobre metodologia e ativos próprios) e **BR-023** (direitos de transição e sobrevivência de licenças).

## 18. Prontidão

**Nenhum GAP aberto.** As duas decisões de negócio que restavam foram tomadas: o conteúdo das políticas de cancelamento é configuração comercial versionada (PD-009), e a transferência integral tem regra própria no REQ-093, derivada das BR-192 a BR-196.

O documento está completo, rastreável às 188 BRs, sem conteúdo técnico, sem valor duplicado do `01` e sem decisão empurrada para o `03`.

**Pré-requisito de operação, não de implementação.** Pelo PD-009, nenhuma operação de Request aceita, Direct, Luxplus ou locação confirma antes de existir política vigente e versionada para o mecanismo. O produto pode ser construído sem elas; não pode ser operado. Publicar essas políticas é tarefa comercial, anterior ao lançamento e independente do `03`.

**Sequência:** congelar o `02` nesta versão e abrir o `03 — Technical Spec` a partir dela. O `03` implementa REQ, INV e PD sem rediscuti-los; escolhas de persistência, meio de pagamento, concorrência e auditoria técnica são dele.

**Recorte BP0/BP1/BP2 (2026-10-09):** REQ-028 está definido para implementação na BP1. REQ-029 registra a
evolução planejada e não está pronto para implementação antes dos critérios de entrada. BP0 é documental;
não declara nenhum dos dois requisitos entregue em software. O restante do B2C permanece deliberadamente
pausado no roadmap, sem remover seu escopo normativo.
