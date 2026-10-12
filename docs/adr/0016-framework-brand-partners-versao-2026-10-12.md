# 0016. Nova versão do Framework Brand Partners (Home Concept, Home Edition e Second Home)

- **Date**: 2026-10-12
- **Status**: Accepted
- **Deciders**: Luxtory (fundador), Engenharia
- **Tags**: communication, documentation

## Context

O [ADR-0013](0013-framework-brand-partners-fonte-canonica.md) fixou o Framework Brand Partners recebido em 2026-10-01
(sha256 `b97c8ae3…2364a7`) e definiu que uma nova versão troca o arquivo inteiro, o sha256 e revisa a aplicação no
mesmo PR. Em 2026-10-12 o fundador entregou uma nova versão (sha256 `c3831d92…63a083`) e aprovou o Decision & Approval
Pack da BP1.1 (D7).

O diff linha a linha contra a versão anterior mostra 20 linhas diferentes:

- 19 trocam só nomenclatura: Residence Concept → Home Concept, Residence Edition → Home Edition, Residence → Second Home;
  categoria "Branded Home / Second Home" no §8 P3 e "branded Homes" no §15;
- 1 muda só espaço em branco (linha 1495).

Desejo, JTBD, pertencimento, Promise, Proof, monetização, condições, tom e CTA não mudam. O arquivo recebido tinha uma
inconsistência interna: o mecanismo do §2 terminava em "→ Home →", e o §8 P4 e o §15, em "→ Second Home →".

## Decision

1. **Arquivo adotado.** O arquivo do fundador entra em
   [`framework-brand-partners.md`](../specs/communication/framework-brand-partners.md) com uma única correção,
   autorizada pelo fundador em 2026-10-12: no mecanismo do §2, "Home" passa a "Second Home". O estágio formal do
   mecanismo é sempre:
   **Brand Partner → Brand DNA → Home Concept → Home Edition → Owner/Co-Owner → Design & Build → Second Home → Luxtory
   Club.** O sha256 da versão adotada é `47ccb4d6160a3b97cab0ef5334d17ca060252affdb9d92512b0473dc04e9ad04`, fixado em
   `tests/communication.test.ts`. O arquivo continua congelado: muda só por nova versão da Luxtory.
2. **Atualização editorial, não renomeação do domínio.** A nomenclatura vale para a comunicação pública Brand Partners
   (`D-BP-16`). "Home" pode aparecer como linguagem natural, nunca como nome formal do estágio. Admin, banco, código,
   `01/02/03` e instrumentos jurídicos continuam com os nomes canônicos (Residence Concept, Residence Edition,
   Residence), como no `D-LX-08`. As âncoras de fato da aplicação citam os nomes dos BRs.
3. **Aplicação revisada no mesmo PR.** [`brand-partners.md`](../specs/communication/brand-partners.md) registra a
   nomenclatura (`D-BP-16`), a copy BP1.1 (`D-BP-15`, que substitui `D-BP-14` com trilha), as hipóteses estratégicas
   fora da copy (`H-BP-09` cross-brand, `H-BP-10` BR-121) e as pendências de fotografia (`P-BP-03`) e de monetização
   opcional (`P-BP-04`).

## Consequences

### Positive

- Framework, copy e site falam a mesma língua (Home Concept, Home Edition, Second Home), sem decisão paralela de
  nomenclatura para a jornada Brand Partners.
- O domínio não muda: nenhuma migration, tipo, rota ou instrumento é renomeado.

### Negative

- Comunicação e domínio passam a usar nomes diferentes para o mesmo objeto. Quem lê os dois precisa da tabela de
  correspondência (`luxtory.md` §6).

### Neutral / follow-ups

- A categoria "Branded Home / Second Home" (§8 P3) e "branded Homes" (§15) ficam como estão no Framework; a página
  pública usa "Branded Second Home", a categoria da marca no §2.
- `P-LX-03` (revisão jurídica) continua gate de go-live.

## Alternatives considered

- **Usar o arquivo do fundador só como insumo, mantendo Residence no canônico.** Duas nomenclaturas oficiais e copy
  fora do Framework literal. Rejeitada no D7.
- **Adotar o arquivo sem a correção do §2.** Manteria dois nomes para o mesmo estágio do mecanismo. Rejeitada pelo
  fundador.
- **Renomear também o domínio (código, banco, Admin).** Fora do escopo de uma atualização editorial e contrário à
  hierarquia `01 → 02 → 03`. Rejeitada.

## References

- [ADR-0013](0013-framework-brand-partners-fonte-canonica.md), [ADR-0011](0011-camada-de-comunicacao-publica.md)
- Aplicação: [`brand-partners.md`](../specs/communication/brand-partners.md); base: [`luxtory.md`](../specs/communication/luxtory.md) §6
- Spec: [`catalog` §14.9](../specs/catalog.md#149-bp11--brand-partners-communication-upgrade-2026-10-12)
