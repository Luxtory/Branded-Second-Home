# W8 — execução do plano aprovado

Data: 2026-10-23. Base: 6ee4ae81dd618d4753754dfe9817a38e660cc71e.
Retomada em 2026-10-24: base efetiva reconciliada por fast-forward para b7b42a7e34cff2c54b1e3322b05861e9491e6a98
após o hotfix #65 (Zod 4.6.7). Direção arquitetural e tarefas aprovadas preservadas; nenhuma alteração normativa.
Plano e adendo aprovados pelo fundador no chat; este documento organiza a execução, sem substituir os canônicos.
Spec: ownership §15 e calendar. ADR-0021. W8 continua sem closeout até merge autorizado.

## Global Constraints

- Canônicos 01 → 02 → 03 prevalecem; não editar canônicos ou migrations anteriores.
- Somente formalize_acquisition cria titularidade, Ação e Direito de Uso. Owner: um adquirente, holding 100%. Co-Owner: SPE S.A. fechada, N Ações equivalentes, N holdings e N parties distintas; mesma party não acumula duas Ações simultâneas na mesma Second Home.
- Configurações: N=10/8/4/2; participação bps=1000/1250/2500/5000; alta=10/12/24/48; media=25/32/64/128; capacidade Luxtory alta=3/7/7/7 e media=12/6/6/6. Catálogo imutável, sem CRUD.
- operation_start_date DATE local + timezone IANA imutável; base congelada na formalização, registro posterior de início não a altera. Instantes reais em UTC.
- Alocação parcial explicitamente fornecida, equivalente por posição/categoria, capacidade Luxtory explícita, total por categoria <= datas futuras e limites; sem proporcionalidade, compensação sazonal ou datas persistidas.
- use_right_ledger append-only: W8 somente grant, source configuration|initial_allocation, stake/exercício/categoria/quantidade/operation. Balance e demais movimentos são W11.
- Administração Co-Owner: união das coberturas profissionais cobre período operacional aberto desde data-base; cadeia contínua aceita, última cobertura realmente sem termo final. Sem pressupor renovação, contrato perpétuo, suspensão ou consequência econômica.
- SPE e referência institucional resolvem para party CNPJ existente sem ler documento; ownership possui singleton luxtory_legal_identity vazio na migration, provisionamento real restrito/auditado posterior. Luxtory não acionista; ausência da referência => ERR_PARAMETER_MISSING.
- ACQUISITION_WRITES fechado em Production por ausência/closed; somente open habilita. Local/CI controlados. Preview sem banco produtivo. Checar após autorização e antes de idempotência/efeitos; REST 503 e Server Action indisponível. Não afeta leituras/register_second_home.
- RLS: delegação vigente + relação patrimonial aplicável. Grants SELECT por coluna; nada de basis, operation_id, referência institucional, dados de outros Co-Owners ou PII nos DTOs W8.
- Outbox consumer-aware genérico: filtro de tipos processáveis no SQL antes de LIMIT/locks; sem consumer mantém pendente sem tentativa/recibo/falha. Evento de sorteio produzido agora é consumido só na W9.
- Autoridade: lock consultivo compartilhado da staff_role exata autorizadora, releitura transacional; revoke_staff_role adquire exclusiva correspondente. Sem novos privilégios ou mudança de autoridade nos commands anteriores.
- Nenhum preço, condição financeira genérica, reservas, custódia, selagem, sorteio, janelas/rotações, Membership, pagamentos ou transferências.
- Main agent exclusivamente edita migrations, contratos, command registry, package.json/lock, CHANGELOG e faz commits. Workers nunca fazem commits/push/PR e não criam subagents. Uma implementação delegada por vez; não reverter trabalho de outros.
- Production intocada; nenhuma configuração operacional ou dado real; parar antes do merge.

## Task 1 — Calendário civil puro

Ownership de arquivos: src/features/calendar/** e tests/features/calendar/** somente; spec e package pertencem ao principal.
Implementar TDD com temporal-polyfill 1.0.5 instalado pelo principal. Domínio puro com datas ISO próprias, sem objetos da biblioteca nas portas. Adapter Temporal na infraestrutura, API pública no index.
Porta pública: createCivilCalendar() retorna métodos validateTimezone(timezone), localDate(at: Date, timezone): ISO date, exerciseYear(date), isPartialExercise(date), carnivalDates(year), classify(date): { season: alta|media, isLeapDay }, futureCapacity({ operationStartDate, timezone, now: Date }): { exerciseYear, alta, media }.
Carnaval = Páscoa gregoriana -47 dias, sexta anterior, se sexta em janeiro começa 01/02; dez primeiras datas válidas, ignora 29/02 e janeiro/julho/dezembro já alta. Janeiro/julho/dezembro alta, 29/02 media extraordinária excluída da capacidade ordinária. Noite futura = check-in 14h local > now, e data >= base civil, até 31/12 do primeiro exercício.
Aceite: anos 1900..2100, 1913 sexta 31/01, 2000 bissexto, 2100 não bissexto, contagens 103/262 e leap separado, vários fusos, limite exato de check-in, virada de ano, datas inválidas. IDs PD-003, EC-3, TECH-040/041/110. Não implementar calendário operacional/W10/W11.
Relatório registra RED/GREEN e comandos efetivamente executados.

## Task 2 — Schema e invariantes (principal)

Criar migrations via npm run db:new, reversíveis, após as 36 existentes: quatro configurações; sincronização de revogação; fatos definitivos/registro de início da Second Home; alocação e administração; referência institucional/aquisição/SPE/Ações/holdings; ledger inicial; invariantes agregados/RLS/grants.
FKs compostas e constraint triggers diferíveis garantem relações da mesma Second Home, formalização atômica, cardinalidade/igualdade, fonte e quantidade dos grants. Exclusões temporais impedem dupla titularidade incompatível. Configurações/ledger/aquisição imutáveis. Triggers checam cobertura administrativa agregada; travas da raiz serializam alterações.
Down bloqueia perda de fatos W8 reais. Testar baseline 36, up/down/up e privilégios como luxtory_app/authenticated. Não usar FK operation.second_home_id que inviabilize registro de recusa para alvo inexistente.
Regenerar tipos Kysely. Testes de migration falham antes dos arquivos SQL.

## Task 3 — Outbox e autoridade transacional

Ownership delegado: platform outbox registry/store/dispatcher e testes correspondentes; CommandContext/executor para expor authorizationRef exclusivamente derivada do servidor; identity infraestrutura/public API para trava de staff; entrada compartilhada Admin para política opt-in de disponibilidade. Não editar migrations/command registry/contratos/package.
Chave consultiva exata: hashtextextended('app.staff_role:' || roleId, 0). W8 adquire pg_advisory_xact_lock_shared; migration de revoke usa pg_advisory_xact_lock antes do FOR UPDATE. Exigir authorizationRef staff_role:<UUID>, mesma role admin e user_id, sem revogação. Sem fallback para outra atribuição.
Disponibilidade: AdminCommand pode declarar assertAvailable opt-in; executar depois da autorização bem-sucedida e antes da idempotência, tanto REST como Server Actions. Sem alterar semântica de commands que não optam.
Outbox: ConsumerRegistry expõe tipos inscritos; store recebe lista e filtra antes de LIMIT/FOR UPDATE; lista vazia não consulta lote. Sem consumer não altera nada. Testar desconhecido pendente, conhecido entregue, desconhecidos > batch sem starvation, registro posterior entrega, recibos/rollback/concorrência anteriores preservados.
Testar exposição server-derived da authority ref e integração de revogação nas duas ordens com barreiras PostgreSQL reais. Sem reescrita do guard W2.

## Task 4 — Formalização e auxiliares

Ownership delegado: ownership domain/application/infrastructure/presentation HTTP + catalog/identity public seams necessários, testes unit/db/contratos; sem UI. Principal fornece schema, registry e contratos.
Implementar formalize_acquisition e registros de alocação inicial/administração/início com mesmo executor. REST três endpoints roadmap + operation-start aprovado. Payloads estritos, basis_ref e somente ids/metadados, sem PII.
Owner único 100%, sem SPE/Ação artificial. Co-Owner SPE CNPJ, N parties distintas, exclui identidade Luxtory registrada; cria estrutura e grants iniciais equivalentes e agenda ownership.initial_draw_scheduled no mesmo commit.
Respeitar catálogo fixado na aprovação comercial, versão original e Home Edition finalizada, sem exigir visibilidade pública; serializar com encerramento Brand Partner e autorização Investor usando seam público catalog na mesma transação. Escritas de fatos catalog via API pública catalog.
Alocação prévia por posições técnicas 1..N, sem Ações antes do ato; versão imutável e referência selecionada na formalização. Revalidar com relógio fresco depois dos locks. Partial exige payload explícito; annual deriva somente da configuração. 29/02 não gera grant W8. Nenhuma tabela de disponibilidade operacional.
Administração tem vigência civil explícita [valid_from,valid_until), provider_party_id, professional, scope, basis_ref; substituição controlada auditada e sem lacuna, histórico preservado. Início unidirecional com declaração de data efetiva igual à base formalizada e cobertura válida.
Gate ACQUISITION_WRITES isolado das funcionalidades anteriores; Preview recusado; local/CI abertura explícita por source/harness. Ausência institucional => 422 e ausência de efeitos patrimoniais.
Testar IDs REQ-010/022/024/025/026, cardinalidade, CPF SPE, Luxtory, rollback em cada ponto, replay/409, concorrência de formalizações/chaves/autoridade/admin, RLS e colunas, gates sem efeitos. Sem fechar IDs W11.

## Task 5 — Admin UI mínima e E2E

Ownership delegado: ownership presentation UI/i18n, src/app rotas W8, catalog apresentação para link de formalização, testes E2E/unit UI. Não reabrir DS nem funcionalidades antigas.
Entrada no detalhe da Second Home; formulários de formalização, alocação, administração, início e resultado com origem/versionamento/localização/modalidade/configuração/SPE/adquirentes/base civil/administração/grants/basis. Seleção de pessoas existentes por ids/mascaramento autorizado, nunca PII em payload. Todas strings em i18n, DS lx-* e AppShell existentes.
OpenAPI e handlers já prontos. REST e Server Actions compartilham caminho. Sem CRM/assinatura/pagamentos/termos financeiros. Base somente leitura após formalização; recusa de mudança/atraso claramente apresentada. Gate fechado mostra indisponibilidade sem bloquear leitura.
E2E em PostgreSQL local/Auth test, fixtures sintéticas fora de Production; jornada Owner e Co-Owner parcial a 390 com toque; axe 0 390/1440, overflow 0 320..1920, console limpo, teclado/foco. Capturas por tela/estado para checkpoint visual do fundador.

## Task 6 — Integração, revisão, PR draft e checkpoint

Principal atualiza runbook/environment/CHANGELOG, fronteira de grant no roadmap sem mudar status W8, NOTES; revisão STRIDE e do diff.
Rodar npm run verify, npm run test:e2e, npm run trace -- --expect REQ-010,REQ-022,REQ-024,REQ-025,REQ-026,PD-003, todos exit 0. Nenhuma exceção ou redução de gates.
Revisão independente de segurança/qualidade, correções com regressão, revisão final canônicos×spec×contrato×SQL×testes. Commit/push da branch e PR draft; acompanhar CI e corrigir falhas W8.
Checkpoint final informa branch/head/commits/PR/migrations/decisões/divergências/gates/CI/segurança/UI/Production/limites. Não fazer merge nem abrir gates operacionais.
