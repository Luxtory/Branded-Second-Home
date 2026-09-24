# 01 — Business Model & Business Rules — Luxtory Branded Second Home

2026-09-19 · @Someone · Versão 10.1 — Status: final

## Finalidade

Este documento é a fonte canônica de verdade sobre o modelo de negócio da Luxtory Branded Second Home e suas Business Rules estruturais. Define o que o negócio é, quem participa, quais direitos existem, como a Luxtory monetiza e quais invariantes o produto deve respeitar.

Hierarquia documental: **01 Business Model & Business Rules → 02 Product Spec → 03 Technical Spec → Software.** Documentos e implementação de nível inferior NÃO PODEM redefinir este documento. Qualquer alteração de Business Rule exige atualização versionada do 01.

**Convenção normativa.** DEVE / NÃO DEVE: regra obrigatória. PODE: possibilidade permitida. Parâmetro: valor ou condição variável dentro de uma Business Rule. Valores identificados como atuais ou defaults NÃO devem ser tratados como regras imutáveis.

## 1. Modelo de negócio

A Luxtory desenvolve Branded Second Homes a partir do universo de marcas desejadas. A estrutura conceitual do modelo é:

**Brand Partner → Brand DNA → Residence Concept → Residence Edition → Owner ou Co-Owner → Design & Build → Residence → Luxtory Club**

A Brand Partner aporta identidade, lifestyle, desejo e comunidade. A Luxtory traduz esse universo em um Residence Concept replicável, suficientemente definido para ser implantado e comercializado. Ao longo do tempo, a Luxtory realiza Residence Editions, correspondentes a lançamentos comerciais de determinado Residence Concept. O cliente final pode adquirir a Residence integralmente, como Owner, ou em copropriedade, como Co-Owner. A Luxtory pode coordenar o Design & Build, administrar a Residence e integrá-la ao Luxtory Club.

**BR-001** — Residence Concept, Residence Edition e Residence são conceitos distintos.

**BR-002** — Um Residence Concept PODE originar múltiplas Residence Editions e múltiplas Residences em diferentes regiões.

**BR-003** — Toda Residence DEVE derivar de um Residence Concept aprovado.

**BR-004** — Toda oferta comercial de uma Branded Second Home DEVE estar vinculada a uma Residence Edition.

**BR-005** — Owner e Co-Owner são as duas modalidades de aquisição destinadas ao adquirente final.

## 2. Conceitos canônicos

| Conceito | Definição |
| --- | --- |
| Brand Partner | Marca parceira que aporta seu Brand DNA e autoriza seu uso no modelo Luxtory |
| Brand DNA | Identidade, códigos estéticos, valores, lifestyle, atributos e experiências da Brand Partner |
| Residence Concept | Conceito residencial replicável desenvolvido pela Luxtory a partir do Brand DNA |
| Residence Edition | Edição comercial de lançamento de determinado Residence Concept, associada a uma região, contexto e condições comerciais |
| Residence | Imóvel físico desenvolvido do zero a partir de um Residence Concept |
| Owner | Proprietário de 100% de uma Residence |
| Co-Owner | Acionista da SPE proprietária de uma Residence |
| Titular | Owner ou Co-Owner quando determinada regra se aplica a ambos |
| SPE | Sociedade de propósito específico constituída como S.A. fechada para uma Residence Co-Owner |
| Direito de Uso | Quantidade anual de dias de utilização atribuída a cada Co-Owner |
| Membership | Associação de um CPF ou CNPJ titular ao Luxtory Club |
| Luxtory Club | Rede de Residences, benefícios, serviços, intercâmbio e estadias adicionais |
| PRL | Preço de Referência da Luxtory atribuído a cada data de uma Residence |
| Crédito Luxchange | Unidade operacional interna utilizada no Luxchange |
| Inventário Central | Fonte única da disponibilidade física de cada Residence |
| Inventário Luxtory | Capacidade validamente atribuída ou cedida ao controle comercial da Luxtory |
| Investor | Agente autorizado pela Luxtory a financiar e/ou desenvolver uma Residence para posterior comercialização |

## 3. Brand Partner e Residence Concept

A Brand Partner permanece titular de sua marca, Brand DNA e demais ativos intelectuais preexistentes. A Luxtory estrutura a aplicação residencial desse universo por meio do Residence Concept e do respectivo plano estratégico de uso da marca.

**BR-010** — O plano estratégico de utilização da marca DEVE ser previamente aprovado pela Brand Partner.

**BR-011** — Depois de aprovado, a Luxtory PODE executá-lo dentro do escopo acordado; alterações materiais exigem nova aprovação.

**BR-012** — Os direitos preexistentes da Brand Partner permanecem preservados, assim como os direitos da Luxtory sobre sua metodologia e demais ativos próprios, observados os instrumentos aplicáveis.

**BR-013** — Todo Residence Concept DEVE possuir especificação suficiente para permitir implantação replicável e apresentação comercial.

**BR-014** — Cada Residence Concept DEVE identificar seus elementos essenciais e as premissas necessárias à preservação de sua identidade.

**BR-015** — A exploração e a replicação do Residence Concept dependem dos direitos de utilização da marca acordados entre Luxtory e Brand Partner. Toda exposição pública da marca, inclusive em canais externos, integra o plano estratégico da BR-010.

**BR-016** — A remuneração da Brand Partner é definida contratualmente e permanece separada das demais receitas Luxtory.

### 3.1. Preservação do Concept

**BR-017** — O Owner PODE personalizar elementos não essenciais do Residence Concept. Personalizar, sim. Descaracterizar, não.

**BR-018** — Alterações que afetem elementos essenciais dependem da governança de aprovação aplicável entre Luxtory e Brand Partner.

**BR-019** — Residence Co-Owner DEVE permanecer padronizada e NÃO admite personalização individual que descaracterize o produto compartilhado.

**BR-020** — Residence materialmente descaracterizada PODE ter suspensos sua participação nos mecanismos da rede, sua certificação de conformidade e o uso comercial das marcas relacionadas enquanto persistir a não conformidade, preservados seus direitos patrimoniais.

### 3.2. Encerramento da parceria com a Brand Partner

**BR-021** — O encerramento impede novos Residence Concepts, novas Residence Editions e novos usos da marca após sua eficácia, salvo disposição contratual diferente.

**BR-022** — O encerramento NÃO extingue automaticamente direitos necessários à conclusão ou continuidade de Residences já contratadas, vendidas ou em construção.

**BR-023** — Direitos de transição, sobrevivência de licenças e demais consequências são definidos contratualmente.

**BR-024** — Obrigações relativas à preservação física do Residence Concept e eventuais direitos ou restrições da Brand Partner sobre a expressão de seu Brand DNA na Residence NÃO decorrem exclusivamente do Membership e permanecem sujeitos aos instrumentos aplicáveis mesmo após seu encerramento.

### 3.3. Versionamento do Residence Concept

**BR-025** — Cada Residence permanece vinculada à versão do Residence Concept vigente na data de sua aprovação comercial. Alterações posteriores do Concept NÃO modificam automaticamente Residences já contratadas, vendidas ou construídas.

## 4. Residence Edition e formação da oferta

Residence Edition representa um lançamento comercial, e não o imóvel físico. A demanda PODE existir antes da criação formal de uma Edition.

**BR-030** — Manifestações de interesse PODEM ser captadas diretamente a partir do Residence Concept antes de existir uma Residence Edition correspondente.

**BR-031** — Quando a Luxtory identificar oportunidade e decidir realizar determinado lançamento, cria a Residence Edition correspondente, vinculando-a ao Residence Concept, região e condições comerciais aplicáveis.

A sequência comercial é: Residence Concept → manifestações de interesse → decisão de lançamento → Residence Edition → aquisição e estruturação → Residence.

**BR-032** — Uma Residence Edition PODE ser oferecida como Owner, Co-Owner ou, enquanto sua estrutura definitiva permanecer aberta, pelas duas alternativas autorizadas pela Luxtory.

**BR-033** — Depois da formalização definitiva de determinada estrutura de propriedade, eventual alteração exige reestruturação jurídica e comercial própria.

## 5. Go-to-market e replicação

O modelo é predominantemente orientado por demanda.

**BR-040** — A Brand Partner atua principalmente na geração de demanda por meio de seus canais e audiência.

**BR-041** — A Luxtory atua principalmente na qualificação, estruturação e conversão comercial dessa demanda.

**BR-042** — Residence Concepts PODEM ser replicados regionalmente com participação de parceiros locais autorizados pela Luxtory.

**BR-043** — Parceiros locais DEVEM respeitar o Residence Concept, os padrões Luxtory e os direitos da Brand Partner.

## 6. Jornada comercial Owner

O interessado em Owner seleciona um Residence Concept e sinaliza, entre outras informações comerciais, a região ou localização pretendida.

**BR-050** — A manifestação de interesse Owner NÃO constitui aquisição.

**BR-051** — A aquisição Owner PODE avançar com um único adquirente.

**BR-052** — O Owner adquire 100% da Residence e de sua capacidade econômica e de uso, ressalvados compromissos validamente assumidos.

**BR-053** — O modelo atual contempla exclusivamente Residences desenvolvidas do zero a partir de Residence Concepts.

**BR-054** — Retrofit, adaptação ou incorporação de imóveis preexistentes NÃO integram o modelo atual.

## 7. Jornada comercial Co-Owner

Na manifestação de interesse Co-Owner, o interessado informa a região desejada, a quantidade aproximada de dias anuais pretendida e os dados necessários à qualificação comercial.

**BR-060** — A quantidade de dias indicada nessa fase é uma preferência comercial, e NÃO um Direito de Uso adquirido.

**BR-061** — O Direito de Uso definitivo somente PODE corresponder a uma das configurações canônicas previstas neste documento.

**BR-062** — A Luxtory agrupa intenções considerando principalmente Residence Concept, região e necessidade aproximada de uso.

**BR-063** — A configuração da operação é definida pela Luxtory conforme a composição da demanda e a viabilidade comercial.

**BR-064** — Quando houver composição suficientemente compatível, a Luxtory entra em contato com os interessados para estruturar e formalizar a aquisição.

**BR-065** — Somente a formalização definitiva gera participação societária e Direito de Uso.

## 8. Modalidade Co-Owner

Cada Residence Co-Owner pertence a uma SPE constituída como S.A. fechada. A Luxtory NÃO é acionista da SPE.

**BR-070** — Participação societária, Direito de Uso, reserva e Crédito Luxchange são conceitos distintos.

**BR-071** — Todos os Co-Owners de uma mesma Residence possuem participação societária equivalente e Direito de Uso equivalente.

**BR-072** — A administração profissional da Residence é obrigatória no Co-Owner.

**BR-073** — As despesas próprias da Residence são rateadas conforme participação societária ou regra válida da SPE.

**BR-074** — O exercício ordinário do Direito de Uso corresponde ao ano civil.

**BR-075** — Direito de Uso não utilizado NÃO acumula automaticamente para o exercício seguinte.

### 8.1. Configurações canônicas

| Configuração | Participação por Co-Owner | Direito anual | Alta/Super Alta | Média/Baixa | Capacidade Luxtory |
| --- | --- | --- | --- | --- | --- |
| 10 Co-Owners | 10% | 35 dias | 10 | 25 | 15 dias: 3 alta + 12 média/baixa |
| 8 Co-Owners | 12,5% | 44 dias | 12 | 32 | 13 dias: 7 alta + 6 média/baixa |
| 4 Co-Owners | 25% | 88 dias | 24 | 64 | 13 dias: 7 alta + 6 média/baixa |
| 2 Co-Owners | 50% | 176 dias | 48 | 128 | 13 dias: 7 alta + 6 média/baixa |

**BR-076** — Toda Residence Co-Owner DEVE adotar exatamente uma dessas quatro configurações.

**BR-077** — Depois de formalizada a SPE, a configuração NÃO pode ser alterada por simples parametrização administrativa.

## 9. Temporadas e limites sazonais

**Alta/Super Alta:** janeiro, julho, dezembro e janela de Carnaval de 10 dias. Total ordinário: 103 dias.

**Média/Baixa:** demais datas do ano-base. Total ordinário: 262 dias.

**BR-080** — A divisão 103 / 262 constitui o padrão Luxtory para as configurações Co-Owner.

**BR-081** — As quantidades previstas na tabela de cada configuração representam limites máximos anuais por categoria de temporada, e não apenas referências distributivas.

**BR-082** — O Co-Owner NÃO PODE utilizar quantidade superior ao seu limite anual de Alta/Super Alta ou de Média/Baixa, ainda que possua saldo não utilizado na outra categoria. Os saldos das categorias NÃO são intercambiáveis.

**BR-083** — Ressalva-se da BR-082 a capacidade extraordinária de ano bissexto prevista na seção 10, que NÃO é computada nos limites ordinários.

## 10. Ano bissexto

As configurações ordinárias são estruturadas sobre 365 dias.

**BR-090** — O dia 29 de fevereiro constitui capacidade extraordinária da SPE e é classificado como Média/Baixa.

**BR-091** — O dia extraordinário NÃO altera permanentemente o Direito de Uso ordinário de nenhum Co-Owner nem a capacidade anual ordinária da Luxtory.

**BR-092** — O 29 de fevereiro possui rotação própria entre os Co-Owners, independente da ordem anual de abertura das reservas.

**BR-093** — Na primeira ocorrência de 29 de fevereiro posterior ao início da operação da Residence, a lista da rotação bissexta é fixada a partir da ordem ordinária vigente naquele exercício.

**BR-094** — Uma vez fixada, a lista bissexta NÃO se rederiva da ordem ordinária. A cada ano bissexto subsequente, o direito ao dia extraordinário avança uma posição nessa lista própria.

**BR-095** — Completado o ciclo, a rotação bissexta reinicia na mesma ordem.

## 11. Ordem rotativa de abertura das reservas

Cada Residence Co-Owner possui ordem rotativa anual de abertura do calendário. O ciclo corresponde à configuração: 10 Co-Owners, 10 exercícios; 8, oito; 4, quatro; 2, dois.

**BR-100** — A ordem inicial do primeiro ciclo é definida por sorteio auditável entre os Co-Owners após a formação da operação.

**BR-101** — A cada novo exercício, o primeiro da ordem anterior passa à última posição e todos os demais avançam uma posição.

**BR-102** — Ao final de um ciclo completo, cada Co-Owner terá ocupado todas as posições exatamente uma vez.

### 11.1. Abertura anual

A primeira posição abre em **15 de setembro do ano anterior**; cada posição seguinte abre **7 dias** depois da anterior.

**BR-103** — A abertura é cumulativa: iniciada a janela de um Co-Owner, ele permanece apto a reservar após a abertura dos seguintes.

**BR-104** — A janela inicial NÃO representa exclusividade sobre datas; representa somente vantagem temporal de acesso.

**BR-105** — Não realizar reserva durante a primeira janela NÃO causa perda do Direito de Uso.

**BR-106** — A posição na rotação NÃO pode ser utilizada como penalidade disciplinar.

### 11.2. Primeiro exercício

**BR-107** — Se a Residence iniciar sua operação após 1º de janeiro, o primeiro exercício será parcial. Antes da formalização da aquisição, a Residence Edition DEVE definir os Direitos de Uso iniciais de cada Co-Owner e a capacidade inicial da Luxtory com base exclusivamente nas datas ainda disponíveis, preservando igualdade de Direito de Uso e de distribuição sazonal entre os Co-Owners da mesma configuração.

**BR-108** — As alocações do primeiro exercício parcial NÃO podem incluir datas já transcorridas. A partir do exercício seguinte aplicam-se integralmente os limites da configuração canônica.

**BR-109** — No primeiro exercício, se a formalização definitiva ocorrer após a data ordinária de abertura aplicável, a ordem inicial definida por sorteio aplica-se imediatamente à capacidade disponível, observados os intervalos de 7 dias entre as posições.

## 12. Limites das reservas de Direito de Uso

**BR-110** — Reserva mínima: 1 dia.

**BR-111** — Uma permanência NÃO PODE ultrapassar 14 dias consecutivos.

**BR-112** — Reservas consecutivas ou adjacentes do mesmo Co-Owner são consideradas uma única permanência para aplicação do limite.

## 13. Capacidade reservada à Luxtory

A Luxtory NÃO recebe ações da SPE para possuir dias de uso. Sua capacidade deriva contratualmente da estrutura do produto.

**BR-120** — A capacidade anual da Luxtory segue os quantitativos estabelecidos na tabela das configurações.

**BR-121** — Essa capacidade PODE ser destinada a manutenção programada, marketing, promoção, produção institucional ou comercial e Inventário Luxtory.

**BR-122** — A Luxtory é sempre a última na ordem de abertura. Sua janela inicia 7 dias após a abertura da última posição Co-Owner, quando poderá selecionar sua capacidade anual reservada, preservados os quantitativos que lhe cabem em cada categoria de temporada.

**BR-123** — Bloqueio extraordinário por manutenção emergencial, segurança, sinistro, caso fortuito ou força maior NÃO transfere automaticamente à Luxtory o direito econômico correspondente à capacidade bloqueada.

## 14. Owner: administração e serviços

**BR-130** — A administração integral da Residence pela Luxtory é opcional para o Owner.

**BR-131** — A Luxtory PODE oferecer Property Services avulsos ao Owner, remunerados separadamente.

**BR-132** — A participação da Residence nos mecanismos do Luxtory Club exige conformidade com os padrões aplicáveis da Luxtory, ainda que o Owner não contrate administração integral.

## 15. Membership, Taxa de Administração e despesas

Membership, Taxa de Administração e despesas da Residence são conceitos independentes.

**BR-140** — O Membership é vinculado ao CPF ou CNPJ titular, e NÃO à quantidade de ações ou de Residences.

**BR-141** — Valor-base vigente do Membership: R$ 790 por ano por titular, sujeito aos planos e condições comerciais aplicáveis.

**BR-142** — A Luxtory PODE manter planos como Free, Gold e Platinum.

**BR-143** — Preços, benefícios, descontos e condições dos planos são parâmetros administráveis.

**BR-144** — O Membership NÃO altera propriedade, participação societária, Direito de Uso nem a ordem de abertura das reservas entre Co-Owners.

**BR-145** — O Membership PODE conceder condições comerciais ou prioridade diferenciada de acesso ao Inventário Luxtory, sem alterar prioridade patrimonial, Direito de Uso ou posição de calendário dos Co-Owners.

**BR-146** — O Membership vigente é condição de acesso aos mecanismos do Luxtory Club: Luxchange, Luxplus e locação pelo canal Luxtory.

**BR-147** — O uso próprio da Residence e o exercício do Direito de Uso pelo Titular independem de Membership.

**BR-148** — A Taxa de Administração remunera a gestão operacional da Residence. É obrigatória no Co-Owner e opcional no Owner.

**BR-149** — As despesas próprias da Residence são suportadas integralmente pelo Owner ou rateadas entre os Co-Owners conforme a estrutura societária aplicável.

## 16. Paridade Owner e Co-Owner no Luxtory Club

**BR-150** — Owner e Co-Owner estão sujeitos às mesmas regras dos mecanismos do Luxtory Club, salvo quando este documento estabelecer expressamente tratamento diferente em razão da modalidade de propriedade ou da origem da capacidade.

A diferença fundamental é a origem do direito: o Owner controla a capacidade integral da Residence; o Co-Owner controla a capacidade atribuída ao seu Direito de Uso.

**BR-151** — Para o Owner, capacidade elegível é sua capacidade própria disponível e não comprometida. Para o Co-Owner, capacidade elegível para cessão, Luxchange ou locação externa é exclusivamente a data já validamente reservada em seu Direito de Uso e ainda não comprometida com utilização incompatível.

## 17. Inventário e disponibilidade

O **Inventário Central** representa toda a capacidade física da Residence. O **Inventário Luxtory** representa apenas a capacidade validamente cedida ou atribuída ao controle comercial da Luxtory.

**BR-160** — Capacidade própria do Titular NÃO integra automaticamente o Inventário Luxtory.

**BR-161** — Toda entrada no Inventário Luxtory DEVE possuir origem, autorização e tratamento econômico identificáveis. Integram-no exclusivamente: a capacidade anual reservada à Luxtory quando destinada ao Inventário Luxtory; a capacidade cedida ou depositada via Luxchange; e a capacidade futura recuperada de cancelamento tardio ou no-show. Nenhuma outra origem PODE ser presumida.

**BR-162** — Capacidade Co-Owner ainda não reservada permanece capacidade coletiva da SPE e disponível para reservas posteriores dos Co-Owners, dentro dos respectivos saldos de Direito de Uso e limites sazonais, até o encerramento do exercício. NÃO entra automaticamente no Inventário Luxtory e NÃO acumula para o exercício seguinte.

### 17.1. Origem econômica

**BR-163** — Cancelamento, reversão ou liberação devolve a capacidade à sua origem econômica imediatamente anterior, salvo exceção expressamente prevista neste documento. Uso próprio Co-Owner cancelado tempestivamente retorna ao Direito de Uso; reserva sobre capacidade que já pertencia ao Inventário Luxtory retorna ao Inventário Luxtory.

### 17.2. Disponibilidade multicanal

**BR-164** — Uma mesma capacidade PODE ser exposta simultaneamente em múltiplos canais autorizados antes da confirmação de uma reserva.

**BR-165** — A mesma capacidade física e o mesmo período NÃO podem possuir mais de uma reserva confirmada.

**BR-166** — Confirmada uma reserva, a capacidade correspondente DEVE deixar de estar disponível em todos os usos incompatíveis.

**BR-167** — Oferta, autorização ou exibição de disponibilidade NÃO equivale a reserva confirmada.

## 18. Momento vinculante de uma cessão

**BR-170** — Uma disponibilidade voluntariamente oferecida pelo Titular PODE ser retirada enquanto ainda não tiver originado Créditos, reserva confirmada ou outro compromisso econômico incompatível.

**BR-171** — Depois de constituído um desses compromissos, a cessão torna-se vinculante na extensão necessária ao cumprimento da obrigação.

## 19. PRL — Preço de Referência Luxtory

Cada data de cada Residence possui um PRL. **PRL do período = soma do PRL das datas correspondentes.**

**BR-180** — O PRL constitui a principal referência econômica para Luxchange, Luxplus e Luxchange Fee.

**BR-181** — Depois de publicado, o PRL somente PODE ser alterado pela autoridade administrativa máxima da Luxtory, o Super Admin.

**BR-182** — Alterações de PRL produzem efeitos prospectivos e NÃO recalculam operações ou Créditos anteriormente originados ou confirmados.

## 20. Luxchange

O Luxchange permite ao Titular converter capacidade elegível em Créditos e utilizar Créditos para acessar estadias na rede.

**Créditos da data = PRL da data × 10.** O multiplicador é parâmetro administrável.

**BR-190** — O Crédito Luxchange é unidade operacional interna. NÃO constitui moeda, investimento, saldo financeiro, promessa de valorização, saldo resgatável em dinheiro nem garantia de disponibilidade específica.

**BR-191** — Créditos têm validade atual de 24 meses a partir de sua originação.

**BR-192** — Créditos NÃO podem ser livremente vendidos, cedidos ou transferidos a terceiros. Movimentações só ocorrem pelos mecanismos expressamente autorizados do Luxtory Club.

### 20.1. Membership e Créditos

**BR-193** — Suspensão ou encerramento do Membership NÃO extingue Créditos previamente originados.

**BR-194** — A validade original dos Créditos continua transcorrendo e NÃO é pausada pela ausência de Membership.

**BR-195** — Créditos somente podem ser utilizados enquanto o Titular possuir Membership elegível vigente.

**BR-196** — A reativação do Membership antes da expiração restabelece a utilização do saldo ainda válido.

## 21. Depósito no Luxchange

**BR-200** — Uma capacidade somente PODE ser depositada voluntariamente no Luxchange com antecedência mínima de 14 dias em relação ao início do período.

**BR-201** — Owner e Co-Owner recebem Créditos pela cessão de capacidade segundo a mesma lógica de PRL.

**BR-202** — Originados os Créditos, a capacidade correspondente integra o Inventário Luxtory e deixa de estar disponível ao Titular para usos incompatíveis.

**BR-203** — Os Créditos constituem a contraprestação econômica pela cessão. A utilização posterior da capacidade pela Luxtory NÃO gera nova remuneração automática ao cedente.

## 22. Luxchange Request

Request aplica-se quando a capacidade pretendida ainda pertence a outro Titular elegível e NÃO integra o Inventário Luxtory.

**BR-210** — O Titular detentor da capacidade PODE aceitar ou recusar a Request.

**BR-211** — O solicitante NÃO pode aceitar sua própria Request.

**BR-212** — Aceita a Request: a capacidade é cedida à operação, os Créditos necessários do solicitante são debitados e o cedente recebe Créditos correspondentes à capacidade cedida.

**BR-213** — Os Créditos recebidos pelo cedente possuem data própria de originação.

**BR-214** — Recusada ou expirada a Request, nenhuma cessão definitiva ou reserva correspondente é constituída.

## 23. Luxchange Direct

Direct aplica-se quando a capacidade pretendida já integra o Inventário Luxtory.

**BR-220** — Direct NÃO exige aceite de outro Titular no momento da reserva.

**BR-221** — A confirmação consome os Créditos necessários do solicitante.

## 24. Luxchange Fee

Parâmetro atual: **Luxchange Fee = maior entre 10% do PRL do período e R$ 120.**

**BR-230** — Request e Direct estão sujeitos ao Luxchange Fee, devido pelo solicitante.

**BR-231** — O Fee é monetário e NÃO se confunde com Créditos Luxchange.

**BR-232** — Percentual, mínimo e benefícios vinculados ao Membership são parâmetros administráveis.

## 25. Luxplus

O Luxplus permite que membros adquiram, em dinheiro, noites adicionais do Inventário Luxtory.

**Preço Luxplus = PRL do período × (1 − desconto aplicável).**

**BR-240** — Somente capacidade integrante do Inventário Luxtory PODE ser disponibilizada no Luxplus.

**BR-241** — O Luxplus independe do saldo de Créditos do comprador.

**BR-242** — A receita do Luxplus pertence à Luxtory.

**BR-243** — O PRL constitui sua referência de preço.

**BR-244** — Descontos, condições comerciais e prioridade sobre o Inventário Luxtory PODEM variar por Membership.

**BR-245** — Quando a capacidade foi cedida por um Titular em troca de Créditos, a contraprestação econômica já ocorreu. Sua posterior comercialização via Luxplus NÃO gera novo pagamento automático ao cedente.

## 26. Locação externa

A locação externa é economicamente distinta de Luxchange e Luxplus.

**BR-250** — O Owner PODE autorizar capacidade própria e disponível para locação ao público externo.

**BR-251** — Enquanto seu Membership estiver vigente, a comercialização das datas que o Owner decidir monetizar é exclusiva da Luxtory ou de canais e operadores autorizados por ela.

**BR-252** — O Membership NÃO transfere automaticamente à Luxtory todas as datas ociosas. O Owner continua escolhendo quais datas mantém para uso próprio e quais autoriza para comercialização.

**BR-253** — A receita líquida da locação pertence ao Owner, descontados gestão, comissões, tributos, taxas e demais custos aplicáveis.

### 26.1. Owner sem Membership

**BR-254** — Encerrado o Membership, o Owner PODE comercializar sua Residence independentemente da Luxtory.

**BR-255** — Nessa hipótese, o Owner perde o direito de utilizar comercialmente as marcas Luxtory e Brand Partner ou de apresentar a oferta independente como integrante oficial da rede, salvo autorização específica.

**BR-256** — O encerramento do Membership NÃO elimina obrigações permanentes de preservação do Residence Concept nem direitos ou restrições da Brand Partner que sobrevivam contratualmente.

### 26.2. Co-Owner

**BR-257** — O Co-Owner PODE autorizar capacidade elegível ainda disponível de seu Direito de Uso para locação externa.

**BR-258** — Essa locação DEVE ocorrer exclusivamente pelos mecanismos e canais autorizados pela Luxtory.

**BR-259** — O Co-Owner NÃO pode anunciar, sublocar, intermediar ou explorar autonomamente seu Direito de Uso fora desses mecanismos.

**BR-260** — A receita líquida correspondente pertence ao Co-Owner, descontados custos, taxas, gestão, comissões e tributos aplicáveis.

**BR-261** — O locatário externo NÃO adquire propriedade, participação societária, Membership, Direito de Uso recorrente nem Créditos Luxchange.

## 27. Distinção econômica dos mecanismos

| Mecanismo | Origem da capacidade | Benefício econômico principal |
| --- | --- | --- |
| Uso próprio | Capacidade do Titular | Utilização da própria Residence |
| Luxchange | Capacidade cedida | Créditos Luxchange |
| Luxplus | Inventário Luxtory | Receita Luxtory |
| Locação externa | Capacidade própria autorizada | Receita líquida do Titular |

**BR-270** — Uma mesma capacidade NÃO pode gerar simultaneamente benefícios econômicos incompatíveis.

## 28. Cancelamento e no-show do Direito de Uso Co-Owner

**BR-280** — Cancelamento com pelo menos 15 dias de antecedência devolve os dias ao Direito de Uso do Co-Owner naquele exercício, conforme disponibilidade para nova reserva.

**BR-281** — Cancelamento com menos de 15 dias mantém os dias consumidos do Direito de Uso.

**BR-282** — No-show mantém os dias correspondentes consumidos.

### 28.1. Capacidade futura recuperada

Considera-se capacidade futura recuperada a data ou parcela futura de um período cujo uso ainda não tenha se iniciado no momento em que o cancelamento tardio ou o no-show é formalmente constatado.

**BR-283** — Capacidade futura recuperada de cancelamento tardio ou no-show PODE integrar o Inventário Luxtory.

**BR-284** — Essa recuperação NÃO devolve o Direito de Uso ao Co-Owner e NÃO gera novos Créditos ou nova remuneração automática ao Titular. Constitui exceção expressa à BR-163.

## 29. Inadimplência

**BR-290** — A inadimplência PODE suspender novas reservas e o acesso aos mecanismos do Luxtory Club até sua regularização, conforme instrumentos aplicáveis.

### 29.1. Co-Owner

**BR-291** — A comercialização de capacidade do Direito de Uso por inadimplência somente PODE ocorrer quando houver autorização válida e expressa nos instrumentos societários ou contratuais aplicáveis.

**BR-292** — A regra aplica-se a débitos vencidos e exigíveis relacionados à Residence perante a SPE ou a Luxtory.

**BR-293** — Observada a BR-291, a Luxtory PODE reservar e comercializar capacidade disponível correspondente ao saldo remanescente do Direito de Uso do exercício do Co-Owner inadimplente, respeitados seus limites sazonais e as reservas já confirmadas, apenas na extensão necessária à amortização ou quitação dos débitos.

**BR-294** — Capacidade utilizada dessa forma NÃO gera Créditos ao Co-Owner inadimplente.

**BR-295** — A receita líquida obtida é destinada primeiramente aos débitos e custos aplicáveis, qualquer que seja o canal autorizado utilizado na comercialização.

**BR-296** — Eventual excedente líquido pertence ao Co-Owner.

**BR-297** — Satisfeito o débito, cessa a autorização de comercialização baseada naquela inadimplência.

**BR-298** — A regra NÃO autoriza automaticamente a utilização de Direitos de Uso de exercícios futuros, salvo base societária ou contratual expressa.

## 30. Design & Build

**BR-300** — A Luxtory PODE coordenar integralmente arquitetura, interiores, engenharia, fornecedores, construção, implantação e entrega.

**BR-301** — O Design & Build DEVE preservar o Residence Concept.

**BR-302** — O Design & Build constitui frente econômica distinta de Membership e da administração recorrente.

**BR-303** — Parceiros de execução DEVEM operar dentro dos padrões e autorizações aplicáveis da Luxtory e do Residence Concept.

## 31. Investor

O Investor NÃO constitui terceira modalidade de propriedade.

**BR-310** — O Investor somente PODE financiar ou desenvolver uma Residence baseada em Residence Concept mediante autorização prévia da Luxtory.

**BR-311** — O Investor PODE antecipar o desenvolvimento antes da existência do adquirente final.

**BR-312** — A Residence desenvolvida PODE ser posteriormente oferecida como Owner, Co-Owner ou pelas duas alternativas enquanto a estrutura definitiva permanecer aberta.

**BR-313** — O Investor PODE incorporar margem própria ao preço de comercialização, respeitadas as condições acordadas com Luxtory e Brand Partner.

**BR-314** — Todo adquirente final permanece sujeito às regras de aquisição, conformidade e relacionamento Luxtory.

## 32. Encerramento do Membership

**BR-320** — Suspensão, não renovação ou encerramento do Membership produz efeitos prospectivos.

**BR-321** — O encerramento NÃO desfaz automaticamente reservas já confirmadas, Créditos já originados, capacidade já cedida ou compromissos econômicos anteriormente constituídos. Esses compromissos permanecem sujeitos às regras correspondentes até conclusão, expiração ou reversão válida.

## 33. Convidados

**BR-330** — O Titular PODE permitir a utilização por convidados conforme as regras aplicáveis à Residence.

**BR-331** — O convidado NÃO adquire propriedade, participação societária, Membership autônomo, Direito de Uso recorrente nem Créditos.

**BR-332** — O Titular permanece responsável pelo uso realizado por seus convidados.

## 34. Transferência e continuidade

**BR-340** — A transferência da Residence Owner NÃO transfere automaticamente Membership ou direitos pessoais do antigo Owner.

**BR-341** — A transferência Co-Owner ocorre por meio da participação societária correspondente, permanece sujeita às regras da SPE e DEVE preservar a configuração canônica e a equivalência das participações, salvo reestruturação societária válida nos termos da BR-077.

**BR-342** — O novo Co-Owner DEVE aderir às regras necessárias ao exercício do Direito de Uso.

**BR-343** — A obrigação de preservação do Residence Concept acompanha a Residence conforme os instrumentos aplicáveis.

**BR-344** — A transferência NÃO extingue automaticamente reservas ou compromissos anteriormente constituídos.

**BR-345** — A transferência transmite ao adquirente o Direito de Uso remanescente do exercício, deduzido o já consumido ou comprometido pelo transmitente.

**BR-346** — As posições nas rotações ordinária e bissexta pertencem à participação societária correspondente, e não à pessoa do Co-Owner. Em caso de transferência, o adquirente assume as posições e o histórico rotativo associados à participação.

## 35. Revenue Model Luxtory

As fontes de monetização atualmente previstas incluem: Membership; Taxa de Administração; Design & Build; Property Services; Luxchange Fee; receita Luxplus; taxas e comissões de locação externa; e remuneração pela estruturação, desenvolvimento ou comercialização das Residences, quando aplicável.

**BR-350** — A remuneração da Brand Partner permanece contratualmente separada.

**BR-351** — A margem do Investor constitui economia própria do Investor e NÃO se confunde automaticamente com receita Luxtory.

**BR-352** — Valores ou percentuais que não estejam definidos neste documento NÃO devem ser inventados pela implementação.

## 36. Parametrização

Podem constituir parâmetros administráveis, conforme a autoridade aplicável: preços de Membership; benefícios e descontos dos planos; Taxa de Administração; PRL; multiplicador de Créditos; Luxchange Fee; descontos Luxplus; taxas e comissões de locação; e demais valores comerciais Luxtory.

**BR-360** — Alterar um parâmetro NÃO altera automaticamente a Business Rule que lhe dá origem.

**BR-361** — Parâmetros não podem ser utilizados para contornar as regras estruturais deste documento.

## 37. Guardrails

**BR-373** — O Co-Owner deve ser comunicado como participação societária com Direito de Uso, e NÃO como compra de diárias.

**BR-374** — Nenhuma comunicação deve prometer rentabilidade, valorização, liquidez ou renda garantidas.

**BR-375** — Nenhuma capacidade pode ser comercializada sem direito, autorização ou base válida.

**BR-376** — Nenhuma implementação pode criar diferença econômica relevante entre Owner e Co-Owner que não decorra deste documento.

## 38. Limites do documento

Este documento define exclusivamente modelo de negócio e Business Rules estruturais.

**Pertencem ao 02 — Product Spec:** jornadas; páginas e formulários; comportamento detalhado do calendário; workflows; estados funcionais; carteira de Créditos; notificações; fluxos de cancelamento; fluxos de Request e Direct; fluxos de locação; horários operacionais; convidados; Admin; critérios de aceite; exceções operacionais.

**Pertencem ao 03 — Technical Spec:** arquitetura; schema de dados; APIs; autenticação e autorização; ledger; transações; locks; concorrência; prevenção técnica de double booking; idempotência; jobs; integrações; observabilidade; auditoria técnica; segurança; recuperação de falhas.

**BR-380** — Product Spec e Technical Spec DEVEM implementar este documento e NÃO podem redefinir suas regras estruturais.
