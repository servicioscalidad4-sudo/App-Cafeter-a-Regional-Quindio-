"""
Servidor Backend REST API y Servidor Web para
SISTEMA CRM – DATOS DE CAFETERÍA JARDINES DEL RENACER
"""
import http.server
import socketserver
import os
import json
import urllib.parse
import uuid
from datetime import datetime, timedelta
import sqlite3
import mimetypes

from database import (
    get_connection, hash_password, verify_password,
    registrar_auditoria, DB_PATH
)

PORT = 8080
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

# In-memory active sessions: token -> {user_id, rol, regional_id, sede_id, expires}
SESSIONS = {}

def create_session(user_row):
    token = str(uuid.uuid4())
    expires_dt = datetime.now() + timedelta(days=7)
    SESSIONS[token] = {
        'id': user_row['id'],
        'usuario': user_row['usuario'],
        'nombre_completo': user_row['nombre_completo'],
        'rol': user_row['rol'],
        'regional_id': user_row['regional_id'],
        'sede_id': user_row['sede_id'],
        'cargo': user_row['cargo'],
        'expires': expires_dt,
        'expires_iso': expires_dt.isoformat()
    }
    return token

def get_current_user(headers):
    auth = headers.get('Authorization', '')
    token = None
    if auth.startswith('Bearer '):
        token = auth[7:].strip()
    elif 'Cookie' in headers:
        cookies = headers['Cookie'].split(';')
        for c in cookies:
            c = c.strip()
            if c.startswith('token='):
                token = c[6:].strip()
    
    if not token or token not in SESSIONS:
        return None
    
    session = SESSIONS[token]
    if datetime.now() > session['expires']:
        del SESSIONS[token]
        return None
    return session

def calculate_hours_and_shift(h_in_str, h_out_str):
    try:
        h_in, m_in = map(int, h_in_str.split(':'))
        h_out, m_out = map(int, h_out_str.split(':'))
    except:
        return 0, 0, 0, 'Turno Diurno'
    
    t_in = h_in * 60 + m_in
    t_out = h_out * 60 + m_out
    
    if t_out <= t_in:
        total_mins = (24 * 60 - t_in) + t_out
    else:
        total_mins = t_out - t_in
        
    total_hours = round(total_mins / 60.0, 2)
    
    day_mins = 0
    night_mins = 0
    curr = t_in
    for _ in range(total_mins):
        minute_of_day = curr % (24 * 60)
        # Daytime: 06:00 to 21:00 (minute 360 to 1260)
        if 360 <= minute_of_day < 1260:
            day_mins += 1
        else:
            night_mins += 1
        curr += 1
        
    day_hours = round(day_mins / 60.0, 2)
    night_hours = round(night_mins / 60.0, 2)
    
    if night_hours == 0:
        turno = 'Turno Diurno'
    elif day_hours == 0:
        turno = 'Turno Nocturno'
    else:
        turno = 'Turno Mixto'
        
    return total_hours, day_hours, night_hours, turno

class AppRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local testing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 0:
            body = self.rfile.read(content_length).decode('utf-8')
            return json.loads(body)
        return {}

    # -----------------------------
    # ROUTE DISPATCHER
    # -----------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path.startswith('/api/'):
            return self.handle_api_get(path, params)

        # Static files serving
        if path == '/' or path == '':
            file_path = os.path.join(PUBLIC_DIR, 'index.html')
        else:
            clean_path = path.lstrip('/')
            file_path = os.path.join(PUBLIC_DIR, clean_path)

        if os.path.exists(file_path) and os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime_type or 'application/octet-stream')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        else:
            # Fallback to index.html for SPA routing
            fallback = os.path.join(PUBLIC_DIR, 'index.html')
            if os.path.exists(fallback):
                with open(fallback, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/'):
            return self.handle_api_post(path)
        self.send_json({'error': 'Method not allowed'}, 405)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/'):
            return self.handle_api_put(path)
        self.send_json({'error': 'Method not allowed'}, 405)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path.startswith('/api/'):
            return self.handle_api_delete(path)
        self.send_json({'error': 'Method not allowed'}, 405)

    # -----------------------------
    # API HANDLERS - GET
    # -----------------------------
    def handle_api_get(self, path, params):
        user = get_current_user(self.headers)
        conn = get_connection()
        c = conn.cursor()

        # Public / Session check
        if path == '/api/auth/session':
            if user:
                return self.send_json({'authenticated': True, 'user': user})
            return self.send_json({'authenticated': False})

        # All other endpoints require authentication
        if not user:
            conn.close()
            return self.send_json({'error': 'No autorizado. Debe iniciar sesión.'}, 401)

        # 1. Regiones y Sedes
        if path == '/api/regionales':
            c.execute("SELECT * FROM regionales WHERE estado = 'activo' ORDER BY nombre")
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'regionales': rows})

        if path == '/api/sedes':
            regional_id = params.get('regional_id', [None])[0]
            if regional_id:
                c.execute("SELECT * FROM sedes WHERE regional_id = ? AND estado = 'activo' ORDER BY nombre", (regional_id,))
            else:
                c.execute("SELECT * FROM sedes WHERE estado = 'activo' ORDER BY nombre")
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'sedes': rows})

        # 2. Coordinadores
        if path == '/api/coordinadores':
            regional_id = params.get('regional_id', [None])[0]
            query = "SELECT c.*, r.nombre as regional_nombre FROM coordinadores c JOIN regionales r ON c.regional_id = r.id WHERE 1=1"
            q_args = []
            if regional_id:
                query += " AND c.regional_id = ?"
                q_args.append(regional_id)
            elif user['rol'] != 'ADMINISTRADOR':
                query += " AND c.regional_id = ?"
                q_args.append(user['regional_id'])
            query += " ORDER BY c.nombres"
            c.execute(query, q_args)
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'coordinadores': rows})

        # 3. Auxiliares
        if path == '/api/auxiliares':
            c.execute("SELECT * FROM auxiliares WHERE activo = 1 ORDER BY nombres")
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'auxiliares': rows})

        # 4. Tarifas
        if path == '/api/tarifas':
            anio = params.get('anio', [None])[0]
            query = """
            SELECT t.*, r.nombre as regional_nombre, s.nombre as sede_nombre 
            FROM tarifas_anuales t
            JOIN regionales r ON t.regional_id = r.id
            LEFT JOIN sedes s ON t.sede_id = s.id
            WHERE 1=1
            """
            q_args = []
            if anio:
                query += " AND t.anio = ?"
                q_args.append(anio)
            if user['rol'] != 'ADMINISTRADOR':
                query += " AND t.regional_id = ?"
                q_args.append(user['regional_id'])
            query += " ORDER BY t.anio DESC, r.nombre, s.nombre"
            c.execute(query, q_args)
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'tarifas': rows})

        # 5. Dashboard Stats & Charts
        if path == '/api/dashboard/stats':
            anio = params.get('anio', [None])[0]
            mes = params.get('mes', [None])[0]
            regional_id = params.get('regional_id', [None])[0]
            sede_id = params.get('sede_id', [None])[0]

            # Role restriction: coordinators only see their regional
            if user['rol'] != 'ADMINISTRADOR':
                regional_id = str(user['regional_id'])

            where_clauses = ["r.estado = 'activo'"]
            q_args = []

            if anio:
                where_clauses.append("strftime('%Y', r.fecha) = ?")
                q_args.append(str(anio))
            if mes:
                where_clauses.append("strftime('%m', r.fecha) = ?")
                q_args.append(f"{int(mes):02d}")
            if regional_id:
                where_clauses.append("r.regional_id = ?")
                q_args.append(regional_id)
            if sede_id:
                where_clauses.append("r.sede_id = ?")
                q_args.append(sede_id)

            where_sql = " AND ".join(where_clauses)

            # KPIs
            c.execute(f"""
            SELECT 
                COUNT(*) as total_servicios,
                COALESCE(SUM(r.valor_a_pagar), 0) as total_gasto,
                COALESCE(SUM(r.total_horas), 0) as total_horas,
                COALESCE(SUM(r.horas_diurnas), 0) as horas_diurnas,
                COALESCE(SUM(r.horas_nocturnas), 0) as horas_nocturnas,
                COALESCE(AVG(r.valor_a_pagar), 0) as promedio_servicio
            FROM registros_cafeteria r
            WHERE {where_sql}
            """, q_args)
            kpis = dict(c.fetchone())

            # Distribution by Sede
            c.execute(f"""
            SELECT s.nombre as sede, COUNT(r.id) as cantidad, COALESCE(SUM(r.valor_a_pagar), 0) as total_gasto
            FROM sedes s
            LEFT JOIN registros_cafeteria r ON s.id = r.sede_id AND {where_sql}
            GROUP BY s.id
            ORDER BY total_gasto DESC
            """, q_args)
            sedes_data = [dict(r) for r in c.fetchall()]

            # Distribution by Turno
            c.execute(f"""
            SELECT r.turno, COUNT(*) as cantidad, COALESCE(SUM(r.valor_a_pagar), 0) as total_gasto
            FROM registros_cafeteria r
            WHERE {where_sql}
            GROUP BY r.turno
            """, q_args)
            turnos_data = [dict(r) for r in c.fetchall()]

            # Monthly Trend
            c.execute(f"""
            SELECT strftime('%Y-%m', r.fecha) as mes_anio, COUNT(*) as cantidad, COALESCE(SUM(r.valor_a_pagar), 0) as total_gasto
            FROM registros_cafeteria r
            WHERE {where_sql}
            GROUP BY mes_anio
            ORDER BY mes_anio ASC
            """, q_args)
            tendencia_mensual = [dict(r) for r in c.fetchall()]

            # Top Auxiliares
            c.execute(f"""
            SELECT r.auxiliar_nombre, COUNT(*) as cantidad, COALESCE(SUM(r.valor_a_pagar), 0) as total_gasto
            FROM registros_cafeteria r
            WHERE {where_sql}
            GROUP BY r.auxiliar_nombre
            ORDER BY total_gasto DESC
            LIMIT 10
            """, q_args)
            top_auxiliares = [dict(r) for r in c.fetchall()]

            conn.close()
            return self.send_json({
                'kpis': kpis,
                'sedes': sedes_data,
                'turnos': turnos_data,
                'tendencia': tendencia_mensual,
                'top_auxiliares': top_auxiliares
            })

        # 6. Registros Cafetería (List with filters & pagination)
        if path == '/api/registros':
            page = int(params.get('page', ['1'])[0])
            limit = int(params.get('limit', ['50'])[0])
            offset = (page - 1) * limit

            search = params.get('q', [None])[0]
            regional_id = params.get('regional_id', [None])[0]
            sede_id = params.get('sede_id', [None])[0]
            fecha_desde = params.get('fecha_desde', [None])[0]
            fecha_hasta = params.get('fecha_hasta', [None])[0]
            coord_id = params.get('coordinador_id', [None])[0]
            aux_id = params.get('auxiliar_id', [None])[0]
            turno = params.get('turno', [None])[0]
            estado = params.get('estado', ['activo'])[0]

            if user['rol'] != 'ADMINISTRADOR':
                regional_id = str(user['regional_id'])

            where_clauses = ["1=1"]
            q_args = []

            if estado:
                where_clauses.append("r.estado = ?")
                q_args.append(estado)
            if regional_id:
                where_clauses.append("r.regional_id = ?")
                q_args.append(regional_id)
            if sede_id:
                where_clauses.append("r.sede_id = ?")
                q_args.append(sede_id)
            if fecha_desde:
                where_clauses.append("r.fecha >= ?")
                q_args.append(fecha_desde)
            if fecha_hasta:
                where_clauses.append("r.fecha <= ?")
                q_args.append(fecha_hasta)
            if coord_id:
                where_clauses.append("r.coordinador_id = ?")
                q_args.append(coord_id)
            if aux_id:
                where_clauses.append("r.auxiliar_id = ?")
                q_args.append(aux_id)
            if turno:
                where_clauses.append("r.turno = ?")
                q_args.append(turno)
            if search:
                where_clauses.append("(r.nombre_fallecido LIKE ? OR r.prestacion LIKE ? OR r.auxiliar_nombre LIKE ? OR r.consecutivo LIKE ?)")
                term = f"%{search}%"
                q_args.extend([term, term, term, term])

            where_sql = " AND ".join(where_clauses)

            # Count total
            c.execute(f"SELECT COUNT(*) as count FROM registros_cafeteria r WHERE {where_sql}", q_args)
            total_items = c.fetchone()['count']

            # Query items
            query = f"""
            SELECT r.*, reg.nombre as regional_nombre, s.nombre as sede_nombre
            FROM registros_cafeteria r
            JOIN regionales reg ON r.regional_id = reg.id
            JOIN sedes s ON r.sede_id = s.id
            WHERE {where_sql}
            ORDER BY r.fecha DESC, r.id DESC
            LIMIT ? OFFSET ?
            """
            c.execute(query, q_args + [limit, offset])
            rows = [dict(row) for row in c.fetchall()]

            conn.close()
            return self.send_json({
                'data': rows,
                'pagination': {
                    'total': total_items,
                    'page': page,
                    'limit': limit,
                    'pages': (total_items + limit - 1) // limit if total_items > 0 else 1
                }
            })

        # Single Registro Detail
        if path.startswith('/api/registros/'):
            reg_id = path.split('/')[-1]
            c.execute("""
            SELECT r.*, reg.nombre as regional_nombre, s.nombre as sede_nombre
            FROM registros_cafeteria r
            JOIN regionales reg ON r.regional_id = reg.id
            JOIN sedes s ON r.sede_id = s.id
            WHERE r.id = ?
            """, (reg_id,))
            row = c.fetchone()
            conn.close()
            if row:
                return self.send_json({'registro': dict(row)})
            return self.send_json({'error': 'Registro no encontrado'}, 404)

        # 7. Auditoría
        if path == '/api/auditoria':
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            limit = int(params.get('limit', ['100'])[0])
            c.execute("SELECT * FROM auditoria ORDER BY id DESC LIMIT ?", (limit,))
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'auditoria': rows})

        # 8. Usuarios del sistema (Admin only)
        if path == '/api/auth/users':
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            c.execute("""
            SELECT u.id, u.nombre_completo, u.correo, u.celular, u.usuario, u.rol, 
                   u.regional_id, u.sede_id, u.cargo, u.estado, u.creado_el, u.ultimo_login,
                   r.nombre as regional_nombre, s.nombre as sede_nombre
            FROM usuarios u
            LEFT JOIN regionales r ON u.regional_id = r.id
            LEFT JOIN sedes s ON u.sede_id = s.id
            ORDER BY u.id DESC
            """)
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
            return self.send_json({'usuarios': rows})

        # 9. Configuración del sistema
        if path == '/api/configuracion':
            c.execute("SELECT clave, valor, descripcion FROM configuracion")
            rows = {r['clave']: r['valor'] for r in c.fetchall()}
            conn.close()
            return self.send_json({'configuracion': rows})

        # 10. Export to Excel CSV
        if path == '/api/export/csv':
            c.execute("""
            SELECT r.consecutivo, r.fecha, reg.nombre as regional, s.nombre as sede,
                   r.auxiliar_nombre, r.nombre_fallecido, r.prestacion, r.hora_ingreso,
                   r.hora_salida, r.total_horas, r.horas_diurnas, r.horas_nocturnas,
                   r.turno, r.valor_hora_diurna, r.valor_hora_nocturna, r.valor_a_pagar,
                   r.coordinador_nombre, r.obs_admon, r.estado
            FROM registros_cafeteria r
            JOIN regionales reg ON r.regional_id = reg.id
            JOIN sedes s ON r.sede_id = s.id
            WHERE r.estado = 'activo'
            ORDER BY r.fecha DESC
            """)
            rows = c.fetchall()
            conn.close()

            # UTF-8 BOM + CSV
            csv_lines = ['\ufeff"CONSECUTIVO";"FECHA";"REGIONAL";"SEDE";"AUXILIAR";"FALLECIDO";"PRESTACION";"INGRESO";"SALIDA";"TOTAL HORAS";"HORAS DIURNAS";"HORAS NOCTURNAS";"TURNO";"V. HORAS DIURNAS";"V. HORAS NOCTURNAS";"TOTAL A PAGAR";"COORDINADOR";"OBSERVACIONES";"ESTADO"']
            for row in rows:
                csv_lines.append(
                    f'"{row["consecutivo"]}";"{row["fecha"]}";"{row["regional"]}";"{row["sede"]}";'
                    f'"{row["auxiliar_nombre"]}";"{row["nombre_fallecido"]}";"{row["prestacion"]}";'
                    f'"{row["hora_ingreso"]}";"{row["hora_salida"]}";"{row["total_horas"]}";'
                    f'"{row["horas_diurnas"]}";"{row["horas_nocturnas"]}";"{row["turno"]}";'
                    f'"{row["valor_hora_diurna"]}";"{row["valor_hora_nocturna"]}";"{row["valor_a_pagar"]}";'
                    f'"{row["coordinador_nombre"]}";"{row["obs_admon"]}";"{row["estado"]}"'
                )
            csv_content = "\r\n".join(csv_lines).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', 'attachment; filename="Reporte_Cafeteria_Jardines_Del_Renacer.csv"')
            self.send_header('Content-Length', str(len(csv_content)))
            self.end_headers()
            self.wfile.write(csv_content)
            return

        conn.close()
        self.send_json({'error': 'Endpoint no encontrado'}, 404)

    # -----------------------------
    # API HANDLERS - POST
    # -----------------------------
    def handle_api_post(self, path):
        data = self.read_json_body()
        conn = get_connection()
        c = conn.cursor()

        # 1. Login
        if path == '/api/auth/login':
            usuario = data.get('usuario', '').strip()
            password = data.get('password', '')
            if not usuario or not password:
                conn.close()
                return self.send_json({'error': 'Usuario y contraseña requeridos'}, 400)

            c.execute("SELECT * FROM usuarios WHERE usuario = ? OR correo = ?", (usuario, usuario))
            user_row = c.fetchone()
            if not user_row or not verify_password(password, user_row['password_hash']):
                conn.close()
                return self.send_json({'error': 'Credenciales inválidas'}, 401)

            if user_row['estado'] != 'activo':
                conn.close()
                return self.send_json({'error': f'Su cuenta está {user_row["estado"]}. Espere la aprobación del administrador.'}, 403)

            # Update last login
            c.execute("UPDATE usuarios SET ultimo_login = ? WHERE id = ?", (datetime.now().isoformat(), user_row['id']))
            conn.commit()

            token = create_session(user_row)
            registrar_auditoria(user_row['id'], user_row['nombre_completo'], 'LOGIN', 'usuarios', user_row['id'], ip=self.client_address[0])
            conn.close()

            return self.send_json({
                'success': True,
                'token': token,
                'user': SESSIONS[token]
            })

        # 2. Register
        if path == '/api/auth/register':
            nombre = data.get('nombre_completo', '').strip()
            correo = data.get('correo', '').strip()
            celular = data.get('celular', '').strip()
            usuario = data.get('usuario', '').strip()
            password = data.get('password', '')
            regional_id = data.get('regional_id')
            sede_id = data.get('sede_id')
            cargo = data.get('cargo', 'Operativo').strip()

            if not nombre or not correo or not usuario or not password or not regional_id:
                conn.close()
                return self.send_json({'error': 'Todos los campos obligatorios deben ser diligenciados'}, 400)

            # Check duplicate
            c.execute("SELECT id FROM usuarios WHERE usuario = ? OR correo = ?", (usuario, correo))
            if c.fetchone():
                conn.close()
                return self.send_json({'error': 'El nombre de usuario o correo ya se encuentra registrado'}, 409)

            pwd_hash = hash_password(password)
            c.execute("""
            INSERT INTO usuarios (nombre_completo, correo, celular, usuario, password_hash, rol, regional_id, sede_id, cargo, estado, creado_el)
            VALUES (?, ?, ?, ?, ?, 'COORDINADOR', ?, ?, ?, 'pendiente', ?)
            """, (nombre, correo, celular, usuario, pwd_hash, regional_id, sede_id, cargo, datetime.now().isoformat()))
            user_id = c.lastrowid
            conn.commit()

            registrar_auditoria(user_id, nombre, 'REGISTRO_USUARIO', 'usuarios', user_id, valor_nuevo={'correo': correo, 'usuario': usuario}, ip=self.client_address[0])
            conn.close()

            return self.send_json({
                'success': True,
                'message': 'Registro exitoso. Su cuenta ha sido enviada para aprobación del administrador.'
            })

        # 3. Logout
        if path == '/api/auth/logout':
            auth = self.headers.get('Authorization', '')
            if auth.startswith('Bearer '):
                token = auth[7:].strip()
                if token in SESSIONS:
                    del SESSIONS[token]
            conn.close()
            return self.send_json({'success': True})

        # Authenticated endpoints below
        user = get_current_user(self.headers)
        if not user:
            conn.close()
            return self.send_json({'error': 'No autorizado'}, 401)

        # 4. Cálculo instantáneo de horas y tarifas
        if path == '/api/calc/horas-valor':
            fecha = data.get('fecha', datetime.now().strftime('%Y-%m-%d'))
            sede_id = data.get('sede_id')
            regional_id = data.get('regional_id') or user['regional_id']
            h_in = data.get('hora_ingreso', '07:00')
            h_out = data.get('hora_salida', '19:00')

            anio = int(fecha[:4])
            total_h, day_h, night_h, turno = calculate_hours_and_shift(h_in, h_out)

            # Lookup rates for regional, sede and year
            c.execute("""
            SELECT valor_hora_diurna, valor_hora_nocturna 
            FROM tarifas_anuales 
            WHERE anio = ? AND regional_id = ? AND (sede_id = ? OR sede_id IS NULL) AND activo = 1
            ORDER BY sede_id DESC LIMIT 1
            """, (anio, regional_id, sede_id))
            rate_row = c.fetchone()
            if not rate_row:
                # Fallback to closest year
                c.execute("""
                SELECT valor_hora_diurna, valor_hora_nocturna 
                FROM tarifas_anuales 
                WHERE regional_id = ? AND activo = 1
                ORDER BY anio DESC LIMIT 1
                """, (regional_id,))
                rate_row = c.fetchone()

            v_diurna = rate_row['valor_hora_diurna'] if rate_row else 5900.0
            v_nocturna = rate_row['valor_hora_nocturna'] if rate_row else 7500.0

            total_diurno = round(day_h * v_diurna, 2)
            total_nocturno = round(night_h * v_nocturna, 2)
            valor_a_pagar = total_diurno + total_nocturno

            conn.close()
            return self.send_json({
                'total_horas': total_h,
                'horas_diurnas': day_h,
                'horas_nocturnas': night_h,
                'turno': turno,
                'tarifa_hora_diurna': v_diurna,
                'tarifa_hora_nocturna': v_nocturna,
                'subtotal_diurno': total_diurno,
                'subtotal_nocturno': total_nocturno,
                'valor_a_pagar': valor_a_pagar
            })

        # 5. Crear Registro de Cafetería
        if path == '/api/registros':
            regional_id = user['regional_id'] if user['rol'] != 'ADMINISTRADOR' else data.get('regional_id')
            sede_id = data.get('sede_id')
            fecha = data.get('fecha')
            auxiliar_nombre = data.get('auxiliar_nombre', '').strip()
            auxiliar_id = data.get('auxiliar_id')
            nombre_fallecido = data.get('nombre_fallecido', '').strip()
            prestacion = data.get('prestacion', '').strip()
            h_in = data.get('hora_ingreso', '').strip()
            h_out = data.get('hora_salida', '').strip()
            coordinador_id = data.get('coordinador_id')
            obs = data.get('obs_admon', '').strip()

            if not fecha or not sede_id or not auxiliar_nombre or not nombre_fallecido or not prestacion or not h_in or not h_out:
                conn.close()
                return self.send_json({'error': 'Todos los campos obligatorios deben ser diligenciados'}, 400)

            # Derive regional_id from sede if not provided
            if not regional_id:
                c.execute("SELECT regional_id FROM sedes WHERE id = ?", (sede_id,))
                s_row = c.fetchone()
                regional_id = s_row['regional_id'] if s_row else 1

            # Prevent duplicate for same date + prestacion
            c.execute("SELECT id FROM registros_cafeteria WHERE fecha = ? AND prestacion = ? AND estado = 'activo'", (fecha, prestacion))
            if c.fetchone():
                conn.close()
                return self.send_json({'error': f'Ya existe un registro activo para la prestación {prestacion} en la fecha {fecha}'}, 409)

            # Calculate hours & values
            total_h, day_h, night_h, turno = calculate_hours_and_shift(h_in, h_out)
            anio = int(fecha[:4])

            # Rate lookup
            c.execute("""
            SELECT valor_hora_diurna, valor_hora_nocturna 
            FROM tarifas_anuales 
            WHERE anio = ? AND regional_id = ? AND (sede_id = ? OR sede_id IS NULL) AND activo = 1
            ORDER BY sede_id DESC LIMIT 1
            """, (anio, regional_id, sede_id))
            rate_row = c.fetchone()
            v_diurna = rate_row['valor_hora_diurna'] if rate_row else 5900.0
            v_nocturna = rate_row['valor_hora_nocturna'] if rate_row else 7500.0

            total_diurno = round(day_h * v_diurna, 2)
            total_nocturno = round(night_h * v_nocturna, 2)
            valor_a_pagar = total_diurno + total_nocturno

            # Get coordinator name
            c.execute("SELECT nombres FROM coordinadores WHERE id = ?", (coordinador_id,))
            coord_row = c.fetchone()
            coordinador_nombre = coord_row['nombres'] if coord_row else user['nombre_completo']

            # Ensure auxiliary exists
            if not auxiliar_id:
                c.execute("SELECT id FROM auxiliares WHERE nombres = ?", (auxiliar_nombre,))
                a_row = c.fetchone()
                if a_row:
                    auxiliar_id = a_row['id']
                else:
                    c.execute("INSERT INTO auxiliares (nombres, activo, creado_el) VALUES (?, 1, ?)", (auxiliar_nombre, datetime.now().isoformat()))
                    auxiliar_id = c.lastrowid

            # Consecutivo
            c.execute("SELECT MAX(id) as max_id FROM registros_cafeteria")
            next_num = (c.fetchone()['max_id'] or 0) + 1
            consecutivo = f"CAF-{anio}-{next_num:05d}"

            now_str = datetime.now().isoformat()
            c.execute("""
            INSERT INTO registros_cafeteria (
                consecutivo, fecha, regional_id, sede_id, auxiliar_id, auxiliar_nombre,
                nombre_fallecido, prestacion, hora_ingreso, hora_salida, total_horas,
                horas_diurnas, horas_nocturnas, turno, valor_hora_diurna, valor_hora_nocturna,
                valor_a_pagar, coordinador_id, coordinador_nombre, obs_admon,
                usuario_creador_id, usuario_modificador_id, creado_el, modificado_el, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')
            """, (
                consecutivo, fecha, regional_id, sede_id, auxiliar_id, auxiliar_nombre,
                nombre_fallecido, prestacion, h_in, h_out, total_h,
                day_h, night_h, turno, total_diurno, total_nocturno,
                valor_a_pagar, coordinador_id, coordinador_nombre, obs,
                user['id'], user['id'], now_str, now_str
            ))
            new_id = c.lastrowid
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'CREAR_REGISTRO', 'registros_cafeteria', new_id, valor_nuevo={'consecutivo': consecutivo, 'valor_a_pagar': valor_a_pagar}, ip=self.client_address[0])
            conn.close()

            return self.send_json({
                'success': True,
                'id': new_id,
                'consecutivo': consecutivo,
                'valor_a_pagar': valor_a_pagar,
                'message': 'Registro de cafetería guardado exitosamente.'
            })

        # 6. Anular Registro de Cafetería (Soft delete)
        if path.endswith('/anular') and '/api/registros/' in path:
            reg_id = path.split('/')[-2]
            motivo = data.get('motivo', 'Anulado por usuario autorizado').strip()

            c.execute("SELECT * FROM registros_cafeteria WHERE id = ?", (reg_id,))
            reg = c.fetchone()
            if not reg:
                conn.close()
                return self.send_json({'error': 'Registro no encontrado'}, 404)

            # Check permissions
            if user['rol'] != 'ADMINISTRADOR' and reg['regional_id'] != user['regional_id']:
                conn.close()
                return self.send_json({'error': 'No tiene permisos para anular este registro'}, 403)

            c.execute("""
            UPDATE registros_cafeteria 
            SET estado = 'anulado', motivo_anulacion = ?, usuario_modificador_id = ?, modificado_el = ?
            WHERE id = ?
            """, (motivo, user['id'], datetime.now().isoformat(), reg_id))
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'ANULAR_REGISTRO', 'registros_cafeteria', reg_id, valor_anterior={'estado': 'activo'}, valor_nuevo={'estado': 'anulado', 'motivo': motivo}, ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'message': 'Registro anulado correctamente.'})

        # 7. Gestión de Coordinadores (Admin Only)
        if path == '/api/coordinadores':
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            nombres = data.get('nombres', '').strip()
            apellidos = data.get('apellidos', '').strip()
            regional_id = data.get('regional_id', 1)
            celular = data.get('celular', '').strip()

            if not nombres:
                conn.close()
                return self.send_json({'error': 'El nombre del coordinador es requerido'}, 400)

            c.execute("""
            INSERT INTO coordinadores (nombres, apellidos, regional_id, celular, activo, creado_por, creado_el)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """, (nombres, apellidos, regional_id, celular, user['nombre_completo'], datetime.now().isoformat()))
            new_id = c.lastrowid
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'CREAR_COORDINADOR', 'coordinadores', new_id, valor_nuevo={'nombres': nombres, 'regional_id': regional_id}, ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'id': new_id, 'message': 'Coordinador creado exitosamente.'})

        # 8. Gestión de Auxiliares
        if path == '/api/auxiliares':
            nombres = data.get('nombres', '').strip()
            apellidos = data.get('apellidos', '').strip()
            doc = data.get('documento', '').strip()
            tel = data.get('telefono', '').strip()

            if not nombres:
                conn.close()
                return self.send_json({'error': 'Nombre requerido'}, 400)

            c.execute("""
            INSERT INTO auxiliares (nombres, apellidos, documento, telefono, activo, creado_el)
            VALUES (?, ?, ?, ?, 1, ?)
            """, (nombres, apellidos, doc, tel, datetime.now().isoformat()))
            new_id = c.lastrowid
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'CREAR_AUXILIAR', 'auxiliares', new_id, valor_nuevo={'nombres': nombres}, ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'id': new_id, 'message': 'Auxiliar registrado exitosamente.'})

        # 9. Tarifas - Crear / Actualizar (Admin Only)
        if path == '/api/tarifas':
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            anio = data.get('anio')
            regional_id = data.get('regional_id')
            sede_id = data.get('sede_id') or None
            v_diurna = float(data.get('valor_hora_diurna', 0))
            v_nocturna = float(data.get('valor_hora_nocturna', 0))
            v_desde = data.get('vigencia_desde', f"{anio}-01-01")
            v_hasta = data.get('vigencia_hasta', f"{anio}-12-31")

            if not anio or not regional_id or v_diurna <= 0:
                conn.close()
                return self.send_json({'error': 'Datos de tarifa inválidos'}, 400)

            c.execute("""
            INSERT INTO tarifas_anuales (anio, regional_id, sede_id, valor_hora_diurna, valor_hora_nocturna, vigencia_desde, vigencia_hasta, activo, creado_por, creado_el)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """, (anio, regional_id, sede_id, v_diurna, v_nocturna, v_desde, v_hasta, user['nombre_completo'], datetime.now().isoformat()))
            new_id = c.lastrowid
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'CREAR_TARIFA', 'tarifas_anuales', new_id, valor_nuevo=data, ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'id': new_id, 'message': 'Tarifa anual configurada exitosamente.'})

        # 10. Copiar Tarifas del Año Anterior (Admin Only)
        if path == '/api/tarifas/copiar-anio':
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            anio_origen = int(data.get('anio_origen', 2026))
            anio_destino = int(data.get('anio_destino', 2027))

            c.execute("SELECT * FROM tarifas_anuales WHERE anio = ? AND activo = 1", (anio_origen,))
            tarifas_origen = c.fetchall()

            count = 0
            for t in tarifas_origen:
                c.execute("""
                INSERT OR REPLACE INTO tarifas_anuales (anio, regional_id, sede_id, valor_hora_diurna, valor_hora_nocturna, vigencia_desde, vigencia_hasta, activo, creado_por, creado_el)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """, (
                    anio_destino, t['regional_id'], t['sede_id'],
                    t['valor_hora_diurna'], t['valor_hora_nocturna'],
                    f"{anio_destino}-01-01", f"{anio_destino}-12-31",
                    user['nombre_completo'], datetime.now().isoformat()
                ))
                count += 1
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'COPIAR_TARIFAS_ANUALES', 'tarifas_anuales', None, valor_nuevo={'origen': anio_origen, 'destino': anio_destino, 'total': count}, ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'message': f'Se copiaron {count} tarifas de {anio_origen} para el año {anio_destino}.'})

        # 11. Usuarios - Aprobar / Cambiar Estado (Admin Only)
        if path.startswith('/api/auth/users/') and path.endswith('/status'):
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            user_id = path.split('/')[4]
            nuevo_estado = data.get('estado', 'activo')

            c.execute("SELECT * FROM usuarios WHERE id = ?", (user_id,))
            target_user = c.fetchone()
            if not target_user:
                conn.close()
                return self.send_json({'error': 'Usuario no encontrado'}, 404)

            c.execute("UPDATE usuarios SET estado = ? WHERE id = ?", (nuevo_estado, user_id))
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'CAMBIO_ESTADO_USUARIO', 'usuarios', user_id, valor_anterior={'estado': target_user['estado']}, valor_nuevo={'estado': nuevo_estado}, ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'message': f'Estado de usuario actualizado a {nuevo_estado}.'})

        # 12. Configuración - Guardar Parámetros (Admin Only)
        if path == '/api/configuracion':
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            for k, v in data.items():
                c.execute("INSERT OR REPLACE INTO configuracion (clave, valor, modificado_por, modificado_el) VALUES (?, ?, ?, ?)",
                          (k, str(v), user['nombre_completo'], datetime.now().isoformat()))
            conn.commit()
            registrar_auditoria(user['id'], user['nombre_completo'], 'ACTUALIZAR_CONFIGURACION', 'configuracion', None, valor_nuevo=data, ip=self.client_address[0])
            conn.close()
            return self.send_json({'success': True, 'message': 'Configuración guardada correctamente.'})

        conn.close()
        self.send_json({'error': 'Endpoint no encontrado'}, 404)

    # -----------------------------
    # API HANDLERS - PUT
    # -----------------------------
    def handle_api_put(self, path):
        user = get_current_user(self.headers)
        if not user:
            return self.send_json({'error': 'No autorizado'}, 401)

        data = self.read_json_body()
        conn = get_connection()
        c = conn.cursor()

        # Editar Registro de Cafetería
        if path.startswith('/api/registros/'):
            reg_id = path.split('/')[-1]
            c.execute("SELECT * FROM registros_cafeteria WHERE id = ?", (reg_id,))
            old_row = c.fetchone()
            if not old_row:
                conn.close()
                return self.send_json({'error': 'Registro no encontrado'}, 404)

            # Check permissions: coordinators only edit their regional
            if user['rol'] != 'ADMINISTRADOR' and old_row['regional_id'] != user['regional_id']:
                conn.close()
                return self.send_json({'error': 'No tiene permisos para modificar este registro'}, 403)

            fecha = data.get('fecha', old_row['fecha'])
            sede_id = data.get('sede_id', old_row['sede_id'])
            auxiliar_nombre = data.get('auxiliar_nombre', old_row['auxiliar_nombre']).strip()
            nombre_fallecido = data.get('nombre_fallecido', old_row['nombre_fallecido']).strip()
            prestacion = data.get('prestacion', old_row['prestacion']).strip()
            h_in = data.get('hora_ingreso', old_row['hora_ingreso']).strip()
            h_out = data.get('hora_salida', old_row['hora_salida']).strip()
            obs = data.get('obs_admon', old_row['obs_admon']).strip()

            # Recalculate hours and rates
            total_h, day_h, night_h, turno = calculate_hours_and_shift(h_in, h_out)
            anio = int(fecha[:4])

            c.execute("""
            SELECT valor_hora_diurna, valor_hora_nocturna 
            FROM tarifas_anuales 
            WHERE anio = ? AND regional_id = ? AND (sede_id = ? OR sede_id IS NULL) AND activo = 1
            ORDER BY sede_id DESC LIMIT 1
            """, (anio, old_row['regional_id'], sede_id))
            rate_row = c.fetchone()
            v_diurna = rate_row['valor_hora_diurna'] if rate_row else 5900.0
            v_nocturna = rate_row['valor_hora_nocturna'] if rate_row else 7500.0

            total_diurno = round(day_h * v_diurna, 2)
            total_nocturno = round(night_h * v_nocturna, 2)
            valor_a_pagar = total_diurno + total_nocturno

            c.execute("""
            UPDATE registros_cafeteria SET
                fecha = ?, sede_id = ?, auxiliar_nombre = ?, nombre_fallecido = ?,
                prestacion = ?, hora_ingreso = ?, hora_salida = ?, total_horas = ?,
                horas_diurnas = ?, horas_nocturnas = ?, turno = ?, valor_hora_diurna = ?,
                valor_hora_nocturna = ?, valor_a_pagar = ?, obs_admon = ?,
                usuario_modificador_id = ?, modificado_el = ?
            WHERE id = ?
            """, (
                fecha, sede_id, auxiliar_nombre, nombre_fallecido,
                prestacion, h_in, h_out, total_h,
                day_h, night_h, turno, total_diurno,
                total_nocturno, valor_a_pagar, obs,
                user['id'], datetime.now().isoformat(), reg_id
            ))
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'EDITAR_REGISTRO', 'registros_cafeteria', reg_id,
                                valor_anterior=dict(old_row),
                                valor_nuevo={'fecha': fecha, 'valor_a_pagar': valor_a_pagar, 'prestacion': prestacion},
                                ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'message': 'Registro actualizado correctamente.'})

        # Editar Coordinador (Admin Only)
        if path.startswith('/api/coordinadores/'):
            if user['rol'] != 'ADMINISTRADOR':
                conn.close()
                return self.send_json({'error': 'Acceso denegado'}, 403)
            coord_id = path.split('/')[-1]
            nombres = data.get('nombres', '').strip()
            apellidos = data.get('apellidos', '').strip()
            celular = data.get('celular', '').strip()
            activo = 1 if data.get('activo', True) else 0

            c.execute("SELECT * FROM coordinadores WHERE id = ?", (coord_id,))
            old_coord = c.fetchone()
            if not old_coord:
                conn.close()
                return self.send_json({'error': 'Coordinador no encontrado'}, 404)

            c.execute("""
            UPDATE coordinadores SET nombres = ?, apellidos = ?, celular = ?, activo = ?, modificado_el = ?
            WHERE id = ?
            """, (nombres, apellidos, celular, activo, datetime.now().isoformat(), coord_id))
            conn.commit()

            registrar_auditoria(user['id'], user['nombre_completo'], 'EDITAR_COORDINADOR', 'coordinadores', coord_id,
                                valor_anterior=dict(old_coord),
                                valor_nuevo={'nombres': nombres, 'celular': celular, 'activo': activo},
                                ip=self.client_address[0])
            conn.close()

            return self.send_json({'success': True, 'message': 'Coordinador actualizado.'})

        conn.close()
        self.send_json({'error': 'Endpoint no encontrado'}, 404)

def run_server():
    os.chdir(os.path.dirname(__file__))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), AppRequestHandler) as httpd:
        httpd.allow_reuse_address = True
        print(f"===============================================================")
        print(f" CRM DATOS DE CAFETERÍA - JARDINES DEL RENACER")
        print(f" Servidor iniciado en http://localhost:{PORT}")
        print(f"===============================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")

if __name__ == '__main__':
    run_server()
