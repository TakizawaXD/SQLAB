import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { StorageService } from '../../core/services/storage.service';
import { ThemeService } from '../../core/services/theme.service';
import { QueryResult } from '../../core/models/database.models';
import { hasExecutableContent, splitSqlStatements } from '../../core/utils/sql-utils';
import { SINGLE_SQL_KEYWORDS } from '../../core/utils/sql-autocomplete';
import { formatCellValue } from '../../shared/utils/format';
import { appEnvironment } from '../../core/config/app-environment';

const TERMINAL_INTERNAL_COMMANDS: readonly string[] = [
  'help',
  'clear',
  'history',
  'databases',
  'tables',
  'describe',
  'version',
  'export',
  'import',
  'projects',
  'schemas'
];

const DARK_THEME: ITheme = {
  background: '#020617',
  foreground: '#E2E8F0',
  cursor: '#A855F7',
  selectionBackground: 'rgba(168, 85, 247, 0.4)',
  black: '#0F172A',
  red: '#F43F5E',
  green: '#10B981',
  yellow: '#F59E0B',
  blue: '#3B82F6',
  magenta: '#A855F7',
  cyan: '#06B6D4',
  white: '#F8FAFC',
  brightBlack: '#64748B'
};

const LIGHT_THEME: ITheme = {
  background: '#FFFFFF',
  foreground: '#0F172A',
  cursor: '#7C3AED',
  selectionBackground: 'rgba(124, 58, 237, 0.25)',
  black: '#0F172A',
  red: '#E11D48',
  green: '#047857',
  yellow: '#B45309',
  blue: '#1D4ED8',
  magenta: '#7C3AED',
  cyan: '#0E7490',
  white: '#334155',
  brightBlack: '#64748B'
};

const MAX_RENDERED_ROWS = 200;
const MAX_CELL_WIDTH = 40;

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col h-full bg-slate-950 border-t lg:border-t-0 border-slate-800 text-slate-200 overflow-hidden font-mono text-xs">
      <div class="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0 select-none">
        <div class="flex items-center gap-2 min-w-0">
          <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          <span class="font-semibold text-slate-300">Terminal SQL</span>
          <span class="text-[10px] text-slate-500 truncate">({{ sqlEngine.currentDbName() }})</span>
        </div>

        <button
          (click)="clearTerminal()"
          title="Limpiar terminal (clear)"
          aria-label="Limpiar terminal"
          class="p-1 hover:text-white text-slate-400 hover:bg-slate-800 rounded">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>

      <div #terminalContainer class="flex-1 w-full min-h-0 p-2 bg-slate-950 overflow-hidden"></div>
    </div>
  `
})
export class TerminalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('terminalContainer') terminalContainer!: ElementRef<HTMLDivElement>;

  private term: Terminal | null = null;
  private fitAddon: FitAddon | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /** LÃ­nea en ediciÃ³n. */
  private currentInput = '';
  /** Sentencia SQL multilÃ­nea acumulada (hasta encontrar `;`). */
  private buffer = '';
  private busy = false;
  private historyIndex = -1;
  private localHistory: string[] = [];

  constructor(
    public sqlEngine: SqlEngineService,
    private storageService: StorageService,
    private themeService: ThemeService
  ) {
    effect(() => {
      const theme = this.themeService.currentTheme();
      if (this.term) this.term.options.theme = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
    });
  }

  ngAfterViewInit(): void {
    this.initXterm();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.term?.dispose();
    this.term = null;
  }

  private initXterm(): void {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "'Fira Code', Menlo, Monaco, Consolas, monospace",
      theme: this.themeService.currentTheme() === 'dark' ? DARK_THEME : LIGHT_THEME,
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: false
    });
    this.term = term;
    this.fitAddon = new FitAddon();
    term.loadAddon(this.fitAddon);
    term.open(this.terminalContainer.nativeElement);

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.terminalContainer.nativeElement);
    this.fit();

    term.writeln('\x1b[1;35m  ____   ___  _       _        _    ____  \x1b[0m');
    term.writeln('\x1b[1;35m / ___| / _ \\| |     | |      / \\  | __ ) \x1b[0m');
    term.writeln('\x1b[1;35m \\___ \\| | | | |     | |     / _ \\ |  _ \\ \x1b[0m');
    term.writeln('\x1b[1;35m  ___) | |_| | |___  | |___ / ___ \\| |_) |\x1b[0m');
    term.writeln('\x1b[1;35m |____/ \\__\\_\\_____| |_____/_/   \\_\\____/ \x1b[0m');
    term.writeln('');
    term.writeln(`\x1b[90m ${this.sqlEngine.pgVersion()} · WebAssembly · Creador: \x1b[1;35mTakizawa\x1b[0m`);
    term.writeln('\x1b[90m Escribe \x1b[1;33mhelp\x1b[0m\x1b[90m para ver los comandos. Las sentencias SQL terminan con \x1b[1;33m;\x1b[0m');
    term.writeln('');
    this.prompt();

    term.onData(data => this.handleData(data));
  }

  private fit(): void {
    try {
      if (this.terminalContainer?.nativeElement.offsetParent !== null) this.fitAddon?.fit();
    } catch {
      // contenedor sin dimensiones todavÃ­a
    }
  }

  private prompt(): void {
    const db = this.sqlEngine.currentDbName();
    if (this.buffer) {
      this.term?.write(`\x1b[1;32m${db}\x1b[0m\x1b[90m-#\x1b[0m `);
    } else {
      this.term?.write(`\x1b[1;32m${db}\x1b[0m\x1b[90m=#\x1b[0m `);
    }
  }

  private handleData(data: string): void {
    if (!this.term) return;

    // Secuencias de escape (flechas)
    if (data === '\x1b[A') return this.historyPrev();
    if (data === '\x1b[B') return this.historyNext();
    if (data.startsWith('\x1b')) return;

    if (this.busy) return;
    if (data === '\t') {
      this.autocompleteTerminalInput();
      return;
    }

    // Pegado de varios caracteres / lÃ­neas
    for (const ch of data.replace(/\r\n/g, '\r').replace(/\n/g, '\r').replace(/\t/g, '  ')) {
      const code = ch.charCodeAt(0);
      if (ch === '\r') {
        this.term.write('\r\n');
        const line = this.currentInput;
        this.currentInput = '';
        this.submitLine(line);
        if (this.busy) return; // el resto del pegado se descarta mientras se ejecuta
      } else if (code === 127 || code === 8) {
        if (this.currentInput.length > 0) {
          this.currentInput = this.currentInput.slice(0, -1);
          this.term.write('\b \b');
        }
      } else if (code === 3) {
        // Ctrl+C: cancelar la entrada actual
        this.term.write('^C\r\n');
        this.currentInput = '';
        this.buffer = '';
        this.prompt();
      } else if (code === 12) {
        // Ctrl+L
        this.clearTerminal();
      } else if (code >= 32) {
        this.currentInput += ch;
        this.term.write(ch);
      }
    }
  }

  /** Autocompleta comandos internos, tablas, columnas y palabras clave SQL al pulsar Tab. */
  private autocompleteTerminalInput(): void {
    if (!this.term) return;
    const schema = this.sqlEngine.currentSchema();
    const tokenMatch = /([A-Za-z_\\][A-Za-z0-9_.]*)$/.exec(this.currentInput);
    const token = tokenMatch?.[1] ?? '';

    const pool: string[] = [];
    if (/\b(?:describe|\\d\+?)\s+[A-Za-z0-9_]*$/i.test(this.currentInput)) {
      pool.push(...schema.tables.map(t => t.name));
    } else if (/^\s*(?:use|\\c)\s+[A-Za-z0-9_]*$/i.test(this.currentInput)) {
      pool.push(...this.sqlEngine.projectDatabases().map(d => d.name));
    } else if (/\b(?:FROM|JOIN|UPDATE|INTO)\s+[A-Za-z0-9_]*$/i.test(this.currentInput)) {
      pool.push(...schema.tables.map(t => t.name), ...schema.views.map(v => v.name));
    } else {
      if (!this.buffer && !this.currentInput.includes(' ')) {
        pool.push(...TERMINAL_INTERNAL_COMMANDS);
      }
      pool.push(...schema.tables.map(t => t.name), ...schema.views.map(v => v.name));
      for (const table of schema.tables) {
        for (const col of table.columns) pool.push(col.name);
      }
      pool.push(...SINGLE_SQL_KEYWORDS);
    }

    const lowerToken = token.toLowerCase();
    const seen = new Set<string>();
    const matches: string[] = [];
    for (const candidate of pool) {
      const lower = candidate.toLowerCase();
      if (lower.startsWith(lowerToken) && !seen.has(lower)) {
        seen.add(lower);
        matches.push(candidate);
      }
    }
    if (matches.length === 0) return;

    if (matches.length === 1) {
      this.applyTerminalTokenCompletion(token, matches[0]);
      return;
    }

    // Buscar prefijo común más largo entre coincidencias
    let common = matches[0];
    for (let i = 1; i < matches.length; i++) {
      let len = 0;
      const maxLen = Math.min(common.length, matches[i].length);
      while (len < maxLen && common[len].toLowerCase() === matches[i][len].toLowerCase()) {
        len++;
      }
      common = common.slice(0, len);
    }

    if (common.length > token.length) {
      this.applyTerminalTokenCompletion(token, common);
      return;
    }

    // Múltiples candidatos sin prefijo más específico: mostrar sugerencias y restaurar prompt
    const shown = matches.slice(0, 20).join('  ') + (matches.length > 20 ? `  (+${matches.length - 20} más)` : '');
    this.term.write(`\r\n\x1b[90m${shown}\x1b[0m\r\n`);
    this.prompt();
    this.term.write(this.currentInput);
  }

  private applyTerminalTokenCompletion(token: string, completed: string): void {
    if (!this.term) return;
    if (token.length > 0) {
      this.term.write('\b \b'.repeat(token.length));
      this.currentInput = this.currentInput.slice(0, -token.length);
    }
    this.currentInput += completed;
    this.term.write(completed);
  }

  private historyPrev(): void {
    if (this.localHistory.length === 0) return;
    this.historyIndex = Math.max(0, this.historyIndex - 1);
    this.replaceInput(this.localHistory[this.historyIndex] ?? '');
  }

  private historyNext(): void {
    if (this.historyIndex < this.localHistory.length - 1) {
      this.historyIndex++;
      this.replaceInput(this.localHistory[this.historyIndex]);
    } else {
      this.historyIndex = this.localHistory.length;
      this.replaceInput('');
    }
  }

  private replaceInput(text: string): void {
    if (!this.term) return;
    this.term.write('\b \b'.repeat(this.currentInput.length));
    this.currentInput = text.replace(/\s*\n\s*/g, ' ');
    this.term.write(this.currentInput);
  }

  private submitLine(line: string): void {
    const trimmed = line.trim();

    // Comandos internos (solo al inicio de una sentencia)
    if (!this.buffer && trimmed && this.isInternalCommand(trimmed)) {
      this.pushHistory(trimmed);
      void this.runGuarded(() => this.runInternalCommand(trimmed));
      return;
    }

    this.buffer += (this.buffer ? '\n' : '') + line;
    if (!hasExecutableContent(this.buffer)) {
      if (!trimmed) this.buffer = '';
      this.prompt();
      return;
    }

    // Â¿La Ãºltima sentencia estÃ¡ terminada con `;`?
    const statements = splitSqlStatements(this.buffer);
    const last = statements[statements.length - 1];
    const complete = !!last && this.buffer.slice(last.end - 1, last.end) === ';';
    if (!complete) {
      this.prompt();
      return;
    }

    const sql = this.buffer;
    this.buffer = '';
    this.pushHistory(sql);
    void this.runGuarded(() => this.runSql(sql));
  }

  private pushHistory(entry: string): void {
    if (this.localHistory[this.localHistory.length - 1] !== entry) {
      this.localHistory.push(entry);
      if (this.localHistory.length > 200) this.localHistory.shift();
    }
    this.historyIndex = this.localHistory.length;
  }

  private async runGuarded(task: () => Promise<void>): Promise<void> {
    this.busy = true;
    try {
      await task();
    } catch (e: any) {
      this.term?.writeln(`\x1b[31mERROR: ${e?.message || e}\x1b[0m`);
    } finally {
      this.busy = false;
      this.prompt();
    }
  }

  private isInternalCommand(input: string): boolean {
    const lower = input.toLowerCase().replace(/;$/, '').trim();
    return (
      [
        'help',
        '\\?',
        'clear',
        '\\! clear',
        'version',
        'history',
        'databases',
        '\\l',
        'projects',
        'schemas',
        '\\dn',
        'tables',
        '\\dt',
        '\\dv',
        '\\df',
        'export',
        'import',
        '\\q',
        'exit',
        'quit'
      ].includes(lower) ||
      /^(describe|\\d\+?|\\c|use|export|import|project)\s+\S+/.test(lower)
    );
  }

  private async runInternalCommand(input: string): Promise<void> {
    const term = this.term!;
    const trimmed = input.trim();
    const noSemi = trimmed.replace(/;$/, '').trim();
    const lower = noSemi.toLowerCase();
    const parts = noSemi.split(/\s+/);
    const arg = parts[1]?.replace(/^"|"$/g, '');
    const restArg = noSemi.slice(parts[0].length).trim();

    if (lower === 'clear' || lower === '\\! clear') {
      term.clear();
      return;
    }
    if (lower === 'help' || lower === '\\?') return this.showHelp();
    if (lower === '\\q' || lower === 'exit' || lower === 'quit') {
      term.writeln('\x1b[90mEsta terminal vive en el navegador: no hay sesiÃ³n que cerrar. ðŸ˜‰\x1b[0m');
      return;
    }
    if (lower === 'version') {
      const mode = this.sqlEngine.inMemoryMode() ? 'memoria temporal' : 'IndexedDB local';
      term.writeln(`\x1b[36m${appEnvironment.name} v${appEnvironment.version} — Creado por Takizawa — ${this.sqlEngine.pgVersion()} (PGlite Wasm, ${mode}, 100% navegador)\x1b[0m`);
      return;
    }
    if (lower === 'history') {
      const history = await this.storageService.getHistory();
      term.writeln('\x1b[1;33m--- Ãšltimas consultas ---\x1b[0m');
      history.slice(0, 15).forEach((h, i) => {
        const q = h.query.replace(/\s+/g, ' ').slice(0, 100);
        term.writeln(` \x1b[90m${String(i + 1).padStart(2)}.\x1b[0m [${h.database}] ${q} ${h.success ? `\x1b[32m(${h.executionTimeMs} ms)` : '\x1b[31m(error)'}\x1b[0m`);
      });
      return;
    }
    if (lower === 'projects') {
      const activeId = this.sqlEngine.currentProjectId();
      const rows = this.sqlEngine.projects().map(p => ({
        id: p.id,
        proyecto: p.name + (p.id === activeId ? ' *' : ''),
        bases: p.databases.length,
        formato: `v${p.schemaVersion}`
      }));
      this.renderAsciiTable(
        { columns: [{ name: 'id' }, { name: 'proyecto' }, { name: 'bases' }, { name: 'formato' }], rows } as any,
        'proyectos'
      );
      return;
    }
    if (lower.startsWith('project ') && arg) {
      await this.sqlEngine.switchProject(arg);
      term.writeln(`\x1b[32mProyecto activo cambiado a "${this.sqlEngine.currentProject()?.name}".\x1b[0m`);
      return;
    }
    if (lower === 'schemas' || lower === '\\dn') {
      const rows = this.sqlEngine.currentSchema().schemas.map(s => ({ esquema: s }));
      this.renderAsciiTable({ columns: [{ name: 'esquema' }], rows } as any, 'esquemas');
      return;
    }
    if (lower === 'databases' || lower === '\\l') {
      const rows = this.sqlEngine.projectDatabases().map(d => ({
        nombre: d.name + (d.name === this.sqlEngine.currentDbName() ? ' *' : ''),
        tablas: d.tableCount ?? 0
      }));
      this.renderAsciiTable({ columns: [{ name: 'nombre' }, { name: 'tablas' }], rows } as any, 'bases de datos');
      return;
    }
    if (lower === 'tables' || lower === '\\dt') {
      const rows = this.sqlEngine.currentSchema().tables.map(t => ({
        esquema: t.schema,
        tabla: t.name,
        filas: t.rowCount,
        columnas: t.columns.length
      }));
      if (rows.length === 0) {
        term.writeln('\x1b[90mNo hay tablas en esta base de datos.\x1b[0m');
        return;
      }
      this.renderAsciiTable({ columns: [{ name: 'esquema' }, { name: 'tabla' }, { name: 'filas' }, { name: 'columnas' }], rows } as any, 'tablas');
      return;
    }
    if (lower === '\\dv') {
      const rows = this.sqlEngine.currentSchema().views.map(v => ({ esquema: v.schema, vista: v.name }));
      if (!rows.length) return void term.writeln('\x1b[90mNo hay vistas.\x1b[0m');
      this.renderAsciiTable({ columns: [{ name: 'esquema' }, { name: 'vista' }], rows } as any, 'vistas');
      return;
    }
    if (lower === '\\df') {
      const rows = this.sqlEngine.currentSchema().functions.map(f => ({
        esquema: f.schema,
        funcion: f.name,
        argumentos: f.argTypes,
        retorna: f.returnType
      }));
      if (!rows.length) return void term.writeln('\x1b[90mNo hay funciones.\x1b[0m');
      this.renderAsciiTable({ columns: [{ name: 'esquema' }, { name: 'funcion' }, { name: 'argumentos' }, { name: 'retorna' }], rows } as any, 'funciones');
      return;
    }
    if (lower === 'export' || lower.startsWith('export ')) {
      if (arg?.toLowerCase() === 'project') {
        const bundle = await this.sqlEngine.exportProjectBundle();
        const json = JSON.stringify(bundle, null, 2);
        this.triggerDownload(`${SqlEngineService.normalizeDbName(bundle.project.name) || 'proyecto'}.sqllab.json`, json, 'application/json;charset=utf-8;');
        term.writeln(`\x1b[32mâœ“ Proyecto "${bundle.project.name}" exportado (${bundle.databases.length} base(s), ${json.length} bytes).\x1b[0m`);
        return;
      }
      const dump = await this.sqlEngine.generateDump(arg || undefined);
      const dbLabel = arg || this.sqlEngine.currentDbName();
      this.triggerDownload(`${dbLabel}_export.sql`, dump, 'text/sql;charset=utf-8;');
      const lines = dump.split('\n');
      term.writeln(`\x1b[32mâœ“ Volcado SQL de "${dbLabel}" generado (${lines.length} lÃ­neas).\x1b[0m`);
      lines.slice(0, 18).forEach(l => term.writeln(`\x1b[90m${l}\x1b[0m`));
      if (lines.length > 18) term.writeln(`\x1b[90mâ€¦ (${lines.length - 18} lÃ­neas adicionales descargadas en ${dbLabel}_export.sql)\x1b[0m`);
      return;
    }
    if (lower === 'import' || lower.startsWith('import ')) {
      if (restArg) {
        await this.runSql(restArg.endsWith(';') ? restArg : `${restArg};`);
        return;
      }
      term.writeln('\x1b[36mAbriendo selector de archivo (.sql o .sqllab.json)...\x1b[0m');
      this.openImportPicker();
      return;
    }
    if (/^(describe|\\d\+?)\s+/.test(lower) && arg) {
      const target = arg.toLowerCase();
      const table = this.sqlEngine.currentSchema().tables.find(
        t => t.name.toLowerCase() === target || `${t.schema}.${t.name}`.toLowerCase() === target
      );
      if (!table) {
        term.writeln(`\x1b[31mError: la tabla '${arg}' no existe.\x1b[0m`);
        return;
      }
      term.writeln(`\x1b[1;36mTabla "${table.schema}.${table.name}"\x1b[0m  \x1b[90m(${table.rowCount} filas)\x1b[0m`);
      const rows = table.columns.map(c => ({
        columna: c.name,
        tipo: c.type,
        nulo: c.nullable ? 'sÃ­' : 'no',
        clave: c.isPrimaryKey ? 'PK' : c.isForeignKey ? `FK â†’ ${c.foreignKeyRef?.table}.${c.foreignKeyRef?.column}` : c.isUnique ? 'UNIQUE' : '',
        defecto: c.defaultValue ?? ''
      }));
      this.renderAsciiTable({ columns: ['columna', 'tipo', 'nulo', 'clave', 'defecto'].map(name => ({ name })), rows } as any, null);
      if (table.indexes.length) {
        term.writeln('\x1b[90mÃndices:\x1b[0m');
        for (const idx of table.indexes) {
          term.writeln(`   ${idx.name}${idx.isUnique ? ' \x1b[33mUNIQUE\x1b[0m' : ''} (${idx.columnNames.join(', ')})`);
        }
      }
      return;
    }
    if (/^(\\c|use)\s+/.test(lower) && arg) {
      await this.sqlEngine.switchDatabase(arg);
      term.writeln(`\x1b[32mAhora estÃ¡s conectado a la base de datos "${arg}".\x1b[0m`);
      return;
    }
  }

  private triggerDownload(filename: string, content: string, mime: string): void {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Ignorar si no hay DOM interactivo
    }
  }

  private openImportPicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sql,.json,.sqllab.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        void this.runGuarded(async () => {
          if (file.name.endsWith('.json')) {
            const proj = await this.sqlEngine.importProjectBundle(text);
            this.term?.writeln(`\x1b[32mâœ“ Proyecto "${proj.name}" importado desde ${file.name}.\x1b[0m`);
          } else {
            this.term?.writeln(`\x1b[36mEjecutando script ${file.name}...\x1b[0m`);
            await this.runSql(text);
          }
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private async runSql(sql: string): Promise<void> {
    const term = this.term!;
    if (!this.sqlEngine.isReady()) {
      term.writeln('\x1b[33mEl motor todavÃ­a se estÃ¡ iniciando, espera un momentoâ€¦\x1b[0m');
      return;
    }
    const result = await this.sqlEngine.executeQuery(sql);
    if (!result.success) {
      for (const line of (result.error || '').split('\n')) term.writeln(`\x1b[31m${line}\x1b[0m`);
    } else {
      if (result.dialectWarnings?.length) {
        for (const w of result.dialectWarnings) {
          term.writeln(`\x1b[33mâš  [${w.dialect}] ${w.construct}: ${w.suggestion}\x1b[0m`);
        }
      }
      if (result.columns.length > 0) {
        this.renderAsciiTable(result, 'filas');
      } else {
        const affected = result.affectedRows ? ` Â· ${result.affectedRows} ${result.affectedRows === 1 ? 'fila afectada' : 'filas afectadas'}` : '';
        term.writeln(`\x1b[32mâœ“ OK\x1b[0m\x1b[90m (${result.executionTimeMs} ms${affected})\x1b[0m`);
      }
    }
  }

  private renderAsciiTable(result: Pick<QueryResult, 'columns' | 'rows' | 'executionTimeMs'>, unit: string | null): void {
    const term = this.term!;
    const cols = result.columns.map(c => c.name);
    const keys = result.columns.map(c => c.key ?? c.name);
    const rows = result.rows.slice(0, MAX_RENDERED_ROWS);
    const cell = (v: unknown, type?: string) => {
      const s = v === null || v === undefined ? 'NULL' : formatCellValue(v, type).replace(/\s+/g, ' ');
      return s.length > MAX_CELL_WIDTH ? s.slice(0, MAX_CELL_WIDTH - 1) + 'â€¦' : s;
    };

    const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => cell(r[keys[i]], result.columns[i].type).length)));
    const sep = '+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+';

    term.writeln(sep);
    term.writeln('|' + cols.map((c, i) => ` \x1b[1;36m${c.padEnd(widths[i])}\x1b[0m `).join('|') + '|');
    term.writeln(sep);
    for (const r of rows) {
      term.writeln(
        '|' +
          cols
            .map((c, i) => {
              const v = r[keys[i]];
              const text = cell(v, result.columns[i].type);
              const color = v === null || v === undefined ? '\x1b[90m' : typeof v === 'number' || typeof v === 'bigint' ? '\x1b[35m' : typeof v === 'boolean' ? '\x1b[33m' : '';
              const padded = typeof v === 'number' || typeof v === 'bigint' ? text.padStart(widths[i]) : text.padEnd(widths[i]);
              return ` ${color}${padded}\x1b[0m `;
            })
            .join('|') +
          '|'
      );
    }
    term.writeln(sep);
    if (result.rows.length > MAX_RENDERED_ROWS) {
      term.writeln(`\x1b[33mâ€¦ se muestran ${MAX_RENDERED_ROWS} de ${result.rows.length} filas (usa la pestaÃ±a Resultados para ver todas)\x1b[0m`);
    }
    if (unit) {
      const n = result.rows.length;
      const label = unit === 'filas' ? (n === 1 ? 'fila' : 'filas') : unit;
      const time = result.executionTimeMs !== undefined ? ` en ${result.executionTimeMs} ms` : '';
      term.writeln(`\x1b[90m(${n} ${label}${time})\x1b[0m`);
    }
  }

  private showHelp(): void {
    const term = this.term!;
    const lines: [string, string][] = [
      ['help, \\?', 'Muestra esta ayuda'],
      ['clear, Ctrl+L', 'Limpia la pantalla'],
      ['projects', 'Lista todos los proyectos locales'],
      ['databases, \\l', 'Lista las bases de datos del proyecto activo'],
      ['schemas, \\dn', 'Lista los esquemas de la base activa'],
      ['\\c <db>, use <db>', 'Conecta con otra base de datos'],
      ['tables, \\dt', 'Lista las tablas'],
      ['\\dv, \\df', 'Lista vistas / funciones'],
      ['describe <t>, \\d <t>', 'Columnas, claves e Ã­ndices de la tabla <t>'],
      ['export [project]', 'Exporta volcado SQL (.sql) o proyecto (.sqllab.json)'],
      ['import [<SQL>]', 'Ejecuta SQL en lÃ­nea o abre archivo .sql/.sqllab.json'],
      ['history', 'Ãšltimas consultas ejecutadas'],
      ['version', 'VersiÃ³n de SQL LAB y PostgreSQL'],
      ['Ctrl+C', 'Cancela la entrada actual'],
      ['â†‘ / â†“', 'Navega por el historial de la sesiÃ³n']
    ];
    term.writeln('\x1b[1;33mComandos internos del laboratorio (no requieren ";"):\x1b[0m');
    for (const [cmd, desc] of lines) term.writeln(`  \x1b[36m${cmd.padEnd(22)}\x1b[0m ${desc}`);
    term.writeln('\x1b[1;32mSentencias SQL PostgreSQL reales:\x1b[0m');
    term.writeln('  \x1b[32m<SQL>;\x1b[0m                 Cualquier sentencia SQL terminada en ";" (SELECT, CREATE, INSERT...)');
  }

  clearTerminal(): void {
    if (!this.term) return;
    this.term.clear();
    this.currentInput = '';
    this.buffer = '';
    this.term.write('\x1b[2K\r');
    this.prompt();
  }
}
