import { Component, EventEmitter, Input, Output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService, PROJECT_FORMAT_VERSION, formatRemainingRetention } from '../../core/services/storage.service';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { NotificationService } from '../../core/services/notification.service';

export type SettingsTab = 'storage' | 'backups' | 'import_export' | 'projects';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <!-- Modal Header -->
        <div class="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <h3 class="font-bold text-sm text-white">Almacenamiento Local, Proyectos y Respaldos</h3>
          </div>
          <button 
            (click)="close.emit()"
            class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800">
            ✕
          </button>
        </div>

        <!-- Tabs inside modal -->
        <div class="flex border-b border-slate-800 bg-slate-950 px-4 text-xs overflow-x-auto">
          <button 
            (click)="switchTab('storage')"
            [class.border-purple-500]="activeTab() === 'storage'"
            [class.text-purple-300]="activeTab() === 'storage'"
            class="px-4 py-2.5 font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap">
            Espacio Local (IndexedDB)
          </button>
          <button 
            (click)="switchTab('backups')"
            [class.border-purple-500]="activeTab() === 'backups'"
            [class.text-purple-300]="activeTab() === 'backups'"
            class="px-4 py-2.5 font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap">
            Respaldos Automáticos ({{ backups().length }})
          </button>
          <button 
            (click)="switchTab('import_export')"
            [class.border-purple-500]="activeTab() === 'import_export'"
            [class.text-purple-300]="activeTab() === 'import_export'"
            class="px-4 py-2.5 font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 whitespace-nowrap">
            Importar / Exportar
          </button>
          <button 
            (click)="switchTab('projects')"
            [class.border-purple-500]="activeTab() === 'projects'"
            [class.text-purple-300]="activeTab() === 'projects'"
            class="px-4 py-2.5 font-medium border-b-2 border-transparent text-emerald-400 hover:text-emerald-200 whitespace-nowrap">
            Proyectos y Formato v{{ formatVersion }}
          </button>
        </div>

        <!-- Modal Body -->
        <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          @if (storageService.lastStorageError(); as stErr) {
            <div class="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-[11px]">
              <strong>Aviso de almacenamiento local:</strong> {{ stErr }}
            </div>
          }

          @if (activeTab() === 'storage') {
            <div class="p-4 rounded-xl bg-amber-950/25 border border-amber-500/30 space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 class="font-bold text-amber-300 text-xs">100% Local · Datos Temporales (Máx. 7 días)</h4>
                  <p class="text-[11px] text-slate-300 mt-0.5">
                    El laboratorio funciona sin login y sin servidores externos. Tus proyectos, bases PostgreSQL Wasm, pestañas e historial permanecen localmente en IndexedDB durante un máximo de 7 días.
                  </p>
                </div>
                <span class="px-2 py-0.5 rounded bg-amber-950 border border-amber-500/40 text-amber-300 font-mono text-[11px] shrink-0">
                  {{ getWorkspaceRemaining() }}
                </span>
              </div>
              <div class="flex justify-end pt-1">
                <button
                  (click)="resetAllTemporaryData()"
                  class="px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 text-[11px] font-medium">
                  Reiniciar Datos Temporales Ahora
                </button>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div class="flex items-center justify-between text-slate-300">
                <span class="font-semibold">Uso de Cuota IndexedDB</span>
                <span class="font-mono text-purple-400">
                  {{ storageService.storageStats().formattedUsed }} / {{ storageService.storageStats().formattedQuota }} ({{ storageService.storageStats().usedPercentage }}%)
                </span>
              </div>
              <div class="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-gradient-to-r from-emerald-500 via-purple-500 to-indigo-500"
                  [style.width.%]="storageService.storageStats().usedPercentage">
                </div>
              </div>
              <p class="text-[11px] text-slate-400">
                Estado del motor activo: <strong class="text-slate-200">{{ sqlEngine.inMemoryMode() ? 'Memoria volátil (fallback)' : 'Persistente local en IndexedDB' }}</strong> · Versión de esquema: <code class="text-cyan-300 font-mono">v{{ storageService.storageVersion() }}</code>.
              </p>
            </div>

            <div class="space-y-2">
              <span class="font-semibold text-slate-300">Bases de Datos del Proyecto Activo ({{ sqlEngine.projectDatabases().length }})</span>
              <div class="space-y-1.5">
                @for (db of sqlEngine.projectDatabases(); track db.name) {
                  <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="font-mono font-medium text-slate-200 truncate">{{ db.name }}</span>
                      @if (sqlEngine.currentDbName() === db.name) {
                        <span class="px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 text-[10px] font-semibold uppercase">Activa</span>
                      }
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono text-[10px]">
                        Expira en: {{ sqlEngine.getDatabaseRemainingTime(db) }}
                      </span>
                      <span class="text-slate-400 font-mono">{{ db.tableCount || 0 }} tablas</span>
                      @if (sqlEngine.isSampleDatabase(db.name)) {
                        <button
                          (click)="resetSampleDb(db.name)"
                          class="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 text-[10px] font-medium">
                          Restablecer
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          } @else if (activeTab() === 'backups') {
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-slate-400 flex-1 min-w-[220px]">
                  SQL LAB genera instantáneas locales en IndexedDB antes de operaciones destructivas (<code class="text-rose-400">DROP</code>, <code class="text-rose-400">TRUNCATE</code>).
                </p>
                <button
                  (click)="createManualBackup()"
                  class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium shrink-0">
                  Crear Respaldo Manual
                </button>
              </div>

              <div class="space-y-2">
                @for (bk of backups(); track bk.id) {
                  <div class="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
                    <div class="flex items-center justify-between">
                      <span class="font-mono font-semibold text-purple-400">{{ bk.database }}</span>
                      <span class="text-slate-500 text-[11px]">{{ bk.timestamp }}</span>
                    </div>
                    <p class="text-slate-300 text-[11px]">{{ bk.reason }}</p>
                    <div class="flex items-center justify-end gap-2 pt-1">
                      <button 
                        (click)="restoreBackup(bk)"
                        class="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium">
                        Restaurar este Respaldo
                      </button>
                    </div>
                  </div>
                } @empty {
                  <div class="p-6 text-center text-slate-500 italic">
                    No hay copias de seguridad guardadas.
                  </div>
                }
              </div>
            </div>
          } @else if (activeTab() === 'import_export') {
            <div class="space-y-4">
              <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 class="font-semibold text-white">Exportar Base de Datos Actual (.SQL)</h4>
                <p class="text-slate-400">Descarga el script DDL + DML completo de <strong class="text-purple-300 font-mono">{{ sqlEngine.currentDbName() }}</strong>.</p>
                <button 
                  (click)="exportCurrentDbSql()"
                  class="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-md">
                  Descargar Volcado SQL
                </button>
              </div>

              <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 class="font-semibold text-white">Exportar Proyecto Completo (.sqllab.json)</h4>
                <p class="text-slate-400">Empaqueta el proyecto <strong class="text-cyan-300">{{ sqlEngine.currentProject()?.name }}</strong> junto con todas sus bases de datos.</p>
                <button 
                  (click)="exportCurrentProjectBundle()"
                  class="px-4 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white font-medium shadow-md">
                  Descargar Paquete de Proyecto (.sqllab.json)
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <h4 class="font-semibold text-white">Importar Script SQL (.sql)</h4>
                  <p class="text-slate-400 text-[11px]">Ejecuta sentencias SQL en la base de datos activa.</p>
                  <input 
                    type="file" 
                    accept=".sql"
                    (change)="onSqlFileSelected($event)"
                    class="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-purple-300 hover:file:bg-slate-700 cursor-pointer" />
                </div>

                <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <h4 class="font-semibold text-white">Importar Proyecto (.sqllab.json)</h4>
                  <p class="text-slate-400 text-[11px]">Restaura un paquete completo como proyecto aislado.</p>
                  <input 
                    type="file" 
                    accept=".json,.sqllab.json"
                    (change)="onProjectBundleSelected($event)"
                    class="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-emerald-300 hover:file:bg-slate-700 cursor-pointer" />
                </div>
              </div>
            </div>
          } @else if (activeTab() === 'projects') {
            <div class="space-y-4">
              <div class="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                <div class="flex items-center justify-between">
                  <h4 class="font-bold text-white text-xs">Arquitectura Local Multi-Proyecto (Formato v{{ formatVersion }})</h4>
                  <span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 font-mono text-[10px]">Zero-Backend · Offline</span>
                </div>
                <p class="text-slate-400 text-[11px]">
                  Cada proyecto agrupa y aísla sus propias bases de datos PostgreSQL (PGlite Wasm) dentro de IndexedDB con versionado de esquema v{{ formatVersion }} y migración automática.
                </p>
              </div>

              <div class="space-y-2">
                @for (proj of sqlEngine.projects(); track proj.id) {
                  <div class="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-slate-100 truncate">{{ proj.name }}</span>
                        @if (proj.id === sqlEngine.currentProjectId()) {
                          <span class="px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 text-[10px]">Activo</span>
                        }
                      </div>
                      <div class="text-[11px] text-slate-400 font-mono mt-0.5">
                        {{ proj.databases.length }} BD(s) · Formato v{{ proj.schemaVersion }}
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      @if (proj.id !== sqlEngine.currentProjectId()) {
                        <button
                          (click)="switchToProject(proj.id)"
                          class="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-medium">
                          Abrir
                        </button>
                      }
                      <button
                        (click)="duplicateProj(proj.id)"
                        class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]">
                        Duplicar
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Footer -->
        <div class="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs">
          <div class="text-[11px] text-slate-500 flex items-center gap-1.5">
            <span>SQL LAB</span>
            <span>·</span>
            <span>Creador: <strong class="text-purple-300 font-medium">Takizawa</strong></span>
          </div>
          <button 
            (click)="close.emit()"
            class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `
})
export class SettingsModalComponent implements OnInit {
  @Input() initialTab: SettingsTab = 'storage';
  @Output() close = new EventEmitter<void>();

  readonly formatVersion = PROJECT_FORMAT_VERSION;
  activeTab = signal<SettingsTab>('storage');
  backups = signal<any[]>([]);

  constructor(
    public storageService: StorageService,
    public sqlEngine: SqlEngineService,
    private notifications: NotificationService
  ) {}

  getWorkspaceRemaining(): string {
    return formatRemainingRetention(this.storageService.workspaceCreatedAt());
  }

  async resetAllTemporaryData(): Promise<void> {
    if (!confirm('¿Eliminar ahora todas tus bases de datos temporales, proyectos propios, historial y respaldos e iniciar un nuevo ciclo de 7 días?')) {
      return;
    }
    try {
      await this.sqlEngine.resetAllTemporaryData();
      await this.loadBackups();
      this.notifications.success('Datos temporales reiniciados', 'Todos los datos anteriores fueron eliminados.');
    } catch (err: any) {
      this.notifications.error('Error al reiniciar', err?.message || err);
    }
  }

  switchTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
    if (tab === 'backups') {
      void this.loadBackups();
    }
  }

  async ngOnInit(): Promise<void> {
    this.activeTab.set(this.initialTab);
    await this.loadBackups();
  }

  async loadBackups(): Promise<void> {
    const list = await this.storageService.getBackups();
    this.backups.set(list);
  }

  async createManualBackup(): Promise<void> {
    try {
      await this.sqlEngine.createBackup('Respaldo manual');
      await this.loadBackups();
      this.notifications.success('Respaldo creado', `Se guardó una instantánea local de '${this.sqlEngine.currentDbName()}'.`);
    } catch (err: any) {
      this.notifications.error('Error al respaldar', err?.message || err);
    }
  }

  async resetSampleDb(name: string): Promise<void> {
    if (!confirm(`¿Restablecer la base de ejemplo '${name}' a sus tablas y datos originales?`)) return;
    try {
      await this.sqlEngine.resetSampleDatabase(name);
      this.notifications.success('Base restablecida', `'${name}' volvió a su estado inicial.`);
    } catch (err: any) {
      this.notifications.error('Error al restablecer', err?.message || err);
    }
  }

  async restoreBackup(backup: any): Promise<void> {
    if (confirm(`¿Deseas restaurar el respaldo de la base de datos '${backup.database}'? Se sobreescribirán las estructuras actuales.`)) {
      try {
        await this.sqlEngine.restoreDump(backup.database, backup.sqlDump);
        this.notifications.success('Respaldo restaurado', 'La base de datos fue revertida al estado del respaldo.');
        this.close.emit();
      } catch (err: any) {
        this.notifications.error('Error al restaurar', err?.message || err);
      }
    }
  }

  async switchToProject(id: string): Promise<void> {
    try {
      await this.sqlEngine.switchProject(id);
      this.notifications.success('Proyecto cargado', `Trabajando en '${this.sqlEngine.currentProject()?.name}'.`);
    } catch (err: any) {
      this.notifications.error('Error al abrir proyecto', err?.message || err);
    }
  }

  async duplicateProj(id: string): Promise<void> {
    try {
      const copy = await this.sqlEngine.duplicateProject(id);
      if (copy) {
        this.notifications.success('Proyecto duplicado', `Se creó '${copy.name}'.`);
      }
    } catch (err: any) {
      this.notifications.error('Error al duplicar', err?.message || err);
    }
  }

  async exportCurrentDbSql(): Promise<void> {
    try {
      const dump = await this.sqlEngine.generateDump();
      const blob = new Blob([dump], { type: 'text/sql;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${this.sqlEngine.currentDbName()}_dump.sql`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.notifications.success('Exportado', 'Volcado SQL descargado con éxito.');
    } catch (err: any) {
      this.notifications.error('Error al exportar', err?.message || err);
    }
  }

  async exportCurrentProjectBundle(): Promise<void> {
    try {
      const bundle = await this.sqlEngine.exportProjectBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const slug = SqlEngineService.normalizeDbName(bundle.project.name) || 'proyecto';
      link.setAttribute('download', `${slug}.sqllab.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.notifications.success('Proyecto exportado', `Archivo .sqllab.json descargado (${bundle.databases.length} BD).`);
    } catch (err: any) {
      this.notifications.error('Error al exportar proyecto', err?.message || err);
    }
  }

  onSqlFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = String(e.target?.result || '');
      try {
        const res = await this.sqlEngine.executeQuery(content);
        if (!res.success) {
          this.notifications.error('Error ejecutando script SQL', res.error || 'Error SQL');
          return;
        }
        this.notifications.success('Importación completada', `Archivo SQL '${file.name}' ejecutado con éxito.`);
        this.close.emit();
      } catch (err: any) {
        this.notifications.error('Error al importar SQL', err?.message || err);
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  onProjectBundleSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = String(e.target?.result || '');
        const imported = await this.sqlEngine.importProjectBundle(content);
        this.notifications.success('Proyecto importado', `'${imported.name}' restaurado localmente.`);
        this.close.emit();
      } catch (err: any) {
        this.notifications.error('Error al importar proyecto', err?.message || err);
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }
}
