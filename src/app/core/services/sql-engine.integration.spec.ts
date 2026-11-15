/**
 * Pruebas de integración del motor de SQL LAB contra PostgreSQL real (PGlite) y
 * persistencia real en IndexedDB (fake-indexeddb en Node). No hay datos simulados:
 * cada aserción comprueba lo que devuelve el motor.
 */
import { SqlEngineService } from './sql-engine.service';
import { StorageService } from './storage.service';
import { SampleDatabasesService } from './sample-databases.service';
import { QueryResult } from '../models/database.models';

const T = 180_000;

function newEngine(): { engine: SqlEngineService; storage: StorageService } {
  const storage = new StorageService();
  const engine = new SqlEngineService(storage, new SampleDatabasesService());
  return { engine, storage };
}

async function ok(engine: SqlEngineService, sql: string): Promise<QueryResult> {
  const res = await engine.executeQuery(sql, { recordHistory: false });
  if (!res.success) throw new Error(`Falló "${sql}": ${res.error}`);
  return res;
}

function cell(res: QueryResult, row: number, col: string): any {
  const c = res.columns.find(x => x.name === col);
  return res.rows[row][c?.key ?? col];
}

describe('Motor SQL LAB (PGlite real + IndexedDB)', () => {
  let engine: SqlEngineService;
  let projectId = '';
  let dbName = '';

  beforeAll(async () => {
    ({ engine } = newEngine());
    await engine.init();
    expect(engine.state()).toBe('ready');
  }, T);

  afterAll(async () => {
    await engine?.shutdown();
  }, T);

  it('el motor es PostgreSQL real', async () => {
    const res = await ok(engine, 'SELECT version() AS v');
    expect(String(cell(res, 0, 'v'))).toContain('PostgreSQL');
  }, T);

  it('1-2. crea un proyecto y una base de datos aislada', async () => {
    const project = await engine.createProject('Proyecto Pruebas');
    projectId = project.id;
    expect(engine.currentProjectId()).toBe(projectId);
    dbName = await engine.createDatabase('pruebas_integracion');
    expect(engine.currentDbName()).toBe(dbName);
    expect(engine.projectDatabases().map(d => d.name)).toContain(dbName);
    // Base de datos vacía: sin tablas
    expect(engine.currentSchema().tables.filter(t => t.name === 'usuarios')).toHaveLength(0);
  }, T);

  it('3. CREATE TABLE aparece en el explorador con columnas, tipos y PK', async () => {
    await ok(engine, `CREATE TABLE usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) UNIQUE,
      edad INTEGER
    );`);
    const t = engine.currentSchema().tables.find(x => x.name === 'usuarios')!;
    expect(t).toBeTruthy();
    expect(t.columns.map(c => c.name)).toEqual(['id', 'nombre', 'correo', 'edad']);
    expect(t.primaryKeys).toEqual(['id']);
    expect(t.columns.find(c => c.name === 'nombre')!.type).toBe('VARCHAR(100)');
    expect(t.columns.find(c => c.name === 'nombre')!.nullable).toBe(false);
    expect(t.columns.find(c => c.name === 'correo')!.isUnique).toBe(true);
    expect(t.rowCount).toBe(0);
  }, T);

  it('4-5. INSERT y SELECT devuelven los datos reales y actualizan el contador', async () => {
    const ins = await ok(engine, `INSERT INTO usuarios (nombre, correo, edad) VALUES
      ('Daniel', 'daniel@email.com', 22), ('Ana', 'ana@email.com', 30);`);
    expect(ins.affectedRows).toBe(2);
    const sel = await ok(engine, 'SELECT id, nombre, edad FROM usuarios ORDER BY id');
    expect(sel.rowCount).toBe(2);
    expect(cell(sel, 0, 'nombre')).toBe('Daniel');
    expect(cell(sel, 1, 'edad')).toBe(30);
    expect(engine.currentSchema().tables.find(x => x.name === 'usuarios')!.rowCount).toBe(2);
  }, T);

  it('6. UPDATE modifica el registro', async () => {
    const up = await ok(engine, 'UPDATE usuarios SET edad = 23 WHERE id = 1;');
    expect(up.affectedRows).toBe(1);
    const sel = await ok(engine, 'SELECT edad FROM usuarios WHERE id = 1');
    expect(cell(sel, 0, 'edad')).toBe(23);
  }, T);

  it('7. DELETE elimina el registro', async () => {
    await ok(engine, `INSERT INTO usuarios (nombre, correo, edad) VALUES ('Temporal', 'tmp@email.com', 1);`);
    const del = await ok(engine, `DELETE FROM usuarios WHERE correo = 'tmp@email.com';`);
    expect(del.affectedRows).toBe(1);
    expect(engine.currentSchema().tables.find(x => x.name === 'usuarios')!.rowCount).toBe(2);
  }, T);

  it('8. la clave primaria impide duplicados (SQLSTATE 23505)', async () => {
    const res = await engine.executeQuery(`INSERT INTO usuarios (id, nombre) VALUES (1, 'Duplicado');`, { recordHistory: false });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('23505');
  }, T);

  it('9. la clave foránea se refleja en el esquema y se hace cumplir (23503)', async () => {
    await ok(engine, `CREATE TABLE pedidos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      total NUMERIC(10,2) CHECK (total >= 0)
    );`);
    const t = engine.currentSchema().tables.find(x => x.name === 'pedidos')!;
    expect(t.foreignKeys[0].targetTable).toBe('usuarios');
    expect(t.columns.find(c => c.name === 'usuario_id')!.isForeignKey).toBe(true);
    expect(t.constraints!.some(c => c.type === 'CHECK')).toBe(true);
    const bad = await engine.executeQuery('INSERT INTO pedidos (usuario_id, total) VALUES (999, 10);', { recordHistory: false });
    expect(bad.errorCode).toBe('23503');
    const neg = await engine.executeQuery('INSERT INTO pedidos (usuario_id, total) VALUES (1, -5);', { recordHistory: false });
    expect(neg.errorCode).toBe('23514');
  }, T);

  it('10. JOIN conserva columnas con el mismo nombre', async () => {
    await ok(engine, 'INSERT INTO pedidos (usuario_id, total) VALUES (1, 99.50), (2, 10);');
    const res = await ok(engine, 'SELECT u.id, p.id, u.nombre, p.total FROM usuarios u JOIN pedidos p ON p.usuario_id = u.id ORDER BY p.id');
    expect(res.columns.map(c => c.name)).toEqual(['id', 'id', 'nombre', 'total']);
    expect(new Set(res.columns.map(c => c.key)).size).toBe(4);
    const [k0, k1] = res.columns.map(c => c.key!);
    expect(res.rows[0][k0]).toBe(1); // u.id
    // Los INSERT rechazados por FK/CHECK consumieron valores de la secuencia: p.id empieza en 3
    expect(res.rows[0][k1]).toBe(3); // p.id
    expect(res.rows[1][k0]).toBe(2);
    expect(res.rows[1][k1]).toBe(4);
    const left = await ok(engine, 'SELECT u.nombre, p.id FROM usuarios u LEFT JOIN pedidos p ON p.usuario_id = u.id');
    expect(left.rowCount).toBe(2);
  }, T);

  it('11. CREATE INDEX aparece en el esquema', async () => {
    await ok(engine, 'CREATE INDEX idx_usuarios_edad ON usuarios(edad);');
    const t = engine.currentSchema().tables.find(x => x.name === 'usuarios')!;
    expect(t.indexes.map(i => i.name)).toContain('idx_usuarios_edad');
  }, T);

  it('12. CREATE VIEW aparece y se puede consultar', async () => {
    await ok(engine, `CREATE VIEW v_mayores AS SELECT nombre FROM usuarios WHERE edad >= 25;`);
    expect(engine.currentSchema().views.map(v => v.name)).toContain('v_mayores');
    const res = await ok(engine, 'SELECT * FROM v_mayores');
    expect(res.rowCount).toBe(1);
    expect(cell(res, 0, 'nombre')).toBe('Ana');
  }, T);

  it('13. transacción con COMMIT persiste los cambios', async () => {
    await ok(engine, `BEGIN; UPDATE usuarios SET edad = 40 WHERE id = 2; COMMIT;`);
    const res = await ok(engine, 'SELECT edad FROM usuarios WHERE id = 2');
    expect(cell(res, 0, 'edad')).toBe(40);
  }, T);

  it('14. ROLLBACK y SAVEPOINT deshacen los cambios', async () => {
    await ok(engine, `BEGIN; DELETE FROM pedidos; ROLLBACK;`);
    const res = await ok(engine, 'SELECT count(*)::int AS n FROM pedidos');
    expect(cell(res, 0, 'n')).toBe(2);
    await ok(engine, `BEGIN; INSERT INTO pedidos (usuario_id, total) VALUES (1, 1); SAVEPOINT s1;
      INSERT INTO pedidos (usuario_id, total) VALUES (1, 2); ROLLBACK TO SAVEPOINT s1; COMMIT;`);
    const after = await ok(engine, 'SELECT count(*)::int AS n FROM pedidos');
    expect(cell(after, 0, 'n')).toBe(3);
  }, T);

  it('15. ALTER TABLE se refleja en el explorador', async () => {
    await ok(engine, 'ALTER TABLE usuarios ADD COLUMN activo BOOLEAN DEFAULT TRUE;');
    let t = engine.currentSchema().tables.find(x => x.name === 'usuarios')!;
    expect(t.columns.map(c => c.name)).toContain('activo');
    await ok(engine, 'ALTER TABLE usuarios RENAME COLUMN activo TO habilitado;');
    t = engine.currentSchema().tables.find(x => x.name === 'usuarios')!;
    expect(t.columns.map(c => c.name)).toContain('habilitado');
    expect(t.columns.map(c => c.name)).not.toContain('activo');
  }, T);

  it('funciones, triggers, CTE, ventanas y JSONB se ejecutan en el motor', async () => {
    await ok(engine, `CREATE TABLE auditoria (id SERIAL PRIMARY KEY, nota TEXT);
      CREATE FUNCTION fn_auditar() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO auditoria(nota) VALUES ('nuevo usuario ' || NEW.nombre); RETURN NEW; END $$;
      CREATE TRIGGER trg_auditar AFTER INSERT ON usuarios FOR EACH ROW EXECUTE FUNCTION fn_auditar();`);
    expect(engine.currentSchema().functions.map(f => f.name)).toContain('fn_auditar');
    expect(engine.currentSchema().triggers.map(t => t.name)).toContain('trg_auditar');
    await ok(engine, `INSERT INTO usuarios (nombre, correo, edad) VALUES ('Luis', 'luis@email.com', 35);`);
    const aud = await ok(engine, 'SELECT nota FROM auditoria');
    expect(cell(aud, 0, 'nota')).toBe('nuevo usuario Luis');
    const cte = await ok(engine, `WITH r AS (SELECT nombre, edad, rank() OVER (ORDER BY edad DESC) AS pos FROM usuarios)
      SELECT nombre FROM r WHERE pos = 1`);
    expect(cell(cte, 0, 'nombre')).toBe('Ana');
    const js = await ok(engine, `SELECT '{"a":{"b":7}}'::jsonb #>> '{a,b}' AS v`);
    expect(cell(js, 0, 'v')).toBe('7');
  }, T);

  it('errores reales: sintaxis (42601, con posición) y tabla inexistente (42P01)', async () => {
    const syn = await engine.executeQuery('SELEC * FROM usuarios', { recordHistory: false });
    expect(syn.success).toBe(false);
    expect(syn.errorCode).toBe('42601');
    expect(syn.errorPosition).toBe(1);
    const missing = await engine.executeQuery('SELECT * FROM no_existe', { recordHistory: false });
    expect(missing.errorCode).toBe('42P01');
    // Tras un error, el motor sigue operativo
    await ok(engine, 'SELECT 1');
  }, T);

  it('detecta sintaxis de otros dialectos que PostgreSQL rechaza', async () => {
    const res = await engine.executeQuery('CREATE TABLE m (id INT AUTO_INCREMENT PRIMARY KEY);', { recordHistory: false });
    expect(res.success).toBe(false);
    expect(res.dialectWarnings?.some(w => w.dialect === 'MySQL')).toBe(true);
  }, T);

  it('16. DROP TABLE la elimina del explorador (con respaldo automático previo)', async () => {
    await ok(engine, 'CREATE TABLE temporal (x INT);');
    expect(engine.currentSchema().tables.some(t => t.name === 'temporal')).toBe(true);
    await ok(engine, 'DROP TABLE temporal;');
    expect(engine.currentSchema().tables.some(t => t.name === 'temporal')).toBe(false);
  }, T);

  it('volcado y restauración reproducen la base (multiesquema)', async () => {
    await ok(engine, `CREATE SCHEMA ventas; CREATE TABLE ventas.facturas (id SERIAL PRIMARY KEY, monto NUMERIC);
      INSERT INTO ventas.facturas (monto) VALUES (10), (20);`);
    const dump = await engine.generateDump();
    expect(dump).toContain('ventas');
    await ok(engine, 'DELETE FROM ventas.facturas; DROP VIEW v_mayores;');
    await engine.restoreDump(dbName, dump);
    const res = await ok(engine, 'SELECT count(*)::int AS n FROM ventas.facturas');
    expect(cell(res, 0, 'n')).toBe(2);
    expect(engine.currentSchema().views.map(v => v.name)).toContain('v_mayores');
    // La secuencia continúa donde estaba
    const next = await ok(engine, 'INSERT INTO ventas.facturas (monto) VALUES (30) RETURNING id');
    expect(cell(next, 0, 'id')).toBe(3);
  }, T);

  it('17. cambiar de proyecto aísla las bases de datos', async () => {
    const other = await engine.createProject('Otro Proyecto');
    expect(engine.currentProjectId()).toBe(other.id);
    expect(engine.projectDatabases().some(d => d.name === dbName)).toBe(false);
    expect(engine.currentSchema().tables.some(t => t.name === 'usuarios')).toBe(false);
    await engine.switchProject(projectId);
    await engine.switchDatabase(dbName);
    expect(engine.currentSchema().tables.some(t => t.name === 'usuarios')).toBe(true);
  }, T);

  it('20. exporta e importa un proyecto con sus datos', async () => {
    const bundle = await engine.exportProjectBundle(projectId);
    expect(bundle.format).toBe('sqllab-project');
    const imported = await engine.importProjectBundle(JSON.stringify(bundle));
    expect(engine.currentProjectId()).toBe(imported.id);
    const importedDb = engine.projectDatabases().find(d => d.name.startsWith('pruebas_integracion'))!;
    await engine.switchDatabase(importedDb.name);
    const res = await ok(engine, 'SELECT count(*)::int AS n FROM usuarios');
    expect(cell(res, 0, 'n')).toBe(3);
    // El dato importado es independiente del original
    await ok(engine, 'DELETE FROM pedidos;');
    await engine.switchProject(projectId);
    await engine.switchDatabase(dbName);
    const original = await ok(engine, 'SELECT count(*)::int AS n FROM pedidos');
    expect(cell(original, 0, 'n')).toBe(3);
  }, T);

  it('rechaza importaciones corruptas o de versión desconocida sin dejar restos', async () => {
    const before = engine.databases().length;
    await expect(engine.importProjectBundle('{ esto no es json')).rejects.toThrow(/JSON/);
    await expect(engine.importProjectBundle(JSON.stringify({ format: 'otro' }))).rejects.toThrow();
    await expect(
      engine.importProjectBundle(JSON.stringify({ format: 'sqllab-project', schemaVersion: 99, project: { name: 'x' }, databases: [] }))
    ).rejects.toThrow(/Versión/);
    await expect(
      engine.importProjectBundle(JSON.stringify({
        format: 'sqllab-project', schemaVersion: 2, project: { name: 'Roto' },
        databases: [{ name: 'roto_db', sqlDump: 'CREATE TABLE ok (id INT); ESTO NO ES SQL;' }]
      }))
    ).rejects.toThrow(/no se pudo restaurar/);
    expect(engine.databases().length).toBe(before);
    expect(engine.currentDbName()).toBe(dbName);
  }, T);

  it('18-19. tras recargar (nueva instancia) los datos se recuperan desde IndexedDB', async () => {
    await engine.shutdown();
    const reloaded = newEngine().engine;
    await reloaded.init();
    try {
      expect(reloaded.inMemoryMode()).toBe(false);
      expect(reloaded.projects().some(p => p.id === projectId)).toBe(true);
      await reloaded.switchProject(projectId);
      await reloaded.switchDatabase(dbName);
      const res = await ok(reloaded, 'SELECT nombre FROM usuarios ORDER BY id');
      expect(res.rows.map(r => r['nombre'])).toEqual(['Daniel', 'Ana', 'Luis']);
      expect(reloaded.currentSchema().tables.find(t => t.name === 'usuarios')!.indexes.map(i => i.name)).toContain('idx_usuarios_edad');
    } finally {
      await reloaded.shutdown();
    }
  }, T);
});
