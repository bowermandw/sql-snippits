// =============================================================================
// Registrar — idempotent edits to the four shared files a new feature must be
// wired into. Every edit is insert-if-absent, so the generator is safe to
// re-run: nothing is duplicated and nothing hand-edited is clobbered.
//
//   types/src/index.ts   → re-export the new domain
//   db/src/index.ts      → re-export the repo, its inputs, and the row type
//   db/src/database.ts   → add the <Entity>Table interface + Database member
//   db/src/connection.ts → register any JSON column in JSON_COLUMNS
// =============================================================================

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FeatureModel } from './model.js';

const codegenDir = path.dirname(fileURLToPath(import.meta.url));
// codegen → src → db → packages → repo root
const repoRoot = path.resolve(codegenDir, '..', '..', '..', '..');

const TYPES_INDEX = path.join(repoRoot, 'packages', 'types', 'src', 'index.ts');
const DB_INDEX = path.join(repoRoot, 'packages', 'db', 'src', 'index.ts');
const DATABASE_TS = path.join(repoRoot, 'packages', 'db', 'src', 'database.ts');
const CONNECTION_TS = path.join(repoRoot, 'packages', 'db', 'src', 'connection.ts');

export interface RegisterResult {
  file: string;
  changes: string[];
}

/** Append a line just after the last line matching `afterPattern`, else at EOF. */
function insertAfterLast(content: string, line: string, afterPattern: RegExp): string {
  if (content.includes(line)) return content;
  const lines = content.split('\n');
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (afterPattern.test(lines[i] ?? '')) lastIdx = i;
  }
  if (lastIdx === -1) {
    const trimmed = content.replace(/\n+$/, '');
    return `${trimmed}\n${line}\n`;
  }
  lines.splice(lastIdx + 1, 0, line);
  return lines.join('\n');
}

async function registerTypesIndex(model: FeatureModel): Promise<RegisterResult> {
  const rel = path.relative(repoRoot, TYPES_INDEX);
  const content = await fs.readFile(TYPES_INDEX, 'utf8');
  const line = `export * from './${model.table}.js';`;
  if (content.includes(line)) return { file: rel, changes: [] };
  const next = insertAfterLast(content, line, /^export \* from '\.\/.*\.js';$/);
  await fs.writeFile(TYPES_INDEX, next, 'utf8');
  return { file: rel, changes: [line] };
}

async function registerDbIndex(model: FeatureModel): Promise<RegisterResult> {
  const rel = path.relative(repoRoot, DB_INDEX);
  let content = await fs.readFile(DB_INDEX, 'utf8');
  const changes: string[] = [];
  const { entity, table, procs } = model;

  const repoExport = `export { ${entity}Repo } from './repositories/${table}.repo.js';`;
  const tableExport = `export type { ${entity}Table } from './database.js';`;

  const repoTypes = [`${entity}Row`];
  if (procs.insert) repoTypes.push(`${entity}InsertInput`);
  if (procs.update) repoTypes.push(`${entity}UpdateInput`);
  repoTypes.sort();
  const repoTypeExport = `export type { ${repoTypes.join(', ')} } from './repositories/${table}.repo.js';`;

  for (const line of [repoExport, repoTypeExport, tableExport]) {
    if (!content.includes(line)) {
      content = insertAfterLast(content, line, /^export (type )?\{.*\} from '\.\/.*';$/);
      changes.push(line);
    }
  }
  if (changes.length > 0) await fs.writeFile(DB_INDEX, content, 'utf8');
  return { file: rel, changes };
}

async function registerDatabaseTs(model: FeatureModel): Promise<RegisterResult> {
  const rel = path.relative(repoRoot, DATABASE_TS);
  let content = await fs.readFile(DATABASE_TS, 'utf8');
  const changes: string[] = [];
  const { entity, table } = model;

  const ifaceName = `${entity}Table`;
  if (!new RegExp(`export interface ${ifaceName}\\b`).test(content)) {
    const ifaceLines = [`export interface ${ifaceName} {`];
    for (const f of model.fields) ifaceLines.push(`  ${f.name}: ${f.ts};`);
    ifaceLines.push('}', '');
    const block = ifaceLines.join('\n');
    const marker = 'export interface Database {';
    const idx = content.indexOf(marker);
    if (idx === -1) throw new Error(`Could not find "${marker}" in ${rel}`);
    content = content.slice(0, idx) + block + '\n' + content.slice(idx);
    changes.push(`interface ${ifaceName}`);
  }

  const memberLine = `  ${table}: ${ifaceName};`;
  if (!content.includes(memberLine)) {
    content = content.replace(
      /export interface Database \{\n/,
      `export interface Database {\n${memberLine}\n`,
    );
    changes.push(`Database.${table}`);
  }

  if (changes.length > 0) await fs.writeFile(DATABASE_TS, content, 'utf8');
  return { file: rel, changes };
}

async function registerConnectionJsonColumns(model: FeatureModel): Promise<RegisterResult> {
  const rel = path.relative(repoRoot, CONNECTION_TS);
  if (model.jsonColumns.length === 0) return { file: rel, changes: [] };

  let content = await fs.readFile(CONNECTION_TS, 'utf8');
  const match = content.match(/const JSON_COLUMNS = new Set\(\[([^\]]*)\]\);/);
  if (!match) throw new Error(`Could not find JSON_COLUMNS Set in ${rel}`);

  const existing = [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
  const merged = [...existing];
  const changes: string[] = [];
  for (const col of model.jsonColumns) {
    if (!merged.includes(col)) {
      merged.push(col);
      changes.push(`JSON_COLUMNS += '${col}'`);
    }
  }
  if (changes.length === 0) return { file: rel, changes: [] };

  const replacement = `const JSON_COLUMNS = new Set([${merged.map((c) => `'${c}'`).join(', ')}]);`;
  content = content.replace(/const JSON_COLUMNS = new Set\(\[[^\]]*\]\);/, replacement);
  await fs.writeFile(CONNECTION_TS, content, 'utf8');
  return { file: rel, changes };
}

/** Wire the feature into all four shared files; returns a per-file change log. */
export async function registerFeature(model: FeatureModel): Promise<RegisterResult[]> {
  return [
    await registerTypesIndex(model),
    await registerDbIndex(model),
    await registerDatabaseTs(model),
    await registerConnectionJsonColumns(model),
  ];
}
