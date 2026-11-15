import { Component, computed, effect, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { NotificationService } from '../../core/services/notification.service';
import { TableSchema } from '../../core/models/database.models';
import { splitSqlStatements, stripSqlNoise } from '../../core/utils/sql-utils';
import { downloadFile, formatCellValue, jsonReplacer } from '../../shared/utils/format';

interface EditTarget {
  table: TableSchema;
  pkColumns: string[];
}

@Component({
  selector: 'app-results-grid',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      <!-- Barra de estado y herramientas -->
      <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/50 text-xs shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          @if (sqlEngine.isExecuting()) {
            <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/40 text-purple-300 font-medium animate-query-pulse">
              <span>Ejecutando…</span>
            </div>
          } @else if (sqlEngine.lastResult(); as res) {
            @if (res.success) {
              <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 font-medium whitespace-nowrap">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>{{ summary() }}</span>
              </div>
              @if (editTarget(); as target) {
                <span class="hidden md:inline text-[11px] text-slate-500 truncate" title="Doble clic en una celda para editarla">
                  Editable: <span class="font-mono text-cyan-400">{{ target.table.name }}</span>
                </span>
              }
            } @else {
              <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-400 font-medium">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Error en la ejecución</span>
              </div>
            }
          } @else {
            <span class="text-slate-400">Sin consultas ejecutadas aún</span>
          }
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          @if (editTarget()) {
            <button
              (click)="toggleInsertPanel()"
              title="Insertar nuevo registro"
              [class.bg-emerald-600]="showInsertPanel()"
              [class.text-white]="showInsertPanel()"
              class="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-[11px] font-medium transition-colors">
              <span>+ Insertar</span>
            </button>
          }

          @if (sqlEngine.lastResult()?.columns?.length) {
            <select
              [ngModel]="filterColumn()"
              (ngModelChange)="onFilterCol($event)"
              aria-label="Filtrar por columna"
              class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500 max-w-32">
              <option value="">Todas las col.</option>
              @for (col of sqlEngine.lastResult()!.columns; track col.name) {
                <option [value]="col.name">{{ col.name }}</option>
              }
            </select>

            <select
              [ngModel]="nullFilter()"
              (ngModelChange)="onNullFilter($event)"
              aria-label="Filtrar valores NULL"
              class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-500">
              <option value="all">Todos</option>
              <option value="null">Solo NULL</option>
              <option value="notnull">No NULL</option>
            </select>
          }

          <div class="relative">
            <input
              type="search"
              [ngModel]="searchFilter()"
              (ngModelChange)="onSearch($event)"
              placeholder="Buscar..."
              aria-label="Buscar en resultados"
              class="w-32 lg:w-40 bg-slate-900 border border-slate-700 rounded-lg pl-7 pr-2 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500" />
            <svg class="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>

          <button
            (click)="copyResults()"
            title="Copiar resultados al portapapeles"
            aria-label="Copiar resultados"
            [disabled]="!hasRows()"
            class="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
            </svg>
            <span class="text-[10px] font-semibold">Copiar</span>
          </button>

          <button
            (click)="exportCsv()"
            title="Exportar a CSV"
            aria-label="Exportar a CSV"
            [disabled]="!hasRows()"
            class="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="text-[10px] font-semibold">CSV</span>
          </button>

          <button
            (click)="exportJson()"
            title="Exportar a JSON"
            aria-label="Exportar a JSON"
            [disabled]="!hasRows()"
            class="flex items-center gap-1 px-1.5 py-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span class="text-[10px] font-semibold">JSON</span>
          </button>
        </div>
      </div>

      <!-- Formulario inline para insertar fila -->
      @if (showInsertPanel() && editTarget(); as target) {
        <div class="px-3 py-2.5 bg-slate-900/95 border-b border-emerald-500/30 text-xs shrink-0 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-emerald-300">
              Insertar registro en <span class="font-mono">{{ target.table.schema }}.{{ target.table.name }}</span>
            </span>
            <button (click)="showInsertPanel.set(false)" class="text-slate-400 hover:text-white text-[11px]">Cerrar</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto pr-1">
            @for (col of target.table.columns; track col.name) {
              <div class="flex flex-col gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                <div class="flex items-center justify-between gap-1">
                  <span class="font-mono text-[11px] text-slate-200 truncate" [title]="col.name + ' (' + col.type + ')'">
                    {{ col.name }}
                    <span class="text-[9px] text-slate-500">{{ col.type }}</span>
                  </span>
                  <button
                    type="button"
                    (click)="toggleInsertNull(col.name)"
                    [class.bg-amber-500/20]="insertNulls[col.name]"
                    [class.text-amber-300]="insertNulls[col.name]"
                    class="px-1 py-0.5 rounded text-[9px] font-mono border border-slate-700 text-slate-400 hover:text-white">
                    NULL
                  </button>
                </div>
                <input
                  type="text"
                  [disabled]="!!insertNulls[col.name]"
                  [(ngModel)]="insertValues[col.name]"
                  [placeholder]="col.defaultValue ? 'auto (' + col.defaultValue + ')' : (col.nullable ? 'opcional / NULL' : 'requerido')"
                  class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[11px] font-mono text-white placeholder-slate-600 disabled:opacity-40 focus:outline-none focus:border-emerald-500" />
              </div>
            }
          </div>
          <div class="flex justify-end gap-2">
            <button (click)="showInsertPanel.set(false)" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">Cancelar</button>
            <button (click)="submitInsertRow()" class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Guardar fila</button>
          </div>
        </div>
      }

      <!-- Contenido -->
      <div class="flex-1 overflow-auto relative">
        @if (sqlEngine.lastResult(); as res) {
          @if (res.dialectWarnings?.length) {
            <div class="mx-3 mt-3 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs space-y-1">
              <div class="font-semibold text-amber-300 flex items-center gap-1.5">
                <span>Aviso de compatibilidad PostgreSQL</span>
              </div>
              @for (warn of res.dialectWarnings; track $index) {
                <div class="text-[11px] text-amber-100/90">
                  <span class="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] mr-1">{{ warn.dialect }}</span>
                  <span class="font-mono text-amber-200">{{ warn.construct }}</span>: {{ warn.message }}
                  @if (warn.suggestion) {
                    <span class="text-cyan-300 font-mono ml-1">-> {{ warn.suggestion }}</span>
                  }
                </div>
              }
            </div>
          }
          @if (!res.success) {
            <div class="p-4 md:p-6">
              <div class="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 text-rose-200">
                <div class="flex items-start gap-3">
                  <div class="p-2 rounded-lg bg-rose-900/50 text-rose-400 shrink-0">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <h4 class="font-semibold text-sm text-rose-300">PostgreSQL devolvió un error</h4>
                    <pre class="mt-2 text-xs font-mono bg-slate-950/80 p-3 rounded-lg border border-rose-900/50 text-rose-400 whitespace-pre-wrap break-words select-text">{{ res.error }}</pre>
                  </div>
                </div>
              </div>
            </div>
          } @else if (res.columns.length > 0) {
            <table class="w-full text-left border-collapse text-xs font-mono">
              <thead class="sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
                <tr>
                  <th class="w-12 px-3 py-2 text-slate-500 font-medium text-center border-r border-slate-800 bg-slate-900">#</th>
                  @for (col of res.columns; track col.name) {
                    <th
                      (click)="sortBy(col.name)"
                      [attr.aria-sort]="sortCol() === col.name ? (sortAsc() ? 'ascending' : 'descending') : null"
                      class="px-3 py-2 font-semibold text-slate-300 border-r border-slate-800 bg-slate-900 hover:bg-slate-800 cursor-pointer transition-colors select-none whitespace-nowrap">
                      <div class="flex items-center justify-between gap-2">
                        <span>{{ col.name }}</span>
                        <div class="flex items-center gap-1">
                          @if (col.type) {
                            <span class="text-[9px] font-normal text-slate-500 uppercase">{{ col.type }}</span>
                          }
                          @if (sortCol() === col.name) {
                            <span class="text-purple-400">{{ sortAsc() ? '▲' : '▼' }}</span>
                          }
                        </div>
                      </div>
                    </th>
                  }
                  @if (editTarget()) {
                    <th class="w-10 px-2 py-2 bg-slate-900"><span class="sr-only">Acciones</span></th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                @for (row of paginatedRows(); track $index; let idx = $index) {
                  <tr class="hover:bg-slate-900/60 transition-colors group">
                    <td class="px-3 py-1.5 text-center text-slate-500 border-r border-slate-800/60 bg-slate-950">
                      {{ (currentPage() - 1) * pageSize() + idx + 1 }}
                    </td>
                    @for (col of res.columns; track col.name) {
                      <td
                        (dblclick)="startEditing(row, col.name)"
                        [title]="cellTitle(row[col.key ?? col.name])"
                        [class.cursor-text]="canEditColumn(col.name)"
                        class="px-3 py-1.5 border-r border-slate-800/60 max-w-xs truncate">
                        @if (editingCell()?.row === row && editingCell()?.col === col.name) {
                          <div class="flex items-center gap-1">
                            <input
                              type="text"
                              data-cell-editor
                              [(ngModel)]="editValue"
                              (blur)="saveCellEdit(row, col.name)"
                              (keydown.enter)="saveCellEdit(row, col.name)"
                              (keydown.escape)="cancelCellEdit()"
                              aria-label="Editar valor"
                              class="w-full min-w-20 bg-purple-950/80 border border-purple-500 rounded px-1.5 py-0.5 text-white text-xs font-mono focus:outline-none" />
                            <button
                              type="button"
                              (mousedown)="$event.preventDefault(); setCellNull(row, col.name)"
                              title="Establecer NULL"
                              class="px-1 py-0.5 rounded bg-slate-800 hover:bg-amber-500/20 text-[9px] text-amber-300 border border-slate-700 shrink-0">
                              NULL
                            </button>
                          </div>
                        } @else {
                          @if (row[col.key ?? col.name] === null || row[col.key ?? col.name] === undefined) {
                            <span class="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-500 italic">NULL</span>
                          } @else if (isBoolean(row[col.key ?? col.name])) {
                            <span [class.text-emerald-400]="row[col.key ?? col.name]" [class.text-rose-400]="!row[col.key ?? col.name]">{{ row[col.key ?? col.name] }}</span>
                          } @else if (isNumeric(row[col.key ?? col.name])) {
                            <span class="text-purple-300">{{ format(row[col.key ?? col.name], col.type) }}</span>
                          } @else {
                            <span class="select-text">{{ format(row[col.key ?? col.name], col.type) }}</span>
                          }
                        }
                      </td>
                    }
                    @if (editTarget()) {
                      <td class="px-2 py-1.5 text-center">
                        <div class="flex items-center justify-center gap-0.5">
                          <button
                            (click)="copyRow(row)"
                            title="Copiar fila JSON"
                            aria-label="Copiar fila"
                            class="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-500 hover:text-cyan-400 transition-opacity">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                            </svg>
                          </button>
                          <button
                            (click)="deleteRow(row)"
                            title="Eliminar registro"
                            aria-label="Eliminar registro"
                            class="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="res.columns.length + 2" class="text-center py-8 text-slate-500">
                      {{ searchFilter() ? 'No se encontraron registros que coincidan con la búsqueda.' : 'La consulta no devolvió filas.' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="p-8 flex flex-col items-center justify-center text-center">
              <div class="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3">
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h4 class="text-sm font-semibold text-slate-200">Instrucción ejecutada con éxito</h4>
              <p class="text-xs text-slate-400 mt-1">
                {{ (($any(res).statementCount ?? 1) > 1) ? ($any(res).statementCount + ' sentencias') : 'La sentencia' }} se
                {{ (($any(res).statementCount ?? 1) > 1) ? 'completaron' : 'completó' }} en {{ res.executionTimeMs }} ms
                @if (res.affectedRows) { · {{ res.affectedRows }} {{ res.affectedRows === 1 ? 'fila afectada' : 'filas afectadas' }} }
              </p>
            </div>
          }
        } @else {
          <div class="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
            <svg class="w-12 h-12 text-slate-700 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2"></rect>
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path>
            </svg>
            <p class="text-xs">Ejecuta una consulta SQL (F5) para ver los resultados aquí.</p>
          </div>
        }
      </div>

      <!-- Paginación -->
      <div class="flex items-center justify-between gap-2 px-3 md:px-4 py-2 border-t border-slate-800 bg-slate-900/60 text-xs text-slate-400 shrink-0">
        <div class="truncate">
          @if (filteredRows().length > 0) {
            <span>{{ (currentPage() - 1) * pageSize() + 1 }}–{{ mathMin(currentPage() * pageSize(), filteredRows().length) }} de {{ filteredRows().length }}</span>
          } @else {
            <span>0 registros</span>
          }
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <button
              (click)="prevPage()"
              [disabled]="currentPage() <= 1"
              aria-label="Página anterior"
              class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300">‹</button>
            <span class="px-2 py-0.5 rounded bg-purple-950 border border-purple-500/50 text-purple-300 font-mono text-xs">
              {{ currentPage() }} / {{ totalPages() }}
            </span>
            <button
              (click)="nextPage()"
              [disabled]="currentPage() >= totalPages()"
              aria-label="Página siguiente"
              class="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300">›</button>
          </div>

          <select
            [ngModel]="pageSize()"
            (ngModelChange)="setPageSize($event)"
            aria-label="Filas por página"
            class="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none">
            <option [ngValue]="10">10 / pág.</option>
            <option [ngValue]="25">25 / pág.</option>
            <option [ngValue]="50">50 / pág.</option>
            <option [ngValue]="100">100 / pág.</option>
          </select>
        </div>
      </div>
    </div>
  `
})
export class ResultsGridComponent {
  readonly searchFilter = signal<string>('');
  readonly filterColumn = signal<string>('');
  readonly nullFilter = signal<'all' | 'null' | 'notnull'>('all');
  readonly showInsertPanel = signal<boolean>(false);
  readonly sortCol = signal<string>('');
  readonly sortAsc = signal<boolean>(true);
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(25);

  readonly editingCell = signal<{ row: Record<string, any>; col: string } | null>(null);
  editValue = '';
  insertValues: Record<string, string> = {};
  insertNulls: Record<string, boolean> = {};
  private lastColumns: unknown = undefined;

  constructor(
    public sqlEngine: SqlEngineService,
    private notifications: NotificationService
  ) {
    // Cada resultado nuevo (no las ediciones locales) reinicia búsqueda, orden y paginación
    effect(() => {
      const columns = this.sqlEngine.lastResult()?.columns ?? null;
      if (columns === this.lastColumns) return;
      this.lastColumns = columns;
      untracked(() => {
        this.searchFilter.set('');
        this.filterColumn.set('');
        this.nullFilter.set('all');
        this.showInsertPanel.set(false);
        this.sortCol.set('');
        this.sortAsc.set(true);
        this.currentPage.set(1);
        this.editingCell.set(null);
      });
    });
  }

  readonly summary = computed(() => {
    const res = this.sqlEngine.lastResult();
    if (!res) return '';
    const parts = [`${res.executionTimeMs} ms`];
    if (res.columns.length > 0) {
      parts.push(`${res.rowCount} ${res.rowCount === 1 ? 'fila' : 'filas'}`);
    } else if (res.affectedRows) {
      parts.push(`${res.affectedRows} afectadas`);
    }
    return parts.join(' · ');
  });

  /** Tabla editable: solo para SELECT simples sobre una tabla con PK presente en el resultado. */
  readonly editTarget = computed<EditTarget | null>(() => {
    const res = this.sqlEngine.lastResult();
    if (!res || !res.success || res.columns.length === 0) return null;
    const statements = splitSqlStatements(res.query);
    if (statements.length !== 1) return null;
    const clean = stripSqlNoise(statements[0].text);
    if (/\b(JOIN|UNION|INTERSECT|EXCEPT|GROUP\s+BY|DISTINCT|WITH|HAVING|RETURNING)\b/i.test(clean)) return null;
    const match = /^\s*SELECT\s+[\s\S]+?\s+FROM\s+(?:("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*)\.)?("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?[A-Za-z_][A-Za-z0-9_]*)?\s*(?:WHERE\b|ORDER\b|LIMIT\b|OFFSET\b|FETCH\b|FOR\b|$)/i.exec(clean);
    if (!match) return null;
    const unquote = (raw: string) => (raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase());
    const schemaName = match[1] ? unquote(match[1]) : null;
    const tableName = unquote(match[2]);
    const tables = this.sqlEngine.currentSchema().tables;
    const table = schemaName
      ? tables.find(t => t.schema === schemaName && t.name === tableName)
      : tables.find(t => t.schema === 'public' && t.name === tableName) || tables.find(t => t.name === tableName);
    if (!table || table.primaryKeys.length === 0) return null;
    const resultCols = new Set(res.columns.map(c => c.name));
    if (!table.primaryKeys.every(pk => resultCols.has(pk))) return null;
    return { table, pkColumns: table.primaryKeys };
  });

  readonly filteredRows = computed(() => {
    const res = this.sqlEngine.lastResult();
    if (!res || !res.rows) return [];
    let rows = res.rows;

    const filterCol = this.filterColumn();
    const nullMode = this.nullFilter();
    if (nullMode !== 'all') {
      rows = rows.filter(r => {
        if (filterCol) {
          const isNull = r[filterCol] === null || r[filterCol] === undefined;
          return nullMode === 'null' ? isNull : !isNull;
        }
        const vals = Object.values(r);
        return nullMode === 'null'
          ? vals.some(v => v === null || v === undefined)
          : vals.every(v => v !== null && v !== undefined);
      });
    }

    const term = this.searchFilter().trim().toLowerCase();
    if (term) {
      rows = rows.filter(r => {
        if (filterCol) {
          const val = r[filterCol];
          return val !== null && val !== undefined && formatCellValue(val).toLowerCase().includes(term);
        }
        return Object.values(r).some(v => v !== null && v !== undefined && formatCellValue(v).toLowerCase().includes(term));
      });
    }

    const col = this.sortCol();
    if (col) {
      const dir = this.sortAsc() ? 1 : -1;
      rows = [...rows].sort((a, b) => compareValues(a[col], b[col]) * dir);
    }
    return rows;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize())));

  readonly paginatedRows = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const start = (page - 1) * this.pageSize();
    return this.filteredRows().slice(start, start + this.pageSize());
  });

  hasRows(): boolean {
    const res = this.sqlEngine.lastResult();
    return !!res && res.success && res.rows.length > 0;
  }

  isBoolean(val: unknown): boolean {
    return typeof val === 'boolean';
  }

  isNumeric(val: unknown): boolean {
    return typeof val === 'number' || typeof val === 'bigint';
  }

  format(val: unknown, type?: string): string {
    return formatCellValue(val, type);
  }

  cellTitle(val: unknown): string {
    if (val === null || val === undefined) return 'NULL';
    const s = formatCellValue(val);
    return s.length > 40 ? s.slice(0, 500) : '';
  }

  mathMin(a: number, b: number): number {
    return Math.min(a, b);
  }

  onSearch(term: string): void {
    this.searchFilter.set(term ?? '');
    this.currentPage.set(1);
  }

  onFilterCol(col: string): void {
    this.filterColumn.set(col ?? '');
    this.currentPage.set(1);
  }

  onNullFilter(mode: 'all' | 'null' | 'notnull'): void {
    this.nullFilter.set(mode || 'all');
    this.currentPage.set(1);
  }

  toggleInsertPanel(): void {
    const next = !this.showInsertPanel();
    if (next) {
      const target = this.editTarget();
      this.insertValues = {};
      this.insertNulls = {};
      if (target) {
        for (const col of target.table.columns) {
          this.insertValues[col.name] = '';
          this.insertNulls[col.name] = false;
        }
      }
    }
    this.showInsertPanel.set(next);
  }

  toggleInsertNull(colName: string): void {
    this.insertNulls[colName] = !this.insertNulls[colName];
  }

  async submitInsertRow(): Promise<void> {
    const target = this.editTarget();
    if (!target) return;

    const payload: Record<string, unknown> = {};
    for (const col of target.table.columns) {
      if (this.insertNulls[col.name]) {
        payload[col.name] = null;
        continue;
      }
      const raw = this.insertValues[col.name] ?? '';
      if (raw === '' && col.defaultValue) continue;
      if (raw === '' && col.nullable) continue;
      payload[col.name] = raw;
    }

    const insertRes = await this.sqlEngine.insertRow(target.table.name, payload, target.table.schema);
    if (!insertRes.success) {
      this.notifications.error('Error al insertar fila', insertRes.error || 'No se pudo insertar el registro.');
      return;
    }

    this.notifications.success('Fila insertada', `Nuevo registro agregado a '${target.table.name}'.`);
    this.showInsertPanel.set(false);
    const currentQuery = this.sqlEngine.lastResult()?.query;
    if (currentQuery) {
      await this.sqlEngine.executeQuery(currentQuery);
    }
  }

  setPageSize(size: number): void {
    this.pageSize.set(Number(size) || 25);
    this.currentPage.set(1);
  }

  sortBy(colName: string): void {
    if (this.sortCol() === colName) {
      this.sortAsc.set(!this.sortAsc());
    } else {
      this.sortCol.set(colName);
      this.sortAsc.set(true);
    }
    this.currentPage.set(1);
  }

  prevPage(): void {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  canEditColumn(col: string): boolean {
    const target = this.editTarget();
    return !!target && target.table.columns.some(c => c.name === col);
  }

  startEditing(row: Record<string, any>, col: string): void {
    const target = this.editTarget();
    if (!target) {
      this.notifications.info(
        'Edición no disponible',
        'Solo se pueden editar resultados de un SELECT sobre una única tabla que incluya su clave primaria.'
      );
      return;
    }
    if (!this.canEditColumn(col)) return;
    this.editingCell.set({ row, col });
    const v = row[col];
    this.editValue = v === null || v === undefined ? '' : formatCellValue(v);
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('input[data-cell-editor]');
      input?.focus();
      input?.select();
    });
  }

  async saveCellEdit(row: Record<string, any>, col: string): Promise<void> {
    const cell = this.editingCell();
    if (!cell) return;
    this.editingCell.set(null);

    const oldValue = row[col];
    const oldText = oldValue === null || oldValue === undefined ? '' : formatCellValue(oldValue);
    if (oldText === this.editValue) return;

    const newValue = this.editValue === '' && oldValue === null ? null : this.editValue.toUpperCase() === 'NULL' ? null : this.editValue;
    await this.persistCellValue(row, col, newValue);
  }

  async setCellNull(row: Record<string, any>, col: string): Promise<void> {
    this.editingCell.set(null);
    await this.persistCellValue(row, col, null);
  }

  private async persistCellValue(row: Record<string, any>, col: string, newValue: string | null): Promise<void> {
    const target = this.editTarget();
    if (!target) return;
    const pk = Object.fromEntries(target.pkColumns.map(c => [c, row[c]]));

    try {
      const affected = await this.sqlEngine.updateCell(target.table.name, pk, col, newValue, target.table.schema);
      if (affected === 0) {
        this.notifications.warning('Sin cambios', 'No se encontró la fila a actualizar (¿fue modificada o eliminada?).');
        return;
      }
      row[col] = newValue;
      this.sqlEngine.lastResult.update(r => (r ? { ...r, rows: [...r.rows] } : r));
      this.notifications.success('Registro actualizado', `Columna '${col}' actualizada en '${target.table.name}'.`);
    } catch (err: any) {
      this.notifications.error('Error al actualizar celda', err?.message || String(err));
    }
  }

  cancelCellEdit(): void {
    this.editingCell.set(null);
  }

  async copyRow(row: Record<string, any>): Promise<void> {
    await this.writeClipboard(JSON.stringify(row, jsonReplacer, 2), 'Fila copiada como JSON.');
  }

  async copyResults(): Promise<void> {
    const res = this.sqlEngine.lastResult();
    const rows = this.filteredRows();
    if (!res || rows.length === 0) return;
    const headers = res.columns.map(c => c.name).join('\t');
    const body = rows.map(r =>
      res.columns.map(c => (r[c.key ?? c.name] === null || r[c.key ?? c.name] === undefined ? 'NULL' : formatCellValue(r[c.key ?? c.name], c.type))).join('\t')
    );
    await this.writeClipboard([headers, ...body].join('\n'), `${rows.length} filas copiadas al portapapeles.`);
  }

  private async writeClipboard(text: string, message: string): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.notifications.success('Copiado', message);
      } else {
        this.notifications.warning('Portapapeles no disponible', 'Usa Exportar CSV o JSON.');
      }
    } catch {
      this.notifications.warning('No se pudo copiar', 'El navegador bloqueó el acceso al portapapeles.');
    }
  }

  async deleteRow(row: Record<string, any>): Promise<void> {
    const target = this.editTarget();
    if (!target) return;
    const pk = Object.fromEntries(target.pkColumns.map(c => [c, row[c]]));
    const pkLabel = target.pkColumns.map(c => `${c} = ${formatCellValue(row[c])}`).join(', ');
    if (!confirm(`¿Eliminar el registro (${pkLabel}) de la tabla '${target.table.name}'?`)) return;

    try {
      await this.sqlEngine.deleteRow(target.table.name, pk, target.table.schema);
      this.sqlEngine.lastResult.update(r => (r ? { ...r, rows: r.rows.filter(x => x !== row), rowCount: r.rowCount - 1 } : r));
      this.notifications.success('Registro eliminado', `El registro fue eliminado de '${target.table.name}'.`);
    } catch (err: any) {
      this.notifications.error('Error al eliminar fila', err?.message || String(err));
    }
  }

  exportCsv(): void {
    const res = this.sqlEngine.lastResult();
    if (!res || res.rows.length === 0) return;
    const escape = (s: string) => (/[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const headers = res.columns.map(c => escape(c.name)).join(',');
    const rows = res.rows.map(r =>
      res.columns
        .map(c => {
          const val = r[c.key ?? c.name];
          return val === null || val === undefined ? '' : escape(formatCellValue(val, c.type));
        })
        .join(',')
    );
    // BOM para que Excel detecte UTF-8
    downloadFile('﻿' + [headers, ...rows].join('\r\n'), `sqllab_${this.sqlEngine.currentDbName()}_${timestamp()}.csv`, 'text/csv;charset=utf-8');
    this.notifications.success('Exportado', `${res.rows.length} filas exportadas a CSV.`);
  }

  exportJson(): void {
    const res = this.sqlEngine.lastResult();
    if (!res || res.rows.length === 0) return;
    downloadFile(JSON.stringify(res.rows, jsonReplacer, 2), `sqllab_${this.sqlEngine.currentDbName()}_${timestamp()}.json`, 'application/json;charset=utf-8');
    this.notifications.success('Exportado', `${res.rows.length} filas exportadas a JSON.`);
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const na = typeof a === 'number' || typeof a === 'bigint' ? Number(a) : typeof a === 'string' && a.trim() !== '' ? Number(a) : NaN;
  const nb = typeof b === 'number' || typeof b === 'bigint' ? Number(b) : typeof b === 'string' && b.trim() !== '' ? Number(b) : NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(formatCellValue(a)).localeCompare(String(formatCellValue(b)), 'es', { numeric: true, sensitivity: 'base' });
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}
