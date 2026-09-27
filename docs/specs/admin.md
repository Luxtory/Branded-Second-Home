# Spec: admin

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

Módulo `admin` do TECH-011 (`src/features/admin/`). A W2 entrega só a estrutura da superfície Admin (`02` §2); as
telas de operação chegam com cada wave (W3: catálogo).

## 1. Goal

Uma área `/admin` que só abre para staff autenticado com MFA (TECH-050) e que as waves seguintes preenchem.

## 2. Non-goals

- Nenhuma tela de operação, lista ou formulário do Admin (W3 em diante); nenhum componente novo no Design System.
- Logo no cabeçalho do Admin: os arquivos do kit só são servidos pelo Lab; a exposição do logo entra com as páginas
  públicas (W4).

## 3. Users / actors

- Staff com papel `admin` e/ou `super_admin` e sessão AAL2 (spec [`identity`](identity.md)).

## 4. User stories

- Como membro do staff, quero ver que entrei no Admin, com os papéis que posso exercer, e poder sair.

## 5. Contracts

### HTTP API

- Nenhuma. `/admin` é tela; o acesso é resolvido pelo módulo `identity` (API pública do slice).

### Events (if any)

- Nenhum.

### Domain model

- Nenhum estado próprio na W2.

## 6. Acceptance criteria

- [x] Sem sessão → `/entrar`; sessão AAL1 → `/entrar/mfa`; sessão AAL2 sem papel de staff → tela 403 sem dado; staff
      AAL2 → início do Admin com os papéis ativos e "Sair".
- [x] Sem banco ou sem Auth no ambiente (Preview, ADR-0007) → tela "indisponível", sem erro 500.
- [x] Textos pela camada i18n; classes `lx-*`; axe 0 em 390 e 1440 px (E2E).

## 7. Edge cases

- Papel revogado com a sessão aberta → a próxima navegação cai na tela 403.

## 8. Security considerations

- Authorization: toda página do Admin passa pela resolução de acesso do `identity` no servidor, a cada request.
- Threat model: [`docs/security/threats/identity-admin.md`](../security/threats/identity-admin.md).

## 9. Observability

- Sem logs próprios; os do `identity` cobrem sessão e indisponibilidade.

## 10. Rollout plan

- Junto com o `identity` (runbook "Preparar a W2").

## 11. Open questions

- Nenhuma.

## 12. References

- `02` §2 (superfície Admin), REQ-095. `03`: TECH-050. ADR-0003 (Design System), ADR-0008.
