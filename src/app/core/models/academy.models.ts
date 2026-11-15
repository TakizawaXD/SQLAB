export interface ExpectedColumnSpec {
  name: string;
  /** Expresión regular contra pg_catalog.format_type (ej. 'int', 'char|text', 'numeric|decimal'). */
  typePattern?: string;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
}

export interface DdlValidationSpec {
  tableName: string;
  schema?: string;
  requiredColumns: ExpectedColumnSpec[];
  requirePrimaryKeyOn?: string[];
  requireForeignKeys?: { column: string; targetTable: string }[];
  minIndexes?: number;
}

export interface PracticeTask {
  instruction: string;
  hint: string;
  solutionSql: string;
  expectedResult?: string;
  validationType?: 'select' | 'ddl';
  ddlCheck?: DdlValidationSpec;
  requireOrder?: boolean;
}

export interface Lesson {
  id: string;
  order: number;
  title: string;
  category: string;
  description: string;
  durationMinutes: number;
  completed: boolean;
  theory: string;
  codeSnippet: string;
  tasks: PracticeTask[];
}

export type ChallengeDifficulty = 'Principiante' | 'Intermedio' | 'Avanzado';

export interface Challenge {
  id: string;
  order: number;
  title: string;
  difficulty: ChallengeDifficulty;
  category: string;
  points: number;
  objective: string;
  sampleDb: string;
  starterQuery: string;
  solutionQuery: string;
  hints: string[];
  explanation: string;
  solved: boolean;
  /** 'select' compara filas contra solución; 'ddl' valida catálogos reales de PostgreSQL. */
  validationType?: 'select' | 'ddl';
  /** SQL inicial opcional del sandbox aislado (si omite, usa esquema tienda_online). */
  sampleSeedSql?: string;
  /** Especificación estructural cuando validationType === 'ddl'. */
  ddlCheck?: DdlValidationSpec;
  /** La validación exige el mismo orden de filas que la solución. */
  requireOrder?: boolean;
}

export interface ChallengeAttempt {
  id: string;
  challengeId: string;
  challengeTitle: string;
  passed: boolean;
  pointsAwarded: number;
  timestamp: number;
  message: string;
  queryPreview: string;
}

export interface ChallengeValidation {
  passed: boolean;
  userRows: Record<string, unknown>[];
  expectedRows: Record<string, unknown>[];
  userColumns: string[];
  message: string;
  pointsAwarded?: number;
  dialectHints?: string[];
}
