// =============================================================================
// Introspection — every read-only query the generator runs against the live
// SQL Server catalog. The DB is the source of truth: only it knows the real
// result-set shapes (columns + nullability) the zod schema and row interface
// depend on, so we ask it rather than parse .sql text.
// =============================================================================

import type { DbExecutor } from '../connection.js';

import type {
  CheckConstraint,
  ColumnInfo,
  CrudAction,
  DefaultConstraint,
  IndexInfo,
  ProcInfo,
  ProcParam,
  ResultColumn,
} from './model.js';

/** Columns of a table, in definition order. */
export async function getTableColumns(db: DbExecutor, table: string): Promise<ColumnInfo[]> {
  const { rows } = await db.query<{
    name: string;
    sql_type: string;
    max_length: number;
    precision: number;
    scale: number;
    is_nullable: boolean;
    is_identity: boolean;
    is_computed: boolean;
  }>(
    `SELECT c.name           AS name,
            t.name           AS sql_type,
            c.max_length     AS max_length,
            c.precision      AS precision,
            c.scale          AS scale,
            c.is_nullable    AS is_nullable,
            c.is_identity    AS is_identity,
            c.is_computed    AS is_computed
       FROM sys.columns c
       JOIN sys.types   t ON t.user_type_id = c.user_type_id
      WHERE c.object_id = OBJECT_ID(@p0)
      ORDER BY c.column_id`,
    [`dbo.${table}`],
  );
  return rows.map((r) => ({
    name: r.name,
    sqlType: r.sql_type,
    maxLength: r.max_length,
    precision: r.precision,
    scale: r.scale,
    isNullable: r.is_nullable,
    isIdentity: r.is_identity,
    isComputed: r.is_computed,
  }));
}

/** PK column names, in key order. */
export async function getPrimaryKey(db: DbExecutor, table: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `SELECT c.name AS name
       FROM sys.indexes       i
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns       c  ON c.object_id  = ic.object_id AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID(@p0) AND i.is_primary_key = 1
      ORDER BY ic.key_ordinal`,
    [`dbo.${table}`],
  );
  return rows.map((r) => r.name);
}

/** CHECK constraints (used to derive enum vocabularies and JSON columns). */
export async function getCheckConstraints(
  db: DbExecutor,
  table: string,
): Promise<CheckConstraint[]> {
  const { rows } = await db.query<{
    name: string;
    column_name: string | null;
    definition: string;
  }>(
    `SELECT cc.name        AS name,
            col.name       AS column_name,
            cc.definition  AS definition
       FROM sys.check_constraints cc
       LEFT JOIN sys.columns col
         ON col.object_id = cc.parent_object_id AND col.column_id = cc.parent_column_id
      WHERE cc.parent_object_id = OBJECT_ID(@p0)`,
    [`dbo.${table}`],
  );
  return rows.map((r) => ({ name: r.name, columnName: r.column_name, definition: r.definition }));
}

/** DEFAULT constraints, keyed to their column. */
export async function getDefaults(db: DbExecutor, table: string): Promise<DefaultConstraint[]> {
  const { rows } = await db.query<{ name: string; column_name: string; definition: string }>(
    `SELECT dc.name       AS name,
            col.name      AS column_name,
            dc.definition AS definition
       FROM sys.default_constraints dc
       JOIN sys.columns col
         ON col.object_id = dc.parent_object_id AND col.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID(@p0)`,
    [`dbo.${table}`],
  );
  return rows.map((r) => ({ name: r.name, columnName: r.column_name, definition: r.definition }));
}

/** Non-PK indexes, with their key columns in order. */
export async function getIndexes(db: DbExecutor, table: string): Promise<IndexInfo[]> {
  const { rows } = await db.query<{
    index_name: string;
    is_unique: boolean;
    column_name: string;
    is_descending: boolean;
    key_ordinal: number;
  }>(
    `SELECT i.name              AS index_name,
            i.is_unique         AS is_unique,
            c.name              AS column_name,
            ic.is_descending_key AS is_descending,
            ic.key_ordinal      AS key_ordinal
       FROM sys.indexes       i
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns       c  ON c.object_id  = ic.object_id AND c.column_id = ic.column_id
      WHERE i.object_id = OBJECT_ID(@p0)
        AND i.is_primary_key = 0
        AND i.is_unique_constraint = 0
        AND i.type > 0
      ORDER BY i.name, ic.key_ordinal`,
    [`dbo.${table}`],
  );

  const byName = new Map<string, IndexInfo>();
  for (const r of rows) {
    let idx = byName.get(r.index_name);
    if (!idx) {
      idx = { name: r.index_name, isUnique: r.is_unique, columns: [] };
      byName.set(r.index_name, idx);
    }
    idx.columns.push({ name: r.column_name, descending: r.is_descending });
  }
  return [...byName.values()];
}

/** Raw OBJECT_DEFINITION text of a schema-qualified object, or null. */
export async function getProcDefinition(
  db: DbExecutor,
  qualifiedName: string,
): Promise<string | null> {
  const { rows } = await db.query<{ definition: string | null }>(
    `SELECT OBJECT_DEFINITION(OBJECT_ID(@p0)) AS definition`,
    [qualifiedName],
  );
  return rows[0]?.definition ?? null;
}

/** Parameters of a proc (including `@user_id`), in declaration order. */
export async function getProcParams(db: DbExecutor, qualifiedName: string): Promise<ProcParam[]> {
  const { rows } = await db.query<{
    name: string;
    sql_type: string;
    has_default: boolean;
    max_length: number;
  }>(
    `SELECT p.name              AS name,
            t.name              AS sql_type,
            p.has_default_value AS has_default,
            p.max_length        AS max_length
       FROM sys.parameters p
       JOIN sys.types      t ON t.user_type_id = p.user_type_id
      WHERE p.object_id = OBJECT_ID(@p0)
      ORDER BY p.parameter_id`,
    [qualifiedName],
  );
  // sys.parameters.name includes the leading '@'; strip it for our model.
  return rows.map((r) => ({
    name: r.name.replace(/^@/, ''),
    sqlType: r.sql_type,
    hasDefault: r.has_default,
    maxLength: r.max_length,
  }));
}

/**
 * The authoritative first-result-set shape of a proc, or null when SQL Server
 * can't determine it statically (dynamic SQL, temp tables, conditional sets).
 * The caller treats null as "fall back to the table columns, loudly".
 */
export async function describeResultSet(
  db: DbExecutor,
  qualifiedName: string,
): Promise<ResultColumn[] | null> {
  try {
    const { rows } = await db.query<{
      name: string | null;
      system_type_name: string;
      is_nullable: boolean;
    }>(
      `SELECT name, system_type_name, is_nullable
         FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(@p0), 0)
        ORDER BY column_ordinal`,
      [qualifiedName],
    );
    if (rows.length === 0) return null;
    // A column with no name (computed/unaliased) can't map to a typed field.
    if (rows.some((r) => !r.name)) return null;
    return rows.map((r) => ({
      name: r.name as string,
      systemTypeName: r.system_type_name,
      isNullable: r.is_nullable,
    }));
  } catch {
    return null;
  }
}

/** Which `crd.<table>_<action>` procs exist, with their bodies and params. */
export async function detectCrudProcs(
  db: DbExecutor,
  table: string,
): Promise<Partial<Record<CrudAction, ProcInfo>>> {
  const { rows } = await db.query<{ name: string }>(
    `SELECT o.name AS name
       FROM sys.objects o
       JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE o.type = 'P' AND s.name = 'crd' AND o.name LIKE @p0
      ORDER BY o.name`,
    // '_' is a LIKE wildcard, so this can slightly over-match — harmless, since
    // we exact-match each candidate proc name below.
    [`${table}_%`],
  );

  const actions: CrudAction[] = ['insert', 'update', 'select', 'delete', 'list', 'count'];
  const found: Partial<Record<CrudAction, ProcInfo>> = {};

  for (const action of actions) {
    const procName = `${table}_${action}`;
    if (!rows.some((r) => r.name === procName)) continue;
    const qualified = `crd.${procName}`;
    const definition = await getProcDefinition(db, qualified);
    if (!definition) continue;
    const params = await getProcParams(db, qualified);
    found[action] = { action, name: qualified, definition, params };
  }
  return found;
}
