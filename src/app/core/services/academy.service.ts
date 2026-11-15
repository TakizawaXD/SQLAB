import { Injectable, computed, signal } from '@angular/core';
import type { PGlite } from '@electric-sql/pglite';
import {
  Challenge,
  ChallengeAttempt,
  ChallengeValidation,
  DdlValidationSpec,
  Lesson,
  PracticeTask
} from '../models/academy.models';
import { StorageService } from './storage.service';
import { analyzeSqlDialect, splitSqlStatements } from '../utils/sql-utils';
import { SqlEngineService } from './sql-engine.service';

export type { ChallengeValidation } from '../models/academy.models';

const PROGRESS_KEY = 'sqllab_academy_progress_v2';
const LEGACY_PROGRESS_KEY = 'sqllab_academy_progress_v1';

export const SANDBOX_TIENDA_SQL = `
CREATE TABLE categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) UNIQUE NOT NULL,
  edad INTEGER CHECK (edad >= 0)
);

CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  precio NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL
);

CREATE TABLE pedidos (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente'
);

CREATE TABLE detalles_pedidos (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10, 2) NOT NULL
);

INSERT INTO categorias (id, nombre) VALUES
  (1, 'Laptops y PC'),
  (2, 'Periféricos'),
  (3, 'Monitores'),
  (4, 'Accesorios');

INSERT INTO clientes (id, nombre, correo, edad) VALUES
  (1, 'Ana García', 'ana@email.com', 26),
  (2, 'Carlos Ruiz', 'carlos@email.com', 19),
  (3, 'Lucía Méndez', 'lucia@email.com', 31),
  (4, 'Daniel Torres', 'daniel@email.com', 22);

INSERT INTO productos (id, nombre, precio, stock, categoria_id) VALUES
  (1, 'Laptop Pro 14"', 1299.00, 12, 1),
  (2, 'Teclado Mecánico RGB', 89.50, 34, 2),
  (3, 'Mouse Inalámbrico', 45.00, 18, 2),
  (4, 'Monitor 4K 27"', 420.00, 8, 3),
  (5, 'SSD NVMe 1TB', 110.00, 25, 1);

INSERT INTO pedidos (id, cliente_id, fecha, total, estado) VALUES
  (1, 1, '2026-01-10', 1388.50, 'Completado'),
  (2, 3, '2026-01-14', 465.00, 'Completado'),
  (3, 4, '2026-01-18', 110.00, 'Pendiente');

INSERT INTO detalles_pedidos (id, pedido_id, producto_id, cantidad, precio_unitario) VALUES
  (1, 1, 1, 1, 1299.00),
  (2, 1, 2, 1, 89.50),
  (3, 2, 4, 1, 420.00),
  (4, 2, 3, 1, 45.00),
  (5, 3, 5, 1, 110.00);

SELECT setval(pg_get_serial_sequence('categorias', 'id'), (SELECT MAX(id) FROM categorias));
SELECT setval(pg_get_serial_sequence('clientes', 'id'), (SELECT MAX(id) FROM clientes));
SELECT setval(pg_get_serial_sequence('productos', 'id'), (SELECT MAX(id) FROM productos));
SELECT setval(pg_get_serial_sequence('pedidos', 'id'), (SELECT MAX(id) FROM pedidos));
SELECT setval(pg_get_serial_sequence('detalles_pedidos', 'id'), (SELECT MAX(id) FROM detalles_pedidos));
`;

@Injectable({
  providedIn: 'root'
})
export class AcademyService {
  readonly lessons = signal<Lesson[]>([
    {
      id: 'lesson_1',
      order: 1,
      title: 'Introducción a Bases de Datos Relacionales',
      category: 'Introducción a bases de datos',
      description: 'Tablas, filas, columnas, esquemas y catálogos del sistema en PostgreSQL.',
      durationMinutes: 10,
      completed: false,
      theory: `Una **base de datos relacional (RDBMS)** organiza la información en tablas compuestas por **filas** (registros) y **columnas** (atributos con tipo definido).

En PostgreSQL, las tablas viven dentro de un **esquema** (por defecto \`public\`) y el propio motor mantiene su metadato en \`pg_catalog\` e \`information_schema\`.`,
      codeSnippet: `SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;`,
      tasks: [
        {
          instruction: 'Consulta todas las filas de la tabla clientes con un límite de 4 registros.',
          hint: 'SELECT * FROM clientes LIMIT 4;',
          solutionSql: 'SELECT * FROM clientes LIMIT 4;',
          expectedResult: 'Lista de hasta 4 clientes con id, nombre, correo y edad.',
          validationType: 'select'
        }
      ]
    },
    {
      id: 'lesson_2',
      order: 2,
      title: 'Fundamentos de SQL (DDL, DML, DQL, TCL)',
      category: 'Fundamentos de SQL',
      description: 'Familias del lenguaje SQL, comentarios, identificadores y cláusulas básicas.',
      durationMinutes: 12,
      completed: false,
      theory: `Las sentencias SQL se agrupan en cinco familias estándar:
- **DQL**: Consulta de información (\`SELECT\`).
- **DML**: Inserción y modificación de registros (\`INSERT\`, \`UPDATE\`, \`DELETE\`).
- **DDL**: Definición de estructura (\`CREATE\`, \`ALTER\`, \`DROP\`, \`TRUNCATE\`).
- **TCL**: Control transaccional (\`BEGIN\`, \`COMMIT\`, \`ROLLBACK\`, \`SAVEPOINT\`).
- **DCL**: Permisos (\`GRANT\`, \`REVOKE\`).`,
      codeSnippet: `SELECT nombre AS producto, precio, stock
FROM productos
ORDER BY precio DESC;`,
      tasks: [
        {
          instruction: 'Obtén nombre y correo de todos los clientes ordenados alfabéticamente por nombre.',
          hint: 'SELECT nombre, correo FROM clientes ORDER BY nombre ASC;',
          solutionSql: 'SELECT nombre, correo FROM clientes ORDER BY nombre ASC;',
          expectedResult: 'Columnas nombre y correo de clientes en orden A-Z.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_3',
      order: 3,
      title: 'Creación y Modificación de Tablas',
      category: 'Creación de tablas',
      description: 'CREATE TABLE, ALTER TABLE, DROP TABLE y restricciones básicas.',
      durationMinutes: 15,
      completed: false,
      theory: `\`CREATE TABLE\` crea una tabla en PostgreSQL especificando columnas, tipos y reglas (\`NOT NULL\`, \`UNIQUE\`, \`CHECK\`, \`DEFAULT\`).

Con \`ALTER TABLE\` puedes agregar columnas (\`ADD COLUMN\`), renombrarlas o eliminarlas sin perder el resto de los datos.`,
      codeSnippet: `CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  cif VARCHAR(20) UNIQUE NOT NULL,
  activo BOOLEAN DEFAULT TRUE
);

ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS telefono VARCHAR(25);
SELECT * FROM proveedores;`,
      tasks: [
        {
          instruction: 'Crea la tabla "marcas" con id (SERIAL PRIMARY KEY) y nombre (VARCHAR(80) NOT NULL).',
          hint: 'CREATE TABLE marcas (id SERIAL PRIMARY KEY, nombre VARCHAR(80) NOT NULL);',
          solutionSql: 'CREATE TABLE marcas (id SERIAL PRIMARY KEY, nombre VARCHAR(80) NOT NULL);',
          expectedResult: 'Tabla marcas creada en public con PK en id y NOT NULL en nombre.',
          validationType: 'ddl',
          ddlCheck: {
            tableName: 'marcas',
            requiredColumns: [
              { name: 'id', typePattern: 'int', primaryKey: true },
              { name: 'nombre', typePattern: 'char|text', nullable: false }
            ],
            requirePrimaryKeyOn: ['id']
          }
        }
      ]
    },
    {
      id: 'lesson_4',
      order: 4,
      title: 'Tipos de Datos en PostgreSQL',
      category: 'Tipos de datos',
      description: 'INTEGER, SERIAL, TEXT, NUMERIC(p,s), BOOLEAN, DATE, TIMESTAMP y JSONB.',
      durationMinutes: 12,
      completed: false,
      theory: `Elegir el tipo correcto evita errores de precisión y mejora el rendimiento:
- **Exactos**: \`INTEGER\`, \`BIGINT\`, \`NUMERIC(10,2)\` (dinero), \`SERIAL\`.
- **Texto**: \`VARCHAR(n)\` y \`TEXT\`.
- **Tiempo**: \`DATE\`, \`TIMESTAMP\`, \`INTERVAL\`.
- **Documentos**: \`JSON\` / \`JSONB\` para datos semiestructurados indexables.`,
      codeSnippet: `SELECT
  'PostgreSQL Wasm'::TEXT AS motor,
  1299.99::NUMERIC(10,2) AS precio_exacto,
  TRUE AS local_privado,
  '{"version": 16, "wasm": true}'::JSONB AS metadata;`,
      tasks: [
        {
          instruction: 'Devuelve el nombre del producto y su precio convertido a entero redondeado (ROUND(precio)::INTEGER AS precio_entero) para los 3 primeros productos ordenados por id.',
          hint: 'SELECT nombre, ROUND(precio)::INTEGER AS precio_entero FROM productos ORDER BY id LIMIT 3;',
          solutionSql: 'SELECT nombre, ROUND(precio)::INTEGER AS precio_entero FROM productos ORDER BY id LIMIT 3;',
          expectedResult: '3 filas con nombre y precio_entero.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_5',
      order: 5,
      title: 'Claves Primarias (PRIMARY KEY)',
      category: 'Claves primarias',
      description: 'Identidad única por fila, claves simples, compuestas y secuencias SERIAL.',
      durationMinutes: 12,
      completed: false,
      theory: `Una **clave primaria (PRIMARY KEY)** combina automáticamente \`NOT NULL\` + \`UNIQUE\`. Garantiza que cada fila sea identificable de forma inequívoca.

En PostgreSQL \`SERIAL\` (o \`GENERATED ALWAYS AS IDENTITY\`) crea una secuencia asociada para generar IDs incrementales.`,
      codeSnippet: `CREATE TABLE estudiantes (
  matricula INTEGER PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);`,
      tasks: [
        {
          instruction: 'Crea la tabla "aulas" con codigo (VARCHAR(20) PRIMARY KEY) y capacidad (INTEGER NOT NULL).',
          hint: 'CREATE TABLE aulas (codigo VARCHAR(20) PRIMARY KEY, capacidad INTEGER NOT NULL);',
          solutionSql: 'CREATE TABLE aulas (codigo VARCHAR(20) PRIMARY KEY, capacidad INTEGER NOT NULL);',
          expectedResult: 'Tabla aulas con PK en codigo y columna capacidad NOT NULL.',
          validationType: 'ddl',
          ddlCheck: {
            tableName: 'aulas',
            requiredColumns: [
              { name: 'codigo', typePattern: 'char|text', primaryKey: true },
              { name: 'capacidad', typePattern: 'int', nullable: false }
            ],
            requirePrimaryKeyOn: ['codigo']
          }
        }
      ]
    },
    {
      id: 'lesson_6',
      order: 6,
      title: 'Claves Foráneas e Integridad Referencial',
      category: 'Claves foráneas',
      description: 'REFERENCES, ON DELETE CASCADE, ON DELETE SET NULL y prevención de huérfanos.',
      durationMinutes: 15,
      completed: false,
      theory: `Una **clave foránea (FOREIGN KEY)** impide insertar valores que no existan en la tabla referenciada:
- \`ON DELETE CASCADE\`: borra registros hijos automáticamente.
- \`ON DELETE SET NULL\`: pone NULL en la columna hija.
- \`ON DELETE RESTRICT\`: impide borrar al padre si existen hijos.`,
      codeSnippet: `SELECT id, cliente_id, total, estado
FROM pedidos
ORDER BY id;`,
      tasks: [
        {
          instruction: 'Crea una tabla "direcciones" con id (SERIAL PRIMARY KEY), cliente_id (INTEGER REFERENCES clientes(id) ON DELETE CASCADE) y ciudad (TEXT NOT NULL).',
          hint: 'CREATE TABLE direcciones (id SERIAL PRIMARY KEY, cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE, ciudad TEXT NOT NULL);',
          solutionSql: 'CREATE TABLE direcciones (id SERIAL PRIMARY KEY, cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE, ciudad TEXT NOT NULL);',
          expectedResult: 'Tabla direcciones con FK real hacia clientes.',
          validationType: 'ddl',
          ddlCheck: {
            tableName: 'direcciones',
            requiredColumns: [
              { name: 'id', typePattern: 'int', primaryKey: true },
              { name: 'cliente_id', typePattern: 'int' },
              { name: 'ciudad', typePattern: 'char|text', nullable: false }
            ],
            requirePrimaryKeyOn: ['id'],
            requireForeignKeys: [{ column: 'cliente_id', targetTable: 'clientes' }]
          }
        }
      ]
    },
    {
      id: 'lesson_7',
      order: 7,
      title: 'Modelado de Relaciones (1:1, 1:N, N:M)',
      category: 'Relaciones',
      description: 'Diseño de relaciones uno a uno (FK UNIQUE), uno a muchos y tablas puente N:M.',
      durationMinutes: 16,
      completed: false,
      theory: `- **1:1**: Se implementa colocando \`UNIQUE\` en la FK (o compartiendo la misma PK).
- **1:N**: La tabla del lado N guarda la FK hacia el lado 1 (ej. \`pedidos.cliente_id -> clientes.id\`).
- **N:M**: Requiere una **tabla intermedia** con dos FKs (ej. \`detalles_pedidos\` entre \`pedidos\` y \`productos\`).`,
      codeSnippet: `SELECT p.id AS pedido_id, pr.nombre AS producto, dp.cantidad
FROM detalles_pedidos dp
JOIN pedidos p ON dp.pedido_id = p.id
JOIN productos pr ON dp.producto_id = pr.id;`,
      tasks: [
        {
          instruction: 'Crea una tabla de relación 1:1 llamada "perfiles_clientes" con cliente_id (INTEGER PRIMARY KEY REFERENCES clientes(id)) y bio (TEXT).',
          hint: 'CREATE TABLE perfiles_clientes (cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id), bio TEXT);',
          solutionSql: 'CREATE TABLE perfiles_clientes (cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id), bio TEXT);',
          expectedResult: 'Tabla perfiles_clientes con PK+FK en cliente_id.',
          validationType: 'ddl',
          ddlCheck: {
            tableName: 'perfiles_clientes',
            requiredColumns: [
              { name: 'cliente_id', typePattern: 'int', primaryKey: true },
              { name: 'bio', typePattern: 'char|text' }
            ],
            requirePrimaryKeyOn: ['cliente_id'],
            requireForeignKeys: [{ column: 'cliente_id', targetTable: 'clientes' }]
          }
        }
      ]
    },
    {
      id: 'lesson_8',
      order: 8,
      title: 'Inserción, Actualización y Borrado (DML)',
      category: 'Inserción de registros',
      description: 'INSERT INTO, VALUES múltiples, UPDATE, DELETE y RETURNING en PostgreSQL.',
      durationMinutes: 15,
      completed: false,
      theory: `En PostgreSQL puedes encadenar \`RETURNING *\` a \`INSERT\`, \`UPDATE\` o \`DELETE\` para obtener inmediatamente los registros afectados sin hacer otra consulta.`,
      codeSnippet: `BEGIN;
INSERT INTO categorias (nombre)
VALUES ('Almacenamiento')
RETURNING id, nombre;
ROLLBACK;`,
      tasks: [
        {
          instruction: 'Inserta una nueva categoría llamada "Audio" usando INSERT INTO ... RETURNING nombre.',
          hint: "INSERT INTO categorias (nombre) VALUES ('Audio') RETURNING nombre;",
          solutionSql: "INSERT INTO categorias (nombre) VALUES ('Audio') RETURNING nombre;",
          expectedResult: 'Una fila con nombre = Audio.',
          validationType: 'select'
        }
      ]
    },
    {
      id: 'lesson_9',
      order: 9,
      title: 'Consultas SELECT, Alias y Paginación',
      category: 'Consultas SELECT',
      description: 'Proyección de columnas, DISTINCT, ORDER BY, LIMIT, OFFSET y COALESCE.',
      durationMinutes: 15,
      completed: false,
      theory: `\`SELECT\` define qué columnas o expresiones calcular, \`DISTINCT\` elimina duplicados, \`ORDER BY\` define el orden y \`LIMIT / OFFSET\` pagina los resultados.`,
      codeSnippet: `SELECT DISTINCT estado
FROM pedidos
ORDER BY estado ASC;`,
      tasks: [
        {
          instruction: 'Lista los 2 productos más baratos mostrando nombre y precio.',
          hint: 'SELECT nombre, precio FROM productos ORDER BY precio ASC LIMIT 2;',
          solutionSql: 'SELECT nombre, precio FROM productos ORDER BY precio ASC LIMIT 2;',
          expectedResult: '2 filas ordenadas por precio ascendente.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_10',
      order: 10,
      title: 'Filtros Avanzados con WHERE',
      category: 'Filtros',
      description: 'Operadores AND, OR, NOT, BETWEEN, IN, LIKE, ILIKE y comprobación IS NULL.',
      durationMinutes: 15,
      completed: false,
      theory: `Recuerda dos reglas clave en PostgreSQL:
1. Para comprobar nulos usa siempre \`IS NULL\` o \`IS NOT NULL\` (nunca \`= NULL\`).
2. \`ILIKE\` realiza búsqueda de patrones sin distinguir mayúsculas ni minúsculas.`,
      codeSnippet: `SELECT nombre, precio
FROM productos
WHERE precio BETWEEN 50 AND 500 AND stock > 0
ORDER BY precio DESC;`,
      tasks: [
        {
          instruction: 'Encuentra todos los clientes con edad mayor o igual a 22 años ordenados por id.',
          hint: 'SELECT id, nombre, edad FROM clientes WHERE edad >= 22 ORDER BY id;',
          solutionSql: 'SELECT id, nombre, edad FROM clientes WHERE edad >= 22 ORDER BY id;',
          expectedResult: 'Clientes cuya edad >= 22.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_11',
      order: 11,
      title: 'Combinación de Tablas con JOIN',
      category: 'JOIN',
      description: 'INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL OUTER JOIN y CROSS JOIN.',
      durationMinutes: 20,
      completed: false,
      theory: `- **INNER JOIN**: solo filas con coincidencia en ambas tablas.
- **LEFT JOIN**: todas las filas de la tabla izquierda + coincidencias de la derecha (NULL si no hay).
- **FULL JOIN**: conserva filas sin pareja de ambos lados.`,
      codeSnippet: `SELECT c.nombre AS cliente, p.id AS pedido_id, p.total
FROM clientes c
LEFT JOIN pedidos p ON c.id = p.cliente_id
ORDER BY c.id, p.id;`,
      tasks: [
        {
          instruction: 'Muestra nombre de producto y nombre de su categoría usando LEFT JOIN entre productos p y categorias c, ordenado por p.id.',
          hint: 'SELECT p.nombre AS producto, c.nombre AS categoria FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.id;',
          solutionSql: 'SELECT p.nombre AS producto, c.nombre AS categoria FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.id;',
          expectedResult: 'Cada producto emparejado con su categoría.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_12',
      order: 12,
      title: 'Funciones Agregadas, GROUP BY y HAVING',
      category: 'Funciones agregadas',
      description: 'COUNT, SUM, AVG, MIN, MAX, agrupación GROUP BY y filtro de grupos HAVING.',
      durationMinutes: 18,
      completed: false,
      theory: `\`WHERE\` filtra **filas individuales** antes de agrupar; \`HAVING\` filtra **grupos** ya calculados por \`GROUP BY\`.`,
      codeSnippet: `SELECT c.nombre AS categoria, COUNT(p.id) AS total, COALESCE(SUM(p.stock), 0) AS unidades
FROM categorias c
LEFT JOIN productos p ON c.id = p.categoria_id
GROUP BY c.id, c.nombre
ORDER BY total DESC, c.nombre ASC;`,
      tasks: [
        {
          instruction: 'Calcula cuántos pedidos existen por cada estado (estado, total) usando GROUP BY y ordenando por estado ASC.',
          hint: 'SELECT estado, COUNT(*) AS total FROM pedidos GROUP BY estado ORDER BY estado ASC;',
          solutionSql: 'SELECT estado, COUNT(*) AS total FROM pedidos GROUP BY estado ORDER BY estado ASC;',
          expectedResult: 'Conteo de pedidos agrupado por estado.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_13',
      order: 13,
      title: 'Subconsultas, CTEs (WITH) y Operadores de Conjunto',
      category: 'Subconsultas',
      description: 'Subconsultas escalares, IN, EXISTS, CTEs con WITH, UNION, INTERSECT y EXCEPT.',
      durationMinutes: 20,
      completed: false,
      theory: `Un **CTE (\`WITH\`)** hace legibles las consultas multipaso. Las operaciones \`UNION\`, \`INTERSECT\` y \`EXCEPT\` combinan conjuntos de filas con columnas compatibles.`,
      codeSnippet: `WITH resumen AS (
  SELECT cliente_id, SUM(total) AS gastado
  FROM pedidos
  GROUP BY cliente_id
)
SELECT c.nombre, COALESCE(r.gastado, 0) AS total_gastado
FROM clientes c
LEFT JOIN resumen r ON c.id = r.cliente_id
ORDER BY total_gastado DESC;`,
      tasks: [
        {
          instruction: 'Obtén id, nombre y precio de los productos cuyo precio sea mayor al promedio general, ordenados por precio DESC.',
          hint: 'SELECT id, nombre, precio FROM productos WHERE precio > (SELECT AVG(precio) FROM productos) ORDER BY precio DESC;',
          solutionSql: 'SELECT id, nombre, precio FROM productos WHERE precio > (SELECT AVG(precio) FROM productos) ORDER BY precio DESC;',
          expectedResult: 'Productos con precio estrictamente mayor al promedio.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_14',
      order: 14,
      title: 'Normalización de Bases de Datos (1FN, 2FN, 3FN)',
      category: 'Normalización',
      description: 'Atomicidad, dependencias funcionales y separación de entidades para eliminar redundancia.',
      durationMinutes: 16,
      completed: false,
      theory: `- **1FN**: Sin grupos repetitivos; valores atómicos por celda.
- **2FN**: Ningún atributo no clave depende solo de parte de una clave compuesta.
- **3FN**: Ningún atributo no clave depende transitivamente de otra columna no clave (por eso \`categorias\` es tabla aparte y no texto repetido en \`productos\`).`,
      codeSnippet: `-- Ejemplo normalizado en 3FN: categorias separada de productos
SELECT pr.nombre, c.nombre AS categoria
FROM productos pr
JOIN categorias c ON pr.categoria_id = c.id
ORDER BY pr.id;`,
      tasks: [
        {
          instruction: 'Separa una entidad "ciudades" normalizada en 3FN creando la tabla ciudades con id (SERIAL PRIMARY KEY) y nombre (VARCHAR(80) UNIQUE NOT NULL).',
          hint: 'CREATE TABLE ciudades (id SERIAL PRIMARY KEY, nombre VARCHAR(80) UNIQUE NOT NULL);',
          solutionSql: 'CREATE TABLE ciudades (id SERIAL PRIMARY KEY, nombre VARCHAR(80) UNIQUE NOT NULL);',
          expectedResult: 'Tabla ciudades creada con PK y restricción UNIQUE en nombre.',
          validationType: 'ddl',
          ddlCheck: {
            tableName: 'ciudades',
            requiredColumns: [
              { name: 'id', typePattern: 'int', primaryKey: true },
              { name: 'nombre', typePattern: 'char|text', nullable: false, unique: true }
            ],
            requirePrimaryKeyOn: ['id']
          }
        }
      ]
    },
    {
      id: 'lesson_15',
      order: 15,
      title: 'Índices, Secuencias y Planes EXPLAIN',
      category: 'Índices',
      description: 'CREATE INDEX, índices únicos, secuencias y lectura básica de planes EXPLAIN.',
      durationMinutes: 15,
      completed: false,
      theory: `Los **índices B-Tree** aceleran cláusulas \`WHERE\`, \`JOIN\` y \`ORDER BY\`. Utiliza \`EXPLAIN\` para verificar si PostgreSQL usa *Index Scan* o *Seq Scan*.`,
      codeSnippet: `CREATE INDEX IF NOT EXISTS idx_productos_precio ON productos(precio);
EXPLAIN SELECT * FROM productos WHERE precio > 100;`,
      tasks: [
        {
          instruction: 'Crea un índice llamado idx_pedidos_estado sobre la columna estado de la tabla pedidos y verifica en pg_indexes.',
          hint: "CREATE INDEX idx_pedidos_estado ON pedidos(estado); SELECT indexname FROM pg_indexes WHERE tablename = 'pedidos' AND indexname = 'idx_pedidos_estado';",
          solutionSql: "CREATE INDEX idx_pedidos_estado ON pedidos(estado); SELECT indexname FROM pg_indexes WHERE tablename = 'pedidos' AND indexname = 'idx_pedidos_estado';",
          expectedResult: 'Fila con indexname = idx_pedidos_estado.',
          validationType: 'select'
        }
      ]
    },
    {
      id: 'lesson_16',
      order: 16,
      title: 'Transacciones y SAVEPOINT (ACID)',
      category: 'Transacciones',
      description: 'Atomicidad, Consistencia, Aislamiento y Durabilidad con BEGIN, COMMIT, SAVEPOINT y ROLLBACK.',
      durationMinutes: 16,
      completed: false,
      theory: `Las transacciones aseguran que varias sentencias se ejecuten como una unidad todo-o-nada. Con \`SAVEPOINT sp1\` puedes revertir parcialmente hasta un punto intermedio con \`ROLLBACK TO SAVEPOINT sp1\`.`,
      codeSnippet: `BEGIN;
UPDATE productos SET stock = stock - 2 WHERE id = 1;
SAVEPOINT antes_de_error;
UPDATE productos SET stock = 0 WHERE id = 2;
ROLLBACK TO SAVEPOINT antes_de_error;
COMMIT;
SELECT id, stock FROM productos WHERE id IN (1, 2) ORDER BY id;`,
      tasks: [
        {
          instruction: 'Dentro de una transacción, descuenta 1 unidad del producto id = 1, guarda con COMMIT y selecciona id y stock del producto 1.',
          hint: 'BEGIN; UPDATE productos SET stock = stock - 1 WHERE id = 1; COMMIT; SELECT id, stock FROM productos WHERE id = 1;',
          solutionSql: 'BEGIN; UPDATE productos SET stock = stock - 1 WHERE id = 1; COMMIT; SELECT id, stock FROM productos WHERE id = 1;',
          expectedResult: 'id = 1 con stock = 11.',
          validationType: 'select'
        }
      ]
    },
    {
      id: 'lesson_17',
      order: 17,
      title: 'Vistas Reutilizables (CREATE VIEW)',
      category: 'Vistas',
      description: 'CREATE OR REPLACE VIEW, encapsulación de JOINs y consultas sobre vistas.',
      durationMinutes: 15,
      completed: false,
      theory: `Una **Vista** almacena una consulta con nombre en PostgreSQL. Se consulta exactamente igual que una tabla, reflejando siempre los datos en tiempo real de las tablas base.`,
      codeSnippet: `CREATE OR REPLACE VIEW vista_stock_bajo AS
SELECT id, nombre, stock, precio
FROM productos
WHERE stock <= 20;

SELECT * FROM vista_stock_bajo ORDER BY stock ASC;`,
      tasks: [
        {
          instruction: 'Crea una vista llamada vista_clientes_activos con id, nombre y edad de clientes con edad >= 21, y consúltala ordenada por id.',
          hint: 'CREATE VIEW vista_clientes_activos AS SELECT id, nombre, edad FROM clientes WHERE edad >= 21; SELECT * FROM vista_clientes_activos ORDER BY id;',
          solutionSql: 'CREATE VIEW vista_clientes_activos AS SELECT id, nombre, edad FROM clientes WHERE edad >= 21; SELECT * FROM vista_clientes_activos ORDER BY id;',
          expectedResult: 'Clientes con id 1, 3 y 4 ordenados por id.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    },
    {
      id: 'lesson_18',
      order: 18,
      title: 'Funciones PL/pgSQL, Ventana y Triggers',
      category: 'Funciones y triggers',
      description: 'CREATE FUNCTION, funciones de ventana RANK() OVER(...) y automatización con CREATE TRIGGER.',
      durationMinutes: 22,
      completed: false,
      theory: `PostgreSQL permite lógica directamente dentro de la base de datos:
- **Funciones de ventana**: \`RANK() OVER (ORDER BY ...)\` calculan métricas sin colapsar filas.
- **Funciones & Triggers**: \`CREATE FUNCTION ... RETURNS TRIGGER\` + \`CREATE TRIGGER ... BEFORE/AFTER INSERT/UPDATE\` automatizan auditorías y reglas de negocio.`,
      codeSnippet: `CREATE OR REPLACE FUNCTION calcular_iva(monto NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN ROUND(monto * 1.21, 2);
END;
$$ LANGUAGE plpgsql;

SELECT nombre, precio, calcular_iva(precio) AS precio_con_iva,
       RANK() OVER (ORDER BY precio DESC) AS ranking_precio
FROM productos;`,
      tasks: [
        {
          instruction: 'Usa una función de ventana RANK() OVER (ORDER BY precio DESC) para listar nombre, precio y ranking de todos los productos.',
          hint: 'SELECT nombre, precio, RANK() OVER (ORDER BY precio DESC) AS ranking FROM productos;',
          solutionSql: 'SELECT nombre, precio, RANK() OVER (ORDER BY precio DESC) AS ranking FROM productos;',
          expectedResult: 'Cada producto con su posición de ranking de precio.',
          validationType: 'select',
          requireOrder: true
        }
      ]
    }
  ]);

  readonly challenges = signal<Challenge[]>([
    {
      id: 'ch_ddl_clientes',
      order: 1,
      title: 'Diseñar Tabla de Clientes (DDL)',
      difficulty: 'Principiante',
      category: 'Creación de Tablas (DDL)',
      points: 100,
      validationType: 'ddl',
      sampleSeedSql: '',
      ddlCheck: {
        tableName: 'clientes',
        requiredColumns: [
          { name: 'id', typePattern: 'int', primaryKey: true },
          { name: 'nombre', typePattern: 'char|text', nullable: false },
          { name: 'correo', typePattern: 'char|text' },
          { name: 'edad', typePattern: 'int' }
        ],
        requirePrimaryKeyOn: ['id']
      },
      objective:
        'Crea desde cero una tabla llamada "clientes" en un entorno limpio con las columnas: id (clave primaria entera SERIAL o INTEGER), nombre (VARCHAR o TEXT NOT NULL), correo (VARCHAR o TEXT) y edad (INTEGER).',
      sampleDb: 'sandbox_vacio',
      starterQuery: `-- Crea la tabla clientes verificada contra el catálogo real de PostgreSQL
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    ...
);`,
      solutionQuery: `CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150),
    edad INTEGER
);`,
      hints: [
        'Define id como SERIAL PRIMARY KEY (o INTEGER PRIMARY KEY).',
        'Asegúrate de incluir las 4 columnas: id, nombre (NOT NULL), correo y edad (INTEGER).'
      ],
      explanation:
        'El validador inspecciona pg_class, pg_attribute y pg_constraint en una instancia aislada de PostgreSQL para confirmar que la tabla, sus columnas, tipos y clave primaria existan realmente.',
      solved: false
    },
    {
      id: 'ch_1',
      requireOrder: true,
      order: 2,
      title: 'Clientes Mayores de Edad',
      difficulty: 'Principiante',
      category: 'Filtros y DQL',
      points: 100,
      validationType: 'select',
      objective:
        'Obtén el nombre, correo y edad de todos los clientes que tengan 21 o más años, ordenados alfabéticamente por nombre.',
      sampleDb: 'tienda_online',
      starterQuery: `-- Escribe tu consulta para filtrar clientes mayores de edad
SELECT nombre, correo, edad
FROM clientes
WHERE ...`,
      solutionQuery: `SELECT nombre, correo, edad FROM clientes WHERE edad >= 21 ORDER BY nombre ASC;`,
      hints: [
        'Usa la cláusula WHERE edad >= 21.',
        'No olvides ordenar con ORDER BY nombre ASC.'
      ],
      explanation:
        'La condición edad >= 21 filtra únicamente los registros que cumplen la condición booleana, y ORDER BY nombre ASC ordena los resultados alfabéticamente.',
      solved: false
    },
    {
      id: 'ch_2',
      requireOrder: true,
      order: 3,
      title: 'El Producto Más Costoso',
      difficulty: 'Principiante',
      category: 'Ordenamiento y Límites',
      points: 100,
      validationType: 'select',
      objective: 'Encuentra el nombre y el precio del producto más caro registrado en la tienda.',
      sampleDb: 'tienda_online',
      starterQuery: `-- Encuentra el producto más costoso
SELECT nombre, precio
FROM productos
ORDER BY ...
LIMIT 1;`,
      solutionQuery: `SELECT nombre, precio FROM productos ORDER BY precio DESC LIMIT 1;`,
      hints: [
        'Ordena los productos de mayor a menor precio con ORDER BY precio DESC.',
        'Utiliza LIMIT 1 para restringir la salida a un único registro.'
      ],
      explanation:
        'Al ordenar en sentido descendente por precio y limitar el resultado a una sola fila, se obtiene de forma eficiente el valor máximo.',
      solved: false
    },
    {
      id: 'ch_3',
      order: 4,
      title: 'Stock Crítico de Inventario',
      difficulty: 'Principiante',
      category: 'Filtros Numéricos',
      points: 100,
      validationType: 'select',
      objective:
        'Muestra el nombre, stock y precio de todos los productos que tengan 25 unidades o menos en existencia, ordenados por stock de menor a mayor.',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT nombre, stock, precio
FROM productos
WHERE ...`,
      solutionQuery: `SELECT nombre, stock, precio FROM productos WHERE stock <= 25 ORDER BY stock ASC;`,
      hints: [
        'La condición en WHERE debe ser stock <= 25.',
        'Ordena ascendentemente usando ORDER BY stock ASC.'
      ],
      explanation: 'Permite identificar inmediatamente qué productos requieren reposición en inventario.',
      solved: false
    },
    {
      id: 'ch_ddl_relaciones',
      order: 5,
      title: 'Catálogo de Productos Relacional (DDL)',
      difficulty: 'Intermedio',
      category: 'Claves Foráneas y Constraints',
      points: 175,
      validationType: 'ddl',
      sampleSeedSql: `CREATE TABLE categorias (id SERIAL PRIMARY KEY, nombre VARCHAR(80) NOT NULL);`,
      ddlCheck: {
        tableName: 'productos',
        requiredColumns: [
          { name: 'id', typePattern: 'int', primaryKey: true },
          { name: 'nombre', typePattern: 'char|text', nullable: false },
          { name: 'sku', typePattern: 'char|text', unique: true },
          { name: 'precio', typePattern: 'numeric|decimal' },
          { name: 'categoria_id', typePattern: 'int' }
        ],
        requirePrimaryKeyOn: ['id'],
        requireForeignKeys: [{ column: 'categoria_id', targetTable: 'categorias' }]
      },
      objective:
        'En un entorno donde ya existe la tabla "categorias (id)", crea la tabla "productos" con: id (SERIAL PRIMARY KEY), nombre (TEXT NOT NULL), sku (VARCHAR(40) UNIQUE), precio (NUMERIC(10,2)) y categoria_id (INTEGER con FOREIGN KEY hacia categorias(id)).',
      sampleDb: 'sandbox_categorias',
      starterQuery: `-- Ya existe categorias(id). Define productos con PK, UNIQUE y FOREIGN KEY
CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    sku VARCHAR(40) UNIQUE,
    precio NUMERIC(10, 2),
    categoria_id INTEGER REFERENCES ...
);`,
      solutionQuery: `CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    sku VARCHAR(40) UNIQUE,
    precio NUMERIC(10, 2),
    categoria_id INTEGER REFERENCES categorias(id)
);`,
      hints: [
        'Usa REFERENCES categorias(id) sobre la columna categoria_id.',
        'Agrega UNIQUE a sku y NOT NULL a nombre.'
      ],
      explanation:
        'Combina integridad de entidad (PK), unicidad de negocio (UNIQUE) e integridad referencial real verificada en pg_constraint.',
      solved: false
    },
    {
      id: 'ch_4',
      requireOrder: true,
      order: 6,
      title: 'Total Gastado por Cada Cliente',
      difficulty: 'Intermedio',
      category: 'JOINs y Agregaciones',
      points: 150,
      validationType: 'select',
      objective:
        'Calcula el total gastado por cada cliente que haya realizado al menos un pedido. Muestra el nombre del cliente y la suma total de sus pedidos, ordenada de mayor a menor gasto.',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT
    c.nombre,
    SUM(p.total) AS total_gastado
FROM clientes c
JOIN pedidos p ON ...
GROUP BY ...
ORDER BY ...;`,
      solutionQuery: `SELECT c.nombre, SUM(p.total) AS total_gastado FROM clientes c JOIN pedidos p ON c.id = p.cliente_id GROUP BY c.id, c.nombre ORDER BY total_gastado DESC;`,
      hints: [
        'Realiza un JOIN entre clientes c y pedidos p en c.id = p.cliente_id.',
        'Agrupa con GROUP BY c.id, c.nombre.',
        'Usa SUM(p.total) y ordena con ORDER BY total_gastado DESC.'
      ],
      explanation:
        'El INNER JOIN descarta a los clientes sin compras y asocia las filas de pedidos. La función SUM agregada por cada cliente proporciona la suma consolidada.',
      solved: false
    },
    {
      id: 'ch_5',
      order: 7,
      title: 'Categorías y Conteo de Productos',
      difficulty: 'Intermedio',
      category: 'LEFT JOIN y GROUP BY',
      points: 150,
      validationType: 'select',
      objective:
        'Muestra todas las categorías existentes junto con la cantidad de productos que pertenecen a cada una. Si una categoría no tiene productos, debe mostrar 0.',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT
    c.nombre AS categoria,
    COUNT(p.id) AS total_productos
FROM categorias c
LEFT JOIN productos p ON ...
GROUP BY ...;`,
      solutionQuery: `SELECT c.nombre AS categoria, COUNT(p.id) AS total_productos FROM categorias c LEFT JOIN productos p ON c.id = p.categoria_id GROUP BY c.id, c.nombre ORDER BY total_productos DESC;`,
      hints: [
        'Un LEFT JOIN asegura que se incluyan todas las categorías, incluso las que no tienen productos.',
        'COUNT(p.id) contará solo los IDs no nulos generados por la tabla productos.'
      ],
      explanation:
        'Usar COUNT(p.id) en lugar de COUNT(*) es fundamental en un LEFT JOIN para que las categorías sin productos arrojen 0 en vez de 1.',
      solved: false
    },
    {
      id: 'ch_7',
      order: 8,
      title: 'Clientes con Pedidos Completados',
      difficulty: 'Intermedio',
      category: 'Subconsultas IN o EXISTS',
      points: 150,
      validationType: 'select',
      objective: 'Lista el id, nombre y correo de los clientes que tengan al menos un pedido en estado "Completado".',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT id, nombre, correo
FROM clientes
WHERE id IN (
    ...
);`,
      solutionQuery: `SELECT id, nombre, correo FROM clientes WHERE id IN (SELECT cliente_id FROM pedidos WHERE estado = 'Completado');`,
      hints: [
        "Utiliza una subconsulta con IN: WHERE id IN (SELECT cliente_id FROM pedidos WHERE estado = 'Completado')."
      ],
      explanation:
        'El operador IN evalúa la pertenencia del identificador de cliente dentro del conjunto de clientes con pedidos en estado Completado.',
      solved: false
    },
    {
      id: 'ch_6',
      order: 9,
      title: 'Productos por Encima del Precio Promedio',
      difficulty: 'Avanzado',
      category: 'Subconsultas',
      points: 250,
      validationType: 'select',
      objective:
        'Obtén todos los productos cuyo precio sea estrictamente superior al precio promedio de todos los productos del catálogo. Muestra id, nombre y precio.',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT id, nombre, precio
FROM productos
WHERE precio > (
    -- Escribe la subconsulta del promedio aquí
);`,
      solutionQuery: `SELECT id, nombre, precio FROM productos WHERE precio > (SELECT AVG(precio) FROM productos) ORDER BY precio DESC;`,
      hints: [
        'La subconsulta interna es (SELECT AVG(precio) FROM productos).',
        'Compara en el WHERE externo: WHERE precio > (subconsulta).'
      ],
      explanation:
        'La subconsulta escalar calcula dinámicamente el promedio general una vez, y el query principal evalúa cada producto contra ese umbral.',
      solved: false
    },
    {
      id: 'ch_8',
      order: 10,
      title: 'Detalle Completo de Pedidos (Multi-Join)',
      difficulty: 'Avanzado',
      category: 'Joins Múltiples',
      points: 250,
      validationType: 'select',
      objective:
        'Genera un reporte detallado con: número de pedido (pedido_id), nombre del cliente, nombre del producto comprado, cantidad y precio unitario.',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT
    p.id AS pedido_id,
    c.nombre AS cliente,
    pr.nombre AS producto,
    dp.cantidad,
    dp.precio_unitario
FROM pedidos p
JOIN clientes c ON ...
JOIN detalles_pedidos dp ON ...
JOIN productos pr ON ...
ORDER BY p.id;`,
      solutionQuery: `SELECT p.id AS pedido_id, c.nombre AS cliente, pr.nombre AS producto, dp.cantidad, dp.precio_unitario FROM pedidos p JOIN clientes c ON p.cliente_id = c.id JOIN detalles_pedidos dp ON p.id = dp.pedido_id JOIN productos pr ON dp.producto_id = pr.id ORDER BY p.id, pr.nombre;`,
      hints: [
        'Debes unir 4 tablas: pedidos, clientes, detalles_pedidos y productos.',
        'Conecta pedidos con clientes por cliente_id, pedidos con detalles_pedidos por pedido_id, y detalles_pedidos con productos por producto_id.'
      ],
      explanation:
        'Este patrón representa el estándar industrial para consultar encabezados y líneas de detalle en un sistema transaccional de comercio.',
      solved: false
    },
    {
      id: 'ch_window_ranking',
      requireOrder: true,
      order: 11,
      title: 'Ranking de Productos con Funciones de Ventana',
      difficulty: 'Avanzado',
      category: 'Funciones de Ventana y CTE',
      points: 300,
      validationType: 'select',
      objective:
        'Muestra el nombre, categoría, precio y la posición de ranking por precio descendente (usando RANK() OVER) de cada producto en el catálogo.',
      sampleDb: 'tienda_online',
      starterQuery: `SELECT
    p.nombre,
    c.nombre AS categoria,
    p.precio,
    RANK() OVER (ORDER BY ...) AS ranking
FROM productos p
JOIN categorias c ON ...;`,
      solutionQuery: `SELECT p.nombre, c.nombre AS categoria, p.precio, RANK() OVER (ORDER BY p.precio DESC) AS ranking FROM productos p JOIN categorias c ON p.categoria_id = c.id ORDER BY ranking ASC, p.nombre ASC;`,
      hints: [
        'Utiliza RANK() OVER (ORDER BY p.precio DESC) AS ranking.',
        'Une productos con categorias por p.categoria_id = c.id.'
      ],
      explanation:
        'Las funciones de ventana permiten calcular rankings globales o por partición manteniendo todas las filas individuales en el resultado.',
      solved: false
    }
  ]);

  readonly challengeHistory = signal<ChallengeAttempt[]>([]);

  readonly totalScore = computed(() =>
    this.challenges()
      .filter(c => c.solved)
      .reduce((sum, c) => sum + c.points, 0)
  );

  readonly maxPossibleScore = computed(() =>
    this.challenges().reduce((sum, c) => sum + c.points, 0)
  );

  constructor(private sqlEngine: SqlEngineService, private storage: StorageService) {
    void this.restoreProgress();
  }

  /**
   * Valida cualquier desafío sobre una instancia PGlite temporal y aislada,
   * sin tocar ni cambiar la base de datos ni el proyecto activo del usuario.
   */
  async validateChallenge(challenge: Challenge, userQuery: string): Promise<ChallengeValidation> {
    const dialectHints = analyzeSqlDialect(userQuery).map(
      w => `[${w.dialect}] ${w.construct}: ${w.suggestion || w.message}`
    );

    if (!userQuery.trim()) {
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message: 'Escribe una consulta antes de validar.'
      };
    }

    let sandbox: PGlite | null = null;
    try {
      const seedSql = challenge.sampleSeedSql !== undefined ? challenge.sampleSeedSql : SANDBOX_TIENDA_SQL;
      sandbox = await this.sqlEngine.createSandboxInstance(seedSql);

      if (challenge.validationType === 'ddl' && challenge.ddlCheck) {
        const result = await this.validateDdlInSandbox(sandbox, userQuery, challenge.ddlCheck, dialectHints);
        const alreadySolved = challenge.solved;
        const pointsAwarded = result.passed ? (alreadySolved ? 0 : challenge.points) : 0;

        if (result.passed && !alreadySolved) {
          this.challenges.set(this.challenges().map(c => (c.id === challenge.id ? { ...c, solved: true } : c)));
        }
        this.recordAttempt(challenge, result.passed, pointsAwarded, result.message, userQuery);
        return { ...result, pointsAwarded };
      }

      const result = await this.validateSelectInSandbox(
        sandbox,
        userQuery,
        challenge.solutionQuery,
        !!challenge.requireOrder,
        dialectHints,
        seedSql
      );

      const alreadySolved = challenge.solved;
      const pointsAwarded = result.passed ? (alreadySolved ? 0 : challenge.points) : 0;

      if (result.passed && !alreadySolved) {
        this.challenges.set(this.challenges().map(c => (c.id === challenge.id ? { ...c, solved: true } : c)));
      }
      this.recordAttempt(challenge, result.passed, pointsAwarded, result.message, userQuery);
      return { ...result, pointsAwarded };
    } catch (err: any) {
      const message = 'Error durante la validación en sandbox: ' + (err?.message || err);
      this.recordAttempt(challenge, false, 0, message, userQuery);
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message
      };
    } finally {
      if (sandbox) {
        await sandbox.close().catch(() => {});
      }
    }
  }

  /** Valida un ejercicio práctico de una lección en un sandbox PGlite aislado. */
  async validateLessonTask(lesson: Lesson, task: PracticeTask, userQuery: string): Promise<ChallengeValidation> {
    const dialectHints = analyzeSqlDialect(userQuery).map(
      w => `[${w.dialect}] ${w.construct}: ${w.suggestion || w.message}`
    );

    if (!userQuery.trim()) {
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message: 'Escribe una sentencia SQL antes de validar el ejercicio.'
      };
    }

    let sandbox: PGlite | null = null;
    try {
      const seed = task.validationType === 'ddl' ? '' : SANDBOX_TIENDA_SQL;
      sandbox = await this.sqlEngine.createSandboxInstance(seed);

      const res =
        task.validationType === 'ddl' && task.ddlCheck
          ? await this.validateDdlInSandbox(sandbox, userQuery, task.ddlCheck, dialectHints)
          : await this.validateSelectInSandbox(
              sandbox,
              userQuery,
              task.solutionSql,
              !!task.requireOrder,
              dialectHints,
              SANDBOX_TIENDA_SQL
            );

      if (res.passed) {
        this.markLessonComplete(lesson.id);
      }
      return res;
    } catch (err: any) {
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message: 'Error al validar ejercicio: ' + (err?.message || err)
      };
    } finally {
      if (sandbox) {
        await sandbox.close().catch(() => {});
      }
    }
  }

  private async validateDdlInSandbox(
    sandbox: PGlite,
    userQuery: string,
    spec: DdlValidationSpec,
    dialectHints: string[]
  ): Promise<ChallengeValidation> {
    try {
      await sandbox.exec(userQuery);
    } catch (err: any) {
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message: 'PostgreSQL rechazó tu DDL: ' + (err?.message || err)
      };
    }

    const schema = spec.schema || 'public';
    const tableRes = await sandbox.query<{ oid: number }>(
      `SELECT c.oid
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r', 'p')`,
      [schema, spec.tableName]
    );

    if (tableRes.rows.length === 0) {
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message: `La tabla '${spec.tableName}' no existe en el esquema '${schema}'.`
      };
    }

    const tableOid = tableRes.rows[0].oid;
    const colsRes = await sandbox.query<{ name: string; data_type: string; nullable: boolean }>(
      `SELECT a.attname AS name,
              format_type(a.atttypid, a.atttypmod) AS data_type,
              NOT a.attnotnull AS nullable
       FROM pg_attribute a
       WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum`,
      [tableOid]
    );

    const constraintsRes = await sandbox.query<{
      contype: string;
      col_name: string | null;
      ref_table: string | null;
    }>(
      `SELECT con.contype::text AS contype,
              att.attname AS col_name,
              refc.relname AS ref_table
       FROM pg_constraint con
       LEFT JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
       LEFT JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
       LEFT JOIN pg_class refc ON refc.oid = con.confrelid
       WHERE con.conrelid = $1`,
      [tableOid]
    );

    const pkCols = new Set(constraintsRes.rows.filter(r => r.contype === 'p' && r.col_name).map(r => r.col_name!));
    const uniqueCols = new Set(constraintsRes.rows.filter(r => r.contype === 'u' && r.col_name).map(r => r.col_name!));
    const fkPairs = constraintsRes.rows
      .filter(r => r.contype === 'f' && r.col_name && r.ref_table)
      .map(r => ({ column: r.col_name!, targetTable: r.ref_table! }));

    const actualMap = new Map(colsRes.rows.map(c => [c.name, c]));
    const summaryRows = colsRes.rows.map(c => ({
      columna: c.name,
      tipo: c.data_type,
      nulo: c.nullable ? 'SI' : 'NO',
      pk: pkCols.has(c.name) ? 'PK' : ''
    }));
    const userColumns = ['columna', 'tipo', 'nulo', 'pk'];

    for (const reqCol of spec.requiredColumns) {
      const found = actualMap.get(reqCol.name);
      if (!found) {
        return {
          passed: false,
          userRows: summaryRows,
          expectedRows: [],
          userColumns,
          dialectHints,
          message: `Falta la columna '${reqCol.name}' en la tabla '${spec.tableName}'.`
        };
      }
      if (reqCol.typePattern && !new RegExp(reqCol.typePattern, 'i').test(found.data_type)) {
        return {
          passed: false,
          userRows: summaryRows,
          expectedRows: [],
          userColumns,
          dialectHints,
          message: `La columna '${reqCol.name}' tiene tipo '${found.data_type}', pero se esperaba un tipo compatible con (${reqCol.typePattern}).`
        };
      }
      if (reqCol.nullable === false && found.nullable) {
        return {
          passed: false,
          userRows: summaryRows,
          expectedRows: [],
          userColumns,
          dialectHints,
          message: `La columna '${reqCol.name}' debe tener restricción NOT NULL.`
        };
      }
      if (reqCol.primaryKey && !pkCols.has(reqCol.name)) {
        return {
          passed: false,
          userRows: summaryRows,
          expectedRows: [],
          userColumns,
          dialectHints,
          message: `La columna '${reqCol.name}' debe ser PRIMARY KEY.`
        };
      }
      if (reqCol.unique && !uniqueCols.has(reqCol.name) && !pkCols.has(reqCol.name)) {
        return {
          passed: false,
          userRows: summaryRows,
          expectedRows: [],
          userColumns,
          dialectHints,
          message: `La columna '${reqCol.name}' debe tener restricción UNIQUE.`
        };
      }
    }

    if (spec.requirePrimaryKeyOn) {
      for (const pk of spec.requirePrimaryKeyOn) {
        if (!pkCols.has(pk)) {
          return {
            passed: false,
            userRows: summaryRows,
            expectedRows: [],
            userColumns,
            dialectHints,
            message: `Falta la clave primaria sobre '${pk}'.`
          };
        }
      }
    }

    if (spec.requireForeignKeys) {
      for (const fk of spec.requireForeignKeys) {
        const hasFk = fkPairs.some(p => p.column === fk.column && p.targetTable === fk.targetTable);
        if (!hasFk) {
          return {
            passed: false,
            userRows: summaryRows,
            expectedRows: [],
            userColumns,
            dialectHints,
            message: `Falta la clave foránea de '${fk.column}' referenciando a '${fk.targetTable}'.`
          };
        }
      }
    }

    return {
      passed: true,
      userRows: summaryRows,
      expectedRows: [],
      userColumns,
      dialectHints,
      message: `¡Estructura '${spec.tableName}' validada correctamente contra los catálogos reales de PostgreSQL!`
    };
  }

  private async validateSelectInSandbox(
    sandbox: PGlite,
    userQuery: string,
    solutionQuery: string,
    requireOrder: boolean,
    dialectHints: string[],
    seedSql: string = SANDBOX_TIENDA_SQL
  ): Promise<ChallengeValidation> {
    const runLastSelect = async (pg: PGlite, sql: string) => {
      const statements = splitSqlStatements(sql);
      if (statements.length === 0) {
        throw new Error('La consulta está vacía.');
      }
      for (let i = 0; i < statements.length - 1; i++) {
        await pg.exec(statements[i].text);
      }
      const last = statements[statements.length - 1].text;
      return pg.query<Record<string, unknown>>(last);
    };

    const usesMutatingOrTx = (sql: string) =>
      /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql);

    let userFields: { name: string }[] = [];
    let userRows: Record<string, unknown>[] = [];
    let isolatedExpSandbox: PGlite | null = null;

    try {
      const userMutates = usesMutatingOrTx(userQuery);
      if (!userMutates) await sandbox.exec('BEGIN;');
      const userRes = await runLastSelect(sandbox, userQuery);
      userFields = userRes.fields;
      userRows = userRes.rows;
      if (!userMutates) await sandbox.exec('ROLLBACK;');

      let expRes;
      if (userMutates || usesMutatingOrTx(solutionQuery)) {
        isolatedExpSandbox = await this.sqlEngine.createSandboxInstance(seedSql);
        expRes = await runLastSelect(isolatedExpSandbox, solutionQuery);
      } else {
        await sandbox.exec('BEGIN;');
        expRes = await runLastSelect(sandbox, solutionQuery);
        await sandbox.exec('ROLLBACK;');
      }

      const expFields = expRes.fields;
      const expRows = expRes.rows;
      const userColumns = userFields.map(c => c.name);
      if (userFields.length !== expFields.length) {
        return {
          passed: false,
          userRows,
          expectedRows: expRows,
          userColumns,
          dialectHints,
          message: `Número de columnas incorrecto. Esperado: ${expFields.length}, obtenido: ${userFields.length}.`
        };
      }

      if (userRows.length !== expRows.length) {
        return {
          passed: false,
          userRows,
          expectedRows: expRows,
          userColumns,
          dialectHints,
          message: `Número de filas incorrecto. Esperado: ${expRows.length}, obtenido: ${userRows.length}.`
        };
      }

      const userNorm = userRows.map(normalizeRow);
      const expNorm = expRows.map(normalizeRow);
      const sameSet = JSON.stringify([...userNorm].sort()) === JSON.stringify([...expNorm].sort());
      const sameOrder = JSON.stringify(userNorm) === JSON.stringify(expNorm);
      const passed = sameSet && (!requireOrder || sameOrder);

      let message = '¡Excelente! Tu consulta resolvió el desafío correctamente en el sandbox aislado.';
      if (!passed) {
        message = sameSet
          ? 'Los datos son correctos, pero el orden no coincide. Revisa la cláusula ORDER BY.'
          : 'Los datos devueltos no coinciden con la solución esperada. Revisa filtros, uniones y columnas.';
      }

      return {
        passed,
        userRows,
        expectedRows: expRows,
        userColumns,
        dialectHints,
        message
      };
    } catch (err: any) {
      await sandbox.exec('ROLLBACK;').catch(() => {});
      return {
        passed: false,
        userRows: [],
        expectedRows: [],
        userColumns: [],
        dialectHints,
        message: 'Error en tu consulta: ' + (err?.message || err)
      };
    } finally {
      if (isolatedExpSandbox) {
        await isolatedExpSandbox.close().catch(() => {});
      }
    }
  }

  private recordAttempt(
    challenge: Challenge,
    passed: boolean,
    pointsAwarded: number,
    message: string,
    query: string
  ): void {
    const attempt: ChallengeAttempt = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      passed,
      pointsAwarded,
      timestamp: Date.now(),
      message,
      queryPreview: query.trim().replace(/\s+/g, ' ').slice(0, 140)
    };
    this.challengeHistory.update(list => [attempt, ...list].slice(0, 50));
    this.saveProgress();
  }

  toggleLessonComplete(id: string): void {
    this.lessons.set(this.lessons().map(l => (l.id === id ? { ...l, completed: !l.completed } : l)));
    this.saveProgress();
  }

  markLessonComplete(id: string): void {
    if (this.lessons().find(l => l.id === id)?.completed) return;
    this.lessons.set(this.lessons().map(l => (l.id === id ? { ...l, completed: true } : l)));
    this.saveProgress();
  }

  resetProgress(): void {
    this.lessons.set(this.lessons().map(l => ({ ...l, completed: false })));
    this.challenges.set(this.challenges().map(c => ({ ...c, solved: false })));
    this.challengeHistory.set([]);
    this.saveProgress();
  }

  private saveProgress(): void {
    const progress = {
      updatedAt: Date.now(),
      lessons: this.lessons().filter(l => l.completed).map(l => l.id),
      challenges: this.challenges().filter(c => c.solved).map(c => c.id),
      history: this.challengeHistory()
    };
    void this.storage.setSetting(PROGRESS_KEY, progress).catch(err => console.warn('No se pudo guardar el progreso:', err));
  }

  /** Restaura el progreso desde IndexedDB (migra automáticamente el formato antiguo de localStorage). */
  private async restoreProgress(): Promise<void> {
    try {
      await this.storage.init();
      type Progress = { lessons?: string[]; challenges?: string[]; history?: ChallengeAttempt[] };
      let progress = await this.storage.getSetting<Progress | null>(PROGRESS_KEY, null);
      if (!progress) {
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(PROGRESS_KEY) || localStorage.getItem(LEGACY_PROGRESS_KEY);
        } catch {
          raw = null;
        }
        if (!raw) return;
        progress = JSON.parse(raw) as Progress;
        await this.storage.setSetting(PROGRESS_KEY, progress);
        try {
          localStorage.removeItem(PROGRESS_KEY);
          localStorage.removeItem(LEGACY_PROGRESS_KEY);
        } catch {
          // ignorar
        }
      }
      const lessons = new Set(progress.lessons ?? []);
      const challenges = new Set(progress.challenges ?? []);
      this.lessons.set(this.lessons().map(l => ({ ...l, completed: lessons.has(l.id) })));
      this.challenges.set(this.challenges().map(c => ({ ...c, solved: challenges.has(c.id) })));
      if (Array.isArray(progress.history)) {
        this.challengeHistory.set(progress.history.slice(0, 100));
      }
    } catch {
      // progreso corrupto o almacenamiento no disponible
    }
  }
}

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number' || typeof v === 'bigint') return Number(v).toFixed(2);
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v).toFixed(2);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim().toLowerCase();
}

function normalizeRow(row: Record<string, unknown>): string {
  return JSON.stringify(Object.values(row).map(normalizeValue));
}
