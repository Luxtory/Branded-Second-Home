# Reposicionamento Luxtory — plano de implementação controlada

> Execução nativa por tarefas; revisão independente ao final. Aprovação do fundador em 2026-11-05: preparar e implementar três PRs, sem merge nem publicação em Production.

**Objetivo:** atualizar exclusivamente a normativa e os campos de comunicação enumerados na Master Copy definitiva do fundador, preservando as páginas existentes.

**Arquitetura:** conteúdo nos dois arquivos i18n existentes; documentação e expectativas literais dos testes diretamente afetadas. Nenhuma mudança de comportamento, estrutura, API, modelo de dados ou infraestrutura.

**Stack:** Next.js 16.4.2, TypeScript 6.0.3, Vitest 5.0.2, Playwright 1.63.0, Design System existente.

**Especificação:** autorização e Master Copy definitiva do fundador, 2026-11-05; briefs de `catalog` §13/§14; hierarquia `01 → 02 → 03 → software`.

## Restrições globais

- Base: `26dd58d9b40d4046e5729cf246395eca0ee3c490`; `01` v10.2, `02` v4.4, `03` v3.16. PR #83 da W13 independente.
- Aplicar literalmente a última aprovação, que prevalece sobre as propostas anteriores, inclusive H04, H18, C09b e BR-041.
- Preservar Hero, dilema, equação, escada, governança, licenciamento, Luxchange B2B, CTA, formulário, privacidade, navegação, metadados e mídia.
- Nenhuma alteração de TSX, estilos, componentes, Design System, dependências, APIs, migrations, dados, flags, permissões ou gates.
- Co-Owner exclusivo de oito Ações, integrações e novas funcionalidades financeiras estão fora do escopo.
- Testes usam apenas o harness local/CI e seu banco descartável; nunca dados ou operações reais.
- Cada merge em main dispara CI → migrate → deploy. Nenhum merge, promoção ou deploy Production autorizado.

## Foco da revisão

- Campos preservados e não enumerados byte a byte iguais à base, inclusive os dois parágrafos bilaterais e o Luxchange B2B.
- Interesse e comercialização separados; direitos só na formalização; GTM pode anteceder estruturação definitiva.
- Serviços adicionais somente contratados; incorporadora não universal; Investor e direitos existentes preservados.
- Club previsto, sem promessa de disponibilidade; locações e receitas respeitam modalidade, Membership e autorização.
- Copy literal longa não autoriza reescrita ou alteração visual: medir e registrar para o aceite de Preview.

## Tarefa 1 — PR N: normativa e rastreabilidade

- [ ] Atualizar 01 para revisão v10.3 autorizada, com emissão condicionada ao merge aprovado; acrescentar §1/§35 e substituir somente BR-035/040/041 pelos textos do fundador.
- [ ] Registrar compatibilidade de REQ-022/023/026/027/028/038/094 e TECH-020/083; manter 02 v4.4 e 03 v3.16 sem mudança funcional.
- [ ] Ajustar somente referências factuais transversais diretamente afetadas; preservar Frameworks e respectivos hashes.
- [ ] Executar testes de comunicação, ontologia e terminologia, lint e TypeScript; revisar diff normativo e abrir PR draft separado.

## Tarefa 2 — PR E: Brand Partners

- [ ] Atualizar somente as expectativas literais incompatíveis em `tests/communication-ontology.test.ts`; observar falha antes da copy.
- [ ] Aplicar H02/H03/H04/H08/H09/H11/H12/H14/H15/H16/H17/H18/H19/H20/H22/H23/H24 em `brand-partners-pt-br.ts`.
- [ ] Registrar aceite D-BP-29 e complemento dos briefs existentes; manter íntegros os demais campos e a FAQ de licenciamento.
- [ ] Verificar igualdade literal dos campos autorizados e ausência de mudanças nos demais; executar testes e gates existentes.
- [ ] Capturar antes/depois e Preview em 390/768/1440 px, revisar e abrir PR draft independente; publicação depende do PR N emitido.

## Tarefa 3 — PR C: B2C

- [ ] Aplicar C01/C02/C04/C05/C06/C07/C08/C09a/C09b/C10/C11/C13/C14/C15/C16/C17/C18 em `discovery-pt-br.ts`.
- [ ] Preservar C03/C12/C19, configurações Co-Owner, patrimônio, modalidades, calendário, demais campos e interfaces.
- [ ] Registrar aceite D-B2C-29 e complemento do brief; nenhuma nova regra de software.
- [ ] Verificar diff literal e semântico, executar testes e gates existentes; capturar antes/depois e Preview nas três larguras.
- [ ] Abrir PR draft independente; nenhuma publicação sem autorização separada.

## Aceite e rollback

- Copy literal, identidade visual, acessibilidade, teclado, links, CTA, formulário sintético, privacidade, SEO, responsividade e ausência de overflow verificados.
- CI padrão aprovada e SHA exato apresentado ao fundador; pendências e limitações descritas sem presumir aprovação visual.
- Rollback editorial por PR autorizado; normativa emitida exige revisão corretiva rastreável. Instrumentos, obrigações e direitos históricos não são alterados automaticamente.

## Situação da execução

Plano aprovado para execução controlada. Evidências, resultados, SHAs e URLs serão registrados nos PRs; os itens acima não declaram testes já executados.
