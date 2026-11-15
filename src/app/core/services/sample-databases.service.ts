import { Injectable } from '@angular/core';

export interface SampleDatabaseDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  badge: string;
  sql: string;
}

@Injectable({
  providedIn: 'root'
})
export class SampleDatabasesService {
  readonly sampleDatabases: SampleDatabaseDefinition[] = [
    {
      id: 'tienda_online',
      name: 'tienda_online',
      displayName: 'Tienda Online',
      description: 'E-commerce completo con categorías, productos, clientes, pedidos y detalles con claves foráneas.',
      icon: 'shopping-cart',
      badge: 'Popular',
      sql: `
DROP TABLE IF EXISTS detalles_pedidos CASCADE;
DROP TABLE IF EXISTS pedidos CASCADE;
DROP TABLE IF EXISTS productos CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;

CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT
);

CREATE TABLE productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    categoria_id INTEGER,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
);

CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) UNIQUE NOT NULL,
    edad INTEGER,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total DECIMAL(10,2) DEFAULT 0.00,
    estado VARCHAR(50) DEFAULT 'Pendiente',
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

CREATE TABLE detalles_pedidos (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL,
    producto_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
);

-- Inserción de Categorías
INSERT INTO categorias (nombre, descripcion) VALUES
('Computación', 'Laptops, computadoras de escritorio y componentes'),
('Accesorios', 'Periféricos, cables, mouses y teclados'),
('Audio', 'Auriculares, altavoces y micrófonos'),
('Monitores', 'Pantallas de alta resolución y gaming');

-- Inserción de Productos
INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES
('Laptop Gamer', 1299.99, 15, 1),
('Mouse Inalámbrico', 49.99, 50, 2),
('Teclado Mecánico', 89.99, 30, 2),
('Monitor 24"', 249.99, 20, 4),
('Auriculares', 79.99, 25, 3),
('Disco SSD 1TB', 119.50, 40, 1),
('Silla Ergonómica', 199.00, 12, 2),
('Webcam Full HD', 59.90, 35, 2);

-- Inserción de Clientes
INSERT INTO clientes (nombre, correo, edad) VALUES
('Ana Pérez', 'ana@email.com', 20),
('Carlos Ruiz', 'carlos@email.com', 25),
('Lucía Gómez', 'lucia@email.com', 22),
('Martín Silva', 'martin@email.com', 34),
('Elena Morales', 'elena@email.com', 29);

-- Inserción de Pedidos
INSERT INTO pedidos (cliente_id, total, estado) VALUES
(1, 1349.98, 'Completado'),
(2, 89.99, 'Enviado'),
(3, 329.98, 'Procesando'),
(1, 49.99, 'Completado'),
(4, 1299.99, 'Pendiente');

-- Inserción de Detalles de Pedidos
INSERT INTO detalles_pedidos (pedido_id, producto_id, cantidad, precio_unitario) VALUES
(1, 1, 1, 1299.99),
(1, 2, 1, 49.99),
(2, 3, 1, 89.99),
(3, 4, 1, 249.99),
(3, 5, 1, 79.99),
(4, 2, 1, 49.99),
(5, 1, 1, 1299.99);

-- Vistas útiles
CREATE OR REPLACE VIEW vista_resumen_pedidos AS
SELECT 
    p.id AS pedido_id,
    c.nombre AS cliente,
    c.correo,
    p.total,
    p.estado,
    p.fecha
FROM pedidos p
JOIN clientes c ON p.cliente_id = c.id;
`
    },
    {
      id: 'sistema_bancario',
      name: 'sistema_bancario',
      displayName: 'Sistema Bancario',
      description: 'Entidad financiera con clientes, cuentas de ahorro/corriente, transacciones y tarjetas.',
      icon: 'landmark',
      badge: 'Finanzas',
      sql: `
DROP TABLE IF EXISTS transacciones CASCADE;
DROP TABLE IF EXISTS tarjetas CASCADE;
DROP TABLE IF EXISTS cuentas CASCADE;
DROP TABLE IF EXISTS clientes_banco CASCADE;

CREATE TABLE clientes_banco (
    id SERIAL PRIMARY KEY,
    dni VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    ciudad VARCHAR(50)
);

CREATE TABLE cuentas (
    id SERIAL PRIMARY KEY,
    numero_cuenta VARCHAR(24) UNIQUE NOT NULL,
    cliente_id INTEGER NOT NULL,
    tipo VARCHAR(30) NOT NULL, -- Ahorro, Corriente
    saldo DECIMAL(12,2) DEFAULT 0.00,
    estado VARCHAR(20) DEFAULT 'Activa',
    FOREIGN KEY (cliente_id) REFERENCES clientes_banco(id)
);

CREATE TABLE transacciones (
    id SERIAL PRIMARY KEY,
    cuenta_origen_id INTEGER NOT NULL,
    cuenta_destino_id INTEGER,
    tipo VARCHAR(30) NOT NULL, -- Depósito, Retiro, Transferencia
    monto DECIMAL(12,2) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cuenta_origen_id) REFERENCES cuentas(id)
);

CREATE TABLE tarjetas (
    id SERIAL PRIMARY KEY,
    cuenta_id INTEGER NOT NULL,
    numero_enmascarado VARCHAR(19) NOT NULL,
    limite_credito DECIMAL(10,2) DEFAULT 0.00,
    tipo VARCHAR(20) NOT NULL, -- Débito, Crédito
    FOREIGN KEY (cuenta_id) REFERENCES cuentas(id)
);

INSERT INTO clientes_banco (dni, nombre, telefono, ciudad) VALUES
('10458821', 'Roberto Mendoza', '+34 611 223 344', 'Madrid'),
('20784912', 'Mariana Valenzuela', '+34 622 334 455', 'Barcelona'),
('30948271', 'Esteban Quito', '+34 633 445 566', 'Valencia');

INSERT INTO cuentas (numero_cuenta, cliente_id, tipo, saldo) VALUES
('ES9121000418450200051332', 1, 'Corriente', 3540.50),
('ES9121000418450200051333', 1, 'Ahorro', 12450.00),
('ES9121000418450200051334', 2, 'Corriente', 1890.20),
('ES9121000418450200051335', 3, 'Ahorro', 430.00);

INSERT INTO transacciones (cuenta_origen_id, cuenta_destino_id, tipo, monto) VALUES
(1, 3, 'Transferencia', 250.00),
(2, NULL, 'Depósito', 1000.00),
(3, NULL, 'Retiro', 80.00);
`
    },
    {
      id: 'biblioteca',
      name: 'biblioteca',
      displayName: 'Biblioteca',
      description: 'Gestión bibliotecaria con autores, libros, préstamos de usuarios y categorías temáticas.',
      icon: 'book-open',
      badge: 'Educación',
      sql: `
DROP TABLE IF EXISTS prestamos_libros CASCADE;
DROP TABLE IF EXISTS libros CASCADE;
DROP TABLE IF EXISTS autores CASCADE;
DROP TABLE IF EXISTS socios CASCADE;

CREATE TABLE autores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    nacionalidad VARCHAR(50),
    año_nacimiento INTEGER
);

CREATE TABLE socios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE libros (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    isbn VARCHAR(20) UNIQUE NOT NULL,
    autor_id INTEGER NOT NULL,
    año_publicacion INTEGER,
    ejemplares_disponibles INTEGER DEFAULT 1,
    FOREIGN KEY (autor_id) REFERENCES autores(id)
);

CREATE TABLE prestamos_libros (
    id SERIAL PRIMARY KEY,
    libro_id INTEGER NOT NULL,
    socio_id INTEGER NOT NULL,
    fecha_prestamo DATE DEFAULT CURRENT_DATE,
    fecha_devolucion_esperada DATE DEFAULT CURRENT_DATE + 14,
    devuelto BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (libro_id) REFERENCES libros(id),
    FOREIGN KEY (socio_id) REFERENCES socios(id)
);

INSERT INTO autores (nombre, nacionalidad, año_nacimiento) VALUES
('Gabriel García Márquez', 'Colombiana', 1927),
('Jorge Luis Borges', 'Argentina', 1899),
('Isabel Allende', 'Chilena', 1942),
('Miguel de Cervantes', 'Española', 1547);

INSERT INTO socios (nombre, email) VALUES
('David Castillo', 'david@mail.com'),
('Sofía Alarcón', 'sofia@mail.com'),
('Lucas Vega', 'lucas@mail.com');

INSERT INTO libros (titulo, isbn, autor_id, año_publicacion, ejemplares_disponibles) VALUES
('Cien años de soledad', '978-0307474728', 1, 1967, 3),
('Ficciones', '978-0307950925', 2, 1944, 2),
('La casa de los espíritus', '978-0525433477', 3, 1982, 4),
('El Aleph', '978-8420658421', 2, 1949, 1),
('Don Quijote de la Mancha', '978-8424116286', 4, 1605, 5);

INSERT INTO prestamos_libros (libro_id, socio_id, devuelto) VALUES
(1, 1, false),
(2, 2, true),
(3, 3, false);
`
    },
    {
      id: 'universidad',
      name: 'universidad',
      displayName: 'Universidad',
      description: 'Campus universitario con facultades, profesores, asignaturas, estudiantes y notas.',
      icon: 'graduation-cap',
      badge: 'Académico',
      sql: `
DROP TABLE IF EXISTS matriculas CASCADE;
DROP TABLE IF EXISTS cursos CASCADE;
DROP TABLE IF EXISTS profesores CASCADE;
DROP TABLE IF EXISTS estudiantes CASCADE;

CREATE TABLE profesores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    departamento VARCHAR(80) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE estudiantes (
    id SERIAL PRIMARY KEY,
    matricula VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    carrera VARCHAR(80) NOT NULL,
    semestre INTEGER DEFAULT 1
);

CREATE TABLE cursos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(10) UNIQUE NOT NULL,
    nombre VARCHAR(120) NOT NULL,
    creditos INTEGER NOT NULL,
    profesor_id INTEGER,
    FOREIGN KEY (profesor_id) REFERENCES profesores(id)
);

CREATE TABLE matriculas (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    curso_id INTEGER NOT NULL,
    calificacion DECIMAL(4,2),
    FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id),
    FOREIGN KEY (curso_id) REFERENCES cursos(id)
);

INSERT INTO profesores (nombre, departamento, email) VALUES
('Dr. Alberto Einstein', 'Física y Matemáticas', 'einstein@uni.edu'),
('Dra. Ada Lovelace', 'Ciencias de la Computación', 'ada@uni.edu'),
('Dr. Alan Turing', 'Inteligencia Artificial', 'turing@uni.edu');

INSERT INTO estudiantes (matricula, nombre, carrera, semestre) VALUES
('EST-2024-001', 'Camila Ortiz', 'Ingeniería de Software', 4),
('EST-2024-002', 'Mateo Rivas', 'Ciencia de Datos', 3),
('EST-2024-003', 'Valeria Paredes', 'Ingeniería de Software', 5);

INSERT INTO cursos (codigo, codigo_carrera_ref, creditos, profesor_id) 
SELECT 'CS-101', 'Bases de Datos Relacionales', 4, 2;

-- Renombrando columnas consistentes
ALTER TABLE cursos RENAME COLUMN codigo_carrera_ref TO nombre;

INSERT INTO cursos (codigo, nombre, creditos, profesor_id) VALUES
('CS-202', 'Algoritmos y Complejidad', 5, 3),
('MAT-105', 'Álgebra Lineal Aplicada', 4, 1);

INSERT INTO matriculas (estudiante_id, curso_id, calificacion) VALUES
(1, 1, 9.5),
(1, 2, 8.7),
(2, 1, 9.0),
(3, 3, 7.8);
`
    },
    {
      id: 'hospital',
      name: 'hospital',
      displayName: 'Hospital Clínico',
      description: 'Gestión hospitalaria con especialidades, médicos, pacientes, historias clínicas y citas.',
      icon: 'activity',
      badge: 'Salud',
      sql: `
DROP TABLE IF EXISTS recetas CASCADE;
DROP TABLE IF EXISTS citas CASCADE;
DROP TABLE IF EXISTS medicos CASCADE;
DROP TABLE IF EXISTS pacientes CASCADE;

CREATE TABLE pacientes (
    id SERIAL PRIMARY KEY,
    historia_clinica VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    grupo_sanguineo VARCHAR(5)
);

CREATE TABLE medicos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    especialidad VARCHAR(80) NOT NULL,
    colegiatura VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE citas (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL,
    medico_id INTEGER NOT NULL,
    fecha_hora TIMESTAMP NOT NULL,
    motivo TEXT,
    estado VARCHAR(30) DEFAULT 'Programada',
    FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
    FOREIGN KEY (medico_id) REFERENCES medicos(id)
);

CREATE TABLE recetas (
    id SERIAL PRIMARY KEY,
    cita_id INTEGER NOT NULL,
    medicamento VARCHAR(120) NOT NULL,
    dosis VARCHAR(100) NOT NULL,
    duracion_dias INTEGER NOT NULL,
    FOREIGN KEY (cita_id) REFERENCES citas(id)
);

INSERT INTO pacientes (historia_clinica, nombre, fecha_nacimiento, grupo_sanguineo) VALUES
('HC-00912', 'Guillermo Barros', '1988-06-14', 'O+'),
('HC-00913', 'Beatriz Pinzón', '1995-11-23', 'A+'),
('HC-00914', 'Armando Mendoza', '1982-03-30', 'B+');

INSERT INTO medicos (nombre, especialidad, colegiatura) VALUES
('Dra. Juana de Arco', 'Cardiología', 'MED-4412'),
('Dr. Gregorio Casas', 'Medicina Interna', 'MED-9811');

INSERT INTO citas (paciente_id, medico_id, fecha_hora, motivo, estado) VALUES
(1, 1, CURRENT_TIMESTAMP + INTERVAL '1 day', 'Chequeo cardiológico regular', 'Programada'),
(2, 2, CURRENT_TIMESTAMP - INTERVAL '2 days', 'Dolor abdominal agudo', 'Atendida');

INSERT INTO recetas (cita_id, medicamento, dosis, duracion_dias) VALUES
(2, 'Omeprazol 20mg', '1 cápsula en ayunas', 14);
`
    },
    {
      id: 'empleados',
      name: 'empleados',
      displayName: 'Sistema de Empleados',
      description: 'Recursos humanos con departamentos, cargos, salarios, proyectos y asignaciones.',
      icon: 'briefcase',
      badge: 'Empresarial',
      sql: `
DROP TABLE IF EXISTS asignaciones_proyecto CASCADE;
DROP TABLE IF EXISTS proyectos CASCADE;
DROP TABLE IF EXISTS empleados CASCADE;
DROP TABLE IF EXISTS departamentos CASCADE;

CREATE TABLE departamentos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL,
    presupuesto_anual DECIMAL(12,2)
);

CREATE TABLE empleados (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    puesto VARCHAR(80) NOT NULL,
    salario DECIMAL(10,2) NOT NULL,
    departamento_id INTEGER,
    fecha_contratacion DATE DEFAULT CURRENT_DATE,
    FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

CREATE TABLE proyectos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    fecha_inicio DATE DEFAULT CURRENT_DATE,
    estado VARCHAR(30) DEFAULT 'En Curso'
);

CREATE TABLE asignaciones_proyecto (
    id SERIAL PRIMARY KEY,
    empleado_id INTEGER NOT NULL,
    proyecto_id INTEGER NOT NULL,
    horas_semanales INTEGER DEFAULT 20,
    FOREIGN KEY (empleado_id) REFERENCES empleados(id),
    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

INSERT INTO departamentos (nombre, presupuesto_anual) VALUES
('Tecnología', 450000.00),
('Marketing', 180000.00),
('Ventas', 220000.00),
('Recursos Humanos', 95000.00);

INSERT INTO empleados (nombre, puesto, salario, departamento_id) VALUES
('Federico Díaz', 'Arquitecto Cloud', 4500.00, 1),
('Sonia Benítez', 'Product Designer', 3200.00, 1),
('Rodrigo Luján', 'Especialista SEO', 2600.00, 2),
('Paula Santillán', 'Account Executive', 2800.00, 3);

INSERT INTO proyectos (nombre) VALUES
('Rediseño Plataforma Web 2026'),
('Campaña Expansión Regional');

INSERT INTO asignaciones_proyecto (empleado_id, proyecto_id, horas_semanales) VALUES
(1, 1, 30),
(2, 1, 35),
(3, 2, 25);
`
    },
    {
      id: 'restaurante',
      name: 'restaurante',
      displayName: 'Restaurante Gourmet',
      description: 'Gestión gastronómica con menú, mesas, camareros, pedidos de cocina y cuentas.',
      icon: 'utensils',
      badge: 'Servicios',
      sql: `
DROP TABLE IF EXISTS ordenes_platos CASCADE;
DROP TABLE IF EXISTS ordenes CASCADE;
DROP TABLE IF EXISTS platos CASCADE;
DROP TABLE IF EXISTS mesas CASCADE;

CREATE TABLE mesas (
    id SERIAL PRIMARY KEY,
    numero INTEGER UNIQUE NOT NULL,
    capacidad INTEGER NOT NULL,
    ubicacion VARCHAR(50) DEFAULT 'Salón Principal'
);

CREATE TABLE platos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    categoria VARCHAR(50) NOT NULL, -- Entrada, Principal, Postre, Bebida
    precio DECIMAL(8,2) NOT NULL,
    disponible BOOLEAN DEFAULT TRUE
);

CREATE TABLE ordenes (
    id SERIAL PRIMARY KEY,
    mesa_id INTEGER NOT NULL,
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    camarero VARCHAR(80),
    total DECIMAL(10,2) DEFAULT 0.00,
    estado VARCHAR(30) DEFAULT 'Abierta',
    FOREIGN KEY (mesa_id) REFERENCES mesas(id)
);

CREATE TABLE ordenes_platos (
    id SERIAL PRIMARY KEY,
    orden_id INTEGER NOT NULL,
    plato_id INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    notas TEXT,
    FOREIGN KEY (orden_id) REFERENCES ordenes(id),
    FOREIGN KEY (plato_id) REFERENCES platos(id)
);

INSERT INTO mesas (numero, capacidad, ubicacion) VALUES
(1, 4, 'Terraza'),
(2, 2, 'Salón Principal'),
(3, 6, 'Área VIP'),
(4, 4, 'Salón Principal');

INSERT INTO platos (nombre, categoria, precio) VALUES
('Carpaccio de Salmón', 'Entrada', 14.50),
('Risotto de Hongos Silvestres', 'Principal', 22.00),
('Bife de Chorizo a la Brasa', 'Principal', 28.50),
('Tiramisú Artesanal', 'Postre', 8.50),
('Vino Malbec Reserva', 'Bebida', 35.00);

INSERT INTO ordenes (mesa_id, camarero, total, estado) VALUES
(1, 'Esteban', 50.50, 'Cerrada'),
(2, 'Marcela', 28.50, 'En Preparación');

INSERT INTO ordenes_platos (orden_id, plato_id, cantidad) VALUES
(1, 1, 1),
(1, 5, 1),
(2, 3, 1);
`
    },
    {
      id: 'red_social',
      name: 'red_social',
      displayName: 'Red Social',
      description: 'Plataforma social con usuarios, publicaciones, comentarios, likes y amistades.',
      icon: 'users',
      badge: 'Social',
      sql: `
DROP TABLE IF EXISTS reacciones CASCADE;
DROP TABLE IF EXISTS comentarios CASCADE;
DROP TABLE IF EXISTS publicaciones CASCADE;
DROP TABLE IF EXISTS perfiles_usuario CASCADE;

CREATE TABLE perfiles_usuario (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    biografia TEXT,
    verificado BOOLEAN DEFAULT FALSE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE publicaciones (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    contenido TEXT NOT NULL,
    fecha_publicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    contador_likes INTEGER DEFAULT 0,
    FOREIGN KEY (usuario_id) REFERENCES perfiles_usuario(id) ON DELETE CASCADE
);

CREATE TABLE comentarios (
    id SERIAL PRIMARY KEY,
    publicacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    texto TEXT NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES perfiles_usuario(id)
);

CREATE TABLE reacciones (
    id SERIAL PRIMARY KEY,
    publicacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    tipo VARCHAR(20) DEFAULT 'like', -- like, heart, celebrate
    UNIQUE (publicacion_id, usuario_id),
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES perfiles_usuario(id)
);

INSERT INTO perfiles_usuario (username, nombre_completo, biografia, verificado) VALUES
('ada_code', 'Ada Lovelace', 'Pionera de la computación | Algoritmos y lógica', true),
('turing_a', 'Alan Turing', 'Descifrando misterios y construyendo el futuro', true),
('grace_h', 'Grace Hopper', 'Compiladores y sistemas distribuidos', true);

INSERT INTO publicaciones (usuario_id, contenido, contador_likes) VALUES
(1, '¡El primer programa informático de la historia se diseñó en papel! Todo comienza con un buen modelo.', 142),
(2, 'Las máquinas pueden sorprendernos si les damos suficiente libertad de cómputo.', 98),
(3, 'Es más fácil pedir perdón que pedir permiso: ¡itera rápido y mejora tu código!', 215);

INSERT INTO comentarios (publicacion_id, usuario_id, texto) VALUES
(1, 2, 'Totalmente de acuerdo Ada, la matemática pura es la base de todo.'),
(1, 3, '¡Excelente post!');

INSERT INTO reacciones (publicacion_id, usuario_id, tipo) VALUES
(1, 2, 'heart'),
(1, 3, 'celebrate'),
(2, 1, 'like');
`
    }
  ];

  getDatabases(): SampleDatabaseDefinition[] {
    return this.sampleDatabases;
  }

  getDatabaseById(id: string): SampleDatabaseDefinition | undefined {
    return this.sampleDatabases.find(d => d.id === id);
  }
}
