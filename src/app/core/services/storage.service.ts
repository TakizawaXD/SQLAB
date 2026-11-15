import { Injectable, signal } from '@angular/core';
import {
  DatabaseInfo,
  ProjectInfo,
  ExecutionHistoryItem,
  EditorTab,
  StorageStats,
  BackupItem,
  PROJECT_FORMAT_VERSION,
  DATA_RETENTION_DAYS
} from '../models/database.models';

export { PROJECT_FORMAT_VERSION, DATA_RETENTION_DAYS };

const MAX_HISTORY_ITEMS = 500;
export const DEFAULT_PROJECT_ID = 'proj_default';
export const DATA_RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const WORKSPACE_CREATED_AT_KEY = 'sqllab_workspace_created_at';

export function isTimestampExpired(ts: string | number | undefined | null, nowMs = Date.now()): boolean {
  if (ts === undefined || ts === null || ts === '') return false;
  const ms = typeof ts === 'number' ? ts : Date.parse(ts);
  if (Number.isNaN(ms)) return false;
  return nowMs - ms > DATA_RETENTION_MS;
}


/** Fecha de caducidad (ISO) de un elemento creado en `createdAtIso`. */
export function computeExpiresAt(createdAtIso?: string): string {
  const base = createdAtIso && !Number.isNaN(Date.parse(createdAtIso)) ? Date.parse(createdAtIso) : Date.now();
  return new Date(base + DATA_RETENTION_MS).toISOString();
}

/** Texto legible con el tiempo de retención restante ("6d 3h restantes"). */
export function formatRemainingRetention(createdAtIso?: string | null, nowMs = Date.now()): string {
  const parsed = createdAtIso ? Date.parse(createdAtIso) : NaN;
  if (Number.isNaN(parsed)) return `${DATA_RETENTION_DAYS}d restantes`;
  const remaining = parsed + DATA_RETENTION_MS - nowMs;
  if (remaining <= 0) return 'Expirado';
  const totalHours = Math.ceil(remaining / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h restantes` : `${Math.max(1, hours)}h restantes`;
}
/** Versión del esquema de la base IndexedDB de metadatos (incrementar al añadir almacenes). */
const META_DB_VERSION = 3;

/** Error de almacenamiento local con indicación explícita de cuota agotada. */
export class StorageError extends Error {
  constructor(message: string, readonly quotaExceeded = false) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Metadatos persistentes de SQL LAB en IndexedDB (`sqllab_system_meta`):
 * proyectos, bases de datos, historial, pestañas, respaldos y configuración.
 *
 * El contenido real de cada base de datos NO vive aquí: cada base es una instancia
 * PGlite con su propio almacenamiento IndexedDB (`idb://sqllab_db_<nombre>`), que guarda
 * el directorio de datos completo de PostgreSQL. Política de retención: los elementos con más de
 * DATA_RETENTION_DAYS días se eliminan automáticamente al iniciar (ver purgeExpiredData).
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly dbName = 'sqllab_system_meta';
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  /** Respaldo en memoria cuando IndexedDB no está disponible (p. ej. modo privado estricto). */
  private readonly memoryStores = new Map<string, Map<string, any>>();

  readonly storageStats = signal<StorageStats>({
    usedBytes: 0,
    quotaBytes: 0,
    usedPercentage: 0,
    formattedUsed: '—',
    formattedQuota: '—'
  });

  /** true si el navegador concedió almacenamiento persistente (no se borra bajo presión de espacio). */
  readonly isPersisted = signal<boolean>(false);
  /** true si IndexedDB está disponible; false = los metadatos solo viven en memoria. */
  readonly isAvailable = signal<boolean>(false);
  readonly storageVersion = signal<number>(PROJECT_FORMAT_VERSION);
  readonly lastStorageError = signal<string | null>(null);
  /** Inicio del ciclo de retención del espacio de trabajo local. */
  readonly workspaceCreatedAt = signal<string>(new Date().toISOString());

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.open();
        await this.migrateStorageFormatIfNeeded();
        try {
          if (typeof localStorage !== 'undefined') {
            if (!localStorage.getItem(WORKSPACE_CREATED_AT_KEY)) {
              localStorage.setItem(WORKSPACE_CREATED_AT_KEY, new Date().toISOString());
            }
            this.workspaceCreatedAt.set(localStorage.getItem(WORKSPACE_CREATED_AT_KEY)!);
          }
        } catch {}
        await this.purgeExpiredData();
      })().catch(err => {
        this.initPromise = null;
        throw err;
      });
    }
    return this.initPromise;
  }

  private open(): Promise<void> {
    return new Promise(resolve => {
      if (typeof indexedDB === 'undefined') {
        this.lastStorageError.set('IndexedDB no está disponible en este navegador: los datos no se conservarán al recargar.');
        resolve();
        return;
      }
      try {
        const request = indexedDB.open(this.dbName, META_DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          const ensure = (name: string, keyPath: string) =>
            db.objectStoreNames.contains(name) ? request.transaction!.objectStore(name) : db.createObjectStore(name, { keyPath });
          ensure('projects', 'id');
          ensure('databases', 'name');
          const history = ensure('history', 'id');
          if (!history.indexNames.contains('timestamp')) history.createIndex('timestamp', 'timestamp', { unique: false });
          if (!history.indexNames.contains('database')) history.createIndex('database', 'database', { unique: false });
          ensure('tabs', 'id');
          ensure('backups', 'id');
          ensure('settings', 'key');
          // v3: historial de intentos de desafíos y progreso de la academia
          ensure('attempts', 'id');
        };

        request.onsuccess = () => {
          this.db = request.result;
          this.isAvailable.set(true);
          this.lastStorageError.set(null);
          // Otra pestaña actualizó el esquema: cerrar para no bloquearla
          this.db.onversionchange = () => {
            this.db?.close();
            this.db = null;
            this.isAvailable.set(false);
            this.lastStorageError.set('SQL LAB se actualizó en otra pestaña. Recarga esta pestaña para seguir guardando cambios.');
          };
          void this.requestPersistence();
          void this.updateStorageStats();
          resolve();
        };

        request.onerror = () => {
          const msg = 'IndexedDB no disponible: ' + (request.error?.message || 'error desconocido') + '. Los cambios no se conservarán al recargar.';
          this.lastStorageError.set(msg);
          console.warn(msg);
          resolve();
        };

        request.onblocked = () => {
          this.lastStorageError.set('Otra pestaña de SQL LAB con una versión anterior está bloqueando la actualización del almacenamiento. Ciérrala y recarga.');
        };
      } catch (err: any) {
        this.lastStorageError.set(err?.message || 'Error abriendo IndexedDB.');
        resolve();
      }
    });
  }

  private async requestPersistence(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
        let persisted = await navigator.storage.persisted();
        if (!persisted && navigator.storage.persist) {
          persisted = await navigator.storage.persist();
        }
        this.isPersisted.set(persisted);
      }
    } catch {
      // API no soportada
    }
  }

  /**
   * Migra los metadatos al formato actual. Es idempotente:
   *  - v1 → v2: las bases sin proyecto pasan al proyecto predeterminado.
   *  - Se eliminan los campos de caducidad (`expiresAt`) de versiones previas: los datos no caducan.
   */
  async migrateStorageFormatIfNeeded(): Promise<void> {
    const savedVersion = await this.getSetting<number>('storage_format_version', 1);
    const existingProjects = await this.getAllFromStore<ProjectInfo & { expiresAt?: string }>('projects');
    const existingDbs = await this.getAllFromStore<DatabaseInfo & { expiresAt?: string }>('databases');

    const nowIso = new Date().toISOString();
    let defaultProject: ProjectInfo | null =
      existingProjects.find(p => p.id === DEFAULT_PROJECT_ID) ?? null;

    const orphanDbs = existingDbs.filter(d => !d.projectId || !existingProjects.some(p => p.id === d.projectId));
    if (!defaultProject && (orphanDbs.length > 0 || existingProjects.length === 0)) {
      defaultProject = {
        id: DEFAULT_PROJECT_ID,
        name: 'Proyecto Principal',
        description: 'Bases de datos de ejemplo y espacio de trabajo predeterminado',
        databases: [],
        schemaVersion: PROJECT_FORMAT_VERSION,
        createdAt: nowIso,
        updatedAt: nowIso
      };
    }

    for (const db of existingDbs) {
      const needsProject = !db.projectId || !existingProjects.some(p => p.id === db.projectId);
      if (needsProject || 'expiresAt' in db) {
        const { expiresAt: _drop, ...rest } = db;
        const migrated: DatabaseInfo = { ...rest, projectId: needsProject ? DEFAULT_PROJECT_ID : db.projectId };
        await this.putInStore('databases', migrated);
      }
    }

    const allDbs = await this.getAllFromStore<DatabaseInfo>('databases');
    const projects = defaultProject && !existingProjects.some(p => p.id === defaultProject!.id)
      ? [...existingProjects, defaultProject]
      : existingProjects;
    for (const p of projects) {
      const { expiresAt: _drop, ...rest } = p as ProjectInfo & { expiresAt?: string };
      const owned = allDbs.filter(d => d.projectId === p.id).map(d => d.name);
      await this.putInStore('projects', {
        ...rest,
        databases: Array.from(new Set(owned)),
        schemaVersion: PROJECT_FORMAT_VERSION
      });
    }

    if (savedVersion < PROJECT_FORMAT_VERSION) {
      await this.setSetting('storage_format_version', PROJECT_FORMAT_VERSION);
    }
    this.storageVersion.set(PROJECT_FORMAT_VERSION);
  }

  async updateStorageStats(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;
        const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

        this.storageStats.set({
          usedBytes: used,
          quotaBytes: quota,
          usedPercentage: Math.round(pct * 10) / 10,
          formattedUsed: formatBytes(used),
          formattedQuota: quota > 0 ? formatBytes(quota) : '—'
        });

        if (quota > 0 && pct >= 90) {
          this.lastStorageError.set(
            `Uso de almacenamiento local elevado (${pct.toFixed(1)}%). Exporta tus proyectos y elimina respaldos o bases que no necesites.`
          );
        }
      }
    } catch {
      // API no disponible
    }
  }

  /**
   * Comprueba que haya espacio para escribir aproximadamente `bytes`.
   * Lanza StorageError si la cuota conocida no alcanza.
   */
  async ensureSpaceFor(bytes: number): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      if (quota > 0 && usage + bytes > quota * 0.98) {
        throw new StorageError(
          `No hay espacio suficiente en el almacenamiento local (necesario ≈ ${formatBytes(bytes)}, disponible ≈ ${formatBytes(Math.max(0, quota - usage))}).`,
          true
        );
      }
    } catch (err) {
      if (err instanceof StorageError) throw err;
    }
  }

  // ===========================================================================
  // Proyectos
  // ===========================================================================

  async getProjects(): Promise<ProjectInfo[]> {
    const list = await this.getAllFromStore<ProjectInfo>('projects');
    return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  async saveProject(project: ProjectInfo): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.putInStore('projects', {
      ...project,
      schemaVersion: PROJECT_FORMAT_VERSION,
      createdAt: project.createdAt || nowIso,
      updatedAt: project.updatedAt || nowIso
    });
    void this.updateStorageStats();
  }

  async deleteProjectRecord(id: string): Promise<void> {
    await this.deleteFromStore('projects', id);
    void this.updateStorageStats();
  }

  // ===========================================================================
  // Bases de datos
  // ===========================================================================

  async getDatabasesList(): Promise<DatabaseInfo[]> {
    return this.getAllFromStore<DatabaseInfo>('databases');
  }

  async saveDatabaseInfo(dbInfo: DatabaseInfo): Promise<void> {
    await this.putInStore('databases', {
      ...dbInfo,
      projectId: dbInfo.projectId || DEFAULT_PROJECT_ID,
      createdAt: dbInfo.createdAt || new Date().toISOString()
    });
    void this.updateStorageStats();
  }

  async removeDatabaseInfo(name: string): Promise<void> {
    await this.deleteFromStore('databases', name);
    const backups = await this.getBackups(name);
    for (const b of backups) {
      await this.deleteFromStore('backups', b.id);
    }
    void this.updateStorageStats();
  }

  // ===========================================================================
  // Historial de consultas
  // ===========================================================================

  async getHistory(): Promise<ExecutionHistoryItem[]> {
    const list = await this.getAllFromStore<ExecutionHistoryItem>('history');
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async saveHistoryItem(item: ExecutionHistoryItem): Promise<void> {
    await this.putInStore('history', item);
    await this.pruneHistory();
  }

  private async pruneHistory(): Promise<void> {
    const list = await this.getHistory();
    if (list.length <= MAX_HISTORY_ITEMS) return;
    const favorites = list.filter(i => i.isFavorite).length;
    const removable = list.filter(i => !i.isFavorite).slice(Math.max(0, MAX_HISTORY_ITEMS - favorites));
    for (const item of removable) {
      await this.deleteFromStore('history', item.id);
    }
  }

  async toggleFavorite(id: string): Promise<void> {
    const item = await this.getFromStore<ExecutionHistoryItem>('history', id);
    if (item) {
      item.isFavorite = !item.isFavorite;
      await this.putInStore('history', item);
    }
  }

  async deleteHistoryItem(id: string): Promise<void> {
    await this.deleteFromStore('history', id);
  }

  async clearHistory(): Promise<void> {
    await this.clearStore('history');
    void this.updateStorageStats();
  }

  // ===========================================================================
  // Pestañas del editor
  // ===========================================================================

  async getTabs(): Promise<EditorTab[]> {
    const tabs = await this.getAllFromStore<EditorTab & { order?: number }>('tabs');
    return tabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  async saveTab(tab: EditorTab & { order?: number }): Promise<void> {
    await this.putInStore('tabs', { ...tab, updatedAt: new Date().toISOString() });
  }

  async removeTab(id: string): Promise<void> {
    await this.deleteFromStore('tabs', id);
  }

  // ===========================================================================
  // Respaldos
  // ===========================================================================

  async saveBackup(backup: BackupItem): Promise<void> {
    await this.ensureSpaceFor(backup.sqlDump.length * 2);
    await this.putInStore('backups', backup);
    void this.updateStorageStats();
  }

  async getBackups(databaseName?: string): Promise<BackupItem[]> {
    const all = await this.getAllFromStore<BackupItem>('backups');
    return all
      .filter(b => !databaseName || b.database === databaseName)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async pruneBackups(databaseName: string, keep: number): Promise<void> {
    const list = await this.getBackups(databaseName);
    for (const old of list.slice(keep)) {
      await this.deleteFromStore('backups', old.id);
    }
  }

  async deleteBackup(id: string): Promise<void> {
    await this.deleteFromStore('backups', id);
    void this.updateStorageStats();
  }

  // ===========================================================================
  // Intentos de desafíos (historial y puntuación)
  // ===========================================================================

  async saveAttempt<T extends { id: string }>(attempt: T): Promise<void> {
    await this.putInStore('attempts', attempt);
  }

  async getAttempts<T>(): Promise<T[]> {
    return this.getAllFromStore<T>('attempts');
  }

  async clearAttempts(): Promise<void> {
    await this.clearStore('attempts');
  }

  // ===========================================================================
  // Configuración
  // ===========================================================================

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.getFromStore<{ key: string; value: T }>('settings', key);
    return row ? row.value : fallback;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.putInStore('settings', { key, value });
  }

  /** Borra todos los metadatos locales e inicia un nuevo ciclo de retención. Devuelve los nombres de bases eliminadas. */
  async resetAllTemporaryData(): Promise<string[]> {
    const names = (await this.getDatabasesList()).map(d => d.name);
    for (const store of ['projects', 'databases', 'history', 'tabs', 'backups', 'attempts']) {
      await this.clearStore(store);
    }
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(WORKSPACE_CREATED_AT_KEY, nowIso);
    } catch {
      // almacenamiento no disponible
    }
    this.workspaceCreatedAt.set(nowIso);
    await this.setSetting('samples_registered_v3', false);
    await this.migrateStorageFormatIfNeeded();
    void this.updateStorageStats();
    return names;
  }

  /** Elimina bases de datos, proyectos no predeterminados, historial y respaldos con más de 7 días. */  async purgeExpiredData(nowMs = Date.now()): Promise<string[]> {
    const purgedDbs: string[] = [];

    const projects = await this.getProjects();
    for (const p of projects) {
      if (p.id !== DEFAULT_PROJECT_ID && isTimestampExpired(p.updatedAt || p.createdAt, nowMs)) {
        await this.deleteProjectRecord(p.id);
      }
    }

    const dbs = await this.getDatabasesList();
    for (const db of dbs) {
      if (isTimestampExpired(db.createdAt, nowMs)) {
        await this.removeDatabaseInfo(db.name);
        purgedDbs.push(db.name);
      }
    }

    const history = await this.getHistory();
    for (const item of history) {
      if (isTimestampExpired(item.timestamp, nowMs)) {
        await this.deleteHistoryItem(item.id);
      }
    }

    const backups = await this.getBackups();
    for (const bk of backups) {
      if (isTimestampExpired(bk.timestamp, nowMs)) {
        await this.deleteBackup(bk.id);
      }
    }

    return purgedDbs;
  }

  // ===========================================================================
  // Operaciones IDB
  // ===========================================================================

  private tx(storeName: string, mode: IDBTransactionMode): IDBObjectStore | null {
    if (!this.db) return null;
    try {
      return this.db.transaction(storeName, mode).objectStore(storeName);
    } catch {
      return null;
    }
  }

  private getMemoryStore(storeName: string): Map<string, any> {
    let map = this.memoryStores.get(storeName);
    if (!map) {
      map = new Map<string, any>();
      this.memoryStores.set(storeName, map);
    }
    return map;
  }

  private keyOf(storeName: string, value: unknown): string {
    const field = storeName === 'databases' ? 'name' : storeName === 'settings' ? 'key' : 'id';
    return String((value as Record<string, unknown>)[field] ?? '');
  }

  /** Escribe un registro. Rechaza con StorageError si IndexedDB falla (p. ej. cuota agotada). */
  private putInStore<T>(storeName: string, value: T): Promise<void> {
    const store = this.tx(storeName, 'readwrite');
    if (!store) {
      const key = this.keyOf(storeName, value);
      if (key) this.getMemoryStore(storeName).set(key, structuredCloneSafe(value));
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      let req: IDBRequest;
      try {
        req = store.put(value);
      } catch (err: any) {
        reject(this.toStorageError(err));
        return;
      }
      req.onsuccess = () => resolve();
      req.onerror = () => reject(this.toStorageError(req.error));
      store.transaction.onabort = () => reject(this.toStorageError(store.transaction.error));
    });
  }

  private toStorageError(err: DOMException | Error | null | undefined): StorageError {
    const quota = err?.name === 'QuotaExceededError';
    const msg = quota
      ? 'Se agotó la cuota de almacenamiento local. Exporta tus proyectos y elimina respaldos o bases que no necesites.'
      : 'Error escribiendo en IndexedDB: ' + (err?.message || 'desconocido');
    this.lastStorageError.set(msg);
    return new StorageError(msg, quota);
  }

  private getFromStore<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    const store = this.tx(storeName, 'readonly');
    if (!store) return Promise.resolve((this.getMemoryStore(storeName).get(String(key)) as T) ?? null);
    return new Promise(resolve => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  }

  private getAllFromStore<T>(storeName: string): Promise<T[]> {
    const store = this.tx(storeName, 'readonly');
    if (!store) return Promise.resolve(Array.from(this.getMemoryStore(storeName).values()) as T[]);
    return new Promise(resolve => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => resolve([]);
    });
  }

  private deleteFromStore(storeName: string, key: IDBValidKey): Promise<void> {
    this.getMemoryStore(storeName).delete(String(key));
    const store = this.tx(storeName, 'readwrite');
    if (!store) return Promise.resolve();
    return new Promise(resolve => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  private clearStore(storeName: string): Promise<void> {
    this.getMemoryStore(storeName).clear();
    const store = this.tx(storeName, 'readwrite');
    if (!store) return Promise.resolve();
    return new Promise(resolve => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }
}

function structuredCloneSafe<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  return (mb / 1024).toFixed(2) + ' GB';
}
