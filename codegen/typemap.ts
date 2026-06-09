// =============================================================================
// Type mapping — SQL Server types → zod expressions and TS types, in one place.
//
// Timestamps map to `string` (not Date) because the connection layer normalizes
// datetime/date columns to ISO strings at the boundary (see connection.ts), and
// the shared zod schemas use `z.string()` for them. JSON columns map to
// `unknown` (parsed back to a value by the same boundary). Anything not in the
// table below throws — the generator never guesses a type.
// =============================================================================

import type { ColumnInfo, FieldModel } from './model.js';

interface BaseMapping {
  zod: string;
  ts: string;
}

/** Base SQL type (no length/precision) → zod + TS. Unknown types throw. */
const BASE_TYPE_MAP: Record<string, BaseMapping> = {
  // integers
  bigint: { zod: 'z.number().int()', ts: 'number' },
  int: { zod: 'z.number().int()', ts: 'number' },
  smallint: { zod: 'z.number().int()', ts: 'number' },
  tinyint: { zod: 'z.number().int()', ts: 'number' },
  // decimals / floats — JS number is the practical representation
  decimal: { zod: 'z.number()', ts: 'number' },
  numeric: { zod: 'z.number()', ts: 'number' },
  money: { zod: 'z.number()', ts: 'number' },
  smallmoney: { zod: 'z.number()', ts: 'number' },
  float: { zod: 'z.number()', ts: 'number' },
  real: { zod: 'z.number()', ts: 'number' },
  // boolean
  bit: { zod: 'z.boolean()', ts: 'boolean' },
  // strings
  char: { zod: 'z.string()', ts: 'string' },
  varchar: { zod: 'z.string()', ts: 'string' },
  nchar: { zod: 'z.string()', ts: 'string' },
  nvarchar: { zod: 'z.string()', ts: 'string' },
  text: { zod: 'z.string()', ts: 'string' },
  ntext: { zod: 'z.string()', ts: 'string' },
  sysname: { zod: 'z.string()', ts: 'string' },
  uniqueidentifier: { zod: 'z.string()', ts: 'string' },
  // temporal — normalized to ISO strings at the connection boundary
  date: { zod: 'z.string()', ts: 'string' },
  datetime: { zod: 'z.string()', ts: 'string' },
  datetime2: { zod: 'z.string()', ts: 'string' },
  smalldatetime: { zod: 'z.string()', ts: 'string' },
  datetimeoffset: { zod: 'z.string()', ts: 'string' },
  time: { zod: 'z.string()', ts: 'string' },
};

/** `varchar(50)` / `nvarchar(max)` / `datetime2(7)` → `varchar` / `nvarchar` / `datetime2`. */
export function parseBaseType(systemTypeName: string): string {
  const open = systemTypeName.indexOf('(');
  const base = open === -1 ? systemTypeName : systemTypeName.slice(0, open);
  return base.trim().toLowerCase();
}

function lookupBase(base: string): BaseMapping {
  const mapping = BASE_TYPE_MAP[base];
  if (!mapping) {
    throw new Error(
      `Unmapped SQL type "${base}". Add it to BASE_TYPE_MAP in codegen/typemap.ts ` +
        `(the generator refuses to guess a type).`,
    );
  }
  return mapping;
}

/** All `'...'` / `N'...'` literals in a CHECK definition, in order, de-duplicated. */
function stringLiterals(definition: string): string[] {
  const out: string[] = [];
  const re = /N?'((?:[^']|'')*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(definition)) !== null) {
    const value = (match[1] ?? '').replace(/''/g, "'");
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * Enum vocabulary from a column's CHECK constraint, or null. Handles both forms
 * SQL Server may store: `[col] IN ('a','b')` and the rewritten
 * `[col]='a' OR [col]='b'`. Only treated as an enum when the definition both
 * names the column and constrains it by equality/IN against string literals.
 */
export function parseEnumValues(definition: string, columnName: string): string[] | null {
  const lower = definition.toLowerCase();
  if (!lower.includes(columnName.toLowerCase())) return null;
  if (!lower.includes(' in ') && !lower.includes('=')) return null;
  const values = stringLiterals(definition);
  return values.length > 0 ? values : null;
}

/** True when a CHECK enforces ISJSON on the column (→ JSON text column). */
export function isJsonCheck(definition: string, columnName: string): boolean {
  const lower = definition.toLowerCase();
  return lower.includes('isjson') && lower.includes(columnName.toLowerCase());
}

/**
 * Build a row field from its base type + nullability, layering enum / JSON /
 * nullable on top. `enumConst` is the name of the `as const` tuple the types
 * emitter will declare (e.g. `ERROR_LOG_LEVEL`).
 */
export function buildField(
  name: string,
  base: string,
  isNullable: boolean,
  opts: { isJson: boolean; enumValues: string[] | null; enumConst?: string },
): FieldModel {
  let zod: string;
  let ts: string;

  if (opts.isJson) {
    zod = 'z.unknown()';
    ts = 'unknown';
  } else if (opts.enumValues && opts.enumConst) {
    zod = `z.enum(${opts.enumConst})`;
    ts = opts.enumValues.map((v) => `'${v.replace(/'/g, "\\'")}'`).join(' | ');
  } else {
    const mapping = lookupBase(base);
    zod = mapping.zod;
    ts = mapping.ts;
  }

  // `z.unknown()` already admits undefined/null; only decorate concrete types.
  if (isNullable && !opts.isJson) {
    zod = `${zod}.nullable()`;
    ts = `${ts} | null`;
  }

  return { name, zod, ts, isJson: opts.isJson, enumValues: opts.enumValues };
}

/** Render a column's DDL type, e.g. `varchar(50)`, `nvarchar(max)`, `decimal(18, 2)`. */
export function renderColumnType(col: ColumnInfo): string {
  const t = col.sqlType.toLowerCase();
  if (t === 'varchar' || t === 'char' || t === 'binary' || t === 'varbinary') {
    return `${t}(${col.maxLength === -1 ? 'max' : col.maxLength})`;
  }
  if (t === 'nvarchar' || t === 'nchar') {
    return `${t}(${col.maxLength === -1 ? 'max' : col.maxLength / 2})`;
  }
  if (t === 'decimal' || t === 'numeric') {
    return `${t}(${col.precision}, ${col.scale})`;
  }
  if (t === 'datetime2' || t === 'time' || t === 'datetimeoffset') {
    return `${t}(${col.scale})`;
  }
  return t;
}
