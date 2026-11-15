import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { StorageService } from '../../core/services/storage.service';
import { NotificationService } from '../../core/services/notification.service';
import { LayoutService } from '../../core/services/layout.service';
import { TableSchema } from '../../core/models/database.models';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <aside
      [class.w-full]="fullWidth"
      [class.w-64]="!fullWidth"
      [class.lg:w-72]="!fullWidth"
      class="border-r border-slate-800 bg-slate-900/95 flex flex-col h-full text-slate-300 select-none shrink-0 overflow-hidden">
      <!-- Sidebar Header -->
      <div class="p-3 border-b border-slate-800/80 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Explorador</span>
        </div>
        <div class="flex items-center gap-1">
          <button 
            (click)="openNewDbModal()"
            title="Crear Nueva Base de Datos en el proyecto activo"
            class="px-2 py-0.5 rounded flex items-center gap-1 text-[11px] font-medium text-purple-300 bg-purple-950/50 border border-purple-500/30 hover:bg-purple-900/50 transition-colors">
            <span>+ BD</span>
          </button>
          <button
            (click)="closeSidebar.emit()"
            title="Guardar / Colapsar explorador lateral (Ctrl+B)"
            class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <!-- Project Selector & Controls (Desplegable y Guardable) -->
      <div class="border-b border-slate-800/80 bg-slate-950/40 text-xs">
        <div 
          (click)="layout.toggleProjectSection()"
          title="Desplegar / Guardar controles del proyecto"
          class="p-2.5 flex items-center justify-between gap-1.5 cursor-pointer hover:bg-slate-900/50 transition-colors select-none">
          <div class="flex items-center gap-1.5">
            <svg class="w-3 h-3 text-slate-500 transition-transform" [class.rotate-90]="layout.projectSectionOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Proyecto Activo ({{ sqlEngine.projects().length }})</span>
          </div>
          <span class="text-[10px] font-mono text-emerald-400">Local v2</span>
        </div>

        @if (layout.projectSectionOpen()) {
          <div class="px-2.5 pb-2.5 space-y-2">
            <select
              [ngModel]="sqlEngine.currentProjectId()"
              (ngModelChange)="onSelectProject($event)"
              class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-medium focus:outline-none focus:border-purple-500">
              @for (proj of sqlEngine.projects(); track proj.id) {
                <option [value]="proj.id">📁 {{ proj.name }}</option>
              }
            </select>

            <div class="grid grid-cols-3 gap-1 text-[10px]">
              <button
                (click)="openNewProjectModal()"
                title="Crear nuevo proyecto aislado"
                class="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-purple-900/50 text-slate-200 border border-slate-700/60">
                + Nuevo
              </button>
              <button
                (click)="openRenameProjectModal()"
                title="Renombrar proyecto actual"
                class="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60">
                Renombrar
              </button>
              <button
                (click)="duplicateActiveProject()"
                title="Duplicar proyecto completo"
                class="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60">
                Duplicar
              </button>
              <button
                (click)="exportActiveProject()"
                title="Exportar proyecto (.sqllab.json)"
                class="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-cyan-950/60 text-cyan-300 border border-slate-700/60">
                Exportar
              </button>
              <button
                (click)="projectFileInput.click()"
                title="Importar proyecto (.sqllab.json)"
                class="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-emerald-950/60 text-emerald-300 border border-slate-700/60">
                Importar
              </button>
              <button
                (click)="deleteActiveProject()"
                [disabled]="sqlEngine.projects().length <= 1"
                [class.opacity-40]="sqlEngine.projects().length <= 1"
                title="Eliminar proyecto activo"
                class="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-rose-950/60 text-rose-300 border border-slate-700/60">
                Eliminar
              </button>
            </div>

            <input
              #projectFileInput
              type="file"
              accept=".json,.sqllab.json"
              (change)="onImportProjectFile($event)"
              class="hidden" />
          </div>
        }
      </div>

      <!-- Databases & Schemas Tree -->
      <div class="flex-1 overflow-y-auto p-2 text-xs space-y-1">
        <!-- Databases Folder -->
        <div>
          <div 
            (click)="toggleDatabasesFold()"
            class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-800/60 cursor-pointer text-slate-400 font-medium">
            <svg class="w-3.5 h-3.5 transition-transform" [class.rotate-90]="databasesOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
            </svg>
            <span>Bases del Proyecto</span>
            <span class="ml-auto text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-400">{{ sqlEngine.projectDatabases().length }}</span>
          </div>

          @if (databasesOpen()) {
            <div class="pl-2 space-y-1 mt-0.5">
              @for (db of sqlEngine.projectDatabases(); track db.name) {
                <div>
                  <!-- Database item -->
                  <div 
                    (click)="selectDatabase(db.name)"
                    [title]="'Base temporal · ' + sqlEngine.getDatabaseRemainingTime(db)"
                    [class.bg-purple-950/60]="sqlEngine.currentDbName() === db.name"
                    [class.text-purple-300]="sqlEngine.currentDbName() === db.name"
                    [class.border-l-2]="sqlEngine.currentDbName() === db.name"
                    [class.border-purple-500]="sqlEngine.currentDbName() === db.name"
                    class="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <svg class="w-3.5 h-3.5 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                      </svg>
                      <span class="truncate font-mono">{{ db.name }}</span>
                      <span class="shrink-0 text-[9px] font-mono px-1 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">7d</span>
                    </div>

                    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      @if (sqlEngine.isSampleDatabase(db.name)) {
                        <button
                          (click)="resetSampleDb(db.name, $event)"
                          title="Restablecer datos de ejemplo"
                          class="p-0.5 hover:text-amber-300 text-slate-400">
                          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                            <path d="M3 3v5h5"></path>
                          </svg>
                        </button>
                      }
                      <button 
                        (click)="duplicateDb(db.name, $event)" 
                        title="Duplicar base de datos"
                        class="p-0.5 hover:text-white text-slate-400">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                        </svg>
                      </button>
                      <button 
                        (click)="dropDb(db.name, $event)" 
                        title="Eliminar base de datos"
                        class="p-0.5 hover:text-red-400 text-slate-400">
                        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <!-- Expanded schema if this is active DB -->
                  @if (sqlEngine.currentDbName() === db.name) {
                    <div class="pl-2.5 border-l border-slate-800/80 ml-2 mt-1 space-y-1">
                      <!-- Esquemas header -->
                      <div>
                        <div class="flex items-center justify-between px-2 py-1 text-slate-400">
                          <div 
                            (click)="toggleSchemasFold()"
                            class="flex items-center gap-1.5 hover:text-slate-200 cursor-pointer">
                            <svg class="w-3 h-3 transition-transform" [class.rotate-90]="schemasOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                            <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
                            </svg>
                            <span>Esquemas ({{ sqlEngine.currentSchema().schemas.length }})</span>
                          </div>
                          <button
                            (click)="openNewSchemaModal()"
                            title="Crear nuevo esquema (CREATE SCHEMA)"
                            class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300">
                            + Esquema
                          </button>
                        </div>

                        @if (schemasOpen()) {
                          <div class="pl-2 border-l border-slate-800 ml-2 space-y-1">
                            <!-- Active Schema pills -->
                            <div class="flex flex-wrap gap-1 px-2 py-0.5">
                              @for (sch of sqlEngine.currentSchema().schemas; track sch) {
                                <span class="px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-500/30 text-amber-300 font-mono text-[10px]">
                                  {{ sch }}
                                </span>
                              }
                            </div>

                            <!-- Tablas Category -->
                            <div class="pl-1">
                              <div 
                                (click)="toggleTablesFold()"
                                class="flex items-center justify-between px-2 py-1 text-slate-300 hover:text-white cursor-pointer rounded hover:bg-slate-800/40">
                                <div class="flex items-center gap-1.5">
                                  <svg class="w-3 h-3 transition-transform" [class.rotate-90]="tablesOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                  </svg>
                                  <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                                    <path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path>
                                  </svg>
                                  <span class="font-medium">Tablas</span>
                                </div>
                                <span class="text-[10px] bg-slate-800 px-1.5 py-0.2 rounded text-slate-400">{{ sqlEngine.currentSchema().tables.length }}</span>
                              </div>

                              @if (tablesOpen()) {
                                <div class="pl-2 space-y-0.5 mt-0.5">
                                  @for (table of sqlEngine.currentSchema().tables; track table.schema + '.' + table.name) {
                                    <div>
                                      <div 
                                        (click)="openTable(table)"
                                        class="group flex items-center justify-between px-2 py-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 cursor-pointer">
                                        <div class="flex items-center gap-1.5 min-w-0">
                                          <button
                                            (click)="toggleTableCols(table.schema + '.' + table.name, $event)"
                                            title="Ver columnas de la tabla"
                                            class="p-0.5 text-slate-500 hover:text-slate-200">
                                            <svg class="w-2.5 h-2.5 transition-transform" [class.rotate-90]="isTableExpanded(table.schema + '.' + table.name)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                              <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                          </button>
                                          <svg class="w-3.5 h-3.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                                            <path d="M3 9h18M9 9v12"></path>
                                          </svg>
                                          <span class="truncate font-mono">
                                            @if (table.schema !== 'public') {
                                              <span class="text-amber-300">{{ table.schema }}.</span>
                                            }
                                            {{ table.name }}
                                          </span>
                                        </div>
                                        <div class="flex items-center gap-1.5 shrink-0">
                                          <button
                                            (click)="onInspectTable(table, $event)"
                                            title="Inspeccionar o modificar estructura (ALTER TABLE)"
                                            class="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-slate-700 text-slate-400 hover:text-purple-300 transition-opacity">
                                            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                              <path d="M12 20h9"></path>
                                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                                            </svg>
                                          </button>
                                          <span class="text-[10px] text-slate-500 font-mono group-hover:text-slate-300">{{ table.rowCount }}</span>
                                        </div>
                                      </div>

                                      @if (isTableExpanded(table.schema + '.' + table.name)) {
                                        <div class="pl-6 pr-2 py-0.5 space-y-0.5 border-l border-slate-800/80 ml-3">
                                          @for (col of table.columns; track col.name) {
                                            <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 py-0.5">
                                              <span class="truncate flex items-center gap-1">
                                                @if (col.isPrimaryKey) { <span class="text-amber-400" title="PRIMARY KEY">PK</span> }
                                                @else if (col.isForeignKey) { <span class="text-cyan-400" title="FOREIGN KEY">FK</span> }
                                                @else if (col.isUnique) { <span class="text-emerald-400" title="UNIQUE">UQ</span> }
                                                <span class="text-slate-300">{{ col.name }}</span>
                                              </span>
                                              <span class="text-slate-500 text-[9px] shrink-0">{{ col.type }}</span>
                                            </div>
                                          }
                                        </div>
                                      }
                                    </div>
                                  } @empty {
                                    <div class="px-2 py-1 text-slate-500 italic text-[11px]">Sin tablas creadas</div>
                                  }
                                </div>
                              }
                            </div>

                            <!-- Vistas Category -->
                            <div class="pl-1">
                              <div 
                                (click)="toggleViewsFold()"
                                class="flex items-center justify-between px-2 py-1 text-slate-400 hover:text-slate-200 cursor-pointer rounded hover:bg-slate-800/40">
                                <div class="flex items-center gap-1.5">
                                  <svg class="w-3 h-3 transition-transform" [class.rotate-90]="viewsOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                  </svg>
                                  <svg class="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                  </svg>
                                  <span>Vistas</span>
                                </div>
                                <span class="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{{ sqlEngine.currentSchema().views.length }}</span>
                              </div>

                              @if (viewsOpen()) {
                                <div class="pl-3 space-y-0.5">
                                  @for (view of sqlEngine.currentSchema().views; track view.schema + '.' + view.name) {
                                    <div 
                                      (click)="openView(view.schema !== 'public' ? view.schema + '.' + view.name : view.name)"
                                      class="flex items-center gap-1.5 px-2 py-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 cursor-pointer">
                                      <span class="truncate font-mono">{{ view.schema !== 'public' ? view.schema + '.' + view.name : view.name }}</span>
                                    </div>
                                  } @empty {
                                    <div class="px-2 py-1 text-slate-500 italic text-[11px]">Sin vistas</div>
                                  }
                                </div>
                              }
                            </div>

                            <!-- Índices Category -->
                            <div class="pl-1">
                              <div 
                                (click)="toggleIndexesFold()"
                                class="flex items-center justify-between px-2 py-1 text-slate-400 hover:text-slate-200 cursor-pointer rounded hover:bg-slate-800/40">
                                <div class="flex items-center gap-1.5">
                                  <svg class="w-3 h-3 transition-transform" [class.rotate-90]="indexesOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                  </svg>
                                  <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                    <polyline points="2 17 12 22 22 17"></polyline>
                                    <polyline points="2 12 12 17 22 12"></polyline>
                                  </svg>
                                  <span>Índices</span>
                                </div>
                                <span class="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{{ totalIndexes() }}</span>
                              </div>

                              @if (indexesOpen()) {
                                <div class="pl-3 space-y-0.5">
                                  @for (table of sqlEngine.currentSchema().tables; track table.schema + '.' + table.name) {
                                    @for (idx of table.indexes; track idx.name) {
                                      <div class="flex items-center gap-1 px-2 py-0.5 text-slate-400 text-[11px] font-mono">
                                        <span class="text-emerald-400 font-bold">•</span>
                                        <span class="truncate">{{ idx.name }}</span>
                                      </div>
                                    }
                                  }
                                </div>
                              }
                            </div>

                            <!-- Secuencias Category -->
                            <div class="pl-1">
                              <div 
                                (click)="toggleSequencesFold()"
                                class="flex items-center justify-between px-2 py-1 text-slate-400 hover:text-slate-200 cursor-pointer rounded hover:bg-slate-800/40">
                                <div class="flex items-center gap-1.5">
                                  <svg class="w-3 h-3 transition-transform" [class.rotate-90]="sequencesOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                  </svg>
                                  <span class="text-cyan-400 font-mono text-[11px]">#</span>
                                  <span>Secuencias</span>
                                </div>
                                <span class="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{{ (sqlEngine.currentSchema().sequences || []).length }}</span>
                              </div>

                              @if (sequencesOpen()) {
                                <div class="pl-3 space-y-0.5">
                                  @for (seq of sqlEngine.currentSchema().sequences || []; track seq.schema + '.' + seq.name) {
                                    <div class="flex items-center justify-between px-2 py-0.5 text-slate-400 font-mono text-[11px]">
                                      <span class="truncate">{{ seq.name }}</span>
                                      <span class="text-[10px] text-slate-500">{{ seq.lastValue ?? seq.startValue }}</span>
                                    </div>
                                  } @empty {
                                    <div class="px-2 py-1 text-slate-500 italic text-[11px]">Sin secuencias</div>
                                  }
                                </div>
                              }
                            </div>

                            <!-- Funciones Category -->
                            <div class="pl-1">
                              <div 
                                (click)="toggleFuncsFold()"
                                class="flex items-center justify-between px-2 py-1 text-slate-400 hover:text-slate-200 cursor-pointer rounded hover:bg-slate-800/40">
                                <div class="flex items-center gap-1.5">
                                  <svg class="w-3 h-3 transition-transform" [class.rotate-90]="funcsOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                  </svg>
                                  <svg class="w-3.5 h-3.5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                  </svg>
                                  <span>Funciones</span>
                                </div>
                                <span class="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{{ sqlEngine.currentSchema().functions.length }}</span>
                              </div>

                              @if (funcsOpen()) {
                                <div class="pl-3 space-y-0.5">
                                  @for (func of sqlEngine.currentSchema().functions; track func.schema + '.' + func.name) {
                                    <div class="px-2 py-0.5 text-slate-400 font-mono text-[11px] truncate">
                                      {{ func.name }}()
                                    </div>
                                  } @empty {
                                    <div class="px-2 py-1 text-slate-500 italic text-[11px]">Sin funciones</div>
                                  }
                                </div>
                              }
                            </div>

                            <!-- Triggers Category -->
                            <div class="pl-1">
                              <div 
                                (click)="toggleTriggersFold()"
                                class="flex items-center justify-between px-2 py-1 text-slate-400 hover:text-slate-200 cursor-pointer rounded hover:bg-slate-800/40">
                                <div class="flex items-center gap-1.5">
                                  <svg class="w-3 h-3 transition-transform" [class.rotate-90]="triggersOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                  </svg>
                                  <svg class="w-3.5 h-3.5 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                  </svg>
                                  <span>Triggers</span>
                                </div>
                                <span class="text-[10px] bg-slate-800 px-1.5 rounded text-slate-400">{{ sqlEngine.currentSchema().triggers.length }}</span>
                              </div>

                              @if (triggersOpen()) {
                                <div class="pl-3 space-y-0.5">
                                  @for (trig of sqlEngine.currentSchema().triggers; track trig.schema + '.' + trig.name) {
                                    <div class="px-2 py-0.5 text-slate-400 font-mono text-[11px] truncate">
                                      {{ trig.name }}
                                    </div>
                                  } @empty {
                                    <div class="px-2 py-1 text-slate-500 italic text-[11px]">Sin triggers</div>
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Bottom Panel: Storage meter & Project Actions (Desplegable y Guardable) -->
      <div class="border-t border-slate-800 bg-slate-950/60 p-2.5 shrink-0">
        <div 
          (click)="layout.toggleStorageSection()"
          title="Desplegar / Guardar panel de almacenamiento"
          class="flex items-center justify-between text-xs cursor-pointer hover:text-white transition-colors select-none py-1">
          <div class="flex items-center gap-1.5">
            <svg class="w-3 h-3 text-slate-500 transition-transform" [class.rotate-90]="layout.storageSectionOpen()" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            <span class="text-slate-400 font-medium">Espacio utilizado</span>
          </div>
          <span class="font-mono text-slate-300 font-medium text-[11px]">
            {{ storageService.storageStats().formattedUsed }} / {{ storageService.storageStats().formattedQuota }}
          </span>
        </div>

        <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
          <div 
            class="h-full bg-gradient-to-r from-emerald-500 to-purple-500 rounded-full transition-all duration-500"
            [style.width.%]="storageService.storageStats().usedPercentage">
          </div>
        </div>

        @if (layout.storageSectionOpen()) {
          <div class="space-y-1 mt-2.5 pt-2 border-t border-slate-800/60">
            <button 
              (click)="openStorageSettings.emit()"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>
              </svg>
              <span>Administrar almacenamiento</span>
            </button>

            <button 
              (click)="openImportExport.emit()"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <svg class="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Importar / Exportar</span>
            </button>

            <button 
              (click)="downloadBackup()"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path>
              </svg>
              <span>Respaldar Base SQL</span>
            </button>

            <button 
              (click)="openConfig.emit()"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              <svg class="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Configuración</span>
            </button>
          </div>
        }
      </div>

      <!-- Creator Signature -->
      <div class="px-3 py-2 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs select-none shrink-0">
        <span class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
          <span>⚡</span> Creador
        </span>
        <span class="text-[11px] font-bold text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded border border-purple-500/30">
          Takizawa
        </span>
      </div>

      <!-- New Database Modal -->
      @if (showNewDbModal()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 class="text-sm font-semibold text-white mb-2">Nueva Base de Datos</h3>
            <p class="text-xs text-slate-400 mb-4">
              Se creará dentro del proyecto <strong class="text-purple-300">{{ sqlEngine.currentProject()?.name }}</strong> usando almacenamiento IndexedDB temporal (7 días).
            </p>
            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-slate-300 font-medium mb-1">Nombre de la Base de Datos</label>
                <input 
                  type="text" 
                  [(ngModel)]="newDbName" 
                  (keydown.enter)="confirmCreateDb()"
                  placeholder="ej. ventas_2026"
                  class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono" />
              </div>
              <div class="flex justify-end gap-2 pt-2">
                <button (click)="showNewDbModal.set(false)" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">Cancelar</button>
                <button (click)="confirmCreateDb()" class="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium">Crear Base de Datos</button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- New / Rename Project Modal -->
      @if (projectModalMode(); as mode) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 class="text-sm font-semibold text-white mb-2">
              {{ mode === 'create' ? 'Crear Nuevo Proyecto Aislado' : 'Renombrar Proyecto' }}
            </h3>
            <p class="text-xs text-slate-400 mb-4">
              {{ mode === 'create' ? 'Cada proyecto mantiene sus propias bases de datos aisladas en IndexedDB.' : 'Actualiza el nombre identificador de este proyecto.' }}
            </p>
            <div class="space-y-3 text-xs">
              <div>
                <label class="block text-slate-300 font-medium mb-1">Nombre del Proyecto</label>
                <input
                  type="text"
                  [(ngModel)]="projectNameInput"
                  (keydown.enter)="confirmProjectModal()"
                  placeholder="ej. Sistema de Facturación"
                  class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500" />
              </div>
              @if (mode === 'create') {
                <div>
                  <label class="block text-slate-300 font-medium mb-1">Descripción (opcional)</label>
                  <input
                    type="text"
                    [(ngModel)]="projectDescInput"
                    placeholder="ej. Prácticas de modelado relacional"
                    class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500" />
                </div>
              }
              <div class="flex justify-end gap-2 pt-2">
                <button (click)="projectModalMode.set(null)" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">Cancelar</button>
                <button (click)="confirmProjectModal()" class="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium">
                  {{ mode === 'create' ? 'Crear Proyecto' : 'Guardar Nombre' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- New Schema Modal -->
      @if (showNewSchemaModal()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-5 shadow-2xl">
            <h3 class="text-sm font-semibold text-white mb-2">Crear Nuevo Esquema PostgreSQL</h3>
            <p class="text-xs text-slate-400 mb-3">
              Ejecuta <code class="text-amber-300">CREATE SCHEMA</code> en la base <code class="text-cyan-300">{{ sqlEngine.currentDbName() }}</code>.
            </p>
            <div class="space-y-3 text-xs">
              <input
                type="text"
                [(ngModel)]="newSchemaName"
                (keydown.enter)="confirmCreateSchema()"
                placeholder="ej. ventas"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500" />
              <div class="flex justify-end gap-2">
                <button (click)="showNewSchemaModal.set(false)" class="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">Cancelar</button>
                <button (click)="confirmCreateSchema()" class="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium">Crear Esquema</button>
              </div>
            </div>
          </div>
        </div>
      }
    </aside>
  `
})
export class SidebarComponent {
  @Input() fullWidth = false;
  @Output() closeSidebar = new EventEmitter<void>();
  @Output() tableSelected = new EventEmitter<TableSchema>();
  @Output() inspectTable = new EventEmitter<TableSchema>();
  @Output() viewSelected = new EventEmitter<string>();
  @Output() openStorageSettings = new EventEmitter<void>();
  @Output() openImportExport = new EventEmitter<void>();
  @Output() openConfig = new EventEmitter<void>();

  get databasesOpen() { return this.layout.databasesOpen; }
  get schemasOpen() { return this.layout.schemasOpen; }
  get tablesOpen() { return this.layout.tablesOpen; }
  get viewsOpen() { return this.layout.viewsOpen; }
  get indexesOpen() { return this.layout.indexesOpen; }
  get sequencesOpen() { return this.layout.sequencesOpen; }
  get funcsOpen() { return this.layout.funcsOpen; }
  get triggersOpen() { return this.layout.triggersOpen; }
  expandedTables = signal<Set<string>>(new Set());

  showNewDbModal = signal<boolean>(false);
  newDbName = '';

  projectModalMode = signal<'create' | 'rename' | null>(null);
  projectNameInput = '';
  projectDescInput = '';

  showNewSchemaModal = signal<boolean>(false);
  newSchemaName = '';

  constructor(
    public sqlEngine: SqlEngineService,
    public storageService: StorageService,
    public layout: LayoutService,
    private notifications: NotificationService
  ) {}

  totalIndexes(): number {
    return this.sqlEngine.currentSchema().tables.reduce((acc, t) => acc + t.indexes.length, 0);
  }

  toggleDatabasesFold(): void { this.layout.toggleDatabases(); }
  toggleSchemasFold(): void { this.layout.toggleSchemas(); }
  toggleTablesFold(): void { this.layout.toggleTables(); }
  toggleViewsFold(): void { this.layout.toggleViews(); }
  toggleIndexesFold(): void { this.layout.toggleIndexes(); }
  toggleSequencesFold(): void { this.layout.toggleSequences(); }
  toggleFuncsFold(): void { this.layout.toggleFuncs(); }
  toggleTriggersFold(): void { this.layout.toggleTriggers(); }

  toggleTableCols(key: string, event: MouseEvent): void {
    event.stopPropagation();
    const next = new Set(this.expandedTables());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedTables.set(next);
  }

  isTableExpanded(key: string): boolean {
    return this.expandedTables().has(key);
  }

  async onSelectProject(projectId: string): Promise<void> {
    if (this.sqlEngine.currentProjectId() === projectId) return;
    try {
      await this.sqlEngine.switchProject(projectId);
      const p = this.sqlEngine.currentProject();
      this.notifications.success('Proyecto activo', `Cambiado a '${p?.name || projectId}'`);
    } catch (err: any) {
      this.notifications.error('Error al cambiar de proyecto', err?.message || err);
    }
  }

  openNewProjectModal(): void {
    this.projectNameInput = '';
    this.projectDescInput = '';
    this.projectModalMode.set('create');
  }

  openRenameProjectModal(): void {
    this.projectNameInput = this.sqlEngine.currentProject()?.name || '';
    this.projectDescInput = '';
    this.projectModalMode.set('rename');
  }

  async confirmProjectModal(): Promise<void> {
    const mode = this.projectModalMode();
    const name = this.projectNameInput.trim();
    if (!mode || !name) return;
    try {
      if (mode === 'create') {
        await this.sqlEngine.createProject(name, this.projectDescInput);
        this.notifications.success('Proyecto creado', `Proyecto '${name}' creado con su propia base de datos aislada.`);
      } else {
        await this.sqlEngine.renameProject(this.sqlEngine.currentProjectId(), name);
        this.notifications.success('Proyecto renombrado', `El proyecto ahora se llama '${name}'.`);
      }
      this.projectModalMode.set(null);
    } catch (err: any) {
      this.notifications.error('Error en proyecto', err?.message || err);
    }
  }

  async duplicateActiveProject(): Promise<void> {
    try {
      const copy = await this.sqlEngine.duplicateProject(this.sqlEngine.currentProjectId());
      if (copy) {
        this.notifications.success('Proyecto duplicado', `Se creó '${copy.name}' con copia aislada de todas sus bases.`);
      }
    } catch (err: any) {
      this.notifications.error('Error al duplicar proyecto', err?.message || err);
    }
  }

  async exportActiveProject(): Promise<void> {
    try {
      const bundle = await this.sqlEngine.exportProjectBundle();
      const json = JSON.stringify(bundle, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
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

  onImportProjectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = String(e.target?.result || '');
        const imported = await this.sqlEngine.importProjectBundle(content);
        this.notifications.success('Proyecto importado', `'${imported.name}' cargado con ${imported.databases.length} base(s).`);
      } catch (err: any) {
        this.notifications.error('Archivo de proyecto inválido', err?.message || err);
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  }

  async deleteActiveProject(): Promise<void> {
    const proj = this.sqlEngine.currentProject();
    if (!proj) return;
    if (!confirm(`¿Eliminar el proyecto '${proj.name}' y todas sus bases de datos? Se guardará un respaldo automático previo.`)) {
      return;
    }
    try {
      await this.sqlEngine.deleteProject(proj.id);
      this.notifications.success('Proyecto eliminado', `'${proj.name}' fue eliminado correctamente.`);
    } catch (err: any) {
      this.notifications.error('No se pudo eliminar', err?.message || err);
    }
  }

  openNewSchemaModal(): void {
    this.newSchemaName = '';
    this.showNewSchemaModal.set(true);
  }

  async confirmCreateSchema(): Promise<void> {
    const name = this.newSchemaName.trim();
    if (!name) return;
    try {
      const res = await this.sqlEngine.createSchema(name);
      if (!res.success) {
        this.notifications.error('Error al crear esquema', res.error || 'Sentencia rechazada');
        return;
      }
      this.showNewSchemaModal.set(false);
      this.notifications.success('Esquema creado', `Esquema '${SqlEngineService.normalizeDbName(name)}' creado.`);
    } catch (err: any) {
      this.notifications.error('Error al crear esquema', err?.message || err);
    }
  }

  async selectDatabase(name: string): Promise<void> {
    if (this.sqlEngine.currentDbName() === name) return;
    try {
      await this.sqlEngine.switchDatabase(name);
      this.notifications.success('Base de datos conectada', `Conexión establecida con '${name}'`);
    } catch (err: any) {
      this.notifications.error('Error de conexión', err?.message || err);
    }
  }

  openTable(table: TableSchema): void { this.tableSelected.emit(table); }

  onInspectTable(table: TableSchema, event: MouseEvent): void {
    event.stopPropagation();
    this.inspectTable.emit(table);
  }

  openView(viewName: string): void { this.viewSelected.emit(viewName); }

  openNewDbModal(): void {
    this.newDbName = '';
    this.showNewDbModal.set(true);
  }

  async confirmCreateDb(): Promise<void> {
    const name = this.newDbName.trim();
    if (!name) return;
    try {
      await this.sqlEngine.createDatabase(name);
      this.showNewDbModal.set(false);
      this.notifications.success('Base de datos creada', `La base de datos '${name}' fue creada con éxito.`);
    } catch (err: any) {
      this.notifications.error('Error al crear base de datos', err?.message || err);
    }
  }

  async resetSampleDb(name: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (!confirm(`¿Restablecer la base de ejemplo '${name}' a sus datos originales?`)) return;
    try {
      await this.sqlEngine.resetSampleDatabase(name);
      this.notifications.success('Base restablecida', `La base de ejemplo '${name}' volvió a su estado inicial.`);
    } catch (err: any) {
      this.notifications.error('Error al restablecer', err?.message || err);
    }
  }

  async duplicateDb(name: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const copyName = name + '_copia';
    try {
      const finalName = await this.sqlEngine.duplicateDatabase(name, copyName);
      this.notifications.success('Base de datos duplicada', `Se creó una copia idéntica: '${finalName}'`);
    } catch (err: any) {
      this.notifications.error('Error al duplicar', err?.message || err);
    }
  }

  async dropDb(name: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la base de datos '${name}'? (Se creará respaldo previo si es la activa)`)) {
      try {
        await this.sqlEngine.dropDatabase(name);
        this.notifications.success('Base de datos eliminada', `La base de datos '${name}' ha sido removida.`);
      } catch (err: any) {
        this.notifications.error('Error al eliminar base de datos', err?.message || err);
      }
    }
  }

  async downloadBackup(): Promise<void> {
    try {
      const dump = await this.sqlEngine.generateDump();
      const blob = new Blob([dump], { type: 'text/sql;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${this.sqlEngine.currentDbName()}_respaldo_${new Date().toISOString().slice(0, 10)}.sql`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.notifications.success('Respaldo descargado', 'El volcado SQL se ha descargado correctamente.');
    } catch (err: any) {
      this.notifications.error('Error al respaldar', err?.message || err);
    }
  }
}
