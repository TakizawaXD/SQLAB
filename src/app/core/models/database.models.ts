export const PROJECT_FORMAT_VERSION = 2;
export const DATA_RETENTION_DAYS = 7;

export interface ProjectInfo {
  /** Fecha de caducidad según la política de retención local. */
  expiresAt?: string;
  id: string;
  name: string;
  description?: string;
  databases: string[];
  activeDb?: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectExportBundle {
  format: 'sqllab-project';
  schemaVersion: number;
  exportedAt: string;
  project: ProjectInfo;
  databases: {
    name: string;
    sqlDump: string;
    isSample?: boolean;
  }[];
}

export interface DatabaseInfo {
  /** Fecha de caducidad según la política de retención local. */
  expiresAt?: string;
  name: string;
  projectId?: string;
  sizeBytes?: number;
  tableCount?: number;
  createdAt?: string;
  updatedAt?: string;
  isDefault?: boolean;
  /** Base de datos de ejemplo incluida con la aplicación. */
  isSample?: boolean;
  /** Los datos iniciales ya fueron cargados (o la base fue creada por el usuario). */
  seeded?: boolean;
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique?: boolean;
  schema?: string;
  foreignKeyRef?: {
    table: string;
    column: string;
  };
}

export interface ConstraintSchema {
  name: string;
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
  columns: string[];
  definition: string;
}

export interface ForeignKeyRelation {
  constraintName: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
}

export interface IndexSchema {
  name: string;
  tableName: string;
  isUnique: boolean;
  columnNames: string[];
}

export interface SequenceSchema {
  schema: string;
  name: string;
  dataType: string;
  startValue: string;
  incrementBy: string;
  lastValue: string | null;
}

export interface TableSchema {
  schema: string;
  name: string;
  rowCount: number;
  columns: ColumnSchema[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyRelation[];
  indexes: IndexSchema[];
  constraints?: ConstraintSchema[];
}

export interface ViewSchema {
  schema: string;
  name: string;
  definition?: string;
}

export interface FunctionSchema {
  schema: string;
  name: string;
  returnType: string;
  argTypes: string;
}

export interface TriggerSchema {
  schema: string;
  name: string;
  tableName: string;
  actionTiming: string;
  event: string;
}

export interface DatabaseSchemaInfo {
  schemas: string[];
  tables: TableSchema[];
  views: ViewSchema[];
  functions: FunctionSchema[];
  triggers: TriggerSchema[];
  sequences?: SequenceSchema[];
}

export interface DialectWarning {
  dialect: 'MySQL' | 'SQL Server' | 'Oracle' | 'SQLite';
  construct: string;
  message: string;
  suggestion: string;
}

export interface QueryResult {
  query: string;
  success: boolean;
  rows: Record<string, any>[];
  /**
   * `name` es el nombre mostrado (puede repetirse en un JOIN); `key` es la clave única
   * de la columna dentro de cada fila (igual a `name` salvo duplicados: `id`, `id_2`...).
   */
  columns: { name: string; key?: string; type?: string }[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
  /** Código SQLSTATE devuelto por PostgreSQL (p. ej. 42601 = error de sintaxis). */
  errorCode?: string;
  /** Posición (1-based, en caracteres) del error dentro de `query`, según PostgreSQL. */
  errorPosition?: number;
  /** La ejecución fue cancelada por el usuario o por el límite de tiempo. */
  cancelled?: boolean;
  /** El resultado se recortó a `MAX_RESULT_ROWS` filas para proteger la memoria. */
  truncated?: boolean;
  totalRows?: number;
  command?: string;
  affectedRows?: number;
  statementCount?: number;
  dialectWarnings?: DialectWarning[];
}

export interface BackupItem {
  /** Fecha de caducidad según la política de retención local. */
  expiresAt?: string;
  id: string;
  database: string;
  timestamp: string;
  reason: string;
  sqlDump: string;
}

export interface ExecutionHistoryItem {
  id: string;
  query: string;
  database: string;
  projectId?: string;
  timestamp: string;
  success: boolean;
  executionTimeMs: number;
  rowCount: number;
  isFavorite?: boolean;
  error?: string;
}

export interface EditorTab {
  /** Fecha de caducidad según la política de retención local. */
  expiresAt?: string;
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  database: string;
  updatedAt?: string;
}

export interface StorageStats {
  usedBytes: number;
  quotaBytes: number;
  usedPercentage: number;
  formattedUsed: string;
  formattedQuota: string;
}
