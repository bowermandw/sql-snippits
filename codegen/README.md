# `gen:feature` — data-layer generator

Reverse-engineers a full data layer from an **existing** SQL Server table and its
CRUD procs. Given a table name, it introspects the live database and writes every
artifact a feature needs, then wires it into the shared files.

```bash
pnpm gen:feature <table> [--force] [--with-count]
```

DB config comes from `DATABASE_URL` (or `MSSQL_*`), loaded from the repo-root
`.env` — the same as the migration runner.

## What it generates

| Artifact | Path |
| --- | --- |
| Shared zod schema + type | `packages/types/src/<table>.ts` |
| Migration (+ down) | `packages/db/src/migrations/NNN_<table>.sql` |
| Table snapshot | `packages/db/schema/tables/<table>.sql` |
| Proc snapshots (one per proc) | `packages/db/schema/stored-procedures/crd.<table>_*.sql` |
| Repository | `packages/db/src/repositories/<table>.repo.ts` |
| Data-layer test | `packages/db/test/<table>.test.ts` |

It also makes **idempotent** edits to four shared files: `types/src/index.ts`,
`db/src/index.ts`, `db/src/database.ts` (the `<Entity>Table` interface + the
`Database` map), and `db/src/connection.ts` (`JSON_COLUMNS`, for any ISJSON
column). Re-running never duplicates these.

### Overwrite-guarding

Every generated file is skipped (not overwritten) if it already exists, unless
you pass `--force`. This matters most for the **schema snapshots**: the proc
snapshots come verbatim from the catalog, and the **table snapshot is
reconstructed DDL**, so a curated `schema/tables/<table>.sql` is higher-fidelity
than what the generator emits. The table snapshot is therefore protected exactly
like the proc snapshots — `gen:feature <table>` will leave an existing table file
in place (the run reports it under `skipped`), and only `--force` regenerates it.

## How it decides types

- **Row shape** (zod schema, row interface, repo `Row` type) comes from
  `sys.dm_exec_describe_first_result_set_for_object` on `crd.<table>_select` —
  the only authoritative source for columns + nullability when the proc does
  `SELECT *`, projects, or joins. If SQL Server can't determine the shape, it
  **falls back to the table columns and warns** — verify the result by hand.
- **Enums** come from a column `CHECK (... IN (...))` constraint → a `z.enum`
  tuple. **JSON columns** come from an `ISJSON(...)` check → `z.unknown()` and a
  `JSON_COLUMNS` entry. An SQL type with no mapping makes the generator throw
  rather than guess (`typemap.ts`).

## CRUD-proc convention

Targets `crd.<table>_{insert,update,select,delete}`. A single `_select` does
double duty: `getById` passes the key, `list` passes the key as `null`. The repo
emits a method only for the procs that exist; a missing proc or a composite PK is
reported and its method skipped (wire those by hand).

## `--with-count`

`listPage()`/`count()` need a `crd.<table>_count` proc. If one doesn't exist,
`--with-count` **synthesizes** a conventional one (`@user_id` first, the
`procedure_history` audit call, `SELECT COUNT(*) AS total`) into the migration and
its snapshot, and wires `count()` + `listPage()` into the repo. Run `pnpm migrate`
afterward to create it in the DB.

## After generating

Review the files, then:

```bash
pnpm format        # the emitters are prettier-clean, but enums/joins may reflow
pnpm typecheck
pnpm migrate       # if you added/synthesized objects to an empty DB
pnpm --filter @app/db test
```

## Module map

- `generate.ts` — CLI + model assembly + file writing (overwrite-guarded)
- `introspect.ts` — every read-only catalog query
- `typemap.ts` — SQL → zod/TS, enum/JSON/nullable, DDL type rendering
- `emitters.ts` — pure `model → string` per file (+ `synthesizeCountProc`)
- `registrar.ts` — idempotent shared-file edits
- `model.ts` / `names.ts` — shared shapes and identifier casing
