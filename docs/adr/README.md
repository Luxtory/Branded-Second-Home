# Architecture Decision Records

Decisions that shape this project's architecture, recorded in the format
described by Michael Nygard. The ADR process itself is established in
[ADR-0001](0001-record-architecture-decisions.md).

## Index

| #    | Title                                                                | Status   |
|------|----------------------------------------------------------------------|----------|
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md) | Accepted |

## Adding a new ADR

1. Copy `_template.md` to `NNNN-<short-title>.md` (next sequential number).
2. Fill in context, decision, consequences, and alternatives.
3. Open a PR. Review happens alongside the code changes the ADR justifies.
4. Once merged, append it to the index above.

## Status lifecycle

- **Proposed** — under discussion
- **Accepted** — current decision; in effect
- **Deprecated** — no longer recommended, but still informative
- **Superseded by ADR-XXXX** — replaced by a newer decision; link to the successor
