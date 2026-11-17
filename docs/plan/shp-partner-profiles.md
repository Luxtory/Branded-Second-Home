# SHP — parceiros incorporadores, imobiliárias e corretores

> Plano aprovado pelo fundador na conversa de 2026-11-17: implementação cirúrgica na página existente, após avaliação da copy completa. REQ-105 · TECH-057 · catalog §20.6. Executar inline, sem reabrir a aprovação editorial.

**Objetivo:** uma página que acolhe os três perfis, destaca a participação recorrente dos primeiros parceiros e encaminha contatos com os campos adequados.

**Arquitetura:** manter `catalog`, rota, shell, endpoint e transporte existentes. Perfil explícito discrimina o contrato fechado validado no navegador e servidor. Nenhum registro, conta ou afiliação é criado.

**Stack:** Next.js / React / TypeScript / Zod / Core DS, Vitest e Playwright existentes. Sem dependência, migration, configuração ou infraestrutura nova.

## Restrições e revisão

- Uma página, nove seções, um destino `#conversa`; sem página complementar. Preservar as três imagens e seu mapeamento por estágio.
- Copy de lançamento no presente, sem notas de indisponibilidade; isso não implementa nem comprova a operação do Club. Locação independente, créditos distintos de estadias pagas.
- Receita recorrente é oportunidade dependente de faturamento e contrato. Não definir percentual, duração, mínimo, disponibilidade ou base econômica nova.
- Parágrafos curtos, até três linhas em leitura normal; dividir ideias se necessário, sem truncamento, redução de fonte ou quebras forçadas. Zoom deve refluir sem clipping.
- Envio seguro preservado: controles TECH-057, privacidade, idempotência, nenhum PII em logs/storage/URL. E-mail só com os campos do perfil escolhido.

## Execução sequencial

1. [x] Contratos e rastreabilidade: emitir revisão autorizada e limitada de 01/02/03, Framework SHP, aplicação, catalog §20, OpenAPI, ADR-0028 e plano de waves. Manter histórico e demais jornadas.
2. [x] TDD: reproduzir a falta dos novos perfis nos testes de schema/e-mail, rota e fluxo acessível. Cobrir campos condicionais, empresa opcional do corretor, rejeição de campos incompatíveis e mudança de perfil sem dados residuais.
3. [x] Implementar `domain/application/second-home-partner-contact.ts`, formulário, i18n, seções e CSS exclusivamente SHP. Domínio recebe união discriminada `developer | agency | broker`; perfil ausente não tem default. `region` tem até 200 pontos de código.
4. [x] Verificar copy, formulário real → API → adapter determinístico, layouts de 320 a 1920, axe a 390/1440, reflow 200%, imagens, console e contagem de linhas. Capturar desktop/mobile. Executar gates pertinentes e regressões das outras jornadas.
5. [x] Revisão independente do diff completo; corrigir achados, verificar novamente o necessário, atualizar NOTES/CHANGELOG e registrar entrega com commit/PR e status real de publicação.

## Arquivos principais

- Contratos: `docs/specs/canonical/01-business-model-business-rules.md`, `02-product-spec.md`, `03-technical-spec.md`, `docs/api/openapi.yaml`, `docs/specs/catalog.md` §20.
- Comunicação: `docs/specs/communication/framework-second-home-partners.md`, aplicação SHP, i18n.
- Produto: `src/features/catalog/{domain,application}/second-home-partner-contact.ts`, `presentation/second-home-partners/{home-page,contact-form,paths}.tsx` (paths é `.ts`), CSS SHP.
- Evidências: testes existentes da jornada, testes de comunicação/contratos, capturas e métricas em `docs/reviews/second-home-partners/profiles/`.

## Refinamento do fundador — Hero, oportunidade e fechamentos (2026-11-17)

Pedido: duas frases do Hero em blocos sucessivos; imagem no espaço da oportunidade; narrativa “Imagine seu cliente”; fechamentos centralizados no papel de headline da Home; mencionar imóveis já comercializados e futuras vendas, sujeitos a avaliação.

Abordagem de implementação: reaproveitar o imóvel de lazer à beira-mar já autorizado no acervo (`como-funciona/problema-imovel.jpg`), no split6/6 do Core, sem gerar ou substituir os três assets por estágio. O Hero mantém um único H1, com as frases em blocos e a segunda em itálico; no celular cada frase reflui naturalmente. Fechamentos editoriais usam `lx-section-closing` + `lx-headline`, com o tratamento da Home. Condições e privacidade mantêm sua hierarquia legível.

Julgamento de copy: “vitalícia” é persuasivo, mas duração e continuidade ainda não têm definição contratual (BR-352). Não inventar obrigação perpétua nem garantia de aceleração de vendas. Usar “receita depois da venda” e argumentos que podem encurtar o ciclo. Imóveis já vendidos podem ser apresentados à avaliação; a adesão do proprietário continua voluntária.

Escopo: i18n, renderização, CSS local SHP, Framework/aplicação e brief. Sem alteração de formulário, API, negócio operacional, dependências, imagens originais ou produção. Continuação no PR94 de Preview.

1. [x] Registrar o brief e atualizar a revisão editorial/hash do Framework; testes relevantes de narrativa, ausência de promessa vitalícia e encaixe visual.
2. [x] Ajustar Hero, split com imagem, copy e três fechamentos; esclarecer carteira já vendida/futura na seção e FAQ.
3. [x] Verificar parágrafos, imagem carregada, duas frases independentes, centralização/fonte, responsividade, reflow200%, axe e formulário existente. Lint/tipos/build, testes direcionados e capturas. CI remota registrada no PR.
4. [x] Revisão independente do diff incremental; commit/push no PR94, preservar condição de lançamento.
