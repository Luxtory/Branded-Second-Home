---
name: vertical-slice
description: Create a new feature following Vertical Slice Architecture with DDD layers. Use when the user asks to create a feature, module, slice, or implement new end-to-end functionality.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Vertical Slice Generator

When invoked via `/vertical-slice <feature-name>` (or auto-detected from the request), create a new feature under `src/features/<feature-name>/` following the project's DDD layout. This skill is **language-agnostic**: file extensions, framework imports and DTO/validation libraries depend on the project stack — read `CLAUDE.md` first.

## Required structure

```
src/features/<feature-name>/
├── domain/
│   ├── entities.<ext>          # aggregates, entities
│   ├── value_objects.<ext>     # immutable VOs
│   ├── events.<ext>            # domain events
│   └── repository.<ext>        # repository INTERFACE (port)
├── application/
│   ├── commands/               # write side (CQRS)
│   ├── queries/                # read side (CQRS)
│   └── handlers.<ext>          # use cases
├── infrastructure/
│   ├── repositories.<ext>      # concrete repository implementation
│   └── adapters.<ext>          # external services (HTTP clients, queues, …)
└── presentation/
    ├── routes.<ext>            # HTTP handler / UI entry / CLI command
    └── schemas.<ext>           # request/response DTOs (validated at boundary)
```

The exact file extensions and idioms depend on your stack:

| Stack          | Extension | Validation              | HTTP entry           |
|----------------|-----------|-------------------------|----------------------|
| Python/FastAPI | `.py`     | Pydantic                | `APIRouter`          |
| Python/Django  | `.py`     | DRF serializers         | `urls.py` / views    |
| Node/TS        | `.ts`     | Zod / Valibot           | Express/Fastify/Hono |
| Go             | `.go`     | go-playground/validator | `chi` / `gin` router |
| Rust/Axum      | `.rs`     | `validator` crate       | `axum::Router`       |
| Java/Spring    | `.java`   | `jakarta.validation`    | `@RestController`    |
| Ruby/Rails     | `.rb`     | dry-validation          | `routes.rb` + ctrl   |

## Workflow

1. **Check whether the feature already exists**: `ls src/features/<feature-name>/`. If it does, stop and ask whether to extend.
2. **Read the project's stack** from `CLAUDE.md` (`## Stack`) so file extensions and imports match what's already there.
3. **Create the directory tree** above (skip files that don't apply to your language — e.g. there's no `__init__.py` outside Python).
4. **Generate boilerplate** following the project's idioms: each layer's first file should compile/run as-is; that's the smoke test.
5. **Create matching tests** under `tests/features/<feature-name>/` mirroring the slice structure.
6. **Wire the feature in**: register the router/use cases in the project's composition root (e.g. `src/main.py`, `src/app.ts`, `cmd/server/main.go`).
7. **Update `CLAUDE.md`** if this feature introduces a new domain concept that other features will reference.
8. **Update `docs/specs/<feature-name>.md`** (use the template at `docs/specs/_template.md`) and the relevant API contract (`docs/api/openapi.yaml` or `asyncapi.yaml`) before/with the implementation.

## Quality rules

- Every entity has a stable identifier (`id`) and an audit timestamp (`created_at`)
- The repository **interface** lives in `domain/`; the implementation in `infrastructure/`
- Commands return a `Result`-style value or use the project's idiomatic error type — domain logic doesn't throw for control flow
- Domain events are dispatched through an event bus, never invoked directly
- Minimum coverage for the slice: **80%** in `domain/` and `application/`

## Anti-patterns

- ❌ Importing `infrastructure/` from inside `domain/` or `application/`
- ❌ Business logic in `presentation/` (routes, controllers, UI components)
- ❌ Using ORM models directly as entities (always map)
- ❌ Mixing commands and queries in the same handler
- ❌ Calling external services from `domain/`
