"""
Pruebas Automatizadas de Integridad del CRM Datos de Cafetería Jardines del Renacer
"""
import urllib.request
import urllib.error
import json
import time
import subprocess
import os
import signal

BASE_URL = "http://127.0.0.1:8080"

def run_tests():
    print("Iniciando pruebas del CRM...")

    # 1. Probar Login Admin
    login_data = json.dumps({"usuario": "admin", "password": "admin123"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/auth/login", data=login_data, headers={'Content-Type': 'application/json'}, method='POST')
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode('utf-8'))
    assert data.get('success') is True, "Login admin falló"
    token = data['token']
    print("✓ Test 1: Autenticación Admin exitosa. Token obtenido.")

    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 2. Probar Dashboard KPIs y Métricas
    req = urllib.request.Request(f"{BASE_URL}/api/dashboard/stats?anio=2026", headers=headers)
    res = urllib.request.urlopen(req)
    dash_data = json.loads(res.read().decode('utf-8'))
    assert 'kpis' in dash_data, "KPIs no encontrados"
    assert dash_data['kpis']['total_servicios'] > 0, "No hay servicios en 2026"
    print(f"✓ Test 2: Dashboard KPIs validados. Total servicios 2026: {dash_data['kpis']['total_servicios']}.")

    # 3. Probar Cálculo de Horas y Turno
    calc_data = json.dumps({
        "fecha": "2026-05-10",
        "sede_id": 1,
        "hora_ingreso": "07:00",
        "hora_salida": "19:00"
    }).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/calc/horas-valor", data=calc_data, headers=headers, method='POST')
    res = urllib.request.urlopen(req)
    calc_res = json.loads(res.read().decode('utf-8'))
    assert calc_res['total_horas'] == 12.0
    assert calc_res['turno'] == 'Turno Diurno'
    print(f"✓ Test 3: Cálculo de turno diurno exacto (12 horas = ${calc_res['valor_a_pagar']} COP).")

    # 4. Probar Cálculo con Cruce de Medianoche (Turno Nocturno)
    calc_night = json.dumps({
        "fecha": "2026-05-10",
        "sede_id": 1,
        "hora_ingreso": "21:00",
        "hora_salida": "06:00"
    }).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/calc/horas-valor", data=calc_night, headers=headers, method='POST')
    res = urllib.request.urlopen(req)
    night_res = json.loads(res.read().decode('utf-8'))
    assert night_res['total_horas'] == 9.0
    assert night_res['turno'] == 'Turno Nocturno'
    print(f"✓ Test 4: Cálculo de turno nocturno cruzando medianoche (9 horas = ${night_res['valor_a_pagar']} COP).")

    # 5. Probar Creación de Nuevo Servicio de Cafetería
    qa_prestacion = f"02-QA{int(time.time()) % 10000:04d}-26"
    nuevo_reg = json.dumps({
        "fecha": "2026-11-11",
        "sede_id": 1,
        "auxiliar_nombre": "Claudia Patricia Cano",
        "nombre_fallecido": "Prueba de Verificación QA",
        "prestacion": qa_prestacion,
        "hora_ingreso": "07:00",
        "hora_salida": "19:00",
        "coordinador_id": 1,
        "obs_admon": "Registro generado por prueba unitaria"
    }).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/registros", data=nuevo_reg, headers=headers, method='POST')
    res = urllib.request.urlopen(req)
    reg_res = json.loads(res.read().decode('utf-8'))
    assert reg_res['success'] is True, "Fallo al crear registro"
    nuevo_id = reg_res['id']
    consecutivo = reg_res['consecutivo']
    print(f"✓ Test 5: Nuevo servicio registrado exitosamente ({consecutivo}, ID: {nuevo_id}).")

    # 6. Probar Consulta de Registros y Paginación
    q_encoded = urllib.parse.quote("Prueba de Verificación")
    req = urllib.request.Request(f"{BASE_URL}/api/registros?q={q_encoded}", headers=headers)
    res = urllib.request.urlopen(req)
    query_res = json.loads(res.read().decode('utf-8'))
    assert len(query_res['data']) >= 1, "No se encontró el registro recién creado"
    print("✓ Test 6: Búsqueda y filtrado de registros verificado.")

    # 7. Probar Anulación de Registro (Soft Delete)
    anular_data = json.dumps({"motivo": "Prueba de anulación exitosa"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/api/registros/{nuevo_id}/anular", data=anular_data, headers=headers, method='POST')
    res = urllib.request.urlopen(req)
    anular_res = json.loads(res.read().decode('utf-8'))
    assert anular_res['success'] is True
    print(f"✓ Test 7: Registro {consecutivo} anulado con éxito.")

    # 8. Probar Verificación en Auditoría
    req = urllib.request.Request(f"{BASE_URL}/api/auditoria?limit=10", headers=headers)
    res = urllib.request.urlopen(req)
    audit_res = json.loads(res.read().decode('utf-8'))
    acciones = [a['accion'] for a in audit_res['auditoria']]
    assert 'ANULAR_REGISTRO' in acciones, "La anulación no fue auditada"
    assert 'CREAR_REGISTRO' in acciones, "La creación no fue auditada"
    print("✓ Test 8: Trazabilidad y auditoría completa verificada en base de datos.")

    # 9. Probar Exportación Excel CSV
    req = urllib.request.Request(f"{BASE_URL}/api/export/csv", headers=headers)
    res = urllib.request.urlopen(req)
    csv_bytes = res.read()
    assert csv_bytes.startswith(b'\xef\xbb\xbf"CONSECUTIVO"'), "Formato CSV UTF-8 BOM inválido"
    print(f"✓ Test 9: Exportación a Excel CSV generada ({len(csv_bytes):,} bytes).")

    print("\n=======================================================")
    print(" ¡TODAS LAS PRUEBAS (9/9) PASARON SATISFACTORIAMENTE! ")
    print("=======================================================")

if __name__ == '__main__':
    run_tests()
