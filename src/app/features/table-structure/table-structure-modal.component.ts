import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableSchema } from '../../core/models/database.models';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { NotificationService } from '../../core/services/notification.service';
import { qualifyTableName } from '../../core/utils/sql-utils';

@Component({
  selector: 'app-table-structure-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (activeTable(); as t) {
      <div class="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
          <!-- Modal Header -->
          <div class="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between gap-2">
            <div class="flex items-center gap-3 min-w-0">
              <div class="p-2 rounded-xl bg-purple-950/80 border border-purple-500/40 text-purple-300 shrink-0">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                  <path d="M3 9h18M9 9v12"></path>
                </svg>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-sm text-white font-mono uppercase truncate">{{ t.name }}</h3>
                  <span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">{{ t.rowCount }} registros</span>
                </div>
                <p class="text-xs text-slate-400">Esquema: <code class="text-purple-300 font-mono">{{ t.schema }}</code></p>
              </div>
            </div>

            <button 
              (click)="close.emit()"
              class="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800">
              ✕
            </button>
          </div>

          <!-- Modal Body -->
          <div class="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
            <!-- Columns Table -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <h4 class="font-semibold text-slate-200 flex items-center gap-2">
                  <span>Columnas ({{ t.columns.length }})</span>
                </h4>
                <button
                  (click)="showAlterPanel.set(!showAlterPanel())"
                  class="px-2.5 py-1 rounded-lg bg-purple-950/70 border border-purple-500/40 hover:bg-purple-900/60 text-purple-300 font-medium text-[11px]">
                  {{ showAlterPanel() ? 'Ocultar Editor ALTER TABLE' : '✎ Modificar Estructura (ALTER TABLE)' }}
                </button>
              </div>

              <div class="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                <table class="w-full text-left font-mono">
                  <thead class="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th class="p-2.5">Columna</th>
                      <th class="p-2.5">Tipo de Dato</th>
                      <th class="p-2.5">Nulo</th>
                      <th class="p-2.5">Por Defecto</th>
                      <th class="p-2.5">Claves y Restricciones</th>
                      <th class="p-2.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/60">
                    @for (col of t.columns; track col.name) {
                      <tr class="hover:bg-slate-900/40">
                        <td class="p-2.5 font-semibold text-slate-200">
                          @if (renamingCol() === col.name) {
                            <div class="flex items-center gap-1">
                              <input
                                type="text"
                                [(ngModel)]="renameColInput"
                                (keydown.enter)="confirmRenameColumn(col.name)"
                                class="w-32 bg-slate-900 border border-purple-500 rounded px-1.5 py-0.5 text-white text-[11px]" />
                              <button (click)="confirmRenameColumn(col.name)" class="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[10px]">OK</button>
                              <button (click)="renamingCol.set(null)" class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px]">✕</button>
                            </div>
                          } @else {
                            <div class="flex items-center gap-1.5">
                              @if (col.isPrimaryKey) { <span title="Clave Primaria">🔑</span> }
                              @if (col.isForeignKey) { <span title="Clave Foránea">🔗</span> }
                              <span>{{ col.name }}</span>
                            </div>
                          }
                        </td>
                        <td class="p-2.5 text-cyan-400">{{ col.type }}</td>
                        <td class="p-2.5 text-slate-400">{{ col.nullable ? 'SÍ' : 'NO' }}</td>
                        <td class="p-2.5 text-slate-400 truncate max-w-[160px]">{{ col.defaultValue || 'NULL' }}</td>
                        <td class="p-2.5">
                          <div class="flex flex-wrap gap-1">
                            @if (col.isPrimaryKey) {
                              <span class="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500/40 text-amber-300 text-[10px]">PRIMARY KEY</span>
                            }
                            @if (col.isForeignKey && col.foreignKeyRef) {
                              <span class="px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[10px]">
                                FK → {{ col.foreignKeyRef.table }}({{ col.foreignKeyRef.column }})
                              </span>
                            }
                            @if (col.isUnique && !col.isPrimaryKey) {
                              <span class="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-[10px]">UNIQUE</span>
                            }
                            @if (!col.nullable && !col.isPrimaryKey) {
                              <span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">NOT NULL</span>
                            }
                          </div>
                        </td>
                        <td class="p-2.5 text-right whitespace-nowrap font-sans">
                          <button
                            (click)="startRenameCol(col.name)"
                            title="Renombrar columna"
                            class="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 text-[11px]">
                            Renombrar
                          </button>
                          <button
                            (click)="dropCol(col.name)"
                            title="Eliminar columna"
                            class="ml-1 px-1.5 py-0.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-[11px]">
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Interactive ALTER TABLE Panel -->
            @if (showAlterPanel()) {
              <div class="p-4 rounded-xl bg-slate-950 border border-purple-500/30 space-y-4">
                <h4 class="font-semibold text-purple-300 text-xs">Modificar Estructura Real (PostgreSQL ALTER TABLE)</h4>

                <!-- Add Column Form -->
                <div class="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                  <div class="sm:col-span-2">
                    <label class="block text-[11px] text-slate-400 mb-1">Nueva Columna</label>
                    <input
                      type="text"
                      [(ngModel)]="newColName"
                      placeholder="ej. telefono"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-400 mb-1">Tipo</label>
                    <select
                      [(ngModel)]="newColType"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-cyan-300 font-mono">
                      <option value="TEXT">TEXT</option>
                      <option value="VARCHAR(100)">VARCHAR(100)</option>
                      <option value="INTEGER">INTEGER</option>
                      <option value="NUMERIC(10,2)">NUMERIC(10,2)</option>
                      <option value="BOOLEAN">BOOLEAN</option>
                      <option value="DATE">DATE</option>
                      <option value="TIMESTAMP">TIMESTAMP</option>
                      <option value="JSONB">JSONB</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-400 mb-1">Valor DEFAULT</label>
                    <input
                      type="text"
                      [(ngModel)]="newColDefault"
                      placeholder="opcional (ej. 'N/A')"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono" />
                  </div>
                  <div class="flex items-center justify-between gap-2">
                    <label class="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                      <input type="checkbox" [(ngModel)]="newColNotNull" class="accent-purple-500" />
                      <span>NOT NULL</span>
                    </label>
                    <button
                      (click)="addColumn()"
                      class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold shrink-0">
                      + Añadir
                    </button>
                  </div>
                </div>

                <!-- Rename Table -->
                <div class="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                  <span class="text-slate-400 text-[11px]">Renombrar tabla:</span>
                  <input
                    type="text"
                    [(ngModel)]="renameTableInput"
                    placeholder="nuevo_nombre"
                    class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono" />
                  <button
                    (click)="renameTable()"
                    class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 text-cyan-300 font-medium">
                    Aplicar RENAME TO
                  </button>
                </div>
              </div>
            }

            <!-- Constraints Section -->
            @if ((t.constraints || []).length > 0) {
              <div class="space-y-2">
                <h4 class="font-semibold text-slate-200">Restricciones e Integridad ({{ t.constraints!.length }})</h4>
                <div class="space-y-1">
                  @for (con of t.constraints!; track con.name) {
                    <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                      <div class="flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 text-[10px]">{{ con.type }}</span>
                        <span class="text-slate-300">{{ con.name }}</span>
                      </div>
                      <span class="text-cyan-400 text-[11px]">{{ con.definition }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Quick SQL Actions -->
            <div class="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <button 
                  (click)="queryRows()"
                  class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium">
                  Ver Datos (SELECT)
                </button>
                <button 
                  (click)="truncateTable()"
                  class="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-amber-400">
                  Vaciar (TRUNCATE)
                </button>
                <button 
                  (click)="dropTable()"
                  class="px-3 py-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-950/40 text-rose-400">
                  Eliminar (DROP)
                </button>
              </div>

              <button 
                (click)="close.emit()"
                class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `
})
export class TableStructureModalComponent implements OnChanges {
  @Input() table: TableSchema | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() selectQuery = new EventEmitter<string>();

  showAlterPanel = signal<boolean>(false);
  renamingCol = signal<string | null>(null);
  renameColInput = '';

  newColName = '';
  newColType = 'TEXT';
  newColDefault = '';
  newColNotNull = false;
  renameTableInput = '';

  private trackedSchema = 'public';
  private trackedName = '';

  constructor(
    private sqlEngine: SqlEngineService,
    private notifications: NotificationService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['table'] && this.table) {
      this.trackedSchema = this.table.schema || 'public';
      this.trackedName = this.table.name;
      this.renameTableInput = this.table.name;
      this.renamingCol.set(null);
    }
  }

  activeTable(): TableSchema | null {
    if (!this.table) return null;
    const live = this.sqlEngine.currentSchema().tables.find(
      t => t.schema === this.trackedSchema && t.name === this.trackedName
    );
    return live ?? this.table;
  }

  queryRows(): void {
    const t = this.activeTable();
    if (!t) return;
    const qual = qualifyTableName(t.name, t.schema);
    this.selectQuery.emit(`SELECT * FROM ${qual} LIMIT 50;`);
    this.close.emit();
  }

  async addColumn(): Promise<void> {
    const t = this.activeTable();
    const colName = this.newColName.trim();
    if (!t || !colName) return;
    const res = await this.sqlEngine.addColumn(
      t.name,
      colName,
      this.newColType,
      !this.newColNotNull,
      this.newColDefault,
      t.schema
    );
    if (!res.success) {
      this.notifications.error('Error en ALTER TABLE ADD', res.error || 'No se pudo añadir la columna');
      return;
    }
    this.newColName = '';
    this.newColDefault = '';
    this.newColNotNull = false;
    this.notifications.success('Columna añadida', `Se agregó '${colName}' a '${t.name}'.`);
  }

  startRenameCol(colName: string): void {
    this.renamingCol.set(colName);
    this.renameColInput = colName;
  }

  async confirmRenameColumn(oldName: string): Promise<void> {
    const t = this.activeTable();
    const next = this.renameColInput.trim();
    if (!t || !next || next === oldName) {
      this.renamingCol.set(null);
      return;
    }
    const res = await this.sqlEngine.renameColumn(t.name, oldName, next, t.schema);
    if (!res.success) {
      this.notifications.error('Error al renombrar columna', res.error || 'Sentencia rechazada');
      return;
    }
    this.renamingCol.set(null);
    this.notifications.success('Columna renombrada', `'${oldName}' ahora se llama '${next}'.`);
  }

  async dropCol(colName: string): Promise<void> {
    const t = this.activeTable();
    if (!t) return;
    if (!confirm(`¿Eliminar la columna '${colName}' de '${t.name}'? Se perderán los valores de esa columna.`)) return;
    const res = await this.sqlEngine.dropColumn(t.name, colName, false, t.schema);
    if (!res.success) {
      this.notifications.error('Error al eliminar columna', res.error || 'Sentencia rechazada');
      return;
    }
    this.notifications.success('Columna eliminada', `La columna '${colName}' fue eliminada de '${t.name}'.`);
  }

  async renameTable(): Promise<void> {
    const t = this.activeTable();
    const next = SqlEngineService.normalizeDbName(this.renameTableInput);
    if (!t || !next || next === t.name) return;
    const res = await this.sqlEngine.renameTable(t.name, next, t.schema);
    if (!res.success) {
      this.notifications.error('Error al renombrar tabla', res.error || 'Sentencia rechazada');
      return;
    }
    this.trackedName = next;
    this.renameTableInput = next;
    this.notifications.success('Tabla renombrada', `La tabla ahora se llama '${next}'.`);
  }

  async truncateTable(): Promise<void> {
    const t = this.activeTable();
    if (!t) return;
    if (confirm(`¿Vaciar todos los registros de '${t.name}'?`)) {
      const qual = qualifyTableName(t.name, t.schema);
      const res = await this.sqlEngine.executeQuery(`TRUNCATE TABLE ${qual} CASCADE;`);
      if (!res.success) {
        this.notifications.error('Error al vaciar tabla', res.error || 'No se pudo vaciar');
        return;
      }
      this.notifications.success('Tabla vaciada', `Se eliminaron los datos de '${t.name}'.`);
      this.close.emit();
    }
  }

  async dropTable(): Promise<void> {
    const t = this.activeTable();
    if (!t) return;
    if (confirm(`¿Eliminar permanentemente la tabla '${t.name}'? (Se generará un respaldo previo automáticamente)`)) {
      const qual = qualifyTableName(t.name, t.schema);
      const res = await this.sqlEngine.executeQuery(`DROP TABLE ${qual} CASCADE;`);
      if (!res.success) {
        this.notifications.error('Error al eliminar tabla', res.error || 'No se pudo eliminar');
        return;
      }
      this.notifications.success('Tabla eliminada', `La tabla '${t.name}' ha sido eliminada.`);
      this.close.emit();
    }
  }
}
