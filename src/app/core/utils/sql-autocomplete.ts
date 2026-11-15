import type {
  ColumnSchema,
  DatabaseSchemaInfo,
  TableSchema
} from '../models/database.models';

export type SqlCompletionContextKind =
  | 'dot'
  | 'from_or_join'
  | 'join_on'
  | 'select_or_expr'
  | 'ddl_object'
  | 'column_def'
  | 'insert_columns'
  | 'statement_start'
  | 'general';

export interface SqlCompletionContext {
  kind: SqlCompletionContextKind;
  qualifier?: string;
  memberPrefix?: string;
  ddlVerb?: 'CREATE' | 'ALTER' | 'DROP' | 'TRUNCATE';
  tableName?: string;
  precedingWord?: string;
}

export type SqlCompletionSuggestionKind =
  | 'keyword'
  | 'snippet'
  | 'table'
  | 'view'
  | 'column'
  | 'function'
  | 'type'
  | 'schema'
  | 'sequence'
  | 'operator';

export interface SqlCompletionSuggestion {
  label: string;
  insertText: string;
  kind: SqlCompletionSuggestionKind;
  detail: string;
  documentation?: string;
  isSnippet?: boolean;
  sortText: string;
  filterText?: string;
}

export interface QuickChipSuggestion {
  label: string;
  insertText: string;
  category: string;
  detail: string;
}

export interface ContextualQuickChipsResult {
  contextLabel: string;
  chips: QuickChipSuggestion[];
}

export const SINGLE_SQL_KEYWORDS: readonly string[] = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'RETURNING',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'ON', 'USING', 'AS',
  'ORDER', 'GROUP', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'UNION', 'ALL', 'INTERSECT', 'EXCEPT',
  'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'TABLE', 'VIEW', 'INDEX', 'SCHEMA', 'SEQUENCE', 'FUNCTION', 'TRIGGER',
  'OR', 'REPLACE', 'TEMP', 'IF', 'EXISTS', 'ADD', 'COLUMN', 'RENAME', 'TO', 'TYPE',
  'PRIMARY', 'FOREIGN', 'KEY', 'REFERENCES', 'UNIQUE', 'NOT', 'NULL', 'DEFAULT', 'CHECK', 'CONSTRAINT', 'CASCADE',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'EXPLAIN', 'ANALYZE', 'WITH', 'RECURSIVE',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AND', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'ASC', 'DESC', 'TRUE', 'FALSE'
];

const PG_DATA_TYPES: readonly { label: string; insertText: string; detail: string; isSnippet?: boolean }[] = [
  { label: 'SERIAL PRIMARY KEY', insertText: 'SERIAL PRIMARY KEY', detail: 'Entero autoincremental + PK' },
  { label: 'BIGSERIAL PRIMARY KEY', insertText: 'BIGSERIAL PRIMARY KEY', detail: 'Entero grande autoincremental + PK' },
  { label: 'INTEGER', insertText: 'INTEGER', detail: 'Entero de 32 bits' },
  { label: 'BIGINT', insertText: 'BIGINT', detail: 'Entero de 64 bits' },
  { label: 'SMALLINT', insertText: 'SMALLINT', detail: 'Entero pequeño de 16 bits' },
  { label: 'VARCHAR(100)', insertText: 'VARCHAR(${1:100})', detail: 'Cadena de longitud variable', isSnippet: true },
  { label: 'VARCHAR(255)', insertText: 'VARCHAR(${1:255})', detail: 'Cadena de longitud variable', isSnippet: true },
  { label: 'TEXT', insertText: 'TEXT', detail: 'Texto sin límite fijo' },
  { label: 'NUMERIC(10,2)', insertText: 'NUMERIC(${1:10},${2:2})', detail: 'Decimal exacto (finanzas)', isSnippet: true },
  { label: 'DECIMAL(10,2)', insertText: 'DECIMAL(${1:10},${2:2})', detail: 'Decimal exacto', isSnippet: true },
  { label: 'BOOLEAN DEFAULT TRUE', insertText: 'BOOLEAN DEFAULT ${1|TRUE,FALSE|}', detail: 'Booleano con valor por defecto', isSnippet: true },
  { label: 'DATE', insertText: 'DATE', detail: 'Fecha (YYYY-MM-DD)' },
  { label: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', insertText: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', detail: 'Fecha y hora automática' },
  { label: 'TIMESTAMPTZ', insertText: 'TIMESTAMPTZ', detail: 'Fecha y hora con zona horaria' },
  { label: 'UUID DEFAULT gen_random_uuid()', insertText: 'UUID DEFAULT gen_random_uuid()', detail: 'Identificador único universal' },
  { label: 'JSONB', insertText: 'JSONB', detail: 'Documento JSON binario indexable' }
];

const SQL_FUNCTIONS: readonly { label: string; insertText: string; detail: string; isSnippet?: boolean }[] = [
  { label: 'COUNT(*)', insertText: 'COUNT(*)', detail: 'Cantidad total de filas' },
  { label: 'COUNT(col)', insertText: 'COUNT(${1:col})', detail: 'Cuenta valores no nulos', isSnippet: true },
  { label: 'SUM(col)', insertText: 'SUM(${1:col})', detail: 'Suma numérica', isSnippet: true },
  { label: 'AVG(col)', insertText: 'AVG(${1:col})', detail: 'Promedio numérico', isSnippet: true },
  { label: 'MIN(col)', insertText: 'MIN(${1:col})', detail: 'Valor mínimo', isSnippet: true },
  { label: 'MAX(col)', insertText: 'MAX(${1:col})', detail: 'Valor máximo', isSnippet: true },
  { label: 'ROUND(val, 2)', insertText: 'ROUND(${1:val}, ${2:2})', detail: 'Redondea a N decimales', isSnippet: true },
  { label: 'COALESCE(col, valor)', insertText: 'COALESCE(${1:col}, ${2:valor})', detail: 'Primer valor no nulo', isSnippet: true },
  { label: 'NULLIF(a, b)', insertText: 'NULLIF(${1:a}, ${2:b})', detail: 'Devuelve NULL si a = b', isSnippet: true },
  { label: 'UPPER(col)', insertText: 'UPPER(${1:col})', detail: 'Convierte a mayúsculas', isSnippet: true },
  { label: 'LOWER(col)', insertText: 'LOWER(${1:col})', detail: 'Convierte a minúsculas', isSnippet: true },
  { label: 'LENGTH(col)', insertText: 'LENGTH(${1:col})', detail: 'Longitud de cadena', isSnippet: true },
  { label: 'SUBSTRING(col FROM 1 FOR 5)', insertText: 'SUBSTRING(${1:col} FROM ${2:1} FOR ${3:5})', detail: 'Extrae subcadena', isSnippet: true },
  { label: "CONCAT(a, ' ', b)", insertText: "CONCAT(${1:a}, ' ', ${2:b})", detail: 'Concatena textos', isSnippet: true },
  { label: 'NOW()', insertText: 'NOW()', detail: 'Fecha y hora actual de la transacción' },
  { label: 'CURRENT_DATE', insertText: 'CURRENT_DATE', detail: 'Fecha actual' },
  { label: 'CURRENT_TIMESTAMP', insertText: 'CURRENT_TIMESTAMP', detail: 'Marca de tiempo actual' },
  { label: "DATE_TRUNC('day', col)", insertText: "DATE_TRUNC('${1|day,week,month,year|}', ${2:col})", detail: 'Trunca fecha por unidad', isSnippet: true },
  { label: 'EXTRACT(YEAR FROM col)', insertText: 'EXTRACT(${1|YEAR,MONTH,DAY,HOUR|} FROM ${2:col})', detail: 'Extrae componente de fecha', isSnippet: true },
  { label: 'ROW_NUMBER() OVER (ORDER BY id)', insertText: 'ROW_NUMBER() OVER (ORDER BY ${1:id})', detail: 'Numeración secuencial por ventana', isSnippet: true },
  { label: 'RANK() OVER (ORDER BY col DESC)', insertText: 'RANK() OVER (ORDER BY ${1:col} DESC)', detail: 'Ranking con empates y huecos', isSnippet: true },
  { label: 'DENSE_RANK() OVER (ORDER BY col DESC)', insertText: 'DENSE_RANK() OVER (ORDER BY ${1:col} DESC)', detail: 'Ranking denso sin huecos', isSnippet: true },
  { label: "STRING_AGG(col, ', ')", insertText: "STRING_AGG(${1:col}, '${2:, }')", detail: 'Agrega textos separados por delimitador', isSnippet: true },
  { label: 'ARRAY_AGG(col)', insertText: 'ARRAY_AGG(${1:col})', detail: 'Agrupa valores en un arreglo PostgreSQL', isSnippet: true }
];

const RESERVED_ALIAS_WORDS = new Set([
  'WHERE', 'ON', 'USING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS',
  'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'SET', 'VALUES', 'RETURNING',
  'UNION', 'INTERSECT', 'EXCEPT', 'AS', 'AND', 'OR', 'INTO', 'SELECT', 'FROM'
]);

/** Extrae la sentencia SQL que rodea a `cursorOffset` (o la última si no se indica posición), respetando comillas y comentarios. */
function sliceCurrentStatement(sql: string, cursorOffset?: number): string {
  const limit = cursorOffset !== undefined ? cursorOffset : sql.length;
  let i = 0;
  let start = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      if (nl === -1) {
        if (i <= limit) return '';
        break;
      }
      if (i <= limit && nl >= limit) return '';
      i = nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2);
      if (close === -1) {
        if (i <= limit) return '';
        break;
      }
      if (i <= limit && close + 2 > limit) return '';
      i = close + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < len) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === ';') {
      if (i < limit) {
        start = i + 1;
      } else {
        return sql.slice(start, i);
      }
    }
    i++;
  }

  return sql.slice(start);
}

/** Cuenta paréntesis abiertos no cerrados fuera de comillas simples/dobles y detecta CREATE TABLE (...). */
function isInsideCreateTableColumns(stmtBeforeCursor: string): boolean {
  const match = /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?\s*\(/i.exec(
    stmtBeforeCursor
  );
  if (!match) return false;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = match.index + match[0].length - 1; i < stmtBeforeCursor.length; i++) {
    const ch = stmtBeforeCursor[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth > 0;
}

/** Detecta el contexto sintáctico exacto en la posición del cursor. */
export function detectSqlContext(sqlBeforeCursor: string, linePrefix: string): SqlCompletionContext {
  const dotMatch = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/.exec(linePrefix);
  if (dotMatch) {
    return {
      kind: 'dot',
      qualifier: dotMatch[1],
      memberPrefix: dotMatch[2]
    };
  }

  const stmt = sliceCurrentStatement(sqlBeforeCursor);
  const preceding = stmt.replace(/[A-Za-z_][A-Za-z0-9_]*$/, '');
  const precedingWordMatch = /\b([A-Za-z_][A-Za-z0-9_]*)\s*$/i.exec(preceding);
  const precedingWord = precedingWordMatch?.[1]?.toUpperCase();

  const ddlMatch = /\b(CREATE|ALTER|DROP|TRUNCATE)\s+$/i.exec(preceding);
  if (ddlMatch) {
    return {
      kind: 'ddl_object',
      ddlVerb: ddlMatch[1].toUpperCase() as SqlCompletionContext['ddlVerb'],
      precedingWord
    };
  }

  if (/\bJOIN\s+(?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?[A-Za-z_][A-Za-z0-9_]*"?(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?\s+ON\s+$/i.test(preceding)) {
    return { kind: 'join_on', precedingWord };
  }

  const insertMatch = /\bINSERT\s+INTO\s+(?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(?$/i.exec(preceding);
  if (insertMatch) {
    return {
      kind: 'insert_columns',
      tableName: insertMatch[1],
      precedingWord
    };
  }

  if (
    isInsideCreateTableColumns(preceding) ||
    /\bADD\s+(?:COLUMN\s+)?[A-Za-z_][A-Za-z0-9_]*\s+$/i.test(preceding) ||
    /\bALTER\s+COLUMN\s+[A-Za-z_][A-Za-z0-9_]*\s+TYPE\s+$/i.test(preceding)
  ) {
    return { kind: 'column_def', precedingWord };
  }

  if (
    /\b(?:FROM|INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN|UPDATE|INTO|DESCRIBE)\s+$/i.test(
      preceding
    ) ||
    /\b(?:ALTER|DROP|TRUNCATE)\s+TABLE\s+(?:IF\s+EXISTS\s+)?$/i.test(preceding)
  ) {
    return { kind: 'from_or_join', precedingWord };
  }

  if (
    /\b(?:SELECT|DISTINCT|WHERE|AND|OR|SET|HAVING|GROUP\s+BY|ORDER\s+BY|RETURNING)\s+$/i.test(preceding) ||
    /\bVALUES\s*\(\s*$/i.test(preceding) ||
    /,\s*$/.test(preceding)
  ) {
    return { kind: 'select_or_expr', precedingWord };
  }

  if (preceding.trim() === '') {
    return { kind: 'statement_start', precedingWord };
  }

  return { kind: 'general', precedingWord };
}

/** Extrae el mapa alias/tabla (en minúsculas) -> nombre real de tabla presente en una sentencia SQL. */
export function extractTableAliases(sqlText: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const refRegex = /\b(?:FROM|JOIN|UPDATE|INTO)\s+(?:"?([A-Za-z_][A-Za-z0-9_]*)"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
  let m: RegExpExecArray | null;
  while ((m = refRegex.exec(sqlText)) !== null) {
    const tableName = m[2];
    if (!tableName || RESERVED_ALIAS_WORDS.has(tableName.toUpperCase())) continue;
    aliases.set(tableName.toLowerCase(), tableName);
    const alias = m[3];
    if (alias && !RESERVED_ALIAS_WORDS.has(alias.toUpperCase())) {
      aliases.set(alias.toLowerCase(), tableName);
    }
  }

  // Soporte básico para FROM tabla_a a, tabla_b b
  const commaFrom = /\bFROM\s+([^;]+?)(?:\b(?:WHERE|GROUP|ORDER|HAVING|LIMIT|UNION|EXCEPT|INTERSECT)\b|$)/is.exec(sqlText);
  if (commaFrom?.[1]?.includes(',')) {
    for (const segment of commaFrom[1].split(',')) {
      const part = /^\s*(?:"?[A-Za-z_][A-Za-z0-9_]*"?\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?/i.exec(segment);
      if (!part) continue;
      const t = part[1];
      if (!RESERVED_ALIAS_WORDS.has(t.toUpperCase())) {
        aliases.set(t.toLowerCase(), t);
        if (part[2] && !RESERVED_ALIAS_WORDS.has(part[2].toUpperCase())) {
          aliases.set(part[2].toLowerCase(), t);
        }
      }
    }
  }

  return aliases;
}

function formatTableLabel(t: TableSchema): string {
  return t.schema !== 'public' ? `${t.schema}.${t.name}` : t.name;
}

function formatColumnDetail(col: ColumnSchema): string {
  const tags: string[] = [col.type];
  if (col.isPrimaryKey) tags.push('PK');
  if (col.isForeignKey) {
    tags.push(col.foreignKeyRef ? `FK → ${col.foreignKeyRef.table}.${col.foreignKeyRef.column}` : 'FK');
  }
  if (!col.nullable && !col.isPrimaryKey) tags.push('NOT NULL');
  return tags.join(' · ');
}

function buildDdlSuggestions(
  verb: NonNullable<SqlCompletionContext['ddlVerb']>,
  schema: DatabaseSchemaInfo
): SqlCompletionSuggestion[] {
  const items: SqlCompletionSuggestion[] = [];

  if (verb === 'CREATE') {
    items.push(
      {
        label: 'TABLE (plantilla completa)',
        insertText:
          'TABLE ${1:nombre_tabla} (\n  id SERIAL PRIMARY KEY,\n  ${2:nombre} VARCHAR(100) NOT NULL,\n  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
        kind: 'snippet',
        detail: 'Plantilla · Crea una nueva tabla',
        isSnippet: true,
        sortText: '00_01_table_snippet',
        filterText: 'TABLE'
      },
      { label: 'TABLE', insertText: 'TABLE ', kind: 'keyword', detail: 'Palabra clave DDL', sortText: '00_02_TABLE' },
      { label: 'TEMP TABLE', insertText: 'TEMP TABLE ', kind: 'keyword', detail: 'Tabla temporal de sesión', sortText: '00_03_TEMP_TABLE' },
      { label: 'VIEW', insertText: 'VIEW ', kind: 'keyword', detail: 'Crear vista SQL', sortText: '00_04_VIEW' },
      {
        label: 'OR REPLACE VIEW (plantilla)',
        insertText: 'OR REPLACE VIEW ${1:nombre_vista} AS\nSELECT ${2:*}\nFROM ${3:tabla};',
        kind: 'snippet',
        detail: 'Plantilla · Crea o reemplaza una vista',
        isSnippet: true,
        sortText: '00_05_view_snippet',
        filterText: 'OR REPLACE VIEW'
      },
      {
        label: 'INDEX (plantilla)',
        insertText: 'INDEX idx_${1:tabla}_${2:col} ON ${1:tabla} (${2:col});',
        kind: 'snippet',
        detail: 'Plantilla · Crea un índice',
        isSnippet: true,
        sortText: '00_06_index_snippet',
        filterText: 'INDEX'
      },
      { label: 'UNIQUE INDEX', insertText: 'UNIQUE INDEX ', kind: 'keyword', detail: 'Índice único', sortText: '00_07_UNIQUE_INDEX' },
      { label: 'SCHEMA', insertText: 'SCHEMA ', kind: 'keyword', detail: 'Nuevo esquema PostgreSQL', sortText: '00_08_SCHEMA' },
      { label: 'SEQUENCE', insertText: 'SEQUENCE ', kind: 'keyword', detail: 'Nueva secuencia numérica', sortText: '00_09_SEQUENCE' },
      { label: 'FUNCTION', insertText: 'FUNCTION ', kind: 'keyword', detail: 'Nueva función PL/pgSQL o SQL', sortText: '00_10_FUNCTION' },
      { label: 'TRIGGER', insertText: 'TRIGGER ', kind: 'keyword', detail: 'Nuevo disparador', sortText: '00_11_TRIGGER' }
    );
  } else if (verb === 'ALTER') {
    items.push(
      { label: 'TABLE', insertText: 'TABLE ', kind: 'keyword', detail: 'Modificar estructura de tabla', sortText: '00_01_TABLE' },
      { label: 'VIEW', insertText: 'VIEW ', kind: 'keyword', detail: 'Modificar vista', sortText: '00_02_VIEW' },
      { label: 'SCHEMA', insertText: 'SCHEMA ', kind: 'keyword', detail: 'Modificar esquema', sortText: '00_03_SCHEMA' },
      { label: 'SEQUENCE', insertText: 'SEQUENCE ', kind: 'keyword', detail: 'Modificar secuencia', sortText: '00_04_SEQUENCE' }
    );
    for (const t of schema.tables) {
      const target = formatTableLabel(t);
      items.push({
        label: `TABLE ${target} ADD COLUMN`,
        insertText: `TABLE ${target} ADD COLUMN \${1:nueva_col} \${2:VARCHAR(100)};`,
        kind: 'snippet',
        detail: `Agregar columna a ${target}`,
        isSnippet: true,
        sortText: `00_1_${target}`,
        filterText: `TABLE ${target}`
      });
    }
  } else if (verb === 'DROP' || verb === 'TRUNCATE') {
    if (verb === 'DROP') {
      items.push(
        { label: 'TABLE IF EXISTS', insertText: 'TABLE IF EXISTS ', kind: 'keyword', detail: 'Eliminar tabla si existe', sortText: '00_01_TABLE' },
        { label: 'VIEW IF EXISTS', insertText: 'VIEW IF EXISTS ', kind: 'keyword', detail: 'Eliminar vista si existe', sortText: '00_02_VIEW' },
        { label: 'INDEX IF EXISTS', insertText: 'INDEX IF EXISTS ', kind: 'keyword', detail: 'Eliminar índice si existe', sortText: '00_03_INDEX' },
        { label: 'SCHEMA IF EXISTS', insertText: 'SCHEMA IF EXISTS ', kind: 'keyword', detail: 'Eliminar esquema si existe', sortText: '00_04_SCHEMA' },
        { label: 'SEQUENCE IF EXISTS', insertText: 'SEQUENCE IF EXISTS ', kind: 'keyword', detail: 'Eliminar secuencia', sortText: '00_05_SEQUENCE' }
      );
      for (const t of schema.tables) {
        const target = formatTableLabel(t);
        items.push({
          label: `TABLE IF EXISTS ${target}`,
          insertText: `TABLE IF EXISTS ${target};`,
          kind: 'snippet',
          detail: `Eliminar tabla ${target}`,
          sortText: `00_1_${target}`,
          filterText: `TABLE ${target}`
        });
      }
    } else {
      for (const t of schema.tables) {
        const target = formatTableLabel(t);
        items.push({
          label: `TABLE ${target}`,
          insertText: `TABLE ${target} RESTART IDENTITY CASCADE;`,
          kind: 'snippet',
          detail: `Vaciar ${target} (${t.rowCount} filas)`,
          sortText: `00_1_${target}`,
          filterText: `TABLE ${target}`
        });
      }
    }
  }

  return items;
}

function buildSqlSnippets(schema: DatabaseSchemaInfo, precedingWord?: string): SqlCompletionSuggestion[] {
  const firstTable = schema.tables[0];
  const t = firstTable ? formatTableLabel(firstTable) : 'mi_tabla';
  const nonPkCols = firstTable?.columns.filter(c => !c.isPrimaryKey).map(c => c.name) ?? ['nombre', 'correo'];
  const insertCols = nonPkCols.length > 0 ? nonPkCols : ['nombre'];
  const colSample = firstTable?.columns[0]?.name ?? 'id';
  const colSecond = firstTable?.columns[1]?.name ?? 'nombre';

  const raw: {
    firstWord: string;
    label: string;
    insertText: string;
    detail: string;
    sort: string;
  }[] = [
    {
      firstWord: 'SELECT',
      label: 'SELECT … FROM … LIMIT',
      insertText: `SELECT \${1:*}\nFROM \${2:${t}}\nLIMIT \${3:50};`,
      detail: 'Plantilla · Consulta SELECT paginada',
      sort: '05_01_select'
    },
    {
      firstWord: 'SELECT',
      label: 'SELECT … WHERE … ORDER BY',
      insertText: `SELECT ${colSample}, ${colSecond}\nFROM ${t}\nWHERE \${1:${colSample} IS NOT NULL}\nORDER BY ${colSample} DESC\nLIMIT 50;`,
      detail: 'Plantilla · Consulta con filtro y orden',
      sort: '05_02_select_where'
    },
    {
      firstWord: 'CREATE',
      label: 'CREATE TABLE (completa)',
      insertText:
        'CREATE TABLE ${1:usuarios} (\n  id SERIAL PRIMARY KEY,\n  ${2:nombre} VARCHAR(100) NOT NULL,\n  ${3:correo} VARCHAR(150) UNIQUE,\n  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
      detail: 'Plantilla DDL · Nueva tabla PostgreSQL',
      sort: '05_03_create_table'
    },
    {
      firstWord: 'INSERT',
      label: `INSERT INTO ${t} … VALUES`,
      insertText: `INSERT INTO ${t} (${insertCols.join(', ')})\nVALUES (${insertCols.map((c, i) => `\${${i + 1}:'${c}'}`).join(', ')})\nRETURNING *;`,
      detail: 'Plantilla DML · Insertar registro',
      sort: '05_04_insert'
    },
    {
      firstWord: 'UPDATE',
      label: `UPDATE ${t} SET … WHERE`,
      insertText: `UPDATE ${t}\nSET \${1:${colSecond}} = \${2:'nuevo_valor'}\nWHERE ${colSample} = \${3:1};`,
      detail: 'Plantilla DML · Actualizar registros',
      sort: '05_05_update'
    },
    {
      firstWord: 'DELETE',
      label: `DELETE FROM ${t} WHERE`,
      insertText: `DELETE FROM ${t}\nWHERE ${colSample} = \${1:1};`,
      detail: 'Plantilla DML · Eliminar registros',
      sort: '05_06_delete'
    },
    {
      firstWord: 'ALTER',
      label: `ALTER TABLE ${t} ADD COLUMN`,
      insertText: `ALTER TABLE ${t}\nADD COLUMN \${1:nueva_columna} \${2:VARCHAR(100)};`,
      detail: 'Plantilla DDL · Añadir columna',
      sort: '05_07_alter'
    },
    {
      firstWord: 'WITH',
      label: 'WITH cte AS (SELECT …)',
      insertText: `WITH \${1:resumen} AS (\n  SELECT *\n  FROM ${t}\n)\nSELECT *\nFROM \${1:resumen};`,
      detail: 'Plantilla · Common Table Expression (CTE)',
      sort: '05_08_cte'
    },
    {
      firstWord: 'INNER',
      label: 'INNER JOIN … ON',
      insertText: 'INNER JOIN ${1:tabla} ${2:alias} ON ${3:a.id = alias.a_id}',
      detail: 'Plantilla · Unión interna entre tablas',
      sort: '05_09_inner_join'
    },
    {
      firstWord: 'LEFT',
      label: 'LEFT JOIN … ON',
      insertText: 'LEFT JOIN ${1:tabla} ${2:alias} ON ${3:a.id = alias.a_id}',
      detail: 'Plantilla · Unión izquierda conservando filas',
      sort: '05_10_left_join'
    },
    {
      firstWord: 'GROUP',
      label: 'GROUP BY … HAVING',
      insertText: `GROUP BY \${1:${colSecond}}\nHAVING COUNT(*) > \${2:0}`,
      detail: 'Plantilla · Agrupación y filtro agregado',
      sort: '05_11_group_by'
    },
    {
      firstWord: 'ORDER',
      label: 'ORDER BY … DESC',
      insertText: `ORDER BY \${1:${colSample}} \${2|ASC,DESC|}`,
      detail: 'Plantilla · Ordenación de resultados',
      sort: '05_12_order_by'
    },
    {
      firstWord: 'BEGIN',
      label: 'BEGIN … COMMIT (Transacción)',
      insertText: 'BEGIN;\n\n${1:-- Sentencias SQL}\n\nCOMMIT;',
      detail: 'Plantilla TCL · Bloque transaccional',
      sort: '05_13_transaction'
    }
  ];

  // Nunca sugerir una plantilla cuyo primer token ya es idéntico a la palabra precedente (evita CREATE CREATE TABLE / ORDER ORDER BY)
  return raw
    .filter(s => !precedingWord || s.firstWord !== precedingWord)
    .map(s => ({
      label: s.label,
      insertText: s.insertText,
      kind: 'snippet' as const,
      detail: s.detail,
      isSnippet: true,
      sortText: s.sort
    }));
}

/** Calcula sugerencias contextuales de autocompletado SQL a partir del cursor y el catálogo de PostgreSQL. */
export function getSqlCompletionItems(
  sqlText: string,
  linePrefix: string,
  currentWord: string,
  schema: DatabaseSchemaInfo,
  cursorOffset?: number
): SqlCompletionSuggestion[] {
  const beforeCursor = cursorOffset !== undefined ? sqlText.slice(0, cursorOffset) : sqlText;
  const ctx = detectSqlContext(beforeCursor, linePrefix);
  const fullCurrentStmt = sliceCurrentStatement(sqlText, cursorOffset);
  const aliases = extractTableAliases(fullCurrentStmt);
  const referencedTableNames = new Set(Array.from(aliases.values()).map(n => n.toLowerCase()));

  // 1) Contexto después de punto: esquema. / tabla. / alias.
  if (ctx.kind === 'dot' && ctx.qualifier) {
    const qualifier = ctx.qualifier.toLowerCase();
    const dotSuggestions: SqlCompletionSuggestion[] = [];

    const schemaTables = schema.tables.filter(t => t.schema.toLowerCase() === qualifier);
    const schemaViews = schema.views.filter(v => v.schema.toLowerCase() === qualifier);
    const schemaFuncs = schema.functions.filter(f => f.schema.toLowerCase() === qualifier);
    const schemaSeqs = (schema.sequences || []).filter(s => s.schema.toLowerCase() === qualifier);

    if (schemaTables.length > 0 || schemaViews.length > 0 || schemaFuncs.length > 0 || schemaSeqs.length > 0) {
      schemaTables.forEach((t, idx) =>
        dotSuggestions.push({
          label: t.name,
          insertText: t.name,
          kind: 'table',
          detail: `Tabla en ${t.schema} · ${t.rowCount} filas`,
          sortText: `00_${String(idx).padStart(3, '0')}_${t.name}`
        })
      );
      schemaViews.forEach((v, idx) =>
        dotSuggestions.push({
          label: v.name,
          insertText: v.name,
          kind: 'view',
          detail: `Vista en ${v.schema}`,
          sortText: `01_${String(idx).padStart(3, '0')}_${v.name}`
        })
      );
      schemaFuncs.forEach((f, idx) =>
        dotSuggestions.push({
          label: f.name,
          insertText: `${f.name}()`,
          kind: 'function',
          detail: `Función (${f.argTypes}) → ${f.returnType}`,
          sortText: `02_${String(idx).padStart(3, '0')}_${f.name}`
        })
      );
      schemaSeqs.forEach((s, idx) =>
        dotSuggestions.push({
          label: s.name,
          insertText: s.name,
          kind: 'sequence',
          detail: `Secuencia (${s.dataType})`,
          sortText: `03_${String(idx).padStart(3, '0')}_${s.name}`
        })
      );
      return dotSuggestions;
    }

    const resolvedName = (aliases.get(qualifier) ?? ctx.qualifier).toLowerCase();
    const matchedTable = schema.tables.find(t => t.name.toLowerCase() === resolvedName);
    if (matchedTable) {
      if (matchedTable.columns.length > 1) {
        dotSuggestions.push({
          label: '*',
          insertText: '*',
          kind: 'operator',
          detail: `Todas las columnas de ${matchedTable.name}`,
          sortText: '00_000_star'
        });
        dotSuggestions.push({
          label: `${matchedTable.columns.map(c => c.name).join(', ')}`,
          insertText: matchedTable.columns.map(c => `${ctx.qualifier}.${c.name}`).join(', '),
          kind: 'snippet',
          detail: `Insertar las ${matchedTable.columns.length} columnas de ${matchedTable.name}`,
          sortText: '00_001_all_cols'
        });
      }
      matchedTable.columns.forEach((col, i) => {
        dotSuggestions.push({
          label: col.name,
          insertText: col.name,
          kind: 'column',
          detail: `${matchedTable.name}.${col.name} · ${formatColumnDetail(col)}`,
          sortText: `00_${String(i + 2).padStart(3, '0')}_${col.name}`
        });
      });
      return dotSuggestions;
    }

    return dotSuggestions;
  }

  const suggestions: SqlCompletionSuggestion[] = [];
  const seen = new Set<string>();
  const pushUnique = (item: SqlCompletionSuggestion) => {
    const key = `${item.kind}::${item.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(item);
  };

  // 2) Después de CREATE / ALTER / DROP / TRUNCATE
  if (ctx.kind === 'ddl_object' && ctx.ddlVerb) {
    for (const item of buildDdlSuggestions(ctx.ddlVerb, schema)) {
      pushUnique(item);
    }
    return suggestions;
  }

  // 3) JOIN ... ON -> priorizar condiciones FK reales y columnas con alias
  if (ctx.kind === 'join_on') {
    const tableToAlias = new Map<string, string>();
    for (const [aliasKey, tableName] of aliases.entries()) {
      const lowerTable = tableName.toLowerCase();
      if (!tableToAlias.has(lowerTable) || aliasKey !== lowerTable) {
        tableToAlias.set(lowerTable, aliasKey);
      }
    }
    for (const t of schema.tables) {
      if (!referencedTableNames.has(t.name.toLowerCase())) continue;
      for (const fk of t.foreignKeys) {
        if (!referencedTableNames.has(fk.targetTable.toLowerCase())) continue;
        const srcAlias = tableToAlias.get(t.name.toLowerCase()) ?? t.name;
        const dstAlias = tableToAlias.get(fk.targetTable.toLowerCase()) ?? fk.targetTable;
        const expr = `${srcAlias}.${fk.sourceColumn} = ${dstAlias}.${fk.targetColumn}`;
        pushUnique({
          label: expr,
          insertText: expr,
          kind: 'snippet',
          detail: `Relación FK (${fk.constraintName})`,
          sortText: `00_00_${expr}`
        });
      }
    }
    for (const [aliasKey, tableName] of aliases.entries()) {
      const tbl = schema.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
      if (!tbl) continue;
      for (const col of tbl.columns) {
        const expr = `${aliasKey}.${col.name}`;
        pushUnique({
          label: expr,
          insertText: expr,
          kind: 'column',
          detail: `${tbl.name}.${col.name} · ${formatColumnDetail(col)}`,
          sortText: `00_01_${expr}`
        });
      }
    }
  }

  // 4) INSERT INTO tabla -> plantilla con sus columnas
  if (ctx.kind === 'insert_columns' && ctx.tableName) {
    const tbl = schema.tables.find(t => t.name.toLowerCase() === ctx.tableName!.toLowerCase());
    if (tbl && tbl.columns.length > 0) {
      const cols = tbl.columns.filter(c => !c.isPrimaryKey || !c.defaultValue?.includes('nextval'));
      const targetCols = cols.length > 0 ? cols : tbl.columns;
      const colNames = targetCols.map(c => c.name).join(', ');
      const placeholders = targetCols.map((c, idx) => `\${${idx + 1}:${c.name}}`).join(', ');
      const endedWithParen = /\(\s*$/.test(linePrefix.replace(/[A-Za-z_][A-Za-z0-9_]*$/, ''));
      pushUnique({
        label: `(${colNames}) VALUES (...)`,
        insertText: endedWithParen
          ? `${colNames}) VALUES (${placeholders}) RETURNING *;`
          : `(${colNames}) VALUES (${placeholders}) RETURNING *;`,
        kind: 'snippet',
        detail: `Insertar en ${tbl.name} (${targetCols.length} columnas)`,
        isSnippet: true,
        sortText: '00_00_insert_cols'
      });
    }
  }

  // 5) Definición de columnas (CREATE TABLE (...), ADD COLUMN ...)
  if (ctx.kind === 'column_def') {
    PG_DATA_TYPES.forEach((dt, idx) => {
      pushUnique({
        label: dt.label,
        insertText: dt.insertText,
        kind: 'type',
        detail: dt.detail,
        isSnippet: dt.isSnippet,
        sortText: `00_${String(idx).padStart(2, '0')}_${dt.label}`
      });
    });
    const constraints: readonly { label: string; insertText: string; detail: string; isSnippet?: boolean }[] = [
      { label: 'PRIMARY KEY', insertText: 'PRIMARY KEY', detail: 'Clave primaria única' },
      { label: 'NOT NULL', insertText: 'NOT NULL', detail: 'Impide valores NULL' },
      { label: 'UNIQUE', insertText: 'UNIQUE', detail: 'Valores únicos sin duplicados' },
      { label: 'DEFAULT', insertText: 'DEFAULT ${1:valor}', detail: 'Valor por defecto', isSnippet: true },
      { label: 'CHECK (...)', insertText: 'CHECK (${1:condicion})', detail: 'Restricción de validación', isSnippet: true }
    ];
    constraints.forEach((c, idx) =>
      pushUnique({
        label: c.label,
        insertText: c.insertText,
        kind: 'keyword',
        detail: c.detail,
        isSnippet: c.isSnippet,
        sortText: `01_${String(idx).padStart(2, '0')}_${c.label}`
      })
    );
    for (const t of schema.tables) {
      const pk = t.primaryKeys[0] ?? t.columns[0]?.name ?? 'id';
      const target = formatTableLabel(t);
      pushUnique({
        label: `REFERENCES ${target}(${pk})`,
        insertText: `REFERENCES ${target}(${pk}) ON DELETE CASCADE`,
        kind: 'snippet',
        detail: `Clave foránea hacia ${target}.${pk}`,
        sortText: `01_fk_${target}`
      });
    }
  }

  // 6) Tablas y JOIN sugeridos por FK en FROM/JOIN
  const tablePriority = ctx.kind === 'from_or_join' ? '00' : '02';
  for (const t of schema.tables) {
    const label = formatTableLabel(t);
    pushUnique({
      label,
      insertText: label,
      kind: 'table',
      detail: `Tabla (${t.schema}) · ${t.rowCount} filas · ${t.columns.length} cols`,
      sortText: `${tablePriority}_t_${label}`
    });

    if (ctx.kind === 'from_or_join') {
      for (const fk of t.foreignKeys) {
        if (referencedTableNames.has(t.name.toLowerCase())) {
          pushUnique({
            label: `${fk.targetTable} ON ${t.name}.${fk.sourceColumn} = ${fk.targetTable}.${fk.targetColumn}`,
            insertText: `${fk.targetTable} ON ${t.name}.${fk.sourceColumn} = ${fk.targetTable}.${fk.targetColumn}`,
            kind: 'snippet',
            detail: `Auto JOIN por FK hacia ${fk.targetTable}`,
            sortText: `00_fk_${fk.targetTable}`
          });
        }
      }
    }
  }

  for (const v of schema.views) {
    const label = v.schema !== 'public' ? `${v.schema}.${v.name}` : v.name;
    pushUnique({
      label,
      insertText: label,
      kind: 'view',
      detail: `Vista (${v.schema})`,
      sortText: `${tablePriority}_v_${label}`
    });
  }

  for (const sch of schema.schemas) {
    pushUnique({
      label: sch,
      insertText: sch,
      kind: 'schema',
      detail: 'Esquema PostgreSQL',
      sortText: '02_s_' + sch
    });
  }

  // 7) Columnas (deduplicadas por nombre, priorizando tablas referenciadas en SELECT/WHERE/GROUP/ORDER)
  const colPriority = ctx.kind === 'select_or_expr' ? '00' : '03';
  const columnBuckets = new Map<string, { col: ColumnSchema; tables: string[]; referenced: boolean }>();

  for (const t of schema.tables) {
    const isRef = referencedTableNames.has(t.name.toLowerCase());
    for (const col of t.columns) {
      const existing = columnBuckets.get(col.name);
      if (existing) {
        existing.tables.push(t.name);
        existing.referenced = existing.referenced || isRef;
      } else {
        columnBuckets.set(col.name, { col, tables: [t.name], referenced: isRef });
      }
    }
  }

  for (const [colName, info] of columnBuckets.entries()) {
    const rank = info.referenced ? '00' : colPriority;
    pushUnique({
      label: colName,
      insertText: colName,
      kind: 'column',
      detail: `${info.tables.join(', ')} · ${formatColumnDetail(info.col)}`,
      sortText: `${rank}_c_${colName}`
    });
  }

  for (const t of schema.tables) {
    for (const col of t.columns) {
      pushUnique({
        label: `${t.name}.${col.name}`,
        insertText: `${t.name}.${col.name}`,
        kind: 'column',
        detail: `${t.name}.${col.name} · ${formatColumnDetail(col)}`,
        sortText: `03_qc_${t.name}_${col.name}`
      });
    }
  }

  for (const seq of schema.sequences || []) {
    pushUnique({
      label: seq.name,
      insertText: seq.name,
      kind: 'sequence',
      detail: `Secuencia (${seq.schema}) · ${seq.dataType}`,
      sortText: `03_seq_${seq.name}`
    });
  }

  // 8) Funciones del catálogo y funciones estándar PostgreSQL
  for (const fn of schema.functions) {
    pushUnique({
      label: `${fn.name}()`,
      insertText: `${fn.name}()`,
      kind: 'function',
      detail: `Función (${fn.argTypes}) → ${fn.returnType}`,
      sortText: `03_fn_${fn.name}`
    });
  }
  for (const fn of SQL_FUNCTIONS) {
    pushUnique({
      label: fn.label,
      insertText: fn.insertText,
      kind: 'function',
      detail: fn.detail,
      isSnippet: fn.isSnippet,
      sortText: `03_pgfn_${fn.label}`
    });
  }

  // 9) Palabras clave individuales de PostgreSQL (evitando repetir justo la palabra precedente)
  const wordUpper = currentWord.toUpperCase();
  for (const kw of SINGLE_SQL_KEYWORDS) {
    if (ctx.precedingWord && kw === ctx.precedingWord && kw !== wordUpper) continue;
    const kwPriority = ctx.kind === 'statement_start' && ['SELECT', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'WITH', 'BEGIN'].includes(kw)
      ? '01'
      : '04';
    pushUnique({
      label: kw,
      insertText: kw,
      kind: 'keyword',
      detail: 'Palabra clave PostgreSQL',
      sortText: `${kwPriority}_kw_${kw}`
    });
  }

  // 10) Plantillas completas (excluyendo las que repetirían la palabra anterior)
  for (const snippet of buildSqlSnippets(schema, ctx.precedingWord)) {
    pushUnique(snippet);
  }

  return suggestions;
}

/** Calcula una sugerencia fantasma inline (para aceptar con Tab) según la línea actual y el esquema. */
export function getInlineGhostSuggestion(
  sqlText: string,
  linePrefix: string,
  lineSuffix: string,
  schema: DatabaseSchemaInfo
): string | null {
  if (lineSuffix.length > 0) return null;

  const trimmedStart = linePrefix.trimStart();
  const upperPrefix = trimmedStart.toUpperCase();
  const firstTable = schema.tables[0];
  const tableName = firstTable ? formatTableLabel(firstTable) : 'usuarios';
  const selectCols = firstTable && firstTable.columns.length > 0
    ? firstTable.columns.slice(0, 4).map(c => c.name).join(', ')
    : '*';

  // Documento/línea vacía: solo sugiere cuando el editor está completamente en blanco o al inicio de una nueva sentencia
  if (trimmedStart.length === 0) {
    const stmt = sliceCurrentStatement(sqlText).trim();
    if (stmt.length === 0) {
      if (!firstTable) {
        return 'CREATE TABLE usuarios (\n  id SERIAL PRIMARY KEY,\n  nombre VARCHAR(100) NOT NULL,\n  correo VARCHAR(150) UNIQUE,\n  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);';
      }
      return `SELECT ${selectCols}\nFROM ${tableName}\nLIMIT 50;`;
    }
    return null;
  }

  // Después de punto: completar primera columna relevante
  const dotMatch = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z0-9_]*)$/.exec(linePrefix);
  if (dotMatch) {
    const qualifier = dotMatch[1].toLowerCase();
    const member = dotMatch[2].toLowerCase();
    const aliases = extractTableAliases(sliceCurrentStatement(sqlText));
    const resolved = (aliases.get(qualifier) ?? dotMatch[1]).toLowerCase();
    const tbl = schema.tables.find(t => t.name.toLowerCase() === resolved);
    if (tbl) {
      const col = tbl.columns.find(c => !member || c.name.toLowerCase().startsWith(member));
      if (col && col.name.length > member.length) {
        return col.name.slice(member.length);
      }
    }
    return null;
  }

  // Completar tabla tras SELECT ... FROM <prefijo?>
  const fromMatch = /^SELECT\s+.+\s+FROM\s+([A-Za-z0-9_]*)$/i.exec(trimmedStart);
  if (fromMatch) {
    const partial = fromMatch[1].toLowerCase();
    const matchTable = schema.tables.find(t => t.name.toLowerCase().startsWith(partial)) ?? firstTable;
    if (matchTable) {
      if (!partial) return `${formatTableLabel(matchTable)} LIMIT 50;`;
      if (matchTable.name.length > partial.length && matchTable.name.toLowerCase().startsWith(partial)) {
        return `${matchTable.name.slice(partial.length)} LIMIT 50;`;
      }
    }
  }

  // Completar INSERT INTO <tabla>
  const insertMatch = /^INSERT\s+INTO\s+([A-Za-z0-9_]+)\s*$/i.exec(trimmedStart);
  if (insertMatch) {
    const tbl = schema.tables.find(t => t.name.toLowerCase() === insertMatch[1].toLowerCase());
    if (tbl) {
      const cols = tbl.columns.filter(c => !c.isPrimaryKey);
      const target = cols.length > 0 ? cols : tbl.columns;
      if (target.length > 0) {
        return ` (${target.map(c => c.name).join(', ')}) VALUES (${target.map(c => `'${c.name}'`).join(', ')});`;
      }
    }
  }

  // Patrones de prefijo en el comando actual (preserving user's partial prefix)
  const prefixPatterns: { full: string; continuation: string }[] = [
    { full: 'SELECT', continuation: ` ${selectCols} FROM ${tableName} LIMIT 50;` },
    {
      full: 'CREATE TABLE',
      continuation: ' usuarios (\n  id SERIAL PRIMARY KEY,\n  nombre VARCHAR(100) NOT NULL,\n  correo VARCHAR(150) UNIQUE,\n  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);'
    },
    { full: 'CREATE VIEW', continuation: ` vista_${tableName} AS\nSELECT * FROM ${tableName};` },
    { full: 'CREATE INDEX', continuation: ` idx_${tableName}_${firstTable?.columns[1]?.name ?? 'id'} ON ${tableName} (${firstTable?.columns[1]?.name ?? 'id'});` },
    { full: 'INSERT INTO', continuation: ` ${tableName} (${firstTable?.columns.filter(c => !c.isPrimaryKey).map(c => c.name).join(', ') || 'nombre'}) VALUES (...);` },
    { full: 'UPDATE', continuation: ` ${tableName} SET ${firstTable?.columns[1]?.name ?? 'nombre'} = 'valor' WHERE ${firstTable?.columns[0]?.name ?? 'id'} = 1;` },
    { full: 'DELETE FROM', continuation: ` ${tableName} WHERE ${firstTable?.columns[0]?.name ?? 'id'} = 1;` },
    { full: 'ALTER TABLE', continuation: ` ${tableName} ADD COLUMN nueva_col VARCHAR(100);` },
    { full: 'DROP TABLE', continuation: ` IF EXISTS ${tableName};` },
    { full: 'WITH', continuation: ` resumen AS (\n  SELECT * FROM ${tableName}\n)\nSELECT * FROM resumen;` },
    { full: 'BEGIN', continuation: ';\n\nCOMMIT;' }
  ];

  if (upperPrefix.length >= 2) {
    for (const pattern of prefixPatterns) {
      const fullWithTail = pattern.full + pattern.continuation;
      if (fullWithTail.toUpperCase().startsWith(upperPrefix) && fullWithTail.length > trimmedStart.length) {
        return fullWithTail.slice(trimmedStart.length);
      }
    }
  }

  // Coincidencia de tabla o palabra clave al final de la línea
  const tailWord = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmedStart)?.[1];
  if (tailWord && tailWord.length >= 2) {
    const lowerWord = tailWord.toLowerCase();
    for (const t of schema.tables) {
      if (t.name.toLowerCase().startsWith(lowerWord) && t.name.length > tailWord.length) {
        return t.name.slice(tailWord.length);
      }
    }
    const upperWord = tailWord.toUpperCase();
    for (const kw of SINGLE_SQL_KEYWORDS) {
      if (kw.startsWith(upperWord) && kw.length > tailWord.length) {
        return kw.slice(tailWord.length);
      }
    }
  }

  return null;
}

/** Devuelve chips clicables contextuales para mostrar en la barra superior del editor SQL. */
export function getContextualQuickChips(
  sqlText: string,
  linePrefix: string,
  schema: DatabaseSchemaInfo
): ContextualQuickChipsResult {
  const ctx = detectSqlContext(sqlText, linePrefix);
  const firstTable = schema.tables[0];

  if (ctx.kind === 'dot' && ctx.qualifier) {
    const aliases = extractTableAliases(sliceCurrentStatement(sqlText));
    const resolved = (aliases.get(ctx.qualifier.toLowerCase()) ?? ctx.qualifier).toLowerCase();
    const tbl = schema.tables.find(t => t.name.toLowerCase() === resolved);
    if (tbl) {
      return {
        contextLabel: `Columnas de ${tbl.name}`,
        chips: tbl.columns.slice(0, 8).map(c => ({
          label: c.name,
          insertText: c.name,
          category: 'Columna',
          detail: formatColumnDetail(c)
        }))
      };
    }
  }

  if (ctx.kind === 'ddl_object' && ctx.ddlVerb === 'CREATE') {
    return {
      contextLabel: 'Objeto DDL tras CREATE',
      chips: [
        {
          label: 'TABLE nueva (plantilla)',
          insertText: 'TABLE usuarios (\n  id SERIAL PRIMARY KEY,\n  nombre VARCHAR(100) NOT NULL,\n  correo VARCHAR(150) UNIQUE\n);',
          category: 'DDL',
          detail: 'Crear tabla completa'
        },
        { label: 'TABLE', insertText: 'TABLE ', category: 'DDL', detail: 'Palabra clave TABLE' },
        { label: 'VIEW', insertText: 'VIEW ', category: 'DDL', detail: 'Crear vista' },
        { label: 'INDEX', insertText: 'INDEX ', category: 'DDL', detail: 'Crear índice' },
        { label: 'SCHEMA', insertText: 'SCHEMA ', category: 'DDL', detail: 'Crear esquema' },
        { label: 'SEQUENCE', insertText: 'SEQUENCE ', category: 'DDL', detail: 'Crear secuencia' },
        { label: 'FUNCTION', insertText: 'FUNCTION ', category: 'DDL', detail: 'Crear función' }
      ]
    };
  }

  if (ctx.kind === 'column_def') {
    return {
      contextLabel: 'Tipos y restricciones PostgreSQL',
      chips: [
        { label: 'SERIAL PRIMARY KEY', insertText: 'SERIAL PRIMARY KEY', category: 'Tipo', detail: 'PK autoincremental' },
        { label: 'INTEGER', insertText: 'INTEGER', category: 'Tipo', detail: 'Entero 32-bit' },
        { label: 'VARCHAR(100)', insertText: 'VARCHAR(100)', category: 'Tipo', detail: 'Texto variable' },
        { label: 'TEXT', insertText: 'TEXT', category: 'Tipo', detail: 'Texto ilimitado' },
        { label: 'NUMERIC(10,2)', insertText: 'NUMERIC(10,2)', category: 'Tipo', detail: 'Decimal exacto' },
        { label: 'BOOLEAN DEFAULT TRUE', insertText: 'BOOLEAN DEFAULT TRUE', category: 'Tipo', detail: 'Booleano' },
        { label: 'NOT NULL', insertText: 'NOT NULL', category: 'Restricción', detail: 'Obligatorio' },
        { label: 'UNIQUE', insertText: 'UNIQUE', category: 'Restricción', detail: 'Valor único' },
        { label: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', insertText: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', category: 'Tipo', detail: 'Fecha automática' }
      ]
    };
  }

  if (ctx.kind === 'from_or_join' && schema.tables.length > 0) {
    return {
      contextLabel: 'Tablas disponibles',
      chips: schema.tables.slice(0, 8).map(t => ({
        label: formatTableLabel(t),
        insertText: formatTableLabel(t),
        category: 'Tabla',
        detail: `${t.rowCount} filas · ${t.columns.length} columnas`
      }))
    };
  }

  if (ctx.kind === 'select_or_expr' && firstTable) {
    const chips: QuickChipSuggestion[] = firstTable.columns.slice(0, 6).map(c => ({
      label: c.name,
      insertText: c.name,
      category: 'Columna',
      detail: `${firstTable.name}.${c.name} · ${c.type}`
    }));
    chips.push(
      { label: 'COUNT(*)', insertText: 'COUNT(*)', category: 'Función', detail: 'Contar filas' },
      { label: 'FROM', insertText: 'FROM ', category: 'Cláusula', detail: 'Especificar tabla origen' },
      { label: 'WHERE', insertText: 'WHERE ', category: 'Cláusula', detail: 'Filtrar registros' },
      { label: 'ORDER BY', insertText: 'ORDER BY ', category: 'Cláusula', detail: 'Ordenar resultados' }
    );
    return { contextLabel: `Columnas (${firstTable.name})`, chips };
  }

  if (ctx.kind === 'statement_start') {
    const target = firstTable ? formatTableLabel(firstTable) : 'usuarios';
    const chips: QuickChipSuggestion[] = [
      {
        label: 'CREATE TABLE …',
        insertText: 'CREATE TABLE usuarios (\n  id SERIAL PRIMARY KEY,\n  nombre VARCHAR(100) NOT NULL,\n  correo VARCHAR(150) UNIQUE,\n  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
        category: 'DDL',
        detail: 'Crear una nueva tabla PostgreSQL'
      },
      {
        label: `SELECT * FROM ${target}`,
        insertText: `SELECT * FROM ${target} LIMIT 50;`,
        category: 'DQL',
        detail: 'Consultar registros'
      },
      {
        label: `INSERT INTO ${target}`,
        insertText: `INSERT INTO ${target} () VALUES () RETURNING *;`,
        category: 'DML',
        detail: 'Insertar un nuevo registro'
      },
      {
        label: `UPDATE ${target}`,
        insertText: `UPDATE ${target} SET  WHERE id = 1;`,
        category: 'DML',
        detail: 'Actualizar registros'
      },
      {
        label: `ALTER TABLE ${target}`,
        insertText: `ALTER TABLE ${target} ADD COLUMN nueva_col VARCHAR(100);`,
        category: 'DDL',
        detail: 'Modificar tabla'
      },
      {
        label: 'WITH cte AS …',
        insertText: `WITH resumen AS (\n  SELECT * FROM ${target}\n)\nSELECT * FROM resumen;`,
        category: 'Avanzado',
        detail: 'Consulta con CTE'
      },
      { label: 'BEGIN … COMMIT', insertText: 'BEGIN;\n\nCOMMIT;', category: 'TCL', detail: 'Transacción' }
    ];
    return {
      contextLabel: schema.tables.length === 0 ? 'Inicio SQL (base en blanco)' : 'Inicio SQL',
      chips
    };
  }

  // Contexto general
  const chips: QuickChipSuggestion[] = [
    ...schema.tables.slice(0, 4).map(t => ({
      label: formatTableLabel(t),
      insertText: formatTableLabel(t),
      category: 'Tabla',
      detail: `${t.rowCount} filas`
    })),
    { label: 'WHERE', insertText: 'WHERE ', category: 'Cláusula', detail: 'Condición de filtro' },
    { label: 'JOIN', insertText: 'JOIN ', category: 'Cláusula', detail: 'Unir tabla' },
    { label: 'ORDER BY', insertText: 'ORDER BY ', category: 'Cláusula', detail: 'Ordenar' },
    { label: 'GROUP BY', insertText: 'GROUP BY ', category: 'Cláusula', detail: 'Agrupar' },
    { label: 'LIMIT 50', insertText: 'LIMIT 50', category: 'Cláusula', detail: 'Limitar filas' },
    { label: 'RETURNING *', insertText: 'RETURNING *', category: 'PostgreSQL', detail: 'Devolver filas modificadas' }
  ];
  return { contextLabel: 'Sugerencias contextuales', chips };
}
