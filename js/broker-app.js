// ═══════════════════════════════════════════════
// BROKER-APP.JS — Dashboard del Broker
// ═══════════════════════════════════════════════
import { auth, requireRole, logout }          from './auth.js';
import { getMyAgents, saveAgentProfile,
         deleteAgentAndData, getHabilidades,
         saveHabilidades, calcHealthScore,
         createInvite, uuid }                  from './db.js';
import { HABILIDADES, HABS_BY_SITUATION,
         DEFAULT_HABS, scoreColor, scoreLabel,
         scoreClass, fmt, fmtShort, today }    from './constants.js';

// ── Estado global ────────────────────────────────────
let profile  = null;   // Perfil del broker autenticado
let agents   = [];     // Lista de agentes del broker
let currentPage = 'dashboard';
let viewingAgentId = null; // Al navegar dentro del broker

// ── INIT ─────────────────────────────────────────────
async function init() {
  profile = await requireRole('broker');
  if (!profile) return; // requireRole ya redirigió

  // Mostrar UI
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('layout').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');

  // Nombre en sidebar y avatar
  document.getElementById('broker-office-label').textContent = profile.office || 'Broker';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = (profile.name || 'B')[0].toUpperCase();

  // Nav listeners
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Cargar agentes y navegar
  await refreshAgents();
  navigate('dashboard');
}

async function refreshAgents() {
  agents = await getMyAgents(profile.uid);
}

// ── ROUTING ──────────────────────────────────────────
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  const titles = {
    dashboard:'Dashboard', agentes:'Mis Agentes', invitar:'Invitar Agente',
    habilidades:'Gestión de Habilidades', reportes:'Reportes del Equipo',
    configuracion:'Configuración'
  };
  document.getElementById('topbar-title').textContent = titles[page] || '';
  document.getElementById('topbar-action').innerHTML = '';

  const pages = {
    dashboard, agentes, invitar, habilidades, reportes, configuracion
  };
  (pages[page] || dashboard)();
  closeSidebar();
}

// ── PÁGINAS ──────────────────────────────────────────

async function dashboard() {
  const scores   = await Promise.all(agents.map(a => calcHealthScore(a.id).catch(() => 0)));
  const healthy  = scores.filter(s => s >= 70).length;
  const warn     = scores.filter(s => s >= 40 && s < 70).length;
  const crit     = scores.filter(s => s < 40).length;

  setContent(`
    <div class="grid-4 mb-3">
      <div class="kpi blue"><div class="kpi-label">Total agentes</div><div class="kpi-value">${agents.length}</div><div class="kpi-icon">👥</div></div>
      <div class="kpi green"><div class="kpi-label">Saludables</div><div class="kpi-value">${healthy}</div><div class="kpi-icon">💚</div></div>
      <div class="kpi amber"><div class="kpi-label">Atención</div><div class="kpi-value">${warn}</div><div class="kpi-icon">⚠️</div></div>
      <div class="kpi red"><div class="kpi-label">Críticos</div><div class="kpi-value">${crit}</div><div class="kpi-icon">🔴</div></div>
    </div>

    ${!agents.length ? `
      <div class="empty-state">
        <div class="es-icon">👥</div>
        <div class="fw-bold mb-2">Sin agentes aún</div>
        <div class="fs-sm text-2 mb-3">Invitá tu primer agente para comenzar el seguimiento financiero del equipo.</div>
        <button class="btn btn-primary" onclick="navigate('invitar')">Invitar primer agente →</button>
      </div>` : `
      <div class="card">
        <div class="card-header"><span class="card-title">Estado del equipo</span><button class="btn btn-ghost btn-sm" onclick="navigate('agentes')">Ver todos →</button></div>
        ${agents.map((ag, i) => agentCard(ag, scores[i])).join('')}
      </div>`}
  `);
}

async function agentes() {
  document.getElementById('topbar-action').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="navigate('invitar')">+ Invitar</button>`;

  const scores = await Promise.all(agents.map(a => calcHealthScore(a.id).catch(() => 0)));

  setContent(`
    <div class="card">
      <div class="card-header">
        <span class="card-title">Agentes (${agents.length})</span>
      </div>
      ${!agents.length
        ? `<div class="empty-state"><div class="es-icon">👥</div>Sin agentes. <button class="btn btn-primary mt-3" onclick="navigate('invitar')">Invitar</button></div>`
        : agents.map((ag, i) => agentCard(ag, scores[i], true)).join('')}
    </div>
  `);
}

function agentCard(ag, score, showActions = false) {
  const habCount = Object.values(ag.habs || DEFAULT_HABS).filter(Boolean).length;
  return `
    <div class="agent-card ${scoreClass(score)}" style="border-left-color:${scoreColor(score)}" onclick="viewAgent('${ag.id}')">
      <div class="flex items-center gap-3 mb-2">
        <div class="health-score" style="background:${scoreColor(score)}22;color:${scoreColor(score)}">${score}</div>
        <div style="flex:1;min-width:0">
          <div class="fw-bold" style="font-size:.9rem">${ag.name}</div>
          <div class="fs-xs text-2">${ag.email || ag.phone || 'Sin contacto'} · ${ag.office || ''}</div>
        </div>
        ${showActions ? `
          <div class="flex gap-2" onclick="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm" onclick="openHabsForAgent('${ag.id}')" title="Habilidades">⚡</button>
            <button class="btn btn-ghost btn-sm" onclick="confirmDeleteAgent('${ag.id}','${ag.name}')" title="Eliminar">🗑</button>
          </div>` : ''}
      </div>
      <div class="progress-bar mb-2"><div class="progress-fill" style="width:${score}%;background:${scoreColor(score)}"></div></div>
      <div class="flex gap-3 fs-xs text-2">
        <span>${scoreLabel(score)}</span>
        <span>⚡ ${habCount}/${HABILIDADES.length} habilidades</span>
        <span>Se unió: ${ag.joinDate ? ag.joinDate.slice(0,7) : '—'}</span>
      </div>
    </div>`;
}

window.viewAgent = async (id) => {
  // Navegar al dashboard del agente en modo lectura del broker
  viewingAgentId = id;
  alert('Vista del agente disponible en Fase 4. Por ahora, usá el panel de habilidades para gestionar sus módulos.');
};

window.openHabsForAgent = async (id) => {
  viewingAgentId = id;
  navigate('habilidades');
};

window.confirmDeleteAgent = (id, name) => {
  if (!confirm(`¿Eliminar a ${name} y todos sus datos? Esta acción no se puede deshacer.`)) return;
  deleteAgentAndData(id)
    .then(() => { agents = agents.filter(a => a.id !== id); navigate('agentes'); })
    .catch(e => alert('Error eliminando: ' + e.message));
};

async function invitar() {
  setContent(`
    <div class="card" style="max-width:500px;margin:0 auto">
      <div class="card-title">Invitar nuevo agente</div>
      <div class="alert alert-info mb-3">
        Se generará un link de registro único para el agente. Al ingresar al link, podrá crear su contraseña y será asignado automáticamente a tu equipo.
      </div>
      <form id="invite-form" onsubmit="handleInvite(event)">
        <div class="form-group"><label>Nombre del agente</label><input name="name" placeholder="Ej: Carlos Ruiz" required></div>
        <div class="form-group"><label>Email del agente</label><input name="email" type="email" placeholder="carlos@remax.com.ar" required></div>
        <div class="form-group"><label>Teléfono (opcional)</label><input name="phone" type="tel" placeholder="+54 11 1234-5678"></div>
        <div class="form-group"><label>Oficina / Zona</label><input name="office" placeholder="Ej: RE/MAX Norte" value="${profile.office || ''}"></div>
        <div class="form-group">
          <label>Situación inicial</label>
          <select name="situation">
            <option value="nuevo">🟡 Nuevo — sin historial financiero</option>
            <option value="en-crecimiento">🟠 En crecimiento — ingresos irregulares</option>
            <option value="estable" selected>🟢 Estable — ingresos regulares</option>
            <option value="avanzado">🔵 Avanzado — ya invierte y planifica</option>
          </select>
        </div>
        <div id="invite-habs" class="card mt-3" style="padding:14px"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit" id="btn-invite">Generar invitación</button>
      </form>
      <div id="invite-result" class="mt-3"></div>
    </div>
  `);
  renderInviteHabs('estable');

  document.querySelector('[name=situation]').addEventListener('change', e => renderInviteHabs(e.target.value));
}

function renderInviteHabs(situation) {
  const habs = HABS_BY_SITUATION[situation] || DEFAULT_HABS;
  document.getElementById('invite-habs').innerHTML = `
    <div class="card-title">Habilidades asignadas automáticamente</div>
    <div class="fs-xs text-2 mb-3">Podés ajustarlas después desde el panel de habilidades.</div>
    ${HABILIDADES.map(h => `
      <div class="flex items-center justify-between" style="padding:7px 0;border-bottom:1px solid var(--border)">
        <span class="fs-sm">${h.icon} ${h.name}</span>
        <span class="badge ${habs[h.id] ? 'badge-green' : 'badge-red'}">${habs[h.id] ? '✓ Habilitado' : '✗ Bloqueado'}</span>
      </div>`).join('')}
  `;
}

window.handleInvite = async (e) => {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const sit  = fd.get('situation');
  const habs = { ...HABS_BY_SITUATION[sit] };

  const btn = document.getElementById('btn-invite');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  try {
    const token = await createInvite({
      brokerId:   profile.uid,
      brokerName: profile.name,
      agentEmail: fd.get('email'),
      habs,
      situation:  sit,
    });

    const baseUrl = window.location.origin;
    const link    = `${baseUrl}/register.html?token=${token}`;

    document.getElementById('invite-result').innerHTML = `
      <div class="alert alert-success">
        ✅ <div>
          <strong>Invitación generada para ${fd.get('email')}</strong>
          <div class="fs-sm mt-2">Link de registro (válido 7 días):</div>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;margin-top:8px;word-break:break-all;font-size:.75rem;font-family:monospace">${link}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${link}').then(()=>this.textContent='✓ Copiado!')">📋 Copiar link</button>
            <a href="https://wa.me/?text=${encodeURIComponent('Te invito a FinanceOS: ' + link)}" target="_blank" class="btn btn-ghost btn-sm">💬 Enviar por WhatsApp</a>
          </div>
        </div>
      </div>`;
    btn.textContent = 'Generar otra invitación';
    btn.disabled = false;
  } catch(err) {
    document.getElementById('invite-result').innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    btn.textContent = 'Generar invitación';
    btn.disabled = false;
  }
};

async function habilidades() {
  const agentList = agents;
  const selectedId = viewingAgentId || agentList[0]?.id;

  setContent(`
    <div class="card" style="max-width:560px;margin:0 auto">
      <div class="form-group">
        <label>Agente</label>
        <select id="hab-agent-sel" onchange="loadAgentHabs(this.value)">
          ${agentList.map(a => `<option value="${a.id}" ${a.id===selectedId?'selected':''}>${a.name}</option>`).join('')}
        </select>
      </div>
      <div id="hab-content">
        ${agentList.length ? '<div class="fs-sm text-2">Cargando...</div>' : '<div class="empty-state">Sin agentes.</div>'}
      </div>
    </div>
  `);

  if (selectedId) await loadAgentHabs(selectedId);
}

window.loadAgentHabs = async (agentId) => {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  const habs  = await getHabilidades(agentId);
  const score = await calcHealthScore(agentId).catch(() => 0);

  document.getElementById('hab-content').innerHTML = `
    <div style="background:${scoreColor(score)}18;border:1px solid ${scoreColor(score)}40;border-radius:var(--r-sm);padding:12px;margin-bottom:14px">
      <div class="flex items-center gap-3">
        <div style="font-size:1.8rem;font-weight:900;color:${scoreColor(score)}">${score}</div>
        <div><div class="fw-bold">${scoreLabel(score)}</div><div class="fs-xs text-2">${agent.office||''}</div></div>
      </div>
    </div>
    <div class="card-title">Módulos habilitados</div>
    ${HABILIDADES.map(h => {
      const enabled = habs[h.id] || false;
      const rec = score < h.minScore && h.minScore > 0
        ? `<div class="fs-xs" style="color:var(--warning);margin-top:2px">⚠️ Score recomendado: ${h.minScore}</div>` : '';
      return `
        <div class="hab-toggle">
          <div style="flex:1">
            <div class="fs-sm fw-bold">${h.icon} ${h.name}</div>
            <div class="fs-xs text-2">${h.desc}</div>
            ${rec}
          </div>
          <label class="toggle">
            <input type="checkbox" ${enabled?'checked':''} onchange="toggleHab('${agentId}','${h.id}',this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>`;
    }).join('')}
    <div class="flex gap-2 mt-3">
      <button class="btn btn-success btn-sm" onclick="enableAll('${agentId}')">✅ Habilitar todo</button>
      <button class="btn btn-ghost btn-sm" onclick="autoAssign('${agentId}',${score})">🤖 Auto-asignar</button>
    </div>
  `;
};

window.toggleHab = async (agentId, habId, value) => {
  const habs = await getHabilidades(agentId);
  habs[habId] = value;
  await saveHabilidades(agentId, habs);
};

window.enableAll = async (agentId) => {
  const habs = {};
  HABILIDADES.forEach(h => habs[h.id] = true);
  await saveHabilidades(agentId, habs);
  await loadAgentHabs(agentId);
};

window.autoAssign = async (agentId, score) => {
  const habs = {};
  HABILIDADES.forEach(h => habs[h.id] = score >= h.minScore);
  await saveHabilidades(agentId, habs);
  await loadAgentHabs(agentId);
};

async function reportes() {
  setContent(`
    <div class="empty-state">
      <div class="es-icon">📊</div>
      <div class="fw-bold mb-2">Reportes del equipo</div>
      <div class="fs-sm text-2">Disponible en Fase 4 — comparativa de salud financiera entre agentes, ranking, y métricas del equipo.</div>
    </div>
  `);
}

async function configuracion() {
  setContent(`
    <div class="card" style="max-width:480px;margin:0 auto">
      <div class="card-title">Perfil del Broker</div>
      <form onsubmit="saveBrokerConfig(event)">
        <div class="form-group"><label>Nombre</label><input name="name" value="${profile.name||''}" required></div>
        <div class="form-group"><label>Email</label><input type="email" value="${profile.email||''}" disabled style="opacity:.6"></div>
        <div class="form-group"><label>Oficina / Sucursal</label><input name="office" value="${profile.office||''}"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit">Guardar cambios</button>
      </form>
      <hr>
      <button class="btn btn-danger btn-block" onclick="handleLogout()">🚪 Cerrar sesión</button>
    </div>
  `);
}

window.saveBrokerConfig = async (e) => {
  e.preventDefault();
  // Fase 4: implementar update de perfil en Firestore
  alert('✅ Configuración guardada (Firestore update en Fase 4)');
};

// ── HELPERS UI ────────────────────────────────────────
function setContent(html) {
  document.getElementById('content').innerHTML = html;
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

window.openModal  = openModal;
window.closeModal = closeModal;

window.toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
};
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
};
window.openUserMenu = () => navigate('configuracion');
window.navigate = navigate;

window.handleLogout = async () => {
  await logout();
};

// ── KICK OFF ─────────────────────────────────────────
init().catch(err => {
  console.error('Broker init error:', err);
  document.getElementById('loading-screen').innerHTML = `
    <div style="text-align:center;padding:24px">
      <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
      <div class="fw-bold mb-2">Error al cargar</div>
      <div class="fs-sm text-2 mb-3">${err.message}</div>
      <button onclick="location.reload()" class="btn btn-primary">Reintentar</button>
    </div>`;
});
