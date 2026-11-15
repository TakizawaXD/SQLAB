import type { DialectWarning } from '../models/database.models';

/**
 * Utilidades léxicas para SQL (PostgreSQL).
 * Respetan cadenas ('...', E'...'), identificadores entre comillas ("..."),
 * comentarios de línea (--) y de bloque (/* *\/) y cuerpos dollar-quoted ($$ ... $$, $tag$ ... $tag$).
 */

export interface SqlStatementRange {
  /** Texto de la sentencia (sin el `;` final, recortado). */
  text: string;
  /** Desplazamiento inicial (inclusive) en el texto original. */
  start: number;
  /** Desplazamiento final (exclusivo, incluye el `;` si existe). */
  end: number;
}

/** Divide un script SQL en sentencias individuales. Las sentencias vacías o de solo comentarios se omiten. */
export function splitSqlStatements(sql: string): SqlStatementRange[] {
  const result: SqlStatementRange[] = [];
  const len = sql.length;
  let i = 0;
  let stmtStart = 0;

  const push = (endExclusive: number, endWithSemicolon: number) => {
    const raw = sql.slice(stmtStart, endExclusive);
    if (hasExecutableContent(raw)) {
      result.push({ text: raw.trim(), start: stmtStart, end: endWithSemicolon });
    }
  };

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? len : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (ch === "'") {
      i = skipQuoted(sql, i, "'");
      continue;
    }
    if (ch === '"') {
      i = skipQuoted(sql, i, '"');
      continue;
    }
    if (ch === '$') {
      const tag = readDollarTag(sql, i);
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        i = close === -1 ? len : close + tag.length;
        continue;
      }
    }
    if (ch === ';') {
      push(i, i + 1);
      stmtStart = i + 1;
    }
    i++;
  }
  push(len, len);
  return result;
}

/** Devuelve la sentencia que contiene (o precede inmediatamente) al desplazamiento indicado. */
export function statementAtOffset(sql: string, offset: number): SqlStatementRange | null {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) return null;
  for (const st of statements) {
    if (offset >= st.start && offset <= st.end) return st;
  }
  // Cursor entre sentencias: elegir la anterior más cercana
  let candidate: SqlStatementRange | null = null;
  for (const st of statements) {
    if (st.end <= offset) candidate = st;
  }
  return candidate ?? statements[0];
}

/** Elimina comentarios y literales para análisis por expresiones regulares. */
export function stripSqlNoise(sql: string): string {
  let out = '';
  let i = 0;
  const len = sql.length;
  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? len : nl + 1;
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      i = skipBlockComment(sql, i);
      out += ' ';
      continue;
    }
    if (ch === "'") {
      i = skipQuoted(sql, i, "'");
      out += "''";
      continue;
    }
    if (ch === '$') {
      const tag = readDollarTag(sql, i);
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        i = close === -1 ? len : close + tag.length;
        out += '$$$$';
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/** true si el texto contiene algo distinto de espacios y comentarios. */
export function hasExecutableContent(sql: string): boolean {
  return stripSqlNoise(sql).replace(/;/g, '').trim().length > 0;
}

/** Cita un identificador PostgreSQL de forma segura. */
export function quoteIdent(name: string): string {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/** Devuelve el identificador calificado `"esquema"."tabla"` (o `"tabla"` si no hay esquema). */
export function qualifyTableName(table: string, schema?: string): string {
  if (!schema || schema === 'public') {
    if (table.includes('.')) {
      const [s, t] = table.split('.', 2);
      return `${quoteIdent(s)}.${quoteIdent(t)}`;
    }
    return quoteIdent(table);
  }
  const cleanTable = table.includes('.') ? table.split('.').slice(-1)[0] : table;
  return `${quoteIdent(schema)}.${quoteIdent(cleanTable)}`;
}

/** Cita un literal de texto PostgreSQL de forma segura. */
export function quoteLiteral(value: string): string {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Analiza sentencias SQL para detectar construcciones propias de otros dialectos
 * (MySQL, SQL Server, Oracle, SQLite) y orientar al usuario con su equivalente PostgreSQL.
 */
export function analyzeSqlDialect(sql: string): DialectWarning[] {
  const cleaned = stripSqlNoise(sql);
  if (!cleaned.trim()) return [];

  const warnings: DialectWarning[] = [];
  const seen = new Set<string>();
  const add = (w: DialectWarning) => {
    const key = `${w.dialect}:${w.construct}`;
    if (!seen.has(key)) {
      seen.add(key);
      warnings.push(w);
    }
  };

  const rules: Array<{ test: RegExp; warning: DialectWarning }> = [
    {
      test: /\bAUTO_INCREMENT\b/i,
      warning: {
        dialect: 'MySQL',
        construct: 'AUTO_INCREMENT',
        message: 'PostgreSQL no utiliza la palabra clave AUTO_INCREMENT.',
        suggestion: 'Usa SERIAL, BIGSERIAL o GENERATED ALWAYS AS IDENTITY.'
      }
    },
    {
      test: /\bSHOW\s+TABLES\b/i,
      warning: {
        dialect: 'MySQL',
        construct: 'SHOW TABLES',
        message: 'SHOW TABLES pertenece al cliente MySQL.',
        suggestion: "Usa SELECT tablename FROM pg_tables WHERE schemaname = 'public'; o el comando 'tables' / '\\dt' en la terminal."
      }
    },
    {
      test: /\bSHOW\s+DATABASES\b/i,
      warning: {
        dialect: 'MySQL',
        construct: 'SHOW DATABASES',
        message: 'SHOW DATABASES pertenece a MySQL.',
        suggestion: "Usa el comando 'databases' en la terminal de SQL LAB."
      }
    },
    {
      test: /(?:^|;)\s*(?:DESCRIBE|DESC)\s+[a-zA-Z_"]/im,
      warning: {
        dialect: 'MySQL',
        construct: 'DESCRIBE <tabla>',
        message: 'DESCRIBE no es una sentencia SQL estándar en PostgreSQL.',
        suggestion: "Usa el comando interno 'describe <tabla>' en la terminal o consulta information_schema.columns."
      }
    },
    {
      test: /(?:^|;)\s*USE\s+[a-zA-Z_"]/im,
      warning: {
        dialect: 'MySQL',
        construct: 'USE <base_de_datos>',
        message: 'USE <bd> no se ejecuta dentro de consultas PostgreSQL.',
        suggestion: "Selecciona la base de datos en el explorador o ejecuta 'use <nombre>' en la terminal."
      }
    },
    {
      test: /`[^`]+`/,
      warning: {
        dialect: 'MySQL',
        construct: 'Comillas invertidas (`...`)',
        message: 'MySQL usa comillas invertidas (`) para identificadores; PostgreSQL exige comillas dobles.',
        suggestion: 'Reemplaza `identificador` por "identificador" o escríbelo sin comillas.'
      }
    },
    {
      test: /\bINT\s*\(\s*\d+\s*\)/i,
      warning: {
        dialect: 'MySQL',
        construct: 'INT(n)',
        message: 'PostgreSQL no acepta ancho de visualización en tipos enteros como INT(11).',
        suggestion: 'Usa INTEGER, INT o BIGINT.'
      }
    },
    {
      test: /\bLIMIT\s+\d+\s*,\s*\d+\b/i,
      warning: {
        dialect: 'MySQL',
        construct: 'LIMIT offset, count',
        message: 'La sintaxis LIMIT desplazamiento, cantidad es de MySQL.',
        suggestion: 'En PostgreSQL usa LIMIT <cantidad> OFFSET <desplazamiento>.'
      }
    },
    {
      test: /\bENGINE\s*=\s*(?:InnoDB|MyISAM|MEMORY)\b/i,
      warning: {
        dialect: 'MySQL',
        construct: 'ENGINE=InnoDB',
        message: 'PostgreSQL no utiliza cláusulas ENGINE= al final de CREATE TABLE.',
        suggestion: 'Elimina ENGINE=InnoDB ... de tu sentencia CREATE TABLE.'
      }
    },
    {
      test: /\bDATETIME\b/i,
      warning: {
        dialect: 'MySQL',
        construct: 'DATETIME',
        message: 'El tipo DATETIME es de MySQL/SQL Server.',
        suggestion: 'En PostgreSQL utiliza TIMESTAMP o TIMESTAMPTZ.'
      }
    },
    {
      test: /\bSELECT\s+(?:DISTINCT\s+)?TOP\s+\d+\b/i,
      warning: {
        dialect: 'SQL Server',
        construct: 'SELECT TOP n',
        message: 'SELECT TOP n pertenece a T-SQL (SQL Server).',
        suggestion: 'En PostgreSQL coloca LIMIT n al final de la consulta.'
      }
    },
    {
      test: /\bNVARCHAR\b/i,
      warning: {
        dialect: 'SQL Server',
        construct: 'NVARCHAR',
        message: 'NVARCHAR es propio de SQL Server; PostgreSQL usa UTF-8 de forma nativa.',
        suggestion: 'Reemplaza NVARCHAR por VARCHAR(n) o TEXT.'
      }
    },
    {
      test: /\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/i,
      warning: {
        dialect: 'SQL Server',
        construct: 'IDENTITY(1,1)',
        message: 'IDENTITY(inicio, paso) corresponde a SQL Server.',
        suggestion: 'Usa SERIAL o GENERATED ALWAYS AS IDENTITY en PostgreSQL.'
      }
    },
    {
      test: /\bGETDATE\s*\(\s*\)/i,
      warning: {
        dialect: 'SQL Server',
        construct: 'GETDATE()',
        message: 'GETDATE() es una función de T-SQL (SQL Server).',
        suggestion: 'En PostgreSQL usa NOW() o CURRENT_TIMESTAMP.'
      }
    },
    {
      test: /\bIIF\s*\(/i,
      warning: {
        dialect: 'SQL Server',
        construct: 'IIF(cond, a, b)',
        message: 'IIF() pertenece a T-SQL / Access.',
        suggestion: 'Usa CASE WHEN cond THEN a ELSE b END en PostgreSQL.'
      }
    },
    {
      test: /\bFROM\s+DUAL\b/i,
      warning: {
        dialect: 'Oracle',
        construct: 'FROM DUAL',
        message: 'Oracle requiere FROM DUAL para expresiones sin tabla; PostgreSQL no lo necesita.',
        suggestion: 'Elimina FROM DUAL (por ejemplo: SELECT NOW();).'
      }
    },
    {
      test: /\bVARCHAR2\b/i,
      warning: {
        dialect: 'Oracle',
        construct: 'VARCHAR2',
        message: 'VARCHAR2 es un tipo de datos exclusivo de Oracle.',
        suggestion: 'Usa VARCHAR(n) o TEXT en PostgreSQL.'
      }
    },
    {
      test: /\bNVL\s*\(/i,
      warning: {
        dialect: 'Oracle',
        construct: 'NVL(a, b)',
        message: 'NVL() es una función de Oracle.',
        suggestion: 'Usa la función estándar COALESCE(a, b) en PostgreSQL.'
      }
    },
    {
      test: /\bSYSDATE\b/i,
      warning: {
        dialect: 'Oracle',
        construct: 'SYSDATE',
        message: 'SYSDATE pertenece a Oracle.',
        suggestion: 'Usa CURRENT_TIMESTAMP o NOW() en PostgreSQL.'
      }
    },
    {
      test: /\bAUTOINCREMENT\b/i,
      warning: {
        dialect: 'SQLite',
        construct: 'AUTOINCREMENT',
        message: 'AUTOINCREMENT pertenece a SQLite.',
        suggestion: 'Usa SERIAL, BIGSERIAL o GENERATED ALWAYS AS IDENTITY en PostgreSQL.'
      }
    },
    {
      test: /(?:^|;)\s*PRAGMA\b/im,
      warning: {
        dialect: 'SQLite',
        construct: 'PRAGMA',
        message: 'PRAGMA es exclusivo de SQLite.',
        suggestion: 'Usa comandos SHOW o consulta pg_catalog / information_schema.'
      }
    }
  ];

  for (const rule of rules) {
    if (rule.test.test(cleaned)) {
      add(rule.warning);
    }
  }

  return warnings;
}

function skipBlockComment(sql: string, start: number): number {
  // Los comentarios de bloque en PostgreSQL pueden anidarse
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    if (sql[i] === '/' && sql[i + 1] === '*') {
      depth++;
      i += 2;
    } else if (sql[i] === '*' && sql[i + 1] === '/') {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return sql.length;
}

function skipQuoted(sql: string, start: number, quote: string): number {
  // Soporta escapes por duplicación ('') y, en cadenas E'', escapes con barra invertida.
  const isEscapeString = quote === "'" && start > 0 && /[eE]/.test(sql[start - 1]) && !/[a-zA-Z0-9_]/.test(sql[start - 2] ?? '');
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (isEscapeString && ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
}

function readDollarTag(sql: string, start: number): string | null {
  // $$ o $etiqueta$ (la etiqueta no puede empezar por dígito: $1 es un parámetro)
  const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(start, start + 64));
  if (!match) return null;
  // Evitar confundir con identificadores que contienen $ (p.ej. foo$bar)
  if (start > 0 && /[A-Za-z0-9_]/.test(sql[start - 1])) return null;
  return match[0];
}
