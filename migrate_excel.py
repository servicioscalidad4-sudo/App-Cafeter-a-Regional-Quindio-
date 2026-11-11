"""
Script de migración integral de App Datos De Cafeteria.xlsx hacia SQLite centralizado
"""
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import sqlite3
import re
from database import get_connection, init_db

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL_NS = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}

def excel_serial_to_date(val):
    if not val:
        return '2026-01-01'
    try:
        f = float(val)
        dt = datetime(1899, 12, 30) + timedelta(days=f)
        if dt.year < 2000:
            return '2026-01-01'
        return dt.strftime('%Y-%m-%d')
    except Exception:
        # Check if already string date YYYY-MM-DD or DD/MM/YYYY
        val_str = str(val).strip()
        m = re.match(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})', val_str)
        if m:
            return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        return '2026-01-01'

def excel_serial_to_time(val):
    if not val:
        return '08:00'
    try:
        f = float(val)
        # If value is > 1.0, it might be a datetime serial; take only fraction
        f = f % 1.0
        total_seconds = int(round(f * 86400))
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        return f"{hours:02d}:{minutes:02d}"
    except Exception:
        val_str = str(val).strip()
        m = re.match(r'(\d{1,2}):(\d{2})', val_str)
        if m:
            return f"{int(m.group(1)):02d}:{m.group(2)}"
        return '08:00'

def normalize_float(val):
    if val is None:
        return 0.0
    try:
        # If string with commas
        val_str = str(val).replace('$', '').replace(',', '').strip()
        return float(val_str)
    except:
        return 0.0

def normalize_coordinator(name):
    if not name:
        return "Cesar Hincapié"
    clean = name.strip()
    lower = clean.lower()
    if 'cesar' in lower or 'incapie' in lower:
        return "Cesar Hincapié"
    if 'taborda' in lower:
        if 'diego' in lower:
            return "Diego Taborda"
        return "Fredy Taborda"
    if 'chelubay' in lower:
        return "Chelubay González López"
    if 'zaider' in lower:
        return "Zaider Buitrago A."
    if 'luisa' in lower:
        return "Luisa Olaya"
    if 'moises' in lower or 'moisés' in lower:
        return "Moisés Cortés"
    if 'nicol' in lower:
        return "Nicol Buitrago"
    return clean.title()

def normalize_sede_name(name):
    clean = name.strip().lower()
    if 'armenia' in clean:
        return 'Armenia'
    if 'barcelona' in clean:
        return 'Barcelona'
    if 'calarca' in clean or 'calarcá' in clean:
        return 'Calarcá'
    if 'circasia' in clean:
        return 'Circasia'
    if 'cordoba' in clean or 'córdoba' in clean:
        return 'Córdoba'
    if 'genova' in clean or 'génova' in clean:
        return 'Génova'
    if 'tebaida' in clean:
        return 'La Tebaida'
    if 'montenegro' in clean:
        return 'Montenegro'
    if 'pijao' in clean:
        return 'Pijao'
    if 'quimbaya' in clean:
        return 'Quimbaya'
    return 'Armenia'

def run_migration():
    init_db()
    conn = get_connection()
    c = conn.cursor()

    # Load Sede mappings
    c.execute("SELECT id, nombre FROM sedes")
    sedes_map = {row['nombre'].lower(): row['id'] for row in c.fetchall()}
    # Add alias mappings
    sedes_map['calarca'] = sedes_map.get('calarcá')
    sedes_map['cordoba'] = sedes_map.get('córdoba')
    sedes_map['genova'] = sedes_map.get('génova')

    with zipfile.ZipFile('App Datos De Cafeteria.xlsx', 'r') as z:
        # 1. Read shared strings
        sst_elem = ET.fromstring(z.read('xl/sharedStrings.xml'))
        shared_strings = []
        for si in sst_elem.findall('s:si', NS):
            t_elem = si.find('s:t', NS)
            if t_elem is not None and t_elem.text:
                shared_strings.append(t_elem.text)
            else:
                parts = [r.text for r in si.findall('.//s:t', NS) if r.text]
                shared_strings.append(''.join(parts))

        # 2. Read sheets
        wb_root = ET.fromstring(z.read('xl/workbook.xml'))
        sheets = wb_root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheet')
        rel_root = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rels = {r.attrib['Id']: r.attrib['Target'] for r in rel_root.findall('.//r:Relationship', REL_NS)}

        # Coordinators and Auxiliaries caches
        coordinadores_cache = {}
        auxiliares_cache = {}

        # Pre-seed Coordinators
        coordinadores_oficiales = [
            ("Cesar Hincapié", "3101112233"),
            ("Fredy Taborda", "3102223344"),
            ("Chelubay González López", "3103334455"),
            ("Zaider Buitrago A.", "3104445566"),
            ("Luisa Olaya", "3105556677"),
            ("Moisés Cortés", "3106667788"),
            ("Diego Taborda", "3107778899"),
            ("Nicol Buitrago", "3108889900")
        ]
        for coord_nom, cel in coordinadores_oficiales:
            c.execute("SELECT id FROM coordinadores WHERE nombres = ?", (coord_nom,))
            row = c.fetchone()
            if row:
                coordinadores_cache[coord_nom] = row['id']
            else:
                c.execute("""
                INSERT INTO coordinadores (nombres, apellidos, regional_id, celular, activo, creado_por, creado_el)
                VALUES (?, '', 1, ?, 1, 'Sistema', ?)
                """, (coord_nom, cel, datetime.now().isoformat()))
                coordinadores_cache[coord_nom] = c.lastrowid

        # Insert Annual Rates for 2025 and 2026
        # Armenia 2025: Diurna 6487.5, Nocturna 7500
        # All sedes 2026: Diurna 5900, Nocturna 7500
        for sede_name, sede_id in [('Armenia', 1), ('Calarcá', 2), ('Circasia', 3), ('Córdoba', 4), ('Génova', 5), 
                                   ('La Tebaida', 6), ('Montenegro', 7), ('Pijao', 8), ('Quimbaya', 9), ('Barcelona', 10)]:
            # 2025
            c.execute("""
            INSERT OR IGNORE INTO tarifas_anuales (anio, regional_id, sede_id, valor_hora_diurna, valor_hora_nocturna, vigencia_desde, vigencia_hasta, activo, creado_por, creado_el)
            VALUES (2025, 1, ?, 6487.5, 7500.0, '2025-01-01', '2025-12-31', 1, 'Sistema', ?)
            """, (sede_id, datetime.now().isoformat()))
            # 2026
            c.execute("""
            INSERT OR IGNORE INTO tarifas_anuales (anio, regional_id, sede_id, valor_hora_diurna, valor_hora_nocturna, vigencia_desde, vigencia_hasta, activo, creado_por, creado_el)
            VALUES (2026, 1, ?, 5900.0, 7500.0, '2026-01-01', '2026-12-31', 1, 'Sistema', ?)
            """, (sede_id, datetime.now().isoformat()))

        # Clean existing imported records
        c.execute("DELETE FROM registros_cafeteria")

        total_migrated = 0
        consecutivo_num = 1

        for sheet in sheets:
            s_name = sheet.attrib['name'].strip()
            if s_name == 'Shortcut':
                continue

            r_id = sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
            target = rels[r_id]
            if not target.startswith('worksheets/'):
                target = 'worksheets/' + target.split('/')[-1]
            fname = 'xl/' + target

            ws = ET.fromstring(z.read(fname))
            rows = ws.findall('.//s:row', NS)
            if len(rows) < 3:
                continue

            sheet_count = 0
            for r in rows[2:]: # from row 3
                cols = {}
                for cell in r.findall('s:c', NS):
                    r_ref = cell.attrib.get('r')
                    col_letter = ''.join([ch for ch in r_ref if ch.isalpha()])
                    t = cell.attrib.get('t')
                    v = cell.find('s:v', NS)
                    val = v.text if v is not None else None
                    if t == 's' and val is not None:
                        val = shared_strings[int(val)]
                    cols[col_letter] = val

                fecha_raw = cols.get('A')
                sede_raw = cols.get('B') or s_name.replace('Sede', '').strip()
                aux_raw = cols.get('C')
                fallecido_raw = cols.get('D')
                prestacion_raw = cols.get('E')
                h_in_raw = cols.get('F')
                h_out_raw = cols.get('G')
                total_horas_raw = cols.get('H')
                turno_raw = cols.get('I')
                v_diurno_raw = cols.get('J')
                v_nocturno_raw = cols.get('K')
                v_pagar_raw = cols.get('L')
                coord_raw = cols.get('M')
                obs_raw = cols.get('N')

                # Skip completely blank rows
                if not fecha_raw and not fallecido_raw and not prestacion_raw:
                    continue

                # Clean fields
                fecha_clean = excel_serial_to_date(fecha_raw)
                sede_norm = normalize_sede_name(sede_raw)
                sede_id = sedes_map.get(sede_norm.lower(), 1)
                
                aux_nombre = (aux_raw or "Auxiliar General").strip()
                if aux_nombre not in auxiliares_cache:
                    c.execute("SELECT id FROM auxiliares WHERE nombres = ?", (aux_nombre,))
                    aux_row = c.fetchone()
                    if aux_row:
                        aux_id = aux_row['id']
                    else:
                        c.execute("INSERT INTO auxiliares (nombres, apellidos, documento, telefono, activo, creado_el) VALUES (?, '', '', '', 1, ?)", 
                                  (aux_nombre, datetime.now().isoformat()))
                        aux_id = c.lastrowid
                    auxiliares_cache[aux_nombre] = aux_id
                else:
                    aux_id = auxiliares_cache[aux_nombre]

                fallecido_clean = (fallecido_raw or "Servicio Particular").strip()
                prestacion_clean = (prestacion_raw or f"PREST-{consecutivo_num:05d}").strip()
                h_in = excel_serial_to_time(h_in_raw)
                h_out = excel_serial_to_time(h_out_raw)
                
                total_h = normalize_float(total_horas_raw)
                if total_h <= 0:
                    total_h = 1.0

                turno_clean = (turno_raw or "Turno Diurno").strip()
                if 'noct' in turno_clean.lower():
                    turno_clean = "Turno Nocturno"
                    h_diurnas = 0.0
                    h_nocturnas = total_h
                else:
                    turno_clean = "Turno Diurno"
                    h_diurnas = total_h
                    h_nocturnas = 0.0

                v_diurno = normalize_float(v_diurno_raw)
                v_nocturno = normalize_float(v_nocturno_raw)
                v_pagar = normalize_float(v_pagar_raw)
                if v_pagar <= 0 and (v_diurno > 0 or v_nocturno > 0):
                    v_pagar = v_diurno + v_nocturno

                coord_norm = normalize_coordinator(coord_raw)
                coord_id = coordinadores_cache.get(coord_norm, 1)

                obs_clean = obs_raw.strip() if obs_raw else ""
                consecutivo = f"CAF-{fecha_clean[:4]}-{consecutivo_num:05d}"

                c.execute("""
                INSERT INTO registros_cafeteria (
                    consecutivo, fecha, regional_id, sede_id, auxiliar_id, auxiliar_nombre,
                    nombre_fallecido, prestacion, hora_ingreso, hora_salida, total_horas,
                    horas_diurnas, horas_nocturnas, turno, valor_hora_diurna, valor_hora_nocturna,
                    valor_a_pagar, coordinador_id, coordinador_nombre, obs_admon,
                    usuario_creador_id, usuario_modificador_id, creado_el, modificado_el, estado
                ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 'activo')
                """, (
                    consecutivo, fecha_clean, sede_id, aux_id, aux_nombre,
                    fallecido_clean, prestacion_clean, h_in, h_out, total_h,
                    h_diurnas, h_nocturnas, turno_clean, v_diurno, v_nocturno,
                    v_pagar, coord_id, coord_norm, obs_clean,
                    datetime.now().isoformat(), datetime.now().isoformat()
                ))

                total_migrated += 1
                sheet_count += 1
                consecutivo_num += 1

            print(f"Hoja '{s_name}': {sheet_count} registros migrados con éxito.")

        conn.commit()

        # Audit the migration
        c.execute("""
        INSERT INTO auditoria (usuario_id, usuario_nombre, accion, tabla, registro_id, valor_anterior, valor_nuevo, ip, fecha_hora)
        VALUES (1, 'Administrador Central', 'MIGRACION_INICIAL_EXCEL', 'registros_cafeteria', '1-1569', NULL, ?, '127.0.0.1', ?)
        """, (f"{total_migrated} registros importados desde Excel", datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
        conn.commit()
        conn.close()

        print(f"\n==========================================")
        print(f"MIGRACIÓN COMPLETADA: {total_migrated} registros guardados en SQLite.")
        print(f"Auxiliares registrados: {len(auxiliares_cache)}")
        print(f"Coordinadores registrados: {len(coordinadores_cache)}")
        print(f"==========================================")

if __name__ == '__main__':
    run_migration()
