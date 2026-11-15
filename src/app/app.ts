import { Component, HostListener, OnInit, effect, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavbarComponent, ActiveView } from './features/navbar/navbar.component';
import { SidebarComponent } from './features/sidebar/sidebar.component';
import { SqlEditorComponent } from './features/sql-editor/sql-editor.component';
import { ResultsGridComponent } from './features/results-grid/results-grid.component';
import { TerminalComponent } from './features/terminal/terminal.component';
import { ErDiagramComponent } from './features/er-diagram/er-diagram.component';
import { AcademyComponent } from './features/academy/academy.component';
import { ChallengesComponent } from './features/challenges/challenges.component';
import { HistoryComponent } from './features/history/history.component';
import { CompatibilityComponent } from './features/compatibility/compatibility.component';
import { SettingsModalComponent, SettingsTab } from './features/settings-modal/settings-modal.component';
import { TableStructureModalComponent } from './features/table-structure/table-structure-modal.component';
import { ToastComponent } from './shared/components/toast/toast.component';

import { SqlEngineService } from './core/services/sql-engine.service';
import { ThemeService } from './core/services/theme.service';
import { TabManagerService } from './core/services/tab-manager.service';
import { LayoutService } from './core/services/layout.service';
import { TableSchema } from './core/models/database.models';
import { qualifyTableName } from './core/utils/sql-utils';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NavbarComponent,
    SidebarComponent,
    SqlEditorComponent,
    ResultsGridComponent,
    TerminalComponent,
    ErDiagramComponent,
    AcademyComponent,
    ChallengesComponent,
    HistoryComponent,
    CompatibilityComponent,
    SettingsModalComponent,
    TableStructureModalComponent,
    ToastComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  activeView = signal<ActiveView>('editor');
  
  // Center bottom panel active tab
  centerBottomTab = signal<'results' | 'terminal' | 'history'>('results');

  // Right top panel active tab
  rightTopTab = signal<'diagram' | 'structure' | 'properties'>('diagram');

  // Mobile navigation active tab (used on viewports < md)
  mobileTab = signal<'editor' | 'bases' | 'terminal'>('editor');

  // Modals
  showSettingsModal = signal<boolean>(false);
  settingsModalTab = signal<SettingsTab>('storage');
  selectedTableForModal = signal<TableSchema | null>(null);

  // Inspector table
  inspectedTable = signal<TableSchema | null>(null);

  constructor(
    public sqlEngine: SqlEngineService,
    public themeService: ThemeService,
    public tabManager: TabManagerService,
    public layout: LayoutService
  ) {
    const msg = document.getElementById('app-loading-msg');
    if (msg) msg.innerText = 'Inicializando interfaz de usuario...';

    // Mantener el inspector lateral sincronizado con el esquema o cambio de base de datos
    effect(() => {
      const tables = this.sqlEngine.currentSchema().tables;
      untracked(() => {
        const current = this.inspectedTable();
        const match = current
          ? tables.find(t => t.schema === current.schema && t.name === current.name)
          : undefined;
        this.inspectedTable.set(match ?? tables[0] ?? null);
      });
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(e: KeyboardEvent): void {
    // Ctrl+B o Cmd+B: Alternar explorador lateral
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      this.layout.toggleSidebar();
    }
    // Ctrl+J o Cmd+J: Minimizar / restaurar panel inferior de resultados
    if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
      e.preventDefault();
      this.layout.toggleResultsMinimized();
    }
  }

  ngOnInit(): void {
    this.themeService.init();
    void this.tabManager.init();
    void this.sqlEngine.init();
  }

  handleViewChange(view: ActiveView): void {
    if (view === 'settings') {
      this.openSettings('storage');
      return;
    }
    this.activeView.set(view);
    if (view === 'editor') {
      this.mobileTab.set('editor');
    }
  }

  openMobilePane(pane: 'editor' | 'bases' | 'terminal'): void {
    this.activeView.set('editor');
    this.mobileTab.set(pane);
    if (pane === 'terminal') {
      this.centerBottomTab.set('terminal');
    }
  }

  openTableStructureModal(table: TableSchema): void {
    this.selectedTableForModal.set(table);
  }

  onTableSelected(table: TableSchema): void {
    this.inspectedTable.set(table);
    this.activeView.set('editor');
    this.mobileTab.set('editor');
    this.sqlEngine.executeQuery(`SELECT * FROM ${qualifyTableName(table.name, table.schema)} LIMIT 50;`);
    this.centerBottomTab.set('results');
  }

  onViewSelected(viewName: string): void {
    const dotIdx = viewName.indexOf('.');
    const qualified =
      dotIdx > 0
        ? qualifyTableName(viewName.slice(dotIdx + 1), viewName.slice(0, dotIdx))
        : qualifyTableName(viewName);
    this.activeView.set('editor');
    this.mobileTab.set('editor');
    this.sqlEngine.executeQuery(`SELECT * FROM ${qualified} LIMIT 50;`);
    this.centerBottomTab.set('results');
  }

  openSettings(tab: SettingsTab = 'storage'): void {
    this.settingsModalTab.set(tab);
    this.showSettingsModal.set(true);
  }

  navigateToAcademy(): void {
    this.activeView.set('academy');
  }

  navigateToChallenges(): void {
    this.activeView.set('challenges');
  }

  navigateToEditorWithQuery(sql: string): void {
    this.tabManager.loadSnippet(sql);
    this.activeView.set('editor');
    this.mobileTab.set('editor');
    this.centerBottomTab.set('results');
    void this.sqlEngine.executeQuery(sql);
  }

  quickSwitchDb(dbName: string): void {
    this.sqlEngine.switchDatabase(dbName);
  }
}
