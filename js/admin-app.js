// ═══════════════════════════════════════════════
// ADMIN-APP.JS — Panel de Administrador
// ═══════════════════════════════════════════════
import { requireRole, logout }               from './auth.js';
import { getAllUsers, getUserProfile,
         updateUserProfile, deleteUserAndData,
         getHabilidades, saveHabilidades,
         calcHealthScore, createInvite,
         ViewingUser, getMonthTransactions,
         getAccounts, getGoals,
         calcPeriodTotals, calcAccountBalance,
         promoteToAdmin }                    from './db.js';
import { HABILIDADES, DEFAULT_HABS,
         DEFAULT_CATS, scoreColor,
         scoreLabel, scoreClass,
         fmt, fmtShort, monthKey, today }   from './constants.js';

let profile      = null;
let users        = [];
let userScores   = {};
let currentPage  = 'dashboard';
let activeCharts = {};

// ── INIT ─────────────────────────────────────────
async function init() {
  profile = await requireRole('admin');
  if (!profile) return;

  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('layout').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');

  document.getElementById('admin-name-label').textContent = profile.name || 'Administrador';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = (profile.name || 'A')[0].toUpperCase();

  document.querySelectorAll('[data-page]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.page))
  );

  await refreshUsers();
  navigate('dashboard');
}

async function refreshUsers() {
  users = await getAllUsers();
  const scores = await Promise.all(users.map(u => calcHealthScore(u.id).catch(() => 0)));
  users.forEach((u, i) => { userScores[u.id] = scores[i]; });
}

// ── ROUTING ──────────────────────────────────────
function navigate(page) {
  destroyCharts();
  currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  const titles = {
    dashboard: 'Dashboard', usuarios: 'Usuarios', invitar: 'Invitar Usuario',
    habilidades: 'Habilidades', reportes: 'Reportes', configuracion: 'Configuración'
  };
  document.getElementById('topbar-title').textContent = titles[page] || '';
  document.getElementById('topbar-action').innerHTML = '';
  const pages = { dashboard, usuarios, invitar, habilidades, reportes, configuracion };
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
  const healthy = users.filter(u => (userScores[u.id] || 0) >= 70).length;
  const warn    = users.filter(u => { const s = userScores[u.id] || 0; return s >= 40 && s < 70; }).length;
  const crit    = users.filter(u => (userScores[u.id] || 0) < 40).length;
  const top3    = [...users].sort((a,b) => (userScores[b.id]||0) - (userScores[a.id]||0)).slice(0, 3);

  setContent(`
    <div class="grid-4 mb-3">
      <div class="kpi blue"><div class="kpi-label">Total usuarios</div><div class="kpi-value">${users.length}</div><div class="kpi-icon">👥</div></div>
      <div class="kpi green"><div class="kpi-label">Saludables</div><div class="kpi-value">${healthy}</div><div class="kpi-icon">💚</div></div>
      <div class="kpi amber"><div class="kpi-label">Atención</div><div class="kpi-value">${warn}</div><div class="kpi-icon">⚠️</div></div>
      <div class="kpi red"><div class="kpi-label">Críticos</div><div class="kpi-value">${crit}</div><div class="kpi-icon">🔴</div></div>
    </div>
    ${!users.length ? `
      <div class="empty-state">
        <div class="es-icon">👥</div>
        <div class="fw-bold mb-2">Sin usuarios registrados</div>
        <div class="fs-sm text-2 mb-3">Los usuarios se registran solos desde la pantalla de inicio.<br>Como administrador, podés gestionar sus habilidades aquí.</div>
      </div>` : `
    <div class="grid-2 mb-3">
      <div class="card">
        <div class="card-title">Salud del equipo</div>
        <div class="chart-wrap h220"><canvas id="chart-health"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Top usuarios</div>
        ${top3.map((u,i) => {
          const s = userScores[u.id] || 0;
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:1.2rem;width:24px;text-align:center;color:${['#ffd700','#c0c0c0','#cd7f32'][i]}">
              ${['🥇','🥈','🥉'][i]}
            </div>
            <div style="flex:1;min-width:0">
              <div class="fw-bold fs-sm">${u.name || u.email}</div>
              <div class="progress-bar mt-1"><div class="progress-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
            </div>
            <div style="font-weight:900;color:${scoreColor(s)};font-size:1rem">${s}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Usuarios recientes</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('usuarios')">Ver todos →</button>
      </div>
      ${users.slice(0,5).map(u => userRow(u)).join('')}
    </div>`}
  `);

  if (users.length) setTimeout(() => {
    const ctx = document.getElementById('chart-health');
    if (!ctx) return;
    activeCharts.health = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['Saludables','Atención','Críticos'],
        datasets: [{ data:[healthy,warn,crit], backgroundColor:['#10b981','#f59e0b','#ef4444'], borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'65%',
        plugins: { legend: { position:'bottom', labels:{ color:'#94a3b8', font:{size:11}, padding:12 } } } }
    });
  }, 50);
}

function userRow(u) {
  const s = userScores[u.id] || 0;
  return `<div class="flex items-center gap-3" style="padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="viewUserDetail('${u.id}')">
    <div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:900;background:${scoreColor(s)}22;color:${scoreColor(s)};flex-shrink:0">${s}</div>
    <div style="flex:1;min-width:0">
      <div class="fw-bold fs-sm">${u.name || '—'}</div>
      <div class="fs-xs text-2">${u.email || ''}</div>
    </div>
    <span class="badge ${s>=70?'badge-green':s>=40?'badge-amber':'badge-red'}">${scoreLabel(s).split(' ')[0]}</span>
  </div>`;
}

// ═══════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════
async function usuarios() {
  document.getElementById('topbar-action').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="navigate('invitar')">+ Invitar</button>`;

  setContent(`
    <div class="card">
      <div class="card-header">
        <span class="card-title">Usuarios (${users.length})</span>
        <input id="search-users" placeholder="Buscar..." oninput="filterUsers(this.value)"
          style="width:130px;padding:6px 10px;font-size:.8rem;min-height:32px">
      </div>
      <div id="users-list">
        ${!users.length
          ? `<div class="empty-state"><div class="es-icon">👥</div>Sin usuarios aún.</div>`
          : users.map(u => userCard(u)).join('')}
      </div>
    </div>
  `);
}

window.filterUsers = (q) => {
  const f = q.toLowerCase();
  const filtered = users.filter(u =>
    (u.name||'').toLowerCase().includes(f) || (u.email||'').toLowerCase().includes(f)
  );
  document.getElementById('users-list').innerHTML =
    filtered.length ? filtered.map(u => userCard(u)).join('') : '<div class="empty-state fs-sm">Sin resultados</div>';
};

function userCard(u) {
  const s = userScores[u.id] || 0;
  const habs = Object.values(u.habs || DEFAULT_HABS).filter(Boolean).length;
  return `
  <div class="user-card ${scoreClass(s)}" style="border-left-color:${scoreColor(s)}" onclick="viewUserDetail('${u.id}')">
    <div class="flex items-center gap-3 mb-2">
      <div class="health-score" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:900;background:${scoreColor(s)}22;color:${scoreColor(s)};flex-shrink:0">${s}</div>
      <div style="flex:1;min-width:0">
        <div class="fw-bold">${u.name || '—'}</div>
        <div class="fs-xs text-2">${u.email || ''}</div>
      </div>
      <div class="flex gap-2" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="openHabsEditor('${u.id}')" title="Habilidades">⚡</button>
        <button class="btn btn-ghost btn-sm" onclick="openEditUser('${u.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="confirmDeleteUser('${u.id}','${(u.name||u.email||'').replace(/'/g,'')}')" title="Eliminar">🗑</button>
      </div>
    </div>
    <div class="progress-bar mb-2"><div class="progress-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
    <div class="flex gap-3 fs-xs text-2">
      <span>${scoreLabel(s)}</span>
      <span>⚡ ${habs}/${HABILIDADES.length} módulos</span>
    </div>
  </div>`;
}

window.viewUserDetail = async (id) => {
  const u = users.find(x => x.id === id);
  if (!u) return;
  const s = userScores[id] || 0;
  ViewingUser.set(id);
  const [txs, accounts, goals, habs] = await Promise.all([
    getMonthTransactions(monthKey()).catch(() => []),
    getAccounts().catch(() => []),
    getGoals().catch(() => []),
    getHabilidades(id),
  ]);
  ViewingUser.clear();
  const totals  = calcPeriodTotals(txs, DEFAULT_CATS);
  const balance = accounts.reduce((sum, a) => sum + calcAccountBalance(a, txs), 0);
  const emGoal  = goals.find(g => g.type === 'emergency_fund');
  const emPct   = emGoal ? Math.min(100, emGoal.currentAmount / emGoal.targetAmount * 100) : 0;

  showGenericModal(`👤 ${u.name || u.email}`, `
    <div style="background:${scoreColor(s)}18;border:1px solid ${scoreColor(s)}40;border-radius:var(--r-sm);padding:14px;margin-bottom:16px">
      <div class="flex items-center gap-3">
        <div style="font-size:2.2rem;font-weight:900;color:${scoreColor(s)}">${s}</div>
        <div><div class="fw-bold">${scoreLabel(s)}</div><div class="fs-xs text-2">${u.email||''}</div></div>
      </div>
      <div class="progress-bar mt-2" style="height:5px"><div class="progress-fill" style="width:${s}%;background:${scoreColor(s)}"></div></div>
    </div>
    <div class="grid-2 mb-3" style="gap:8px">
      <div class="kpi green" style="padding:12px"><div class="kpi-label">Ingresos mes</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(totals.ingresos)}</div></div>
      <div class="kpi red" style="padding:12px"><div class="kpi-label">Gastos mes</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(totals.egresos)}</div></div>
      <div class="kpi blue" style="padding:12px"><div class="kpi-label">Patrimonio</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(balance)}</div></div>
      <div class="kpi ${totals.neto>=0?'purple':'amber'}" style="padding:12px"><div class="kpi-label">Neto mes</div><div class="kpi-value" style="font-size:1.1rem">${totals.neto>=0?'+':''}${fmtShort(totals.neto)}</div></div>
    </div>
    ${emGoal ? `<div class="card mb-3" style="padding:12px">
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-generic');openEditUser('${id}')">✏️ Editar</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal('modal-generic');confirmDeleteUser('${id}','${(u.name||'').replace(/'/g,'')}')">🗑</button>
    </div>
  `);
};

window.openEditUser = (id) => {
  const u = users.find(x => x.id === id); if (!u) return;
  showGenericModal('✏️ Editar Usuario', `
    <form onsubmit="submitEditUser(event,'${id}')">
      <div class="form-group"><label>Nombre</label><input name="name" value="${u.name||''}" required></div>
      <div class="form-group"><label>Email</label><input value="${u.email||''}" disabled style="opacity:.6"></div>
      <div class="form-group"><label>Estado</label>
        <select name="status">
          <option value="activo" ${u.status==='activo'?'selected':''}>✅ Activo</option>
          <option value="inactivo" ${u.status==='inactivo'?'selected':''}>⏸️ Inactivo</option>
        </select>
      </div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};

window.submitEditUser = async (e, id) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const u  = users.find(x => x.id === id);
  const updated = { ...u, name: fd.get('name'), status: fd.get('status') };
  await updateUserProfile(id, updated);
  const idx = users.findIndex(x => x.id === id);
  if (idx >= 0) users[idx] = updated;
  closeModal('modal-generic');
  navigate('usuarios');
};

window.confirmDeleteUser = async (id, name) => {
  if (!confirm(`¿Eliminar a ${name} y TODOS sus datos?`)) return;
  await deleteUserAndData(id);
  users = users.filter(u => u.id !== id);
  delete userScores[id];
  closeModal('modal-generic');
  navigate('usuarios');
};

// ═══════════════════════════════════════════════
// INVITAR
// ═══════════════════════════════════════════════
async function invitar() {
  setContent(`
    <div class="card" style="max-width:500px;margin:0 auto">
      <div class="card-title">Compartir link de registro</div>
      <div class="alert alert-info mb-3">
        Cualquier persona con este link puede registrarse y acceder como usuario. El primer usuario que se registre desde cero será Admin automáticamente.
      </div>
      <div style="background:var(--surface2);border-radius:var(--r-sm);padding:14px;word-break:break-all;font-size:.78rem;font-family:monospace;margin-bottom:12px" id="reg-link">${window.location.origin}${getBase()}</div>
      <div class="flex gap-2">
        <button class="btn btn-primary" onclick="copyRegLink()">📋 Copiar link</button>
        <a href="https://wa.me/?text=${encodeURIComponent('Unite a FinanceOS: ' + window.location.origin + getBase())}" target="_blank" class="btn btn-ghost">💬 WhatsApp</a>
      </div>
      <hr>
      <div class="card-title mb-3">Gestionar habilidades a usuarios existentes</div>
      ${users.length ? users.map(u => `
        <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border)">
          <span class="fs-sm">${u.name || u.email}</span>
          <button class="btn btn-ghost btn-sm" onclick="openHabsEditor('${u.id}')">⚡ Habilidades</button>
        </div>`).join('') : '<div class="text-2 fs-sm">Sin usuarios aún.</div>'}
    </div>
  `);
}

function getBase() {
  const p = window.location.pathname;
  return p.replace(/\/admin(\/.*)?$/, '/');
}

window.copyRegLink = () => {
  navigator.clipboard.writeText(window.location.origin + getBase())
    .then(() => { const el=document.querySelector('[onclick="copyRegLink()"]'); if(el){el.textContent='✓ Copiado!';setTimeout(()=>el.textContent='📋 Copiar link',2000);} });
};

// ═══════════════════════════════════════════════
// HABILIDADES
// ═══════════════════════════════════════════════
async function habilidades() {
  if (!users.length) {
    setContent(`<div class="empty-state"><div class="es-icon">⚡</div>Sin usuarios para gestionar.</div>`);
    return;
  }
  const firstId = users[0].id;
  setContent(`
    <div class="card" style="max-width:560px;margin:0 auto">
      <div class="form-group mb-3">
        <label>Seleccioná un usuario</label>
        <select id="hab-user-sel" onchange="renderHabsFor(this.value)">
          ${users.map(u => `<option value="${u.id}">${u.name || u.email} — ${scoreLabel(userScores[u.id]||0)}</option>`).join('')}
        </select>
      </div>
      <div id="habs-editor"></div>
    </div>`);
  await renderHabsFor(firstId);
}

window.openHabsEditor = async (id) => {
  navigate('habilidades');
  setTimeout(async () => {
    const sel = document.getElementById('hab-user-sel');
    if (sel) sel.value = id;
    await renderHabsFor(id);
  }, 100);
};

window.renderHabsFor = async (userId) => {
  const u = users.find(x => x.id === userId); if (!u) return;
  const habs  = await getHabilidades(userId);
  const score = userScores[userId] || 0;

  document.getElementById('habs-editor').innerHTML = `
    <div style="background:${scoreColor(score)}18;border:1px solid ${scoreColor(score)}40;border-radius:var(--r-sm);padding:12px;margin-bottom:16px">
      <div class="flex items-center gap-3">
        <div style="font-size:1.8rem;font-weight:900;color:${scoreColor(score)}">${score}</div>
        <div>
          <div class="fw-bold">${scoreLabel(score)}</div>
          <div class="fs-xs text-2">Score de salud financiera</div>
          <div class="fs-xs text-3 mt-1">Basado en: ahorro · fondo emergencia · presupuesto · actividad</div>
        </div>
      </div>
    </div>
    <div class="card-title mb-2">Módulos habilitados para ${u.name || u.email}</div>
    ${HABILIDADES.map(h => {
      const enabled  = habs[h.id] || false;
      const belowMin = score < h.minScore && h.minScore > 0;
      return `<div class="hab-toggle">
        <div style="flex:1;padding-right:12px">
          <div class="fs-sm fw-bold">${h.icon} ${h.name}</div>
          <div class="fs-xs text-2">${h.desc}</div>
          ${belowMin ? `<div class="fs-xs" style="color:var(--warning);margin-top:2px">⚠️ Score recomendado: ${h.minScore} (actual: ${score})</div>` : ''}
        </div>
        <label class="toggle">
          <input type="checkbox" ${enabled?'checked':''} onchange="toggleHab('${userId}','${h.id}',this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>`;
    }).join('')}
    <div class="flex gap-2 mt-3">
      <button class="btn btn-success btn-sm" onclick="enableAll('${userId}')">✅ Todo</button>
      <button class="btn btn-ghost btn-sm" onclick="autoAssign('${userId}',${score})">🤖 Auto</button>
      <button class="btn btn-ghost btn-sm" onclick="promoteUser('${userId}')">👑 Hacer admin</button>
    </div>`;
};

window.toggleHab = async (uid, habId, val) => {
  const habs = await getHabilidades(uid);
  habs[habId] = val;
  await saveHabilidades(uid, habs);
};
window.enableAll = async (uid) => {
  const habs = {}; HABILIDADES.forEach(h => habs[h.id] = true);
  await saveHabilidades(uid, habs); await renderHabsFor(uid);
};
window.autoAssign = async (uid, score) => {
  const habs = {}; HABILIDADES.forEach(h => habs[h.id] = score >= h.minScore);
  await saveHabilidades(uid, habs); await renderHabsFor(uid);
};
window.promoteUser = async (uid) => {
  const u = users.find(x => x.id === uid);
  if (!confirm(`¿Promover a ${u?.name || u?.email} como administrador?`)) return;
  await promoteToAdmin(uid);
  alert('✅ Usuario promovido a administrador.');
};

// ═══════════════════════════════════════════════
// REPORTES
// ═══════════════════════════════════════════════
async function reportes() {
  if (!users.length) {
    setContent(`<div class="empty-state"><div class="es-icon">📊</div>Sin usuarios para reportar.</div>`);
    return;
  }
  setContent(`<div style="text-align:center;padding:40px;color:var(--text2)"><div class="spinner" style="width:32px;height:32px;margin:0 auto 12px"></div>Cargando datos...</div>`);

  const ym = monthKey();
  const userData = await Promise.all(users.map(async u => {
    ViewingUser.set(u.id);
    try {
      const [txs, accounts] = await Promise.all([
        getMonthTransactions(ym).catch(() => []),
        getAccounts().catch(() => []),
      ]);
      const totals  = calcPeriodTotals(txs, DEFAULT_CATS);
      const balance = accounts.reduce((s, a) => s + calcAccountBalance(a, txs), 0);
      return { ...u, totals, balance, txCount: txs.length };
    } catch { return { ...u, totals:{ingresos:0,egresos:0,ahorros:0,neto:0}, balance:0, txCount:0 }; }
    finally { ViewingUser.clear(); }
  }));

  const totIng  = userData.reduce((s,u)=>s+u.totals.ingresos,0);
  const totEg   = userData.reduce((s,u)=>s+u.totals.egresos,0);
  const totSav  = userData.reduce((s,u)=>s+u.totals.ahorros,0);
  const totBal  = userData.reduce((s,u)=>s+u.balance,0);
  const avgScore= users.length ? Math.round(Object.values(userScores).reduce((s,v)=>s+v,0)/users.length) : 0;
  const totTx   = userData.reduce((s,u)=>s+u.txCount,0);

  setContent(`
    <div class="grid-3 mb-3">
      <div class="kpi green"><div class="kpi-label">Ingresos totales</div><div class="kpi-value">${fmtShort(totIng)}</div><div class="kpi-sub">Este mes</div></div>
      <div class="kpi red"><div class="kpi-label">Gastos totales</div><div class="kpi-value">${fmtShort(totEg)}</div><div class="kpi-sub">Este mes</div></div>
      <div class="kpi blue"><div class="kpi-label">Ahorro total</div><div class="kpi-value">${fmtShort(totSav)}</div><div class="kpi-sub">Este mes</div></div>
      <div class="kpi purple"><div class="kpi-label">Patrimonio total</div><div class="kpi-value">${fmtShort(totBal)}</div><div class="kpi-sub">Todos los usuarios</div></div>
      <div class="kpi amber"><div class="kpi-label">Score promedio</div><div class="kpi-value" style="color:${scoreColor(avgScore)}">${avgScore}</div><div class="kpi-sub">${scoreLabel(avgScore)}</div></div>
      <div class="kpi"><div class="kpi-label">Movimientos</div><div class="kpi-value">${totTx}</div><div class="kpi-sub">Este mes</div></div>
    </div>
    <div class="grid-2 mb-3">
      <div class="card"><div class="card-title">Scores del equipo</div><div class="chart-wrap h220"><canvas id="chart-scores"></canvas></div></div>
      <div class="card"><div class="card-title">Ingresos por usuario</div><div class="chart-wrap h220"><canvas id="chart-ing"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-title">Detalle por usuario</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Usuario</th><th>Score</th><th>Ingresos</th><th>Gastos</th><th>Neto</th><th>Movs.</th></tr></thead>
          <tbody>
            ${userData.sort((a,b)=>(userScores[b.id]||0)-(userScores[a.id]||0)).map(u => {
              const s = userScores[u.id]||0;
              return `<tr style="cursor:pointer" onclick="viewUserDetail('${u.id}')">
                <td><strong>${u.name||'—'}</strong><br><span class="fs-xs text-2">${u.email||''}</span></td>
                <td><span style="font-weight:900;color:${scoreColor(s)}">${s}</span></td>
                <td class="text-success">${fmtShort(u.totals.ingresos)}</td>
                <td class="text-danger">${fmtShort(u.totals.egresos)}</td>
                <td style="color:${u.totals.neto>=0?'var(--success)':'var(--danger)'}">${u.totals.neto>=0?'+':''}${fmtShort(u.totals.neto)}</td>
                <td>${u.txCount}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  setTimeout(() => {
    const sorted = [...userData].sort((a,b)=>(userScores[b.id]||0)-(userScores[a.id]||0));
    const ctx1 = document.getElementById('chart-scores');
    if (ctx1) activeCharts.scores = new Chart(ctx1, {
      type:'bar', data:{ labels:sorted.map(u=>(u.name||u.email||'').split(' ')[0]),
        datasets:[{data:sorted.map(u=>userScores[u.id]||0),
          backgroundColor:sorted.map(u=>scoreColor(userScores[u.id]||0)+'99'),
          borderColor:sorted.map(u=>scoreColor(userScores[u.id]||0)),
          borderWidth:2,borderRadius:6,borderSkipped:false}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},
          y:{min:0,max:100,ticks:{color:'#64748b',font:{size:10}},grid:{color:'#33415566'}}}}
    });
    const ctx2 = document.getElementById('chart-ing');
    if (ctx2) activeCharts.ing = new Chart(ctx2, {
      type:'doughnut', data:{ labels:sorted.map(u=>u.name||u.email||'?'),
        datasets:[{data:sorted.map(u=>u.totals.ingresos),
          backgroundColor:['#6366f1','#10b981','#f59e0b','#ef4444','#38bdf8','#8b5cf6'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
        plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:10},padding:8}},
          tooltip:{callbacks:{label:c=>`${c.label}: ${fmtShort(c.raw)}`}}}}
    });
  }, 50);
}

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════
async function configuracion() {
  setContent(`
    <div class="card mb-3" style="max-width:480px;margin:0 auto">
      <div class="card-title">Mi perfil de administrador</div>
      <form onsubmit="saveAdminConfig(event)">
        <div class="form-group"><label>Nombre</label><input id="cfg-name" value="${profile.name||''}" required></div>
        <div class="form-group"><label>Email</label><input value="${profile.email||''}" disabled style="opacity:.6"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
      </form>
    </div>
    <div class="card" style="max-width:480px;margin:12px auto 0">
      <button class="btn btn-danger btn-block" onclick="handleLogout()">🚪 Cerrar sesión</button>
    </div>`);
}

window.saveAdminConfig = async (e) => {
  e.preventDefault();
  const name = document.getElementById('cfg-name').value.trim();
  profile.name = name;
  document.getElementById('admin-name-label').textContent = name || 'Administrador';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = name[0]?.toUpperCase() || 'A';
  alert('✅ Perfil actualizado');
};

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function setContent(html)  { document.getElementById('content').innerHTML = html; }
function openModal(id)     { document.getElementById(id)?.classList.add('open'); }
function closeModal(id)    { document.getElementById(id)?.classList.remove('open'); }
function showGenericModal(title, body) {
  document.getElementById('modal-generic-title').textContent = title;
  document.getElementById('modal-generic-body').innerHTML    = body;
  openModal('modal-generic');
}

window.openModal   = openModal;
window.closeModal  = closeModal;
window.navigate    = navigate;

window.toggleSidebar = () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
};
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
};
window.handleLogout = async () => { await logout(); };

init().catch(err => {
  document.getElementById('loading-screen').innerHTML = `
    <div style="text-align:center;padding:24px;color:#f1f5f9">
      <div style="font-size:2rem;margin-bottom:12px">⚠️</div>
      <div style="font-weight:700;margin-bottom:8px">Error al cargar</div>
      <div style="font-size:.82rem;color:#94a3b8;margin-bottom:16px">${err.message}</div>
      <button onclick="location.reload()" style="padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">Reintentar</button>
    </div>`;
});
