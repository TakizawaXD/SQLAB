import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { SampleDatabasesService } from './core/services/sample-databases.service';
import { AcademyService } from './core/services/academy.service';
import { SqlEngineService } from './core/services/sql-engine.service';
import { TabManagerService } from './core/services/tab-manager.service';
import { LayoutService, STORAGE_KEYS } from './core/services/layout.service';
import {
  StorageService,
  DATA_RETENTION_DAYS,
  DATA_RETENTION_MS,
  WORKSPACE_CREATED_AT_KEY,
  isTimestampExpired
} from './core/services/storage.service';
import { analyzeSqlDialect } from './core/utils/sql-utils';
import {
  getContextualQuickChips,
  getInlineGhostSuggestion,
  getSqlCompletionItems
} from './core/utils/sql-autocomplete';
import type { DatabaseSchemaInfo } from './core/models/database.models';
import { NavbarComponent } from './features/navbar/navbar.component';

describe('SQL LAB Unit & Integration Tests', () => {
  beforeEach(async () => {
    try {
      localStorage.clear();
    } catch {}
    await TestBed.configureTestingModule({
      imports: [App, NavbarComponent]
    }).compileComponents();
  });

  afterEach(async () => {
    try {
      await TestBed.inject(SqlEngineService).shutdown();
    } catch {}
  });

  it('should create the main SQL LAB application component', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
    expect(app.activeView()).toBe('editor');
    fixture.detectChanges();
  });

  it('should manage collapsible panels (sidebar, right panel, footer, results) and persist to localStorage', () => {
    const layout = TestBed.inject(LayoutService);

    // Initial state defaults
    expect(layout.sidebarOpen()).toBe(true);
    expect(layout.rightPanelOpen()).toBe(true);
    expect(layout.footerOpen()).toBe(true);
    expect(layout.resultsMinimized()).toBe(false);

    // Toggle and persist sidebar
    layout.toggleSidebar();
    expect(layout.sidebarOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe('false');

    layout.toggleSidebar(true);
    expect(layout.sidebarOpen()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe('true');

    // Toggle and persist right panel
    layout.toggleRightPanel();
    expect(layout.rightPanelOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.RIGHT_PANEL_OPEN)).toBe('false');

    // Toggle and persist footer
    layout.toggleFooter();
    expect(layout.footerOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.FOOTER_OPEN)).toBe('false');

    // Toggle and persist results minimized
    layout.toggleResultsMinimized();
    expect(layout.resultsMinimized()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.RESULTS_MINIMIZED)).toBe('true');

    // Toggle project and storage sections
    layout.toggleProjectSection();
    expect(layout.projectSectionOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PROJECT_SECTION_OPEN)).toBe('false');

    layout.toggleStorageSection();
    expect(layout.storageSectionOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.STORAGE_SECTION_OPEN)).toBe('false');

    // Tree toggles
    layout.toggleDatabases();
    expect(layout.databasesOpen()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.TREE_DATABASES)).toBe('false');
  });

  it('should toggle sidebar on Ctrl+B and results minimized on Ctrl+J', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const layout = TestBed.inject(LayoutService);

    layout.toggleSidebar(true);
    expect(layout.sidebarOpen()).toBe(true);

    // Dispatch Ctrl+B
    const ctrlBEvent = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true });
    window.dispatchEvent(ctrlBEvent);
    expect(layout.sidebarOpen()).toBe(false);

    // Dispatch Ctrl+B again
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
    expect(layout.sidebarOpen()).toBe(true);

    // Dispatch Ctrl+J for results
    expect(layout.resultsMinimized()).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }));
    expect(layout.resultsMinimized()).toBe(true);
  });

  it('should provide all 8 demonstration databases', () => {
    const sampleService = TestBed.inject(SampleDatabasesService);
    const dbs = sampleService.getDatabases();
    expect(dbs.length).toBe(8);

    const ids = dbs.map(d => d.id);
    expect(ids).toContain('tienda_online');
    expect(ids).toContain('sistema_bancario');
    expect(ids).toContain('biblioteca');
    expect(ids).toContain('universidad');
    expect(ids).toContain('hospital');
    expect(ids).toContain('empleados');
    expect(ids).toContain('restaurante');
    expect(ids).toContain('red_social');
  });

  it('should provide all 18 structured academy categories and lessons', () => {
    const academyService = TestBed.inject(AcademyService);
    const lessons = academyService.lessons();
    expect(lessons.length).toBe(18);
    const categories = lessons.map(l => l.category);
    expect(categories).toContain('Introducción a bases de datos');
    expect(categories).toContain('Fundamentos de SQL');
    expect(categories).toContain('Creación de tablas');
    expect(categories).toContain('Tipos de datos');
    expect(categories).toContain('Claves primarias');
    expect(categories).toContain('Claves foráneas');
    expect(categories).toContain('Relaciones');
    expect(categories).toContain('Inserción de registros');
    expect(categories).toContain('Consultas SELECT');
    expect(categories).toContain('Filtros');
    expect(categories).toContain('JOIN');
    expect(categories).toContain('Funciones agregadas');
    expect(categories).toContain('Subconsultas');
    expect(categories).toContain('Normalización');
    expect(categories).toContain('Índices');
    expect(categories).toContain('Transacciones');
    expect(categories).toContain('Vistas');
    expect(categories).toContain('Funciones y triggers');
  });

  it('should provide DDL and DQL challenges across beginner, intermediate and advanced tiers', () => {
    const academyService = TestBed.inject(AcademyService);
    const challenges = academyService.challenges();
    expect(challenges.length).toBe(11);
    expect(challenges.some(c => c.validationType === 'ddl')).toBe(true);
    expect(challenges.some(c => c.difficulty === 'Principiante')).toBe(true);
    expect(challenges.some(c => c.difficulty === 'Intermedio')).toBe(true);
    expect(challenges.some(c => c.difficulty === 'Avanzado')).toBe(true);
  });

  it('should have storage quota reporting initialized', () => {
    const storageService = TestBed.inject(StorageService);
    const stats = storageService.storageStats();
    expect(stats.formattedUsed).toBeTruthy();
    expect(stats.formattedQuota).toBeTruthy();
  });

  it('should open settings modal when navigating to settings without blanking activeView', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app.showSettingsModal()).toBe(false);
    app.handleViewChange('settings');
    expect(app.showSettingsModal()).toBe(true);
    expect(app.activeView()).toBe('editor');
  });

  it('should run 100% locally without login prompts or Firebase auth', () => {
    const navFixture = TestBed.createComponent(NavbarComponent);
    navFixture.detectChanges();
    const text = (navFixture.nativeElement as HTMLElement).textContent || '';
    expect(text).not.toContain('Acceder');
    expect(text).not.toContain('Iniciar con Google');
    expect(text).toContain('Wasm Local');
  });

  it('should enforce 7-day maximum retention and purge expired databases, history, backups and projects', async () => {
    expect(DATA_RETENTION_DAYS).toBe(7);

    const now = Date.UTC(2026, 10, 14, 18, 0, 0);
    const recentIso = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const expiredIso = new Date(now - DATA_RETENTION_MS - 60_000).toISOString();

    expect(isTimestampExpired(recentIso, now)).toBe(false);
    expect(isTimestampExpired(expiredIso, now)).toBe(true);

    localStorage.setItem(WORKSPACE_CREATED_AT_KEY, new Date(now - 24 * 60 * 60 * 1000).toISOString());

    const storageService = TestBed.inject(StorageService);
    await storageService.init();

    await storageService.saveProject({
      id: 'proj_expired',
      name: 'Viejo',
      databases: [],
      schemaVersion: 2,
      createdAt: expiredIso,
      updatedAt: expiredIso
    });
    await storageService.saveProject({
      id: 'proj_recent',
      name: 'Reciente',
      databases: [],
      schemaVersion: 2,
      createdAt: recentIso,
      updatedAt: recentIso
    });

    await storageService.saveDatabaseInfo({ name: 'expired_db', projectId: 'proj_recent', tableCount: 1, createdAt: expiredIso });
    await storageService.saveDatabaseInfo({ name: 'recent_db', projectId: 'proj_recent', tableCount: 1, createdAt: recentIso });

    await storageService.saveHistoryItem({
      id: 'hist_expired',
      query: 'SELECT 1;',
      database: 'recent_db',
      timestamp: expiredIso,
      success: true,
      executionTimeMs: 1,
      rowCount: 1
    });
    await storageService.saveHistoryItem({
      id: 'hist_recent',
      query: 'SELECT 2;',
      database: 'recent_db',
      timestamp: recentIso,
      success: true,
      executionTimeMs: 1,
      rowCount: 1
    });

    await storageService.saveBackup({
      id: 'bk_expired',
      database: 'recent_db',
      timestamp: expiredIso,
      reason: 'Antiguo',
      sqlDump: 'SELECT 1;'
    });
    await storageService.saveBackup({
      id: 'bk_recent',
      database: 'recent_db',
      timestamp: recentIso,
      reason: 'Reciente',
      sqlDump: 'SELECT 2;'
    });

    const purgedDbNames = await storageService.purgeExpiredData(now);
    expect(purgedDbNames).toContain('expired_db');
    expect(purgedDbNames).not.toContain('recent_db');

    const remainingProjects = (await storageService.getProjects()).map(p => p.id);
    expect(remainingProjects).not.toContain('proj_expired');
    expect(remainingProjects).toContain('proj_recent');
    expect((await storageService.getDatabasesList()).map(d => d.name)).toEqual(['recent_db']);
    expect((await storageService.getHistory()).map(h => h.id)).toEqual(['hist_recent']);
    expect((await storageService.getBackups()).map(b => b.id)).toEqual(['bk_recent']);

    await storageService.resetAllTemporaryData();
  });

  it('should detect foreign SQL dialects accurately while ignoring comments and string literals', () => {
    const warnings = analyzeSqlDialect(`
      -- SHOW TABLES comentario que debe ignorarse
      SHOW TABLES;
      SELECT TOP 5 * FROM clientes;
      CREATE TABLE oracle_ex (codigo VARCHAR2(20), nota TEXT DEFAULT 'AUTO_INCREMENT');
    `);
    const dialects = warnings.map(w => w.dialect);
    expect(dialects).toContain('MySQL');
    expect(dialects).toContain('SQL Server');
    expect(dialects).toContain('Oracle');
    expect(warnings.some(w => w.construct === 'AUTO_INCREMENT')).toBe(false);
  });

  it('should execute real PostgreSQL DDL, DML, JOIN, PK/FK constraints, INDEX, VIEW and transactions in PGlite', async () => {
    const sqlEngine = TestBed.inject(SqlEngineService);
    await sqlEngine.init();
    await sqlEngine.createDatabase('test_real_pg');

    // Crear tablas relacionadas
    const ddl = await sqlEngine.executeQuery(`
      CREATE TABLE autores (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL
      );
      CREATE TABLE libros (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(150) NOT NULL,
        autor_id INTEGER NOT NULL REFERENCES autores(id),
        anio INTEGER CHECK (anio >= 1400)
      );
      CREATE INDEX idx_libros_autor ON libros(autor_id);
      CREATE VIEW vista_libros_autores AS
        SELECT l.id, l.titulo, a.nombre AS autor, l.anio
        FROM libros l
        JOIN autores a ON l.autor_id = a.id;
    `);
    expect(ddl.success).toBe(true);

    const schema = sqlEngine.currentSchema();
    expect(schema.tables.some(t => t.name === 'autores')).toBe(true);
    const librosTable = schema.tables.find(t => t.name === 'libros')!;
    expect(librosTable).toBeDefined();
    expect(librosTable.primaryKeys).toEqual(['id']);
    expect(librosTable.foreignKeys.some(fk => fk.sourceColumn === 'autor_id' && fk.targetTable === 'autores')).toBe(true);
    expect(librosTable.indexes.some(idx => idx.name.includes('idx_libros_autor'))).toBe(true);
    expect(schema.views.some(v => v.name === 'vista_libros_autores')).toBe(true);

    // INSERT + UPDATE + JOIN via View
    const insertOk = await sqlEngine.executeQuery(`
      INSERT INTO autores (id, nombre) VALUES (1, 'Gabriel García Márquez');
      INSERT INTO libros (id, titulo, autor_id, anio) VALUES (10, 'Cien años de soledad', 1, 1967);
    `);
    expect(insertOk.success).toBe(true);

    const joinRes = await sqlEngine.executeQuery(`SELECT titulo, autor, anio FROM vista_libros_autores;`);
    expect(joinRes.success).toBe(true);
    expect(joinRes.rows.length).toBe(1);
    expect(joinRes.rows[0]['autor']).toBe('Gabriel García Márquez');

    // Violación de clave foránea debe fallar en motor real
    const fkFail = await sqlEngine.executeQuery(`INSERT INTO libros (titulo, autor_id, anio) VALUES ('Huérfano', 999, 2020);`);
    expect(fkFail.success).toBe(false);
    expect(fkFail.error).toBeTruthy();

    // Transacciones: ROLLBACK revierte, COMMIT persiste
    await sqlEngine.executeQuery(`BEGIN; INSERT INTO autores (id, nombre) VALUES (2, 'Temporal'); ROLLBACK;`);
    const afterRollback = await sqlEngine.executeQuery(`SELECT COUNT(*)::INT AS c FROM autores;`);
    expect(afterRollback.rows[0]['c']).toBe(1);

    await sqlEngine.executeQuery(`BEGIN; INSERT INTO autores (id, nombre) VALUES (2, 'Isabel Allende'); COMMIT;`);
    const afterCommit = await sqlEngine.executeQuery(`SELECT COUNT(*)::INT AS c FROM autores;`);
    expect(afterCommit.rows[0]['c']).toBe(2);

    // ALTER TABLE + DROP TABLE
    await sqlEngine.addColumn('autores', 'pais', 'VARCHAR(60)');
    expect(sqlEngine.currentSchema().tables.find(t => t.name === 'autores')!.columns.some(c => c.name === 'pais')).toBe(true);
    await sqlEngine.renameColumn('autores', 'pais', 'nacionalidad');
    expect(sqlEngine.currentSchema().tables.find(t => t.name === 'autores')!.columns.some(c => c.name === 'nacionalidad')).toBe(true);

    // Errores de sintaxis y tabla inexistente
    const syntaxErr = await sqlEngine.executeQuery(`SELCT * FORM no_existe;`);
    expect(syntaxErr.success).toBe(false);
    const missingErr = await sqlEngine.executeQuery(`SELECT * FROM tabla_fantasma;`);
    expect(missingErr.success).toBe(false);

    // DROP VIEW y DROP TABLE actualizan esquema
    const dropRes = await sqlEngine.executeQuery(`DROP VIEW vista_libros_autores; DROP TABLE libros;`);
    expect(dropRes.success).toBe(true);
    expect(sqlEngine.currentSchema().tables.some(t => t.name === 'libros')).toBe(false);
  }, 120000);

  it('should isolate projects, export/import .sqllab.json bundles and reject corrupt bundles', async () => {
    const sqlEngine = TestBed.inject(SqlEngineService);
    await sqlEngine.init();

    const pA = await sqlEngine.createProject('Proyecto Alpha');
    await sqlEngine.executeQuery(`CREATE TABLE secret_a (id SERIAL PRIMARY KEY, nota TEXT);`);
    expect(sqlEngine.currentSchema().tables.some(t => t.name === 'secret_a')).toBe(true);

    const bundle = await sqlEngine.exportProjectBundle(pA.id);
    const pB = await sqlEngine.createProject('Proyecto Beta');
    expect(pB.id).not.toBe(pA.id);
    expect(sqlEngine.currentSchema().tables.some(t => t.name === 'secret_a')).toBe(false);

    const rawBundle = typeof bundle === 'string' ? bundle : JSON.stringify(bundle);
    const imported = await sqlEngine.importProjectBundle(rawBundle);
    expect(imported.id).not.toBe(pA.id);
    expect(sqlEngine.currentSchema().tables.some(t => t.name === 'secret_a')).toBe(true);

    await expect(sqlEngine.importProjectBundle('{ corrupto ')).rejects.toThrow();
    await expect(sqlEngine.importProjectBundle('{"version": 1}')).rejects.toThrow();
  }, 120000);

  it('should validate DDL challenges in an isolated sandbox without modifying the user database', async () => {
    const sqlEngine = TestBed.inject(SqlEngineService);
    const academyService = TestBed.inject(AcademyService);
    await sqlEngine.init();
    await sqlEngine.createDatabase('user_personal_db');
    await sqlEngine.executeQuery(`CREATE TABLE mi_tabla_personal (id INTEGER PRIMARY KEY);`);

    const ddlChallenge = academyService.challenges().find(c => c.id === 'ch_ddl_clientes')!;
    expect(ddlChallenge).toBeDefined();

    // Falla descriptiva si falta columna edad
    const failRes = await academyService.validateChallenge(
      ddlChallenge,
      `CREATE TABLE clientes (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, correo VARCHAR(150));`
    );
    expect(failRes.passed).toBe(false);
    expect(failRes.message).toContain('edad');

    // Aprobación verificada por catálogo real de PostgreSQL
    const passRes = await academyService.validateChallenge(
      ddlChallenge,
      `CREATE TABLE clientes (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL, correo VARCHAR(150), edad INTEGER);`
    );
    expect(passRes.passed).toBe(true);
    expect(passRes.pointsAwarded).toBe(100);

    // Verificar aislamiento total: la base personal del usuario permanece intacta y sin 'clientes'
    expect(sqlEngine.currentDbName()).toBe('user_personal_db');
    expect(sqlEngine.currentSchema().tables.some(t => t.name === 'mi_tabla_personal')).toBe(true);
    expect(sqlEngine.currentSchema().tables.some(t => t.name === 'clientes')).toBe(false);
  }, 120000);

  it('should start completely blank on first launch with an empty database and empty editor tab', async () => {
    const storage = TestBed.inject(StorageService);
    await storage.init();
    await storage.resetAllTemporaryData();

    const sqlEngine = TestBed.inject(SqlEngineService);
    const tabManager = TestBed.inject(TabManagerService);

    await tabManager.init();
    await sqlEngine.init();

    expect(sqlEngine.currentProject()?.name).toBe('Proyecto Principal');
    expect(sqlEngine.currentDbName()).toBe('principal');
    expect(sqlEngine.projectDatabases().map(d => d.name)).toEqual(['principal']);
    expect(sqlEngine.currentSchema().tables.length).toBe(0);
    expect(sqlEngine.currentSchema().views.length).toBe(0);
    expect(sqlEngine.lastResult()).toBeNull();
    expect(tabManager.activeTab()?.title).toBe('consulta.sql');
    expect(tabManager.activeTab()?.content).toBe('');

    // Cargar una base de ejemplo explícitamente bajo demanda sigue funcionando
    await sqlEngine.switchDatabase('tienda_online');
    expect(sqlEngine.currentDbName()).toBe('tienda_online');
    expect(sqlEngine.currentSchema().tables.length).toBeGreaterThan(0);
  }, 120000);

  it('should provide context-aware SQL completions, inline ghost text and quick chips for blank and populated schemas', () => {
    const emptySchema: DatabaseSchemaInfo = {
      schemas: ['public'],
      tables: [],
      views: [],
      functions: [],
      triggers: [],
      sequences: []
    };

    // 1. Base en blanco: chips iniciales disponibles y sin duplicar CREATE tras "CREATE "
    const startChips = getContextualQuickChips('', '', emptySchema);
    expect(startChips.chips.length).toBeGreaterThan(0);
    expect(startChips.chips.some(c => c.insertText.includes('CREATE TABLE'))).toBe(true);

    const afterCreate = getSqlCompletionItems('CREATE ', 'CREATE ', '', emptySchema);
    expect(afterCreate.some(item => item.label === 'TABLE' && item.insertText.trim() === 'TABLE')).toBe(true);
    expect(afterCreate.every(item => !/^CREATE\b/i.test(item.insertText))).toBe(true);

    // 2. Dentro de CREATE TABLE (...): priorizar tipos PostgreSQL
    const colTypes = getSqlCompletionItems('CREATE TABLE usuarios (\n  id ', '  id ', '', emptySchema);
    expect(colTypes[0].sortText.startsWith('00_')).toBe(true);
    expect(colTypes.some(item => item.kind === 'type' && item.label === 'SERIAL PRIMARY KEY')).toBe(true);
    expect(colTypes.some(item => item.kind === 'type' && item.label === 'INTEGER')).toBe(true);

    // 3. Base con tablas y FK: FROM prioriza tablas y alias u. sugiere columnas reales
    const populatedSchema: DatabaseSchemaInfo = {
      schemas: ['public'],
      tables: [
        {
          schema: 'public',
          name: 'usuarios',
          rowCount: 3,
          primaryKeys: ['id'],
          foreignKeys: [],
          indexes: [],
          columns: [
            { name: 'id', type: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false },
            { name: 'nombre', type: 'character varying', nullable: false, defaultValue: null, isPrimaryKey: false, isForeignKey: false },
            { name: 'correo', type: 'character varying', nullable: true, defaultValue: null, isPrimaryKey: false, isForeignKey: false }
          ]
        },
        {
          schema: 'public',
          name: 'pedidos',
          rowCount: 5,
          primaryKeys: ['id'],
          foreignKeys: [
            {
              constraintName: 'fk_pedidos_usuario',
              sourceTable: 'pedidos',
              sourceColumn: 'usuario_id',
              targetTable: 'usuarios',
              targetColumn: 'id'
            }
          ],
          indexes: [],
          columns: [
            { name: 'id', type: 'integer', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false },
            {
              name: 'usuario_id',
              type: 'integer',
              nullable: false,
              defaultValue: null,
              isPrimaryKey: false,
              isForeignKey: true,
              foreignKeyRef: { table: 'usuarios', column: 'id' }
            }
          ]
        }
      ],
      views: [],
      functions: [],
      triggers: [],
      sequences: []
    };

    const fromItems = getSqlCompletionItems('SELECT * FROM ', 'SELECT * FROM ', '', populatedSchema);
    const firstTableItem = fromItems.find(item => item.kind === 'table' && item.label === 'usuarios');
    expect(firstTableItem).toBeDefined();
    expect(firstTableItem!.sortText.startsWith('00_')).toBe(true);

    const sqlWithAlias = 'SELECT u. FROM usuarios u';
    const aliasCursorOffset = 'SELECT u.'.length;
    const dotItems = getSqlCompletionItems(sqlWithAlias, 'SELECT u.', '', populatedSchema, aliasCursorOffset);
    expect(dotItems.some(item => item.kind === 'column' && item.label === 'nombre')).toBe(true);
    expect(dotItems.some(item => item.kind === 'column' && item.label === 'correo')).toBe(true);

    const joinOnItems = getSqlCompletionItems(
      'SELECT * FROM pedidos p JOIN usuarios u ON ',
      'JOIN usuarios u ON ',
      '',
      populatedSchema
    );
    expect(joinOnItems.some(item => item.insertText.includes('p.usuario_id = u.id'))).toBe(true);

    // 4. Autocompletado fantasma inline
    expect(getInlineGhostSuggestion('', '', '', emptySchema)).toContain('CREATE TABLE usuarios');
    expect(getInlineGhostSuggestion('SEL', 'SEL', '', populatedSchema)).toContain('FROM usuarios');
    expect(getInlineGhostSuggestion('SELECT * FROM ', 'SELECT * FROM ', '', populatedSchema)).toBe('usuarios LIMIT 50;');
    expect(getInlineGhostSuggestion('SELECT u.', 'SELECT u.', '', populatedSchema)).toBeNull();
    expect(getInlineGhostSuggestion('SELECT u.n\nFROM usuarios u', 'SELECT u.n', '', populatedSchema)).toBe('ombre');
    expect(getInlineGhostSuggestion('SELECT u.n FROM usuarios u', 'SELECT u.n', ' FROM usuarios u', populatedSchema)).toBeNull();
  });
});
