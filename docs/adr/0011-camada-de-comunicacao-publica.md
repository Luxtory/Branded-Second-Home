# 0011. Camada de comunicação das páginas públicas: Framework Mestre e Frameworks preenchidos

- **Date**: 2026-09-29
- **Status**: Accepted
- **Deciders**: Luxtory, Engenharia
- **Tags**: communication, frontend, documentation, design-system

## Context

O R1 (site público) começa na W4. Os canônicos dizem o que é verdade sobre o negócio, o produto e a técnica, e o
Design System diz como a interface se materializa — mas nada dizia **o que comunicar, para quem, em que ordem e com que
tom**. Sem essa camada, cada página (e cada IA) reinterpretaria a estratégia, com risco de inventar fatos, confundir
conceitos canônicos ou produzir comunicação genérica. A Luxtory forneceu um Framework Mestre de Estratégia de
Comunicação e pediu que ele, preenchido, se tornasse a fonte da comunicação pública — para B2C e para Brand Partners,
em jornadas separadas.

## Decision

1. **Contrato** em [`docs/specs/communication.md`](../specs/communication.md): precedência, protocolo de conflito,
   classificação F/D/H/P, relação 5Ps × Design System, campos do brief de página, fluxo e checklist.
2. **Método** em [`docs/specs/communication/framework-mestre.md`](../specs/communication/framework-mestre.md): versão
   aprovada do Mestre, versionada pelo Git; alterá-la exige revisão de impacto nos preenchimentos.
3. **Preenchimentos**: uma base comum ([`luxtory.md`](../specs/communication/luxtory.md) — Mentor, personalidade,
   tom-base, princípios, guardrails, poucos fatos transversais) e um arquivo por Protagonista ([`b2c.md`](../specs/communication/b2c.md),
   [`brand-partners.md`](../specs/communication/brand-partners.md)), com mapa de jornada e registro próprio de decisões.
4. **Fatos citados direto** dos canônicos (IDs), sem camada intermediária de paráfrase.
5. **Pares com domínios separados:** Design System = forma da UI; Framework preenchido = mensagem, narrativa, tom,
   provas, CTA e intenção de UX. 5Ps × gramática do DS é relação semântica, não estrutural; única convenção fixa:
   PICTURE = Hero nas Homes com arco completo.
6. **Brief de página** na spec do módulo da wave que constrói a página — nenhum documento isolado por página.
7. **Conflitos** (inclusive com um brand guide futuro): detectar → comparar responsabilidades → propor reconciliação →
   aprovar → atualizar a fonte. Nenhuma fonte sobrescreve automaticamente decisão aprovada.
8. **Integridade mínima** por teste (`tests/communication.test.ts`): IDs canônicos citados existem, links internos
   resolvem, seções mínimas presentes, referências D/H/P definidas. O resto é Git e revisão humana.

## Consequences

### Positive

- Uma IA encontra, a partir do `CLAUDE.md`, o método, a estratégia do público, os fatos permitidos, o papel da página e
  o tom — e chega a um brief sem reinventar a estratégia.
- Fato, decisão de comunicação, hipótese e pendência ficam distinguíveis; decisão de branding nunca vira regra.
- Identidade da marca escrita uma vez e compartilhada pelos dois públicos.

### Negative

- Toda nova versão dos canônicos passa a incluir a revisão das citações nos preenchimentos.
- Decisões de comunicação novas exigem aprovação registrada antes de chegar às páginas.

### Neutral / follow-ups

- W4: ajustar o próprio escopo ao mapa de jornada B2C (Home e "Como funciona") e decidir o conteúdo público por Concept.
- Páginas e CTA de Brand Partners: entram no `02` antes do código (`P-BP-01`).

## Alternatives considered

- **Colocar o Framework em `docs/specs/canonical/`.** Misturaria método de comunicação com a hierarquia 01 → 02 → 03 de
  definições de negócio. Rejeitada.
- **Ampliar o Design System (§2 "Arco de página", §11 "Copy e voz").** O DS é a fonte da forma da UI; somar a ele
  estratégia de comunicação juntaria dois domínios. Rejeitada; o DS ganha só ponteiros.
- **Base de fatos parafraseada com IDs próprios** entre canônicos e preenchimentos. Mais uma camada, mais drift e mais
  carga para quem lê. Rejeitada: fatos citados direto.
- **Um documento por página.** Duplicaria posicionamento e envelheceria rápido. Rejeitada: brief na spec da wave.
- **Um preenchimento único para todos os públicos.** Misturaria desejo, crenças, provas e CTA de públicos que o negócio
  trata separadamente. Rejeitada.
- **Hash do Mestre fixado em teste.** O Git já versiona e mostra mudanças. Rejeitada.

## References

- Canônicos: `01` §1–§5, §37 (BR-373, BR-374) · `02` §1, §2, §16 · `03` §13
- [ADR-0003](0003-design-system-camada-compartilhada.md), [ADR-0009](0009-superficies-de-produto-mobile-first.md)
- [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md) → Wave 3B
