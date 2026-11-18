# Economia do filme: benchmark de mercado e PRL das Second Homes (v5 · proposta para decisão comercial)

> Análise da coerência econômica dos valores simulados do filme do Luxtory Club. **Nada foi alterado:** PRLs, Créditos,
> taxas e o valor do Luxplus continuam os da v5 até a aprovação comercial. Consulta de mercado em 18/11/2026.
>
> Quatro coisas que não se misturam neste documento:
>
> - **Regra canônica:** fórmula e parâmetro escritos nos documentos 01/02/03. Não muda aqui.
> - **Dado simulado:** PRL, lotes e valores fictícios do filme (`data.js`, `FICTITIOUS`).
> - **Referência de mercado:** preço público de anúncio de casa inteira, com as limitações descritas.
> - **Escolha comercial pendente:** o que a Luxtory decide (os cenários abaixo são propostas, não decisões).

## 1. O que as regras dizem (inalterado)

| Regra | Texto canônico | Efeito no filme |
|---|---|---|
| PRL | cada data de cada Second Home tem um PRL; PRL do período = soma das datas (01 §19); é a principal referência econômica de Luxchange, Luxplus e Luxchange Fee (BR-180); alteração só pelo Super Admin, prospectiva (BR-181, BR-182) | o PRL é referência econômica interna, **não** o preço público de locação daquela casa |
| Créditos | Créditos da data = PRL da data × 10; o multiplicador é parâmetro administrável (01 §20, BR-201) | 14.000 Créditos = data de PRL R$ 1.400; **não** são R$ 14.000 |
| Natureza do Crédito | unidade operacional interna; não é moeda, investimento, saldo financeiro nem garantia de disponibilidade (BR-190) | a tela nunca converte Créditos em dinheiro |
| Luxchange Fee | maior entre 10% do PRL do período e R$ 120 (01 §24, BR-230, BR-231) | na tela, "Taxa de intermediação" |
| Luxplus | Preço = PRL do período × (1 − desconto aplicável) (01 §25); o PRL é a referência (BR-243); o desconto varia por Membership e não está publicado (BR-244) | o filme mostra um valor ilustrativo, sem PRL nem desconto |

Conferência do cenário atual da Satori Home (depósito): 14/05 e 15/05 com PRL R$ 1.600 → 16.000 Créditos cada; 16/05
com PRL R$ 1.400 → 14.000. Total: R$ 4.600 → 46.000 Créditos. A matemática está correta.

## 2. Método e limitações do benchmark

- **O que entrou:** casas inteiras (não quartos, suítes avulsas nem hotel), com tarifa pública em reais, em destinos
  compatíveis com cada perfil. Preferência por 3 a 6 suítes, porte de família ou de três gerações.
- **Como foi lido:** pela busca na web, a partir do trecho indexado de cada anúncio. Os sites dos anúncios não puderam
  ser abertos diretamente nesta sessão, porque a política de rede do ambiente bloqueia esses hosts (por exemplo
  `fazendatrancoso.com.br`, `vrbo.com`, `diariodonordeste.verdesmares.com.br`). Cada valor deve ser reconferido na
  página antes de qualquer uso externo.
- **Verificação:** "índice" = valor lido no trecho indexado do próprio anúncio; "Luxtory" = referência informada pela
  Luxtory, não reverificada aqui.
- **Limitações:**
  - preço de anúncio muda por data, ocupação e negociação;
  - muitas tarifas não incluem taxa de serviço (5% a 15%), limpeza, staff ou mínimo de noites;
  - o porte varia (3 a 8 suítes), assim como os serviços incluídos;
  - parte das páginas não informa a data de atualização.
- **Estatística:** mediana só como indicação, e só quando há pelo menos 4 valores do mesmo segmento. Nenhuma "média
  nacional": as referências são heterogêneas por destino, porte e serviço.

## 3. Comparáveis por Second Home

### 3.1 Satori Home · Serra

Perfil da bíblia: casa contemporânea em pedra clara, madeira e grandes panos de vidro, terraço em balanço, vale de serra
sem mar; família de quatro.

| # | Imóvel · local | Porte | Diferenciais | Tarifa no anúncio | Período | Fonte | Verificação |
|---|---|---|---|---|---|---|---|
| S1 | Casa Espetacular · Monte Verde (MG) | sobrado, 4 suítes | sauna, deck com vista | R$ 2.650 | consulta de out/2026 | [vrbo p9544307](https://www.vrbo.com/pt-br/imovel/p9544307) | Luxtory |
| S2 | Casa em Itaipava · Petrópolis (RJ) | 3 suítes com closet, 740 m², terreno de 6.300 m² | piscina, sauna a vapor, spa | R$ 2.400 | tarifa única de temporada | [Itaipava House](https://www.itaipavahouseimoveis.com.br/br/Imoveis/44/0/Locacao-por-temporada/) | índice |
| S3 | Casa no Alto do Capivari · Campos do Jordão (SP) | 5 quartos (3 suítes), até 10 pessoas | — | R$ 3.500 | fim de semana e feriado | [Imovelweb](https://www.imovelweb.com.br/casas-aluguel-alto-capivari.html) | índice |
| S4 | Casa Ma Folie · Campos do Jordão (SP) | 6 suítes, 700 m², até 12 pessoas | piscina, sauna, arrumação e cozinha incluídas | R$ 4.000 | mínimo de 10 tarifas em julho e no Réveillon | [Luxury Properties](https://www.luxuryproperties.com.br/1129/imoveis/venda-temporada-locacao-casa-6-quartos-campos-do-jordao-sp) | índice |
| S5 | Casa Xamego Alto Padrão · Campos do Jordão (SP) | não informado | anúncio de plataforma | a partir de R$ 1.400 | "a partir de" (piso) | [guia Dicas de Viagem](https://www.dicasdeviagem.com/airbnb-em-campos-do-jordao/) | índice |
| S6 | Matueté Serra da Mantiqueira Villa 15 · São Francisco Xavier (SP) | 6 suítes, 12 pessoas | curadoria de arquitetura, serviço | R$ 12.500 (R$ 15.000 em julho e feriados) + 10% de serviço | ano, exceto picos | [Matueté](https://www.matuetevillas.com/propriedade/serra-da-mantiqueira-villa-15/) | índice |

**Fora da amostra:**
- Casa da Montanha (Campos do Jordão, 8 suítes): o valor "a partir de R$ 11.500" apareceu numa consulta e não se
  confirmou em outra.
- Casa de 6 suítes no Alto do Capivari a R$ 1.250: o anúncio tem cerca de 4 anos.

**Leitura.**
- **Casas inteiras de 3 a 6 suítes (S1–S4):** de R$ 2.400 a R$ 4.000; mediana indicativa de R$ 3.075 (n = 4).
- **Pontas:** o piso de plataforma é R$ 1.400 (S5); a curadoria de arquitetura assinada fica em R$ 12.500 ou mais (S6).
- **Diferença de padrão:** a Satori tem arquitetura contemporânea mais sofisticada que a maioria das casas de
  condomínio de S1–S4. Em compensação, S4 e S6 têm mais suítes e serviços incluídos.

### 3.2 Azzura Home · Litoral

Perfil da bíblia: volumes brancos, vidro, piscina de borda infinita voltada ao mar, deque de pedra; frente-mar,
experiência familiar de alto padrão.

| # | Imóvel · local | Porte | Diferenciais | Tarifa no anúncio | Período | Fonte | Verificação |
|---|---|---|---|---|---|---|---|
| L1 | Casa em Trancoso (BA) | 4 suítes, ~300 m² | piscina com sauna, vista para a mata (não é frente-mar) | R$ 1.600 baixa · R$ 1.950 alta · R$ 5.000 de 10 a 26/12 | por temporada | [Zap Imóveis](https://www.zapimoveis.com.br/imovel/aluguel-casa-4-quartos-com-piscina-trancoso-porto-seguro-ba-300m2-id-2631895757/) | índice |
| L2 | Casa nos Altos de Trancoso (BA) | 3 suítes | condomínio | R$ 2.640 baixa · R$ 3.520 alta + 10% de administração | por temporada | [Wimoveis](https://www.wimoveis.com.br/propriedades/locacao-temporaria-altos-de-trancoso-disponivel-3023426070.html) | índice |
| L3 | Casa Iluminada · Condomínio Coqueiral, Trancoso (BA) | não reverificado | — | R$ 2.000 baixa · R$ 3.500 alta | por temporada | [Fazenda Trancoso](https://fazendatrancoso.com.br/property/condominio-coqueiral-id-113/) | Luxtory |
| L4 | Vila Universo · Condomínio Coqueiral, Trancoso (BA) | não reverificado | — | R$ 1.800 baixa · R$ 2.500 alta | por temporada | [Fazenda Trancoso](https://fazendatrancoso.com.br/property/condominio-coqueiral-casa-uh-47/) | Luxtory |
| L5 | Casa na Baleia · São Sebastião (SP) | 4 suítes | litoral norte | R$ 3.600 | período não informado | [Litoral Comfort](https://www.litoralcomfort.com.br/) | índice |
| L6 | Casa em Juquehy · São Sebastião (SP) | 4 suítes | litoral norte | R$ 5.500 | período não informado | [Litoral Comfort](https://www.litoralcomfort.com.br/) | índice |
| L7 | Casa em Maresias · São Sebastião (SP) | 5 suítes | litoral norte | R$ 6.400 | período não informado | [Litoral Comfort](https://www.litoralcomfort.com.br/) | índice |
| L8 | Matueté Trancoso Villa 54 (BA) | 3 suítes | curadoria | R$ 5.100 + 10%, mínimo de 7 noites | março a novembro | [Matueté](https://www.matuetevillas.com/propriedade/trancoso-villa-54-3/) | índice |
| L9 | Matueté Trancoso Villa 64 (BA) | 5 suítes, piscina | curadoria | R$ 9.000 + 10% | março a novembro | [Matueté](https://www.matuetevillas.com/propriedade/trancoso-villa-64/) | índice |
| L10 | Casa pé na areia em Juquehy · São Sebastião (SP) | 7 suítes, 16 pessoas | piscina privativa | R$ 14.700 a R$ 16.000 (Réveillon 25/26: R$ 18.000) | por temporada | [Oceano Azul](https://oceanoazulimobiliaria.com.br/temporada/sp/sao-sebastiao/juquehy/pe-na-areia/75293540) | índice |

**Contexto, fora da comparação direta:**
- Levantamento do Diário do Nordeste (abr/2026): 17 imóveis de luxo no Ceará entre R$ 3.000 e R$ 18.900, com mediana
  de R$ 7.000 nessa amostra (referência da Luxtory; [matéria](https://diariodonordeste.verdesmares.com.br/negocios/mansoes-de-luxo-no-litoral-do-ceara-tem-tarifas-de-ate-r-20-mil-veja-locais-1.3757309)).
- Casa Falésia, Trancoso (6 suítes, 16 pessoas): R$ 9.000 na baixa e R$ 15.000 na alta ([Wimoveis](https://www.wimoveis.com.br/propriedades/casa-falesia-6-suites-em-trancoso-3005705753.html), índice).

**Ponto a conferir:** outra listagem indexada descreve uma "Villa Universo" em Trancoso com 6 quartos e 18 hóspedes.
Se for o mesmo imóvel de L4, a tarifa de R$ 1.800 provavelmente não é da casa inteira ou está desatualizada.

**Leitura.**
- **Não frente-mar, em condomínio (L1–L4):** na baixa, de R$ 1.600 a R$ 2.640.
- **Litoral norte e curadoria (L5–L9), com 3 a 5 suítes:** de R$ 3.600 a R$ 9.000; mediana indicativa de R$ 5.500
  (n = 5; em L5–L7 o período não é informado).
- **Segmento certo:** a Azzura (frente-mar, borda infinita) compara-se com L5–L9, não com L1–L4.

### 3.3 Olivar Home · Campo

Perfil da bíblia: casa térrea contemporânea em torno de um pátio com oliveira, taipa, vidro de perfis finos, campo
ondulado e serra baixa ao longe; três gerações.

| # | Imóvel · local | Porte | Diferenciais | Tarifa no anúncio | Período | Fonte | Verificação |
|---|---|---|---|---|---|---|---|
| C1 | Casa no condomínio Terras de São José · Itu (SP) | 600 m², 4 dormitórios | piscina; arrumação à parte | R$ 4.000 a R$ 4.200; mínimo de 2 tarifas no fim de semana | tarifa de temporada | [Wimoveis](https://www.wimoveis.com.br/propriedades/casa-mobiliada-para-temporada-com-4-dormitorios-para-2986655557.html) · [Luxury Properties](https://www.luxuryproperties.com.br/imobiliaria/temporada/imoveis/8) | índice (provavelmente o mesmo imóvel) |
| C2 | Casa de Campo · Cunha (SP) | 5 suítes | piscina, área gourmet | R$ 3.000 baixa · R$ 3.600 alta · R$ 4.200 no Carnaval | por temporada | [AirConcierge](https://www.airconcierge.com.br/en/apartment/KV01H) | índice |
| C3 | Casa de campo em Campos de Cunha (SP) | não informado | piscina de água natural, deque | R$ 1.157 | plataforma | [Airbnb (busca)](https://www.airbnb.com.br/campos-de-cunha-brazil/stays) | índice (padrão não verificado) |
| C4 | Casa Vigneto Octávio · Vale dos Vinhedos (RS) | menor | casa de temporada | a partir de R$ 720 | "a partir de" (piso) | [guia Dicas de Viagem](https://www.dicasdeviagem.com/onde-ficar-no-vale-dos-vinhedos/) | índice |
| C5 | Casa no Condomínio Fazenda Boa Vista · Porto Feliz (SP) | 6 quartos | condomínio de campo de altíssimo padrão | R$ 35.000 por fim de semana, em contrato anual de 1 fim de semana por mês | contrato | [Imovelweb](https://www.imovelweb.com.br/casas-aluguel-condominio-fazenda-boa-vista-porto-feliz.html) | índice (estrutura diferente: só sinal de teto) |

**Leitura.** É a amostra mais fraca: poucas casas de campo de alto padrão publicam tarifa.
- **Casas inteiras de 4 a 5 suítes (C1–C2):** de R$ 3.000 a R$ 4.200.
- **Pisos de plataforma (C3–C4):** de R$ 720 a R$ 1.157, de padrão incerto.
- **Teto:** os condomínios de campo de altíssimo padrão operam em outra escala (C5).
- **Estatística:** não há base para mediana. Antes de fechar o PRL da Olivar, vale ampliar a amostra com consultas
  diretas de preço.

## 4. Matriz de precificação

O PRL é a referência econômica interna da noite, não o preço público de locação da mesma casa. As datas do filme estão
em Média/Baixa (maio, junho e agosto; 01 §8). Por isso a comparação usa as tarifas fora de pico dos anúncios.

**Critério proposto para o filme:**
- o PRL não deve ficar acima do preço público de uma casa inteira comparável na mesma temporada, senão o Luxplus
  pareceria mais caro do que alugar fora;
- nem muito abaixo do piso dos comparáveis, o que desvaloriza o posicionamento e empurra a Taxa de intermediação para
  o mínimo.

| Second Home | 1. PRL atual | 2. Faixa observada (fora de pico) | 3. Diferenças de padrão | 4. Conservador | 5. Base | 6. Premium | 7. Recomendação |
|---|---|---|---|---|---|---|---|
| **Satori Home** · Serra (depósito, 14 a 16/05) | R$ 1.400 a R$ 1.600 | R$ 2.400 a R$ 4.000 em casas de 3 a 6 suítes; piso de plataforma de R$ 1.400; curadoria a partir de R$ 12.500 | arquitetura contemporânea mais sofisticada que S1–S4; menos suítes e serviços que S4 e S6 | R$ 2.200 a R$ 2.600 | **R$ 3.000 a R$ 3.400** | R$ 5.200 a R$ 6.000 | **revisar:** o atual fica no piso de plataforma, cerca de metade da mediana indicativa, abaixo do padrão anunciado |
| **Azzura Home** · Litoral (Request, 04 a 07/06) | R$ 1.700 a R$ 1.900 | frente-mar e curadoria com 3 a 5 suítes: R$ 3.600 a R$ 9.000; não frente-mar em condomínio: R$ 1.600 a R$ 2.640 | frente-mar com borda infinita: compara-se com L5–L9; o atual só cabe em L1–L4 | R$ 3.000 a R$ 3.400 | **R$ 4.200 a R$ 4.800** | R$ 7.500 a R$ 8.500 | **revisar (maior distância):** o atual é de casa sem vista para o mar em condomínio, incompatível com a bíblia |
| **Olivar Home** · Campo (Direct, 28/05) | R$ 1.150 | casas de 4 a 5 suítes: R$ 3.000 a R$ 4.200; pisos de plataforma de R$ 720 a R$ 1.157 | térrea contemporânea com pátio; os comparáveis são casas de condomínio ou rurais tradicionais | R$ 2.400 | **R$ 3.200** | R$ 5.500 | **revisar com ressalva:** o atual fica no piso de plataforma; a amostra é pequena, então convém confirmar com consultas diretas de preço |
| **Luxplus** · Olivar (13 a 15/08, 2 noites) | valor ilustrativo de R$ 2.480 (R$ 1.240 a noite), sem PRL definido | — | **incoerência atual:** R$ 1.240 a noite fica acima do PRL da própria Olivar no Direct (R$ 1.150). Pela fórmula (01 §25), o preço Luxplus nunca passa do PRL do período | PRL de R$ 5.000 | PRL de **R$ 6.600** | PRL de R$ 11.500 | **definir o PRL das noites de agosto e manter o valor exibido ilustrativo e ≤ PRL do período:** ver §6 |

**Recomendação:** adotar o **cenário-base** como PRL do filme, depois de reconferir os valores nas páginas e, para a
Olivar, de ampliar a amostra. O base fica dentro da faixa observada de cada segmento, sem encostar no teto da
curadoria. Ele preserva a credibilidade premium sem sugerir que o Club é mais caro do que alugar fora. O conservador
serve se a Luxtory quiser uma referência mais contida; o premium só se as casas do filme forem apresentadas no nível de
arquitetura assinada com serviço (6 suítes ou mais).

## 5. Simulação de impacto (fórmulas do protótipo, sem alterar `data.js`)

Calculada com `rules.js` e os parâmetros canônicos atuais (multiplicador 10; taxa de 10% com mínimo de R$ 120). Os
saldos anteriores de cada cenário foram escolhidos para preservar a mecânica da narrativa:

- o saldo anterior não basta para a Request;
- uma data cobre o que falta;
- Helena deposita as três;
- o que sobra paga o Direct.

| Item | Atual | Conservador | Base | Premium |
|---|---|---|---|---|
| PRL Satori (14, 15, 16/05) | 1.600 · 1.600 · 1.400 | 2.600 · 2.600 · 2.200 | 3.400 · 3.400 · 3.000 | 6.000 · 6.000 · 5.200 |
| Metas do controle (Créditos) | 0 · 14.000 · 16.000 · 30.000 · 32.000 · 46.000 | 0 · 22.000 · 26.000 · 48.000 · 52.000 · 74.000 | 0 · 30.000 · 34.000 · 64.000 · 68.000 · 98.000 | 0 · 52.000 · 60.000 · 112.000 · 120.000 · 172.000 |
| Créditos originados no depósito | 46.000 | 74.000 | 98.000 | 172.000 |
| PRL Azzura (04 a 07/06) | R$ 5.500 | R$ 9.800 | R$ 13.800 | R$ 24.500 |
| Créditos necessários na Request | 55.000 | 98.000 | 138.000 | 245.000 |
| Saldo anterior (L-0001 + L-0002) | 30.000 + 18.000 = 48.000 | 52.000 + 35.000 = 87.000 | 72.000 + 51.000 = 123.000 | 130.000 + 89.000 = 219.000 |
| Faltam → mínimo que cobre (16/05) | 7.000 → 14.000 | 11.000 → 22.000 | 15.000 → 30.000 | 26.000 → 52.000 |
| Saldo após o depósito | 94.000 | 161.000 | 221.000 | 391.000 |
| Garantia por lote (FEFO) | 30.000 + 18.000 + 7.000 | 52.000 + 35.000 + 11.000 | 72.000 + 51.000 + 15.000 | 130.000 + 89.000 + 26.000 |
| Taxa de intermediação da Request | R$ 550 | R$ 980 | R$ 1.380 | R$ 2.450 |
| Saldo após o aceite | 39.000 | 63.000 | 83.000 | 146.000 |
| PRL Olivar (28/05) → Créditos do Direct | R$ 1.150 → 11.500 | R$ 2.400 → 24.000 | R$ 3.200 → 32.000 | R$ 5.500 → 55.000 |
| Taxa de intermediação do Direct | R$ 120 (mínimo) | R$ 240 | R$ 320 | R$ 550 |
| Saldo após o Direct | 27.500 | 39.000 | 51.000 | 91.000 |
| PRL Olivar no Luxplus (13 a 15/08) | não definido | R$ 5.000 | R$ 6.600 | R$ 11.500 |

**Efeitos visíveis.**
- **Números maiores:** os valores na tela passam a ter 5 ou 6 dígitos (no base, 98.000, 138.000 e 221.000).
- **Taxa da Request:** sobe de R$ 550 para R$ 1.380 no base. É a consequência correta de 10% do PRL e precisa ser
  aprovada como mensagem, porque fica visível no filme.
- **Taxa do Direct:** deixa de mostrar o mínimo de R$ 120, o que é aceitável (o mínimo continua na regra).
- **Narração:** nenhuma frase usa números e nenhuma muda.

## 6. Valor do Luxplus: fundamentação separada

- **A regra.** Preço Luxplus = PRL do período × (1 − desconto aplicável) (01 §25). O desconto varia por Membership e
  não está publicado (BR-244). Presumir um percentual seria inventar um parâmetro (TECH-001). Por isso o filme mostra um
  valor ilustrativo, sem PRL nem desconto na tela. Isso continua.
- **O problema atual.** O valor ilustrativo (R$ 1.240 a noite) fica acima do PRL da mesma casa no Direct. Pela
  fórmula, o preço Luxplus nunca passa do PRL do período.
- **Proposta.** Definir o PRL das noites de agosto da Olivar (no base, R$ 3.200 + R$ 3.400 = R$ 6.600) e escolher um
  valor exibido que respeite valor ≤ PRL do período. Leitura das opções, sem decidir o desconto:

| Desconto hipotético | Conservador | Base | Premium |
|---|---|---|---|
| 0% (valor = PRL) | R$ 5.000 | R$ 6.600 | R$ 11.500 |
| 10% | R$ 4.500 | R$ 5.940 | R$ 10.350 |
| 20% | R$ 4.000 | R$ 5.280 | R$ 9.200 |

- **Decisão comercial necessária:** a faixa de desconto Luxplus pretendida para o Membership do filme, ou a
  autorização para exibir um valor igual ao PRL do período, sem falar em desconto na tela.

## 7. O que mudaria se um cenário for aprovado (Etapa 3)

- **Fonte única:** `data.js` (`FICTITIOUS`: PRLs, lotes L-0001 e L-0002, PRL de agosto e valor do Luxplus). Todas as
  telas derivam dele pelas fórmulas de `rules.js`; nenhum número de interface é digitado à mão.
- **Testes:** `prototype.test.mjs` tem cerca de 40 valores literais do cenário (metas, mínimo, saldos, taxas, Luxplus).
  As asserções continuam as mesmas; mudam os números esperados.
- **Marcas e documentos:**
  - marcas de tempo da Request e da EDL da prova (rótulos com 14.000, 30.000 e 46.000);
  - tabelas do `ROTEIRO.md` (§1) e do `README.md`, e o `INVENTARIO.md`;
  - nova medição de legibilidade dos valores (o comprimento muda com 6 dígitos).
- **Vídeos regenerados uma única vez:** Request, Direct e Luxplus (16:9 e 9:16), a prova de montagem e a prova curta.
- **Vídeos que não mudam:** C04 (sem números) e assinatura.
- **Verificação de layout:** valores de 6 dígitos no 9:16 ("Saldo projetado 221.000"), com o `check.mjs`.
