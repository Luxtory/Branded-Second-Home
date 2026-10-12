# Revisão jurídica da comunicação Brand Partners — pacote para o `P-LX-03` (BP1.1)

> Material de trabalho para a revisão jurídica das páginas `/brand-partner` e `/brand-partner/como-funciona`
> (copy `D-BP-15` com os ajustes `D-BP-18`, spec `catalog` §14.9). **Não é parecer jurídico:** organiza, verbatim, as
> frases públicas que caem nos temas do `P-LX-03` ([`luxtory.md`](luxtory.md) §7), com a âncora canônica, a salvaguarda
> que a copy já tem e a pergunta a responder. Preparado em 2026-10-12; a revisão em si é do advogado da Luxtory.

## 1. Como usar

- Cada item `J-nn` recebe uma das respostas: **aprovado**, **ajustar** (com o texto sugerido) ou **remover**.
- Uma resposta "ajustar" ou "remover" volta ao fluxo de [`communication.md`](../communication.md): o fundador aprova a
  mudança, ela entra no i18n e no registro (`brand-partners.md`) e a auditoria de concisão (`catalog` §14.9) é refeita.
- Com todos os itens respondidos e os ajustes aplicados, o `P-LX-03` fica resolvido para a BP1.1 — condição para abrir o
  portão `BRAND_PARTNERS_SITE` em Production (checklist em [`operacao.md`](../../how-to/operacao.md)).
- Os textos citados são os do i18n `src/features/catalog/presentation/i18n/brand-partners-pt-br.ts` (o destaque `**`
  da copy foi omitido). Público das páginas: marcas (B2B), mas a página é aberta e indexável — qualquer pessoa a lê.

## 2. Temas do `P-LX-03` que se aplicam às páginas Brand Partners

| Tema | Por que se aplica | Referências para a análise (indicativas) |
|---|---|---|
| A. "Licenciamento" e remuneração da marca | as páginas descrevem o uso autorizado e remunerado da marca da Brand Partner (L1) | Lei 9.279/1996 (licença de uso de marca); contrato de parceria |
| B. Uso de marcas de terceiros e governança | a página fala da marca do leitor e de como ela é usada, aprovada e protegida (L2, L3, L8, L9) | Lei 9.279/1996; instrumentos da parceria |
| C. Ação de SPE para público indeterminado | a página aberta descreve as modalidades Owner e Co-Owner, inclusive "Ação da SPE proprietária da residência" | Lei 6.385/1976 (valores mobiliários; contratos de investimento coletivo) e regulamentação da CVM; Lei 13.777/2018 (multipropriedade, para afastar a equiparação) |
| D. Menção comparativa a categorias de alternativas | o PROBLEM contrasta "Quando o produto vem primeiro" × "Quando a marca vem primeiro"; "Para quem vive" cita as alternativas de lazer | Lei 8.078/1990 (CDC, publicidade); Código do CONAR (comparativa) |
| E. Luxtory Club, Créditos e mecanismos futuros | o R3 não opera: tudo é "modelo previsto"; Créditos descritos como "não são moeda, investimento" | CDC (oferta e publicidade); Lei 6.385/1976 |
| F. Ausência de garantia de resultado | as ressalvas sobre demanda, vendas, receita, escala e replicação (REQ-101) | CDC arts. 30, 31 e 37 |

Nenhuma empresa concorrente é nomeada e nenhuma marca de terceiro aparece nas páginas (só "a sua marca", genérica).

## 3. Inventário

### A. "Licenciamento" e remuneração (L1; BR-016, BR-023, BR-350, BR-374)

Salvaguarda atual: nenhum percentual, royalty, mínimo, valor ou receita; remuneração "definida em contrato" e "separada
das demais receitas da Luxtory"; nunca garantida.

| ID | Página · seção | Texto | Pergunta |
|---|---|---|---|
| J-01 | Como funciona · Decisões e remuneração | "Como funciona o licenciamento?" / "A Brand Partner autoriza o uso da sua marca no modelo, dentro dos direitos acordados e do plano estratégico aprovado." / "A marca, o Brand DNA e os ativos que ela já possui continuam sendo dela." | "Licenciamento" descreve corretamente o instrumento contratual previsto? Algum requisito de forma (averbação, escopo) deve aparecer ou ficar fora da página? |
| J-02 | Como funciona · Decisões e remuneração | "A parceria prevê remuneração pelo uso autorizado da marca, permitindo explorar uma nova fonte de valor para o que vocês construíram." / "Essa remuneração é definida em contrato, com regras próprias e separada das demais receitas da Luxtory." / "Valores e condições não são públicos." | "Nova fonte de valor" pode ser lida como promessa de receita? A redação "prevê remuneração" é adequada antes do contrato? |
| J-03 | Home · Para a sua marca | "Remuneração pelo uso da marca" / "O uso autorizado da marca é remunerado, com condições definidas em contrato e separadas das demais receitas da Luxtory." | A afirmação no presente ("é remunerado") é segura, sendo a remuneração definida caso a caso em contrato? |
| J-04 | Como funciona · Para quem faz sentido | "querem ampliar as experiências que oferecem e transformar o uso autorizado da marca em uma nova fonte de valor;" | Mesmo ponto de J-02, como critério de qualificação. |
| J-05 | Home · Para quem faz sentido; Home · Hero | "E com interesse em transformar essa relação em novas experiências e fontes de valor, com governança sobre o uso da marca." / "Para a sua marca: uma nova forma de transformar o que ela representa em Brand Experience e de participar dos momentos que importam na vida das pessoas." | Linguagem de benefício sem promessa — confirmar. |

### B. Uso de marcas de terceiros e governança (L2, L3, L8, L9; BR-010–BR-015, BR-021–BR-023)

Salvaguarda atual: plano estratégico de uso aprovado pela Brand Partner; mudanças materiais com nova aprovação; direitos
preexistentes das duas partes preservados "conforme o contrato"; nenhuma marca real nomeada.

| ID | Página · seção | Texto | Pergunta |
|---|---|---|---|
| J-06 | Home · Governança | "A Brand Partner. O plano estratégico de uso da marca, inclusive sua exposição pública, precisa de aprovação prévia." / "Mudanças materiais exigem nova aprovação." | A descrição corresponde ao que o contrato padrão vai garantir? |
| J-07 | Home · Governança | "Sim. A marca, o Brand DNA e os ativos intelectuais que a empresa já possui continuam sendo dela." / "Os direitos preexistentes das duas partes são preservados conforme o contrato." | O "Sim." categórico é adequado diante de eventual cessão parcial prevista em contrato? |
| J-08 | Home · Governança | "O Home Concept identifica os elementos essenciais." / "Personalizar, sim; descaracterizar, não: mudanças nesses elementos passam pelas aprovações previstas." / "Cada residência fica vinculada à versão do Home Concept da sua aprovação comercial." | Confirmar a redação diante dos direitos do adquirente (Owner pode personalizar). |
| J-09 | Home · Governança | "Ficam impedidos novos Home Concepts, Home Editions e usos da marca depois da eficácia, salvo disposição contratual diferente." / "Os direitos de residências já contratadas, vendidas ou em construção não terminam automaticamente; a transição segue o contrato." | Terminologia ("eficácia", "não terminam automaticamente") adequada para público leigo? |
| J-10 | Como funciona · Governança | "Sim. O uso da marca parte de um plano estratégico previamente aprovado pela Brand Partner, incluindo sua exposição pública." / "A Luxtory pode executar esse plano dentro do escopo acordado. Mudanças materiais precisam de nova aprovação." | Como J-06. |
| J-11 | Como funciona · Governança | "A marca, seu DNA e os ativos intelectuais que sua empresa já possui continuam sendo seus." / "O contrato preserva os direitos de propriedade intelectual preexistentes de ambas as partes." | Como J-07. |
| J-12 | Como funciona · Governança | "Há medidas previstas para lidar com uma descaracterização material." / "Enquanto a não conformidade persistir, podem ser suspensos o uso comercial das marcas relacionadas, a certificação de conformidade e a participação nos mecanismos da rede." / "Os direitos patrimoniais permanecem preservados." | Os efeitos descritos (suspensão; direitos patrimoniais preservados) estão alinhados ao contrato e aos instrumentos do adquirente? |
| J-13 | Como funciona · Governança | "O contrato define como encerrar a relação e tratar a continuidade dos compromissos já assumidos." / "Quando o encerramento passa a valer, ficam impedidos novos Home Concepts, Home Editions e usos da marca, salvo disposição contratual diferente." / "Os direitos necessários para concluir ou dar continuidade a residências já contratadas, vendidas ou em construção não terminam automaticamente." / "A transição e os direitos que permanecem seguem o contrato." | Como J-09. |
| J-14 | Como funciona · Condições e expansão | "Cada expansão depende dos direitos de uso da marca, da estratégia da parceria, da demanda e da viabilidade." / "Parceiros locais autorizados pela Luxtory podem participar, respeitando o Home Concept, os padrões Luxtory e os direitos da Brand Partner." | A menção a parceiros locais exige alguma ressalva (sublicença, responsabilidade)? |

### C. Ação de SPE e modalidades em página aberta (BR-052, BR-065, BR-071, BR-373; REQ-101, REQ-103)

Salvaguarda atual: nenhuma oferta, preço, condição ou rentabilidade nas páginas; direitos "nascem da formalização da
aquisição"; manifestar interesse "não é aquisição"; a página é dirigida a marcas e o CTA leva só a uma conversa.

| ID | Página · seção | Texto | Pergunta |
|---|---|---|---|
| J-15 | Home · Para quem vive (Patrimônio) | "Uma relação patrimonial real." / "Como Owner, a pessoa possui a residência integralmente; como Co-Owner, possui uma Ação da SPE proprietária da residência, com Direito de Uso." | Descrever a Ação da SPE em página aberta, sem oferta, é seguro diante da regulação de valores mobiliários? "Relação patrimonial real" é adequado para o Co-Owner? |
| J-16 | Home · Hero | "Para quem se identifica com a sua marca: uma nova forma de viver o lazer com patrimônio, liberdade e pertencimento, em um lugar que expressa sua identidade e seu lifestyle." | "Patrimônio" no Hero pode ser lido como apelo de investimento? |
| J-17 | Como funciona · Percurso (05) | "A Home Edition apresenta as formas de aquisição autorizadas para sua estrutura." / "Enquanto essa estrutura estiver aberta, pode contemplar Owner, Co-Owner ou ambos." / "Owner — Adquire a propriedade integral da residência." / "Co-Owner — Adquire uma Ação da SPE proprietária da residência, com Direito de Uso conforme as regras aplicáveis." / "Os respectivos direitos nascem da formalização da aquisição, respeitando as condições e os compromissos aplicáveis." / "Uma manifestação de interesse não os constitui." | Como J-15. A expressão "Adquire uma Ação" sem oferta concreta é aceitável? |
| J-18 | Home · Como acontece (04) | "A Home Edition apresenta as modalidades autorizadas. Os direitos de cada pessoa nascem da formalização da aquisição." | Como J-15. |
| J-19 | Como funciona · Percurso (07) | "A administração segue o escopo contratado: a gestão pela Luxtory é obrigatória no Co-Owner e opcional para o Owner." | A gestão obrigatória no Co-Owner, dita publicamente, reforça a leitura de contrato de investimento coletivo? |
| J-20 | Interesse (Home · Como acontece 02; Como funciona · Percurso 03) | "O interesse ajuda a avaliar a oportunidade, mas não é aquisição nem determina um lançamento." / "Manifestar interesse não é adquirir uma residência nem determinar um lançamento." | Redação suficiente para afastar pré-venda ou reserva? |

### D. Menção comparativa a categorias (Código do CONAR; CDC)

Salvaguarda atual: nenhuma empresa, marca ou empreendimento nomeado; o contraste é entre ordens de decisão, não entre
concorrentes.

| ID | Página · seção | Texto | Pergunta |
|---|---|---|---|
| J-21 | Home · O dilema da expansão | "Quando o produto vem primeiro — A marca entra depois." / "O empreendimento é concebido antes, e a marca chega como nome, selo ou decoração." / "O nome pode estar presente, mas aquilo que lhe dá sentido pode ficar de fora." | A comparação a uma categoria (empreendimentos com marca aplicada depois), sem nomear ninguém, é publicidade comparativa aceitável? |
| J-22 | Home · Para quem vive | "A proposta Luxtory reúne em uma mesma arquitetura três valores que as alternativas de lazer tendem a separar." | Comparação genérica a "alternativas de lazer" — adequada? |
| J-23 | Home · Para quem faz sentido; Como funciona · Para quem faz sentido | "Não se trata de exposição de logotipo." / "buscam apenas a exposição do logotipo;" | Sem ponto previsto; confirmar. |

### E. Luxtory Club, Créditos e mecanismos futuros (BR-146, BR-161, BR-190, BR-240; R3 não operacional)

Salvaguarda atual: toda frase sobre o Club traz "o modelo prevê"/"quando disponível" ou vem depois dessa marca no mesmo
bloco (teste de copy); condições de Membership, elegibilidade, disponibilidade, inventário e regras aplicáveis.

| ID | Página · seção | Texto | Pergunta |
|---|---|---|---|
| J-24 | Como funciona · Luxtory Club | "O modelo Luxtory prevê o Luxtory Club: uma rede que, quando disponível, amplia as possibilidades de quem vive a Second Home além da própria residência." | Comunicar um mecanismo ainda inexistente, com essa ressalva, é seguro (oferta futura)? |
| J-25 | Como funciona · Luxtory Club (Membership) | "Prevista como a associação do Titular ao Luxtory Club." / "Será condição para os mecanismos do Club e não altera propriedade, Ação ou Direito de Uso." / "O uso da própria residência não depende dela." | Confirmar. |
| J-26 | Como funciona · Luxtory Club (Luxchange) | "O modelo prevê converter capacidade elegível em Créditos e usá-los em estadias em outras Second Homes da rede." / "Créditos serão uma unidade interna do Club: não são moeda, investimento nem garantia de disponibilidade." | A ressalva sobre Créditos é suficiente (natureza jurídica, consumidor, regulação financeira)? |
| J-27 | Como funciona · Luxtory Club (Luxplus, limite) | "O modelo prevê reservar noites adicionais, quando disponíveis no inventário da Luxtory." / "O Luxtory Club e seus mecanismos fazem parte do modelo previsto." / "Quando disponíveis, dependerão de Membership vigente, elegibilidade, disponibilidade, inventário e regras aplicáveis." | Confirmar. |
| J-28 | Home · Para quem vive (Liberdade); Home · Como acontece (06); Como funciona · Percurso (07) | "O modelo prevê ainda o Luxtory Club: quando disponível, estadias em outras Second Homes da rede, conforme Membership, elegibilidade, disponibilidade e regras aplicáveis." / "O modelo prevê que ela possa integrar o Luxtory Club, quando disponível e atendidas as condições aplicáveis." / "O modelo prevê que a integração ao Luxtory Club possa fazer parte dessa continuidade, quando disponível e desde que atendidas as condições aplicáveis." / "Ela não é automática." | Como J-24. |
| J-29 | Como funciona · Luxtory Club ("E para a marca?") | "Quando os mecanismos do Club estiverem disponíveis, a participação de uma residência neles exigirá conformidade com os padrões Luxtory e com o Home Concept." / "A exposição pública da marca, inclusive nos canais do Club, segue o plano estratégico aprovado pela Brand Partner." | Confirmar. |

### F. Ausência de garantia de resultado (REQ-101; L5, L6)

| ID | Página · seção | Texto | Pergunta |
|---|---|---|---|
| J-30 | Home · Para a sua marca | "O modelo cria as condições; os resultados não são prometidos." / "Demanda, vendas, receita, escala e replicação dependem de cada oportunidade e não são garantidas." | A ressalva é suficiente e visível (fica numa nota ao fim da seção)? |
| J-31 | Home · Para a sua marca | "A marca apresenta a possibilidade à sua comunidade, e o interesse pode ser conhecido antes de um lançamento." / "Manifestar interesse não é aquisição." / "Um Home Concept pode originar lançamentos em outras regiões, quando direitos, estratégia, demanda e viabilidade permitirem." | Confirmar. |
| J-32 | Como funciona · Condições e expansão | "Cada oportunidade precisa encontrar interesse e condições reais para ser realizada." / "A estrutura ajuda a avaliar essas condições, mas não elimina as incertezas do mercado." / "Demanda, vendas, receita, retorno, escala e replicação não são garantidos." | Confirmar. |
| J-33 | Home · Para quem faz sentido; Como funciona · Próximo passo; Home · Conversa | "Demanda, escala e resultados financeiros não são garantidos." / "Iniciar a conversa não pressupõe parceria, criação de Home Concept ou lançamento." / "O envio inicia uma conversa. Não formaliza uma parceria nem gera obrigação de avançar." | Confirmar. |

## 4. Itens relacionados que também condicionam o go-live (fora do texto do `P-LX-03`)

| ID | Item | Situação | Pergunta |
|---|---|---|---|
| J-34 | Fotografias provisórias M1–M5 (`D-BP-17`) | Reutilizam fotos já publicadas no B2C; proveniência registrada em `catalog` §13.10: repositório Luxtory2.0, "provisórias: autorizadas para o site como referência visual, sem autorização definitiva de produção registrada"; duas retratam pessoas (M1 e M2) | Os direitos (autoral e de imagem das pessoas retratadas) cobrem o uso em página pública B2B? Se forem imagens sintéticas, é preciso declarar? |
| J-35 | Formulário de contato (REQ-028) | Coleta nome, marca, e-mail, site e mensagem; texto ao lado: "Os dados enviados são utilizados para responder à solicitação e avaliar uma possível parceria com a Luxtory." Nenhum dado é guardado no banco; o envio vai por e-mail à caixa corporativa | A informação de finalidade basta para a transparência exigida pela Lei 13.709/2018 (LGPD), ou é preciso um aviso de privacidade com base legal, controlador, retenção e direitos do titular? |

## 5. Registro das respostas

| ID | Resposta | Texto ajustado (se houver) | Data | Responsável |
|---|---|---|---|---|
| J-01 … J-35 | — | — | — | — |
