# 0001. Record architecture decisions

- **Date**: 2026-04-30
- **Status**: Accepted
- **Deciders**: project author(s)
- **Tags**: process, documentation

## Context

Architectural decisions accumulate fast. Six months in, nobody remembers why
we picked one database over another, why a particular boundary exists, or why
a "simple" change three sprints ago was actually load-bearing. Verbal context
disappears as people rotate; commit messages don't carry enough motivation;
wiki pages drift from the code.

We need a lightweight way to record these decisions, version them with the
code, and keep them readable years later.

## Decision

We will record architecturally significant decisions as **Architecture
Decision Records (ADRs)** under `docs/adr/`, using the format described by
Michael Nygard ("Documenting Architecture Decisions", 2011).

- One ADR per decision, sequentially numbered: `NNNN-<short-title>.md`
- Use `_template.md` in this directory as the starting point
- Status values: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-XXXX`
- An ADR is **immutable once accepted** — to change a decision, write a new
  ADR that supersedes it and update the old one's `Status` accordingly
- ADRs are reviewed in the same PR as the change they describe

What counts as "architecturally significant"? Anything that:

- Crosses a bounded context or service boundary
- Picks a technology that the project depends on long-term (DB, framework, queue)
- Constrains future implementations (e.g. "all events go through Kafka")
- Trades off a non-trivial property (consistency, latency, cost, complexity)

Refactors, bug fixes, dependency bumps, and routine feature work do **not**
need ADRs.

## Consequences

### Positive

- Future maintainers (including future-us) can answer "why did we do it this way?" without archaeology.
- New team members onboard by reading ADRs in chronological order.
- Decisions become reviewable, in version control, alongside the code.
- Forces explicit consideration of alternatives and consequences before committing.

### Negative

- Small overhead per architecturally significant change (typically 15–30 minutes to write a good ADR).
- Risk of ADR rot if status updates are skipped — mitigated by reviewing ADRs touched by a PR.

### Neutral / follow-ups

- The first few ADRs set the tone. Keep them tight; verbose early ADRs invite verbose future ones.

## Alternatives considered

- **Wiki / Confluence**: drifts from the code, no review process, no diff history tied to commits.
- **Long-form design docs only (no ADRs)**: heavier-weight, encourages skipping the record entirely for medium-impact decisions.
- **Commit messages**: can carry context, but not discoverable as a body of decisions.

## References

- Michael Nygard, "Documenting Architecture Decisions" — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- adr-tools — https://github.com/npryce/adr-tools
