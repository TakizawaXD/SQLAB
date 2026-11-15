import { Injectable, computed, signal } from '@angular/core';
import type { PGlite, Results } from '@electric-sql/pglite';
import {
  DatabaseInfo,
  DatabaseSchemaInfo,
  ProjectInfo,
  ProjectExportBundle,
  PROJECT_FORMAT_VERSION,
  TableSchema,
  ColumnSchema,
  ConstraintSchema,
  ForeignKeyRelation,
  IndexSchema,
  SequenceSchema,
  QueryResult,
  ExecutionHistoryItem,
  BackupItem
} from '../models/database.models';
import {
  StorageService,
  DEFAULT_PROJECT_ID,
  formatRemainingRetention,
  isTimestampExpired,
  computeExpiresAt
} from './storage.service';
import { SampleDatabasesService } from './sample-databases.service';
import { dumpPublicSchema } from './sql-dump';
import { analyzeSqlDialect, qualifyTableName, quoteIdent, stripSqlNoise } from '../utils/sql-utils';

export type EngineState = 'starting' | 'ready' | 'busy' | 'error';

interface PgliteAssets {
  pgliteWasmModule: WebAssembly.Module;
  initdbWasmModule: WebAssembly.Module;
  fsBundle: Blob;
}

export interface ExecuteOptions {
  /** Registrar la consulta en el historial (por defecto: true). */
  recordHistory?: boolean;
  /** Publicar el resultado en `lastResult` (por defecto: true). */
  publish?: boolean;
}

const LAST_PROJECT_KEY = 'sqllab_last_project';
const MAX_BACKUPS_PER_DB = 10;
/** Máximo de filas que se entregan a la interfaz por resultado (control de memoria). */
export const MAX_RESULT_ROWS = 20000;
const EMPTY_SCHEMA: DatabaseSchemaInfo = {
  schemas: ['public'],
  tables: [],
  views: [],
  functions: [],
  triggers: [],
  sequences: []
};

const USER_NS_FILTER = `n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp_%' AND n.nspname NOT LIKE 'pg_toast_temp_%'`;

@Injectable({
  providedIn: 'root'
})
export class SqlEngineService {
  private pglite: PGlite | null = null;
  private static assetsPromise: Promise<PgliteAssets> | null = null;
  /** Cola que serializa todas las operaciones sobre el motor activo. */
  private queue: Promise<unknown> = Promise.resolve();
  private expirationTimer: ReturnType<typeof setInterval> | null = null;

  readonly state = signal<EngineState>('starting');
  readonly isReady = signal<boolean>(false);
  readonly isExecuting = signal<boolean>(false);

  readonly projects = signal<ProjectInfo[]>([]);
  readonly currentProjectId = signal<string>(DEFAULT_PROJECT_ID);
  readonly currentProject = computed(
    () => this.projects().find(p => p.id === this.currentProjectId()) ?? this.projects()[0] ?? null
  );

  readonly currentDbName = signal<string>('principal');
  readonly databases = signal<DatabaseInfo[]>([]);
  /** Bases de datos visibles dentro del proyecto seleccionado (aisladas por proyecto). */
  readonly projectDatabases = computed(() => {
    const pid = this.currentProjectId();
    return this.sortDatabases(
      this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === pid)
    );
  });

  readonly currentSchema = signal<DatabaseSchemaInfo>(EMPTY_SCHEMA);
  readonly lastResult = signal<QueryResult | null>(null);
  readonly engineStatus = signal<string>('Iniciando motor PostgreSQL Wasm...');
  readonly pgVersion = signal<string>('PostgreSQL (PGlite)');
  readonly historyVersion = signal<number>(0);
  /** true si IndexedDB falló y la base activa vive solo en memoria (no persistente). */
  readonly inMemoryMode = signal<boolean>(false);

  readonly totalTables = computed(() => this.currentSchema().tables.length);

  constructor(
    private storageService: StorageService,
    private sampleDbsService: SampleDatabasesService
  ) {}

  // ---------------------------------------------------------------------------
  // Ciclo de vida e inicialización
  // ---------------------------------------------------------------------------

  async init(): Promise<void> {
    this.state.set('starting');
    try {
      this.engineStatus.set('Inicializando almacenamiento local IndexedDB...');
      await this.storageService.init();

      const expiredDbs = await this.storageService.purgeExpiredData();
      for (const name of expiredDbs) {
        await deletePgliteIdb(name);
      }

      let dbs = await this.storageService.getDatabasesList();
      const validDbs: DatabaseInfo[] = [];
      for (const db of dbs) {
        if (db.createdAt && isTimestampExpired(db.createdAt)) {
          await deletePgliteIdb(db.name);
          await this.storageService.removeDatabaseInfo(db.name);
        } else {
          validDbs.push({ ...db, projectId: db.projectId || DEFAULT_PROJECT_ID });
        }
      }

      if (validDbs.length === 0) {
        dbs = [await this.createBlankDefaultDb(DEFAULT_PROJECT_ID)];
      } else {
        dbs = validDbs;
      }
      this.databases.set(this.sortDatabases(dbs));

      await this.syncProjectsState();

      this.engineStatus.set('Conectando motor PostgreSQL...');

      const savedProjId = safeLocalStorageGet(LAST_PROJECT_KEY);
      const allProjects = this.projects();
      const activeProj = allProjects.find(p => p.id === savedProjId) || allProjects[0];
      if (activeProj) {
        this.currentProjectId.set(activeProj.id);
        safeLocalStorageSet(LAST_PROJECT_KEY, activeProj.id);
      }

      const projDbs = this.projectDatabases();
      const lastDb = activeProj?.activeDb || safeLocalStorageGet('sqllab_last_db');
      const initialDb =
        projDbs.find(d => d.name === lastDb) ||
        projDbs.find(d => d.name === 'principal') ||
        projDbs[0];

      if (!initialDb) {
        const blank = await this.createBlankDefaultDb(this.currentProjectId());
        this.databases.set(this.sortDatabases([...this.databases(), blank]));
        await this.switchDatabase(blank.name);
      } else {
        await this.switchDatabase(initialDb.name);
      }

      this.startExpirationWatcher();

      try {
        const v = await this.pglite!.query<{ v: string }>(`SELECT split_part(version(), ' on ', 1) AS v`);
        this.pgVersion.set(v.rows[0]?.v ?? 'PostgreSQL');
      } catch {
        // Informativo solamente
      }
    } catch (err: any) {
      console.error('Error starting SQL Engine:', err);
      this.state.set('error');
      this.isReady.set(false);
      this.engineStatus.set('Error al iniciar el motor: ' + (err?.message || err));
    }
  }

  /** Crea una instancia temporal de PGlite en memoria completamente aislada del proyecto del usuario. */
  async createSandboxInstance(initSql?: string): Promise<PGlite> {
    const [{ PGlite }, assets] = await Promise.all([
      import('@electric-sql/pglite'),
      SqlEngineService.loadAssets().catch(() => null)
    ]);

    const sandbox = new PGlite({
      relaxedDurability: false,
      ...(assets ?? {})
    });
    await this.waitForPgliteReady(sandbox, 45000);
    if (initSql && initSql.trim()) {
      await sandbox.exec(initSql);
    }
    return sandbox;
  }

  private static loadAssets(): Promise<PgliteAssets> {
    const provider = (globalThis as { __SQLAB_PGLITE_ASSETS__?: () => Promise<PgliteAssets> }).__SQLAB_PGLITE_ASSETS__;
    if (!SqlEngineService.assetsPromise && provider) {
      // Entorno de pruebas (Node): los binarios se leen de node_modules
      SqlEngineService.assetsPromise = provider();
    }
    if (!SqlEngineService.assetsPromise) {
      const isValidBinaryResponse = (res: Response): boolean =>
        res.ok && !(res.headers.get('content-type') || '').includes('text/html');

      const tryFetch = async (file: string): Promise<Response> => {
        try {
          const res1 = await fetch(new URL(`assets/pglite/${file}`, document.baseURI));
          if (isValidBinaryResponse(res1)) return res1;
        } catch {}
        try {
          const res2 = await fetch(new URL(file, document.baseURI));
          if (isValidBinaryResponse(res2)) return res2;
        } catch {}
        throw new Error(`No se pudo descargar ${file} desde assets/pglite/ ni raíz`);
      };

      const compile = async (file: string): Promise<WebAssembly.Module> => {
        const response = await tryFetch(file);
        return WebAssembly.compile(await response.arrayBuffer());
      };

      const loadBlob = async (file: string): Promise<Blob> => {
        const response = await tryFetch(file);
        return response.blob();
      };

      SqlEngineService.assetsPromise = Promise.all([
        compile('pglite.wasm'),
        compile('initdb.wasm'),
        loadBlob('pglite.data')
      ]).then(([pgliteWasmModule, initdbWasmModule, fsBundle]) => ({ pgliteWasmModule, initdbWasmModule, fsBundle }))
        .catch(err => {
          console.warn('Wasm preloading warning:', err);
          SqlEngineService.assetsPromise = null;
          throw err;
        });
    }
    return SqlEngineService.assetsPromise;
  }

  private async waitForPgliteReady(pg: PGlite, timeoutMs = 8000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        pg.waitReady,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms) inicializando PostgreSQL`)), timeoutMs);
        })
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async openInstance(name: string): Promise<PGlite> {
    const [{ PGlite }, assets] = await Promise.all([
      import('@electric-sql/pglite'),
      SqlEngineService.loadAssets().catch(() => null)
    ]);

    const pg = new PGlite({
      dataDir: `idb://sqllab_db_${name}`,
      relaxedDurability: false,
      ...(assets ?? {})
    });

    try {
      await this.waitForPgliteReady(pg, 45000);
      this.inMemoryMode.set(false);
      return pg;
    } catch (err) {
      console.warn(`IndexedDB PGlite fallback a memoria para "${name}":`, err);
      void pg.close().catch(() => {});
      const memPg = new PGlite({
        relaxedDurability: false,
        ...(assets ?? {})
      });
      await this.waitForPgliteReady(memPg, 45000);
      this.inMemoryMode.set(true);
      return memPg;
    }
  }

  private runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async syncProjectsState(): Promise<void> {
    await this.storageService.migrateStorageFormatIfNeeded();
    let projs = await this.storageService.getProjects();
    if (projs.length === 0) {
      const nowIso = new Date().toISOString();
      const defProj: ProjectInfo = {
        id: DEFAULT_PROJECT_ID,
        name: 'Proyecto Principal',
        description: 'Espacio de trabajo local predeterminado (PostgreSQL Wasm)',
        databases: this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === DEFAULT_PROJECT_ID).map(d => d.name),
        schemaVersion: PROJECT_FORMAT_VERSION,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: computeExpiresAt(nowIso)
      };
      await this.storageService.saveProject(defProj);
      projs = [defProj];
    } else {
      const allDbs = this.databases();
      const updatedProjects: ProjectInfo[] = [];
      for (const p of projs) {
        const ownedDbs = allDbs.filter(d => (d.projectId || DEFAULT_PROJECT_ID) === p.id).map(d => d.name);
        const synced = { ...p, databases: Array.from(new Set(ownedDbs)) };
        await this.storageService.saveProject(synced);
        updatedProjects.push(synced);
      }
      projs = updatedProjects;
    }
    this.projects.set(projs);
  }

  private async createBlankDefaultDb(projectId = DEFAULT_PROJECT_ID): Promise<DatabaseInfo> {
    const nowIso = new Date().toISOString();
    const info: DatabaseInfo = {
      name: 'principal',
      projectId,
      tableCount: 0,
      seeded: true,
      isDefault: true,
      createdAt: nowIso,
      expiresAt: computeExpiresAt(nowIso)
    };
    await deletePgliteIdb('principal');
    await this.storageService.saveDatabaseInfo(info);
    return info;
  }

  private startExpirationWatcher(): void {
    const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
    if (proc?.versions?.node) return;
    if (this.expirationTimer !== null) {
      clearInterval(this.expirationTimer);
    }
    this.expirationTimer = setInterval(() => {
      void this.purgeExpiredDatabasesIfNeeded();
    }, 15 * 60 * 1000);
  }

  purgeExpiredDatabasesIfNeeded(): Promise<void> {
    return this.runExclusive(async () => {
      const expiredFromStorage = await this.storageService.purgeExpiredData();
      const expiredInMemory = this.databases()
        .filter(d => d.createdAt && isTimestampExpired(d.createdAt))
        .map(d => d.name);
      const expiredSet = new Set([...expiredFromStorage, ...expiredInMemory]);
      if (expiredSet.size === 0) return;

      const remaining = this.databases().filter(d => !expiredSet.has(d.name));
      const activeExpired = expiredSet.has(this.currentDbName());
      const cycleReset = remaining.length === 0;

      if ((activeExpired || cycleReset) && this.pglite) {
        try {
          await this.pglite.close();
        } catch {}
        this.pglite = null;
      }

      for (const name of expiredSet) {
        await deletePgliteIdb(name);
      }

      if (cycleReset) {
        for (const sample of this.sampleDbsService.getDatabases()) {
          await deletePgliteIdb(sample.id);
        }
        const freshDbs = [await this.createBlankDefaultDb(DEFAULT_PROJECT_ID)];
        this.databases.set(this.sortDatabases(freshDbs));
        await this.syncProjectsState();
        this.currentProjectId.set(DEFAULT_PROJECT_ID);
        this.lastResult.set(null);
        this.historyVersion.update(v => v + 1);
        await this.switchDatabaseUnsafe('principal');
        return;
      }

      this.databases.set(this.sortDatabases(remaining));
      await this.syncProjectsState();
      if (activeExpired && remaining.length > 0) {
        await this.switchDatabaseUnsafe(remaining[0].name);
      }
    });
  }

  getDatabaseRemainingTime(db: DatabaseInfo): string {
    return formatRemainingRetention(db.createdAt);
  }

  /** Borra inmediatamente todos los datos temporales locales y reinicia proyectos y bases de ejemplo. */
  resetAllTemporaryData(): Promise<void> {
    return this.runExclusive(async () => {
      this.isReady.set(false);
      this.state.set('busy');
      this.engineStatus.set('Reiniciando datos temporales locales...');

      if (this.pglite) {
        try {
          await this.pglite.close();
        } catch {}
        this.pglite = null;
      }

      const storedNames = await this.storageService.resetAllTemporaryData();
      const toDelete = new Set<string>([
        ...storedNames,
        ...this.sampleDbsService.getDatabases().map(s => s.id),
        this.currentDbName()
      ]);
      for (const name of toDelete) {
        await deletePgliteIdb(name);
      }

      const freshDbs = [await this.createBlankDefaultDb(DEFAULT_PROJECT_ID)];
      this.databases.set(this.sortDatabases(freshDbs));
      await this.syncProjectsState();
      this.currentProjectId.set(DEFAULT_PROJECT_ID);
      safeLocalStorageSet(LAST_PROJECT_KEY, DEFAULT_PROJECT_ID);
      this.lastResult.set(null);
      this.historyVersion.update(v => v + 1);
      await this.switchDatabaseUnsafe('principal');
    });
  }

  private sortDatabases(list: DatabaseInfo[]): DatabaseInfo[] {
    const order = this.sampleDbsService.getDatabases().map(s => s.id);
    return [...list].sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  isSampleDatabase(name: string): boolean {
    return !!this.sampleDbsService.getDatabaseById(name);
  }

  // ---------------------------------------------------------------------------
  // Gestión de Proyectos Aislados
  // ---------------------------------------------------------------------------

  createProject(name: string, description?: string): Promise<ProjectInfo> {
    return this.runExclusive(async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('El nombre del proyecto no puede estar vacío');

      const nowIso = new Date().toISOString();
      const projId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const baseSlug = SqlEngineService.normalizeDbName(trimmed) || 'proyecto';
      const initialDbName = this.uniqueDbName(`${baseSlug}_db`);

      const project: ProjectInfo = {
        id: projId,
        name: trimmed,
        description: description?.trim() || 'Proyecto SQL aislado',
        databases: [initialDbName],
        activeDb: initialDbName,
        schemaVersion: PROJECT_FORMAT_VERSION,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: computeExpiresAt(nowIso)
      };

      const dbInfo: DatabaseInfo = {
        name: initialDbName,
        projectId: projId,
        tableCount: 0,
        seeded: true,
        createdAt: nowIso,
        expiresAt: computeExpiresAt(nowIso)
      };

      await deletePgliteIdb(initialDbName);
      await this.storageService.saveProject(project);
      await this.storageService.saveDatabaseInfo(dbInfo);

      this.projects.set([...this.projects(), project]);
      this.databases.set(this.sortDatabases([...this.databases(), dbInfo]));
      this.currentProjectId.set(projId);
      safeLocalStorageSet(LAST_PROJECT_KEY, projId);

      await this.switchDatabaseUnsafe(initialDbName);
      return project;
    });
  }

  switchProject(projectId: string): Promise<void> {
    return this.runExclusive(async () => {
      const project = this.projects().find(p => p.id === projectId);
      if (!project) throw new Error(`El proyecto '${projectId}' no existe`);

      this.currentProjectId.set(projectId);
      safeLocalStorageSet(LAST_PROJECT_KEY, projectId);

      const dbsInProj = this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === projectId);
      if (dbsInProj.length === 0) {
        const nowIso = new Date().toISOString();
        const fallbackDbName = this.uniqueDbName(`${SqlEngineService.normalizeDbName(project.name) || 'proj'}_db`);
        const info: DatabaseInfo = {
          name: fallbackDbName,
          projectId,
          tableCount: 0,
          seeded: true,
          createdAt: nowIso,
          expiresAt: computeExpiresAt(nowIso)
        };
        await deletePgliteIdb(fallbackDbName);
        await this.storageService.saveDatabaseInfo(info);
        this.databases.set(this.sortDatabases([...this.databases(), info]));
        await this.updateProjectRecord(projectId, { databases: [fallbackDbName], activeDb: fallbackDbName });
        await this.switchDatabaseUnsafe(fallbackDbName);
        return;
      }

      const targetDb = dbsInProj.find(d => d.name === project.activeDb) || dbsInProj[0];
      await this.switchDatabaseUnsafe(targetDb.name);
    });
  }

  renameProject(projectId: string, newName: string): Promise<boolean> {
    return this.runExclusive(async () => {
      const clean = newName.trim();
      if (!clean) throw new Error('El nombre del proyecto no puede estar vacío');
      const existing = this.projects().find(p => p.id === projectId);
      if (!existing) return false;
      await this.updateProjectRecord(projectId, { name: clean });
      return true;
    });
  }

  duplicateProject(projectId: string, newName?: string): Promise<ProjectInfo | null> {
    return this.runExclusive(async () => {
      const source = this.projects().find(p => p.id === projectId);
      if (!source) return null;

      const sourceDbs = this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === projectId);
      const nowIso = new Date().toISOString();
      const newProjId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const clonedName = newName?.trim() || `${source.name} (Copia)`;

      const clonedDbNames: string[] = [];
      let activeCloneDb: string | undefined;

      for (const srcDb of sourceDbs) {
        const dump = await this.dumpUnsafe(srcDb.name);
        const cloneDbName = this.uniqueDbName(`${srcDb.name}_copia`);
        const cloneInfo: DatabaseInfo = {
          name: cloneDbName,
          projectId: newProjId,
          tableCount: srcDb.tableCount ?? 0,
          seeded: true,
          createdAt: nowIso,
          expiresAt: computeExpiresAt(nowIso)
        };
        await deletePgliteIdb(cloneDbName);
        await this.storageService.saveDatabaseInfo(cloneInfo);
        this.databases.set(this.sortDatabases([...this.databases(), cloneInfo]));
        await this.switchDatabaseUnsafe(cloneDbName);
        if (dump.trim()) {
          await this.pglite!.exec(dump);
          await this.refreshSchemaUnsafe();
        }
        clonedDbNames.push(cloneDbName);
        if (srcDb.name === source.activeDb) {
          activeCloneDb = cloneDbName;
        }
      }

      if (clonedDbNames.length === 0) {
        const emptyDb = this.uniqueDbName(`${SqlEngineService.normalizeDbName(clonedName) || 'copia'}_db`);
        const info: DatabaseInfo = {
          name: emptyDb,
          projectId: newProjId,
          tableCount: 0,
          seeded: true,
          createdAt: nowIso,
          expiresAt: computeExpiresAt(nowIso)
        };
        await deletePgliteIdb(emptyDb);
        await this.storageService.saveDatabaseInfo(info);
        this.databases.set(this.sortDatabases([...this.databases(), info]));
        clonedDbNames.push(emptyDb);
        activeCloneDb = emptyDb;
      }

      const newProject: ProjectInfo = {
        id: newProjId,
        name: clonedName,
        description: source.description,
        databases: clonedDbNames,
        activeDb: activeCloneDb || clonedDbNames[0],
        schemaVersion: PROJECT_FORMAT_VERSION,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: computeExpiresAt(nowIso)
      };

      await this.storageService.saveProject(newProject);
      this.projects.set([...this.projects(), newProject]);
      this.currentProjectId.set(newProjId);
      safeLocalStorageSet(LAST_PROJECT_KEY, newProjId);
      if (this.currentDbName() !== newProject.activeDb) {
        await this.switchDatabaseUnsafe(newProject.activeDb!);
      } else {
        await this.refreshSchemaUnsafe();
      }
      return newProject;
    });
  }

  deleteProject(projectId: string): Promise<boolean> {
    return this.runExclusive(async () => {
      if (this.projects().length <= 1) {
        throw new Error('No puedes eliminar el único proyecto disponible');
      }
      const target = this.projects().find(p => p.id === projectId);
      if (!target) return false;

      // Respaldo automático de la base activa antes de eliminar el proyecto
      if (this.pglite) {
        try {
          await this.backupUnsafe(`Respaldo previo a eliminar proyecto '${target.name}'`);
        } catch {}
      }

      const dbsToRemove = this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === projectId);
      const remainingProjects = this.projects().filter(p => p.id !== projectId);
      const nextProject = remainingProjects[0];

      if (this.currentProjectId() === projectId || dbsToRemove.some(d => d.name === this.currentDbName())) {
        this.currentProjectId.set(nextProject.id);
        safeLocalStorageSet(LAST_PROJECT_KEY, nextProject.id);
        const nextDbs = this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === nextProject.id);
        if (nextDbs.length > 0) {
          await this.switchDatabaseUnsafe(nextDbs[0].name);
        }
      }

      for (const db of dbsToRemove) {
        await this.storageService.removeDatabaseInfo(db.name);
        await deletePgliteIdb(db.name);
      }
      this.databases.set(this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) !== projectId));

      await this.storageService.deleteProjectRecord(projectId);
      this.projects.set(remainingProjects);
      return true;
    });
  }

  exportProjectBundle(projectId?: string): Promise<ProjectExportBundle> {
    return this.runExclusive(async () => {
      const targetId = projectId || this.currentProjectId();
      const project = this.projects().find(p => p.id === targetId);
      if (!project) throw new Error('Proyecto no encontrado');

      const dbs = this.databases().filter(d => (d.projectId || DEFAULT_PROJECT_ID) === targetId);
      const dumpedDbs: ProjectExportBundle['databases'] = [];
      for (const db of dbs) {
        const sqlDump = await this.dumpUnsafe(db.name);
        dumpedDbs.push({ name: db.name, sqlDump, isSample: db.isSample });
      }

      return {
        format: 'sqllab-project',
        schemaVersion: PROJECT_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        project: { ...project },
        databases: dumpedDbs
      };
    });
  }

  importProjectBundle(bundleJson: string): Promise<ProjectInfo> {
    return this.runExclusive(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(bundleJson);
      } catch {
        throw new Error('Archivo de proyecto corrupto: no es un JSON válido.');
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Formato de proyecto inválido.');
      }
      const bundle = parsed as Partial<ProjectExportBundle>;
      if (bundle.format !== 'sqllab-project' || !bundle.project?.name || !Array.isArray(bundle.databases)) {
        throw new Error('El archivo no corresponde a un paquete válido de SQL LAB (format: "sqllab-project").');
      }
      const version = Number(bundle.schemaVersion ?? 1);
      if (!Number.isInteger(version) || version < 1 || version > PROJECT_FORMAT_VERSION) {
        throw new Error(
          `Versión de formato no soportada (${bundle.schemaVersion}). Esta versión de SQL LAB admite hasta la ${PROJECT_FORMAT_VERSION}.`
        );
      }
      for (const item of bundle.databases) {
        if (!item || typeof item.name !== 'string' || !item.name.trim() || typeof item.sqlDump !== 'string') {
          throw new Error('Entrada de base de datos corrupta dentro del paquete de proyecto.');
        }
      }
      await this.storageService.ensureSpaceFor(bundleJson.length * 3);

      const nowIso = new Date().toISOString();
      const newProjId = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const importedDbNames: string[] = [];
      const previousDb = this.currentDbName();

      try {
        for (const item of bundle.databases) {
          const safeName = this.uniqueDbName(item.name);
        const dbInfo: DatabaseInfo = {
          name: safeName,
          projectId: newProjId,
          tableCount: 0,
          seeded: true,
          createdAt: nowIso,
          expiresAt: computeExpiresAt(nowIso)
        };
        await deletePgliteIdb(safeName);
        await this.storageService.saveDatabaseInfo(dbInfo);
        this.databases.set(this.sortDatabases([...this.databases(), dbInfo]));

          importedDbNames.push(safeName);
          await this.switchDatabaseUnsafe(safeName);
          if (item.sqlDump.trim()) {
            try {
              await this.replaceContentsUnsafe(item.sqlDump);
            } catch (err: any) {
              throw new Error(`La base '${item.name}' del paquete no se pudo restaurar: ${err?.message || err}`);
            }
            await this.refreshSchemaUnsafe();
          }
        }
      } catch (err) {
        // Importación atómica: se deshace todo lo creado y se vuelve a la base anterior
        for (const name of importedDbNames) {
          await this.storageService.removeDatabaseInfo(name).catch(() => {});
        }
        this.databases.set(this.databases().filter(d => !importedDbNames.includes(d.name)));
        if (this.databases().some(d => d.name === previousDb)) {
          await this.switchDatabaseUnsafe(previousDb).catch(() => {});
        }
        for (const name of importedDbNames) await deletePgliteIdb(name);
        throw err;
      }

      if (importedDbNames.length === 0) {
        const emptyDb = this.uniqueDbName(`${SqlEngineService.normalizeDbName(bundle.project.name) || 'import'}_db`);
        const info: DatabaseInfo = {
          name: emptyDb,
          projectId: newProjId,
          tableCount: 0,
          seeded: true,
          createdAt: nowIso,
          expiresAt: computeExpiresAt(nowIso)
        };
        await deletePgliteIdb(emptyDb);
        await this.storageService.saveDatabaseInfo(info);
        this.databases.set(this.sortDatabases([...this.databases(), info]));
        importedDbNames.push(emptyDb);
      }

      const importedProject: ProjectInfo = {
        id: newProjId,
        name: `${bundle.project.name} (Importado)`,
        description: bundle.project.description || 'Proyecto importado localmente',
        databases: importedDbNames,
        activeDb: importedDbNames[0],
        schemaVersion: PROJECT_FORMAT_VERSION,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: computeExpiresAt(nowIso)
      };

      await this.storageService.saveProject(importedProject);
      this.projects.set([...this.projects(), importedProject]);
      this.currentProjectId.set(newProjId);
      safeLocalStorageSet(LAST_PROJECT_KEY, newProjId);
      if (this.currentDbName() !== importedDbNames[0]) {
        await this.switchDatabaseUnsafe(importedDbNames[0]);
      } else {
        await this.refreshSchemaUnsafe();
      }
      return importedProject;
    });
  }

  private uniqueDbName(preferred: string): string {
    const clean = SqlEngineService.normalizeDbName(preferred) || 'db';
    const existing = new Set(this.databases().map(d => d.name));
    if (!existing.has(clean)) return clean;
    let i = 2;
    while (existing.has(`${clean.slice(0, 42)}_${i}`)) i++;
    return `${clean.slice(0, 42)}_${i}`;
  }

  private async updateProjectRecord(projectId: string, patch: Partial<ProjectInfo>): Promise<void> {
    const list = this.projects();
    const target = list.find(p => p.id === projectId);
    if (!target) return;
    const updated: ProjectInfo = {
      ...target,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    this.projects.set(list.map(p => (p.id === projectId ? updated : p)));
    await this.storageService.saveProject(updated);
  }

  // ---------------------------------------------------------------------------
  // Conexión
  // ---------------------------------------------------------------------------

  switchDatabase(name: string): Promise<void> {
    return this.runExclusive(() => this.switchDatabaseUnsafe(name));
  }

  private async switchDatabaseUnsafe(name: string): Promise<void> {
    let dbRecord = this.databases().find(d => d.name === name);
    if (!dbRecord) {
      const sample = this.sampleDbsService.getDatabaseById(name);
      if (!sample) {
        throw new Error(`La base de datos '${name}' no existe`);
      }
      const nowIso = new Date().toISOString();
      dbRecord = {
        name: sample.id,
        projectId: this.currentProjectId() || DEFAULT_PROJECT_ID,
        tableCount: 0,
        isSample: true,
        createdAt: nowIso,
        expiresAt: computeExpiresAt(nowIso)
      };
      await deletePgliteIdb(sample.id);
      await this.storageService.saveDatabaseInfo(dbRecord);
      this.databases.set(this.sortDatabases([...this.databases(), dbRecord]));
    }
    const targetProjectId = dbRecord.projectId || DEFAULT_PROJECT_ID;
    if (this.currentProjectId() !== targetProjectId && this.projects().some(p => p.id === targetProjectId)) {
      this.currentProjectId.set(targetProjectId);
      safeLocalStorageSet(LAST_PROJECT_KEY, targetProjectId);
    }

    this.isReady.set(false);
    this.state.set('busy');
    this.engineStatus.set(`Conectando a '${name}'...`);

    if (this.pglite) {
      try {
        await this.pglite.close();
      } catch (e) {
        console.warn('Closing previous PGlite instance:', e);
      }
      this.pglite = null;
    }

    try {
      this.pglite = await this.openInstance(name);
      this.currentDbName.set(name);
      safeLocalStorageSet('sqllab_last_db', name);
      await this.updateProjectRecord(targetProjectId, { activeDb: name });

      await this.seedIfEmpty(name);
      await this.refreshSchemaUnsafe();

      this.isReady.set(true);
      this.state.set('ready');
      this.engineStatus.set(`Conectado a '${name}'`);
    } catch (err: any) {
      console.error(`Failed to switch to database ${name}:`, err);
      this.state.set('error');
      this.engineStatus.set(`Error al conectar con '${name}': ${err?.message || err}`);
      throw err;
    }
  }

  private async seedIfEmpty(name: string): Promise<void> {
    if (!this.pglite) return;
    // Solo se siembra una vez: si el usuario vació la base a propósito, se respeta.
    if (this.databases().find(d => d.name === name)?.seeded) return;

    const res = await this.pglite.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE ${USER_NS_FILTER} AND c.relkind IN ('r', 'p', 'v')`);
    const isEmpty = (res.rows[0]?.count ?? 0) === 0;
    if (!isEmpty) {
      await this.updateDatabaseInfo(name, { seeded: true });
      return;
    }

    const sample = this.sampleDbsService.getDatabaseById(name);
    if (!sample) return;

    this.engineStatus.set(`Cargando datos de ejemplo: ${sample.displayName}...`);
    await this.pglite.exec(sample.sql);
    await this.updateDatabaseInfo(name, { seeded: true });
  }

  /** Restablece una base de datos de ejemplo a su contenido original. */
  resetSampleDatabase(name: string): Promise<void> {
    return this.runExclusive(async () => {
      const sample = this.sampleDbsService.getDatabaseById(name);
      if (!sample) throw new Error(`'${name}' no es una base de datos de ejemplo`);
      if (this.currentDbName() !== name || !this.pglite) {
        await this.switchDatabaseUnsafe(name);
      }
      await this.backupUnsafe(`Respaldo automático previo a restablecer '${name}'`);
      await this.replaceContentsUnsafe(sample.sql);
      await this.refreshSchemaUnsafe();
    });
  }

  // ---------------------------------------------------------------------------
  // Ejecución de consultas
  // ---------------------------------------------------------------------------

  /** Cierra la instancia activa (vacía los cambios pendientes a IndexedDB). Usado al cerrar la pestaña y en pruebas. */
  shutdown(): Promise<void> {
    return this.runExclusive(async () => {
      if (this.pglite) {
        try {
          await this.pglite.close();
        } finally {
          this.pglite = null;
          this.isReady.set(false);
        }
      }
    });
  }

  executeQuery(sql: string, options: ExecuteOptions = {}): Promise<QueryResult> {
    return this.runExclusive(() => this.executeQueryUnsafe(sql, options));
  }

  private async executeQueryUnsafe(sql: string, options: ExecuteOptions): Promise<QueryResult> {
    const { recordHistory = true, publish = true } = options;
    if (!this.pglite) {
      throw new Error('El motor SQL no está inicializado');
    }

    const trimmed = sql.trim();
    if (!trimmed) {
      return { query: sql, success: true, rows: [], columns: [], rowCount: 0, executionTimeMs: 0 };
    }

    const analysed = stripSqlNoise(trimmed);
    const dialectWarnings = analyzeSqlDialect(trimmed);
    this.isExecuting.set(true);

    if (/\b(DROP\s+(TABLE|SCHEMA|VIEW|DATABASE)|TRUNCATE)\b/i.test(analysed)) {
      try {
        await this.backupUnsafe(`Respaldo automático previo a: ${trimmed.replace(/\s+/g, ' ').slice(0, 80)}`);
      } catch (backupErr) {
        console.warn('Automatic backup error:', backupErr);
      }
    }

    const startTime = performance.now();
    let result: QueryResult;
    try {
      // rowMode 'array': conserva columnas con nombres repetidos (p. ej. dos "id" en un JOIN)
      const results = await this.pglite.exec(trimmed, { rowMode: 'array' });
      const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
      result = this.buildResult(sql, results, executionTimeMs, dialectWarnings);
    } catch (err: any) {
      const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
      // La posición de PostgreSQL es relativa al texto enviado (recortado); se ajusta al original
      const leading = sql.length - sql.trimStart().length;
      const pgPosition = Number(err?.position);
      let errText = formatPgError(err);
      if (dialectWarnings.length > 0) {
        const hintLines = dialectWarnings.map(w => `• [${w.dialect}] ${w.construct}: ${w.suggestion}`);
        errText += `\n\nCompatibilidad PostgreSQL detectada:\n${hintLines.join('\n')}`;
      }
      result = {
        query: sql,
        success: false,
        rows: [],
        columns: [],
        rowCount: 0,
        executionTimeMs,
        error: errText,
        errorCode: typeof err?.code === 'string' ? err.code : undefined,
        errorPosition: Number.isFinite(pgPosition) && pgPosition > 0 ? pgPosition + leading : undefined,
        dialectWarnings: dialectWarnings.length > 0 ? dialectWarnings : undefined
      };
    } finally {
      this.isExecuting.set(false);
    }

    // El explorador refleja siempre el estado real del catálogo: cualquier sentencia (incluido un
    // SELECT que invoque una función) puede modificar estructuras o datos.
    await this.refreshSchemaUnsafe();

    if (publish) {
      this.lastResult.set(result);
    }

    if (recordHistory) {
      const historyItem: ExecutionHistoryItem = {
        id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
        query: sql,
        database: this.currentDbName(),
        timestamp: new Date().toISOString(),
        success: result.success,
        executionTimeMs: result.executionTimeMs,
        rowCount: result.rowCount,
        error: result.error
      };
      try {
        await this.storageService.saveHistoryItem(historyItem);
        this.historyVersion.update(v => v + 1);
      } catch (e) {
        console.warn('No se pudo guardar el historial:', e);
      }
    }

    return result;
  }

  private buildResult(
    sql: string,
    results: Results<any>[],
    executionTimeMs: number,
    dialectWarnings?: QueryResult['dialectWarnings']
  ): QueryResult {
    const withColumns = [...results].reverse().find(r => r.fields && r.fields.length > 0);
    const chosen = withColumns ?? results[results.length - 1];
    const affectedRows = results.reduce((acc, r) => acc + (r.affectedRows ?? 0), 0);
    const fields = chosen?.fields ?? [];

    // Clave única por columna: "id", "id_2"... para no perder columnas homónimas
    const used = new Set<string>();
    const columns = fields.map(f => {
      let key = f.name;
      for (let i = 2; used.has(key); i++) key = `${f.name}_${i}`;
      used.add(key);
      return { name: f.name, key, type: mapPgType(f.dataTypeID) };
    });

    const rawRows = (chosen?.rows as unknown[]) ?? [];
    const totalRows = rawRows.length;
    const kept = totalRows > MAX_RESULT_ROWS ? rawRows.slice(0, MAX_RESULT_ROWS) : rawRows;
    const rows: Record<string, any>[] = kept.map(r => {
      if (!Array.isArray(r)) return r as Record<string, any>;
      const obj: Record<string, any> = {};
      columns.forEach((c, i) => (obj[c.key] = r[i]));
      return obj;
    });

    return {
      query: sql,
      success: true,
      rows,
      columns,
      rowCount: rows.length,
      totalRows,
      truncated: totalRows > rows.length,
      affectedRows,
      statementCount: results.length,
      executionTimeMs,
      dialectWarnings: dialectWarnings && dialectWarnings.length > 0 ? dialectWarnings : undefined
    };
  }

  compareInSandbox(userSql: string, referenceSql: string): Promise<{ user: QueryResult; expected: QueryResult }> {
    return this.runExclusive(async () => {
      if (!this.pglite) throw new Error('El motor SQL no está inicializado');
      const run = async (pg: { exec: (q: string) => Promise<Results[]> }, sql: string): Promise<QueryResult> => {
        const t0 = performance.now();
        try {
          const res = await pg.exec(sql);
          return this.buildResult(sql, res, Math.round(performance.now() - t0));
        } catch (err: any) {
          return { query: sql, success: false, rows: [], columns: [], rowCount: 0, executionTimeMs: 0, error: formatPgError(err) };
        }
      };

      let user!: QueryResult;
      let expected!: QueryResult;
      try {
        await this.pglite.transaction(async tx => {
          await tx.exec('SAVEPOINT sqllab_user');
          user = await run(tx, userSql);
          await tx.exec('ROLLBACK TO SAVEPOINT sqllab_user');
          expected = await run(tx, referenceSql);
          await tx.rollback();
        });
      } catch (err: any) {
        if (!user) {
          user = { query: userSql, success: false, rows: [], columns: [], rowCount: 0, executionTimeMs: 0, error: formatPgError(err) };
        }
        if (!expected) {
          expected = { query: referenceSql, success: false, rows: [], columns: [], rowCount: 0, executionTimeMs: 0, error: formatPgError(err) };
        }
      }
      return { user, expected };
    });
  }

  // ---------------------------------------------------------------------------
  // Operaciones DML y Estructura de Esquemas/Tablas (ALTER TABLE reales)
  // ---------------------------------------------------------------------------

  updateCell(table: string, pk: Record<string, unknown>, column: string, value: string | null, schemaName?: string): Promise<number> {
    return this.runExclusive(async () => {
      if (!this.pglite) throw new Error('El motor SQL no está inicializado');
      const pkCols = Object.keys(pk);
      if (pkCols.length === 0) throw new Error('La tabla no tiene clave primaria');
      const resolvedSchema = schemaName || this.resolveTableSchema(table);
      const where = pkCols.map((c, i) => `${quoteIdent(c)} = $${i + 2}`).join(' AND ');
      const sql = `UPDATE ${qualifyTableName(table, resolvedSchema)} SET ${quoteIdent(column)} = $1 WHERE ${where}`;
      const res = await this.pglite.query(sql, [value, ...pkCols.map(c => serializeParam(pk[c]))]);
      await this.refreshSchemaUnsafe();
      return res.affectedRows ?? 0;
    });
  }

  insertRow(table: string, values: Record<string, unknown>, schemaName?: string): Promise<QueryResult> {
    return this.runExclusive(async () => {
      if (!this.pglite) throw new Error('El motor SQL no está inicializado');
      const resolvedSchema = schemaName || this.resolveTableSchema(table);
      const entries = Object.entries(values);
      const qual = qualifyTableName(table, resolvedSchema);
      const t0 = performance.now();
      if (entries.length === 0) {
        const res = await this.pglite.query<Record<string, any>>(`INSERT INTO ${qual} DEFAULT VALUES RETURNING *`);
        await this.refreshSchemaUnsafe();
        return this.buildResult(`INSERT INTO ${qual} DEFAULT VALUES`, [res], Math.round(performance.now() - t0));
      }
      const cols = entries.map(([col]) => quoteIdent(col)).join(', ');
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
      const params = entries.map(([, val]) => serializeParam(val));
      const sql = `INSERT INTO ${qual} (${cols}) VALUES (${placeholders}) RETURNING *`;
      const res = await this.pglite.query<Record<string, any>>(sql, params);
      await this.refreshSchemaUnsafe();
      return this.buildResult(sql, [res], Math.round(performance.now() - t0));
    });
  }

  deleteRow(table: string, pk: Record<string, unknown>, schemaName?: string): Promise<number> {
    return this.runExclusive(async () => {
      if (!this.pglite) throw new Error('El motor SQL no está inicializado');
      const pkCols = Object.keys(pk);
      if (pkCols.length === 0) throw new Error('La tabla no tiene clave primaria');
      const resolvedSchema = schemaName || this.resolveTableSchema(table);
      const where = pkCols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(' AND ');
      const res = await this.pglite.query(
        `DELETE FROM ${qualifyTableName(table, resolvedSchema)} WHERE ${where}`,
        pkCols.map(c => serializeParam(pk[c]))
      );
      await this.refreshSchemaUnsafe();
      return res.affectedRows ?? 0;
    });
  }

  createSchema(schemaName: string): Promise<QueryResult> {
    const clean = SqlEngineService.normalizeDbName(schemaName);
    if (!clean) return Promise.reject(new Error('Nombre de esquema inválido'));
    return this.executeQuery(`CREATE SCHEMA ${quoteIdent(clean)};`);
  }

  dropSchema(schemaName: string, cascade = false): Promise<QueryResult> {
    if (schemaName === 'public') {
      return Promise.reject(new Error('No se recomienda eliminar el esquema public desde aquí'));
    }
    return this.executeQuery(`DROP SCHEMA ${quoteIdent(schemaName)}${cascade ? ' CASCADE' : ''};`);
  }

  addColumn(
    tableName: string,
    columnName: string,
    dataType: string,
    nullable = true,
    defaultValue?: string,
    schemaName = 'public'
  ): Promise<QueryResult> {
    const cleanCol = SqlEngineService.normalizeDbName(columnName);
    if (!cleanCol) return Promise.reject(new Error('Nombre de columna inválido'));
    const qual = qualifyTableName(tableName, schemaName);
    let def = `ALTER TABLE ${qual} ADD COLUMN ${quoteIdent(cleanCol)} ${dataType}`;
    if (defaultValue && defaultValue.trim()) {
      def += ` DEFAULT ${defaultValue.trim()}`;
    }
    if (!nullable) {
      def += ' NOT NULL';
    }
    return this.executeQuery(`${def};`);
  }

  renameColumn(tableName: string, oldName: string, newName: string, schemaName = 'public'): Promise<QueryResult> {
    const cleanNew = SqlEngineService.normalizeDbName(newName);
    if (!cleanNew) return Promise.reject(new Error('Nuevo nombre de columna inválido'));
    const qual = qualifyTableName(tableName, schemaName);
    return this.executeQuery(`ALTER TABLE ${qual} RENAME COLUMN ${quoteIdent(oldName)} TO ${quoteIdent(cleanNew)};`);
  }

  dropColumn(tableName: string, columnName: string, cascade = false, schemaName = 'public'): Promise<QueryResult> {
    const qual = qualifyTableName(tableName, schemaName);
    return this.executeQuery(
      `ALTER TABLE ${qual} DROP COLUMN ${quoteIdent(columnName)}${cascade ? ' CASCADE' : ''};`
    );
  }

  renameTable(oldName: string, newName: string, schemaName = 'public'): Promise<QueryResult> {
    const cleanNew = SqlEngineService.normalizeDbName(newName);
    if (!cleanNew) return Promise.reject(new Error('Nuevo nombre de tabla inválido'));
    const qual = qualifyTableName(oldName, schemaName);
    return this.executeQuery(`ALTER TABLE ${qual} RENAME TO ${quoteIdent(cleanNew)};`);
  }

  private resolveTableSchema(table: string): string {
    if (table.includes('.')) {
      return table.split('.', 2)[0];
    }
    const found = this.currentSchema().tables.find(t => t.name === table);
    return found?.schema || 'public';
  }

  // ---------------------------------------------------------------------------
  // Introspección del esquema multi-esquema
  // ---------------------------------------------------------------------------

  refreshSchema(): Promise<void> {
    return this.runExclusive(() => this.refreshSchemaUnsafe());
  }

  private async refreshSchemaUnsafe(): Promise<void> {
    const pg = this.pglite;
    if (!pg) return;

    try {
      const schemasRes = await pg.query<{ name: string }>(`
        SELECT n.nspname AS name
        FROM pg_namespace n
        WHERE ${USER_NS_FILTER}
        ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END, n.nspname`);
      const schemas = schemasRes.rows.map(r => r.name);

      const tablesRes = await pg.query<{ schema: string; name: string }>(`
        SELECT n.nspname AS schema, c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE ${USER_NS_FILTER} AND c.relkind IN ('r', 'p')
        ORDER BY CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END, n.nspname, c.relname`);

      const colsRes = await pg.query<{
        schema: string; table_name: string; column_name: string; data_type: string; nullable: boolean; default_value: string | null;
      }>(`
        SELECT n.nspname AS schema, c.relname AS table_name, a.attname AS column_name,
               format_type(a.atttypid, a.atttypmod) AS data_type,
               NOT a.attnotnull AS nullable,
               pg_get_expr(d.adbin, d.adrelid) AS default_value
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE ${USER_NS_FILTER} AND c.relkind IN ('r', 'p')
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY n.nspname, c.relname, a.attnum`);

      const pkRes = await pg.query<{ schema: string; table_name: string; column_name: string }>(`
        SELECT n.nspname AS schema, c.relname AS table_name, a.attname AS column_name
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
        WHERE i.indisprimary AND ${USER_NS_FILTER}
        ORDER BY n.nspname, c.relname, array_position(i.indkey::int2[], a.attnum)`);

      const fkRes = await pg.query<{
        schema: string; constraint_name: string; source_table: string; source_column: string; target_table: string; target_column: string;
      }>(`
        SELECT n.nspname AS schema, con.conname AS constraint_name, src.relname AS source_table, sa.attname AS source_column,
               tgt.relname AS target_table, ta.attname AS target_column
        FROM pg_constraint con
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(src_att, tgt_att)
        JOIN pg_class src ON src.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = src.relnamespace
        JOIN pg_class tgt ON tgt.oid = con.confrelid
        JOIN pg_attribute sa ON sa.attrelid = con.conrelid AND sa.attnum = k.src_att
        JOIN pg_attribute ta ON ta.attrelid = con.confrelid AND ta.attnum = k.tgt_att
        WHERE con.contype = 'f' AND ${USER_NS_FILTER}
        ORDER BY n.nspname, src.relname, con.conname`);

      const idxRes = await pg.query<{ schema: string; table_name: string; index_name: string; is_unique: boolean; columns: string }>(`
        SELECT n.nspname AS schema, t.relname AS table_name, ic.relname AS index_name, i.indisunique AS is_unique,
               coalesce(string_agg(a.attname, ',' ORDER BY array_position(i.indkey::int2[], a.attnum)), '') AS columns
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_class ic ON ic.oid = i.indexrelid
        LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey) AND a.attnum > 0
        WHERE ${USER_NS_FILTER}
        GROUP BY n.nspname, t.relname, ic.relname, i.indisunique
        ORDER BY n.nspname, t.relname, ic.relname`);

      const conRes = await pg.query<{
        schema: string; table_name: string; conname: string; contype: string; columns: string; def: string;
      }>(`
        SELECT n.nspname AS schema, c.relname AS table_name, con.conname, con.contype::text AS contype,
               coalesce((
                 SELECT string_agg(a.attname, ',' ORDER BY u.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
               ), '') AS columns,
               pg_get_constraintdef(con.oid, true) AS def
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE ${USER_NS_FILTER} AND con.contype IN ('p', 'f', 'u', 'c')
        ORDER BY n.nspname, c.relname, con.contype, con.conname`);

      const tableEntries = tablesRes.rows;
      const counts = new Map<string, number>();
      if (tableEntries.length > 0) {
        const countSql = tableEntries
          .map(t => `SELECT ${quoteLiteralSql(`${t.schema}.${t.name}`)} AS t, count(*)::int AS c FROM ${qualifyTableName(t.name, t.schema)}`)
          .join(' UNION ALL ');
        try {
          const countRes = await pg.query<{ t: string; c: number }>(countSql);
          for (const r of countRes.rows) counts.set(r.t, Number(r.c));
        } catch {
          // Si alguna tabla no es legible, se omiten los conteos
        }
      }

      const tables: TableSchema[] = tableEntries.map(t => {
        const key = `${t.schema}.${t.name}`;
        const primaryKeys = pkRes.rows.filter(r => r.schema === t.schema && r.table_name === t.name).map(r => r.column_name);
        const foreignKeys: ForeignKeyRelation[] = fkRes.rows
          .filter(r => r.schema === t.schema && r.source_table === t.name)
          .map(r => ({
            constraintName: r.constraint_name,
            sourceTable: t.name,
            sourceColumn: r.source_column,
            targetTable: r.target_table,
            targetColumn: r.target_column
          }));
        const indexes: IndexSchema[] = idxRes.rows
          .filter(i => i.schema === t.schema && i.table_name === t.name)
          .map(i => ({
            name: i.index_name,
            tableName: t.name,
            isUnique: i.is_unique,
            columnNames: i.columns ? i.columns.split(',') : []
          }));

        const singleColUnique = new Set<string>(
          indexes.filter(i => i.isUnique && i.columnNames.length === 1).map(i => i.columnNames[0])
        );

        const constraints: ConstraintSchema[] = conRes.rows
          .filter(c => c.schema === t.schema && c.table_name === t.name)
          .map(c => ({
            name: c.conname,
            type:
              c.contype === 'p'
                ? 'PRIMARY KEY'
                : c.contype === 'f'
                ? 'FOREIGN KEY'
                : c.contype === 'u'
                ? 'UNIQUE'
                : 'CHECK',
            columns: c.columns ? c.columns.split(',') : [],
            definition: c.def
          }));

        const columns: ColumnSchema[] = colsRes.rows
          .filter(c => c.schema === t.schema && c.table_name === t.name)
          .map(col => {
            const fk = foreignKeys.find(f => f.sourceColumn === col.column_name);
            const isPk = primaryKeys.includes(col.column_name);
            return {
              name: col.column_name,
              type: prettifyType(col.data_type),
              nullable: col.nullable,
              defaultValue: col.default_value,
              isPrimaryKey: isPk,
              isForeignKey: !!fk,
              isUnique: isPk || singleColUnique.has(col.column_name),
              schema: t.schema,
              foreignKeyRef: fk ? { table: fk.targetTable, column: fk.targetColumn } : undefined
            };
          });

        return {
          schema: t.schema,
          name: t.name,
          rowCount: counts.get(key) ?? 0,
          columns,
          primaryKeys,
          foreignKeys,
          indexes,
          constraints
        };
      });

      const viewsRes = await pg.query<{ schema: string; name: string; definition: string }>(`
        SELECT n.nspname AS schema, c.relname AS name, pg_get_viewdef(c.oid, true) AS definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE ${USER_NS_FILTER} AND c.relkind IN ('v', 'm')
        ORDER BY n.nspname, c.relname`);

      const funcRes = await pg.query<{ schema: string; name: string; return_type: string; args: string }>(`
        SELECT n.nspname AS schema, p.proname AS name,
               CASE WHEN p.prokind = 'p' THEN 'procedure' ELSE pg_get_function_result(p.oid) END AS return_type,
               pg_get_function_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE ${USER_NS_FILTER} AND p.prokind IN ('f', 'p')
        ORDER BY n.nspname, p.proname`);

      const trigRes = await pg.query<{ schema: string; name: string; table_name: string; timing: string; events: string }>(`
        SELECT trigger_schema AS schema, trigger_name AS name, event_object_table AS table_name, action_timing AS timing,
               string_agg(event_manipulation, ' OR ' ORDER BY event_manipulation) AS events
        FROM information_schema.triggers
        WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND trigger_schema NOT LIKE 'pg_temp_%'
        GROUP BY trigger_schema, trigger_name, event_object_table, action_timing
        ORDER BY trigger_schema, trigger_name`);

      let sequences: SequenceSchema[] = [];
      try {
        const seqRes = await pg.query<{
          schema: string; name: string; data_type: string; start_value: string; increment_by: string; last_value: string | null;
        }>(`
          SELECT schemaname AS schema, sequencename AS name, data_type::text AS data_type,
                 start_value::text AS start_value, increment_by::text AS increment_by, last_value::text AS last_value
          FROM pg_sequences
          WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            AND schemaname NOT LIKE 'pg_temp_%'
          ORDER BY schemaname, sequencename`);
        sequences = seqRes.rows.map(s => ({
          schema: s.schema,
          name: s.name,
          dataType: prettifyType(s.data_type),
          startValue: s.start_value,
          incrementBy: s.increment_by,
          lastValue: s.last_value
        }));
      } catch {
        // Opcional si pg_sequences no está disponible
      }

      this.currentSchema.set({
        schemas: schemas.length ? schemas : ['public'],
        tables,
        views: viewsRes.rows.map(v => ({ schema: v.schema, name: v.name, definition: v.definition })),
        functions: funcRes.rows.map(f => ({ schema: f.schema, name: f.name, returnType: f.return_type ?? '', argTypes: f.args ?? '' })),
        triggers: trigRes.rows.map(t => ({
          schema: t.schema,
          name: t.name,
          tableName: t.table_name,
          actionTiming: t.timing,
          event: t.events
        })),
        sequences
      });

      await this.updateDatabaseInfo(this.currentDbName(), { tableCount: tables.length, updatedAt: new Date().toISOString() });
    } catch (err) {
      console.error('Error refreshing schema:', err);
    }
  }

  private async updateDatabaseInfo(name: string, patch: Partial<DatabaseInfo>): Promise<void> {
    const list = this.databases();
    const current = list.find(d => d.name === name);
    if (!current) return;
    const updated = { ...current, ...patch };
    this.databases.set(list.map(d => (d.name === name ? updated : d)));
    try {
      await this.storageService.saveDatabaseInfo(updated);
    } catch (e) {
      console.warn('No se pudo guardar la información de la base de datos:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Gestión de bases de datos
  // ---------------------------------------------------------------------------

  static normalizeDbName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  }

  createDatabase(name: string, initSql?: string): Promise<string> {
    return this.runExclusive(async () => {
      const cleanName = SqlEngineService.normalizeDbName(name);
      if (!cleanName) throw new Error('Nombre de base de datos inválido');
      if (/^[0-9]/.test(cleanName)) throw new Error('El nombre no puede comenzar con un número');

      const existing = this.databases().find(d => d.name === cleanName);
      if (existing) {
        if ((existing.projectId || DEFAULT_PROJECT_ID) === this.currentProjectId()) {
          throw new Error(`La base de datos '${cleanName}' ya existe en este proyecto`);
        }
        throw new Error(`Ya existe una base de datos llamada '${cleanName}' en otro proyecto (usa otro nombre, por ejemplo '${cleanName}_p2')`);
      }

      const targetProjectId = this.currentProjectId() || DEFAULT_PROJECT_ID;
      const newDb: DatabaseInfo = {
        name: cleanName,
        projectId: targetProjectId,
        tableCount: 0,
        seeded: true,
        createdAt: new Date().toISOString()
      };
      await deletePgliteIdb(cleanName);
      await this.storageService.saveDatabaseInfo(newDb);
      this.databases.set(this.sortDatabases([...this.databases(), newDb]));

      const proj = this.projects().find(p => p.id === targetProjectId);
      if (proj) {
        await this.updateProjectRecord(targetProjectId, {
          databases: Array.from(new Set([...proj.databases, cleanName])),
          activeDb: cleanName
        });
      }

      await this.switchDatabaseUnsafe(cleanName);
      if (initSql && this.pglite) {
        try {
          await this.pglite.exec(initSql);
        } finally {
          await this.refreshSchemaUnsafe();
        }
      }
      return cleanName;
    });
  }

  dropDatabase(name: string): Promise<void> {
    return this.runExclusive(async () => {
      const targetDb = this.databases().find(d => d.name === name);
      if (!targetDb) return;
      const projId = targetDb.projectId || DEFAULT_PROJECT_ID;
      const projectSiblingDbs = this.databases().filter(
        d => (d.projectId || DEFAULT_PROJECT_ID) === projId && d.name !== name
      );

      if (projectSiblingDbs.length === 0) {
        throw new Error('No puedes eliminar la única base de datos del proyecto activo');
      }

      // Respaldo de seguridad previo a operación destructiva
      if (name === this.currentDbName() && this.pglite) {
        try {
          await this.backupUnsafe(`Respaldo automático previo a eliminar base '${name}'`);
        } catch {}
        await this.switchDatabaseUnsafe(projectSiblingDbs[0].name);
      }

      await this.storageService.removeDatabaseInfo(name);
      this.databases.set(this.databases().filter(d => d.name !== name));
      await deletePgliteIdb(name);

      const proj = this.projects().find(p => p.id === projId);
      if (proj) {
        await this.updateProjectRecord(projId, {
          databases: proj.databases.filter(n => n !== name),
          activeDb: proj.activeDb === name ? projectSiblingDbs[0].name : proj.activeDb
        });
      }
    });
  }

  duplicateDatabase(sourceName: string, newName?: string): Promise<string> {
    return this.runExclusive(async () => {
      const sourceDb = this.databases().find(d => d.name === sourceName);
      const dump = await this.dumpUnsafe(sourceName);
      let target = SqlEngineService.normalizeDbName(newName || `${sourceName}_copia`);
      let i = 2;
      while (this.databases().some(d => d.name === target)) {
        target = SqlEngineService.normalizeDbName(`${newName || sourceName + '_copia'}_${i++}`);
      }
      const targetProjectId = sourceDb?.projectId || this.currentProjectId() || DEFAULT_PROJECT_ID;
      const newDb: DatabaseInfo = {
        name: target,
        projectId: targetProjectId,
        tableCount: 0,
        seeded: true,
        createdAt: new Date().toISOString()
      };
      await deletePgliteIdb(target);
      await this.storageService.saveDatabaseInfo(newDb);
      this.databases.set(this.sortDatabases([...this.databases(), newDb]));

      const proj = this.projects().find(p => p.id === targetProjectId);
      if (proj) {
        await this.updateProjectRecord(targetProjectId, {
          databases: Array.from(new Set([...proj.databases, target])),
          activeDb: target
        });
      }

      await this.switchDatabaseUnsafe(target);
      await this.pglite!.exec(dump);
      await this.refreshSchemaUnsafe();
      return target;
    });
  }

  // ---------------------------------------------------------------------------
  // Volcados y respaldos
  // ---------------------------------------------------------------------------

  generateDump(dbName?: string): Promise<string> {
    return this.runExclusive(() => this.dumpUnsafe(dbName));
  }

  /** @deprecated Usa generateDump(). Se mantiene por compatibilidad. */
  generateQuickDump(dbName?: string): Promise<string> {
    return this.generateDump(dbName);
  }

  private async dumpUnsafe(dbName?: string): Promise<string> {
    const target = dbName || this.currentDbName();
    if (target === this.currentDbName() && this.pglite) {
      return dumpPublicSchema(this.pglite, target);
    }
    const temp = await this.openInstance(target);
    try {
      return await dumpPublicSchema(temp, target);
    } finally {
      await temp.close();
    }
  }

  private async backupUnsafe(reason: string): Promise<void> {
    if (!this.pglite) return;
    const dump = await dumpPublicSchema(this.pglite, this.currentDbName());
    const backup: BackupItem = {
      id: 'backup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      database: this.currentDbName(),
      timestamp: new Date().toISOString(),
      reason,
      sqlDump: dump
    };
    await this.storageService.saveBackup(backup);
    await this.storageService.pruneBackups(this.currentDbName(), MAX_BACKUPS_PER_DB);
  }

  createBackup(reason = 'Respaldo manual'): Promise<void> {
    return this.runExclusive(() => this.backupUnsafe(reason));
  }

  restoreDump(dbName: string, dump: string): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.databases().some(d => d.name === dbName)) {
        const info: DatabaseInfo = {
          name: dbName,
          projectId: this.currentProjectId() || DEFAULT_PROJECT_ID,
          tableCount: 0,
          seeded: true,
          createdAt: new Date().toISOString()
        };
        await this.storageService.saveDatabaseInfo(info);
        this.databases.set(this.sortDatabases([...this.databases(), info]));
      }
      if (this.currentDbName() !== dbName || !this.pglite) {
        await this.switchDatabaseUnsafe(dbName);
      }
      await this.backupUnsafe(`Respaldo automático previo a restaurar '${dbName}'`);
      await this.replaceContentsUnsafe(dump);
      await this.updateDatabaseInfo(dbName, { seeded: true });
      await this.refreshSchemaUnsafe();
    });
  }

  /**
   * Sustituye todo el contenido de la base activa por `sql` en una única transacción:
   * elimina todos los esquemas de usuario, recrea `public` y ejecuta el script.
   * Si algo falla se hace ROLLBACK y la base queda exactamente como estaba.
   */
  private async replaceContentsUnsafe(sql: string): Promise<void> {
    const pg = this.pglite!;
    const schemas = await pg.query<{ name: string }>(`
      SELECT n.nspname AS name FROM pg_namespace n WHERE ${USER_NS_FILTER}`);
    const drops = schemas.rows.map(s => `DROP SCHEMA ${quoteIdent(s.name)} CASCADE;`).join('\n');
    try {
      await pg.exec(`BEGIN;\n${drops}\nCREATE SCHEMA public;\n${sql}\n;COMMIT;`);
    } catch (err) {
      try {
        await pg.exec('ROLLBACK;');
      } catch {
        // No había transacción abierta
      }
      throw err;
    }
  }
}

// -----------------------------------------------------------------------------
// Utilidades internas
// -----------------------------------------------------------------------------

function mapPgType(typeId?: number): string {
  switch (typeId) {
    case 20: return 'BIGINT';
    case 21: return 'SMALLINT';
    case 23: return 'INTEGER';
    case 26: return 'OID';
    case 1700: return 'NUMERIC';
    case 700: return 'REAL';
    case 701: return 'DOUBLE';
    case 16: return 'BOOLEAN';
    case 1082: return 'DATE';
    case 1083: return 'TIME';
    case 1114: return 'TIMESTAMP';
    case 1184: return 'TIMESTAMPTZ';
    case 1186: return 'INTERVAL';
    case 25: return 'TEXT';
    case 1042: return 'CHAR';
    case 1043: return 'VARCHAR';
    case 19: return 'NAME';
    case 114: return 'JSON';
    case 3802: return 'JSONB';
    case 2950: return 'UUID';
    case 17: return 'BYTEA';
    case 1007: case 1016: case 1009: case 1015: return 'ARRAY';
    default: return 'TEXT';
  }
}

function prettifyType(t: string): string {
  return t
    .replace(/character varying/g, 'varchar')
    .replace(/timestamp without time zone/g, 'timestamp')
    .replace(/timestamp with time zone/g, 'timestamptz')
    .replace(/time without time zone/g, 'time')
    .replace(/double precision/g, 'double')
    .replace(/^character\(/, 'char(')
    .toUpperCase();
}

function quoteLiteralSql(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function serializeParam(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v.toString();
  if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v;
}

function formatPgError(err: any): string {
  if (!err) return 'Error desconocido';
  const parts: string[] = [err.message || String(err)];
  if (err.detail) parts.push(`DETALLE: ${err.detail}`);
  if (err.hint) parts.push(`SUGERENCIA: ${err.hint}`);
  if (err.where && !String(err.where).startsWith('SQL statement')) parts.push(`CONTEXTO: ${err.where}`);
  if (err.position) parts.push(`(posición ${err.position})`);
  return parts.join('\n');
}

async function deletePgliteIdb(name: string): Promise<void> {
  const candidates = [`/pglite/sqllab_db_${name}`, `sqllab_db_${name}`];
  await Promise.all(
    candidates.map(
      dbName =>
        new Promise<void>(resolve => {
          try {
            const req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          } catch {
            resolve();
          }
        })
    )
  );
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Almacenamiento no disponible (modo privado, etc.)
  }
}
