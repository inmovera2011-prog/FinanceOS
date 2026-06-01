// ═══════════════════════════════════════════════
// BROKER-APP.JS — Dashboard del Broker (Fase 4)
// ═══════════════════════════════════════════════
import { auth, requireRole, logout }          from './auth.js';
import { getMyAgents, getAgentProfile,
         saveAgentProfile, deleteAgentAndData,
         getHabilidades, saveHabilidades,
         calcHealthScore, createInvite,
         ViewingAgent, getMonthTransactions,
         getAccounts, getGoals, getSettings,
         calcPeriodTotals, calcCategoryTotals,
         calcAccountBalance }                  from './db.js';
import { HABILIDADES, HABS_BY_SITUATION,
         DEFAULT_HABS, DEFAULT_CATS,
         scoreColor, scoreLabel, scoreClass,
         fmt, fmtShort, monthKey, today }      from './constants.js';

// ── Estado ───────────────────────────────────────────
let profile         = null;
let agents          = [];
let agentScores     = {};   // { uid: score }
let currentPage     = 'dashboard';
let activeCharts    = {};

// ── INIT ─────────────────────────────────────────────
async function init() {
  profile = await requireRole('broker');
  if (!profile) return;

  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('layout').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');

  document.getElementById('broker-office-label').textContent = profile.office || 'Broker';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = (profile.name || 'B')[0].toUpperCase();

  document.querySelectorAll('[data-page]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.page))
  );

  await refreshAgents();
  navigate('dashboard');
}

async function refreshAgents() {
  agents = await getMyAgents(profile.uid);
  // Calcular scores en paralelo
  const results = await Promise.all(
    agents.map(a => calcHealthScore(a.id).catch(() => 0))
  );
  agents.forEach((a, i) => { agentScores[a.id] = results[i]; });
}

// ── ROUTING ──────────────────────────────────────────
function navigate(page) {
  destroyCharts();
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

  const pages = { dashboard, agentes, invitar, habilidades, reportes, configuracion };
  (pages[page] || dashboard)();
  closeSidebar();
}

function destroyCharts() {
  Object.values(activeCharts).forEach(c => { try { c.destroy(); } catch {} });
  activeCharts = {};
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
async function dashboard() {
  const healthy = agents.filter(a => (agentScores[a.id]||0) >= 70).length;
  const warn    = agents.filter(a => { const s=agentScores[a.id]||0; return s>=40&&s<70; }).length;
  const crit    = agents.filter(a => (agentScores[a.id]||0) < 40).length;

  // Top 3 agentes por score
  const top3 = [...agents]
    .sort((a,b) => (agentScores[b.id]||0) - (agentScores[a.id]||0))
    .slice(0, 3);

  setContent(`
    <div class="grid-4 mb-3">
      <div class="kpi blue"><div class="kpi-label">Total agentes</div><div class="kpi-value">${agents.length}</div><div class="kpi-icon">👥</div></div>
      <div class="kpi green"><div class="kpi-label">Saludables</div><div class="kpi-value">${healthy}</div><div class="kpi-icon">💚</div></div>
      <div class="kpi amber"><div class="kpi-label">Atención</div><div class="kpi-value">${warn}</div><div class="kpi-icon">⚠️</div></div>
      <div class="kpi red"><div class="kpi-label">Críticos</div><div class="kpi-value">${crit}</div><div class="kpi-icon">🔴</div></div>
    </div>

    ${!agents.length ? emptyAgents() : `
    <div class="grid-2 mb-3">
      <div class="card">
        <div class="card-header"><span class="card-title">Salud del equipo</span></div>
        <div class="chart-wrap h220"><canvas id="chart-health"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Top agentes</span></div>
        ${top3.map((ag,i) => {
          const s = agentScores[ag.id]||0;
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:1.2rem;width:24px;text-align:center;color:${['#ffd700','#c0c0c0','#cd7f32'][i]}">
              ${['🥇','🥈','🥉'][i]}
            </div>
            <div style="flex:1;min-width:0">
              <div class="fw-bold fs-sm">${ag.name}</div>
              <div class="progress-bar mt-1"><div class="progress-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
            </div>
            <div style="font-weight:800;color:${scoreColor(s)};font-size:1rem">${s}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Estado del equipo</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('agentes')">Ver todos →</button>
      </div>
      ${agents.slice(0,5).map(ag => agentRow(ag)).join('')}
      ${agents.length>5?`<div class="fs-xs text-2 mt-2 text-center">y ${agents.length-5} más...</div>`:''}
    </div>`}
  `);

  if (agents.length) {
    setTimeout(() => renderHealthChart(healthy, warn, crit), 50);
  }
}

function emptyAgents() {
  return `<div class="empty-state">
    <div class="es-icon">👥</div>
    <div class="fw-bold mb-2">Sin agentes aún</div>
    <div class="fs-sm text-2 mb-3">Invitá tu primer agente para comenzar el seguimiento.</div>
    <button class="btn btn-primary" onclick="navigate('invitar')">Invitar primer agente →</button>
  </div>`;
}

function renderHealthChart(h, w, c) {
  const ctx = document.getElementById('chart-health');
  if (!ctx) return;
  activeCharts.health = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Saludables', 'Atención', 'Críticos'],
      datasets: [{ data:[h,w,c], backgroundColor:['#10b981','#f59e0b','#ef4444'], borderWidth:0 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins: {
        legend: { position:'bottom', labels:{ color:'#94a3b8', font:{size:11}, padding:12 } },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} agentes` } }
      }
    }
  });
}

// ═══════════════════════════════════════════════
// AGENTES
// ═══════════════════════════════════════════════
async function agentes() {
  document.getElementById('topbar-action').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="navigate('invitar')">+ Invitar</button>`;

  setContent(`
    <div class="card">
      <div class="card-header">
        <span class="card-title">Agentes (${agents.length})</span>
        <input id="search-agents" placeholder="Buscar..." onInput="filterAgents(this.value)"
          style="width:140px;padding:6px 10px;font-size:.8rem;min-height:32px">
      </div>
      <div id="agents-list">
        ${!agents.length
          ? `<div class="empty-state"><div class="es-icon">👥</div>Sin agentes.<br><button class="btn btn-primary mt-3" onclick="navigate('invitar')">Invitar</button></div>`
          : agents.map(ag => agentCard(ag)).join('')}
      </div>
    </div>
  `);
}

window.filterAgents = (q) => {
  const lower = q.toLowerCase();
  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(lower) ||
    (a.email||'').toLowerCase().includes(lower) ||
    (a.office||'').toLowerCase().includes(lower)
  );
  document.getElementById('agents-list').innerHTML =
    filtered.length ? filtered.map(ag => agentCard(ag)).join('') : '<div class="empty-state fs-sm">Sin resultados</div>';
};

function agentRow(ag) {
  const s = agentScores[ag.id] || 0;
  return `<div class="flex items-center gap-3" style="padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="viewAgentDetail('${ag.id}')">
    <div class="health-score" style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:900;background:${scoreColor(s)}22;color:${scoreColor(s)};flex-shrink:0">${s}</div>
    <div style="flex:1;min-width:0"><div class="fw-bold fs-sm">${ag.name}</div><div class="fs-xs text-2">${ag.email||''} · ${ag.office||''}</div></div>
    <span class="badge ${s>=70?'badge-green':s>=40?'badge-amber':'badge-red'}">${scoreLabel(s).split(' ')[0]}</span>
  </div>`;
}

function agentCard(ag) {
  const s = agentScores[ag.id] || 0;
  const habs = Object.values(ag.habs || DEFAULT_HABS).filter(Boolean).length;
  return `
  <div class="agent-card ${scoreClass(s)}" style="border-left-color:${scoreColor(s)}" onclick="viewAgentDetail('${ag.id}')">
    <div class="flex items-center gap-3 mb-2">
      <div class="health-score" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:900;background:${scoreColor(s)}22;color:${scoreColor(s)};flex-shrink:0">${s}</div>
      <div style="flex:1;min-width:0">
        <div class="fw-bold">${ag.name}</div>
        <div class="fs-xs text-2">${ag.email||''} · ${ag.office||'Sin oficina'}</div>
      </div>
      <div class="flex gap-2" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openHabsEditor('${ag.id}')" title="Habilidades">⚡</button>
        <button class="btn btn-ghost btn-sm" onclick="openEditAgent('${ag.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="confirmDelete('${ag.id}','${ag.name.replace(/'/g,'')}')" title="Eliminar">🗑</button>
      </div>
    </div>
    <div class="progress-bar mb-2"><div class="progress-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
    <div class="flex gap-3 fs-xs text-2">
      <span>${scoreLabel(s)}</span>
      <span>⚡ ${habs}/${HABILIDADES.length} módulos</span>
      <span>📅 ${ag.joinDate||'—'}</span>
    </div>
  </div>`;
}

// ── Ver detalle de un agente ──────────────────────────
window.viewAgentDetail = async (id) => {
  const ag = agents.find(a => a.id === id);
  if (!ag) return;
  const s = agentScores[id] || 0;

  // Cargar datos del agente para el resumen
  ViewingAgent.set(id);
  const ym = monthKey();
  const [txs, accounts, goals, habs] = await Promise.all([
    getMonthTransactions(ym).catch(() => []),
    getAccounts().catch(() => []),
    getGoals().catch(() => []),
    getHabilidades(id),
  ]);
  ViewingAgent.clear();

  const totals = calcPeriodTotals(txs, DEFAULT_CATS);
  const totalBal = accounts.reduce((sum, a) => sum + calcAccountBalance(a, txs), 0);
  const emGoal = goals.find(g => g.type === 'emergency_fund');
  const emPct  = emGoal ? Math.min(100, (emGoal.currentAmount / emGoal.targetAmount) * 100) : 0;

  showGenericModal(`👤 ${ag.name}`, `
    <div style="background:${scoreColor(s)}18;border:1px solid ${scoreColor(s)}40;border-radius:var(--r-sm);padding:14px;margin-bottom:16px">
      <div class="flex items-center gap-3">
        <div style="font-size:2.2rem;font-weight:900;color:${scoreColor(s)}">${s}</div>
        <div>
          <div class="fw-bold">${scoreLabel(s)}</div>
          <div class="fs-xs text-2">${ag.situation||'—'} · ${ag.office||''}</div>
        </div>
      </div>
      <div class="progress-bar mt-2" style="height:5px"><div class="progress-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
    </div>

    <div class="grid-2 mb-3" style="gap:8px">
      <div class="kpi green" style="padding:12px"><div class="kpi-label">Ingresos mes</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(totals.ingresos)}</div></div>
      <div class="kpi red" style="padding:12px"><div class="kpi-label">Gastos mes</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(totals.egresos)}</div></div>
      <div class="kpi blue" style="padding:12px"><div class="kpi-label">Patrimonio</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(totalBal)}</div></div>
      <div class="kpi ${totals.neto>=0?'purple':'amber'}" style="padding:12px"><div class="kpi-label">Neto mes</div><div class="kpi-value" style="font-size:1.1rem">${totals.neto>=0?'+':''}${fmtShort(totals.neto)}</div></div>
    </div>

    ${emGoal ? `
    <div class="card mb-3" style="padding:12px">
      <div class="card-title">🛡️ Fondo de Emergencia</div>
      <div class="flex justify-between fs-sm mb-1"><span>${fmt(emGoal.currentAmount)}</span><span class="text-2">${fmt(emGoal.targetAmount)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${emPct}%;background:${emPct>=100?'var(--success)':'var(--warning)'}"></div></div>
      <div class="fs-xs text-2 mt-1">${emPct.toFixed(1)}% completado</div>
    </div>` : ''}

    <div class="card mb-3" style="padding:12px">
      <div class="card-title">Módulos habilitados</div>
      <div class="flex" style="flex-wrap:wrap;gap:6px;margin-top:6px">
        ${HABILIDADES.map(h => `<span class="badge ${habs[h.id]?'badge-green':'badge-red'}">${h.icon} ${h.name}</span>`).join('')}
      </div>
    </div>

    <div class="flex gap-2">
      <button class="btn btn-primary btn-sm" onclick="closeModal('modal-generic');openHabsEditor('${id}')">⚡ Habilidades</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-generic');openEditAgent('${id}')">✏️ Editar perfil</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal('modal-generic');confirmDelete('${id}','${ag.name.replace(/'/g,'')}')">🗑 Eliminar</button>
    </div>
  `);
};

// ── Editar agente ─────────────────────────────────────
window.openEditAgent = (id) => {
  const ag = agents.find(a => a.id === id);
  if (!ag) return;
  showGenericModal('✏️ Editar Agente', `
    <form onsubmit="submitEditAgent(event,'${id}')">
      <div class="form-group"><label>Nombre</label><input name="name" value="${ag.name||''}" required></div>
      <div class="form-group"><label>Email</label><input type="email" value="${ag.email||''}" disabled style="opacity:.6"></div>
      <div class="form-group"><label>Teléfono</label><input name="phone" value="${ag.phone||''}" type="tel"></div>
      <div class="form-group"><label>Oficina</label><input name="office" value="${ag.office||''}"></div>
      <div class="form-group"><label>Situación</label>
        <select name="situation">
          ${['nuevo','en-crecimiento','estable','avanzado'].map(s =>
            `<option value="${s}" ${ag.situation===s?'selected':''}>${{nuevo:'🟡 Nuevo',  'en-crecimiento':'🟠 En crecimiento',estable:'🟢 Estable',avanzado:'🔵 Avanzado'}[s]}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group"><label>Estado</label>
        <select name="status">
          <option value="activo" ${ag.status==='activo'?'selected':''}>✅ Activo</option>
          <option value="inactivo" ${ag.status==='inactivo'?'selected':''}>⏸️ Inactivo</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar cambios</button>
    </form>`);
};

window.submitEditAgent = async (e, id) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const ag = agents.find(a => a.id === id);
  const updated = { ...ag,
    name: fd.get('name'), phone: fd.get('phone'),
    office: fd.get('office'), situation: fd.get('situation'), status: fd.get('status')
  };
  await saveAgentProfile(id, updated);
  const idx = agents.findIndex(a => a.id === id);
  if (idx >= 0) agents[idx] = updated;
  closeModal('modal-generic');
  navigate('agentes');
};

window.confirmDelete = async (id, name) => {
  if (!confirm(`¿Eliminar a ${name} y TODOS sus datos? Esta acción no se puede deshacer.`)) return;
  await deleteAgentAndData(id);
  agents = agents.filter(a => a.id !== id);
  delete agentScores[id];
  closeModal('modal-generic');
  navigate('agentes');
};

// ═══════════════════════════════════════════════
// INVITAR AGENTE
// ═══════════════════════════════════════════════
async function invitar() {
  setContent(`
    <div class="card" style="max-width:500px;margin:0 auto">
      <div class="card-title">Invitar nuevo agente</div>
      <div class="alert alert-info mb-3">Se genera un link único válido por 7 días. El agente crea su contraseña y queda asignado a tu equipo.</div>
      <form id="invite-form" onsubmit="handleInvite(event)">
        <div class="form-group"><label>Email del agente</label><input name="email" type="email" placeholder="agente@remax.com.ar" required autofocus></div>
        <div class="form-group"><label>Nombre (referencia interna)</label><input name="name" placeholder="Ej: Carlos Ruiz"></div>
        <div class="form-group"><label>Oficina</label><input name="office" placeholder="${profile.office||''}" value="${profile.office||''}"></div>
        <div class="form-group">
          <label>Situación inicial</label>
          <select name="situation" onchange="updateHabsPreview(this.value)">
            <option value="nuevo">🟡 Nuevo — sin historial</option>
            <option value="en-crecimiento">🟠 En crecimiento</option>
            <option value="estable" selected>🟢 Estable</option>
            <option value="avanzado">🔵 Avanzado</option>
          </select>
        </div>
        <div id="habs-preview" class="card mb-3" style="padding:12px"></div>
        <button class="btn btn-primary btn-block" type="submit" id="btn-invite">Generar link de invitación</button>
      </form>
      <div id="invite-result" class="mt-3"></div>
    </div>`);
  updateHabsPreview('estable');
}

window.updateHabsPreview = (sit) => {
  const habs = HABS_BY_SITUATION[sit] || DEFAULT_HABS;
  document.getElementById('habs-preview').innerHTML = `
    <div class="card-title" style="margin-bottom:8px">Módulos que se habilitarán</div>
    ${HABILIDADES.map(h => `
      <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <span class="fs-sm">${h.icon} ${h.name}</span>
        <span class="badge ${habs[h.id]?'badge-green':'badge-red'}">${habs[h.id]?'✓ Habilitado':'✗ Bloqueado'}</span>
      </div>`).join('')}`;
};

window.handleInvite = async (e) => {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const sit  = fd.get('situation');
  const btn  = document.getElementById('btn-invite');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Generando...';

  try {
    const token = await createInvite({
      brokerId: profile.uid, brokerName: profile.name,
      agentEmail: fd.get('email'), habs: HABS_BY_SITUATION[sit],
      situation: sit,
    });
    const link = `${window.location.origin}/register.html?token=${token}`;
    document.getElementById('invite-result').innerHTML = `
      <div class="alert alert-success">
        ✅ <div style="flex:1">
          <strong>Invitación generada para ${fd.get('email')}</strong>
          <div style="background:var(--surface2);border-radius:8px;padding:10px;margin-top:8px;word-break:break-all;font-size:.73rem;font-family:monospace">${link}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${link}').then(()=>this.textContent='✓ Copiado!')">📋 Copiar</button>
            <a href="https://wa.me/?text=${encodeURIComponent('Te invito a FinanceOS: '+link)}" target="_blank" class="btn btn-ghost btn-sm">💬 WhatsApp</a>
          </div>
        </div>
      </div>`;
    btn.textContent = 'Generar otra invitación'; btn.disabled = false;
    await refreshAgents();
  } catch(err) {
    document.getElementById('invite-result').innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    btn.textContent = 'Generar link'; btn.disabled = false;
  }
};

// ═══════════════════════════════════════════════
// HABILIDADES
// ═══════════════════════════════════════════════
async function habilidades() {
  if (!agents.length) {
    setContent(`<div class="empty-state"><div class="es-icon">⚡</div>Sin agentes para gestionar.</div>`);
    return;
  }
  const firstId = agents[0].id;
  setContent(`
    <div class="card" style="max-width:560px;margin:0 auto">
      <div class="form-group mb-3">
        <label>Seleccioná un agente</label>
        <select id="hab-agent-sel" onchange="renderHabsForAgent(this.value)">
          ${agents.map(a => `<option value="${a.id}">${a.name} — ${scoreLabel(agentScores[a.id]||0)}</option>`).join('')}
        </select>
      </div>
      <div id="habs-editor"></div>
    </div>`);
  await renderHabsForAgent(firstId);
}

window.openHabsEditor = async (id) => {
  // Desde cualquier página, abrir panel de habilidades para este agente
  navigate('habilidades');
  setTimeout(async () => {
    const sel = document.getElementById('hab-agent-sel');
    if (sel) sel.value = id;
    await renderHabsForAgent(id);
  }, 100);
};

window.renderHabsForAgent = async (agentId) => {
  const ag    = agents.find(a => a.id === agentId);
  if (!ag) return;
  const habs  = await getHabilidades(agentId);
  const score = agentScores[agentId] || 0;

  document.getElementById('habs-editor').innerHTML = `
    <div style="background:${scoreColor(score)}18;border:1px solid ${scoreColor(score)}40;border-radius:var(--r-sm);padding:12px;margin-bottom:16px">
      <div class="flex items-center gap-3">
        <div style="font-size:1.8rem;font-weight:900;color:${scoreColor(score)}">${score}</div>
        <div>
          <div class="fw-bold">${scoreLabel(score)}</div>
          <div class="fs-xs text-2">Score de salud financiera · ${ag.office||''}</div>
          <div class="fs-xs text-3 mt-1">Basado en: tasa de ahorro · fondo de emergencia · cumplimiento presupuesto · actividad</div>
        </div>
      </div>
    </div>
    <div class="card-title mb-2">Módulos habilitados para ${ag.name}</div>
    ${HABILIDADES.map(h => {
      const enabled = habs[h.id] || false;
      const belowMin = score < h.minScore && h.minScore > 0;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;padding-right:12px">
          <div class="fs-sm fw-bold">${h.icon} ${h.name}</div>
          <div class="fs-xs text-2">${h.desc}</div>
          ${belowMin ? `<div class="fs-xs" style="color:var(--warning);margin-top:2px">⚠️ Score recomendado: ${h.minScore} (actual: ${score})</div>` : ''}
          ${h.minScore > 0 ? `<div class="fs-xs text-3 mt-1">Mín recomendado: ${h.minScore} pts</div>` : ''}
        </div>
        <label class="toggle">
          <input type="checkbox" ${enabled?'checked':''} onchange="toggleHab('${agentId}','${h.id}',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>`;
    }).join('')}
    <div class="flex gap-2 mt-3">
      <button class="btn btn-success btn-sm" onclick="enableAllHabs('${agentId}')">✅ Habilitar todo</button>
      <button class="btn btn-ghost btn-sm" onclick="autoAssignHabs('${agentId}',${score})">🤖 Auto-asignar por score</button>
    </div>`;
};

window.toggleHab = async (agentId, habId, value) => {
  const habs = await getHabilidades(agentId);
  habs[habId] = value;
  await saveHabilidades(agentId, habs);
};

window.enableAllHabs = async (agentId) => {
  const habs = {};
  HABILIDADES.forEach(h => habs[h.id] = true);
  await saveHabilidades(agentId, habs);
  await renderHabsForAgent(agentId);
};

window.autoAssignHabs = async (agentId, score) => {
  const habs = {};
  HABILIDADES.forEach(h => habs[h.id] = score >= h.minScore);
  await saveHabilidades(agentId, habs);
  await renderHabsForAgent(agentId);
};

// ═══════════════════════════════════════════════
// REPORTES DEL EQUIPO
// ═══════════════════════════════════════════════
async function reportes() {
  if (!agents.length) {
    setContent(`<div class="empty-state"><div class="es-icon">📊</div>Sin agentes para reportar.</div>`);
    return;
  }

  setContent(`
    <div style="text-align:center;padding:24px;color:var(--text2)">
      <div class="spinner" style="width:32px;height:32px;margin:0 auto 12px"></div>
      Cargando datos del equipo...
    </div>`);

  // Cargar datos de todos los agentes en paralelo
  const ym = monthKey();
  const agentData = await Promise.all(agents.map(async ag => {
    ViewingAgent.set(ag.id);
    try {
      const [txs, accounts] = await Promise.all([
        getMonthTransactions(ym).catch(() => []),
        getAccounts().catch(() => []),
      ]);
      const totals  = calcPeriodTotals(txs, DEFAULT_CATS);
      const balance = accounts.reduce((s, a) => s + calcAccountBalance(a, txs), 0);
      return { ...ag, totals, balance, txCount: txs.length };
    } catch { return { ...ag, totals:{ingresos:0,egresos:0,ahorros:0,neto:0}, balance:0, txCount:0 }; }
    finally { ViewingAgent.clear(); }
  }));

  const totalIngresos  = agentData.reduce((s,a) => s+a.totals.ingresos, 0);
  const totalEgresos   = agentData.reduce((s,a) => s+a.totals.egresos, 0);
  const totalAhorros   = agentData.reduce((s,a) => s+a.totals.ahorros, 0);
  const totalPatrimonio = agentData.reduce((s,a) => s+a.balance, 0);
  const avgScore       = agents.length ? Math.round(Object.values(agentScores).reduce((s,v)=>s+v,0)/agents.length) : 0;
  const totalTxs       = agentData.reduce((s,a) => s+a.txCount, 0);

  setContent(`
    <div class="grid-3 mb-3">
      <div class="kpi green"><div class="kpi-label">Ingresos totales del equipo</div><div class="kpi-value">${fmtShort(totalIngresos)}</div><div class="kpi-sub">Este mes</div></div>
      <div class="kpi red"><div class="kpi-label">Gastos totales del equipo</div><div class="kpi-value">${fmtShort(totalEgresos)}</div><div class="kpi-sub">Este mes</div></div>
      <div class="kpi blue"><div class="kpi-label">Ahorro total del equipo</div><div class="kpi-value">${fmtShort(totalAhorros)}</div><div class="kpi-sub">Este mes</div></div>
      <div class="kpi purple"><div class="kpi-label">Patrimonio total</div><div class="kpi-value">${fmtShort(totalPatrimonio)}</div><div class="kpi-sub">Todos los agentes</div></div>
      <div class="kpi amber"><div class="kpi-label">Score promedio equipo</div><div class="kpi-value" style="color:${scoreColor(avgScore)}">${avgScore}</div><div class="kpi-sub">${scoreLabel(avgScore)}</div></div>
      <div class="kpi"><div class="kpi-label">Movimientos este mes</div><div class="kpi-value">${totalTxs}</div><div class="kpi-sub">Registros del equipo</div></div>
    </div>

    <div class="grid-2 mb-3">
      <div class="card">
        <div class="card-title">Scores del equipo</div>
        <div class="chart-wrap h220"><canvas id="chart-scores"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Ingresos por agente — ${new Date().toLocaleDateString('es-AR',{month:'long'})}</div>
        <div class="chart-wrap h220"><canvas id="chart-ingresos"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Detalle por agente</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Agente</th><th>Score</th><th>Ingresos</th><th>Gastos</th>
            <th>Ahorro</th><th>Neto</th><th>Movimientos</th>
          </tr></thead>
          <tbody>
            ${agentData.sort((a,b)=>(agentScores[b.id]||0)-(agentScores[a.id]||0)).map(ag => {
              const s = agentScores[ag.id] || 0;
              return `<tr style="cursor:pointer" onclick="viewAgentDetail('${ag.id}')">
                <td><strong>${ag.name}</strong><br><span class="fs-xs text-2">${ag.office||''}</span></td>
                <td><span style="font-weight:800;color:${scoreColor(s)}">${s}</span></td>
                <td class="text-success">${fmtShort(ag.totals.ingresos)}</td>
                <td class="text-danger">${fmtShort(ag.totals.egresos)}</td>
                <td class="text-info">${fmtShort(ag.totals.ahorros)}</td>
                <td style="color:${ag.totals.neto>=0?'var(--success)':'var(--danger)'}">${ag.totals.neto>=0?'+':''}${fmtShort(ag.totals.neto)}</td>
                <td>${ag.txCount}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  setTimeout(() => {
    renderScoresChart(agentData);
    renderIngresosChart(agentData);
  }, 50);
}

function renderScoresChart(agentData) {
  const ctx = document.getElementById('chart-scores'); if (!ctx) return;
  const sorted = [...agentData].sort((a,b)=>(agentScores[b.id]||0)-(agentScores[a.id]||0));
  activeCharts.scores = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(a => a.name.split(' ')[0]),
      datasets: [{
        data: sorted.map(a => agentScores[a.id]||0),
        backgroundColor: sorted.map(a => scoreColor(agentScores[a.id]||0)+'99'),
        borderColor: sorted.map(a => scoreColor(agentScores[a.id]||0)),
        borderWidth: 2, borderRadius: 6, borderSkipped: false
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{
        x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},
        y:{min:0,max:100,ticks:{color:'#64748b',font:{size:10}},grid:{color:'#33415566'}}
      }
    }
  });
}

function renderIngresosChart(agentData) {
  const ctx = document.getElementById('chart-ingresos'); if (!ctx) return;
  const sorted = [...agentData].sort((a,b)=>b.totals.ingresos-a.totals.ingresos);
  activeCharts.ingresos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sorted.map(a => a.name.split(' ')[0]),
      datasets: [{
        data: sorted.map(a => a.totals.ingresos),
        backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444','#38bdf8','#8b5cf6'],
        borderWidth: 0
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'55%',
      plugins:{
        legend:{position:'right',labels:{color:'#94a3b8',font:{size:10},padding:8}},
        tooltip:{callbacks:{label:c=>`${c.label}: ${fmtShort(c.raw)}`}}
      }
    }
  });
}

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════
async function configuracion() {
  setContent(`
    <div class="card mb-3" style="max-width:480px;margin:0 auto">
      <div class="card-title">Perfil del Broker</div>
      <form onsubmit="submitBrokerConfig(event)">
        <div class="form-group"><label>Nombre</label><input id="cfg-name" value="${profile.name||''}" required></div>
        <div class="form-group"><label>Email</label><input value="${profile.email||''}" disabled style="opacity:.6"></div>
        <div class="form-group"><label>Oficina / Sucursal</label><input id="cfg-office" value="${profile.office||''}"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit">Guardar cambios</button>
      </form>
    </div>
    <div class="card" style="max-width:480px;margin:12px auto 0">
      <div class="card-title">Acceso</div>
      <button class="btn btn-danger btn-block" onclick="handleLogout()">🚪 Cerrar sesión</button>
    </div>`);
}

window.submitBrokerConfig = async (e) => {
  e.preventDefault();
  const name   = document.getElementById('cfg-name').value.trim();
  const office = document.getElementById('cfg-office').value.trim();
  await saveAgentProfile(profile.uid, { ...profile, name, office });
  profile.name = name; profile.office = office;
  document.getElementById('broker-office-label').textContent = office || 'Broker';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = name[0].toUpperCase();
  alert('✅ Perfil actualizado');
};

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function setContent(html) { document.getElementById('content').innerHTML = html; }

function showGenericModal(title, body) {
  document.getElementById('modal-generic-title').textContent = title;
  document.getElementById('modal-generic-body').innerHTML = body;
  openModal('modal-generic');
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

window.openModal    = openModal;
window.closeModal   = closeModal;
window.navigate     = navigate;
window.agentCard    = agentCard;
window.viewAgentDetail = window.viewAgentDetail || (() => {});

window.toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
};
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
};
window.openUserMenu = () => navigate('configuracion');
window.handleLogout = async () => { await logout(); };

// ── KICK OFF ─────────────────────────────────────────
init().catch(err => {
  console.error('Broker init error:', err);
  document.getElementById('loading-screen').innerHTML = `
    <div style="text-align:center;padding:24px;color:#f1f5f9">
      <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
      <div style="font-weight:700;margin-bottom:8px">Error al cargar</div>
      <div style="font-size:.82rem;color:#94a3b8;margin-bottom:16px">${err.message}</div>
      <button onclick="location.reload()" style="padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">Reintentar</button>
    </div>`;
});
