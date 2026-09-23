# Documentation

Documentation is structured around four purposes ([Diátaxis](https://diataxis.fr/)):

| Section                              | Purpose                | When to write here                  |
|--------------------------------------|------------------------|-------------------------------------|
| [`tutorials/`](tutorials/)           | Learning by doing      | Onboarding a brand-new user         |
| [`how-to/`](how-to/)                 | Solving a problem      | A repeatable recipe for a task      |
| [`reference/`](reference/)           | Looking up information | CLI flags, config schema, API codes |
| [`explanation/`](explanation/)       | Understanding context  | Why we built it this way            |

Plus three special directories that don't belong to Diátaxis but live here:

- [`specs/`](specs/) — Spec-Driven Development feature specs
- [`adr/`](adr/) — Architecture Decision Records
- [`api/`](api/) — OpenAPI / AsyncAPI contracts (API-First)
- [`security/`](security/) — threat models and security policies

## Where does this go?

- "How does our auth flow work?" → `explanation/`
- "How do I rotate the JWT signing key?" → `how-to/`
- "Build a feature step-by-step from nothing" → `tutorials/`
- "What does error code `validation_failed` mean?" → `reference/`
- "What are we even building here, what are the contracts?" → `specs/`
- "Why did we pick Postgres over DynamoDB?" → `adr/`
- "What attacks did we consider for the payments slice?" → `security/threats/`
