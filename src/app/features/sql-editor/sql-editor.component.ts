import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
  computed,
  effect,
  signal,
  untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabManagerService } from '../../core/services/tab-manager.service';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThemeService } from '../../core/services/theme.service';
import { analyzeSqlDialect, statementAtOffset } from '../../core/utils/sql-utils';
import {
  getContextualQuickChips,
  getInlineGhostSuggestion,
  getSqlCompletionItems,
  type ContextualQuickChipsResult,
  type QuickChipSuggestion,
  type SqlCompletionSuggestionKind
} from '../../core/utils/sql-autocomplete';

/** Modelos de Monaco por pestaña: sobreviven a la destrucción del componente (conservan el historial de deshacer). */
const tabModels = new Map<string, any>();
let completionProviderRegistered = false;
let activeCompletionEngine: SqlEngineService | null = null;
let monacoLoaderPromise: Promise<void> | null = null;

@Component({
  selector: 'app-sql-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col h-full bg-slate-950 border-b border-slate-800">
      <!-- Pestañas -->
      <div class="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/80 px-2 pt-1 select-none">
        <div class="flex items-center gap-1 overflow-x-auto min-w-0" role="tablist" aria-label="Archivos SQL abiertos">
          @for (tab of tabManager.tabs(); track tab.id) {
            <div
              role="tab"
              tabindex="0"
              [attr.aria-selected]="tabManager.activeTab()?.id === tab.id"
              (click)="tabManager.setActiveTab(tab.id)"
              (keydown.enter)="tabManager.setActiveTab(tab.id)"
              (dblclick)="renameTab(tab.id, tab.title)"
              (auxclick)="$event.button === 1 && closeTab(tab.id, $event)"
              [class.bg-slate-950]="tabManager.activeTab()?.id === tab.id"
              [class.text-purple-300]="tabManager.activeTab()?.id === tab.id"
              [class.border-purple-500]="tabManager.activeTab()?.id === tab.id"
              [class.bg-slate-900]="tabManager.activeTab()?.id !== tab.id"
              [class.text-slate-400]="tabManager.activeTab()?.id !== tab.id"
              [class.border-transparent]="tabManager.activeTab()?.id !== tab.id"
              title="Doble clic para renombrar"
              class="group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-t-2 border-x border-x-slate-800 text-xs font-mono cursor-pointer transition-colors whitespace-nowrap">
              <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
              <span>{{ tab.title }}</span>
              @if (tab.isDirty) {
                <span class="w-1.5 h-1.5 rounded-full bg-purple-400" title="Cambios sin guardar"></span>
              }
              @if (tabManager.tabs().length > 1) {
                <button
                  (click)="closeTab(tab.id, $event)"
                  title="Cerrar pestaña"
                  [attr.aria-label]="'Cerrar ' + tab.title"
                  class="opacity-60 md:opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 hover:text-white text-slate-500 rounded hover:bg-slate-800 transition-opacity">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              }
            </div>
          }

          <button
            (click)="newTab()"
            title="Nueva consulta SQL"
            aria-label="Nueva consulta SQL"
            class="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors ml-1 shrink-0">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Barra de acciones -->
      <div class="flex items-center justify-between gap-2 px-2 md:px-3 py-1.5 bg-slate-900/60 border-b border-slate-800/80 text-xs select-none">
        <div class="flex items-center gap-1.5 md:gap-2 overflow-x-auto">
          <button
            (click)="runAll()"
            [disabled]="sqlEngine.isExecuting() || !sqlEngine.isReady()"
            title="Ejecutar todo o la selección (F5)"
            class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white font-medium shadow-sm transition-all active:scale-95 whitespace-nowrap">
            @if (sqlEngine.isExecuting()) {
              <svg class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span>Ejecutando…</span>
            } @else {
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Ejecutar <span class="hidden sm:inline opacity-80">(F5)</span></span>
            }
          </button>

          <button
            (click)="runCurrent()"
            [disabled]="sqlEngine.isExecuting() || !sqlEngine.isReady()"
            title="Ejecutar la sentencia bajo el cursor (Ctrl+Enter)"
            class="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-700/60 hover:bg-emerald-950/60 text-emerald-300 disabled:opacity-40 transition-colors whitespace-nowrap">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="9 10 4 15 9 20"></polyline>
              <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
            </svg>
            <span>Sentencia actual</span>
          </button>

          <button
            (click)="formatSql()"
            title="Formatear SQL (Ctrl+Shift+F)"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors">
            <svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="21" y1="10" x2="3" y2="10"></line>
              <line x1="21" y1="6" x2="3" y2="6"></line>
              <line x1="21" y1="14" x2="3" y2="14"></line>
              <line x1="21" y1="18" x2="3" y2="18"></line>
            </svg>
            <span class="hidden md:inline">Formatear</span>
          </button>

          <button
            (click)="explainQuery()"
            [disabled]="sqlEngine.isExecuting() || !sqlEngine.isReady()"
            title="Ver el plan de ejecución (EXPLAIN) de la sentencia actual"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors">
            <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span class="hidden md:inline">Explicar</span>
          </button>

          <button
            (click)="saveCurrentTab()"
            title="Guardar (Ctrl+S)"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors">
            <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span class="hidden md:inline">Guardar</span>
          </button>

          <button
            type="button"
            (click)="triggerAutocomplete()"
            title="Abrir sugerencias de autocompletado (Ctrl+Espacio)"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-700/60 bg-purple-950/30 hover:bg-purple-900/50 text-purple-200 transition-colors whitespace-nowrap">
            <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
            </svg>
            <span class="hidden sm:inline">Autocompletar</span>
          </button>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Selector rápido de base de datos del proyecto -->
          <label class="sr-only" for="editor-db-select">Base de datos activa</label>
          <select
            id="editor-db-select"
            [ngModel]="sqlEngine.currentDbName()"
            (ngModelChange)="switchDb($event)"
            [disabled]="sqlEngine.isExecuting()"
            title="Base de datos activa"
            class="max-w-[9rem] md:max-w-[12rem] bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono text-purple-300 focus:outline-none focus:border-purple-500">
            @for (db of sqlEngine.projectDatabases(); track db.name) {
              <option [value]="db.name">{{ db.name }}</option>
            }
          </select>

          <div class="relative">
            <button
              (click)="toggleMenu($event)"
              title="Plantillas SQL"
              aria-label="Plantillas SQL"
              [attr.aria-expanded]="isMenuOpen()"
              class="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
              </svg>
            </button>

            @if (isMenuOpen()) {
              <div class="absolute right-0 top-7 w-56 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-30" role="menu">
                <div class="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-500">Insertar plantilla</div>
                @for (s of snippetList; track s.id) {
                  <button role="menuitem" (click)="insertSnippet(s.id)" class="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-300 hover:text-white">{{ s.label }}</button>
                }
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Barra interactiva de autocompletado contextual -->
      @if (quickChipsState().chips.length > 0) {
        <div class="flex items-center justify-between gap-2 px-2.5 py-1 bg-slate-900/50 border-b border-slate-800/70 text-[11px] shrink-0 overflow-hidden">
          <div class="flex items-center gap-1.5 overflow-x-auto min-w-0 py-0.5">
            <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-purple-400/90 pr-1.5 border-r border-slate-800">
              {{ quickChipsState().contextLabel }}
            </span>
            @for (chip of quickChipsState().chips; track chip.label) {
              <button
                type="button"
                (click)="applyQuickChip(chip)"
                [title]="chip.detail + ' · ' + chip.category"
                class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 hover:bg-purple-950/70 border border-slate-800 hover:border-purple-500/60 text-slate-300 hover:text-purple-200 font-mono text-[11px] transition-colors cursor-pointer">
                <span>{{ chip.label }}</span>
              </button>
            }
          </div>
          <span class="hidden lg:inline-flex items-center gap-1 shrink-0 text-[10px] text-slate-500 select-none">
            <kbd class="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-slate-400">Tab</kbd>
            <span>/</span>
            <kbd class="px-1 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-slate-400">Ctrl+Espacio</kbd>
          </span>
        </div>
      }

      <!-- Aviso de dialecto externo en tiempo real -->
      @if (dialectHints().length > 0) {
        <div class="px-3 py-1 bg-amber-950/50 border-b border-amber-500/30 text-[11px] text-amber-200 flex items-center justify-between gap-2">
          <span class="truncate">
            ⚠ Sintaxis de <strong>{{ dialectHints()[0].dialect }}</strong> detectada (<code>{{ dialectHints()[0].construct }}</code>): {{ dialectHints()[0].suggestion }}
          </span>
          @if (dialectHints().length > 1) {
            <span class="shrink-0 font-mono text-[10px] text-amber-300">+{{ dialectHints().length - 1 }} más</span>
          }
        </div>
      }

      <!-- Monaco Editor -->
      <div #editorContainer class="flex-1 w-full min-h-[160px] overflow-hidden bg-slate-950 relative">
        @if (!isMonacoReady()) {
          <textarea
            #fallbackTextarea
            [ngModel]="tabManager.activeTab()?.content"
            (ngModelChange)="onFallbackInput($event)"
            (keydown)="onTextareaKeydown($event)"
            (click)="refreshQuickChipsFromTextarea()"
            (keyup)="refreshQuickChipsFromTextarea()"
            spellcheck="false"
            aria-label="Editor SQL"
            class="absolute inset-0 w-full h-full p-4 bg-slate-950 text-cyan-200 font-mono text-xs focus:outline-none resize-none"></textarea>
        }
      </div>
    </div>
  `
})
export class SqlEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('fallbackTextarea') fallbackTextarea?: ElementRef<HTMLTextAreaElement>;

  private editor: any = null;
  private monaco: any = null;
  private monacoRetryCount = 0;
  private monacoTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private applyingExternalChange = false;

  readonly isMenuOpen = signal<boolean>(false);
  readonly isMonacoReady = signal<boolean>(false);
  readonly dialectHints = computed(() => analyzeSqlDialect(this.tabManager.activeTab()?.content || ''));
  readonly quickChipsState = signal<ContextualQuickChipsResult>({ contextLabel: 'Inicio SQL', chips: [] });

  readonly snippetList = [
    { id: 'select', label: 'SELECT con filtro y orden' },
    { id: 'insert', label: 'INSERT INTO … VALUES' },
    { id: 'update', label: 'UPDATE … WHERE' },
    { id: 'create_table', label: 'CREATE TABLE' },
    { id: 'join', label: 'JOIN entre tablas' },
    { id: 'group', label: 'GROUP BY con agregados' },
    { id: 'cte', label: 'CTE (WITH …)' },
    { id: 'window', label: 'Función de ventana' },
    { id: 'transaction', label: 'Transacción' }
  ];

  constructor(
    public tabManager: TabManagerService,
    public sqlEngine: SqlEngineService,
    private notifications: NotificationService,
    public themeService: ThemeService
  ) {
    // Sincroniza la pestaña activa con el modelo de Monaco
    effect(() => {
      const active = this.tabManager.activeTab();
      if (!active || !this.isMonacoReady()) return;
      untracked(() => {
        const model = this.getModelFor(active.id, active.content);
        if (this.editor.getModel() !== model) {
          this.editor.setModel(model);
          this.editor.focus();
        }
        if (model.getValue() !== active.content) {
          // Cambio externo (plantilla, academia, formateo...): se registra como edición deshacible
          this.applyingExternalChange = true;
          model.pushEditOperations([], [{ range: model.getFullModelRange(), text: active.content }], () => null);
          this.applyingExternalChange = false;
        }
      });
    });

    // Elimina los modelos de pestañas cerradas
    effect(() => {
      const ids = new Set(this.tabManager.tabs().map(t => t.id));
      for (const [id, model] of tabModels) {
        if (!ids.has(id)) {
          model.dispose();
          tabModels.delete(id);
        }
      }
    });

    effect(() => {
      const theme = this.themeService.currentTheme();
      if (this.isMonacoReady()) {
        this.monaco.editor.setTheme(theme === 'dark' ? 'sqllab-dark' : 'sqllab-light');
      }
    });

    // Actualiza los chips contextuales de autocompletado ante cambios de esquema o pestaña
    effect(() => {
      this.sqlEngine.currentSchema();
      this.tabManager.activeTab();
      untracked(() => this.updateQuickChips());
    });
  }

  ngAfterViewInit(): void {
    this.updateQuickChips();
    this.initMonaco();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.monacoTimeout) clearTimeout(this.monacoTimeout);
    // Los modelos se conservan (historial de deshacer por pestaña); solo se libera la vista
    this.editor?.dispose();
    this.editor = null;
  }

  @HostListener('document:click')
  closeMenuOnOutsideClick(): void {
    if (this.isMenuOpen()) this.isMenuOpen.set(false);
  }

  /** Atajos globales mientras el editor está visible (evita que F5 recargue la página). */
  @HostListener('window:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const inMonaco = !!target?.closest?.('.monaco-editor');
    if (inMonaco) return; // Monaco gestiona sus propios atajos
    const inOtherInput = !!target && /^(INPUT|SELECT)$/.test(target.tagName);
    if (target?.closest?.('.xterm')) return;

    if (event.key === 'F5') {
      event.preventDefault();
      if (!inOtherInput) void this.runAll();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.saveCurrentTab();
    }
  }

  onFallbackInput(value: string): void {
    this.tabManager.updateActiveTabContent(value);
    this.refreshQuickChipsFromTextarea();
  }

  refreshQuickChipsFromTextarea(): void {
    const el = this.fallbackTextarea?.nativeElement;
    if (!el) {
      this.updateQuickChips();
      return;
    }
    const val = el.value || '';
    const before = val.slice(0, el.selectionStart ?? val.length);
    this.quickChipsState.set(getContextualQuickChips(before, this.linePrefixFrom(before), this.sqlEngine.currentSchema()));
  }

  onTextareaKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.runAll();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.code === 'Space' || event.key === ' ')) {
      event.preventDefault();
      this.triggerAutocomplete();
      return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const el = this.fallbackTextarea?.nativeElement;
      if (!el) return;
      const val = el.value || '';
      const start = el.selectionStart ?? val.length;
      const end = el.selectionEnd ?? start;
      const before = val.slice(0, start);
      const after = val.slice(end);
      const nextNl = after.indexOf('\n');
      const lineSuffix = nextNl === -1 ? after : after.slice(0, nextNl);

      const ghost =
        start === end
          ? getInlineGhostSuggestion(val, this.linePrefixFrom(before), lineSuffix, this.sqlEngine.currentSchema())
          : null;
      const insertion = ghost ?? '  ';
      this.applyTextareaEdit(before + insertion + after, start + insertion.length, false);
    }
  }

  private initMonaco(): void {
    if (this.destroyed) return;
    const win = window as any;
    if (win.monaco?.editor) {
      this.monaco = win.monaco;
      this.createEditor();
      return;
    }
    if (!win.require?.config) {
      const proc = (globalThis as { process?: { versions?: { node?: string } } }).process;
      if (proc?.versions?.node) return;
      if (!monacoLoaderPromise) {
        monacoLoaderPromise = new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = new URL('assets/monaco/vs/loader.js', document.baseURI).href;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = err => reject(err);
          document.head.appendChild(script);
        }).catch(err => {
          monacoLoaderPromise = null;
          throw err;
        });
      }
      monacoLoaderPromise
        .then(() => {
          if (!this.destroyed) this.initMonaco();
        })
        .catch(err => console.warn('No se pudo cargar Monaco; se usa el editor básico.', err));
      return;
    }
    try {
      win.require.config({ paths: { vs: new URL('assets/monaco/vs', document.baseURI).href.replace(/\/$/, '') } });
      win.require(['vs/editor/editor.main'], () => {
        if (this.destroyed) return;
        this.monaco = win.monaco;
        this.createEditor();
      }, (err: unknown) => console.warn('No se pudo cargar Monaco; se usa el editor básico.', err));
    } catch (err) {
      console.warn('Monaco require error:', err);
    }
  }

  private defineThemes(): void {
    this.monaco.editor.defineTheme('sqllab-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'C084FC', fontStyle: 'bold' },
        { token: 'string', foreground: '6EE7B7' },
        { token: 'number', foreground: 'FBBF24' },
        { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
        { token: 'operator', foreground: '94A3B8' },
        { token: 'predefined', foreground: '67E8F9' }
      ],
      colors: {
        'editor.background': '#020617',
        'editor.lineHighlightBackground': '#0F172A',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#A78BFA',
        'editor.selectionBackground': '#6D28D955',
        'editorCursor.foreground': '#A855F7'
      }
    });
    this.monaco.editor.defineTheme('sqllab-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '7C3AED', fontStyle: 'bold' },
        { token: 'string', foreground: '047857' },
        { token: 'number', foreground: 'B45309' },
        { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' }
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.lineHighlightBackground': '#F1F5F9',
        'editorCursor.foreground': '#7C3AED'
      }
    });
  }

  private getModelFor(tabId: string, content: string): any {
    let model = tabModels.get(tabId);
    if (!model || model.isDisposed()) {
      model = this.monaco.editor.createModel(content, 'sql');
      model.updateOptions({ tabSize: 2, insertSpaces: true });
      tabModels.set(tabId, model);
    }
    return model;
  }

  private createEditor(): void {
    if (!this.monaco || !this.editorContainer || this.destroyed) return;

    this.defineThemes();
    this.registerCompletions();

    const active = this.tabManager.activeTab();
    const model = active ? this.getModelFor(active.id, active.content) : this.monaco.editor.createModel('', 'sql');

    this.editor = this.monaco.editor.create(this.editorContainer.nativeElement, {
      model,
      theme: this.themeService.currentTheme() === 'dark' ? 'sqllab-dark' : 'sqllab-light',
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'Fira Code', Menlo, Monaco, Consolas, monospace",
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 8, bottom: 8 },
      lineNumbers: 'on',
      cursorBlinking: 'smooth',
      renderWhitespace: 'none',
      wordWrap: 'on',
      tabSize: 2,
      fixedOverflowWidgets: true,
      ariaLabel: 'Editor SQL',
      quickSuggestions: { other: 'on', comments: 'off', strings: 'on' },
      quickSuggestionsDelay: 10,
      suggestOnTriggerCharacters: true,
      wordBasedSuggestions: 'off',
      inlineSuggest: { enabled: true },
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showClasses: true,
        showFields: true,
        showFunctions: true,
        showVariables: true,
        showModules: true,
        showInterfaces: true,
        showWords: false,
        preview: true,
        filterGraceful: true,
        snippetsPreventQuickSuggestions: false
      }
    });

    this.editor.onDidChangeCursorPosition(() => {
      this.updateQuickChips();
    });

    this.editor.onDidChangeModelContent((event: any) => {
      if (this.applyingExternalChange) return;
      this.tabManager.updateActiveTabContent(this.editor.getValue());
      this.updateQuickChips();

      const inserted = event?.changes?.[0]?.text ?? '';
      if (inserted === '.' || inserted === ' ') {
        const pos = this.editor.getPosition();
        const activeModel = this.editor.getModel();
        if (pos && activeModel) {
          const linePrefix = activeModel.getLineContent(pos.lineNumber).slice(0, pos.column - 1);
          if (
            inserted === '.' ||
            /\b(?:SELECT|DISTINCT|FROM|JOIN|WHERE|AND|OR|ON|SET|INTO|TABLE|CREATE|ALTER|DROP|TRUNCATE|BY|VALUES)\s+$/i.test(linePrefix)
          ) {
            setTimeout(() => {
              if (!this.destroyed && this.editor) {
                this.editor.trigger('auto', 'editor.action.triggerSuggest', {});
              }
            }, 10);
          }
        }
      }
    });

    const { KeyCode, KeyMod } = this.monaco;
    this.editor.addCommand(KeyCode.F5, () => this.runAll());
    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => this.runCurrent());
    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => this.saveCurrentTab());
    this.editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF, () => this.formatSql());
    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.Space, () => this.triggerAutocomplete());

    this.isMonacoReady.set(true);
    this.updateQuickChips();
  }

  private mapCompletionKind(monaco: any, kind: SqlCompletionSuggestionKind): number {
    const K = monaco.languages.CompletionItemKind;
    const mapping: Record<SqlCompletionSuggestionKind, number> = {
      keyword: K.Keyword,
      snippet: K.Snippet,
      table: K.Class,
      view: K.Interface,
      column: K.Field,
      function: K.Function,
      type: K.TypeParameter,
      schema: K.Module,
      sequence: K.Variable,
      operator: K.Operator
    };
    return mapping[kind] ?? K.Text;
  }

  private registerCompletions(): void {
    activeCompletionEngine = this.sqlEngine;
    if (completionProviderRegistered) return;
    completionProviderRegistered = true;
    const monaco = this.monaco;
    const getSchema = () => (activeCompletionEngine ?? this.sqlEngine).currentSchema();

    monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' ', '('],
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };
        const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        const offset = model.getOffsetAt(position);
        const items = getSqlCompletionItems(model.getValue(), linePrefix, word.word, getSchema(), offset);
        const insertRuleSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

        return {
          suggestions: items.map(item => ({
            label: item.label,
            kind: this.mapCompletionKind(monaco, item.kind),
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText,
            insertTextRules: item.isSnippet ? insertRuleSnippet : undefined,
            sortText: item.sortText,
            filterText: item.filterText,
            range
          }))
        };
      }
    });

    if (typeof monaco.languages.registerInlineCompletionsProvider === 'function') {
      monaco.languages.registerInlineCompletionsProvider('sql', {
        provideInlineCompletions: (model: any, position: any) => {
          const lineContent = model.getLineContent(position.lineNumber);
          const linePrefix = lineContent.slice(0, position.column - 1);
          const lineSuffix = lineContent.slice(position.column - 1);
          const ghost = getInlineGhostSuggestion(model.getValue(), linePrefix, lineSuffix, getSchema());
          if (!ghost) return { items: [] };
          return {
            items: [
              {
                insertText: ghost,
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }
            ]
          };
        },
        disposeInlineCompletions: () => {}
      });
    }
  }

  private linePrefixFrom(beforeCursor: string): string {
    const lastNl = beforeCursor.lastIndexOf('\n');
    return lastNl === -1 ? beforeCursor : beforeCursor.slice(lastNl + 1);
  }

  private chipReplaceLength(linePrefix: string, insertText: string): number {
    const trailingWord = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(linePrefix)?.[1] ?? '';
    return trailingWord.length > 0 && insertText.toLowerCase().startsWith(trailingWord.toLowerCase())
      ? trailingWord.length
      : 0;
  }

  private applyTextareaEdit(nextValue: string, nextPos: number, focus: boolean): void {
    this.tabManager.updateActiveTabContent(nextValue);
    setTimeout(() => {
      const textarea = this.fallbackTextarea?.nativeElement;
      if (textarea) {
        textarea.value = nextValue;
        if (focus) textarea.focus();
        textarea.selectionStart = nextPos;
        textarea.selectionEnd = nextPos;
        this.refreshQuickChipsFromTextarea();
      } else {
        this.updateQuickChips();
      }
    });
  }

  /** Actualiza la barra de sugerencias contextuales a partir de la posición actual del cursor. */
  private updateQuickChips(): void {
    const schema = this.sqlEngine.currentSchema();
    if (this.editor && this.isMonacoReady()) {
      const model = this.editor.getModel();
      const pos = this.editor.getPosition();
      if (model && pos) {
        const sqlBefore = model.getValue().slice(0, model.getOffsetAt(pos));
        const linePrefix = model.getLineContent(pos.lineNumber).slice(0, pos.column - 1);
        this.quickChipsState.set(getContextualQuickChips(sqlBefore, linePrefix, schema));
        return;
      }
    }
    const content = this.tabManager.activeTab()?.content || '';
    this.quickChipsState.set(getContextualQuickChips(content, this.linePrefixFrom(content), schema));
  }

  /** Abre el menú emergente de autocompletado en Monaco o aplica la sugerencia en el editor básico. */
  triggerAutocomplete(): void {
    if (this.editor && this.isMonacoReady()) {
      this.editor.focus();
      this.editor.trigger('toolbar', 'editor.action.triggerSuggest', {});
      return;
    }
    const el = this.fallbackTextarea?.nativeElement;
    const val = el?.value ?? this.tabManager.activeTab()?.content ?? '';
    const pos = el?.selectionStart ?? val.length;
    const before = val.slice(0, pos);
    const ghost = getInlineGhostSuggestion(val, this.linePrefixFrom(before), '', this.sqlEngine.currentSchema());
    if (ghost) {
      this.applyTextareaEdit(before + ghost + val.slice(pos), pos + ghost.length, true);
    } else if (this.quickChipsState().chips[0]) {
      this.applyQuickChip(this.quickChipsState().chips[0]);
    }
  }

  /** Inserta en el cursor una píldora de sugerencia contextual de la barra rápida. */
  applyQuickChip(chip: QuickChipSuggestion): void {
    if (this.editor && this.isMonacoReady()) {
      const model = this.editor.getModel();
      const pos = this.editor.getPosition();
      if (model && pos) {
        const linePrefix = model.getLineContent(pos.lineNumber).slice(0, pos.column - 1);
        const startColumn = pos.column - this.chipReplaceLength(linePrefix, chip.insertText);
        this.editor.executeEdits('autocomplete-chip', [
          {
            range: new this.monaco.Range(pos.lineNumber, startColumn, pos.lineNumber, pos.column),
            text: chip.insertText,
            forceMoveMarkers: true
          }
        ]);
        this.editor.focus();
        this.updateQuickChips();
        if (chip.insertText.endsWith(' ')) {
          setTimeout(() => {
            if (!this.destroyed && this.editor) {
              this.editor.trigger('chip', 'editor.action.triggerSuggest', {});
            }
          }, 15);
        }
        return;
      }
    }

    const el = this.fallbackTextarea?.nativeElement;
    const cur = el?.value ?? this.tabManager.activeTab()?.content ?? '';
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? start;
    const before = cur.slice(0, start);
    const replaceStart = start - this.chipReplaceLength(this.linePrefixFrom(before), chip.insertText);
    this.applyTextareaEdit(
      cur.slice(0, replaceStart) + chip.insertText + cur.slice(end),
      replaceStart + chip.insertText.length,
      true
    );
  }

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------

  private getSelectionText(): string {
    if (!this.editor || !this.isMonacoReady()) return '';
    const selection = this.editor.getSelection();
    if (!selection || selection.isEmpty()) return '';
    return this.editor.getModel().getValueInRange(selection);
  }

  private getFullText(): string {
    if (this.editor && this.isMonacoReady()) return this.editor.getValue();
    return this.tabManager.activeTab()?.content || '';
  }

  private getCurrentStatement(): string {
    const selected = this.getSelectionText();
    if (selected.trim()) return selected;
    const text = this.getFullText();
    if (!this.editor || !this.isMonacoReady()) return text;
    const offset = this.editor.getModel().getOffsetAt(this.editor.getPosition());
    return statementAtOffset(text, offset)?.text ?? '';
  }

  /** Ejecuta la selección o, si no hay selección, el script completo (F5). */
  async runAll(): Promise<void> {
    const selected = this.getSelectionText();
    await this.execute(selected.trim() ? selected : this.getFullText());
  }

  /** Ejecuta la selección o la sentencia bajo el cursor (Ctrl+Enter). */
  async runCurrent(): Promise<void> {
    await this.execute(this.getCurrentStatement());
  }

  private async execute(query: string): Promise<void> {
    if (!query.trim()) {
      this.notifications.warning('Consulta vacía', 'Escribe una consulta SQL antes de ejecutar.');
      return;
    }
    if (!this.sqlEngine.isReady() || this.sqlEngine.isExecuting()) return;
    try {
      const res = await this.sqlEngine.executeQuery(query);
      if (!res.success) {
        this.notifications.error('Error en la consulta', (res.error || 'Error al procesar la sentencia').split('\n')[0]);
      }
    } catch (err: any) {
      this.notifications.error('Error del motor', err?.message || String(err));
    }
  }

  async formatSql(): Promise<void> {
    const code = this.getFullText();
    if (!code.trim()) return;
    try {
      const { format } = await import('sql-formatter');
      const formatted = format(code, {
        language: 'postgresql',
        keywordCase: 'upper',
        tabWidth: 2,
        linesBetweenQueries: 1
      });
      if (this.editor && this.isMonacoReady()) {
        const model = this.editor.getModel();
        this.editor.pushUndoStop();
        this.editor.executeEdits('format', [{ range: model.getFullModelRange(), text: formatted }]);
        this.editor.pushUndoStop();
      } else {
        this.tabManager.updateActiveTabContent(formatted);
      }
    } catch (err: any) {
      this.notifications.warning('No se pudo formatear', 'Revisa la sintaxis del script: ' + (err?.message || '').split('\n')[0]);
    }
  }

  async explainQuery(): Promise<void> {
    const statement = this.getCurrentStatement().trim().replace(/;\s*$/, '');
    if (!statement) return;
    if (/^\s*EXPLAIN\b/i.test(statement)) {
      await this.execute(statement);
      return;
    }
    await this.execute(`EXPLAIN ${statement}`);
  }

  async saveCurrentTab(): Promise<void> {
    const saved = await this.tabManager.saveActiveTab();
    if (saved) {
      this.notifications.success('Guardado', `'${saved.title}' guardado en el almacenamiento local.`);
    }
  }

  newTab(): void {
    this.tabManager.createTab(undefined, '', this.sqlEngine.currentDbName());
  }

  renameTab(id: string, current: string): void {
    const name = prompt('Nuevo nombre del archivo:', current);
    if (name && name.trim() && name !== current) {
      this.tabManager.renameTab(id, name);
    }
  }

  closeTab(id: string, event: Event): void {
    event.stopPropagation();
    const tab = this.tabManager.tabs().find(t => t.id === id);
    if (tab && tab.content.trim() && !confirm(`¿Cerrar '${tab.title}'? Su contenido se eliminará.`)) return;
    this.tabManager.closeTab(id);
  }

  async switchDb(name: string): Promise<void> {
    if (!name || name === this.sqlEngine.currentDbName()) return;
    try {
      await this.sqlEngine.switchDatabase(name);
      this.notifications.info('Base de datos', `Conectado a '${name}'.`);
    } catch (err: any) {
      this.notifications.error('Error de conexión', err?.message || String(err));
    }
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.isMenuOpen.set(!this.isMenuOpen());
  }

  insertSnippet(type: string): void {
    this.isMenuOpen.set(false);
    const firstTable = this.sqlEngine.currentSchema().tables[0];
    const t = firstTable?.name ?? 'mi_tabla';
    const cols = firstTable?.columns.slice(0, 3).map(c => c.name) ?? ['id', 'nombre'];
    const snippets: Record<string, string> = {
      select: `SELECT ${cols.join(', ')}\nFROM ${t}\nWHERE ${cols[0]} IS NOT NULL\nORDER BY ${cols[0]}\nLIMIT 50;`,
      insert: `INSERT INTO ${t} (${cols.slice(1).join(', ')})\nVALUES (${cols.slice(1).map(() => '...').join(', ')});`,
      update: `UPDATE ${t}\nSET ${cols[1] ?? cols[0]} = ...\nWHERE ${cols[0]} = ...;`,
      create_table: `CREATE TABLE ejemplo (\n  id SERIAL PRIMARY KEY,\n  nombre VARCHAR(100) NOT NULL,\n  activo BOOLEAN DEFAULT TRUE,\n  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`,
      join: this.joinSnippet(),
      group: `SELECT ${cols[1] ?? cols[0]}, COUNT(*) AS total\nFROM ${t}\nGROUP BY ${cols[1] ?? cols[0]}\nHAVING COUNT(*) > 0\nORDER BY total DESC;`,
      cte: `WITH resumen AS (\n  SELECT ${cols[0]}, ${cols[1] ?? cols[0]}\n  FROM ${t}\n)\nSELECT *\nFROM resumen;`,
      window: `SELECT ${cols.join(', ')},\n  ROW_NUMBER() OVER (ORDER BY ${cols[0]}) AS posicion\nFROM ${t};`,
      transaction: `BEGIN;\n\n-- Tus sentencias aquí\n\nCOMMIT; -- o ROLLBACK;`
    };
    const snippet = '\n' + (snippets[type] ?? '') + '\n';

    if (this.editor && this.isMonacoReady()) {
      const position = this.editor.getPosition();
      this.editor.executeEdits('snippet', [{
        range: new this.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        text: snippet,
        forceMoveMarkers: true
      }]);
      this.editor.focus();
    } else {
      const cur = this.tabManager.activeTab()?.content || '';
      this.tabManager.updateActiveTabContent(cur + snippet);
    }
  }

  private joinSnippet(): string {
    const tables = this.sqlEngine.currentSchema().tables;
    for (const table of tables) {
      const fk = table.foreignKeys[0];
      if (fk) {
        return `SELECT a.*, b.*\nFROM ${table.name} a\nJOIN ${fk.targetTable} b ON a.${fk.sourceColumn} = b.${fk.targetColumn}\nLIMIT 50;`;
      }
    }
    return `SELECT a.*, b.*\nFROM tabla_a a\nJOIN tabla_b b ON a.b_id = b.id;`;
  }
}
