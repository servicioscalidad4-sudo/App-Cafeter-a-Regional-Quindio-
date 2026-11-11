"""
Base de Datos Centralizada SQLite para SISTEMA CRM – DATOS DE CAFETERÍA JARDINES DEL RENACER
"""
import sqlite3
import os
import hashlib
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'cafeteria.db')

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_password(password: str) -> str:
    salt = "RenacerCafeteria_Salt_2026"
    return hashlib.sha256((salt + password).encode('utf-8')).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def init_db():
    conn = get_connection()
    c = conn.cursor()

    # 1. Regionales
    c.execute("""
    CREATE TABLE IF NOT EXISTS regionales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        estado TEXT DEFAULT 'activo'
    );
    """)

    # 2. Sedes
    c.execute("""
    CREATE TABLE IF NOT EXISTS sedes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regional_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        direccion TEXT,
        telefono TEXT,
        estado TEXT DEFAULT 'activo',
        FOREIGN KEY (regional_id) REFERENCES regionales (id)
    );
    """)

    # 3. Roles y Permisos
    c.execute("""
    CREATE TABLE IF NOT EXISTS roles_permisos (
        rol TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        permisos_json TEXT NOT NULL
    );
    """)

    # 4. Usuarios
    c.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre_completo TEXT NOT NULL,
        correo TEXT UNIQUE NOT NULL,
        celular TEXT,
        usuario TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'COORDINADOR',
        regional_id INTEGER,
        sede_id INTEGER,
        cargo TEXT,
        estado TEXT DEFAULT 'pendiente',
        creado_el TEXT NOT NULL,
        ultimo_login TEXT,
        FOREIGN KEY (regional_id) REFERENCES regionales (id),
        FOREIGN KEY (sede_id) REFERENCES sedes (id),
        FOREIGN KEY (rol) REFERENCES roles_permisos (rol)
    );
    """)

    # 5. Coordinadores
    c.execute("""
    CREATE TABLE IF NOT EXISTS coordinadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombres TEXT NOT NULL,
        apellidos TEXT,
        regional_id INTEGER NOT NULL,
        celular TEXT,
        activo INTEGER DEFAULT 1,
        creado_por TEXT,
        creado_el TEXT NOT NULL,
        modificado_el TEXT,
        FOREIGN KEY (regional_id) REFERENCES regionales (id)
    );
    """)

    # 6. Auxiliares
    c.execute("""
    CREATE TABLE IF NOT EXISTS auxiliares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombres TEXT NOT NULL,
        apellidos TEXT,
        documento TEXT,
        telefono TEXT,
        activo INTEGER DEFAULT 1,
        creado_el TEXT NOT NULL
    );
    """)

    # 7. Tarifas Anuales
    c.execute("""
    CREATE TABLE IF NOT EXISTS tarifas_anuales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anio INTEGER NOT NULL,
        regional_id INTEGER NOT NULL,
        sede_id INTEGER,
        valor_hora_diurna REAL NOT NULL,
        valor_hora_nocturna REAL NOT NULL,
        vigencia_desde TEXT,
        vigencia_hasta TEXT,
        activo INTEGER DEFAULT 1,
        creado_por TEXT,
        creado_el TEXT NOT NULL,
        FOREIGN KEY (regional_id) REFERENCES regionales (id),
        FOREIGN KEY (sede_id) REFERENCES sedes (id)
    );
    """)

    # 8. Registros de Cafetería
    c.execute("""
    CREATE TABLE IF NOT EXISTS registros_cafeteria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        consecutivo TEXT UNIQUE,
        fecha TEXT NOT NULL,
        regional_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        auxiliar_id INTEGER,
        auxiliar_nombre TEXT NOT NULL,
        nombre_fallecido TEXT NOT NULL,
        prestacion TEXT NOT NULL,
        hora_ingreso TEXT NOT NULL,
        hora_salida TEXT NOT NULL,
        total_horas REAL NOT NULL,
        horas_diurnas REAL DEFAULT 0,
        horas_nocturnas REAL DEFAULT 0,
        turno TEXT NOT NULL,
        valor_hora_diurna REAL DEFAULT 0,
        valor_hora_nocturna REAL DEFAULT 0,
        valor_a_pagar REAL NOT NULL,
        coordinador_id INTEGER,
        coordinador_nombre TEXT NOT NULL,
        obs_admon TEXT,
        usuario_creador_id INTEGER,
        usuario_modificador_id INTEGER,
        creado_el TEXT NOT NULL,
        modificado_el TEXT,
        estado TEXT DEFAULT 'activo',
        motivo_anulacion TEXT,
        FOREIGN KEY (regional_id) REFERENCES regionales (id),
        FOREIGN KEY (sede_id) REFERENCES sedes (id),
        FOREIGN KEY (auxiliar_id) REFERENCES auxiliares (id),
        FOREIGN KEY (coordinador_id) REFERENCES coordinadores (id),
        FOREIGN KEY (usuario_creador_id) REFERENCES usuarios (id),
        FOREIGN KEY (usuario_modificador_id) REFERENCES usuarios (id)
    );
    """)

    # 9. Configuración del Sistema
    c.execute("""
    CREATE TABLE IF NOT EXISTS configuracion (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        descripcion TEXT,
        modificado_por TEXT,
        modificado_el TEXT
    );
    """)

    # 10. Auditoría y Trazabilidad
    c.execute("""
    CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        usuario_nombre TEXT,
        accion TEXT NOT NULL,
        tabla TEXT NOT NULL,
        registro_id TEXT,
        valor_anterior TEXT,
        valor_nuevo TEXT,
        ip TEXT,
        fecha_hora TEXT NOT NULL
    );
    """)

    # Índices de alto rendimiento
    c.execute("CREATE INDEX IF NOT EXISTS idx_reg_fecha ON registros_cafeteria(fecha);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_reg_regional ON registros_cafeteria(regional_id);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_reg_sede ON registros_cafeteria(sede_id);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_reg_estado ON registros_cafeteria(estado);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_tarifas_anio_reg ON tarifas_anuales(anio, regional_id);")

    # Inserción de Roles iniciales
    roles = [
        ('ADMINISTRADOR', 'Administrador General', json.dumps({
            'all_regionals': True,
            'manage_users': True,
            'manage_rates': True,
            'manage_coordinators': True,
            'manage_sedes': True,
            'view_audit': True,
            'edit_all_records': True,
            'export_reports': True
        })),
        ('COORDINADOR', 'Coordinador Regional', json.dumps({
            'all_regionals': False,
            'manage_users': False,
            'manage_rates': False,
            'manage_coordinators': False,
            'manage_sedes': False,
            'view_audit': False,
            'edit_own_records': True,
            'export_reports': True,
            'send_whatsapp': True
        })),
        ('AUXILIAR', 'Auxiliar Operativo', json.dumps({
            'all_regionals': False,
            'manage_users': False,
            'manage_rates': False,
            'manage_coordinators': False,
            'manage_sedes': False,
            'view_audit': False,
            'edit_own_records': False,
            'export_reports': False,
            'send_whatsapp': False
        }))
    ]
    c.executemany("INSERT OR IGNORE INTO roles_permisos (rol, nombre, permisos_json) VALUES (?, ?, ?)", roles)

    # Inserción de Regional Quindío
    c.execute("INSERT OR IGNORE INTO regionales (id, codigo, nombre, estado) VALUES (1, 'QUINDIO', 'Regional Quindío', 'activo')")

    # Inserción de Sedes Iniciales de Quindío
    sedes = [
        (1, 1, 'Armenia', 'Sede Principal Armenia', '6067400000', 'activo'),
        (2, 1, 'Calarcá', 'Sede Calarcá', '', 'activo'),
        (3, 1, 'Circasia', 'Sede Circasia', '', 'activo'),
        (4, 1, 'Córdoba', 'Sede Córdoba', '', 'activo'),
        (5, 1, 'Génova', 'Sede Génova', '', 'activo'),
        (6, 1, 'La Tebaida', 'Sede La Tebaida', '', 'activo'),
        (7, 1, 'Montenegro', 'Sede Montenegro', '', 'activo'),
        (8, 1, 'Pijao', 'Sede Pijao', '', 'activo'),
        (9, 1, 'Quimbaya', 'Sede Quimbaya', '', 'activo'),
        (10, 1, 'Barcelona', 'Sede Barcelona', '', 'activo')
    ]
    c.executemany("INSERT OR IGNORE INTO sedes (id, regional_id, nombre, direccion, telefono, estado) VALUES (?, ?, ?, ?, ?, ?)", sedes)

    # Usuario Administrador Inicial
    admin_hash = hash_password("admin123")
    c.execute("""
    INSERT OR IGNORE INTO usuarios (id, nombre_completo, correo, celular, usuario, password_hash, rol, regional_id, sede_id, cargo, estado, creado_el)
    VALUES (1, 'Administrador Central', 'admin@jardinesdelrenacer.com', '3100000000', 'admin', ?, 'ADMINISTRADOR', 1, 1, 'Director de Operaciones', 'activo', ?)
    """, (admin_hash, datetime.now().isoformat()))

    # Usuario Coordinador Demo
    coord_hash = hash_password("coord123")
    c.execute("""
    INSERT OR IGNORE INTO usuarios (id, nombre_completo, correo, celular, usuario, password_hash, rol, regional_id, sede_id, cargo, estado, creado_el)
    VALUES (2, 'Coordinador Armenia', 'coordinador.armenia@jardinesdelrenacer.com', '3110000000', 'coordinador', ?, 'COORDINADOR', 1, 1, 'Coordinador de Servicios', 'activo', ?)
    """, (coord_hash, datetime.now().isoformat()))

    # Configuraciones por defecto
    configs = [
        ('whatsapp_destinatario', '573100000000', 'Número de WhatsApp corporativo para reportes con indicativo internacional'),
        ('app_nombre', 'SISTEMA CRM – DATOS DE CAFETERÍA JARDINES DEL RENACER', 'Nombre oficial de la aplicación'),
        ('empresa', 'Jardines del Renacer S.A.S.', 'Razón social'),
        ('logo_url', 'https://i.ibb.co/3ykS8mS/JR-Logo.png', 'URL del logo institucional'),
        ('hora_inicio_nocturno', '21:00', 'Hora de inicio de recargo nocturno'),
        ('hora_fin_nocturno', '06:00', 'Hora de fin de recargo nocturno')
    ]
    c.executemany("INSERT OR IGNORE INTO configuracion (clave, valor, descripcion) VALUES (?, ?, ?)", configs)

    conn.commit()
    conn.close()
    print("Base de datos inicializada correctamente.")

def registrar_auditoria(usuario_id, usuario_nombre, accion, tabla, registro_id, valor_anterior=None, valor_nuevo=None, ip='127.0.0.1'):
    try:
        conn = get_connection()
        c = conn.cursor()
        c.execute("""
        INSERT INTO auditoria (usuario_id, usuario_nombre, accion, tabla, registro_id, valor_anterior, valor_nuevo, ip, fecha_hora)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            usuario_id,
            usuario_nombre,
            accion,
            tabla,
            str(registro_id) if registro_id else None,
            json.dumps(valor_anterior, ensure_ascii=False) if isinstance(valor_anterior, (dict, list)) else (str(valor_anterior) if valor_anterior else None),
            json.dumps(valor_nuevo, ensure_ascii=False) if isinstance(valor_nuevo, (dict, list)) else (str(valor_nuevo) if valor_nuevo else None),
            ip,
            datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error registrando auditoría: {e}")

if __name__ == '__main__':
    init_db()
