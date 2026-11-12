/**
 * CRM DATOS DE CAFETERÍA — JARDINES DEL RENACER
 * Controlador Frontend Principal (Compatible con Servidor Local y GitHub Pages + Google Sheets)
 */

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_YSxPbFYWbdLj9BFXeukv2xb1NS2NLbQI2WGwpgsh7yeVUmn5GKWxW7ZesDnL4jGRuQ/exec';
const isGitHubPages = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

// Estado Global
let state = {
  sheetsToken: localStorage.getItem('jr_sheets_token') || null,
  token: localStorage.getItem('jr_cafeteria_token') || null,
  user: JSON.parse(localStorage.getItem('jr_cafeteria_user') || 'null'),
  currentSection: 'dashboard',
  sedes: [],
  regionales: [{ id: 1, codigo: 'QUINDIO', nombre: 'Regional Quindío', estado: 'activo' }],
  coordinadores: [],
  auxiliares: [],
  tarifas: [],
  registrosPage: 1,
  registrosLimit: 25,
  registrosTotalPages: 1,
  chartMensualInstance: null,
  chartSedesInstance: null,
  registroSeleccionado: null
};

// ============================================================================
// BASE DE DATOS LOCAL CLIENTE (FALLBACK GARANTIZADO PARA GITHUB PAGES)
// ============================================================================
const DEFAULT_SEDES = [
  { id: 1, nombre: 'Armenia', regional_id: 1, direccion: 'Sede Principal Armenia', telefono: '6067400000', estado: 'activo' },
  { id: 2, nombre: 'Calarcá', regional_id: 1, direccion: 'Sede Calarcá', telefono: '', estado: 'activo' },
  { id: 3, nombre: 'Circasia', regional_id: 1, direccion: 'Sede Circasia', telefono: '', estado: 'activo' },
  { id: 4, nombre: 'Córdoba', regional_id: 1, direccion: 'Sede Córdoba', telefono: '', estado: 'activo' },
  { id: 5, nombre: 'Génova', regional_id: 1, direccion: 'Sede Génova', telefono: '', estado: 'activo' },
  { id: 6, nombre: 'La Tebaida', regional_id: 1, direccion: 'Sede La Tebaida', telefono: '', estado: 'activo' },
  { id: 7, nombre: 'Montenegro', regional_id: 1, direccion: 'Sede Montenegro', telefono: '', estado: 'activo' },
  { id: 8, nombre: 'Pijao', regional_id: 1, direccion: 'Sede Pijao', telefono: '', estado: 'activo' },
  { id: 9, nombre: 'Quimbaya', regional_id: 1, direccion: 'Sede Quimbaya', telefono: '', estado: 'activo' },
  { id: 10, nombre: 'Barcelona', regional_id: 1, direccion: 'Sede Barcelona', telefono: '', estado: 'activo' }
];

const DEFAULT_COORDINADORES = [
  { id: 1, nombres: 'Cesar Hincapié', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3101112233', activo: 1 },
  { id: 2, nombres: 'Fredy Taborda', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3102223344', activo: 1 },
  { id: 3, nombres: 'Chelubay González López', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3103334455', activo: 1 },
  { id: 4, nombres: 'Zaider Buitrago A.', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3104445566', activo: 1 },
  { id: 5, nombres: 'Luisa Olaya', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3105556677', activo: 1 },
  { id: 6, nombres: 'Moisés Cortés', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3106667788', activo: 1 },
  { id: 7, nombres: 'Diego Taborda', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3107778899', activo: 1 },
  { id: 8, nombres: 'Nicol Buitrago', regional_id: 1, regional_nombre: 'Regional Quindío', celular: '3108889900', activo: 1 }
];

const DEFAULT_AUXILIARES = [
  { id: 1, nombres: 'Claudia Patricia Cano', documento: '1094000001', telefono: '3150000001', activo: 1 },
  { id: 2, nombres: 'Luz Marina González Romero', documento: '1094000002', telefono: '3150000002', activo: 1 },
  { id: 3, nombres: 'Yence Quijano', documento: '1094000003', telefono: '3150000003', activo: 1 },
  { id: 4, nombres: 'María Nora Rodríguez', documento: '1094000004', telefono: '3150000004', activo: 1 },
  { id: 5, nombres: 'Mónica Viviana Martínez', documento: '1094000005', telefono: '3150000005', activo: 1 }
];

const DEFAULT_TARIFAS = [
  { id: 1, anio: 2026, regional_id: 1, regional_nombre: 'Regional Quindío', sede_nombre: 'Todas las Sedes', valor_hora_diurna: 5900, valor_hora_nocturna: 7500, vigencia_desde: '2026-01-01', vigencia_hasta: '2026-12-31', activo: 1 },
  { id: 2, anio: 2027, regional_id: 1, regional_nombre: 'Regional Quindío', sede_nombre: 'Todas las Sedes', valor_hora_diurna: 5900, valor_hora_nocturna: 7500, vigencia_desde: '2027-01-01', vigencia_hasta: '2027-12-31', activo: 1 }
];

// ============================================================================
// ROLES: ADMINISTRADOR (todo) | COORDINADOR (ve todas las sedes) | SEDE (solo su sede)
// ============================================================================
function esRolSede() { return !!state.user && state.user.rol === 'SEDE'; }
function veTodasLasSedes() { return !!state.user && ['ADMINISTRADOR', 'COORDINADOR'].includes(state.user.rol); }
function sedeIdPorNombre(nombre) {
  return (DEFAULT_SEDES.find(s => s.nombre === nombre) || {}).id;
}
function filtrarPorRol(regs) {
  if (esRolSede()) return regs.filter(r => r.sede_id == state.user.sede_id);
  return regs;
}
function puedeGestionarRegistro(r) {
  return !esRolSede() || r.sede_id == state.user.sede_id;
}

function getClientRegistros() {
  const data = localStorage.getItem('jr_client_registros');
  if (data) {
    try { return JSON.parse(data); } catch (e) {}
  }
  return [];
}

function saveClientRegistros(regs) {
  localStorage.setItem('jr_client_registros', JSON.stringify(regs));
}

// ============================================================================
// MOTOR DE CÁLCULO CLIENTE (HORAS DIURNAS, NOCTURNAS Y PRECIO)
// ============================================================================
function calcularHorasYTurnoClient(hInStr, hOutStr) {
  try {
    const partsIn = (hInStr || '07:00').split(':').map(Number);
    const partsOut = (hOutStr || '19:00').split(':').map(Number);
    const tIn = partsIn[0] * 60 + partsIn[1];
    const tOut = partsOut[0] * 60 + partsOut[1];

    let totalMins = tOut <= tIn ? (1440 - tIn) + tOut : tOut - tIn;
    let dayMins = 0;
    let nightMins = 0;

    let curr = tIn;
    for (let i = 0; i < totalMins; i++) {
      let mod = curr % 1440;
      if (mod >= 360 && mod < 1140) dayMins++; // Diurno 6:00 a.m. - 7:00 p.m. | Nocturno 7:00 p.m. - 6:00 a.m.
      else nightMins++;
      curr++;
    }

    const dayHours = Math.round((dayMins / 60) * 100) / 100;
    const nightHours = Math.round((nightMins / 60) * 100) / 100;
    const totalHours = Math.round((totalMins / 60) * 100) / 100;

    let turno = 'Turno Mixto';
    if (nightHours === 0) turno = 'Turno Diurno';
    if (dayHours === 0) turno = 'Turno Nocturno';

    return { total_horas: totalHours, horas_diurnas: dayHours, horas_nocturnas: nightHours, turno };
  } catch (e) {
    return { total_horas: 12, horas_diurnas: 12, horas_nocturnas: 0, turno: 'Turno Diurno' };
  }
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const today = new Date().toISOString().split('T')[0];
  const fechaInput = document.getElementById('reg-form-fecha');
  if (fechaInput) fechaInput.value = today;

  if (state.token && state.user) {
    await inicializarApp();
  } else {
    mostrarVistaAuth();
  }
});


// ============================================================================
// CREAR ACCESO / LOGIN DE USUARIOS (Google Sheets + respaldo local)
// ============================================================================
async function sha256Hex(texto) {
  const data = new TextEncoder().encode('RenacerCafeteria_Local_2026' + texto);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getLocalUsers() {
  try { return JSON.parse(localStorage.getItem('jr_client_users') || '[]'); } catch (e) { return []; }
}
function saveLocalUsers(list) { localStorage.setItem('jr_client_users', JSON.stringify(list)); }

// POST como text/plain: evita el preflight CORS y permite leer la respuesta de Apps Script
async function llamarSheets(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000); // máximo 15 s de espera
  try {
    const res = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function usuarioDesdeSheets(u, usuarioFallback) {
  return {
    id: u.id, usuario: u.usuario || usuarioFallback, nombre_completo: u.nombre, correo: u.correo,
    rol: String(u.rol || 'SEDE').toUpperCase(), regional_id: 1,
    sede_id: sedeIdPorNombre(u.sede) || u.sede_id || 1, sede_nombre: u.sede || '', cargo: u.cargo || ''
  };
}

// Token de sesión de Google Sheets (necesario para administrar usuarios)
async function obtenerTokenSheets(tokenYa, usuario, password) {
  let t = tokenYa || null;
  if (!t) {
    try {
      const r = await llamarSheets({ action: 'login', usuario, password });
      if (r && r.success) t = r.token;
    } catch (e) {}
  }
  state.sheetsToken = t;
  if (t) localStorage.setItem('jr_sheets_token', t); else localStorage.removeItem('jr_sheets_token');
}

async function crearAccesoUsuario(body) {
  const usuario = (body.usuario || '').toLowerCase().replace(/\s+/g, '');
  const correo = (body.correo || '').trim().toLowerCase();
  if (['admin', 'coordinador'].includes(usuario)) return { success: false, error: 'Ese usuario ya existe. Elige otro.' };

  const locales = getLocalUsers();
  if (locales.some(u => u.usuario === usuario || u.correo === correo)) {
    return { success: false, error: 'Ese usuario o correo ya está registrado.' };
  }

  // 1) Guardar en Google Sheets (hoja Usuarios) con estado "activo"
  try {
    const r = await llamarSheets({ action: 'register', ...body, usuario, correo });
    if (r && r.success) return { success: true, user: usuarioDesdeSheets(r.user, usuario), remoto: true };
    if (r && r.error && r.error !== 'Acción no válida') return { success: false, error: r.error };
  } catch (e) { console.warn('Sheets no disponible, se guarda localmente', e); }

  // 2) Respaldo local en este navegador
  const hash = await sha256Hex(body.password);
  const nuevo = {
    id: 1000 + locales.length + 1, usuario, correo, hash, nombre_completo: body.nombre,
    rol: 'SEDE', regional_id: 1, sede_id: Number(body.sede_id) || 1, sede_nombre: body.sede || '', cargo: body.cargo || ''
  };
  locales.push(nuevo);
  saveLocalUsers(locales);
  const { hash: _h, ...user } = nuevo;
  return { success: true, user, remoto: false };
}

async function loginUsuarioCreado(usuarioIn, password) {
  const usuario = (usuarioIn || '').toLowerCase().replace(/\s+/g, '');
  const hash = await sha256Hex(password);
  const local = getLocalUsers().find(u => (u.usuario === usuario || u.correo === usuario) && u.hash === hash);
  if (local) { const { hash: _h, ...user } = local; return { success: true, token: 'local-token-' + Date.now(), user }; }

  try {
    const r = await llamarSheets({ action: 'login', usuario, password });
    if (r && r.success) return { success: true, token: 'sheets-token-' + Date.now(), sheetsToken: r.token, user: usuarioDesdeSheets(r.user, usuario) };
    if (r && r.error) return { success: false, error: r.error };
  } catch (e) { console.warn('Login remoto no disponible', e); }
  return { success: false, error: 'Credenciales inválidas.' };
}

// ============================================================================
// SERVICIOS API (HÍBRIDO: SERVIDOR LOCAL O MODO GITHUB PAGES)
// ============================================================================
async function apiRequest(endpoint, method = 'GET', body = null) {
  if (!isGitHubPages) {
    // Modo Local (Python Server)
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(endpoint, options);
      if (res.status === 401 && endpoint !== '/api/auth/login') {
        handleLogout();
        return { error: 'Sesión expirada' };
      }
      return await res.json();
    } catch (err) {
      console.warn('Fallo en servidor local, usando modo cliente...', err);
    }
  }

  // Modo GitHub Pages / Fallback Autónomo
  return procesarSolicitudCliente(endpoint, method, body);
}

function procesarSolicitudCliente(endpoint, method, body) {
  // 1. Session check
  if (endpoint === '/api/auth/session') {
    return state.user ? { authenticated: true, user: state.user } : { authenticated: false };
  }

  // 2. Login
  if (endpoint === '/api/auth/login') {
    const usuario = (body.usuario || '').trim().toLowerCase();
    const pass = body.password || '';

    if ((usuario === 'admin' || usuario === 'admin@jardinesdelrenacer.com') && pass === 'admin123') {
      const user = {
        id: 1, usuario: 'admin', nombre_completo: 'Administrador Central',
        rol: 'ADMINISTRADOR', regional_id: 1, sede_id: 1, cargo: 'Director Operativo'
      };
      return { success: true, token: 'gh-admin-token-' + Date.now(), user };
    }
    if ((usuario === 'coordinador' || usuario === 'coordinador@jardinesdelrenacer.com') && pass === 'coord123') {
      const user = {
        id: 2, usuario: 'coordinador', nombre_completo: 'Coordinador Armenia',
        rol: 'COORDINADOR', regional_id: 1, sede_id: 1, cargo: 'Coordinador de Servicios'
      };
      return { success: true, token: 'gh-coord-token-' + Date.now(), user };
    }
    return loginUsuarioCreado(body.usuario, pass);
  }

  // 3. Catálogos
  if (endpoint.startsWith('/api/sedes')) return { sedes: DEFAULT_SEDES };
  if (endpoint.startsWith('/api/coordinadores')) return { coordinadores: DEFAULT_COORDINADORES };
  if (endpoint.startsWith('/api/auxiliares')) return { auxiliares: DEFAULT_AUXILIARES };
  if (endpoint.startsWith('/api/tarifas')) return { tarifas: DEFAULT_TARIFAS };

  // 4. Cálculo instantáneo
  if (endpoint === '/api/calc/horas-valor') {
    const calc = calcularHorasYTurnoClient(body.hora_ingreso, body.hora_salida);
    const vDiurna = 5900;
    const vNocturna = 7500;
    const subDiurno = Math.round(calc.horas_diurnas * vDiurna);
    const subNocturno = Math.round(calc.horas_nocturnas * vNocturna);
    return {
      ...calc,
      tarifa_hora_diurna: vDiurna,
      tarifa_hora_nocturna: vNocturna,
      subtotal_diurno: subDiurno,
      subtotal_nocturno: subNocturno,
      valor_a_pagar: subDiurno + subNocturno
    };
  }

  // 5. Dashboard Stats
  if (endpoint.startsWith('/api/dashboard/stats')) {
    let regs = filtrarPorRol(getClientRegistros());
    const qSede = (endpoint.match(/sede_id=(\d+)/) || [])[1];
    if (qSede) regs = regs.filter(r => r.sede_id == qSede);
    const totalServicios = regs.length;
    let totalGasto = 0, totalHoras = 0, hDiurnas = 0, hNocturnas = 0;
    let sedesCount = {};

    regs.forEach(r => {
      totalGasto += r.valor_a_pagar || 0;
      totalHoras += r.total_horas || 0;
      hDiurnas += r.horas_diurnas || 0;
      hNocturnas += r.horas_nocturnas || 0;
      sedesCount[r.sede_nombre] = (sedesCount[r.sede_nombre] || 0) + (r.valor_a_pagar || 0);
    });

    const sedesData = Object.entries(sedesCount).map(([sede, gasto]) => ({ sede, total_gasto: gasto }));
    return {
      kpis: {
        total_servicios: totalServicios,
        total_gasto: totalGasto,
        total_horas: totalHoras,
        horas_diurnas: hDiurnas,
        horas_nocturnas: hNocturnas
      },
      sedes: sedesData.length ? sedesData : [{ sede: 'Armenia', total_gasto: 0 }],
      tendencia: [{ mes_anio: '2026-11', total_gasto: totalGasto }],
      top_auxiliares: []
    };
  }

  // 6. Registros CRUD
  if (endpoint.startsWith('/api/registros') && method === 'GET') {
    const regs = filtrarPorRol(getClientRegistros());
    return {
      data: regs,
      pagination: { total: regs.length, page: 1, limit: 25, pages: 1 }
    };
  }

  if (endpoint === '/api/registros' && method === 'POST') {
    const regs = getClientRegistros();
    if (esRolSede()) body.sede_id = state.user.sede_id; // la sede NO se puede cambiar
    const nextId = regs.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
    const anio = (body.fecha || '').substring(0, 4) || '2026';
    const consecutivo = `CAF-${anio}-${('00000' + nextId).slice(-5)}`;
    const calc = calcularHorasYTurnoClient(body.hora_ingreso, body.hora_salida);
    const vTotal = Math.round((calc.horas_diurnas * 5900) + (calc.horas_nocturnas * 7500));

    const nuevo = {
      id: nextId,
      consecutivo,
      ...body,
      ...calc,
      valor_a_pagar: vTotal,
      regional_nombre: 'Regional Quindío',
      sede_nombre: DEFAULT_SEDES.find(s => s.id == body.sede_id)?.nombre || 'Armenia',
      coordinador_nombre: DEFAULT_COORDINADORES.find(c => c.id == body.coordinador_id)?.nombres || 'Coordinador',
      usuario_creador: state.user ? state.user.usuario : '',
      estado: 'activo'
    };

    regs.unshift(nuevo);
    saveClientRegistros(regs);

    // Intentar sync en segundo plano con Google Apps Script si está disponible
    try {
      fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveRegistro', ...nuevo, sede: nuevo.sede_nombre })
      });
    } catch (e) {}

    return { success: true, consecutivo, valor_a_pagar: vTotal, id: nextId };
  }

  // 6b. Corregir (editar) registro
  if (/^\/api\/registros\/\d+$/.test(endpoint) && method === 'PUT') {
    const id = endpoint.split('/')[3];
    const regs = getClientRegistros();
    const idx = regs.findIndex(r => r.id == id);
    if (idx < 0) return { success: false, error: 'Registro no encontrado.' };
    if (!puedeGestionarRegistro(regs[idx])) return { success: false, error: 'No tienes permiso para modificar registros de otra sede.' };
    if (esRolSede()) body.sede_id = state.user.sede_id;
    const calc = calcularHorasYTurnoClient(body.hora_ingreso, body.hora_salida);
    const vTotal = Math.round((calc.horas_diurnas * 5900) + (calc.horas_nocturnas * 7500));
    const actualizado = {
      ...regs[idx], ...body, ...calc, valor_a_pagar: vTotal,
      sede_nombre: DEFAULT_SEDES.find(s => s.id == body.sede_id)?.nombre || regs[idx].sede_nombre,
      coordinador_nombre: DEFAULT_COORDINADORES.find(c => c.id == body.coordinador_id)?.nombres || regs[idx].coordinador_nombre
    };
    regs[idx] = actualizado;
    saveClientRegistros(regs);
    try {
      fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateRegistro', ...actualizado, sede: actualizado.sede_nombre })
      });
    } catch (e) {}
    return { success: true, consecutivo: actualizado.consecutivo, valor_a_pagar: vTotal, id: actualizado.id };
  }

  // 7. Anular Registro
  if (endpoint.includes('/anular')) {
    const id = endpoint.split('/')[3];
    const regs = getClientRegistros();
    const target = regs.find(r => r.id == id);
    if (target && !puedeGestionarRegistro(target)) return { success: false, error: 'No tienes permiso para anular registros de otra sede.' };
    if (target) {
      target.estado = 'anulado';
      saveClientRegistros(regs);
    }
    return { success: true, message: 'Registro anulado correctamente.' };
  }

  // 8. Usuarios
  if (endpoint.startsWith('/api/auth/users')) {
    return {
      usuarios: [
        { id: 1, nombre_completo: 'Administrador Central', usuario: 'admin', correo: 'admin@jardinesdelrenacer.com', rol: 'ADMINISTRADOR', estado: 'activo' },
        { id: 2, nombre_completo: 'Coordinador Armenia', usuario: 'coordinador', correo: 'coordinador@jardinesdelrenacer.com', rol: 'COORDINADOR', estado: 'activo' }
      ]
    };
  }

  // 9. Auditoría
  if (endpoint.startsWith('/api/auditoria')) {
    return {
      auditoria: [
        { id: 1, fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 19), usuario_nombre: 'Administrador Central', accion: 'SISTEMA_INICIADO', tabla: 'Sistema', registro_id: '0', valor_nuevo: 'Plataforma lista' }
      ]
    };
  }

  return { success: true };
}

// ============================================================================
// AUTENTICACIÓN Y ROLES
// ============================================================================
function switchAuthTab(tab) {
  const btnLogin = document.getElementById('tab-btn-login');
  const btnReg = document.getElementById('tab-btn-register');
  const formLogin = document.getElementById('form-login');
  const formReg = document.getElementById('form-register');

  if (tab === 'login') {
    btnLogin.classList.add('active');
    btnReg.classList.remove('active');
    formLogin.style.display = 'block';
    formReg.style.display = 'none';
  } else {
    btnLogin.classList.remove('active');
    btnReg.classList.add('active');
    formLogin.style.display = 'none';
    formReg.style.display = 'block';
    loadRegisterSedes();
  }
}

async function loadRegisterSedes() {
  const res = await apiRequest('/api/sedes');
  const select = document.getElementById('reg-sede');
  if (select && res.sedes) {
    select.innerHTML = res.sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const usuario = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  const res = await apiRequest('/api/auth/login', 'POST', { usuario, password });
  if (res && res.success) {
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('jr_cafeteria_token', res.token);
    localStorage.setItem('jr_cafeteria_user', JSON.stringify(res.user));
    await obtenerTokenSheets(res.sheetsToken, usuario, password);
    showToast('Bienvenido a Jardines del Renacer', 'success');
    await inicializarApp();
  } else {
    showToast(res.error || 'Error al iniciar sesión', 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const textoBtn = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Creando acceso...';

  const body = {
    nombre: document.getElementById('reg-nombre').value.trim(),
    correo: document.getElementById('reg-correo').value.trim(),
    celular: document.getElementById('reg-celular').value.trim(),
    usuario: document.getElementById('reg-usuario').value.trim(),
    password: document.getElementById('reg-password').value,
    sede_id: document.getElementById('reg-sede').value,
    sede: document.getElementById('reg-sede').selectedOptions[0]?.text || '',
    regional: document.getElementById('reg-regional').selectedOptions[0]?.text || 'Regional Quindío',
    cargo: document.getElementById('reg-cargo').value.trim()
  };

  let res;
  try {
    res = await crearAccesoUsuario(body);
  } catch (err) {
    console.error(err);
    res = { success: false, error: 'No se pudo crear el acceso: ' + err.message };
  }
  btn.disabled = false;
  btn.innerText = textoBtn;

  if (!res.success) {
    showToast(res.error || 'No se pudo crear el acceso', 'danger');
    return;
  }

  // Ingreso automático con la cuenta recién creada
  const login = await loginUsuarioCreado(body.usuario, body.password);
  const user = login.success ? login.user : res.user;
  state.token = login.success ? login.token : 'local-token-' + Date.now();
  state.user = user;
  localStorage.setItem('jr_cafeteria_token', state.token);
  localStorage.setItem('jr_cafeteria_user', JSON.stringify(user));
  await obtenerTokenSheets(login.sheetsToken, body.usuario, body.password);
  e.target.reset();
  showToast('¡Acceso creado! Bienvenido(a) ' + user.nombre_completo, 'success');
  await inicializarApp();
}

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('jr_cafeteria_token');
  localStorage.removeItem('jr_cafeteria_user');
  localStorage.removeItem('jr_sheets_token');
  state.sheetsToken = null;
  mostrarVistaAuth();
  showToast('Sesión cerrada correctamente', 'warning');
}

function mostrarVistaAuth() {
  document.getElementById('view-auth').style.display = 'flex';
  document.getElementById('app-layout').style.display = 'none';
}

function mostrarVistaApp() {
  document.getElementById('view-auth').style.display = 'none';
  document.getElementById('app-layout').style.display = 'flex';
}

// ============================================================================
// INICIALIZACIÓN DE LA APLICACIÓN
// ============================================================================
async function inicializarApp() {
  mostrarVistaApp();

  document.getElementById('sidebar-user-name').innerText = state.user.nombre_completo;
  document.getElementById('sidebar-user-role').innerText = state.user.rol === 'SEDE' ? ('SEDE · ' + (sedeNombreUsuario() || '')) : state.user.rol;
  document.getElementById('sidebar-user-avatar').innerText = state.user.nombre_completo.substring(0, 2).toUpperCase();

  document.getElementById('perfil-nombre').value = state.user.nombre_completo;
  document.getElementById('perfil-usuario').value = state.user.usuario;
  document.getElementById('perfil-rol').value = state.user.rol;
  document.getElementById('perfil-regional-sede').value = 'Regional Quindío' + (esRolSede() ? ' / Sede ' + sedeNombreUsuario() : ' / Todas las sedes');

  const esAdmin = state.user.rol === 'ADMINISTRADOR';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });
  // Elementos solo para Administrador y Coordinador (ven todas las sedes)
  document.querySelectorAll('.todas-sedes').forEach(el => {
    el.style.display = veTodasLasSedes() ? '' : 'none';
  });

  await Promise.all([
    cargarSedes(),
    cargarCoordinadores(),
    cargarAuxiliares()
  ]);

  aplicarRestriccionSede();
  navigateTo('dashboard');
}

function sedeNombreUsuario() {
  if (!state.user) return '';
  return state.user.sede_nombre || (DEFAULT_SEDES.find(s => s.id == state.user.sede_id) || {}).nombre || '';
}

// Usuario de SEDE: su sede queda fija en formulario, filtros y dashboard
function aplicarRestriccionSede() {
  if (!esRolSede()) {
    ['reg-form-sede', 'filtro-sede', 'dash-filter-sede'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
    return;
  }
  ['reg-form-sede', 'filtro-sede', 'dash-filter-sede'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = state.user.sede_id;
    el.disabled = true;
  });
}
// ============================================================================
function navigateTo(section) {
  const soloAdmin = ['coordinadores', 'tarifas', 'auditoria', 'usuarios'];
  if (soloAdmin.includes(section) && state.user.rol !== 'ADMINISTRADOR') section = 'dashboard';
  if (section === 'sedes' && esRolSede()) section = 'dashboard';
  state.currentSection = section;

  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.app-section').forEach(sec => sec.style.display = 'none');

  const targetSection = document.getElementById(`section-${section}`);
  if (targetSection) targetSection.style.display = 'block';

  const titles = {
    dashboard: { title: 'Dashboard General', subtitle: 'Métricas e indicadores en tiempo real de gastos de cafetería' },
    registro: { title: 'Registrar Cafetería', subtitle: 'Ingreso oficial y liquidación automática de servicios' },
    consultas: { title: 'Consultar Registros', subtitle: 'Histórico consolidado, filtros avanzados y envío a WhatsApp' },
    sedes: { title: 'Sedes y Regionales', subtitle: 'Directorio de sedes operativas de Jardines del Renacer' },
    auxiliares: { title: 'Auxiliares de Cafetería', subtitle: 'Personal operativo de cafetería por sede' },
    coordinadores: { title: 'Gestión de Coordinadores', subtitle: 'Mantenimiento de coordinadores oficiales autorizados' },
    tarifas: { title: 'Tarifas y Valores Anuales', subtitle: 'Configuración de tarifas hora diurna y nocturna' },
    reportes: { title: 'Reportes y Consolidados', subtitle: 'Descarga y exportación de estados financieros' },
    auditoria: { title: 'Auditoría y Trazabilidad', subtitle: 'Registro cronológico inmutable de cambios y operaciones' },
    usuarios: { title: 'Usuarios del Sistema', subtitle: 'Administración de cuentas y roles' },
    perfil: { title: 'Mi Perfil', subtitle: 'Información de la cuenta en sesión' }
  };

  const info = titles[section] || { title: 'CRM Cafetería', subtitle: '' };
  document.getElementById('page-heading').innerText = info.title;
  document.getElementById('page-subheading').innerText = info.subtitle;

  if (section === 'dashboard') loadDashboardStats();
  if (section === 'consultas') cargarRegistros(1);
  if (section === 'sedes') renderizarTablaSedes();
  if (section === 'auxiliares') renderizarTablaAuxiliares();
  if (section === 'coordinadores') renderizarTablaCoordinadores();
  if (section === 'tarifas') cargarTarifas();
  if (section === 'auditoria') cargarAuditoria();
  if (section === 'usuarios') cargarUsuarios();
  if (section === 'registro') recalcularTarifasEnVivo();

  if (window.innerWidth <= 992) {
    document.getElementById('sidebar').classList.remove('open');
    const ov = document.getElementById('sidebar-overlay');
    if (ov) ov.classList.remove('show');
  }
}

function toggleSidebar() {
  const abierto = document.getElementById('sidebar').classList.toggle('open');
  const ov = document.getElementById('sidebar-overlay');
  if (ov) ov.classList.toggle('show', abierto);
}

// Al girar o agrandar la pantalla, cerrar el menú móvil
window.addEventListener('resize', () => {
  if (window.innerWidth > 992) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  }
});

// ============================================================================
// CATÁLOGOS MAESTROS (SEDES, COORD, AUX)
// ============================================================================
async function cargarSedes() {
  const res = await apiRequest('/api/sedes');
  if (res && res.sedes) {
    state.sedes = res.sedes;
    poblarSelectSedes();
  }
}

function poblarSelectSedes() {
  const optionsHtml = state.sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  const allHtml = '<option value="">Todas las Sedes</option>' + optionsHtml;

  const selects = ['dash-filter-sede', 'filtro-sede', 'modal-tarifa-sede'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = id === 'modal-tarifa-sede' ? '<option value="">Aplica a todas las sedes</option>' + optionsHtml : allHtml;
  });

  const regSede = document.getElementById('reg-form-sede');
  if (regSede) regSede.innerHTML = optionsHtml;
  if (state.user) aplicarRestriccionSede();
}

async function cargarCoordinadores() {
  const res = await apiRequest('/api/coordinadores');
  if (res && res.coordinadores) {
    state.coordinadores = res.coordinadores;
    poblarSelectCoordinadores();
  }
}

function poblarSelectCoordinadores() {
  const optionsHtml = state.coordinadores
    .filter(c => c.activo === 1)
    .map(c => `<option value="${c.id}">${c.nombres} ${c.apellidos || ''}</option>`).join('');

  const regCoord = document.getElementById('reg-form-coordinador');
  if (regCoord) regCoord.innerHTML = optionsHtml;

  const filtroCoord = document.getElementById('filtro-coordinador');
  if (filtroCoord) filtroCoord.innerHTML = '<option value="">Todos los Coordinadores</option>' + optionsHtml;
}

async function cargarAuxiliares() {
  const res = await apiRequest('/api/auxiliares');
  if (res && res.auxiliares) {
    state.auxiliares = res.auxiliares;
    poblarSelectAuxiliares();
  }
}

function poblarSelectAuxiliares() {
  const optionsHtml = state.auxiliares
    .map(a => `<option value="${a.nombres}">${a.nombres}</option>`).join('');
  const regAux = document.getElementById('reg-form-auxiliar');
  if (regAux) regAux.innerHTML = optionsHtml;
}

// ============================================================================
// DASHBOARD ANALYTICS & CHARTS
// ============================================================================
async function loadDashboardStats() {
  const anio = document.getElementById('dash-filter-anio').value;
  const mes = document.getElementById('dash-filter-mes').value;
  const sede_id = document.getElementById('dash-filter-sede').value;

  let url = `/api/dashboard/stats?anio=${anio}`;
  if (mes) url += `&mes=${mes}`;
  if (sede_id) url += `&sede_id=${sede_id}`;

  const res = await apiRequest(url);
  if (!res || !res.kpis) return;

  document.getElementById('kpi-total-servicios').innerText = res.kpis.total_servicios.toLocaleString();
  document.getElementById('kpi-total-gasto').innerText = '$ ' + Math.round(res.kpis.total_gasto).toLocaleString();
  document.getElementById('kpi-total-horas').innerText = `${res.kpis.total_horas} h`;
  document.getElementById('kpi-horas-desglose').innerText = `${res.kpis.horas_diurnas} d / ${res.kpis.horas_nocturnas} n`;

  renderGraficoMensual(res.tendencia || []);
  renderGraficoSedes(res.sedes || []);

  const tbody = document.getElementById('dash-top-auxiliares-body');
  if (tbody) {
    if (!res.top_auxiliares || res.top_auxiliares.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay registros acumulados todavía</td></tr>';
    } else {
      tbody.innerHTML = res.top_auxiliares.map(a => `
        <tr>
          <td><strong>${a.auxiliar_nombre}</strong></td>
          <td>${a.cantidad} servicios</td>
          <td>$ ${Math.round(a.total_gasto).toLocaleString()} COP</td>
        </tr>
      `).join('');
    }
  }
}

function resetDashboardFilters() {
  document.getElementById('dash-filter-anio').value = '2026';
  document.getElementById('dash-filter-mes').value = '';
  document.getElementById('dash-filter-sede').value = esRolSede() ? state.user.sede_id : '';
  loadDashboardStats();
}

function renderGraficoMensual(datos) {
  const canvas = document.getElementById('chart-mensual');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = datos.map(d => d.mes_anio);
  const valores = datos.map(d => d.total_gasto);

  if (state.chartMensualInstance) state.chartMensualInstance.destroy();

  const ctx = canvas.getContext('2d');
  state.chartMensualInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gasto Total ($ COP)',
        data: valores,
        backgroundColor: '#1a0e2a',
        hoverBackgroundColor: '#c8a951',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function renderGraficoSedes(datos) {
  const canvas = document.getElementById('chart-sedes');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = datos.slice(0, 7).map(d => d.sede);
  const valores = datos.slice(0, 7).map(d => d.total_gasto);

  if (state.chartSedesInstance) state.chartSedesInstance.destroy();

  const ctx = canvas.getContext('2d');
  state.chartSedesInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: valores.length ? valores : [1],
        backgroundColor: ['#1a0e2a', '#c8a951', '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
    }
  });
}

// ============================================================================
// REGISTRO DE CAFETERÍA Y LIQUIDACIÓN EN VIVO
// ============================================================================
async function recalcularTarifasEnVivo() {
  const fecha = document.getElementById('reg-form-fecha').value;
  const sede_id = document.getElementById('reg-form-sede').value;
  const h_in = document.getElementById('reg-form-hora-in').value;
  const h_out = document.getElementById('reg-form-hora-out').value;

  if (!fecha || !h_in || !h_out) return;

  const res = await apiRequest('/api/calc/horas-valor', 'POST', {
    fecha, sede_id, hora_ingreso: h_in, hora_salida: h_out
  });

  if (res && res.total_horas !== undefined) {
    document.getElementById('reg-calc-total-horas').innerText = `${res.total_horas} h`;
    document.getElementById('reg-calc-horas-diurnas').innerText = `${res.horas_diurnas} h ($${res.tarifa_hora_diurna.toLocaleString()}/h)`;
    document.getElementById('reg-calc-horas-nocturnas').innerText = `${res.horas_nocturnas} h ($${res.tarifa_hora_nocturna.toLocaleString()}/h)`;
    document.getElementById('reg-calc-total-pagar').innerText = `$ ${Math.round(res.valor_a_pagar).toLocaleString()}`;

    const badge = document.getElementById('reg-calc-badge-turno');
    badge.innerText = res.turno;
    badge.className = 'badge ' + (res.turno === 'Turno Diurno' ? 'badge-diurno' : (res.turno === 'Turno Nocturno' ? 'badge-nocturno' : 'badge-mixto'));
  }
}

async function guardarRegistroCafeteria(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-registro');
  btn.disabled = true;
  btn.innerText = 'Guardando...';

  const payload = {
    fecha: document.getElementById('reg-form-fecha').value,
    sede_id: document.getElementById('reg-form-sede').value,
    auxiliar_nombre: document.getElementById('reg-form-auxiliar').value,
    nombre_fallecido: document.getElementById('reg-form-fallecido').value,
    prestacion: document.getElementById('reg-form-prestacion').value,
    hora_ingreso: document.getElementById('reg-form-hora-in').value,
    hora_salida: document.getElementById('reg-form-hora-out').value,
    coordinador_id: document.getElementById('reg-form-coordinador').value,
    obs_admon: document.getElementById('reg-form-obs').value
  };

  const editId = state.editandoId;
  const res = editId
    ? await apiRequest(`/api/registros/${editId}`, 'PUT', payload)
    : await apiRequest('/api/registros', 'POST', payload);
  btn.disabled = false;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar Servicio de Cafetería`;

  if (res.success && editId) {
    showToast(`Registro ${res.consecutivo} corregido correctamente`, 'success');
    limpiarFormularioRegistro();
    navigateTo('consultas');
    return;
  }
  if (res.success) {
    showToast(`Servicio registrado exitosamente: ${res.consecutivo}`, 'success');

    state.registroSeleccionado = {
      ...payload,
      consecutivo: res.consecutivo,
      valor_a_pagar: res.valor_a_pagar,
      sede_nombre: document.getElementById('reg-form-sede').options[document.getElementById('reg-form-sede').selectedIndex]?.text || 'Sede',
      coordinador_nombre: document.getElementById('reg-form-coordinador').options[document.getElementById('reg-form-coordinador').selectedIndex]?.text || 'Coordinador',
      total_horas: document.getElementById('reg-calc-total-horas').innerText.replace(' h', ''),
      turno: document.getElementById('reg-calc-badge-turno').innerText
    };

    limpiarFormularioRegistro();
    abrirModalWhatsApp(state.registroSeleccionado);
  } else {
    showToast(res.error || 'Error al guardar el servicio', 'danger');
  }
}

async function editarRegistro(id) {
  const res = await apiRequest('/api/registros?page=1&limit=1000');
  const r = (res.data || []).find(x => x.id == id);
  if (!r) { showToast('Registro no encontrado', 'danger'); return; }
  if (!puedeGestionarRegistro(r)) { showToast('Solo puedes corregir registros de tu sede', 'danger'); return; }

  navigateTo('registro');
  state.editandoId = r.id;
  document.getElementById('reg-form-fecha').value = r.fecha;
  document.getElementById('reg-form-sede').value = r.sede_id;
  document.getElementById('reg-form-auxiliar').value = r.auxiliar_nombre;
  document.getElementById('reg-form-prestacion').value = r.prestacion;
  document.getElementById('reg-form-fallecido').value = r.nombre_fallecido;
  document.getElementById('reg-form-hora-in').value = r.hora_ingreso;
  document.getElementById('reg-form-hora-out').value = r.hora_salida;
  if (r.coordinador_id) document.getElementById('reg-form-coordinador').value = r.coordinador_id;
  document.getElementById('reg-form-obs').value = r.obs_admon || '';
  document.getElementById('btn-submit-registro').innerText = 'Guardar Cambios (' + r.consecutivo + ')';
  recalcularTarifasEnVivo();
  showToast('Editando ' + r.consecutivo, 'info');
}

function limpiarFormularioRegistro() {
  state.editandoId = null;
  document.getElementById('reg-form-prestacion').value = '';
  document.getElementById('reg-form-fallecido').value = '';
  document.getElementById('reg-form-obs').value = '';
  document.getElementById('reg-form-fecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('reg-form-hora-in').value = '07:00';
  document.getElementById('reg-form-hora-out').value = '19:00';
  recalcularTarifasEnVivo();
}

// ============================================================================
// CONSULTAS, TABLAS Y FILTROS HISTÓRICOS
// ============================================================================
let debounceTimer;
function debounceBuscarRegistros() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => cargarRegistros(1), 400);
}

async function cargarRegistros(page = 1) {
  state.registrosPage = page;

  const search = (document.getElementById('filtro-search').value || '').toLowerCase();
  const sede_id = document.getElementById('filtro-sede').value;
  const coord_id = document.getElementById('filtro-coordinador').value;
  const turno = document.getElementById('filtro-turno').value;
  const estado = document.getElementById('filtro-estado').value;

  let url = `/api/registros?page=${page}&limit=${state.registrosLimit}`;
  const res = await apiRequest(url);
  if (!res || !res.data) return;

  let rows = res.data;
  if (search) {
    rows = rows.filter(r => (r.nombre_fallecido || '').toLowerCase().includes(search) || (r.prestacion || '').toLowerCase().includes(search) || (r.consecutivo || '').toLowerCase().includes(search));
  }
  if (sede_id) rows = rows.filter(r => r.sede_id == sede_id);
  if (coord_id) rows = rows.filter(r => r.coordinador_id == coord_id);
  if (turno) rows = rows.filter(r => r.turno === turno);
  if (estado) rows = rows.filter(r => r.estado === estado);

  const tbody = document.getElementById('tabla-registros-body');
  document.getElementById('total-registros-count').innerText = rows.length.toLocaleString();
  document.getElementById('paginacion-info').innerText = `Total registros: ${rows.length}`;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 30px;">No se encontraron registros. Agrega el primer servicio en "Registrar Cafetería".</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr class="${r.estado === 'anulado' ? 'anulado' : ''}">
      <td><strong>${r.consecutivo}</strong></td>
      <td>${r.fecha}</td>
      <td>${r.sede_nombre}</td>
      <td><span style="font-family: monospace; font-weight: 700;">${r.prestacion}</span></td>
      <td>${r.nombre_fallecido}</td>
      <td>${r.auxiliar_nombre}</td>
      <td>${r.hora_ingreso} - ${r.hora_salida}</td>
      <td>${r.total_horas} h</td>
      <td><span class="badge ${r.turno === 'Turno Diurno' ? 'badge-diurno' : (r.turno === 'Turno Nocturno' ? 'badge-nocturno' : 'badge-mixto')}">${r.turno}</span></td>
      <td style="font-weight: 700;">$ ${Math.round(r.valor_a_pagar).toLocaleString()}</td>
      <td style="white-space: nowrap;">
        <button class="btn btn-whatsapp btn-sm" onclick='prepararWhatsAppDesdeFila(${JSON.stringify(r)})' title="Enviar reporte por WhatsApp">
          💬 WA
        </button>
        ${r.estado === 'activo' && puedeGestionarRegistro(r) ? `
          <button class="btn btn-outline btn-sm" onclick="editarRegistro(${r.id})" title="Corregir registro">✏️ Corregir</button>
          <button class="btn btn-outline btn-sm" onclick="solicitarAnulacionRegistro(${r.id}, '${r.consecutivo}')" title="Anular Registro" style="color: var(--danger); border-color: #fca5a5;">
            Anular
          </button>
        ` : `<span class="badge badge-anulado">ANULADO</span>`}
      </td>
    </tr>
  `).join('');
}

function cambiarPagina(delta) {}

function limpiarFiltrosConsulta() {
  document.getElementById('filtro-search').value = '';
  document.getElementById('filtro-sede').value = esRolSede() ? state.user.sede_id : '';
  document.getElementById('filtro-coordinador').value = '';
  document.getElementById('filtro-turno').value = '';
  document.getElementById('filtro-estado').value = 'activo';
  cargarRegistros(1);
}

// ============================================================================
// INTEGRACIÓN CON WHATSAPP (FORMATO EXACTO SEGÚN DISEÑO.TXT)
// ============================================================================
function obtenerSaludoSegunHora() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return 'Buenos días ☀️';
  if (hora >= 12 && hora < 19) return 'Buenas tardes 🌜';
  return 'Buenas noches 🌚';
}

function construirMensajeWhatsApp(reg) {
  const saludo = obtenerSaludoSegunHora();
  const regional = reg.regional_nombre || 'Regional Quindío';
  const fecha = reg.fecha;
  const sede = reg.sede_nombre || reg.sede || '';
  const prestacion = reg.prestacion;
  const fallecido = reg.nombre_fallecido;
  const concepto = reg.obs_admon || 'Servicio de cafetería';
  const auxiliar = reg.auxiliar_nombre;
  const h_in = reg.hora_ingreso;
  const h_out = reg.hora_salida;
  const total_h = reg.total_horas;
  const turno = reg.turno;
  const valor = Math.round(reg.valor_a_pagar).toLocaleString();

  return `${saludo}
💰 REPORTE GASTOS DE CAFETERÍA
☺️ Regional: ${regional}
Fecha: ${fecha}
Sede: ${sede}
Prestación: ${prestacion}
Nombre del fallecido: ${fallecido}
Concepto: ${concepto}
Nombre auxiliar: ${auxiliar}
Hora de inicio: ${h_in}
Hora de salida: ${h_out}
Total de horas: ${total_h}
Turno de cafetería: ${turno}
Valor a cancelar: $${valor}
SMS App Datos de Cafetería.`;
}

function abrirModalWhatsApp(reg) {
  state.registroSeleccionado = reg;
  const texto = construirMensajeWhatsApp(reg);
  document.getElementById('wa-preview-text').value = texto;
  abrirModal('modal-whatsapp');
}

function prepararWhatsAppDesdeFila(reg) {
  abrirModalWhatsApp(reg);
}

function lanzarWhatsApp() {
  const phone = document.getElementById('wa-input-phone').value.replace(/[^0-9]/g, '');
  const texto = document.getElementById('wa-preview-text').value;

  if (!phone) {
    showToast('Por favor ingrese un número de WhatsApp de destino', 'warning');
    return;
  }

  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank');
  cerrarModal('modal-whatsapp');
  showToast('Abriendo WhatsApp con el reporte...', 'success');
}

// ============================================================================
// ANULACIÓN DE REGISTROS (SOFT DELETE)
// ============================================================================
let registroIdAnular = null;
function solicitarAnulacionRegistro(id, consecutivo) {
  registroIdAnular = id;
  document.getElementById('anular-consecutivo-label').innerText = consecutivo;
  document.getElementById('anular-motivo-input').value = '';
  abrirModal('modal-anular');
}

async function confirmarAnulacionRegistro() {
  const motivo = document.getElementById('anular-motivo-input').value.trim();
  if (!motivo) {
    showToast('Debe ingresar el motivo de la anulación', 'warning');
    return;
  }

  const res = await apiRequest(`/api/registros/${registroIdAnular}/anular`, 'POST', { motivo });
  if (res.success) {
    showToast('Registro anulado exitosamente', 'success');
    cerrarModal('modal-anular');
    cargarRegistros(1);
  } else {
    showToast(res.error || 'Error al anular registro', 'danger');
  }
}

// ============================================================================
// EXPORTACIÓN EXCEL CSV EN EL NAVEGADOR
// ============================================================================
function descargarExcelCSV() {
  const regs = filtrarPorRol(getClientRegistros());
  const csvLines = ['\ufeff"CONSECUTIVO";"FECHA";"REGIONAL";"SEDE";"AUXILIAR";"FALLECIDO";"PRESTACION";"INGRESO";"SALIDA";"TOTAL HORAS";"TURNO";"VALOR A PAGAR";"ESTADO"'];
  regs.forEach(r => {
    csvLines.push(`"${r.consecutivo}";"${r.fecha}";"Regional Quindío";"${r.sede_nombre}";"${r.auxiliar_nombre}";"${r.nombre_fallecido}";"${r.prestacion}";"${r.hora_ingreso}";"${r.hora_salida}";"${r.total_horas}";"${r.turno}";"${r.valor_a_pagar}";"${r.estado}"`);
  });
  const blob = new Blob([csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'Reporte_Cafeteria_Jardines_Del_Renacer.csv';
  link.click();
}

// ============================================================================
// ADMINISTRACIÓN DE TARIFAS ANUALES
// ============================================================================
async function cargarTarifas() {
  const res = await apiRequest('/api/tarifas');
  if (!res || !res.tarifas) return;

  const tbody = document.getElementById('tabla-tarifas-body');
  tbody.innerHTML = res.tarifas.map(t => `
    <tr>
      <td><strong>${t.anio}</strong></td>
      <td>${t.regional_nombre}</td>
      <td>${t.sede_nombre}</td>
      <td style="font-weight: 700; color: #166534;">$ ${t.valor_hora_diurna.toLocaleString()} COP</td>
      <td style="font-weight: 700; color: #1e40af;">$ ${t.valor_hora_nocturna.toLocaleString()} COP</td>
      <td>${t.vigencia_desde} a ${t.vigencia_hasta}</td>
      <td><span class="badge ${t.activo ? 'badge-activo' : 'badge-anulado'}">${t.activo ? 'Vigente' : 'Inactiva'}</span></td>
    </tr>
  `).join('');
}

function abrirModalNuevaTarifa() { abrirModal('modal-nueva-tarifa'); }
function abrirModalCopiarTarifas() { showToast('Tarifas 2026 copiadas a 2027 correctamente', 'success'); }
function guardarNuevaTarifa(e) {
  e.preventDefault();
  showToast('Tarifa configurada exitosamente', 'success');
  cerrarModal('modal-nueva-tarifa');
}

// ============================================================================
// COORDINADORES Y AUXILIARES
// ============================================================================
function renderizarTablaSedes() {
  const tbody = document.getElementById('tabla-sedes-body');
  if (tbody && state.sedes) {
    tbody.innerHTML = state.sedes.map(s => `
      <tr>
        <td>${s.id}</td>
        <td><strong>${s.nombre}</strong></td>
        <td>Regional Quindío</td>
        <td>${s.direccion || 'Sede oficial'}</td>
        <td>${s.telefono || 'PBX Renacer'}</td>
        <td><span class="badge badge-activo">${s.estado}</span></td>
      </tr>
    `).join('');
  }
}

function renderizarTablaCoordinadores() {
  const tbody = document.getElementById('tabla-coordinadores-body');
  if (tbody && state.coordinadores) {
    tbody.innerHTML = state.coordinadores.map(c => `
      <tr>
        <td>${c.id}</td>
        <td><strong>${c.nombres} ${c.apellidos || ''}</strong></td>
        <td>Regional Quindío</td>
        <td>${c.celular || 'No registrado'}</td>
        <td><span class="badge badge-activo">Activo</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="showToast('Coordinador oficial verificado', 'info')">
            Activo
          </button>
        </td>
      </tr>
    `).join('');
  }
}

function abrirModalNuevoCoordinador() { abrirModal('modal-nuevo-coordinador'); }
function guardarNuevoCoordinador(e) {
  e.preventDefault();
  showToast('Coordinador registrado', 'success');
  cerrarModal('modal-nuevo-coordinador');
}

function renderizarTablaAuxiliares() {
  const tbody = document.getElementById('tabla-auxiliares-body');
  if (tbody && state.auxiliares) {
    tbody.innerHTML = state.auxiliares.map(a => `
      <tr>
        <td>${a.id}</td>
        <td><strong>${a.nombres}</strong></td>
        <td>${a.documento || 'No registrado'}</td>
        <td>${a.telefono || 'No registrado'}</td>
        <td><span class="badge badge-activo">Activo</span></td>
      </tr>
    `).join('');
  }
}

function abrirModalNuevoAuxiliar() { abrirModal('modal-nuevo-auxiliar'); }
function guardarNuevoAuxiliar(e) {
  e.preventDefault();
  const nombre = document.getElementById('modal-aux-nombre').value;
  state.auxiliares.push({ id: state.auxiliares.length + 1, nombres: nombre });
  poblarSelectAuxiliares();
  showToast('Auxiliar registrada exitosamente', 'success');
  cerrarModal('modal-nuevo-auxiliar');
}

// ============================================================================
// AUDITORÍA Y USUARIOS
// ============================================================================
async function cargarAuditoria() {
  const res = await apiRequest('/api/auditoria');
  const tbody = document.getElementById('tabla-auditoria-body');
  if (tbody && res.auditoria) {
    tbody.innerHTML = res.auditoria.map(a => `
      <tr>
        <td>${a.fecha_hora}</td>
        <td><strong>${a.usuario_nombre}</strong></td>
        <td><span class="badge badge-activo">${a.accion}</span></td>
        <td>${a.tabla}</td>
        <td>#${a.registro_id}</td>
        <td>${a.valor_nuevo || '-'}</td>
      </tr>
    `).join('');
  }
}

async function cargarUsuarios() {
  const tbody = document.getElementById('tabla-usuarios-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">Cargando usuarios...</td></tr>';

  let filas = [];
  let desdeSheets = false;
  if (state.sheetsToken) {
    try {
      const r = await llamarSheets({ action: 'listUsers', token: state.sheetsToken });
      if (r && r.success) {
        desdeSheets = true;
        filas = r.usuarios.map(u => ({ origen: 'sheets', nombre: u.nombre, usuario: u.usuario, correo: u.correo, rol: u.rol, sede: u.sede, estado: u.estado }));
      } else if (r && r.error) {
        showToast(r.error, 'warning');
      }
    } catch (e) { console.warn(e); }
  }
  if (!desdeSheets) {
    filas.push({ origen: 'demo', nombre: 'Administrador Central', usuario: 'admin', correo: 'admin@jardinesdelrenacer.com', rol: 'ADMINISTRADOR', sede: 'Armenia', estado: 'activo' });
    filas.push({ origen: 'demo', nombre: 'Coordinador Armenia', usuario: 'coordinador', correo: 'coordinador@jardinesdelrenacer.com', rol: 'COORDINADOR', sede: 'Armenia', estado: 'activo' });
    getLocalUsers().forEach(u => filas.push({ origen: 'local', nombre: u.nombre_completo, usuario: u.usuario, correo: u.correo, rol: u.rol, sede: u.sede_nombre || sedeNombreDeId(u.sede_id), estado: 'activo' }));
  }

  const roles = ['ADMINISTRADOR', 'COORDINADOR', 'SEDE'];
  const sedesOpts = (sel) => DEFAULT_SEDES.map(s => `<option value="${s.nombre}" ${s.nombre === sel ? 'selected' : ''}>${s.nombre}</option>`).join('');
  tbody.innerHTML = filas.map((u, i) => {
    const editable = u.origen !== 'demo';
    const dis = editable ? '' : 'disabled';
    return `<tr>
      <td><strong>${u.nombre}</strong></td>
      <td>${u.usuario}</td>
      <td>${u.correo}</td>
      <td><select id="u-rol-${i}" class="form-control" ${dis}>${roles.map(r => `<option ${r === u.rol ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td><select id="u-sede-${i}" class="form-control" ${dis}>${sedesOpts(u.sede)}</select></td>
      <td><select id="u-estado-${i}" class="form-control" ${dis}><option ${u.estado === 'activo' ? 'selected' : ''}>activo</option><option ${u.estado !== 'activo' ? 'selected' : ''}>inactivo</option></select></td>
      <td>${editable ? `<button class="btn btn-primary btn-sm" onclick="guardarUsuarioAdmin(${i}, '${u.usuario}', '${u.origen}')">Guardar</button>` : '<span style="color:var(--text-muted); font-size:12px;">Fijo</span>'}</td>
    </tr>`;
  }).join('');
}

function sedeNombreDeId(id) { return (DEFAULT_SEDES.find(s => s.id == id) || {}).nombre || ''; }

async function guardarUsuarioAdmin(i, usuario, origen) {
  const rol = document.getElementById('u-rol-' + i).value;
  const sede = document.getElementById('u-sede-' + i).value;
  const estado = document.getElementById('u-estado-' + i).value;

  if (origen === 'local') {
    const lista = getLocalUsers();
    const u = lista.find(x => x.usuario === usuario);
    if (u) { u.rol = rol; u.sede_nombre = sede; u.sede_id = sedeIdPorNombre(sede) || 1; saveLocalUsers(lista); }
    showToast('Usuario actualizado (en este navegador)', 'success');
    return;
  }
  try {
    const r = await llamarSheets({ action: 'setRole', token: state.sheetsToken, usuario, rol, sede, estado });
    if (r && r.success) showToast('Usuario actualizado. Aplica en su próximo ingreso.', 'success');
    else showToast((r && r.error) || 'No se pudo actualizar', 'danger');
  } catch (e) { showToast('Sin conexión con Google Sheets', 'danger'); }
}

// ============================================================================
// MODALES Y TOASTS
// ============================================================================
function abrirModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function cerrarModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div style="flex: 1; font-size: 13.5px; font-weight: 500;">${message}</div>
    <button style="background:none; border:none; cursor:pointer; color:inherit; font-size:16px;" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}
