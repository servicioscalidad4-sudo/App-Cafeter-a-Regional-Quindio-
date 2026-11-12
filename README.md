# SISTEMA CRM – DATOS DE CAFETERÍA JARDINES DEL RENACER
**Regional Quindío — Aplicación Web Centralizada**

Plataforma CRM multiusuario y multirregional desarrollada para **Jardines del Renacer**, diseñada para administrar, liquidar, auditar y controlar los gastos operativos de cafetería en las 10 sedes del Quindío, con cálculo automático de turnos diurnos/nocturnos, integración con WhatsApp y trazabilidad inmutable.

---

## 🚀 Arquitectura y Componentes del Sistema

1. **Frontend (SPA Corporativa):**
   - Interfaz responsive para computadores, tabletas y celulares en `public/`.
   - Paleta corporativa Jardines del Renacer (azul marino profundo `#1a0e2a`, dorado `#c8a951` y blanco pizarra `#f8fafc`).
   - Menú lateral de navegación con 12 módulos funcionales.
   - Gráficos interactivos de analítica mensual y distribución por sedes con Chart.js.
   - Liquidación en tiempo real en el formulario al ingresar horas de inicio y fin (soporta cruce de medianoche).
   - Generador automático de mensajes y enlaces para **WhatsApp Web y Móvil**.

2. **Backend REST API (`server.py`):**
   - Servidor HTTP multi-hilo con arquitectura REST en Python (usa biblioteca estándar, sin dependencias externas obligatorias).
   - Control de acceso basado en roles (**RBAC**): `ADMINISTRADOR`, `COORDINADOR`, `AUXILIAR`.
   - Motor de cálculo de turnos:
     - Diurno: 06:00 a 21:00.
     - Nocturno: 21:00 a 06:00 (soporta turnos que cruzan la medianoche).
   - Exportación de reportes directos en formato **Excel CSV (UTF-8 con BOM)** y vista de impresión para PDF.

3. **Base de Datos Centralizada SQLite (`cafeteria.db`):**
   - 10 entidades relacionales indexadas:
     - `regionales`, `sedes`, `usuarios`, `roles_permisos`, `coordinadores`, `auxiliares`, `tarifas_anuales`, `registros_cafeteria`, `configuracion`, `auditoria`.
   - **1.560 registros históricos reales ya migrados** desde `App Datos De Cafeteria.xlsx`.

4. **Despliegue Cloud en Google Apps Script (`google-apps-script/`):**
   - `Code.gs` y `appsscript.json` listos para ser desplegados como Web App en Google Sheets según `Arquitectura.png`.

---

## 🔑 Credenciales de Acceso

| Rol | Usuario | Contraseña | Alcance |
| :--- | :--- | :--- | :--- |
| **Administrador General** | `admin` | `admin123` | Control total, tarifas, coordinadores, auditoría y todas las sedes |
| **Coordinador Regional** | `coordinador` | `coord123` | Registro y consulta exclusivo de su regional, WhatsApp y reportes |

---

## 📦 Ejecución y Uso Local

### 1. Iniciar el servidor
```bash
python3 server.py
```
El servidor abrirá el servicio en: **http://localhost:8080**

### 2. Ejecutar la suite de pruebas automatizadas
```bash
python3 test_system.py
```
Ejecuta 9 pruebas de integración continua validando autenticación, cálculos de turnos, inserción de servicios, prevención de duplicados, anulación lógica, bitácora de auditoría y exportación a Excel.

### 3. Migración o recreación de datos históricos
```bash
python3 migrate_excel.py
```
Extrae, normaliza e importa los registros de las 10 sedes de `App Datos De Cafeteria.xlsx`.

---

## 📱 Módulo de Envío a WhatsApp

Al presionar el botón **💬 WA** en cualquier registro de la tabla o tras crear un servicio, se construye automáticamente el mensaje según la especificación oficial:

```text
Buenos días ☀️ / Buenas tardes 🌜 / Buenas noches 🌚
💰 REPORTE GASTOS DE CAFETERÍA
☺️ Regional: Regional Quindío
Fecha: [FECHA]
Sede: [SEDE]
Prestación: [PRESTACIÓN]
Nombre del fallecido: [NOMBRE DEL FALLECIDO]
Concepto: [OBSERVACIONES]
Nombre auxiliar: [AUXILIAR DE CAFETERÍA]
Hora de inicio: [HORA DE INGRESO]
Hora de salida: [HORA DE SALIDA]
Total de horas: [TOTAL DE HORAS]
Turno de cafetería: [TURNO]
Valor a cancelar: $[VALOR A PAGAR]
SMS App Datos de Cafetería.
```

- Saludo dinámico según la hora del día.
- Codificación URL (`encodeURIComponent`).
- Apertura automática en WhatsApp Web o en la aplicación móvil.

---

## 📋 Módulos del Menú Principal

1. **Dashboard:** Indicadores KPI en tiempo real (Servicios, Gasto Total, Horas Diurnas/Nocturnas), gráficos de barras mensuales y torta de sedes.
2. **Registrar Cafetería:** Formulario con cálculo dinámico en vivo de horas y valores según tarifa de regional/sede.
3. **Consultar Registros:** Tabla interactiva con filtros por fecha, sede, coordinador, turno, estado y búsqueda rápida.
4. **Sedes y Regionales:** Directorio de las 10 sedes del Quindío (Armenia, Calarcá, Circasia, Córdoba, Génova, La Tebaida, Montenegro, Pijao, Quimbaya, Barcelona).
5. **Auxiliares:** Directorio con más de 100 auxiliares registradas.
6. **Coordinadores (Admin):** Gestión centralizada de coordinadores autorizados.
7. **Tarifas y Valores (Admin):** Mantenimiento de tarifas horarias por año y opción para duplicar tarifas del año anterior con un clic.
8. **Reportes:** Descarga directa de archivos Excel y formato imprimible para PDF.
9. **Auditoría (Admin):** Trazabilidad inmutable de todas las creaciones, ediciones y anulaciones.
10. **Usuarios (Admin):** Aprobación de cuentas nuevas y gestión de roles.
11. **Mi Perfil:** Consulta de datos personales y cierre de sesión.
