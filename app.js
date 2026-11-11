/**
 * CRM DATOS DE CAFETERÍA — JARDINES DEL RENACER
 * Controlador Frontend Principal
 */

// Estado Global
let state = {
  token: localStorage.getItem('jr_cafeteria_token') || null,
  user: null,
  currentSection: 'dashboard',
  sedes: [],
  regionales: [],
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
// INICIALIZACIÓN
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Establecer fecha de hoy en formulario de registro
  const today = new Date().toISOString().split('T')[0];
  const fechaInput = document.getElementById('reg-form-fecha');
  if (fechaInput) fechaInput.value = today;

  if (state.token) {
    const verified = await verificarSesion();
    if (verified) {
      await inicializarApp();
    } else {
      mostrarVistaAuth();
    }
  } else {
    mostrarVistaAuth();
  }
});

// ============================================================================
// SERVICIOS API (FETCH CON HEADERS)
// ============================================================================
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(endpoint, options);
    if (res.status === 401 && endpoint !== '/api/auth/login') {
      handleLogout();
      return { error: 'Sesión expirada' };
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`Error en API ${endpoint}:`, err);
    return { error: 'Error de conexión con el servidor' };
  }
}

// ============================================================================
// AUTENTICACIÓN Y ROLES
// ============================================================================
async function verificarSesion() {
  const res = await apiRequest('/api/auth/session');
  if (res && res.authenticated) {
    state.user = res.user;
    return true;
  }
  return false;
}

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
  const res = await fetch('/api/sedes');
  const data = await res.json();
  const select = document.getElementById('reg-sede');
  if (select && data.sedes) {
    select.innerHTML = data.sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const usuario = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  const res = await apiRequest('/api/auth/login', 'POST', { usuario, password });
  if (res.success) {
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('jr_cafeteria_token', res.token);
    showToast('Bienvenido al sistema de cafetería', 'success');
    await inicializarApp();
  } else {
    showToast(res.error || 'Error al iniciar sesión', 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const payload = {
    nombre_completo: document.getElementById('reg-nombre').value,
    correo: document.getElementById('reg-correo').value,
    celular: document.getElementById('reg-celular').value,
    usuario: document.getElementById('reg-usuario').value,
    password: document.getElementById('reg-password').value,
    regional_id: document.getElementById('reg-regional').value,
    sede_id: document.getElementById('reg-sede').value,
    cargo: document.getElementById('reg-cargo').value
  };

  const res = await apiRequest('/api/auth/register', 'POST', payload);
  if (res.success) {
    showToast(res.message, 'success');
    switchAuthTab('login');
  } else {
    showToast(res.error || 'Error al solicitar registro', 'danger');
  }
}

function handleLogout() {
  apiRequest('/api/auth/logout', 'POST');
  state.token = null;
  state.user = null;
  localStorage.removeItem('jr_cafeteria_token');
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

  // Actualizar datos de usuario en sidebar y perfil
  document.getElementById('sidebar-user-name').innerText = state.user.nombre_completo;
  document.getElementById('sidebar-user-role').innerText = state.user.rol;
  document.getElementById('sidebar-user-avatar').innerText = state.user.nombre_completo.substring(0, 2).toUpperCase();

  // Perfil
  document.getElementById('perfil-nombre').value = state.user.nombre_completo;
  document.getElementById('perfil-usuario').value = state.user.usuario;
  document.getElementById('perfil-rol').value = state.user.rol;
  document.getElementById('perfil-regional-sede').value = `Regional ${state.user.regional_id === 1 ? 'Quindío' : state.user.regional_id}`;

  // Control de permisos para administradores
  const esAdmin = state.user.rol === 'ADMINISTRADOR';
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = esAdmin ? '' : 'none';
  });

  // Cargar catálogos maestros
  await Promise.all([
    cargarSedes(),
    cargarCoordinadores(),
    cargarAuxiliares()
  ]);

  // Iniciar en dashboard
  navigateTo('dashboard');
}

// ============================================================================
// NAVEGACIÓN Y ENRUTAMIENTO
// ============================================================================
function navigateTo(section) {
  state.currentSection = section;

  // Actualizar menú activo
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Ocultar todas las secciones
  document.querySelectorAll('.app-section').forEach(sec => {
    sec.style.display = 'none';
  });

  // Mostrar la sección seleccionada
  const targetSection = document.getElementById(`section-${section}`);
  if (targetSection) {
    targetSection.style.display = 'block';
  }

  // Actualizar encabezados
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
    usuarios: { title: 'Usuarios del Sistema', subtitle: 'Aprobación de cuentas y administración de roles' },
    perfil: { title: 'Mi Perfil', subtitle: 'Información de la cuenta en sesión' }
  };

  const info = titles[section] || { title: 'CRM Cafetería', subtitle: '' };
  document.getElementById('page-heading').innerText = info.title;
  document.getElementById('page-subheading').innerText = info.subtitle;

  // Cargar datos correspondientes
  if (section === 'dashboard') loadDashboardStats();
  if (section === 'consultas') cargarRegistros(1);
  if (section === 'sedes') renderizarTablaSedes();
  if (section === 'auxiliares') renderizarTablaAuxiliares();
  if (section === 'coordinadores') renderizarTablaCoordinadores();
  if (section === 'tarifas') cargarTarifas();
  if (section === 'auditoria') cargarAuditoria();
  if (section === 'usuarios') cargarUsuarios();
  if (section === 'registro') recalcularTarifasEnVivo();

  // Cerrar sidebar en móvil al navegar
  if (window.innerWidth <= 992) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

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

  // Actualizar KPIs
  document.getElementById('kpi-total-servicios').innerText = res.kpis.total_servicios.toLocaleString();
  document.getElementById('kpi-total-gasto').innerText = '$ ' + Math.round(res.kpis.total_gasto).toLocaleString();
  document.getElementById('kpi-total-horas').innerText = `${res.kpis.total_horas} h`;
  document.getElementById('kpi-horas-desglose').innerText = `${res.kpis.horas_diurnas} d / ${res.kpis.horas_nocturnas} n`;

  // Renderizar Gráficos
  renderGraficoMensual(res.tendencia || []);
  renderGraficoSedes(res.sedes || []);

  // Top Auxiliares
  const tbody = document.getElementById('dash-top-auxiliares-body');
  if (tbody) {
    if (!res.top_auxiliares || res.top_auxiliares.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay datos para los filtros seleccionados</td></tr>';
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
  document.getElementById('dash-filter-sede').value = '';
  loadDashboardStats();
}

function renderGraficoMensual(datos) {
  const canvas = document.getElementById('chart-mensual');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = datos.map(d => d.mes_anio);
  const valores = datos.map(d => d.total_gasto);

  if (state.chartMensualInstance) {
    state.chartMensualInstance.destroy();
  }

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
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return '$ ' + ctx.raw.toLocaleString() + ' COP'; }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(v) { return '$' + (v / 1000000).toFixed(1) + 'M'; }
          }
        }
      }
    }
  });
}

function renderGraficoSedes(datos) {
  const canvas = document.getElementById('chart-sedes');
  if (!canvas || typeof Chart === 'undefined') return;

  const labels = datos.slice(0, 7).map(d => d.sede);
  const valores = datos.slice(0, 7).map(d => d.total_gasto);

  if (state.chartSedesInstance) {
    state.chartSedesInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  state.chartSedesInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: valores,
        backgroundColor: [
          '#1a0e2a', '#c8a951', '#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
      }
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

  const res = await apiRequest('/api/registros', 'POST', payload);
  btn.disabled = false;
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar Servicio de Cafetería`;

  if (res.success) {
    showToast(`Servicio registrado exitosamente: ${res.consecutivo}`, 'success');

    // Preparar objeto para WhatsApp inmediato si desea enviarlo
    state.registroSeleccionado = {
      ...payload,
      consecutivo: res.consecutivo,
      valor_a_pagar: res.valor_a_pagar,
      sede_nombre: document.getElementById('reg-form-sede').options[document.getElementById('reg-form-sede').selectedIndex].text,
      coordinador_nombre: document.getElementById('reg-form-coordinador').options[document.getElementById('reg-form-coordinador').selectedIndex].text,
      total_horas: document.getElementById('reg-calc-total-horas').innerText.replace(' h', ''),
      turno: document.getElementById('reg-calc-badge-turno').innerText
    };

    limpiarFormularioRegistro();

    // Preguntar si desea enviar WhatsApp
    abrirModalWhatsApp(state.registroSeleccionado);
  } else {
    showToast(res.error || 'Error al guardar el servicio', 'danger');
  }
}

function limpiarFormularioRegistro() {
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
  debounceTimer = setTimeout(() => {
    cargarRegistros(1);
  }, 400);
}

async function cargarRegistros(page = 1) {
  state.registrosPage = page;

  const search = document.getElementById('filtro-search').value;
  const sede_id = document.getElementById('filtro-sede').value;
  const coord_id = document.getElementById('filtro-coordinador').value;
  const turno = document.getElementById('filtro-turno').value;
  const f_desde = document.getElementById('filtro-fecha-desde').value;
  const f_hasta = document.getElementById('filtro-fecha-hasta').value;
  const estado = document.getElementById('filtro-estado').value;

  let url = `/api/registros?page=${page}&limit=${state.registrosLimit}`;
  if (search) url += `&q=${encodeURIComponent(search)}`;
  if (sede_id) url += `&sede_id=${sede_id}`;
  if (coord_id) url += `&coordinador_id=${coord_id}`;
  if (turno) url += `&turno=${encodeURIComponent(turno)}`;
  if (f_desde) url += `&fecha_desde=${f_desde}`;
  if (f_hasta) url += `&fecha_hasta=${f_hasta}`;
  if (estado) url += `&estado=${estado}`;

  const res = await apiRequest(url);
  if (!res || !res.data) return;

  const tbody = document.getElementById('tabla-registros-body');
  document.getElementById('total-registros-count').innerText = res.pagination.total.toLocaleString();
  document.getElementById('paginacion-info').innerText = `Página ${res.pagination.page} de ${res.pagination.pages} (${res.pagination.total} registros)`;

  state.registrosTotalPages = res.pagination.pages;
  document.getElementById('btn-pag-prev').disabled = page <= 1;
  document.getElementById('btn-pag-next').disabled = page >= res.pagination.pages;

  if (res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 30px;">No se encontraron registros con los criterios seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = res.data.map(r => `
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
        ${r.estado === 'activo' ? `
          <button class="btn btn-outline btn-sm" onclick="solicitarAnulacionRegistro(${r.id}, '${r.consecutivo}')" title="Anular Registro" style="color: var(--danger); border-color: #fca5a5;">
            Anular
          </button>
        ` : `<span class="badge badge-anulado">ANULADO</span>`}
      </td>
    </tr>
  `).join('');
}

function cambiarPagina(delta) {
  const nuevaPagina = state.registrosPage + delta;
  if (nuevaPagina >= 1 && nuevaPagina <= state.registrosTotalPages) {
    cargarRegistros(nuevaPagina);
  }
}

function limpiarFiltrosConsulta() {
  document.getElementById('filtro-search').value = '';
  document.getElementById('filtro-sede').value = '';
  document.getElementById('filtro-coordinador').value = '';
  document.getElementById('filtro-turno').value = '';
  document.getElementById('filtro-fecha-desde').value = '';
  document.getElementById('filtro-fecha-hasta').value = '';
  document.getElementById('filtro-estado').value = 'activo';
  cargarRegistros(1);
}

// ============================================================================
// INTEGRACIÓN CON WHATSAPP (FORMATO EXACTO SEGÚN DISEÑO.TXT)
// ============================================================================
function obtenerSaludoSegunHora() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) {
    return 'Buenos días ☀️';
  } else if (hora >= 12 && hora < 19) {
    return 'Buenas tardes 🌜';
  } else {
    return 'Buenas noches 🌚';
  }
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
// ANULACIÓN DE REGISTROS (SOFT DELETE CON AUDITORÍA)
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
    cargarRegistros(state.registrosPage);
  } else {
    showToast(res.error || 'Error al anular registro', 'danger');
  }
}

// ============================================================================
// ADMINISTRACIÓN DE TARIFAS ANUALES
// ============================================================================
async function cargarTarifas() {
  const anio = document.getElementById('filtro-tarifa-anio').value;
  let url = '/api/tarifas';
  if (anio) url += `?anio=${anio}`;

  const res = await apiRequest(url);
  if (!res || !res.tarifas) return;

  const tbody = document.getElementById('tabla-tarifas-body');
  tbody.innerHTML = res.tarifas.map(t => `
    <tr>
      <td><strong>${t.anio}</strong></td>
      <td>${t.regional_nombre}</td>
      <td>${t.sede_nombre || '<span style="color:var(--text-muted);">Todas las sedes</span>'}</td>
      <td style="font-weight: 700; color: #166534;">$ ${t.valor_hora_diurna.toLocaleString()} COP</td>
      <td style="font-weight: 700; color: #1e40af;">$ ${t.valor_hora_nocturna.toLocaleString()} COP</td>
      <td>${t.vigencia_desde || ''} a ${t.vigencia_hasta || ''}</td>
      <td><span class="badge ${t.activo ? 'badge-activo' : 'badge-anulado'}">${t.activo ? 'Vigente' : 'Inactiva'}</span></td>
    </tr>
  `).join('');
}

function abrirModalNuevaTarifa() {
  abrirModal('modal-nueva-tarifa');
}

async function guardarNuevaTarifa(e) {
  e.preventDefault();
  const payload = {
    anio: parseInt(document.getElementById('modal-tarifa-anio').value),
    regional_id: parseInt(document.getElementById('modal-tarifa-regional').value),
    sede_id: document.getElementById('modal-tarifa-sede').value || null,
    valor_hora_diurna: parseFloat(document.getElementById('modal-tarifa-diurna').value),
    valor_hora_nocturna: parseFloat(document.getElementById('modal-tarifa-nocturna').value)
  };

  const res = await apiRequest('/api/tarifas', 'POST', payload);
  if (res.success) {
    showToast(res.message, 'success');
    cerrarModal('modal-nueva-tarifa');
    cargarTarifas();
  } else {
    showToast(res.error || 'Error al guardar tarifa', 'danger');
  }
}

async function abrirModalCopiarTarifas() {
  const anioOrigen = prompt('Ingrese el año origen del cual copiar las tarifas (ej: 2026):', '2026');
  if (!anioOrigen) return;
  const anioDestino = prompt('Ingrese el nuevo año de vigencia (ej: 2027):', '2027');
  if (!anioDestino) return;

  const res = await apiRequest('/api/tarifas/copiar-anio', 'POST', {
    anio_origen: parseInt(anioOrigen),
    anio_destino: parseInt(anioDestino)
  });

  if (res.success) {
    showToast(res.message, 'success');
    document.getElementById('filtro-tarifa-anio').value = anioDestino;
    cargarTarifas();
  } else {
    showToast(res.error || 'Error al duplicar tarifas', 'danger');
  }
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
        <td>${c.regional_nombre || 'Regional Quindío'}</td>
        <td>${c.celular || 'No registrado'}</td>
        <td><span class="badge ${c.activo ? 'badge-activo' : 'badge-anulado'}">${c.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editarCoordinadorPrompt(${c.id}, '${c.nombres}', '${c.celular || ''}')">
            Editar
          </button>
        </td>
      </tr>
    `).join('');
  }
}

async function editarCoordinadorPrompt(id, nombreActual, celActual) {
  const nuevoNombre = prompt('Modificar nombre del coordinador oficial:', nombreActual);
  if (!nuevoNombre) return;
  const nuevoCel = prompt('Modificar teléfono celular / WhatsApp:', celActual);

  const res = await apiRequest(`/api/coordinadores/${id}`, 'PUT', {
    nombres: nuevoNombre,
    celular: nuevoCel,
    activo: true
  });

  if (res.success) {
    showToast(res.message, 'success');
    await cargarCoordinadores();
    renderizarTablaCoordinadores();
  } else {
    showToast(res.error || 'Error al actualizar coordinador', 'danger');
  }
}

function abrirModalNuevoCoordinador() {
  abrirModal('modal-nuevo-coordinador');
}

async function guardarNuevoCoordinador(e) {
  e.preventDefault();
  const payload = {
    nombres: document.getElementById('modal-coord-nombre').value,
    celular: document.getElementById('modal-coord-celular').value,
    regional_id: document.getElementById('modal-coord-regional').value
  };

  const res = await apiRequest('/api/coordinadores', 'POST', payload);
  if (res.success) {
    showToast(res.message, 'success');
    cerrarModal('modal-nuevo-coordinador');
    await cargarCoordinadores();
    renderizarTablaCoordinadores();
  } else {
    showToast(res.error || 'Error al registrar coordinador', 'danger');
  }
}

function renderizarTablaAuxiliares() {
  const tbody = document.getElementById('tabla-auxiliares-body');
  if (tbody && state.auxiliares) {
    tbody.innerHTML = state.auxiliares.map(a => `
      <tr>
        <td>${a.id}</td>
        <td><strong>${a.nombres} ${a.apellidos || ''}</strong></td>
        <td>${a.documento || 'No registrado'}</td>
        <td>${a.telefono || 'No registrado'}</td>
        <td><span class="badge badge-activo">Activo</span></td>
      </tr>
    `).join('');
  }
}

function abrirModalNuevoAuxiliar() {
  abrirModal('modal-nuevo-auxiliar');
}

async function guardarNuevoAuxiliar(e) {
  e.preventDefault();
  const payload = {
    nombres: document.getElementById('modal-aux-nombre').value,
    documento: document.getElementById('modal-aux-doc').value,
    telefono: document.getElementById('modal-aux-tel').value
  };

  const res = await apiRequest('/api/auxiliares', 'POST', payload);
  if (res.success) {
    showToast(res.message, 'success');
    cerrarModal('modal-nuevo-auxiliar');
    await cargarAuxiliares();
    renderizarTablaAuxiliares();
  } else {
    showToast(res.error || 'Error al registrar auxiliar', 'danger');
  }
}

// ============================================================================
// AUDITORÍA Y TRAZABILIDAD
// ============================================================================
async function cargarAuditoria() {
  const res = await apiRequest('/api/auditoria?limit=150');
  if (!res || !res.auditoria) return;

  const tbody = document.getElementById('tabla-auditoria-body');
  tbody.innerHTML = res.auditoria.map(a => `
    <tr>
      <td>${a.fecha_hora}</td>
      <td><strong>${a.usuario_nombre}</strong></td>
      <td><span class="badge ${a.accion.includes('ANULAR') ? 'badge-anulado' : 'badge-activo'}">${a.accion}</span></td>
      <td>${a.tabla}</td>
      <td>#${a.registro_id || '-'}</td>
      <td style="font-size: 11px; font-family: monospace; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title='${a.valor_nuevo || a.valor_anterior || ''}'>
        ${a.valor_nuevo || a.valor_anterior || '-'}
      </td>
    </tr>
  `).join('');
}

// ============================================================================
// ADMINISTRACIÓN DE USUARIOS
// ============================================================================
async function cargarUsuarios() {
  const res = await apiRequest('/api/auth/users');
  if (!res || !res.usuarios) return;

  const tbody = document.getElementById('tabla-usuarios-body');
  tbody.innerHTML = res.usuarios.map(u => `
    <tr>
      <td><strong>${u.nombre_completo}</strong></td>
      <td>${u.usuario}</td>
      <td>${u.correo}</td>
      <td><span class="badge badge-mixto">${u.rol}</span></td>
      <td>${u.regional_nombre || 'Quindío'} / ${u.sede_nombre || 'Todas'}</td>
      <td>
        <span class="badge ${u.estado === 'activo' ? 'badge-activo' : (u.estado === 'pendiente' ? 'badge-pendiente' : 'badge-anulado')}">
          ${u.estado}
        </span>
      </td>
      <td>
        ${u.estado === 'pendiente' ? `
          <button class="btn btn-gold btn-sm" onclick="cambiarEstadoUsuario(${u.id}, 'activo')">Aprobar</button>
          <button class="btn btn-danger btn-sm" onclick="cambiarEstadoUsuario(${u.id}, 'bloqueado')">Rechazar</button>
        ` : (u.estado === 'activo' ? `
          <button class="btn btn-outline btn-sm" onclick="cambiarEstadoUsuario(${u.id}, 'bloqueado')" style="color:var(--danger);">Bloquear</button>
        ` : `
          <button class="btn btn-outline btn-sm" onclick="cambiarEstadoUsuario(${u.id}, 'activo')">Activar</button>
        `)}
      </td>
    </tr>
  `).join('');
}

async function cambiarEstadoUsuario(userId, nuevoEstado) {
  const res = await apiRequest(`/api/auth/users/${userId}/status`, 'POST', { estado: nuevoEstado });
  if (res.success) {
    showToast(res.message, 'success');
    cargarUsuarios();
  } else {
    showToast(res.error || 'Error al modificar estado', 'danger');
  }
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

  setTimeout(() => {
    toast.remove();
  }, 4500);
}
