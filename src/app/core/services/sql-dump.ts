import type { PGliteInterface } from '@electric-sql/pglite';
import { qualifyTableName, quoteIdent } from '../utils/sql-utils';

const USER_NS_FILTER = `n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'`;

/**
 * Genera un volcado SQL completo y re-ejecutable de todos los esquemas de usuario:
 * esquemas, tipos ENUM, secuencias, tablas, datos, restricciones (PK/UNIQUE/CHECK/FK),
 * índices, funciones, vistas y triggers, en un orden que respeta las dependencias.
 */
export async function dumpPublicSchema(pg: PGliteInterface, dbName: string): Promise<string> {
  const out: string[] = [];
  out.push(`-- ==========================================================`);
  out.push(`-- SQL LAB — Volcado de la base de datos: ${dbName}`);
  out.push(`-- Generado: ${new Date().toISOString()}`);
  out.push(`-- Motor: PostgreSQL (PGlite WebAssembly)`);
  out.push(`-- ==========================================================`);
  out.push('');

  // 0. Esquemas creados por el usuario
  const schemas = await pg.query<{ name: string }>(`
    SELECT n.nspname AS name
    FROM pg_namespace n
    WHERE ${USER_NS_FILTER} AND n.nspname <> 'public'
    ORDER BY n.nspname`);
  if (schemas.rows.length) {
    out.push('-- Esquemas de usuario');
    for (const s of schemas.rows) {
      out.push(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(s.name)};`);
    }
    out.push('');
  }

  // 1. Tipos ENUM
  const enums = await pg.query<{ schema: string; name: string; labels: string[] }>(`
    SELECT n.nspname AS schema, t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE ${USER_NS_FILTER}
    GROUP BY n.nspname, t.typname
    ORDER BY n.nspname, t.typname`);
  if (enums.rows.length) {
    out.push('-- Tipos enumerados');
    for (const e of enums.rows) {
      const labels = toArray(e.labels).map(l => `'${String(l).replace(/'/g, "''")}'`).join(', ');
      out.push(`CREATE TYPE ${qualifyTableName(e.name, e.schema)} AS ENUM (${labels});`);
    }
    out.push('');
  }

  // 2. Secuencias
  const sequences = await pg.query<{
    schema: string; name: string; data_type: string; start_value: string; increment_by: string;
    min_value: string; max_value: string; cycle: boolean; last_value: string | null;
  }>(`
    SELECT schemaname AS schema, sequencename AS name, data_type::text AS data_type, start_value::text, increment_by::text,
           min_value::text, max_value::text, cycle, last_value::text
    FROM pg_sequences
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND schemaname NOT LIKE 'pg_temp_%'
    ORDER BY schemaname, sequencename`);

  const identitySeqs = await pg.query<{ schema: string; name: string }>(`
    SELECT n.nspname AS schema, s.relname AS name
    FROM pg_class s
    JOIN pg_namespace n ON n.oid = s.relnamespace
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'i'
    WHERE s.relkind = 'S' AND ${USER_NS_FILTER}`);
  const identitySet = new Set(identitySeqs.rows.map(r => `${r.schema}.${r.name}`));
  const plainSequences = sequences.rows.filter(s => !identitySet.has(`${s.schema}.${s.name}`));
  if (plainSequences.length) {
    out.push('-- Secuencias');
    for (const s of plainSequences) {
      out.push(
        `CREATE SEQUENCE ${qualifyTableName(s.name, s.schema)} AS ${s.data_type} INCREMENT BY ${s.increment_by} ` +
        `MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.start_value}${s.cycle ? ' CYCLE' : ''};`
      );
    }
    out.push('');
  }

  // 3. Tablas y columnas
  const tables = await pg.query<{ oid: number; schema: string; name: string }>(`
    SELECT c.oid::int AS oid, n.nspname AS schema, c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NS_FILTER} AND c.relkind IN ('r', 'p')
    ORDER BY c.oid`);

  const columns = await pg.query<{
    table_oid: number; name: string; type: string; not_null: boolean;
    default_expr: string | null; identity: string; generated: string;
  }>(`
    SELECT a.attrelid::int AS table_oid, a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default_expr,
           a.attidentity::text AS identity,
           a.attgenerated::text AS generated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE ${USER_NS_FILTER} AND c.relkind IN ('r', 'p')
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attrelid, a.attnum`);

  const colsByTable = new Map<number, typeof columns.rows>();
  for (const col of columns.rows) {
    const list = colsByTable.get(col.table_oid) ?? [];
    list.push(col);
    colsByTable.set(col.table_oid, list);
  }

  for (const t of tables.rows) {
    const cols = colsByTable.get(t.oid) ?? [];
    const defs = cols.map(c => {
      let def = `  ${quoteIdent(c.name)} ${c.type}`;
      if (c.generated === 's' && c.default_expr) {
        def += ` GENERATED ALWAYS AS (${c.default_expr}) STORED`;
      } else if (c.identity === 'a') {
        def += ' GENERATED ALWAYS AS IDENTITY';
      } else if (c.identity === 'd') {
        def += ' GENERATED BY DEFAULT AS IDENTITY';
      } else if (c.default_expr) {
        def += ` DEFAULT ${c.default_expr}`;
      }
      if (c.not_null && !c.identity) def += ' NOT NULL';
      return def;
    });
    const qual = qualifyTableName(t.name, t.schema);
    out.push(`-- Tabla: ${t.schema}.${t.name}`);
    out.push(`CREATE TABLE ${qual} (\n${defs.join(',\n')}\n);`);
    out.push('');
  }

  // 4. Datos
  for (const t of tables.rows) {
    const cols = (colsByTable.get(t.oid) ?? []).filter(c => c.generated !== 's');
    if (cols.length === 0) continue;
    const hasIdentityAlways = cols.some(c => c.identity === 'a');
    const colList = cols.map(c => quoteIdent(c.name)).join(', ');
    const valuesExpr = cols.map(c => `quote_nullable(${quoteIdent(c.name)})`).join(` || ', ' || `);
    const qual = qualifyTableName(t.name, t.schema);
    const data = await pg.query<{ v: string }>(`SELECT ${valuesExpr} AS v FROM ${qual}`);
    if (data.rows.length === 0) continue;

    out.push(`-- Datos: ${t.schema}.${t.name} (${data.rows.length} filas)`);
    const chunkSize = 100;
    for (let i = 0; i < data.rows.length; i += chunkSize) {
      const chunk = data.rows.slice(i, i + chunkSize).map(r => `  (${r.v})`).join(',\n');
      out.push(
        `INSERT INTO ${qual} (${colList})${hasIdentityAlways ? ' OVERRIDING SYSTEM VALUE' : ''} VALUES\n${chunk};`
      );
    }
    out.push('');
  }

  // 5. Propiedad y valores actuales de secuencias
  const owned = await pg.query<{ schema: string; seq: string; tbl: string; col: string }>(`
    SELECT n.nspname AS schema, s.relname AS seq, t.relname AS tbl, a.attname AS col
    FROM pg_class s
    JOIN pg_namespace n ON n.oid = s.relnamespace
    JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a' AND d.classid = 'pg_class'::regclass
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE s.relkind = 'S' AND ${USER_NS_FILTER}`);
  if (plainSequences.length) {
    out.push('-- Estado de secuencias');
    for (const o of owned.rows) {
      if (identitySet.has(`${o.schema}.${o.seq}`)) continue;
      out.push(`ALTER SEQUENCE ${qualifyTableName(o.seq, o.schema)} OWNED BY ${qualifyTableName(o.tbl, o.schema)}.${quoteIdent(o.col)};`);
    }
    for (const s of plainSequences) {
      if (s.last_value !== null) {
        out.push(`SELECT setval('${qualifyTableName(s.name, s.schema).replace(/'/g, "''")}', ${s.last_value}, true);`);
      }
    }
    out.push('');
  }
  for (const o of owned.rows) {
    if (!identitySet.has(`${o.schema}.${o.seq}`)) continue;
    const seq = sequences.rows.find(s => s.schema === o.schema && s.name === o.seq);
    if (seq?.last_value) {
      out.push(`SELECT setval(pg_get_serial_sequence('${qualifyTableName(o.tbl, o.schema).replace(/'/g, "''")}', '${o.col.replace(/'/g, "''")}'), ${seq.last_value}, true);`);
    }
  }

  // 6. Restricciones (PK/UNIQUE/CHECK/EXCLUDE primero, FK al final)
  const constraints = await pg.query<{ schema: string; tbl: string; name: string; type: string; def: string }>(`
    SELECT n.nspname AS schema, c.relname AS tbl, con.conname AS name, con.contype::text AS type,
           pg_get_constraintdef(con.oid, true) AS def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NS_FILTER} AND con.contype IN ('p', 'u', 'c', 'x', 'f')
    ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 WHEN 'x' THEN 3 ELSE 4 END, n.nspname, c.relname, con.conname`);
  if (constraints.rows.length) {
    out.push('-- Restricciones');
    for (const c of constraints.rows) {
      out.push(`ALTER TABLE ${qualifyTableName(c.tbl, c.schema)} ADD CONSTRAINT ${quoteIdent(c.name)} ${c.def};`);
    }
    out.push('');
  }

  // 7. Índices que no respaldan restricciones
  const indexes = await pg.query<{ def: string }>(`
    SELECT pg_get_indexdef(i.indexrelid) AS def
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
    WHERE ${USER_NS_FILTER}
      AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid)
    ORDER BY ic.relname`);
  if (indexes.rows.length) {
    out.push('-- Índices');
    for (const idx of indexes.rows) out.push(`${idx.def};`);
    out.push('');
  }

  // 8. Funciones y procedimientos
  const functions = await pg.query<{ def: string }>(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE ${USER_NS_FILTER} AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ORDER BY p.oid`);
  if (functions.rows.length) {
    out.push('-- Funciones');
    for (const f of functions.rows) out.push(`${f.def.trim()};`);
    out.push('');
  }

  // 9. Vistas (en orden de creación)
  const views = await pg.query<{ schema: string; name: string; kind: string; def: string }>(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind, pg_get_viewdef(c.oid, true) AS def
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NS_FILTER} AND c.relkind IN ('v', 'm')
    ORDER BY c.oid`);
  if (views.rows.length) {
    out.push('-- Vistas');
    for (const v of views.rows) {
      const body = v.def.trim().replace(/;$/, '');
      out.push(`CREATE ${v.kind === 'm' ? 'MATERIALIZED VIEW' : 'VIEW'} ${qualifyTableName(v.name, v.schema)} AS\n${body};`);
    }
    out.push('');
  }

  // 10. Triggers
  const triggers = await pg.query<{ def: string }>(`
    SELECT pg_get_triggerdef(t.oid, true) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE ${USER_NS_FILTER} AND NOT t.tgisinternal
    ORDER BY t.oid`);
  if (triggers.rows.length) {
    out.push('-- Triggers');
    for (const t of triggers.rows) out.push(`${t.def};`);
    out.push('');
  }

  return out.join('\n');
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    const inner = value.replace(/^\{|\}$/g, '');
    if (!inner) return [];
    return inner.split(',').map(s => s.replace(/^"|"$/g, ''));
  }
  return [];
}
