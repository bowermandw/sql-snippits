// =============================================================================
// Generator model — the shared shapes that flow introspection → emitters.
//
// `introspect.ts` fills a `FeatureModel` straight from the live SQL Server
// catalog; the pure emitters in `emitters.ts` turn that model into the files a
// feature needs (types, migration, snapshots, repo, test). Nothing here touches
// the DB or the filesystem — it is just data.
// =============================================================================

/** One CRUD action a `crd.<table>_<action>` proc can implement. */
export type CrudAction = 'insert' | 'update' | 'select' | 'delete' | 'list' | 'count';

/** The four core CRUD actions every generated repo expects to find. */
export const CORE_ACTIONS: readonly CrudAction[] = ['insert', 'update', 'select', 'delete'];

/** Optional extra actions wired up only when the proc exists (cf. error_log). */
export const EXTRA_ACTIONS: readonly CrudAction[] = ['list', 'count'];

/** A column as the catalog describes it (sys.columns + sys.types). */
export interface ColumnInfo {
  name: string;
  /** Base type name, e.g. `varchar`, `int`, `datetime2`. */
  sqlType: string;
  /** Bytes (sys.columns.max_length); -1 means MAX. nvarchar/nchar are 2 bytes/char. */
  maxLength: number;
  precision: number;
  scale: number;
  isNullable: boolean;
  isIdentity: boolean;
  isComputed: boolean;
}

/** A single column of a proc's first result set (describe_first_result_set). */
export interface ResultColumn {
  name: string;
  /** Fully-specified type, e.g. `varchar(50)`, `nvarchar(max)`, `datetime2(7)`. */
  systemTypeName: string;
  isNullable: boolean;
}

/** A stored-procedure parameter (sys.parameters), `@user_id` included. */
export interface ProcParam {
  /** Without the leading `@`. */
  name: string;
  sqlType: string;
  hasDefault: boolean;
  maxLength: number;
}

/** A CHECK constraint, with the column it targets when the catalog knows it. */
export interface CheckConstraint {
  name: string;
  /** null for table-level checks (parent_column_id = 0). */
  columnName: string | null;
  /** Raw sys.check_constraints.definition, e.g. `([level]='error' OR ...)`. */
  definition: string;
}

/** A DEFAULT constraint and its raw definition, e.g. `(getdate())`. */
export interface DefaultConstraint {
  name: string;
  columnName: string;
  definition: string;
}

/** A non-PK index reconstructed from sys.indexes / sys.index_columns. */
export interface IndexInfo {
  name: string;
  isUnique: boolean;
  columns: { name: string; descending: boolean }[];
}

/** One CRUD proc: its action, full name, body, and parameters. */
export interface ProcInfo {
  action: CrudAction;
  /** Schema-qualified, e.g. `crd.widget_insert`. */
  name: string;
  /** OBJECT_DEFINITION text (or, for a synthesized proc, generated T-SQL). */
  definition: string;
  params: ProcParam[];
  /** True when the generator authored this proc rather than reading it from the DB. */
  synthesized?: boolean;
}

/**
 * One field of the entity's row — the authoritative shape the zod schema, row
 * interface, and repo Row type all render from. Built from the `_select` result
 * set (or the table columns as a loud fallback).
 */
export interface FieldModel {
  name: string;
  /** zod expression, e.g. `z.string().nullable()`. */
  zod: string;
  /** TS type, e.g. `string | null`. */
  ts: string;
  /** True for ISJSON-checked columns — stored as text, parsed at the boundary. */
  isJson: boolean;
  /** Enum values from a CHECK(IN/OR) constraint, or null. */
  enumValues: string[] | null;
}

/** Everything the emitters need about one table + its CRUD procs. */
export interface FeatureModel {
  /** Table name (the file slug too), e.g. `widget` or `error_log`. */
  table: string;
  /** Owning schema for the table, normally `dbo`. */
  tableSchema: string;
  /** PascalCase entity name, e.g. `Widget`, `ErrorLog`. */
  entity: string;
  /** PK column names in key order. */
  pkColumns: string[];
  /**
   * The select-proc parameters that form the key, in key order — one per PK
   * column. `getById`/`update`/`delete` key on these; `list` passes them all
   * null. Length 1 = simple key (methods take `id`), >1 = composite key
   * (methods take a `<Entity>Key` object), 0 = no usable key (those methods are
   * skipped).
   */
  keyParams: string[];
  /** Authoritative row fields (from the select result set or table fallback). */
  fields: FieldModel[];
  /** Names of ISJSON columns — fed to the connection-layer JSON_COLUMNS set. */
  jsonColumns: string[];
  /** CRUD procs that actually exist, keyed by action. */
  procs: Partial<Record<CrudAction, ProcInfo>>;
  // Raw catalog detail kept for the DDL reconstruction (migration + snapshot).
  columns: ColumnInfo[];
  checks: CheckConstraint[];
  defaults: DefaultConstraint[];
  indexes: IndexInfo[];
  /** False when the row shape was inferred from the table, not the proc. */
  resultFromProc: boolean;
}
