# Base Luxtory — guardrails, fatos e nomenclatura transversais

> O que vale para todas as jornadas. Contrato e convenções: [`../communication.md`](../communication.md). Decisão nova
> ou alterada passa pelo registro (§7).
> **Desde 2026-10-01** ([ADR-0012](../../adr/0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md),
> [ADR-0013](../../adr/0013-framework-brand-partners-fonte-canonica.md)): cada jornada tem seu Framework canônico —
> [B2C](framework-b2c.md) e [Brand Partners](framework-brand-partners.md) —, que define Mentor, personalidade e tom. As
> §2 e §3 da versão anterior (personalidade e tom-base) foram substituídas por eles; a numeração das demais seções é
> mantida porque outros documentos as citam. Versão anterior: commit `7da1276`.

## 1. Mentor, personalidade e tom

**Mentor = Luxtory**, nas duas jornadas. Papel, personalidade (OCEAN), regra afetiva e tom vêm do Framework da jornada:
B2C `[FW-B2C: §5, §9, §10, §10.1, §10.2, §11]`; Brand Partners `[FW-BP: §5, §9, §10, §10.1, §10.2, §11]`. Pelo modelo,
a Brand Partner aporta identidade, lifestyle, desejo e comunidade; a Luxtory traduz esse universo em um Residence
Concept replicável e qualifica, estrutura e converte a demanda `[F: 01 §1, BR-013, BR-041]`.

## 4. Guardrails compartilhados

| Nunca | Fonte |
|---|---|
| "cota" ou derivados; "diária(s)" ou preço por dia para Co-Owner — é Ação com Direito de Uso | BR-373, REQ-100, `02` §1 |
| prometer rentabilidade, valorização, liquidez ou renda — nem para Titulares nem para Brand Partners; simulador de locação só como estimativa sem garantia | BR-374, REQ-101 |
| tratar Crédito Luxchange como moeda, investimento, saldo resgatável ou garantia de disponibilidade | BR-190, BR-192 |
| sugerir que manifestar interesse é compra, ou que os dias indicados são direito | BR-050, BR-060, BR-065 |
| sugerir que o Membership dá propriedade, Direito de Uso ou prioridade de calendário, ou que é preciso para o uso próprio | BR-144, BR-145, BR-147 |
| criar diferença entre Owner e Co-Owner que o `01` não tem; dar a um peso maior que ao outro | BR-376, REQ-103 |
| exibir marca ou nome de Brand Partner sem autorização de exposição registrada, ou depois do encerramento | BR-015, BR-021 |
| fixar na copy valores de parâmetro (Membership, Fee, multiplicador, descontos) ou calcular preço no front | BR-143, BR-360, TECH-001, ADR-001 do `03` |
| oferecer reforma, adaptação ou imóvel existente | BR-054 |
| inventar prova (depoimento, case, número, prêmio, imprensa, parceira, foto) — ver `P-LX-01` e `P-LX-02` | BR-352, TECH-001 |
| usar a copy de demonstração do Lab como fonte | [`../communication.md`](../communication.md) §3 |
| ligar uma jornada à outra | `D-LX-01` |

Pares que não se confundem: Ação × Direito de Uso × reserva × Crédito `[F: BR-070]` · Membership × propriedade
`[F: BR-144, BR-147]` · convidado ou locatário × Titular `[F: BR-261, BR-331]` · interesse × aquisição `[F: BR-050,
BR-065]` · Residence Concept × Residence Edition × Residence `[F: BR-001]`.

## 5. Fatos transversais

Só os que as duas jornadas usam; o restante é citado direto na aplicação de cada Framework.

1. Cadeia do modelo: Brand Partner → Brand DNA → Residence Concept → Residence Edition → Owner ou Co-Owner → Design &
   Build → Residence → Luxtory Club `[F: 01 §1]`.
2. Toda Residence é construída do zero a partir de um Residence Concept aprovado; não há retrofit `[F: BR-003, BR-053,
   BR-054]`.
3. O Concept é replicável e identifica seus elementos essenciais; personalizar, sim; descaracterizar, não
   `[F: BR-002, BR-013, BR-014, BR-017]`.
4. A Brand Partner continua titular da marca e do Brand DNA, e aprova o plano de uso da marca `[F: 01 §3, BR-010,
   BR-012]`.
5. Oferta comercial só existe por uma Residence Edition; interesse pode existir antes dela `[F: BR-004, BR-030]`.

## 6. Nomenclatura pública — `D-LX-06`

- Termos canônicos em inglês como nomes próprios, explicados em português na primeira menção da página: Branded Second
  Home, Residence Concept (depois, "Concept"), Residence Edition, Residence, Owner, Co-Owner, Brand Partner, Luxtory
  Club, Membership. Ação e Direito de Uso sempre em português `[F: 02 §1]`.
- Vitrine pública de Concepts no B2C: **Coleção** (recomendação do DS, open question 5).
- Alternativas e contraste: as categorias de alternativas são nomeadas para mostrar seus trade-offs
  `[FW-B2C: §2, P2]` `[FW-BP: §15]`. Concorrente só aparece como Vilão quando houver evidência, sem atribuir intenção
  maliciosa `[FW-B2C: §5, §14]`; no Brand Partners, o Vilão é uma lógica, não uma empresa `[FW-BP: §5]`. Nome de empresa
  concorrente na copy passa pela revisão jurídica (`P-LX-03`).

- **Site B2C (`D-LX-08`):** a casa é **Second Home**; Residence Concept → **Home Concept**; Residence Edition →
  **Home Edition**. Branded Second Home (categoria), Luxtory Club, Membership e a página **Coleção** continuam. Admin,
  banco, `01/02/03` e instrumentos jurídicos usam os nomes canônicos.
- **Site Brand Partners (`D-BP-16`):** a mesma nomenclatura, agora no próprio Framework Brand Partners (versão de
  2026-10-12) `[FW-BP: §2]`; o estágio formal do mecanismo é **Second Home**, e "Home" só aparece como linguagem natural.

## 7. Registro

| ID | Decisão | Status | Base |
|---|---|---|---|
| D-LX-01 | Jornadas B2C e Brand Partners separadas: nenhuma navegação, CTA ou link de uma leva à outra | aprovada em 2026-09-29 | decisão da Luxtory no planejamento da W3B |
| D-LX-02 | Papel do Mentor e princípios globais (§1 da versão anterior) | substituída em 2026-10-01 → `[FW-B2C: §1, §5]` · `[FW-BP: §1, §5]` | `01` §1, BR-041; DS spec §1; DS ref §8, §11 |
| D-LX-03 | Personalidade: curadora e arquiteta de experiências (§2 da versão anterior) | substituída em 2026-10-01 → `[FW-B2C: §10]` · `[FW-BP: §10]` | DS spec §1; DS ref §11, §14 |
| D-LX-04 | Tom-base "conversacional culto", reconciliando o "coloquial" do DS §11 (§3 da versão anterior) | substituída em 2026-10-01 → `[FW-B2C: §11]` · `[FW-BP: §11]` | DS ref §11; Mestre §8 |
| D-LX-05 | Regras observáveis do tom e variação pelos 5Ps (§3 da versão anterior) | substituída em 2026-10-01 → `[FW-B2C: §9, §11]` · `[FW-BP: §9, §11]` | Mestre §8, §9 |
| D-LX-06 | Nomenclatura pública: termos canônicos + "Coleção" (§6) | aprovada em 2026-09-29 | `02` §1; DS spec §11 (open question 5) |
| D-LX-07 | Contraste com convenções, nunca com concorrentes nomeados | substituída em 2026-10-01 → `[FW-B2C: §2, §5]` · `[FW-BP: §5, §15]` | Mestre §4 (Vilão); REQ-100 |
| D-LX-08 | Nomenclatura pública do site B2C (§6), complementando `D-LX-06`: Second Home, Home Concept e Home Edition no lugar de Residence, Residence Concept e Residence Edition; nomes canônicos no Admin, no banco, nos canônicos e nos instrumentos | aprovada em 2026-10-01 (fundador) | `01` §1, §2; BR-001, BR-004 |

| ID | Pendência | Bloqueia |
|---|---|---|
| P-LX-01 | Provas externas — depoimentos, cases, números, prêmios, imprensa: não existem | qualquer uso de prova social ou dado de mercado |
| P-LX-02 | Fotografia oficial de Concepts e Residences (P-1 do roadmap); até lá, Frame tipográfico | PICTURE com fotografia real |
| P-LX-03 | Revisão jurídica da comunicação pública (Ação de SPE para público indeterminado, uso de marcas de terceiros, o termo "posse" no B2C, o termo "licenciamento" e a remuneração no Brand Partners, menção comparativa a categorias de alternativas e a empresas concorrentes) | go-live das páginas, não os documentos |
| P-LX-04 | Brand guide oficial: quando chegar, entra pelo protocolo de conflito do contrato | nada até lá |
| P-LX-05 | Framework B2B (Brand Partners), anunciado pelo fundador em 2026-09-30 | resolvida em 2026-10-01: Framework Brand Partners recebido ([ADR-0013](../../adr/0013-framework-brand-partners-fonte-canonica.md)) |
