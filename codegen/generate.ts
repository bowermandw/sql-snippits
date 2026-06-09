// =============================================================================
// gen:feature — reverse-engineer a full data layer from an existing table.
//
//   pnpm gen:feature <table> [--force]
//
// Given a table that already has its crd.<table>_{insert,update,select,delete}
// procs, this introspects the live DB and writes the shared zod types, the
// migration (+down), the table & proc snapshots, the row interface, the repo,
// and a CRUD/read-contract test — then wires the feature into the four shared
// files. Existing generated files are skipped unless --force; shared-file edits
// are always idempotent.
//
// DB config comes from DATABASE_URL (or MSSQL_* — see connection.ts), loaded
// from the repo-root .env, exactly like the migration runner.
// =============================================================================

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as dotenvConfig } from 'dotenv';

import { createDb, destroyDb } from '../connection.js';
import type { DbExecutor } from '../connection.js';

import {
  detectCrudProcs,
  describeResultSet,
  getCheckConstraints,
  getDefaults,
  getIndexes,
  getPrimaryKey,
  getTableColumns,
} from './introspect.js';
import type { FeatureModel, FieldModel } from './model.js';
import { enumConstName, toPascalCase } from './names.js';
import { registerFeature } from './registrar.js';
import { buildField, isJsonCheck, parseBaseType, parseEnumValues } from './typemap.js';
import {
  emitMigration,
  emitMigrationDown,
  emitProcSnapshots,
  emitRepository,
  emitTableSnapshot,
  emitTest,
  emitTypes,
  synthesizeCountProc,
} from './emitters.js';

const codegenDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(codegenDir, '..', '..', '..', '..');

dotenvConfig({ path: path.join(repoRoot, '.env') });

interface Cli {
  table: string;
  force: boolean;
  /** Synthesize a crd.<table>_count proc when the DB has none. */
  withCount: boolean;
}

function parseArgs(argv: string[]): Cli {
  const force = argv.includes('--force');
  const withCount = argv.includes('--with-count');
  const table = argv.find((a) => !a.startsWith('--'));
  if (!table) {
    throw new Error('Usage: pnpm gen:feature <table> [--force] [--with-count]');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table name "${table}" (expected snake_case like "widget").`);
  }
  return { table, force, withCount };
}

// -----------------------------------------------------------------------------
// Model assembly
// -----------------------------------------------------------------------------

async function buildFeatureModel(
  db: DbExecutor,
  table: string,
  warnings: string[],
): Promise<FeatureModel> {
  const columns = await getTableColumns(db, table);
  if (columns.length === 0) {
    throw new Error(
      `Table dbo.${table} not found (no columns). Is it created and named correctly?`,
    );
  }

  const pkColumns = await getPrimaryKey(db, table);
  const checks = await getCheckConstraints(db, table);
  const defaults = await getDefaults(db, table);
  const indexes = await getIndexes(db, table);
  const procs = await detectCrudProcs(db, table);

  // Derive enum vocabularies + JSON columns from the CHECK constraints.
  const enumByColumn = new Map<string, string[]>();
  const jsonColumns = new Set<string>();
  for (const chk of checks) {
    if (chk.columnName) {
      if (isJsonCheck(chk.definition, chk.columnName)) jsonColumns.add(chk.columnName);
      const vals = parseEnumValues(chk.definition, chk.columnName);
      if (vals) enumByColumn.set(chk.columnName, vals);
    } else {
      // Table-level check — only mine it for ISJSON (don't guess enums).
      for (const col of columns) {
        if (isJsonCheck(chk.definition, col.name)) jsonColumns.add(col.name);
      }
    }
  }

  const makeField = (name: string, base: string, isNullable: boolean): FieldModel => {
    const enumValues = enumByColumn.get(name) ?? null;
    return buildField(name, base, isNullable, {
      isJson: jsonColumns.has(name),
      enumValues,
      enumConst: enumValues ? enumConstName(table, name) : undefined,
    });
  };

  // Authoritative row shape: prefer the select proc's first result set.
  let fields: FieldModel[];
  let resultFromProc = false;
  const selectProc = procs.select;
  const resultSet = selectProc ? await describeResultSet(db, selectProc.name) : null;
  if (resultSet) {
    fields = resultSet.map((c) => makeField(c.name, parseBaseType(c.systemTypeName), c.isNullable));
    resultFromProc = true;
  } else {
    if (selectProc) {
      warnings.push(
        `Could not determine ${selectProc.name}'s result set — row shape inferred from the ` +
          `table columns instead. Verify the generated schema by hand.`,
      );
    }
    fields = columns.map((c) => makeField(c.name, c.sqlType, c.isNullable));
  }

  // The select-proc parameters that form the key — one per PK column. Composite
  // keys are supported: if every PK column appears as a select param, the key is
  // all of them (in PK order). For a single PK whose param name differs from the
  // column, fall back to the first non-user_id param.
  let keyParams: string[] = [];
  if (selectProc) {
    const paramNames = new Set(
      selectProc.params.filter((p) => p.name !== 'user_id').map((p) => p.name),
    );
    if (pkColumns.length >= 1 && pkColumns.every((c) => paramNames.has(c))) {
      keyParams = [...pkColumns];
    } else if (pkColumns.length <= 1) {
      const first = selectProc.params.find((p) => p.name !== 'user_id');
      if (first) keyParams = [first.name];
    }
  }

  // Warn about anything that weakens the generated repo/test.
  for (const action of ['insert', 'update', 'select', 'delete'] as const) {
    if (!procs[action])
      warnings.push(`No crd.${table}_${action} proc — its repo method is skipped.`);
  }
  if (keyParams.length === 0) {
    warnings.push(
      selectProc
        ? `Could not map a key for ${table}: its primary key (${pkColumns.join(', ') || 'none'}) ` +
            `doesn't match crd.${table}_select's parameters. getById/update/delete were skipped — ` +
            `wire them by hand.`
        : `No crd.${table}_select proc — getById/update/delete/list were skipped.`,
    );
  } else if (keyParams.length > 1) {
    warnings.push(
      `Composite key (${keyParams.join(', ')}): getById/update/delete take a ` +
        `${toPascalCase(table)}Key object.`,
    );
  }

  return {
    table,
    tableSchema: 'dbo',
    entity: toPascalCase(table),
    pkColumns,
    keyParams,
    fields,
    jsonColumns: [...jsonColumns],
    procs,
    columns,
    checks,
    defaults,
    indexes,
    resultFromProc,
  };
}

// -----------------------------------------------------------------------------
// File writing (overwrite-guarded)
// -----------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function nextMigrationNumber(migrationsDir: string): Promise<string> {
  const entries = await fs.readdir(migrationsDir);
  let max = 0;
  for (const name of entries) {
    const m = name.match(/^(\d{3})_/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1).padStart(3, '0');
}

function withTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`;
}

async function main(): Promise<void> {
  const { table, force, withCount } = parseArgs(process.argv.slice(2));
  const warnings: string[] = [];

  const db = createDb();
  let model: FeatureModel;
  try {
    model = await buildFeatureModel(db, table, warnings);
  } finally {
    await destroyDb(db);
  }

  // --with-count: author a count proc when the DB has none, so the repo can
  // expose count()/listPage(). It lands in the migration + its own snapshot.
  if (withCount && !model.procs.count) {
    model.procs.count = synthesizeCountProc(table);
    warnings.push(
      `Synthesized crd.${table}_count (none existed) — run \`pnpm migrate\` to create it in the DB.`,
    );
  }

  const written: string[] = [];
  const skipped: string[] = [];

  // Every generated file is overwrite-guarded: if it already exists, skip it
  // unless --force. This protects hand-maintained snapshots — both the proc
  // snapshots (verbatim from the catalog) and the table snapshot (reconstructed
  // DDL, so a curated table file is higher-fidelity than what we emit) — from
  // being clobbered by the generator.
  const write = async (absPath: string, content: string): Promise<void> => {
    const rel = path.relative(repoRoot, absPath);
    if (!force && (await exists(absPath))) {
      skipped.push(rel);
      return;
    }
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, withTrailingNewline(content), 'utf8');
    written.push(rel);
  };

  // Assemble target paths.
  const typesFile = path.join(repoRoot, 'packages', 'types', 'src', `${table}.ts`);
  const migrationsDir = path.join(repoRoot, 'packages', 'db', 'src', 'migrations');
  const num = await nextMigrationNumber(migrationsDir);
  const migrationFile = path.join(migrationsDir, `${num}_${table}.sql`);
  const migrationDownFile = path.join(migrationsDir, `${num}_${table}.down.sql`);
  const tableSnapshot = path.join(repoRoot, 'packages', 'db', 'schema', 'tables', `${table}.sql`);
  const procsDir = path.join(repoRoot, 'packages', 'db', 'schema', 'stored-procedures');
  const repoFile = path.join(repoRoot, 'packages', 'db', 'src', 'repositories', `${table}.repo.ts`);
  const testFile = path.join(repoRoot, 'packages', 'db', 'test', `${table}.test.ts`);

  // Generated source + migration.
  await write(typesFile, emitTypes(model));
  await write(migrationFile, emitMigration(model));
  await write(migrationDownFile, emitMigrationDown(model));
  await write(repoFile, emitRepository(model));
  await write(testFile, emitTest(model));

  // Hand-maintainable schema snapshots — the table DDL is treated exactly like
  // the proc snapshots: skipped (not overwritten) unless --force.
  await write(tableSnapshot, emitTableSnapshot(model));
  for (const snap of emitProcSnapshots(model)) {
    await write(path.join(procsDir, snap.fileName), snap.content);
  }

  // Idempotent shared-file wiring.
  const registrations = await registerFeature(model);

  // ---- Summary -------------------------------------------------------------
  const log = console.info;
  log(`\ngen:feature ${table} → entity ${model.entity}`);
  log(
    `  row shape from: ${model.resultFromProc ? 'select proc result set' : 'TABLE COLUMNS (fallback)'}`,
  );
  log(`  procs found:    ${Object.keys(model.procs).join(', ') || '(none)'}`);
  if (written.length) log(`\n  written:\n${written.map((f) => `    + ${f}`).join('\n')}`);
  if (skipped.length) {
    log(
      `\n  skipped (exists, use --force to overwrite):\n${skipped.map((f) => `    · ${f}`).join('\n')}`,
    );
  }
  const edited = registrations.filter((r) => r.changes.length > 0);
  if (edited.length) {
    log('\n  shared files wired:');
    for (const r of edited) log(`    ~ ${r.file}: ${r.changes.join(', ')}`);
  }
  if (warnings.length) {
    log('\n  ⚠ warnings:');
    for (const w of warnings) log(`    - ${w}`);
  }
  log('\nNext: review the files, run `pnpm typecheck`, then `pnpm --filter @app/db test`.\n');
}

main().catch((err: unknown) => {
  console.error(`\ngen:feature failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
