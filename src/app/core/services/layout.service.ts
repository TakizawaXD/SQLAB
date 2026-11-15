import { Injectable, signal } from '@angular/core';

export const STORAGE_KEYS = {
  SIDEBAR_OPEN: 'sqllab_sidebar_open',
  RIGHT_PANEL_OPEN: 'sqllab_right_panel_open',
  FOOTER_OPEN: 'sqllab_footer_open',
  RESULTS_MINIMIZED: 'sqllab_results_minimized',
  PROJECT_SECTION_OPEN: 'sqllab_project_section_open',
  STORAGE_SECTION_OPEN: 'sqllab_storage_section_open',
  TREE_DATABASES: 'sqllab_tree_databases',
  TREE_SCHEMAS: 'sqllab_tree_schemas',
  TREE_TABLES: 'sqllab_tree_tables',
  TREE_VIEWS: 'sqllab_tree_views',
  TREE_INDEXES: 'sqllab_tree_indexes',
  TREE_SEQUENCES: 'sqllab_tree_sequences',
  TREE_FUNCS: 'sqllab_tree_funcs',
  TREE_TRIGGERS: 'sqllab_tree_triggers'
} as const;

/**
 * Servicio centralizado para gestionar el despliegue, repliegue (guardado)
 * y persistencia en localStorage de los paneles de SQL LAB.
 */
@Injectable({
  providedIn: 'root'
})
export class LayoutService {
  // Paneles principales del IDE
  readonly sidebarOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.SIDEBAR_OPEN, true));
  readonly rightPanelOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.RIGHT_PANEL_OPEN, true));
  readonly footerOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.FOOTER_OPEN, true));
  readonly resultsMinimized = signal<boolean>(this.loadBool(STORAGE_KEYS.RESULTS_MINIMIZED, false));

  // Secciones internas del explorador lateral
  readonly projectSectionOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.PROJECT_SECTION_OPEN, true));
  readonly storageSectionOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.STORAGE_SECTION_OPEN, true));

  // Categorías del árbol de bases de datos y esquemas
  readonly databasesOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_DATABASES, true));
  readonly schemasOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_SCHEMAS, true));
  readonly tablesOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_TABLES, true));
  readonly viewsOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_VIEWS, false));
  readonly indexesOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_INDEXES, false));
  readonly sequencesOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_SEQUENCES, false));
  readonly funcsOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_FUNCS, false));
  readonly triggersOpen = signal<boolean>(this.loadBool(STORAGE_KEYS.TREE_TRIGGERS, false));

  toggleSidebar(force?: boolean): void {
    const next = force !== undefined ? force : !this.sidebarOpen();
    this.sidebarOpen.set(next);
    this.saveBool(STORAGE_KEYS.SIDEBAR_OPEN, next);
  }

  toggleRightPanel(force?: boolean): void {
    const next = force !== undefined ? force : !this.rightPanelOpen();
    this.rightPanelOpen.set(next);
    this.saveBool(STORAGE_KEYS.RIGHT_PANEL_OPEN, next);
  }

  toggleFooter(force?: boolean): void {
    const next = force !== undefined ? force : !this.footerOpen();
    this.footerOpen.set(next);
    this.saveBool(STORAGE_KEYS.FOOTER_OPEN, next);
  }

  toggleResultsMinimized(force?: boolean): void {
    const next = force !== undefined ? force : !this.resultsMinimized();
    this.resultsMinimized.set(next);
    this.saveBool(STORAGE_KEYS.RESULTS_MINIMIZED, next);
  }

  toggleProjectSection(force?: boolean): void {
    const next = force !== undefined ? force : !this.projectSectionOpen();
    this.projectSectionOpen.set(next);
    this.saveBool(STORAGE_KEYS.PROJECT_SECTION_OPEN, next);
  }

  toggleStorageSection(force?: boolean): void {
    const next = force !== undefined ? force : !this.storageSectionOpen();
    this.storageSectionOpen.set(next);
    this.saveBool(STORAGE_KEYS.STORAGE_SECTION_OPEN, next);
  }

  toggleDatabases(): void {
    const next = !this.databasesOpen();
    this.databasesOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_DATABASES, next);
  }

  toggleSchemas(): void {
    const next = !this.schemasOpen();
    this.schemasOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_SCHEMAS, next);
  }

  toggleTables(): void {
    const next = !this.tablesOpen();
    this.tablesOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_TABLES, next);
  }

  toggleViews(): void {
    const next = !this.viewsOpen();
    this.viewsOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_VIEWS, next);
  }

  toggleIndexes(): void {
    const next = !this.indexesOpen();
    this.indexesOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_INDEXES, next);
  }

  toggleSequences(): void {
    const next = !this.sequencesOpen();
    this.sequencesOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_SEQUENCES, next);
  }

  toggleFuncs(): void {
    const next = !this.funcsOpen();
    this.funcsOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_FUNCS, next);
  }

  toggleTriggers(): void {
    const next = !this.triggersOpen();
    this.triggersOpen.set(next);
    this.saveBool(STORAGE_KEYS.TREE_TRIGGERS, next);
  }

  private loadBool(key: string, defaultVal: boolean): boolean {
    try {
      if (typeof localStorage === 'undefined') return defaultVal;
      const val = localStorage.getItem(key);
      return val !== null ? val === 'true' : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  private saveBool(key: string, val: boolean): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(val));
      }
    } catch {}
  }
}
