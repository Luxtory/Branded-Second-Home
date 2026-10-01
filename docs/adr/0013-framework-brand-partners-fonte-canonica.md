# 0013. Framework Brand Partners como fonte canônica da comunicação Brand Partners

- **Date**: 2026-10-01
- **Status**: Accepted
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: communication, documentation

## Context

O [ADR-0012](0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md) tornou o Framework B2C a fonte canônica da
comunicação B2C. A jornada Brand Partners ficou provisoriamente no método genérico da W3B (`framework-mestre.md`), no
Mentor, personalidade e tom de `luxtory.md` §1–§3 e no preenchimento `brand-partners.md`, até a entrega do Framework
B2B (`P-LX-05`). Em 2026-10-01 a Luxtory entregou o **Framework Mestre de Estratégia de Comunicação Brand Partners**,
já preenchido, e o fundador pediu os mesmos passos adotados no B2C. A estratégia anterior diverge do novo Framework em:
- desejo, problema e diferencial;
- Antagonista e Vilão;
- crenças (agora MCR);
- conscientização (agora Schwartz + Disposição);
- personalidade e tom;
- CTA ("Explore o potencial residencial da sua marca.").

O modelo de negócio não muda: `01 → 02 → 03` prevalecem em fatos (BR-380, REQ-104) e não são editados.

## Decision

1. **Arquivo congelado.** O Framework entra byte a byte em
   [`docs/specs/communication/framework-brand-partners.md`](../specs/communication/framework-brand-partners.md).
   - Recebido em 2026-10-01; sha256 `b97c8ae37dc911d7fa17d947f7fa5f622c17bd30e913bd672f46bd68ac2364a7`, fixado em
     `tests/communication.test.ts`.
   - Nunca é editado; muda só por nova versão da Luxtory.
2. **Mesmo arranjo do B2C.** [`brand-partners.md`](../specs/communication/brand-partners.md) passa a ser a aplicação
   rastreável do Framework, sem repeti-lo:
   - limites canônicos L1–L10 (remuneração sem valores, governança, direitos preexistentes, Concept, demanda,
     replicação, papéis, continuidade, evidências, CTA);
   - as 12 objeções respondidas com IDs;
   - o mapa de páginas;
   - o registro.

   Marca de referência: `[FW-BP: §8 P4]`.
3. **Substituição com trilha.** Decisões e hipóteses anteriores ficam no registro com status
   `substituída em 2026-10-01 → <destino>`; a versão anterior é o commit `7da1276`. A exceção à regra "conteúdo
   existente só é estendido", autorizada pelo fundador para o B2C, passa a valer também para Brand Partners.
4. **Mentor único, definido pelos Frameworks.** Nos dois Frameworks, o Mentor é a Luxtory, com a mesma tabela OCEAN.
   - `luxtory.md` §2–§3 e `D-LX-02` a `D-LX-05` deixam de valer: personalidade e tom vêm do Framework de cada
     jornada.
   - `D-LX-07` também deixa de valer, porque os dois Frameworks nomeiam categorias de alternativas.
   - `luxtory.md` fica com guardrails, fatos e nomenclatura transversais.
5. **Método genérico substituído.** `framework-mestre.md` não vale para nenhuma jornada. O arquivo fica, com aviso e
   ponteiros. Protagonista novo só ganha comunicação com Framework próprio entregue pela Luxtory.
6. **CTA sem destino até o `02`.**
   - O texto do CTA ("Explore o potencial residencial da sua marca.") e o destino (conversa ou qualificação
     estratégica) vêm do Framework.
   - O `02` §2 não prevê essa superfície: páginas e CTA continuam bloqueados até ela entrar no `02` (`P-BP-01`,
     `D-BP-12`).
7. **Imposição mecânica.**
   - O teste da camada verifica o sha256 de cada Framework e resolve toda referência `[FW-B2C: …]` e `[FW-BP: …]`
     contra o Framework certo.
   - Também impede que uma aplicação cite o Framework da outra jornada.
   - As guardas lexicais passam a recusar receita, vendas, demanda, escala, royalty e remuneração garantidos ou
     assegurados (Framework Brand Partners §8 P4 e P5; BR-374).

## Consequences

### Positive

- As duas jornadas seguem o mesmo arranjo: Framework congelado + aplicação + base transversal. Não sobra estratégia
  concorrente em nenhum arquivo.
- O Mentor tem um só perfil, nos dois Frameworks; termina a divergência temporária registrada no ADR-0012.
- O que o Framework afirma sobre remuneração, governança, demanda e replicação fica preso aos BRs que o sustentam.

### Negative

- As páginas e o CTA de Brand Partners continuam sem poder ser construídos até a Luxtory incluir a superfície no `02`.
- Nova versão de qualquer Framework exige troca de arquivo, novo sha256 e revisão da aplicação no mesmo PR.

### Neutral / follow-ups

- `P-BP-01`: superfície pública e CTA de Brand Partners no `02`. Só então entra uma wave de páginas Brand Partners.
- `P-BP-02`: Concepts com exposição de marca autorizada.
- `P-LX-03`: revisão jurídica, ampliada para "licenciamento", remuneração e menção a empresas concorrentes.

## Alternatives considered

- **Manter `framework-mestre.md` como método para Protagonistas futuros.** Sua estrutura (sem JTBD, MCR, Schwartz,
  Panksepp) diverge da estrutura dos Frameworks entregues. Mantê-lo seria um segundo método concorrente. Rejeitada.
- **Manter `luxtory.md` §1–§3 como personalidade comum.** Os dois Frameworks já definem o Mentor; uma terceira
  definição divergiria deles. Rejeitada.
- **Reescrever o Framework no formato da aplicação.** Seria paráfrase de fonte canônica. Rejeitada (como no
  ADR-0012).
- **Criar o CTA apontando para um destino provisório.** Seria inventar uma superfície que o `02` não prevê (TECH-001,
  regra "funcionalidade nova entra no `02` primeiro"). Rejeitada.

## References

- [ADR-0011](0011-camada-de-comunicacao-publica.md), [ADR-0012](0012-framework-b2c-fonte-canonica-da-comunicacao-b2c.md)
- Contrato: [`docs/specs/communication.md`](../specs/communication.md)
- Canônicos: `01` §1, §3, §5, §37 (BR-010…BR-025, BR-040…BR-043, BR-350, BR-374, BR-380) · `02` §1, §2, §16 · `03` §13
- [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md) → Wave 3D
