# Spec: <feature-name>

> Spec-Driven Development: this document is written **before** the implementation.
> It ships in the same PR as the implementation. Update it whenever the contract
> or scope changes.

## 1. Goal

What problem does this feature solve? In one paragraph.

## 2. Non-goals

What is explicitly out of scope. Listing this prevents scope creep and orients
future readers.

## 3. Users / actors

Who interacts with this feature, and in what role (anonymous user, authenticated
user, admin, internal system, third-party webhook).

## 4. User stories

Format: `As a <role>, I want <capability>, so that <benefit>.`

- ...
- ...

## 5. Contracts

### HTTP API

Reference the canonical contract (do not duplicate it):

- See `docs/api/openapi.yaml` — operations: `<list>`

### Events (if any)

- See `docs/api/asyncapi.yaml` — channels: `<list>`

### Domain model

Aggregates, entities, value objects introduced or modified by this feature:

- `Aggregate.Foo` — invariants: ...
- `Entity.Bar` — relationships: ...
- `ValueObject.Baz` — validation rules: ...

## 6. Acceptance criteria

Testable statements. Each becomes at least one automated test.

- [ ] Given X, when Y, then Z.
- [ ] ...

## 7. Edge cases

What can go wrong, and what the system should do about it.

- Empty input: ...
- Concurrent writes: ...
- Third-party timeout: ...
- Partial failure / retry semantics: ...

## 8. Security considerations

- Authentication: who has to be authenticated to invoke this?
- Authorization: which roles/scopes are required for each operation?
- Data classification: PII? PCI? credentials? secrets?
- Threat model: link to `docs/security/threats/<feature>.md` if the attack surface changed.

## 9. Observability

What we expect to see when this feature is healthy or unhealthy.

- Logs (events to emit, with `correlation_id`):
- Metrics (counters/histograms to expose):
- Alerts (thresholds and on-call destination):

## 10. Rollout plan

- Feature flag: `<flag-name>` (default off / on / percentage)
- Migration steps (if any data migration is required)
- Backwards compatibility: how existing clients keep working
- Rollback procedure if something goes wrong

## 11. Open questions

Anything still undecided. Track here so reviewers can weigh in before
implementation locks them down.

## 12. References

- Linked ADR(s): `docs/adr/NNNN-<title>.md`
- Linked issue/ticket(s):
- Prior art / inspiration:
