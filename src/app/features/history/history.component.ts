import { Component, EventEmitter, Output, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../../core/services/storage.service';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { TabManagerService } from '../../core/services/tab-manager.service';
import { NotificationService } from '../../core/services/notification.service';
import { ExecutionHistoryItem } from '../../core/models/database.models';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-col h-full bg-slate-950 text-slate-200 select-none overflow-hidden">
      <!-- Header -->
      <div class="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Historial de Consultas y Favoritos
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">Registro persistente de todas las consultas ejecutadas en tu sesión local.</p>
        </div>

        <div class="flex items-center gap-3">
          <button 
            (click)="clearHistory()"
            class="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-rose-300 hover:text-rose-200 transition-colors">
            Limpiar Historial
          </button>
        </div>
      </div>

      <!-- Search & Filters Toolbar -->
      <div class="px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between gap-4 text-xs shrink-0">
        <div class="flex items-center gap-3">
          <input 
            type="text" 
            [(ngModel)]="searchFilter"
            placeholder="Filtrar por texto de consulta..."
            class="w-64 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono" />

          <button 
            (click)="onlyFavorites.set(!onlyFavorites())"
            [class.bg-amber-950]="onlyFavorites()"
            [class.border-amber-500]="onlyFavorites()"
            [class.text-amber-300]="onlyFavorites()"
            class="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors">
            <span>⭐</span>
            <span>Solo Favoritos</span>
          </button>
        </div>

        <span class="text-slate-500">{{ filteredItems().length }} consultas registradas</span>
      </div>

      <!-- History Items List -->
      <div class="flex-1 overflow-y-auto p-4 space-y-2">
        @for (item of filteredItems(); track item.id) {
          <div class="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start justify-between gap-4">
            <div class="space-y-1.5 min-w-0 flex-1">
              <div class="flex items-center gap-2 text-[11px]">
                <!-- Status badge -->
                @if (item.success) {
                  <span class="text-emerald-400 font-semibold">✓ Éxito</span>
                } @else {
                  <span class="text-rose-400 font-semibold">✕ Falló</span>
                }
                <span class="text-slate-600">•</span>
                <span class="text-purple-300 font-mono font-medium">{{ item.database }}</span>
                <span class="text-slate-600">•</span>
                <span class="text-slate-500">{{ item.executionTimeMs }} ms</span>
                <span class="text-slate-600">•</span>
                <span class="text-slate-500">{{ item.rowCount }} filas</span>
                <span class="text-slate-600">•</span>
                <span class="text-slate-500">{{ formatDate(item.timestamp) }}</span>
              </div>

              <!-- SQL Query -->
              <pre class="text-xs font-mono text-cyan-200 bg-slate-950 p-2.5 rounded-lg border border-slate-800/60 overflow-x-auto whitespace-pre-wrap">{{ item.query }}</pre>

              @if (item.error) {
                <div class="text-[11px] text-rose-400 font-mono bg-rose-950/20 p-2 rounded border border-rose-900/30">
                  {{ item.error }}
                </div>
              }
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 shrink-0 pt-1">
              <button 
                (click)="toggleFavorite(item)"
                title="Favorito"
                class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-400 transition-colors">
                <span [class.opacity-100]="item.isFavorite" [class.opacity-40]="!item.isFavorite">⭐</span>
              </button>

              <button 
                (click)="openInEditor(item.query)"
                title="Abrir en Editor"
                class="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            </div>
          </div>
        } @empty {
          <div class="flex flex-col items-center justify-center py-16 text-slate-500">
            <svg class="w-12 h-12 text-slate-700 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <p class="text-xs">No hay consultas en el historial con los filtros aplicados.</p>
          </div>
        }
      </div>
    </div>
  `
})
export class HistoryComponent implements OnInit {
  @Output() navigateToEditor = new EventEmitter<void>();

  items = signal<ExecutionHistoryItem[]>([]);
  searchFilter = '';
  onlyFavorites = signal<boolean>(false);

  constructor(
    private storageService: StorageService,
    private sqlEngine: SqlEngineService,
    private tabManager: TabManagerService,
    private notifications: NotificationService
  ) {
    effect(() => {
      this.sqlEngine.historyVersion();
      void this.loadHistory();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    const list = await this.storageService.getHistory();
    this.items.set(list);
  }

  filteredItems = computed(() => {
    let list = this.items();
    if (this.onlyFavorites()) {
      list = list.filter(i => i.isFavorite);
    }
    const term = this.searchFilter.trim().toLowerCase();
    if (term) {
      list = list.filter(i => i.query.toLowerCase().includes(term) || i.database.toLowerCase().includes(term));
    }
    return list;
  });

  async toggleFavorite(item: ExecutionHistoryItem): Promise<void> {
    await this.storageService.toggleFavorite(item.id);
    await this.loadHistory();
  }

  openInEditor(sql: string): void {
    this.tabManager.loadSnippet(sql, 'historial.sql');
    this.navigateToEditor.emit();
    this.notifications.info('Editor cargado', 'Consulta transferida al Editor SQL.');
  }

  async clearHistory(): Promise<void> {
    if (confirm('¿Deseas vaciar todo el historial de consultas?')) {
      await this.storageService.clearHistory();
      await this.loadHistory();
      this.notifications.success('Historial limpiado', 'El registro de consultas fue vaciado.');
    }
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
