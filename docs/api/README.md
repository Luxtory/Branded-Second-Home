# API Contracts

API-First: contracts here are the source of truth. Update them **before**
touching handlers.

- [`openapi.yaml`](openapi.yaml) — REST contract (OpenAPI 3.1)
- [`asyncapi.yaml`](asyncapi.yaml) — event/async contract (AsyncAPI 3.0)

## Versioning

- **Breaking changes** bump the major version and ship with a migration note
  for clients (`CHANGELOG.md`).
- **Additive changes** (new endpoint, new optional field) bump minor.
- **Doc-only changes** bump patch.

## Validating locally

[CUSTOMIZE] pick the validators that match your CI:

```bash
# OpenAPI
npx @redocly/cli lint docs/api/openapi.yaml
# or
npx @stoplight/spectral-cli lint docs/api/openapi.yaml

# AsyncAPI
npx @asyncapi/cli validate docs/api/asyncapi.yaml
```
