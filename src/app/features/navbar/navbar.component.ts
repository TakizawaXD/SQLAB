import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../core/services/theme.service';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { StorageService, formatRemainingRetention } from '../../core/services/storage.service';
import { NotificationService } from '../../core/services/notification.service';
import { LayoutService } from '../../core/services/layout.service';

export type ActiveView = 'editor' | 'academy' | 'challenges' | 'diagrams' | 'history' | 'compatibility' | 'settings';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-3 lg:px-5 flex items-center justify-between select-none z-30 shrink-0">
      <!-- Left: Brand Logo & Title -->
      <div class="flex items-center gap-3">
        <div class="relative flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900 border border-purple-500/40 p-1 shadow-lg shadow-purple-600/20">
          <img src="logo.svg" alt="SQL LAB Logo" class="w-full h-full object-contain" />
          <span class="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-base tracking-wide bg-gradient-to-r from-white via-purple-100 to-purple-400 bg-clip-text text-transparent">SQL LAB</span>
            <span class="hidden md:inline-flex px-1.5 py-0.2 text-[10px] font-semibold tracking-wider uppercase rounded bg-purple-900/60 border border-purple-500/40 text-purple-300">Wasm Local</span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-slate-950/90 border border-purple-500/40 text-purple-300 shadow-sm" title="Creado por Takizawa">
              <span class="text-purple-400">⚡</span>
              <span class="text-slate-400 font-normal">por</span>
              <span class="font-bold text-purple-200 tracking-wide">Takizawa</span>
            </span>
          </div>
          <p class="hidden sm:block text-[11px] text-slate-400 leading-tight truncate max-w-[180px]">
            {{ sqlEngine.currentProject()?.name || 'Proyecto Principal' }} · {{ sqlEngine.currentDbName() }}
          </p>
        </div>
      </div>

      <!-- Center: Navigation Tabs -->
      <nav class="hidden lg:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
        <button 
          (click)="setView('editor')"
          [class.bg-purple-600]="activeView === 'editor'"
          [class.text-white]="activeView === 'editor'"
          [class.shadow-md]="activeView === 'editor'"
          [class.text-slate-400]="activeView !== 'editor'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span>Editor SQL</span>
        </button>

        <button 
          (click)="setView('academy')"
          [class.bg-purple-600]="activeView === 'academy'"
          [class.text-white]="activeView === 'academy'"
          [class.shadow-md]="activeView === 'academy'"
          [class.text-slate-400]="activeView !== 'academy'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
          </svg>
          <span>Academia</span>
        </button>

        <button 
          (click)="setView('challenges')"
          [class.bg-purple-600]="activeView === 'challenges'"
          [class.text-white]="activeView === 'challenges'"
          [class.shadow-md]="activeView === 'challenges'"
          [class.text-slate-400]="activeView !== 'challenges'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
          </svg>
          <span>Desafíos</span>
        </button>

        <button 
          (click)="setView('diagrams')"
          [class.bg-purple-600]="activeView === 'diagrams'"
          [class.text-white]="activeView === 'diagrams'"
          [class.shadow-md]="activeView === 'diagrams'"
          [class.text-slate-400]="activeView !== 'diagrams'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="7" height="7" x="14" y="3" rx="1"></rect>
            <path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"></path>
          </svg>
          <span>Diagramas</span>
        </button>

        <button 
          (click)="setView('history')"
          [class.bg-purple-600]="activeView === 'history'"
          [class.text-white]="activeView === 'history'"
          [class.shadow-md]="activeView === 'history'"
          [class.text-slate-400]="activeView !== 'history'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Historial</span>
        </button>

        <button 
          (click)="setView('compatibility')"
          [class.bg-purple-600]="activeView === 'compatibility'"
          [class.text-white]="activeView === 'compatibility'"
          [class.shadow-md]="activeView === 'compatibility'"
          [class.text-slate-400]="activeView !== 'compatibility'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m18 16 4-4-4-4"></path>
            <path d="m6 8-4 4 4 4"></path>
            <path d="m14.5 4-5 16"></path>
          </svg>
          <span>Compatibilidad</span>
        </button>

        <button 
          (click)="setView('settings')"
          [class.bg-purple-600]="activeView === 'settings'"
          [class.text-white]="activeView === 'settings'"
          [class.shadow-md]="activeView === 'settings'"
          [class.text-slate-400]="activeView !== 'settings'"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:text-slate-100 hover:bg-slate-800/50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>Configuración</span>
        </button>
      </nav>

      <!-- Right: Engine Status, Theme Toggle, Local Privacy Badge -->
      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Layout Panels Toggles (Desplegar / Guardar) -->
        @if (activeView === 'editor') {
          <div class="hidden md:flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
            <button
              (click)="layout.toggleSidebar()"
              [class.text-purple-300]="layout.sidebarOpen()"
              [class.bg-purple-950/60]="layout.sidebarOpen()"
              [class.text-slate-500]="!layout.sidebarOpen()"
              title="Desplegar / Guardar explorador lateral (Ctrl+B)"
              class="p-1.5 rounded hover:text-white hover:bg-slate-800 transition-colors">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>
            <button
              (click)="layout.toggleFooter()"
              [class.text-purple-300]="layout.footerOpen()"
              [class.bg-purple-950/60]="layout.footerOpen()"
              [class.text-slate-500]="!layout.footerOpen()"
              title="Desplegar / Guardar tarjetas de accesos rápidos"
              class="hidden xl:inline-flex p-1.5 rounded hover:text-white hover:bg-slate-800 transition-colors">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                <line x1="3" y1="15" x2="21" y2="15"></line>
              </svg>
            </button>
            <button
              (click)="layout.toggleRightPanel()"
              [class.text-purple-300]="layout.rightPanelOpen()"
              [class.bg-purple-950/60]="layout.rightPanelOpen()"
              [class.text-slate-500]="!layout.rightPanelOpen()"
              title="Desplegar / Guardar panel derecho (Diagrama ER)"
              class="hidden xl:inline-flex p-1.5 rounded hover:text-white hover:bg-slate-800 transition-colors">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                <line x1="15" y1="3" x2="15" y2="21"></line>
              </svg>
            </button>
          </div>
        }

        <!-- DB Engine Badge -->
        <div class="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="font-mono text-[11px] font-medium">PGlite (100% Local)</span>
        </div>

        <!-- Theme Toggle -->
        <button 
          (click)="themeService.toggleTheme()"
          title="Cambiar Modo Claro / Oscuro"
          class="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors">
          @if (themeService.currentTheme() === 'dark') {
            <svg class="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          } @else {
            <svg class="w-4 h-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          }
        </button>

        <!-- Local Privacy Session Badge & Menu (No Login, Max 7 Days) -->
        <div class="relative">
          <button
            (click)="toggleUserMenu()"
            title="Modo Local Privado (IndexedDB, vigencia máxima 7 días)"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-500/30 hover:border-amber-400/60 text-amber-300 text-xs font-medium transition-all">
            <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="hidden md:inline font-mono text-[11px]">Local · {{ getRemainingTime() }}</span>
            <span class="md:hidden font-mono text-[11px]">7d</span>
          </button>

          @if (showUserMenu()) {
            <div class="absolute right-0 top-11 w-76 rounded-xl bg-slate-900 border border-slate-800 p-3.5 shadow-2xl z-50 text-xs space-y-2.5">
              <div class="border-b border-slate-800 pb-2.5 space-y-1">
                <div class="font-semibold text-white">Privacidad 100% Local · Máx. 7 Días</div>
                <p class="text-[11px] text-slate-400 leading-relaxed">
                  Todo se ejecuta y guarda únicamente en tu navegador (<strong class="text-emerald-300">IndexedDB + PGlite</strong>). Ningún dato se envía a servidores externos y todo expira en <strong class="text-amber-300">7 días</strong>.
                </p>
                <div class="flex items-center justify-between pt-1 font-mono text-[11px]">
                  <span class="text-slate-500">Vigencia restante:</span>
                  <span class="text-amber-300 font-semibold">{{ getRemainingTime() }}</span>
                </div>
              </div>

              <button 
                (click)="exportProjectNow()"
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-purple-300 font-medium transition-colors">
                <svg class="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Exportar Proyecto Completo (.sqllab.json)</span>
              </button>

              <button 
                (click)="createLocalSnapshot()"
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-cyan-300 font-medium transition-colors">
                <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"></path>
                </svg>
                <span>Crear Respaldo Local en IndexedDB</span>
              </button>

              <button 
                (click)="resetTemporaryDataNow()"
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-950/40 text-rose-400 font-medium transition-colors">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Borrar y reiniciar datos ahora</span>
              </button>
            </div>
          }
        </div>
      </div>
    </header>
  `
})
export class NavbarComponent {
  @Input() activeView: ActiveView = 'editor';
  @Output() viewChange = new EventEmitter<ActiveView>();

  showUserMenu = signal<boolean>(false);

  constructor(
    public themeService: ThemeService,
    public sqlEngine: SqlEngineService,
    public storageService: StorageService,
    public layout: LayoutService,
    private notifications: NotificationService
  ) {}

  setView(view: ActiveView): void {
    this.viewChange.emit(view);
  }

  toggleUserMenu(): void {
    this.showUserMenu.set(!this.showUserMenu());
  }

  getRemainingTime(): string {
    return formatRemainingRetention(this.storageService.workspaceCreatedAt());
  }

  async createLocalSnapshot(): Promise<void> {
    this.showUserMenu.set(false);
    try {
      await this.sqlEngine.createBackup('Instantánea manual desde barra superior');
      this.notifications.success('Respaldo local guardado', `Copia de '${this.sqlEngine.currentDbName()}' guardada en IndexedDB.`);
    } catch (err: any) {
      this.notifications.error('Error al respaldar', err?.message || err);
    }
  }

  async exportProjectNow(): Promise<void> {
    this.showUserMenu.set(false);
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
      this.notifications.success('Proyecto exportado', `Paquete descargado (${bundle.databases.length} base(s) incluidas).`);
    } catch (err: any) {
      this.notifications.error('Error al exportar proyecto', err?.message || err);
    }
  }

  async resetTemporaryDataNow(): Promise<void> {
    this.showUserMenu.set(false);
    if (!confirm('¿Borrar todas tus bases de datos temporales, proyectos propios, historial y respaldos y comenzar un nuevo ciclo de 7 días?')) {
      return;
    }
    try {
      await this.sqlEngine.resetAllTemporaryData();
      this.notifications.success('Datos reiniciados', 'Se limpiaron los datos temporales y comenzó un nuevo período de 7 días.');
    } catch (err: any) {
      this.notifications.error('Error al reiniciar datos', err?.message || err);
    }
  }
}
