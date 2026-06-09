// =============================================================================
// Name helpers — derive every cased identifier the generator needs from the
// snake_case table name, so the emitters stay free of ad-hoc string juggling.
// =============================================================================

/** `error_log` → `ErrorLog`, `widget` → `Widget`. */
export function toPascalCase(snake: string): string {
  return snake
    .split('_')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** `error_log` + `level` → `ERROR_LOG_LEVEL` (enum tuple const name). */
export function enumConstName(table: string, column: string): string {
  return `${table}_${column}`.toUpperCase();
}

/** `error_log` + `level` → `ErrorLogLevel` (enum union type name). */
export function enumTypeName(table: string, column: string): string {
  return `${toPascalCase(table)}${toPascalCase(column)}`;
}
