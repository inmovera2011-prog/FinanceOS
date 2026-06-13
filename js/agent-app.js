// ═══════════════════════════════════════════════
// AGENT-APP.JS — Dashboard del Agente
// ═══════════════════════════════════════════════
import { auth, requireRole, logout }        from './auth.js';
import { ViewingAgent, uuid,
         getAccounts, saveAccount, deleteAccount,
         getTransactions, getMonthTransactions,
         addTransaction, updateTransaction, deleteTransaction,
         getGoals, saveGoal,
         getCards, saveCard, deleteCard,
         getSettings, saveSettings,
         getHabilidades,
         calcAccountBalance, calcPeriodTotals,
         calcCategoryTotals }               from './db.js';
import { initVoice, toggleVoice,
         dismissVoiceCard, getVoiceParsed } from './voice.js';
import { DEFAULT_CATS, HABILIDADES,
         ACCOUNT_TYPES, DEFAULT_SETTINGS,
         today, monthKey, yearKey,
         fmtDate, fmtDateFull,
         fmt, fmtShort, scoreColor, scoreLabel } from './constants.js';

// ── Estado global ────────────────────────────────────
let profile   = null;
let habs      = {};
let settings  = { ...DEFAULT_SETTINGS };
let homePeriod = 'mes';   // hoy | mes | año
let currentPage = 'inicio';
let activeCharts = {};
let txState   = { type:'egreso', psychFilter:null, cooldownHours:0 };

// Cache de datos del mes actual (evita múltiples lecturas en Firestore)
let _cache = { txs:null, accounts:null, goals:null, cards:null };
function clearCache() { _cache = { txs:null, accounts:null, goals:null, cards:null }; }

async function cachedTxs() {
  if (!_cache.txs) _cache.txs = await getMonthTransactions(monthKey());
  return _cache.txs;
}
async function cachedAccounts() {
  if (!_cache.accounts) _cache.accounts = await getAccounts();
  return _cache.accounts;
}

// ── INIT ─────────────────────────────────────────────
async function init() {
  profile = await requireRole('agent');
  if (!profile) return;

  // Cargar habilidades y settings en paralelo
  [habs, settings] = await Promise.all([
    getHabilidades(profile.uid),
    getSettings(),
  ]);

  // Mostrar UI
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('layout').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');

  // Nombre en sidebar / avatar
  document.getElementById('agent-name-label').textContent = profile.name || 'Mi cuenta';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = (profile.name || 'A')[0].toUpperCase();

  // Aplicar habilidades al sidebar
  applyHabilidades();

  // Inicializar voz
  initVoice((parsed) => {
    // Al detectar voz: pre-cargar el form de transacción
    openNewTx(parsed.type === 'ahorro' ? 'egreso' : parsed.type, parsed);
  }, DEFAULT_CATS);

  // Nav listeners
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  navigate('inicio');
}

// ── Habilidades → ocultar/mostrar ítems del sidebar ──
function applyHabilidades() {
  HABILIDADES.forEach(h => {
    document.querySelectorAll(`[data-hab="${h.id}"]`).forEach(el => {
      el.classList.toggle('hidden', !habs[h.id]);
    });
  });
}

// ── ROUTING ──────────────────────────────────────────
function navigate(page) {
  // Verificar que la habilidad está habilitada (excepto inicio/cuentas/mas)
  const freePages = ['inicio','cuentas','mas','configuracion'];
  if (!freePages.includes(page)) {
    const hab = HABILIDADES.find(h => h.page === page);
    if (hab && !habs[hab.id]) {
      showLockedPage(hab); return;
    }
  }

  destroyCharts();
  clearCache();
  currentPage = page;

  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );

  const titles = {
    inicio:'',movimientos:'Movimientos',cuentas:'Cuentas',
    presupuesto:'Presupuesto',objetivos:'Fondo de Emergencia',
    inversiones:'Inversiones',credito:'Crédito y Deuda',
    reportes:'Reportes',educacion:'Educación Financiera',
    configuracion:'Configuración',mas:'Más'
  };
  document.getElementById('topbar-title').textContent = titles[page] || '';
  document.getElementById('topbar-action').innerHTML = '';

  const pages = { inicio:renderInicio, movimientos:renderMovimientos,
    cuentas:renderCuentas, presupuesto:renderPresupuesto,
    objetivos:renderObjetivos, inversiones:renderInversiones,
    credito:renderCredito, reportes:renderReportes,
    educacion:renderEducacion, configuracion:renderConfiguracion, mas:renderMas };

  (pages[page] || renderInicio)();
  closeSidebar();
}

function showLockedPage(hab) {
  setContent(`
    <div class="empty-state" style="padding:60px 20px">
      <div class="es-icon"><i class="ph ph-lock"></i></div>
      <div class="fw-bold mb-2">${hab.icon} ${hab.name}</div>
      <div class="fs-sm text-2 mb-3">Este módulo no está habilitado para tu cuenta. Contactá a tu broker para activarlo.</div>
    </div>`);
}

function destroyCharts() {
  Object.values(activeCharts).forEach(c => { try { c.destroy(); } catch {} });
  activeCharts = {};
}

// ════════════════════════════════════════════════
// HOME
// ════════════════════════════════════════════════
async function renderInicio() {
  setContent('<div class="empty-state"><div class="spinner" style="width:32px;height:32px;margin:0 auto"></div></div>');

  const [txsAll, accounts, goals] = await Promise.all([
    getTransactions(),
    cachedAccounts(),
    getGoals(),
  ]);

  const totalBal = accounts.reduce((s, a) => s + calcAccountBalance(a, txsAll), 0);
  const now      = new Date();

  let periodTxs, periodData, periodLabel;
  if (homePeriod === 'hoy') {
    periodTxs  = txsAll.filter(t => t.date === today());
    periodData = calcPeriodTotals(periodTxs, DEFAULT_CATS);
    periodLabel = now.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  } else if (homePeriod === 'mes') {
    periodTxs  = txsAll.filter(t => t.date.startsWith(monthKey()));
    periodData = calcPeriodTotals(periodTxs, DEFAULT_CATS);
    periodLabel = now.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  } else {
    periodTxs  = txsAll.filter(t => t.date.startsWith(yearKey()));
    periodData = calcPeriodTotals(periodTxs, DEFAULT_CATS);
    periodLabel = 'Año ' + now.getFullYear();
  }

  const emGoal = goals.find(g => g.type === 'emergency_fund');
  const emPct  = emGoal ? Math.min(100,(emGoal.currentAmount/emGoal.targetAmount)*100) : 0;
  const pending = txsAll.filter(t => t.isPendingCooldown && new Date(t.cooldownUntil) > new Date());
  const netoColor = periodData.neto >= 0 ? 'var(--success)' : 'var(--danger)';

  setContent(`
    <div class="hero mb-3">
      <div class="hero-label">Patrimonio total</div>
      <div class="hero-amount">${fmt(totalBal, settings.currency)}</div>
      <div class="hero-sub">${accounts.length} cuenta(s) · ${periodLabel}</div>
      <div class="hero-row">
        <div class="hero-stat"><div class="hero-stat-val text-success">+${fmtShort(periodData.ingresos)}</div><div class="hero-stat-label">Ingresos</div></div>
        <div class="hero-stat"><div class="hero-stat-val text-danger">-${fmtShort(periodData.egresos)}</div><div class="hero-stat-label">Gastos</div></div>
        <div class="hero-stat"><div class="hero-stat-val" style="color:${netoColor}">${periodData.neto>=0?'<<i class="ph ph-plus-circle"></i>':''}${fmtShort(periodData.neto)}</div><div class="hero-stat-label">Neto</div></div>
      </div>
    </div>

    <div class="period-tabs mb-3">
      <button class="period-tab ${homePeriod==='hoy'?'active':''}" onclick="setPeriod('hoy')">Hoy</button>
      <button class="period-tab ${homePeriod==='mes'?'active':''}" onclick="setPeriod('mes')">Este mes</button>
      <button class="period-tab ${homePeriod==='año'?'active':''}" onclick="setPeriod('año')">Este año</button>
    </div>

    ${pending.length ? `
    <div class="alert alert-warning mb-3">⏰ <div><strong>${pending.length} gasto(s) en período de reflexión</strong>
      ${pending.map(t=>`
        <div class="flex justify-between items-center mt-2" style="background:#00000020;border-radius:8px;padding:8px 10px">
          <span class="fs-sm">${t.description||'Sin descripción'} — ${fmt(t.amount)}</span>
          <div class="flex gap-2">
            <button class="btn btn-success btn-sm" onclick="confirmCooldown('${t.id}')">✓</button>
            <button class="btn btn-danger btn-sm" onclick="cancelTx('${t.id}')"><i class="ph ph-x"></i></button>
          </div>
        </div>`).join('')}
    </div></div>` : ''}

    <div class="quick-actions mb-3">
      <button class="qa-btn qa-ingreso" onclick="openNewTx('ingreso')"><span style="font-size:1.2rem"><i class="ph ph-money"></i></span>+ Ingreso</button>
      <button class="qa-btn qa-egreso" onclick="openNewTx('egreso')"><span style="font-size:1.2rem"><i class="ph ph-upload-simple"></i></span>+ Gasto</button>
      <button class="qa-btn qa-traslado" onclick="openNewTx('traslado')"><i class="ph ph-arrows-clockwise"></i> Transferir entre cuentas</button>
    </div>

    ${homePeriod==='mes' && emGoal ? `
    <div class="card mb-3">
      <div class="card-header">
        <span class="card-title"><i class="ph ph-shield-check"></i> Fondo de Emergencia</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('objetivos')">→</button>
      </div>
      <div class="flex justify-between fs-sm mb-2"><span>${fmt(emGoal.currentAmount)}</span><span class="text-2">${fmt(emGoal.targetAmount)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${emPct}%;background:${emPct>=100?'var(--success)':emPct>50?'var(--warning)':'var(--danger)'}"></div></div>
      <div class="fs-xs text-2 mt-2">${emPct.toFixed(1)}% — ${emGoal.months||6} meses de gastos</div>
    </div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">Últimos movimientos</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('movimientos')">Ver todo →</button>
      </div>
      ${renderTxList(periodTxs.slice(0,12))}
    </div>
  `);
}

window.setPeriod = (p) => { homePeriod = p; renderInicio(); };

// ════════════════════════════════════════════════
// MOVIMIENTOS
// ════════════════════════════════════════════════
async function renderMovimientos() {
  document.getElementById('topbar-action').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="openNewTx()"><<i class="ph ph-plus-circle"></i> Nuevo</button>`;

  const ym   = monthKey();
  const txs  = await getMonthTransactions(ym);

  setContent(`
    <div class="card mb-3">
      <div class="flex gap-2 mb-3">
        <select id="filter-month" onchange="reloadMovimientos(this.value)" style="flex:1">${getMonthOptions(ym)}</select>
        <select id="filter-type" onchange="reloadMovimientos()" style="width:110px">
          <option value="">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Gastos</option>
          <option value="traslado">Traslados</option>
        </select>
      </div>
      ${txSummaryKPIs(txs)}
    </div>
    <div class="card" id="tx-list-wrap">${renderTxList(txs)}</div>
  `);
}

window.reloadMovimientos = async (ym) => {
  const selMonth = document.getElementById('filter-month')?.value || monthKey();
  const selType  = document.getElementById('filter-type')?.value || '';
  const txs = await getMonthTransactions(ym || selMonth);
  const filtered = selType ? txs.filter(t => t.type === selType) : txs;
  document.getElementById('tx-list-wrap').innerHTML = renderTxList(filtered);
};

function txSummaryKPIs(txs) {
  let ing = 0, eg = 0;
  txs.forEach(t => { if(t.type==='ingreso') ing+=t.amount; else if(t.type==='egreso') eg+=t.amount; });
  return `<div class="grid-2" style="gap:8px">
    <div class="kpi green" style="padding:10px"><div class="kpi-label">Ingresos</div><div class="kpi-value" style="font-size:1.1rem">${fmt(ing)}</div></div>
    <div class="kpi red" style="padding:10px"><div class="kpi-label">Gastos</div><div class="kpi-value" style="font-size:1.1rem">${fmt(eg)}</div></div>
  </div>`;
}

// ════════════════════════════════════════════════
// CUENTAS
// ════════════════════════════════════════════════
async function renderCuentas() {
  document.getElementById('topbar-action').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="openNewAccount()"><<i class="ph ph-plus-circle"></i> Cuenta</button>`;

  const [accounts, txsAll] = await Promise.all([getAccounts(), getTransactions()]);
  const total = accounts.reduce((s,a) => s + calcAccountBalance(a, txsAll), 0);

  setContent(`
    <div class="hero mb-3" style="background:linear-gradient(135deg,#134e4a,#0f766e)">
      <div class="hero-label">Patrimonio total</div>
      <div class="hero-amount">${fmt(total)}</div>
      <div class="hero-sub">${accounts.length} cuenta(s)</div>
    </div>
    ${!accounts.length ? `<div class="empty-state"><div class="es-icon"><i class="ph ph-bank"></i></div><button class="btn btn-primary mt-3" onclick="openNewAccount()">Crear primera cuenta</button></div>` :
      accounts.map(a => {
        const type = ACCOUNT_TYPES.find(t => t.id === a.type);
        const bal  = calcAccountBalance(a, txsAll);
        return `<div class="card mb-3" style="border-left:4px solid ${type?.color||'var(--primary)'}">
          <div class="flex items-center justify-between mb-1">
            <div><span style="font-size:1rem">${type?.icon||'<i class="ph ph-bank"></i>'}</span> <span class="fw-bold">${a.name}</span></div>
            <button class="btn btn-ghost btn-sm" onclick="handleDeleteAccount('${a.id}')"><i class="ph ph-trash"></i></button>
          </div>
          <div style="font-size:1.5rem;font-weight:900;color:${type?.color||'var(--primary)'}">${fmt(bal)}</div>
          <div class="fs-xs text-2 mt-2">${type?.label||a.type}</div>
        </div>`;
      }).join('')}
  `);
}

window.openNewAccount = () => {
  showGenericModal('Nueva Cuenta', `
    <form onsubmit="submitNewAccount(event)">
      <div class="form-group"><label>Nombre</label><input name="name" placeholder="Ej: Cuenta sueldo Galicia" required></div>
      <div class="form-group"><label>Tipo</label><select name="type">${ACCOUNT_TYPES.map(t=>`<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}</select></div>
      <div class="form-group"><label>Saldo inicial</label><div class="input-prefix"><span>$</span><input name="balance" type="number" step="0.01" value="0" inputmode="decimal"></div></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Crear cuenta</button>
    </form>`);
};

window.submitNewAccount = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await saveAccount({ name:fd.get('name'), type:fd.get('type'), currency:'ARS', initialBalance:parseFloat(fd.get('balance'))||0, createdAt:today() });
  closeModal('modal-generic'); clearCache(); renderCuentas();
};

window.handleDeleteAccount = async (id) => {
  if (!confirm('¿Eliminar esta cuenta?')) return;
  await deleteAccount(id); clearCache(); renderCuentas();
};

// ════════════════════════════════════════════════
// PRESUPUESTO
// ════════════════════════════════════════════════
async function renderPresupuesto() {
  const txs = await cachedTxs();
  const totals   = calcPeriodTotals(txs, DEFAULT_CATS);
  const catTot   = calcCategoryTotals(txs, DEFAULT_CATS);
  const pyf      = totals.ingresos * (settings.payYourselfFirst||20) / 100;
  const needsTarget = totals.ingresos * (settings.needs||50) / 100;
  const wantsTarget = totals.ingresos * (settings.wants||30) / 100;
  const savTarget   = totals.ingresos * (settings.savings||20) / 100;

  let needsSpent=0, wantsSpent=0, savSpent=0;
  const rows = {Necesidades:[],  'Estilo de vida':[], 'Ahorro/Inversión':[], Deuda:[], Varios:[]};
  Object.entries(catTot).forEach(([cid,amt])=>{
    const cat = DEFAULT_CATS.find(c=>c.id===cid); if(!cat) return;
    if(cat.macro==='Necesidades') needsSpent+=amt;
    else if(cat.macro==='Estilo de vida') wantsSpent+=amt;
    else if(cat.macro==='Ahorro/Inversión') savSpent+=amt;
    if(rows[cat.macro]) rows[cat.macro].push({cat,amt});
    else rows['Varios'].push({cat,amt});
  });

  const now = new Date();
  setContent(`
    ${settings.payYourselfFirst>0?`<div class="alert alert-success mb-3"><i class="ph ph-lightbulb"></i> <strong>Págate primero:</strong> Separá ${fmt(pyf)} para ahorro ANTES de cualquier gasto.</div>`:''}
    ${totals.ingresos===0?`<div class="alert alert-warning mb-3"><i class="ph ph-warning-circle"></i> Sin ingresos este mes. Registrá primero tus ingresos.</div>`:''}
    ${budgetBlock('<i class="ph ph-house"></i> Necesidades',needsSpent,needsTarget,settings.needs||50,rows['Necesidades'],'var(--info)')}
    ${budgetBlock('<i class="ph ph-film-slate"></i> Estilo de vida',wantsSpent,wantsTarget,settings.wants||30,rows['Estilo de vida'],'var(--primary)')}
    ${budgetBlock('<i class="ph ph-bank"></i> Ahorro/Inversión',savSpent,savTarget,settings.savings||20,rows['Ahorro/Inversión'],'var(--success)')}
    <button class="btn btn-ghost btn-block mt-3" onclick="openBudgetConfig()"><i class="ph ph-gear"></i> Ajustar porcentajes</button>
  `);
}

function budgetBlock(title,spent,target,pct,rows,color){
  const over=spent>target; const ppct=target?Math.min(100,(spent/target)*100):0;
  return `<div class="card mb-3">
    <div class="card-header"><span class="card-title">${title}</span><span class="badge ${over?'badge-red':'badge-green'}">${pct}%</span></div>
    <div class="flex justify-between fs-sm mb-2"><strong>${fmt(spent)}</strong><span class="text-2">meta ${fmt(target)}</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${ppct}%;background:${over?'var(--danger)':color}"></div></div>
    ${over?`<div class="alert alert-danger mt-3 fs-sm"><i class="ph ph-warning-circle"></i> Excedido por ${fmt(spent-target)}</div>`:''}
    ${rows.length?`<hr>${rows.map(r=>`<div class="flex justify-between fs-sm mb-2"><span>${r.cat.icon} ${r.cat.name}</span><span>${fmt(r.amt)}</span></div>`).join('')}`:''}
  </div>`;
}

window.openBudgetConfig = () => {
  showGenericModal('<i class="ph ph-gear"></i> Ajustar porcentajes', `
    <div class="alert alert-info mb-3">Los porcentajes deben sumar 100.</div>
    <form onsubmit="submitBudgetConfig(event)">
      <div class="form-group"><label><i class="ph ph-house"></i> Necesidades (%)</label><input name="needs" type="number" value="${settings.needs||50}" min="0" max="100" inputmode="numeric"></div>
      <div class="form-group"><label><i class="ph ph-film-slate"></i> Estilo de vida (%)</label><input name="wants" type="number" value="${settings.wants||30}" min="0" max="100" inputmode="numeric"></div>
      <div class="form-group"><label><i class="ph ph-bank"></i> Ahorro/Inversión (%)</label><input name="savings" type="number" value="${settings.savings||20}" min="0" max="100" inputmode="numeric"></div>
      <div class="form-group"><label><i class="ph ph-lightbulb"></i> Págate primero (%)</label><input name="pyf" type="number" value="${settings.payYourselfFirst||20}" min="0" max="100" inputmode="numeric"></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};
window.submitBudgetConfig = async (e) => {
  e.preventDefault(); const fd=new FormData(e.target);
  settings.needs=parseInt(fd.get('needs')); settings.wants=parseInt(fd.get('wants'));
  settings.savings=parseInt(fd.get('savings')); settings.payYourselfFirst=parseInt(fd.get('pyf'));
  await saveSettings(settings); closeModal('modal-generic'); renderPresupuesto();
};

// ════════════════════════════════════════════════
// OBJETIVOS
// ════════════════════════════════════════════════
async function renderObjetivos() {
  const goals = await getGoals();
  const emGoal = goals.find(g=>g.type==='emergency_fund');
  const emPct  = emGoal ? Math.min(100,(emGoal.currentAmount/emGoal.targetAmount)*100) : 0;

  setContent(`
    <div class="card mb-3">
      <div class="card-header"><span class="card-title"><i class="ph ph-shield-check"></i> Fondo de Emergencia</span><button class="btn btn-ghost btn-sm" onclick="openEmFund()"><i class="ph ph-gear"></i></button></div>
      ${emGoal ? `
        <div style="font-size:1.8rem;font-weight:900;color:${emPct>=100?'var(--success)':'var(--warning)'};margin-bottom:6px">${fmt(emGoal.currentAmount)}</div>
        <div class="fs-sm text-2 mb-3">Meta: ${fmt(emGoal.targetAmount)} (${emGoal.months||6} meses)</div>
        <div class="progress-bar" style="height:12px"><div class="progress-fill" style="width:${emPct}%;background:${emPct>=100?'var(--success)':emPct>50?'var(--warning)':'var(--danger)'}"></div></div>
        <div class="flex justify-between fs-xs text-2 mt-2"><span>${emPct.toFixed(1)}%</span><span>Falta ${fmt(Math.max(0,emGoal.targetAmount-emGoal.currentAmount))}</span></div>
        ${emPct>=100?`<div class="alert alert-success mt-3 fs-sm"><i class="ph ph-check-circle"></i> ¡Completado! Mantené este dinero en cuenta remunerada o FCI money market.</div>`:
        `<div class="alert alert-warning mt-3 fs-sm"><i class="ph ph-warning-circle"></i> Este fondo debe estar en activos <strong>líquidos</strong>.</div>`}
        <button class="btn btn-success btn-block mt-3" onclick="addToEmFund('${emGoal.id}',${emGoal.currentAmount})">+ Agregar fondos</button>
      ` : `
        <div class="empty-state"><div class="es-icon"><i class="ph ph-shield-check"></i></div>
          <button class="btn btn-primary mt-3" onclick="openEmFund()">Configurar ahora</button></div>`}
    </div>
    <div class="card mb-3">
      <div class="card-header"><span class="card-title">Otros objetivos</span><button class="btn btn-ghost btn-sm" onclick="openNewGoal()">+ Agregar</button></div>
      ${goals.filter(g=>g.type!=='emergency_fund').map(g=>{
        const pct=Math.min(100,(g.currentAmount/g.targetAmount)*100);
        return `<div class="mb-3">
          <div class="progress-label"><span class="fw-bold"><i class="ph ph-crosshair"></i> ${g.name}</span><span>${fmt(g.currentAmount)} / ${fmt(g.targetAmount)}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--primary)"></div></div>
          ${g.targetDate?`<div class="fs-xs text-2 mt-1">Target: ${fmtDate(g.targetDate)}</div>`:''}
        </div>`;}).join('') || '<div class="text-2 fs-sm">Sin objetivos adicionales</div>'}
    </div>
  `);
}

window.openEmFund = () => {
  showGenericModal('<i class="ph ph-shield-check"></i> Fondo de Emergencia', `
    <form onsubmit="submitEmFund(event)">
      <div class="form-group"><label>Meses de cobertura</label><select name="months">${[3,6,12].map(m=>`<option value="${m}" ${settings.emergencyMonths===m?'selected':''}>${m} meses</option>`).join('')}</select></div>
      <div class="form-group"><label>Gasto promedio mensual estimado</label><div class="input-prefix"><span>$</span><input name="avg" type="number" step="0.01" inputmode="decimal" placeholder="Ej: 200000"></div></div>
      <div class="form-group"><label>Monto acumulado actualmente</label><div class="input-prefix"><span>$</span><input name="current" type="number" step="0.01" value="0" inputmode="decimal"></div></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};
window.submitEmFund = async (e) => {
  e.preventDefault(); const fd=new FormData(e.target);
  const months=parseInt(fd.get('months')); const avg=parseFloat(fd.get('avg'))||0;
  settings.emergencyMonths=months; await saveSettings(settings);
  const goals=await getGoals(); const em=goals.find(g=>g.type==='emergency_fund');
  const goal={id:em?.id, type:'emergency_fund', name:'Fondo de Emergencia',
    targetAmount:avg*months, currentAmount:parseFloat(fd.get('current'))||0, months, createdAt:today()};
  await saveGoal(goal); closeModal('modal-generic'); renderObjetivos();
};
window.addToEmFund = async (id, current) => {
  const amt=parseFloat(prompt(`¿Cuánto agregás? (Actual: ${fmt(current)})`));
  if(!isNaN(amt)&&amt>0){ await saveGoal({id, currentAmount:current+amt}); renderObjetivos(); }
};
window.openNewGoal = () => {
  showGenericModal('<i class="ph ph-crosshair"></i> Nuevo objetivo', `
    <form onsubmit="submitGoal(event)">
      <div class="form-group"><label>Nombre</label><input name="name" placeholder="Ej: Vacaciones Europa" required></div>
      <div class="form-row">
        <div class="form-group"><label>Meta</label><input name="target" type="number" step="0.01" required inputmode="decimal"></div>
        <div class="form-group"><label>Acumulado</label><input name="current" type="number" step="0.01" value="0" inputmode="decimal"></div>
      </div>
      <div class="form-group"><label>Fecha objetivo</label><input name="date" type="date"></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};
window.submitGoal = async (e) => {
  e.preventDefault(); const fd=new FormData(e.target);
  await saveGoal({type:'custom',name:fd.get('name'),targetAmount:parseFloat(fd.get('target')),currentAmount:parseFloat(fd.get('current'))||0,targetDate:fd.get('date'),createdAt:today()});
  closeModal('modal-generic'); renderObjetivos();
};

// ════════════════════════════════════════════════
// INVERSIONES
// ════════════════════════════════════════════════
function renderInversiones() {
  setContent(`
    <div class="card mb-3">
      <div class="card-title"><i class="ph ph-trend-up"></i> Calculadora de Interés Compuesto</div>
      <form id="compound-form" onsubmit="calcCompound(event)">
        <div class="form-row">
          <div class="form-group"><label>Capital inicial</label>
            <div class="input-prefix"><span>$</span><input name="capital" type="number" value="100000" inputmode="decimal"></div></div>
          <div class="form-group"><label>Aporte mensual</label>
            <div class="input-prefix"><span>$</span><input name="monthly" type="number" value="10000" inputmode="decimal"></div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tasa anual (%)</label>
            <input name="rate" type="number" value="12" step="0.5" inputmode="decimal"></div>
          <div class="form-group"><label>Años</label>
            <input name="years" type="number" value="30" min="1" max="50" inputmode="numeric"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Calcular</button>
      </form>
      <div id="compound-result" class="mt-3"></div>
      <div class="chart-wrap h240 mt-3"><canvas id="chart-compound"></canvas></div>
    </div>

    <div class="card mb-3">
      <div class="card-title"><i class="ph ph-crosshair"></i> Cartera 80/20 — Distribución sugerida</div>
      <div class="alert alert-info mb-3">80% en activos seguros y estables · 20% en activos de mayor riesgo/retorno</div>
      <div class="grid-2">
        <div class="chart-wrap h200"><canvas id="chart-pareto"></canvas></div>
        <div>
          ${[
            {pct:40, l:'ETF SP500 (VOO, CSPX)', c:'#10b981', i:'<i class="ph ph-chart-bar"></i>'},
            {pct:25, l:'Bonos / Renta fija',    c:'#38bdf8', i:'<i class="ph ph-clipboard-text"></i>'},
            {pct:15, l:'FCI / Cta. remunerada', c:'#6366f1', i:'<i class="ph ph-bank"></i>'},
            {pct:10, l:'Cripto (BTC/ETH)',       c:'#f59e0b', i:'₿'},
            {pct:5,  l:'Inmuebles / REITs',      c:'#8b5cf6', i:'<i class="ph ph-house"></i>'},
            {pct:5,  l:'Alternativos',            c:'#ef4444', i:'<i class="ph ph-rocket"></i>'},
          ].map(r=>`
            <div class="flex items-center gap-2 mb-2">
              <span style="width:20px">${r.i}</span>
              <span class="fs-sm" style="flex:1">${r.l}</span>
              <div style="width:50px;height:5px;background:var(--surface2);border-radius:3px">
                <div style="width:${r.pct}%;height:100%;background:${r.c};border-radius:3px"></div>
              </div>
              <span class="fs-sm fw-bold" style="width:28px;text-align:right">${r.pct}%</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-title"><i class="ph ph-trend-down"></i> Impacto de la inflación en tu dinero parado</div>
      <form id="inflation-form" onsubmit="calcInflation(event)">
        <div class="form-row">
          <div class="form-group"><label>Monto actual</label>
            <div class="input-prefix"><span>$</span><input name="amount" type="number" value="1000000" inputmode="decimal"></div></div>
          <div class="form-group"><label>Inflación anual (%)</label>
            <input name="inflation" type="number" value="60" step="1" inputmode="decimal"></div>
        </div>
        <div class="form-group"><label>Años</label>
          <input name="years" type="number" value="5" min="1" max="30" inputmode="numeric"></div>
        <button class="btn btn-primary btn-block" type="submit">Ver impacto</button>
      </form>
      <div id="inflation-result" class="mt-3"></div>
    </div>

    <div class="card">
      <div class="card-title"><i class="ph ph-lightbulb"></i> DCA — Dollar Cost Averaging</div>
      <div class="grid-2">
        ${[
          {i:'<i class="ph ph-calendar"></i>', t:'¿Qué es el DCA?', c:'Invertir un monto fijo mensual sin importar el precio. Reduces el impacto de la volatilidad automáticamente.'},
          {i:'<i class="ph ph-brain"></i>', t:'Ventaja psicológica', c:'Eliminás el miedo a "comprar en el pico". Comprás más barato cuando el mercado cae y menos cuando sube.'},
          {i:'<i class="ph ph-gear"></i>', t:'Cómo aplicarlo', c:'Día 1 de cada mes: comprá ETFs indexados por transferencia automática. No mires el precio, no toques.'},
          {i:'⏳', t:'El tiempo es el activo', c:'$10.000/mes durante 30 años al 10% anual = más de $22 millones. La clave es empezar hoy.'},
        ].map(c=>`<div class="card" style="padding:14px"><div style="font-size:1.5rem;margin-bottom:6px">${c.i}</div><div class="fw-bold fs-sm mb-1">${c.t}</div><div class="fs-xs text-2" style="line-height:1.5">${c.c}</div></div>`).join('')}
      </div>
    </div>
  `);

  setTimeout(() => {
    renderParetoChart();
    calcCompound({ preventDefault:()=>{}, target: document.getElementById('compound-form') });
  }, 50);
}

window.calcCompound = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const C  = parseFloat(fd.get('capital')||100000);
  const M  = parseFloat(fd.get('monthly')||10000);
  const r  = parseFloat(fd.get('rate')||12) / 100 / 12;
  const Y  = parseInt(fd.get('years')||30);
  const n  = Y * 12;
  const compound   = C * Math.pow(1+r,n) + M * ((Math.pow(1+r,n)-1)/r);
  const simple     = C + C*(r*12)*Y + M*n;
  const aportado   = C + M*n;

  document.getElementById('compound-result').innerHTML = `
    <div class="grid-2" style="gap:8px">
      <div class="kpi green" style="padding:12px"><div class="kpi-label">Interés compuesto</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(compound)}</div></div>
      <div class="kpi amber" style="padding:12px"><div class="kpi-label">Interés simple</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(simple)}</div></div>
    </div>
    <div class="alert alert-success mt-2 fs-sm"><i class="ph ph-lightbulb"></i> El compuesto genera <strong>${fmtShort(compound-simple)}</strong> extra en ${Y} años. Aportás ${fmtShort(aportado)} en total.</div>`;

  // Redibujar gráfico
  if (activeCharts.compound) { activeCharts.compound.destroy(); delete activeCharts.compound; }
  const ctx = document.getElementById('chart-compound');
  if (!ctx) return;
  const labels=[], comp=[], simp=[], contrib=[];
  for (let yr=0; yr<=Y; yr++) {
    const nn = yr*12;
    labels.push(yr+'a');
    comp.push(+(C*Math.pow(1+r,nn)+M*((Math.pow(1+r,nn)-1)/r)).toFixed(0));
    simp.push(+(C+C*(r*12)*yr+M*nn).toFixed(0));
    contrib.push(C+M*nn);
  }
  activeCharts.compound = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[
      {label:'Compuesto',data:comp,borderColor:'#10b981',backgroundColor:'#10b98115',fill:true,tension:.4,borderWidth:2,pointRadius:0},
      {label:'Simple',   data:simp,borderColor:'#f59e0b',backgroundColor:'transparent',borderDash:[5,5],tension:.4,borderWidth:2,pointRadius:0},
      {label:'Aportado', data:contrib,borderColor:'#475569',backgroundColor:'transparent',borderDash:[2,4],tension:.4,borderWidth:1,pointRadius:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#94a3b8',font:{size:10},padding:8}}},
      scales:{
        x:{ticks:{color:'#64748b',font:{size:9},maxTicksLimit:8},grid:{color:'#33415566'}},
        y:{ticks:{color:'#64748b',font:{size:9},callback:v=>fmtShort(v)},grid:{color:'#33415566'}}
      }
    }
  });
};

function renderParetoChart() {
  const ctx = document.getElementById('chart-pareto'); if (!ctx) return;
  if (activeCharts.pareto) { activeCharts.pareto.destroy(); delete activeCharts.pareto; }
  activeCharts.pareto = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:['SP500 ETF','Bonos','FCI','Cripto','Inmuebles','Otros'],
      datasets:[{data:[40,25,15,10,5,5],
        backgroundColor:['#10b981','#38bdf8','#6366f1','#f59e0b','#8b5cf6','#ef4444'],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{display:false}}}
  });
}

window.calcInflation = (e) => {
  e.preventDefault();
  const fd  = new FormData(e.target);
  const A   = parseFloat(fd.get('amount'));
  const inf = parseFloat(fd.get('inflation')) / 100;
  const Y   = parseInt(fd.get('years'));
  const fv  = A / Math.pow(1+inf, Y);
  document.getElementById('inflation-result').innerHTML = `
    <div class="alert alert-danger">En ${Y} años, ${fmtShort(A)} de hoy valen <strong>${fmtShort(fv)}</strong> en poder de compra. Pérdida real: <strong>${fmtShort(A-fv)}</strong> (${((1-fv/A)*100).toFixed(1)}%)</div>
    <div class="alert alert-success"><i class="ph ph-lightbulb"></i> En una cuenta remunerada al ritmo de la inflación mantenés el valor real.</div>`;
};

// ════════════════════════════════════════════════
// CRÉDITO Y DEUDA
// ════════════════════════════════════════════════
async function renderCredito() {
  document.getElementById('topbar-action').innerHTML =
    `<button class="btn btn-primary btn-sm" onclick="openNewCard()"><<i class="ph ph-plus-circle"></i> Tarjeta</button>`;

  const cards = await getCards();

  const totalDeuda   = cards.reduce((s,c) => s+(c.balance||0), 0);
  const totalLimite  = cards.reduce((s,c) => s+(c.limit||0), 0);
  const utilizacion  = totalLimite ? (totalDeuda/totalLimite*100) : 0;

  setContent(`
    ${totalDeuda > 0 ? `
    <div class="grid-2 mb-3">
      <div class="kpi red" style="padding:14px"><div class="kpi-label">Deuda total</div><div class="kpi-value" style="font-size:1.2rem">${fmtShort(totalDeuda)}</div></div>
      <div class="kpi ${utilizacion>80?'red':utilizacion>50?'amber':'green'}" style="padding:14px"><div class="kpi-label">Utilización</div><div class="kpi-value" style="font-size:1.2rem">${utilizacion.toFixed(1)}%</div><div class="kpi-sub">Mantené bajo 30%</div></div>
    </div>` : ''}

    <div class="card mb-3">
      <div class="card-header">
        <span class="card-title"><i class="ph ph-credit-card"></i> Mis tarjetas</span>
        <button class="btn btn-ghost btn-sm" onclick="openNewCard()">+</button>
      </div>
      ${!cards.length
        ? `<div class="empty-state"><div class="es-icon"><i class="ph ph-credit-card"></i></div><button class="btn btn-primary mt-3" onclick="openNewCard()">Agregar tarjeta</button></div>`
        : cards.map(c => cardBlock(c)).join('')}
    </div>

    <div class="card mb-3">
      <div class="card-title"><i class="ph ph-calendar"></i> 50 días de financiamiento gratis</div>
      <div class="alert alert-info mb-3">Comprando el día <strong>después del cierre</strong>, tenés hasta ~50 días para pagar sin interés. <strong>NUNCA pagar el mínimo</strong> — puede costarte 3× el monto original.</div>
      ${cards.map(c => {
        const now = new Date();
        const daysTocut = ((c.cutDate - now.getDate() + 31) % 31) || 31;
        const window50  = daysTocut + (c.payDate > c.cutDate ? c.payDate - c.cutDate : 30 + c.payDate - c.cutDate);
        const nextCut   = new Date(); nextCut.setDate(c.cutDate);
        if (nextCut < now) nextCut.setMonth(nextCut.getMonth()+1);
        return `
        <div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px;margin-bottom:8px">
          <div class="flex justify-between items-center">
            <span class="fw-bold fs-sm">${c.name}</span>
            <span class="badge badge-green"><span class="badge-dot" style="color:#10b981">●</span> ~${window50} días gratis</span>
          </div>
          <div class="fs-xs text-2 mt-1">Cierre: día ${c.cutDate} · Pago: día ${c.payDate} · Próximo cierre: ${nextCut.toLocaleDateString('es-AR',{day:'numeric',month:'short'})}</div>
          ${c.minPayment ? `<div class="alert alert-warning fs-xs mt-2" style="padding:6px 10px"><i class="ph ph-warning-circle"></i> Mínimo: ${fmt(c.minPayment)} — Pagá SIEMPRE el total</div>` : ''}
        </div>`;}).join('') || '<div class="fs-sm text-2">Agregá tarjetas para ver el calendario.</div>'}
    </div>

    ${cards.filter(c=>c.balance>0).length ? `
    <div class="card mb-3">
      <div class="card-title"><i class="ph ph-yoga"></i> Plan de eliminación — Estrategia Avalancha</div>
      <div class="alert alert-info mb-3 fs-sm">Pagá primero la deuda con mayor tasa. Ahorrás más dinero a largo plazo.</div>
      ${cards.filter(c=>c.balance>0).sort((a,b)=>(b.apr||0)-(a.apr||0)).map(c=>`
        <div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px;margin-bottom:8px">
          <div class="flex justify-between mb-1"><span class="fw-bold fs-sm">${c.name}</span><span class="text-danger fw-bold">${fmt(c.balance)}</span></div>
          <div class="fs-xs text-2">APR: ${c.apr||'?'}% · Mínimo: ${fmt(c.minPayment||0)}</div>
          <div class="progress-bar mt-2" style="height:5px"><div class="progress-fill" style="width:${Math.min(100,c.balance/(c.limit||c.balance)*100)}%;background:var(--danger)"></div></div>
        </div>`).join('')}
    </div>` : ''}

    <div class="card mb-3">
      <div class="card-title"><i class="ph ph-bank"></i> Simulador de apalancamiento</div>
      <form id="lev-form" onsubmit="calcLeverage(event)">
        <div class="form-row">
          <div class="form-group"><label>Precio del activo</label>
            <div class="input-prefix"><span>$</span><input name="price" type="number" value="50000000" inputmode="decimal"></div></div>
          <div class="form-group"><label>Entrada (%)</label>
            <input name="down" type="number" value="30" step="5" inputmode="numeric"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tasa hipoteca (%)</label>
            <input name="rate" type="number" value="8" step="0.5" inputmode="decimal"></div>
          <div class="form-group"><label>Años crédito</label>
            <input name="years" type="number" value="20" inputmode="numeric"></div>
        </div>
        <div class="form-group"><label>Rentabilidad neta anual (%)</label>
          <input name="yield" type="number" value="6" step="0.5" inputmode="decimal"></div>
        <button class="btn btn-primary btn-block" type="submit">Calcular</button>
      </form>
      <div id="lev-result" class="mt-3"></div>
    </div>
  `);
}

function cardBlock(c) {
  const u = c.limit ? (c.balance/c.limit*100) : 0;
  return `
  <div style="background:var(--surface2);border-radius:var(--r-sm);padding:14px;margin-bottom:10px;border-left:4px solid ${u>80?'var(--danger)':u>50?'var(--warning)':'var(--primary)'}">
    <div class="flex justify-between items-center mb-1">
      <span class="fw-bold">${c.name}</span>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" onclick="openEditCard('${c.id}')"><i class="ph ph-pencil"></i></button>
        <button class="btn btn-ghost btn-sm" onclick="removeCard('${c.id}')"><i class="ph ph-trash"></i></button>
      </div>
    </div>
    <div class="fs-xs text-2 mb-2">${c.bank||''} · Cierre día ${c.cutDate} · Pago día ${c.payDate} · APR ${c.apr||'?'}%</div>
    <div class="flex justify-between mb-1">
      <span class="text-danger fw-bold">${fmt(c.balance)}</span>
      <span class="text-2 fs-sm">Límite: ${fmt(c.limit)}</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,u)}%;background:${u>80?'var(--danger)':u>50?'var(--warning)':'var(--success)'}"></div></div>
    <div class="fs-xs text-2 mt-1">Utilización: ${u.toFixed(1)}%${u>30?' · <i class="ph ph-warning-circle"></i> Mantenelo bajo 30%':''}</div>
  </div>`;
}

window.openNewCard = () => {
  showGenericModal('<i class="ph ph-credit-card"></i> Nueva Tarjeta', cardForm());
};
window.openEditCard = async (id) => {
  const cards = await getCards();
  const c = cards.find(x=>x.id===id); if (!c) return;
  showGenericModal('<i class="ph ph-pencil"></i> Editar Tarjeta', cardForm(c));
};
function cardForm(c={}) {
  return `<form onsubmit="submitCard(event,'${c.id||''}')">
    <div class="form-row">
      <div class="form-group"><label>Nombre</label><input name="name" placeholder="Visa Galicia" value="${c.name||''}" required></div>
      <div class="form-group"><label>Banco</label><input name="bank" placeholder="Galicia" value="${c.bank||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Límite</label><input name="limit" type="number" step="100" value="${c.limit||''}" inputmode="decimal"></div>
      <div class="form-group"><label>Saldo actual</label><input name="balance" type="number" step="0.01" value="${c.balance||0}" inputmode="decimal"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Día de cierre</label><input name="cutDate" type="number" min="1" max="31" value="${c.cutDate||15}" inputmode="numeric"></div>
      <div class="form-group"><label>Día de pago</label><input name="payDate" type="number" min="1" max="31" value="${c.payDate||5}" inputmode="numeric"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>APR anual (%)</label><input name="apr" type="number" step="0.1" value="${c.apr||45}" inputmode="decimal"></div>
      <div class="form-group"><label>Pago mínimo</label><input name="minPayment" type="number" step="0.01" value="${c.minPayment||0}" inputmode="decimal"></div>
    </div>
    <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
  </form>`;
}
window.submitCard = async (e, existingId) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await saveCard({
    id: existingId || undefined,
    name: fd.get('name'), bank: fd.get('bank'),
    limit: parseFloat(fd.get('limit'))||0,
    balance: parseFloat(fd.get('balance'))||0,
    cutDate: parseInt(fd.get('cutDate')),
    payDate: parseInt(fd.get('payDate')),
    apr: parseFloat(fd.get('apr'))||0,
    minPayment: parseFloat(fd.get('minPayment'))||0,
  });
  closeModal('modal-generic'); renderCredito();
};
window.removeCard = async (id) => {
  if (!confirm('¿Eliminar esta tarjeta?')) return;
  await deleteCard(id); renderCredito();
};
window.calcLeverage = (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const price = parseFloat(fd.get('price'));
  const down  = parseFloat(fd.get('down'))/100;
  const rate  = parseFloat(fd.get('rate'))/100/12;
  const years = parseInt(fd.get('years'));
  const yld   = parseFloat(fd.get('yield'))/100;
  const loan  = price*(1-down); const n=years*12;
  const monthly = loan*(rate*Math.pow(1+rate,n))/(Math.pow(1+rate,n)-1);
  const cashflow = price*yld/12 - monthly;
  const totalInterest = monthly*n - loan;
  document.getElementById('lev-result').innerHTML = `
    <div class="grid-2 mb-2" style="gap:8px">
      <div class="kpi" style="padding:12px"><div class="kpi-label">Cuota mensual</div><div class="kpi-value" style="font-size:1.1rem">${fmt(monthly)}</div></div>
      <div class="kpi ${cashflow>=0?'green':'red'}" style="padding:12px"><div class="kpi-label">Flujo mensual</div><div class="kpi-value" style="font-size:1.1rem">${cashflow>=0?'<<i class="ph ph-plus-circle"></i>':''}${fmt(cashflow)}</div></div>
    </div>
    <div class="alert ${cashflow>=0?'alert-success':'alert-warning'} fs-sm">
      Total intereses pagados: <strong>${fmtShort(totalInterest)}</strong><br>
      ${cashflow>=0?'<i class="ph ph-check-circle"></i> El activo se autofinancia con la renta.':'<i class="ph ph-warning-circle"></i> La cuota supera la renta. Evaluá si conviene más entrada inicial.'}
    </div>`;
};

// ════════════════════════════════════════════════
// REPORTES
// ════════════════════════════════════════════════
async function renderReportes() {
  setContent(`<div style="text-align:center;padding:32px;color:var(--text2)"><div class="spinner" style="width:32px;height:32px;margin:0 auto 12px"></div>Cargando reportes...</div>`);

  // Cargar últimos 6 meses de transacciones
  const now = new Date();
  const months = [];
  for (let i=5; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push({ d, ym: monthKey(d), label: d.toLocaleDateString('es-AR',{month:'short'}) });
  }

  const allTxsByMonth = await Promise.all(
    months.map(m => getMonthTransactions(m.ym).catch(()=>[]))
  );

  const monthTotals = allTxsByMonth.map(txs => calcPeriodTotals(txs, DEFAULT_CATS));
  const curTotals   = monthTotals[5];
  const prevTotals  = monthTotals[4];

  const variation   = prevTotals.egresos
    ? ((curTotals.egresos - prevTotals.egresos) / prevTotals.egresos * 100) : 0;
  const savRate     = curTotals.ingresos
    ? (curTotals.ahorros / curTotals.ingresos * 100) : 0;

  // Top 10 de este mes
  const curTxs    = allTxsByMonth[5];
  const catTotals = calcCategoryTotals(curTxs, DEFAULT_CATS);
  const top10     = Object.entries(catTotals)
    .map(([id,v]) => ({ id, v, cat: DEFAULT_CATS.find(c=>c.id===id) }))
    .filter(x => x.cat && x.cat.macro !== 'Ahorro/Inversión')
    .sort((a,b) => b.v - a.v)
    .slice(0, 10);

  // Macro breakdown
  const macro = {};
  Object.entries(catTotals).forEach(([cid,amt]) => {
    const cat = DEFAULT_CATS.find(c=>c.id===cid);
    if (cat) macro[cat.macro] = (macro[cat.macro]||0) + amt;
  });

  setContent(`
    <div class="grid-2 mb-3">
      <div class="kpi ${variation<=0?'green':'red'}" style="padding:14px">
        <div class="kpi-label">Variación vs mes anterior</div>
        <div class="kpi-value">${variation>=0?'<<i class="ph ph-plus-circle"></i>':''}${variation.toFixed(1)}%</div>
        <div class="kpi-sub">${variation>10?'<i class="ph ph-warning-circle"></i> Aumento inusual':variation<-10?'<i class="ph ph-check-circle"></i> Bajaste gastos':variation===0?'Sin cambios':'Normal'}</div>
      </div>
      <div class="kpi blue" style="padding:14px">
        <div class="kpi-label">Tasa de ahorro</div>
        <div class="kpi-value">${savRate.toFixed(1)}%</div>
        <div class="kpi-sub">${savRate>=20?'<i class="ph ph-check-circle"></i> Por encima del 20% objetivo':savRate>0?'<i class="ph ph-warning-circle"></i> Meta: 20%':'Sin ahorros'}</div>
      </div>
    </div>

    <div class="grid-2 mb-3">
      <div class="card">
        <div class="card-title">Flujo de caja — últimos 6 meses</div>
        <div class="chart-wrap h220"><canvas id="chart-hist"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Distribución por categoría</div>
        <div class="chart-wrap h220"><canvas id="chart-macro"></canvas></div>
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-title">Evolución del ahorro</div>
      <div class="chart-wrap h180"><canvas id="chart-saving"></canvas></div>
    </div>

    <div class="card">
      <div class="card-title">Top ${top10.length} gastos este mes</div>
      ${top10.length ? top10.map((x,i) => {
        const pct = (x.v / top10[0].v * 100).toFixed(0);
        return `<div class="flex items-center gap-2 mb-3">
          <span class="fs-xs text-3" style="width:18px">#${i+1}</span>
          <span style="width:20px">${x.cat.icon}</span>
          <span class="fs-sm" style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${x.cat.name}</span>
          <div style="width:80px;height:6px;background:var(--surface2);border-radius:3px;flex-shrink:0">
            <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px"></div>
          </div>
          <span class="fs-sm fw-bold" style="flex-shrink:0;min-width:60px;text-align:right">${fmtShort(x.v)}</span>
        </div>`;}).join('') : '<div class="empty-state fs-sm">Sin gastos este mes</div>'}
    </div>
  `);

  setTimeout(() => {
    renderHistChart(months, monthTotals);
    renderMacroChart(macro);
    renderSavingChart(months, monthTotals);
  }, 50);
}

function renderHistChart(months, totals) {
  const ctx = document.getElementById('chart-hist'); if (!ctx) return;
  activeCharts.hist = new Chart(ctx, {
    type:'bar',
    data:{ labels: months.map(m=>m.label), datasets:[
      {label:'Ingresos', data:totals.map(t=>t.ingresos), backgroundColor:'#10b98180', borderRadius:4, borderSkipped:false},
      {label:'Gastos',   data:totals.map(t=>t.egresos),  backgroundColor:'#ef444480', borderRadius:4, borderSkipped:false},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},
      scales:{
        x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},
        y:{ticks:{color:'#64748b',font:{size:10},callback:v=>fmtShort(v)},grid:{color:'#33415566'}}
      }
    }
  });
}

function renderMacroChart(macro) {
  const ctx = document.getElementById('chart-macro'); if (!ctx) return;
  const entries = Object.entries(macro).filter(([,v])=>v>0);
  if (!entries.length) return;
  activeCharts.macro = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:entries.map(([k])=>k),
      datasets:[{data:entries.map(([,v])=>v),
        backgroundColor:['#6366f1','#10b981','#f59e0b','#ef4444','#38bdf8','#8b5cf6'],borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
      plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:10},padding:6}}}}
  });
}

function renderSavingChart(months, totals) {
  const ctx = document.getElementById('chart-saving'); if (!ctx) return;
  const rates = totals.map(t => t.ingresos ? +(t.ahorros/t.ingresos*100).toFixed(1) : 0);
  activeCharts.saving = new Chart(ctx, {
    type:'line',
    data:{ labels:months.map(m=>m.label), datasets:[
      {label:'Tasa de ahorro %', data:rates, borderColor:'#6366f1', backgroundColor:'#6366f115',
       fill:true, tension:.4, borderWidth:2, pointRadius:4, pointBackgroundColor:'#6366f1'},
      {label:'Objetivo 20%', data:Array(6).fill(20), borderColor:'#10b981',
       borderDash:[6,3], borderWidth:1.5, pointRadius:0, tension:0},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},
      scales:{
        x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},
        y:{min:0,ticks:{color:'#64748b',font:{size:10},callback:v=>v+'%'},grid:{color:'#33415566'}}
      }
    }
  });
}

function renderEducacion() {
  const lessons=[
    {i:'<i class="ph ph-books"></i>',t:'Activos vs Pasivos',c:'Un <strong>activo</strong> pone dinero en tu bolsillo. Un <strong>pasivo</strong> lo saca. Enfocate en construir activos.'},
    {i:'<i class="ph ph-arrows-clockwise"></i>',t:'Interés compuesto',c:'"El octavo milagro del mundo." Empezar temprano vale más que invertir mucho tarde.'},
    {i:'<i class="ph ph-shield-check"></i>',t:'Fondo de emergencia primero',c:'Sin este fondo, cualquier imprevisto te fuerza a endeudarte. Es la base de todo plan financiero.'},
    {i:'<i class="ph ph-chart-bar"></i>',t:'ETFs Indexados y DCA',c:'Comprá un ETF de índice (SP500) en fecha fija cada mes. Simple, automático, efectivo.'},
    {i:'<i class="ph ph-credit-card"></i>',t:'Deuda buena vs mala',c:'<strong>Buena:</strong> financia activos que generan más de lo que cuesta. <strong>Mala:</strong> financia consumo sin retorno.'},
    {i:'<i class="ph ph-calendar"></i>',t:'Regla 24/48 horas',c:'Ante un gasto impulsivo, esperá. El 80% de los caprichos se olvidan tras una noche de sueño.'},
    {i:'<i class="ph ph-brain"></i>',t:'Págate primero',c:'Al cobrar, separar el ahorro ANTES de gastar. No lo que sobra: lo primero que sale.'},
    {i:'<i class="ph ph-lightbulb"></i>',t:'Tu mejor inversión: vos',c:'Educación y habilidades dan el mayor retorno posible. Un curso que sube tu ingreso 20% supera cualquier activo.'},
  ];
  setContent(`<div class="grid-2">${lessons.map(l=>`<div class="card"><div style="font-size:1.8rem;margin-bottom:8px">${l.i}</div><div class="fw-bold mb-2">${l.t}</div><div class="fs-sm text-2" style="line-height:1.6">${l.c}</div></div>`).join('')}</div>`);
}

function renderMas() {
  const items=[
    {icon:'<i class="ph ph-bank"></i>',label:'Cuentas',page:'cuentas'},{icon:'<i class="ph ph-clipboard-text"></i>',label:'Presupuesto',page:'presupuesto'},
    {icon:'<i class="ph ph-shield-check"></i>',label:'Fondo de Emergencia',page:'objetivos'},{icon:'<i class="ph ph-trend-up"></i>',label:'Inversiones',page:'inversiones'},
    {icon:'<i class="ph ph-credit-card"></i>',label:'Crédito y Deuda',page:'credito'},{icon:'<i class="ph ph-chart-bar"></i>',label:'Reportes',page:'reportes'},
    {icon:'<i class="ph ph-graduation-cap"></i>',label:'Educación',page:'educacion'},{icon:'<i class="ph ph-gear"></i>',label:'Configuración',page:'configuracion'},
  ];
  setContent(`<div class="card">${items.map(item=>`
    <div class="flex items-center gap-3" style="padding:14px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigate('${item.page}')">
      <span style="font-size:1.3rem;width:30px;text-align:center">${item.icon}</span>
      <span class="fw-bold">${item.label}</span>
      <span class="text-3" style="margin-left:auto">›</span>
    </div>`).join('')}</div>`);
}

async function renderConfiguracion() {
  setContent(`
    <div class="card mb-3">
      <div class="card-title">General</div>
      <form onsubmit="submitConfig(event)">
        <div class="form-group"><label>Moneda</label><select name="currency"><option value="ARS" ${settings.currency==='ARS'?'selected':''}>ARS — Peso Argentino</option><option value="USD" ${settings.currency==='USD'?'selected':''}>USD — Dólar</option></select></div>
        <div class="form-group"><label>Págate primero (%)</label><input name="pyf" type="number" value="${settings.payYourselfFirst||20}" min="0" max="100" inputmode="numeric"></div>
        <button class="btn btn-primary btn-block" type="submit">Guardar</button>
      </form>
    </div>
    <div class="card mb-3">
      <div class="card-title">Datos</div>
      <button class="btn btn-ghost btn-sm" onclick="exportData()"><i class="ph ph-download-simple"></i> Exportar JSON</button>
    </div>
    <div class="card">
      <button class="btn btn-danger btn-block" onclick="handleLogout()"><i class="ph ph-sign-out"></i> Cerrar sesión</button>
    </div>
  `);
}

window.submitConfig = async (e) => {
  e.preventDefault(); const fd=new FormData(e.target);
  settings.currency=fd.get('currency'); settings.payYourselfFirst=parseInt(fd.get('pyf'));
  await saveSettings(settings); alert('<i class="ph ph-check-circle"></i> Guardado');
};

window.exportData = async () => {
  const [txs,accounts,goals,cards] = await Promise.all([getTransactions(),getAccounts(),getGoals(),getCards()]);
  const blob=new Blob([JSON.stringify({txs,accounts,goals,cards,settings},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`financeos-${profile.uid.slice(0,6)}-backup.json`; a.click();
};

// ════════════════════════════════════════════════
// TRANSACTION FORM
// ════════════════════════════════════════════════
window.openNewTx = async (type='egreso', prefill=null) => {
  txState = { type, psychFilter: prefill?.psychFilter||null, cooldownHours: 0 };
  document.getElementById('modal-tx-title').textContent =
    {ingreso:'<<i class="ph ph-plus-circle"></i> Ingreso', egreso:'- Gasto', traslado:'⇄ Transferencia'}[type] || 'Transacción';
  await renderTxForm(prefill);
  openModal('modal-tx');
};

async function renderTxForm(prefill=null) {
  const accounts = await cachedAccounts();
  const cats = DEFAULT_CATS.filter(c => c.type===txState.type || txState.type==='traslado');
  const groups = {};
  cats.forEach(c => { (groups[c.macro]||=[]).push(c); });
  const catOpts = Object.entries(groups).map(([g,cs])=>
    `<optgroup label="${g}">${cs.map(c=>`<option value="${c.id}" ${prefill?.categoryId===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}</optgroup>`).join('');
  const accOpts = accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  const isEg = txState.type==='egreso';
  const isTr = txState.type==='traslado';

  document.getElementById('modal-tx-body').innerHTML = `
    <div class="type-tabs mb-3">
      <button class="type-tab ${txState.type==='ingreso'?'sel-ing':''}" onclick="changeTxType('ingreso')"><i class="ph ph-money"></i> Ingreso</button>
      <button class="type-tab ${txState.type==='egreso'?'sel-eg':''}" onclick="changeTxType('egreso')"><i class="ph ph-upload-simple"></i> Gasto</button>
      <button class="type-tab ${txState.type==='traslado'?'sel-tr':''}" onclick="changeTxType('traslado')"><i class="ph ph-arrows-clockwise"></i> Transferir</button>
    </div>
    <form onsubmit="submitTx(event)">
      <div class="form-group">
        <label>Monto</label>
        <div class="input-prefix">
          <span>${settings.currency==='USD'?'U$S':'$'}</span>
          <input name="amount" type="number" step="0.01" placeholder="0.00" inputmode="decimal"
            value="${prefill?.amount||''}" required autofocus style="font-size:1.4rem;font-weight:700;padding:14px">
        </div>
      </div>
      <div class="form-group"><label>Descripción (opcional)</label>
        <input name="description" placeholder="${isTr?'Ej: Paso a Mercado Pago':'Ej: Almuerzo...'}" value="${prefill?.description||''}"></div>
      ${!isTr?`<div class="form-group"><label>Categoría</label><select name="categoryId" required><option value="">— Seleccioná —</option>${catOpts}</select></div>`:''}
      <div class="form-group"><label>${isTr?'Cuenta origen':'Cuenta'}</label><select name="accountId" required><option value="">— Seleccioná —</option>${accOpts}</select></div>
      ${isTr?`<div class="form-group"><label>Cuenta destino</label><select name="toAccountId" required><option value="">— Seleccioná —</option>${accOpts}</select></div>`:''}
      <div class="form-group"><label>Fecha</label><input name="date" type="date" value="${today()}"></div>
      ${isEg ? `
      <div class="form-group"><label>¿Qué tipo de gasto?</label>
        <div class="psych-row">
          ${[['necesidad','<i class="ph ph-check-circle"></i>','Necesidad','Indispensable'],['gusto','<i class="ph ph-thumbs-up"></i>','Gusto','Lo querés'],['capricho','<i class="ph ph-warning-circle"></i>','Capricho','Impulso']].map(([v,e,n,d])=>`
            <div class="psych-opt ${txState.psychFilter===v?'sel':''}" onclick="setPsych('${v}')">
              <span class="psych-emoji">${e}</span><div class="psych-name">${n}</div><div class="psych-sub">${d}</div>
            </div>`).join('')}
        </div>
        ${txState.psychFilter==='capricho'?`
        <div class="alert alert-warning">⏰ <div><strong>¡Pausa!</strong> Temporizador de reflexión:
          <div class="flex gap-2 mt-2">
            <button type="button" class="btn btn-ghost btn-sm ${txState.cooldownHours===24?'btn-primary':''}" onclick="setCooldown(24)">24 hs</button>
            <button type="button" class="btn btn-ghost btn-sm ${txState.cooldownHours===48?'btn-primary':''}" onclick="setCooldown(48)">48 hs</button>
            <button type="button" class="btn btn-ghost btn-sm ${txState.cooldownHours===0?'btn-primary':''}" onclick="setCooldown(0)">Sin espera</button>
          </div>
        </div></div>`:''}`:''}
      <button type="submit" class="btn btn-${txState.type==='ingreso'?'success':txState.type==='traslado'?'primary':'danger'} btn-block" style="min-height:50px;font-size:1rem;margin-top:4px">
        ${txState.cooldownHours>0?`⏰ Guardar (esperar ${txState.cooldownHours}h)`:
          txState.type==='ingreso'?'<i class="ph ph-money"></i> Registrar ingreso':
          txState.type==='traslado'?'<i class="ph ph-arrows-clockwise"></i> Registrar transferencia':'<i class="ph ph-upload-simple"></i> Registrar gasto'}
      </button>
    </form>`;
}

window.changeTxType = (t) => { txState.type=t; txState.psychFilter=null; txState.cooldownHours=0; renderTxForm(); document.getElementById('modal-tx-title').textContent={ingreso:'<<i class="ph ph-plus-circle"></i> Ingreso',egreso:'- Gasto',traslado:'⇄ Transferencia'}[t]; };
window.setPsych = (v) => { txState.psychFilter=v; if(v!=='capricho') txState.cooldownHours=0; renderTxForm(); };
window.setCooldown = (h) => { txState.cooldownHours=h; renderTxForm(); };

window.submitTx = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const cooldownUntil = txState.cooldownHours > 0
    ? new Date(Date.now() + txState.cooldownHours * 3_600_000).toISOString() : null;
  await addTransaction({
    date: fd.get('date') || today(), type: txState.type,
    amount: parseFloat(fd.get('amount')), description: fd.get('description'),
    categoryId: fd.get('categoryId')||null, accountId: fd.get('accountId'),
    toAccountId: fd.get('toAccountId')||null, psychFilter: txState.psychFilter,
    isPendingCooldown: txState.cooldownHours > 0, cooldownUntil,
  });
  closeModal('modal-tx'); dismissVoiceCard(); clearCache();
  navigate(currentPage);
};

window.confirmCooldown = async (id) => {
  await updateTransaction(id, { isPendingCooldown: false, cooldownUntil: null });
  clearCache(); renderInicio();
};
window.cancelTx = async (id) => {
  await deleteTransaction(id); clearCache(); renderInicio();
};

// ════════════════════════════════════════════════
// VOICE BRIDGE
// ════════════════════════════════════════════════
window.toggleVoice = toggleVoice;
window.dismissVoiceCard = dismissVoiceCard;
window.confirmVoiceTx = async () => {
  const parsed = getVoiceParsed();
  if (!parsed) return;
  dismissVoiceCard();
  await openNewTx(parsed.type === 'ahorro' ? 'egreso' : parsed.type, {
    ...parsed,
    categoryId: parsed.type === 'ahorro' ? 'gas-ahorro' : parsed.categoryId,
  });
};
window.editVoiceTx = async () => {
  const parsed = getVoiceParsed();
  dismissVoiceCard();
  if (parsed) await openNewTx(parsed.type === 'ahorro' ? 'egreso' : parsed.type, parsed);
};

// ════════════════════════════════════════════════
// TX LIST
// ════════════════════════════════════════════════
function renderTxList(txs) {
  if (!txs?.length) return `<div class="empty-state"><div class="es-icon"><i class="ph ph-clipboard-text"></i></div>Sin movimientos<br><button class="btn btn-primary mt-3" onclick="openNewTx('egreso')"><<i class="ph ph-plus-circle"></i> Registrar</button></div>`;
  const groups = {};
  txs.forEach(t => { (groups[t.date]||=[]).push(t); });
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,items])=>`
    <div class="tx-date-group">${fmtDateFull(date)}</div>
    ${items.map(t => {
      const cat = DEFAULT_CATS.find(c=>c.id===t.categoryId);
      const isTr = t.type==='traslado';
      return `<div class="tx-item" onclick="showTxDetail('${t.id}')">
        <div class="tx-icon ${t.type==='ingreso'?'ing':isTr?'tr':'eg'}">${cat?.icon||isTr?'<i class="ph ph-arrows-clockwise"></i>':'<i class="ph ph-package"></i>'}</div>
        <div class="tx-info">
          <div class="tx-name">${t.description||(cat?.name||'Sin descripción')}</div>
          <div class="tx-cat">${isTr?'Traslado':(cat?.macro||'—')} ${t.psychFilter?'· '+{necesidad:'<i class="ph ph-check-circle"></i>',gusto:'<i class="ph ph-thumbs-up"></i>',capricho:'<i class="ph ph-warning-circle"></i>'}[t.psychFilter]:''}</div>
        </div>
        <div class="tx-amount" style="color:${t.type==='ingreso'?'var(--success)':isTr?'var(--info)':'var(--danger)'}">
          ${t.type==='ingreso'?'<<i class="ph ph-plus-circle"></i>':isTr?'⇄':'-'}${fmt(t.amount)}
        </div>
      </div>`;
    }).join('')}`).join('');
}

window.showTxDetail = async (id) => {
  const txs = await getTransactions({ limit: 200 });
  const t = txs.find(x => x.id === id); if (!t) return;
  const cat = DEFAULT_CATS.find(c=>c.id===t.categoryId);
  showGenericModal('Detalle', `
    <div class="text-center mb-4">
      <div style="font-size:2rem">${cat?.icon||'<i class="ph ph-package"></i>'}</div>
      <div class="fw-800 fs-lg mt-2" style="color:${t.type==='ingreso'?'var(--success)':'var(--danger)'}">${t.type==='ingreso'?'<<i class="ph ph-plus-circle"></i>':'-'}${fmt(t.amount)}</div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--r-sm);padding:14px;margin-bottom:14px">
      ${[['Descripción',t.description||'—'],['Categoría',cat?cat.icon+' '+cat.name:'—'],['Tipo',t.type],['Fecha',fmtDateFull(t.date)]].map(([l,v])=>`<div class="flex justify-between fs-sm mb-2"><span class="text-2">${l}</span><span class="fw-bold">${v}</span></div>`).join('')}
    </div>
    <button class="btn btn-danger btn-block" onclick="deleteTxFromDetail('${t.id}')"><i class="ph ph-trash"></i> Eliminar</button>`);
};
window.deleteTxFromDetail = async (id) => {
  if (!confirm('¿Eliminar esta transacción?')) return;
  await deleteTransaction(id); closeModal('modal-generic'); clearCache(); navigate(currentPage);
};

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════
function setContent(html) { document.getElementById('content').innerHTML = html; }

function showGenericModal(title, body) {
  document.getElementById('modal-generic-title').textContent = title;
  document.getElementById('modal-generic-body').innerHTML = body;
  openModal('modal-generic');
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

window.openModal  = openModal;
window.closeModal = closeModal;
window.navigate   = navigate;

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

function getMonthOptions(selected = monthKey()) {
  let o = '';
  for (let i=0;i<13;i++) {
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const ym=monthKey(d);
    o+=`<option value="${ym}" ${ym===selected?'selected':''}>${d.toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</option>`;
  }
  return o;
}

// ── KICK OFF ─────────────────────────────────────────
init().catch(err => {
  console.error('Agent init error:', err);
  document.getElementById('loading-screen').innerHTML = `
    <div style="text-align:center;padding:24px;color:#f1f5f9">
      <div style="font-size:2rem;margin-bottom:12px"><i class="ph ph-warning-circle"></i></div>
      <div style="font-weight:700;margin-bottom:8px">Error al cargar</div>
      <div style="font-size:.82rem;color:#94a3b8;margin-bottom:16px">${err.message}</div>
      <button onclick="location.reload()" style="padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">Reintentar</button>
    </div>`;
});
