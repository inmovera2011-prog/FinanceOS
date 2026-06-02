// ═══════════════════════════════════════════════
// USER-APP.JS — Dashboard del Usuario
// ═══════════════════════════════════════════════
import { auth, requireRole, logout }        from './auth.js';
import { ViewingUser, uuid,
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
         fmt, fmtShort }                   from './constants.js';

// ── Estado ───────────────────────────────────────────
let profile    = null;
let habs       = {};
let settings   = { ...DEFAULT_SETTINGS };
let homePeriod = 'mes';
let currentPage = 'inicio';
let activeCharts = {};
let txState    = { type:'egreso', psychFilter:null, cooldownHours:0 };
let _cache     = { txs:null, accounts:null };

function clearCache() { _cache = { txs:null, accounts:null }; }
async function cachedTxs()      { if(!_cache.txs)      _cache.txs      = await getMonthTransactions(monthKey()); return _cache.txs; }
async function cachedAccounts() { if(!_cache.accounts) _cache.accounts = await getAccounts();                   return _cache.accounts; }

// ── INIT ─────────────────────────────────────────────
async function init() {
  profile = await requireRole('user');
  if (!profile) return;

  [habs, settings] = await Promise.all([ getHabilidades(profile.uid), getSettings() ]);

  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('layout').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');

  const nameEl = document.getElementById('user-name-label');
  if (nameEl) nameEl.textContent = profile.name || 'Mi cuenta';
  const av = document.getElementById('user-avatar');
  if (av) av.textContent = (profile.name || 'U')[0].toUpperCase();

  applyHabilidades();
  initVoice(parsed => openNewTx(parsed.type === 'ahorro' ? 'egreso' : parsed.type, parsed));

  document.querySelectorAll('[data-page]').forEach(el =>
    el.addEventListener('click', () => navigate(el.dataset.page))
  );
  navigate('inicio');
}

function applyHabilidades() {
  HABILIDADES.forEach(h => {
    document.querySelectorAll(`[data-hab="${h.id}"]`).forEach(el =>
      el.classList.toggle('hidden', !habs[h.id])
    );
  });
}

// ── ROUTING ──────────────────────────────────────────
function navigate(page) {
  const freePages = ['inicio','cuentas','mas','configuracion'];
  if (!freePages.includes(page)) {
    const hab = HABILIDADES.find(h => h.page === page);
    if (hab && !habs[hab.id]) { showLockedPage(hab); return; }
  }
  destroyCharts(); clearCache(); currentPage = page;
  document.querySelectorAll('[data-page]').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  const titles = { inicio:'',movimientos:'Movimientos',cuentas:'Cuentas',
    presupuesto:'Presupuesto',objetivos:'Fondo de Emergencia',
    inversiones:'Inversiones',credito:'Crédito y Deuda',
    reportes:'Reportes',educacion:'Educación',configuracion:'Configuración',mas:'Más' };
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

function destroyCharts() { Object.values(activeCharts).forEach(c=>{try{c.destroy()}catch{}}); activeCharts={}; }
function showLockedPage(hab) {
  setContent(`<div class="empty-state" style="padding:60px 20px">
    <div class="es-icon">🔒</div>
    <div class="fw-bold mb-2">${hab.icon} ${hab.name}</div>
    <div class="fs-sm text-2 mb-3">Este módulo no está habilitado. Contactá al administrador para activarlo.</div>
  </div>`);
}

// ════════════════════════════════════════════════
// INICIO
// ════════════════════════════════════════════════
async function renderInicio() {
  setContent('<div class="empty-state"><div class="spinner" style="width:32px;height:32px;margin:0 auto"></div></div>');
  const [txsAll, accounts, goals] = await Promise.all([getTransactions(), cachedAccounts(), getGoals()]);
  const totalBal = accounts.reduce((s,a) => s + calcAccountBalance(a, txsAll), 0);
  const now = new Date();

  let periodTxs, periodData;
  if (homePeriod==='hoy') {
    periodTxs  = txsAll.filter(t => t.date===today());
    periodData = calcPeriodTotals(periodTxs, DEFAULT_CATS);
  } else if (homePeriod==='mes') {
    periodTxs  = txsAll.filter(t => t.date.startsWith(monthKey()));
    periodData = calcPeriodTotals(periodTxs, DEFAULT_CATS);
  } else {
    periodTxs  = txsAll.filter(t => t.date.startsWith(yearKey()));
    periodData = calcPeriodTotals(periodTxs, DEFAULT_CATS);
  }

  const emGoal = goals.find(g=>g.type==='emergency_fund');
  const emPct  = emGoal ? Math.min(100,(emGoal.currentAmount/emGoal.targetAmount)*100) : 0;
  const pending = txsAll.filter(t=>t.isPendingCooldown && new Date(t.cooldownUntil)>new Date());
  const netoColor = periodData.neto>=0?'var(--success)':'var(--danger)';

  setContent(`
    <div class="hero mb-3">
      <div class="hero-label">Patrimonio total</div>
      <div class="hero-amount">${fmt(totalBal, settings.currency)}</div>
      <div class="hero-sub">${accounts.length} cuenta(s)</div>
      <div class="hero-row">
        <div class="hero-stat"><div class="hero-stat-val text-success">+${fmtShort(periodData.ingresos)}</div><div class="hero-stat-label">Ingresos</div></div>
        <div class="hero-stat"><div class="hero-stat-val text-danger">-${fmtShort(periodData.egresos)}</div><div class="hero-stat-label">Gastos</div></div>
        <div class="hero-stat"><div class="hero-stat-val" style="color:${netoColor}">${periodData.neto>=0?'+':''}${fmtShort(periodData.neto)}</div><div class="hero-stat-label">Neto</div></div>
      </div>
    </div>

    <div class="period-tabs mb-3">
      <button class="period-tab ${homePeriod==='hoy'?'active':''}" onclick="setPeriod('hoy')">Hoy</button>
      <button class="period-tab ${homePeriod==='mes'?'active':''}" onclick="setPeriod('mes')">Este mes</button>
      <button class="period-tab ${homePeriod==='año'?'active':''}" onclick="setPeriod('año')">Este año</button>
    </div>

    ${pending.length?`<div class="alert alert-warning mb-3">⏰ <div><strong>${pending.length} gasto(s) en reflexión</strong>
      ${pending.map(t=>`<div class="flex justify-between items-center mt-2" style="background:#00000020;border-radius:8px;padding:8px 10px">
        <span class="fs-sm">${t.description||'Sin descripción'} — ${fmt(t.amount)}</span>
        <div class="flex gap-2">
          <button class="btn btn-success btn-sm" onclick="confirmCooldown('${t.id}')">✓</button>
          <button class="btn btn-danger btn-sm" onclick="cancelTx('${t.id}')">✕</button>
        </div></div>`).join('')}</div></div>`:''}

    <div class="quick-actions mb-3">
      <button class="qa-btn qa-ingreso" onclick="openNewTx('ingreso')"><span style="font-size:1.2rem">💰</span>+ Ingreso</button>
      <button class="qa-btn qa-egreso" onclick="openNewTx('egreso')"><span style="font-size:1.2rem">📤</span>+ Gasto</button>
      <button class="qa-btn qa-traslado" onclick="openNewTx('traslado')">🔄 Transferir entre cuentas</button>
    </div>

    ${homePeriod==='hoy'?`
    <div class="grid-2 mb-3">
      <div class="kpi ${periodData.neto>=0?'green':'red'}"><div class="kpi-label">Balance de hoy</div><div class="kpi-value">${fmtShort(periodData.neto)}</div><div class="kpi-sub">${periodTxs.length} movimiento(s)</div></div>
      <div class="kpi blue"><div class="kpi-label">Gastos hoy</div><div class="kpi-value">${fmtShort(periodData.egresos)}</div><div class="kpi-icon">📤</div></div>
    </div>
    <div class="alert alert-info">💡 Registrá cada gasto del día, por pequeño que sea. El control empieza en los detalles.</div>`:''}

    ${homePeriod==='mes' && emGoal?`
    <div class="card mb-3">
      <div class="card-header"><span class="card-title">🛡️ Fondo de Emergencia</span><button class="btn btn-ghost btn-sm" onclick="navigate('objetivos')">→</button></div>
      <div class="flex justify-between fs-sm mb-2"><span>${fmt(emGoal.currentAmount)}</span><span class="text-2">${fmt(emGoal.targetAmount)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${emPct}%;background:${emPct>=100?'var(--success)':emPct>50?'var(--warning)':'var(--danger)'}"></div></div>
      <div class="fs-xs text-2 mt-2">${emPct.toFixed(1)}% — ${emGoal.months||6} meses de gastos</div>
    </div>`:''}

    ${homePeriod==='año'?`
    <div class="grid-2 mb-3">
      <div class="kpi green"><div class="kpi-label">Ingresos año</div><div class="kpi-value">${fmtShort(periodData.ingresos)}</div></div>
      <div class="kpi red"><div class="kpi-label">Gastos año</div><div class="kpi-value">${fmtShort(periodData.egresos)}</div></div>
      <div class="kpi blue"><div class="kpi-label">Ahorro año</div><div class="kpi-value">${fmtShort(periodData.ahorros)}</div></div>
      <div class="kpi purple"><div class="kpi-label">Neto año</div><div class="kpi-value">${fmtShort(periodData.neto)}</div></div>
    </div>`:''}

    <div class="card">
      <div class="card-header"><span class="card-title">Últimos movimientos</span><button class="btn btn-ghost btn-sm" onclick="navigate('movimientos')">Ver todo →</button></div>
      ${renderTxList(periodTxs.slice(0,12))}
    </div>
  `);
}

window.setPeriod = (p) => { homePeriod=p; renderInicio(); };

// ════════════════════════════════════════════════
// MOVIMIENTOS
// ════════════════════════════════════════════════
async function renderMovimientos() {
  document.getElementById('topbar-action').innerHTML = `<button class="btn btn-primary btn-sm" onclick="openNewTx()">+ Nuevo</button>`;
  const ym  = monthKey();
  const txs = await getMonthTransactions(ym);
  setContent(`
    <div class="card mb-3">
      <div class="flex gap-2 mb-3">
        <select id="filter-month" onchange="reloadMovimientos(this.value)" style="flex:1">${getMonthOptions(ym)}</select>
        <select id="filter-type" onchange="reloadMovimientos()" style="width:110px">
          <option value="">Todos</option><option value="ingreso">Ingresos</option>
          <option value="egreso">Gastos</option><option value="traslado">Traslados</option>
        </select>
      </div>
      ${txSummary(txs)}
    </div>
    <div class="card" id="tx-list-wrap">${renderTxList(txs)}</div>
  `);
}

window.reloadMovimientos = async (ym) => {
  const selMonth = document.getElementById('filter-month')?.value || monthKey();
  const selType  = document.getElementById('filter-type')?.value || '';
  const txs = await getMonthTransactions(ym || selMonth);
  const filtered = selType ? txs.filter(t => t.type===selType) : txs;
  document.getElementById('tx-list-wrap').innerHTML = renderTxList(filtered);
};

function txSummary(txs) {
  let ing=0, eg=0;
  txs.forEach(t=>{if(t.type==='ingreso')ing+=t.amount;else if(t.type==='egreso')eg+=t.amount;});
  return `<div class="grid-2" style="gap:8px">
    <div class="kpi green" style="padding:10px"><div class="kpi-label">Ingresos</div><div class="kpi-value" style="font-size:1.1rem">${fmt(ing)}</div></div>
    <div class="kpi red" style="padding:10px"><div class="kpi-label">Gastos</div><div class="kpi-value" style="font-size:1.1rem">${fmt(eg)}</div></div>
  </div>`;
}

// ════════════════════════════════════════════════
// CUENTAS
// ════════════════════════════════════════════════
async function renderCuentas() {
  document.getElementById('topbar-action').innerHTML = `<button class="btn btn-primary btn-sm" onclick="openNewAccount()">+ Cuenta</button>`;
  const [accounts, txsAll] = await Promise.all([getAccounts(), getTransactions()]);
  const total = accounts.reduce((s,a) => s+calcAccountBalance(a, txsAll), 0);
  setContent(`
    <div class="hero mb-3" style="background:linear-gradient(135deg,#134e4a,#0f766e)">
      <div class="hero-label">Patrimonio total</div>
      <div class="hero-amount">${fmt(total)}</div>
      <div class="hero-sub">${accounts.length} cuenta(s)</div>
    </div>
    ${!accounts.length ? `<div class="empty-state"><div class="es-icon">🏦</div><button class="btn btn-primary mt-3" onclick="openNewAccount()">Crear cuenta</button></div>` :
      accounts.map(a => {
        const type = ACCOUNT_TYPES.find(t=>t.id===a.type);
        const bal  = calcAccountBalance(a, txsAll);
        return `<div class="card mb-3" style="border-left:4px solid ${type?.color||'var(--primary)'}">
          <div class="flex items-center justify-between mb-1">
            <div><span style="font-size:1rem">${type?.icon||'🏦'}</span> <span class="fw-bold">${a.name}</span></div>
            <button class="btn btn-ghost btn-sm" onclick="handleDeleteAccount('${a.id}')">🗑</button>
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
      <div class="form-group"><label>Nombre</label><input name="name" placeholder="Ej: Cuenta sueldo" required></div>
      <div class="form-group"><label>Tipo</label><select name="type">${ACCOUNT_TYPES.map(t=>`<option value="${t.id}">${t.icon} ${t.label}</option>`).join('')}</select></div>
      <div class="form-group"><label>Saldo inicial</label><div class="input-prefix"><span>$</span><input name="balance" type="number" step="0.01" value="0" inputmode="decimal"></div></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Crear</button>
    </form>`);
};
window.submitNewAccount = async (e) => {
  e.preventDefault(); const fd=new FormData(e.target);
  await saveAccount({name:fd.get('name'),type:fd.get('type'),currency:'ARS',initialBalance:parseFloat(fd.get('balance'))||0,createdAt:today()});
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
  const totals  = calcPeriodTotals(txs, DEFAULT_CATS);
  const catTot  = calcCategoryTotals(txs, DEFAULT_CATS);
  const pyf     = totals.ingresos*(settings.payYourselfFirst||20)/100;
  const rows    = {Necesidades:[],  'Estilo de vida':[], 'Ahorro/Inversión':[], Deuda:[], Varios:[]};
  let needsSpent=0,wantsSpent=0,savSpent=0;
  Object.entries(catTot).forEach(([cid,amt])=>{
    const cat=DEFAULT_CATS.find(c=>c.id===cid);if(!cat)return;
    if(cat.macro==='Necesidades')needsSpent+=amt;
    else if(cat.macro==='Estilo de vida')wantsSpent+=amt;
    else if(cat.macro==='Ahorro/Inversión')savSpent+=amt;
    if(rows[cat.macro])rows[cat.macro].push({cat,amt});else rows['Varios'].push({cat,amt});
  });
  setContent(`
    ${settings.payYourselfFirst>0?`<div class="alert alert-success mb-3">💡 <strong>Págate primero:</strong> Separá ${fmt(pyf)} para ahorro ANTES de gastar.</div>`:''}
    ${totals.ingresos===0?`<div class="alert alert-warning mb-3">⚠️ Sin ingresos este mes. Registrá tus ingresos primero.</div>`:''}
    ${budgetBlock('🏠 Necesidades',needsSpent,totals.ingresos*(settings.needs||50)/100,settings.needs||50,rows['Necesidades'],'var(--info)')}
    ${budgetBlock('🎬 Estilo de vida',wantsSpent,totals.ingresos*(settings.wants||30)/100,settings.wants||30,rows['Estilo de vida'],'var(--primary)')}
    ${budgetBlock('🏦 Ahorro/Inversión',savSpent,totals.ingresos*(settings.savings||20)/100,settings.savings||20,rows['Ahorro/Inversión'],'var(--success)')}
    <button class="btn btn-ghost btn-block mt-3" onclick="openBudgetConfig()">⚙️ Ajustar porcentajes</button>
  `);
}

function budgetBlock(title,spent,target,pct,rows,color){
  const over=spent>target;const ppct=target?Math.min(100,(spent/target)*100):0;
  return `<div class="card mb-3">
    <div class="card-header"><span class="card-title">${title}</span><span class="badge ${over?'badge-red':'badge-green'}">${pct}%</span></div>
    <div class="flex justify-between fs-sm mb-2"><strong>${fmt(spent)}</strong><span class="text-2">meta ${fmt(target)}</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${ppct}%;background:${over?'var(--danger)':color}"></div></div>
    ${over?`<div class="alert alert-danger mt-3 fs-sm">⚠️ Excedido por ${fmt(spent-target)}</div>`:''}
    ${rows.length?`<hr>${rows.map(r=>`<div class="flex justify-between fs-sm mb-2"><span>${r.cat.icon} ${r.cat.name}</span><span>${fmt(r.amt)}</span></div>`).join('')}`:''}
  </div>`;
}

window.openBudgetConfig = () => {
  showGenericModal('⚙️ Porcentajes', `
    <form onsubmit="submitBudgetConfig(event)">
      <div class="form-group"><label>🏠 Necesidades (%)</label><input name="needs" type="number" value="${settings.needs||50}" inputmode="numeric"></div>
      <div class="form-group"><label>🎬 Estilo de vida (%)</label><input name="wants" type="number" value="${settings.wants||30}" inputmode="numeric"></div>
      <div class="form-group"><label>🏦 Ahorro/Inversión (%)</label><input name="savings" type="number" value="${settings.savings||20}" inputmode="numeric"></div>
      <div class="form-group"><label>💡 Págate primero (%)</label><input name="pyf" type="number" value="${settings.payYourselfFirst||20}" inputmode="numeric"></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};
window.submitBudgetConfig = async (e) => {
  e.preventDefault(); const fd=new FormData(e.target);
  settings.needs=parseInt(fd.get('needs'));settings.wants=parseInt(fd.get('wants'));
  settings.savings=parseInt(fd.get('savings'));settings.payYourselfFirst=parseInt(fd.get('pyf'));
  await saveSettings(settings); closeModal('modal-generic'); renderPresupuesto();
};

// ════════════════════════════════════════════════
// OBJETIVOS
// ════════════════════════════════════════════════
async function renderObjetivos() {
  const goals = await getGoals();
  const emGoal=goals.find(g=>g.type==='emergency_fund');
  const emPct=emGoal?Math.min(100,(emGoal.currentAmount/emGoal.targetAmount)*100):0;
  setContent(`
    <div class="card mb-3">
      <div class="card-header"><span class="card-title">🛡️ Fondo de Emergencia</span><button class="btn btn-ghost btn-sm" onclick="openEmFund()">⚙️</button></div>
      ${emGoal?`
        <div style="font-size:1.8rem;font-weight:900;color:${emPct>=100?'var(--success)':'var(--warning)'};margin-bottom:6px">${fmt(emGoal.currentAmount)}</div>
        <div class="fs-sm text-2 mb-3">Meta: ${fmt(emGoal.targetAmount)} (${emGoal.months||6} meses)</div>
        <div class="progress-bar" style="height:12px"><div class="progress-fill" style="width:${emPct}%;background:${emPct>=100?'var(--success)':emPct>50?'var(--warning)':'var(--danger)'}"></div></div>
        <div class="flex justify-between fs-xs text-2 mt-2"><span>${emPct.toFixed(1)}%</span><span>Falta ${fmt(Math.max(0,emGoal.targetAmount-emGoal.currentAmount))}</span></div>
        ${emPct>=100?`<div class="alert alert-success mt-3 fs-sm">✅ ¡Completado! Mantené este dinero en cuenta remunerada o FCI.</div>`:`<div class="alert alert-warning mt-3 fs-sm">⚠️ Mantenelo en activos <strong>líquidos</strong>.</div>`}
        <button class="btn btn-success btn-block mt-3" onclick="addToEmFund('${emGoal.id}',${emGoal.currentAmount})">+ Agregar fondos</button>
      `:`<div class="empty-state"><div class="es-icon">🛡️</div><button class="btn btn-primary mt-3" onclick="openEmFund()">Configurar</button></div>`}
    </div>
    <div class="card mb-3">
      <div class="card-header"><span class="card-title">Objetivos</span><button class="btn btn-ghost btn-sm" onclick="openNewGoal()">+ Agregar</button></div>
      ${goals.filter(g=>g.type!=='emergency_fund').map(g=>{
        const pct=Math.min(100,(g.currentAmount/g.targetAmount)*100);
        return `<div class="mb-3">
          <div class="progress-label"><span class="fw-bold">🎯 ${g.name}</span><span>${fmt(g.currentAmount)} / ${fmt(g.targetAmount)}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--primary)"></div></div>
          ${g.targetDate?`<div class="fs-xs text-2 mt-1">Target: ${fmtDate(g.targetDate)}</div>`:''}
        </div>`;}).join('')||'<div class="text-2 fs-sm">Sin objetivos adicionales</div>'}
    </div>
  `);
}

window.openEmFund = ()=>{
  showGenericModal('🛡️ Fondo de Emergencia',`
    <form onsubmit="submitEmFund(event)">
      <div class="form-group"><label>Meses</label><select name="months">${[3,6,12].map(m=>`<option value="${m}" ${settings.emergencyMonths===m?'selected':''}>${m} meses</option>`).join('')}</select></div>
      <div class="form-group"><label>Gasto mensual promedio</label><div class="input-prefix"><span>$</span><input name="avg" type="number" step="0.01" inputmode="decimal"></div></div>
      <div class="form-group"><label>Acumulado actualmente</label><div class="input-prefix"><span>$</span><input name="current" type="number" step="0.01" value="0" inputmode="decimal"></div></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};
window.submitEmFund = async (e)=>{
  e.preventDefault();const fd=new FormData(e.target);const months=parseInt(fd.get('months'));const avg=parseFloat(fd.get('avg'))||0;
  settings.emergencyMonths=months;await saveSettings(settings);
  const goals=await getGoals();const em=goals.find(g=>g.type==='emergency_fund');
  await saveGoal({id:em?.id,type:'emergency_fund',name:'Fondo de Emergencia',targetAmount:avg*months,currentAmount:parseFloat(fd.get('current'))||0,months,createdAt:today()});
  closeModal('modal-generic');renderObjetivos();
};
window.addToEmFund = async (id,current)=>{
  const amt=parseFloat(prompt(`¿Cuánto agregás? (Actual: ${fmt(current)})`));
  if(!isNaN(amt)&&amt>0){await saveGoal({id,currentAmount:current+amt});renderObjetivos();}
};
window.openNewGoal = ()=>{
  showGenericModal('🎯 Nuevo objetivo',`
    <form onsubmit="submitGoal(event)">
      <div class="form-group"><label>Nombre</label><input name="name" required></div>
      <div class="form-row">
        <div class="form-group"><label>Meta</label><input name="target" type="number" step="0.01" required inputmode="decimal"></div>
        <div class="form-group"><label>Acumulado</label><input name="current" type="number" step="0.01" value="0" inputmode="decimal"></div>
      </div>
      <div class="form-group"><label>Fecha objetivo</label><input name="date" type="date"></div>
      <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
    </form>`);
};
window.submitGoal = async (e)=>{
  e.preventDefault();const fd=new FormData(e.target);
  await saveGoal({type:'custom',name:fd.get('name'),targetAmount:parseFloat(fd.get('target')),currentAmount:parseFloat(fd.get('current'))||0,targetDate:fd.get('date'),createdAt:today()});
  closeModal('modal-generic');renderObjetivos();
};

// ════════════════════════════════════════════════
// INVERSIONES
// ════════════════════════════════════════════════
function renderInversiones(){
  setContent(`
    <div class="card mb-3">
      <div class="card-title">📈 Interés Compuesto</div>
      <form id="compound-form" onsubmit="calcCompound(event)">
        <div class="form-row">
          <div class="form-group"><label>Capital inicial</label><div class="input-prefix"><span>$</span><input name="capital" type="number" value="100000" inputmode="decimal"></div></div>
          <div class="form-group"><label>Aporte mensual</label><div class="input-prefix"><span>$</span><input name="monthly" type="number" value="10000" inputmode="decimal"></div></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tasa anual (%)</label><input name="rate" type="number" value="12" step="0.5" inputmode="decimal"></div>
          <div class="form-group"><label>Años</label><input name="years" type="number" value="30" min="1" max="50" inputmode="numeric"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">Calcular</button>
      </form>
      <div id="compound-result" class="mt-3"></div>
      <div class="chart-wrap h240 mt-3"><canvas id="chart-compound"></canvas></div>
    </div>
    <div class="card mb-3">
      <div class="card-title">🎯 Cartera 80/20</div>
      <div class="chart-wrap h180"><canvas id="chart-pareto"></canvas></div>
      <div class="mt-3">
        ${[{pct:40,l:'ETF SP500',c:'#10b981',i:'📊'},{pct:25,l:'Bonos/Renta fija',c:'#38bdf8',i:'📋'},{pct:15,l:'FCI/Cta. remunerada',c:'#6366f1',i:'🏦'},{pct:10,l:'Cripto',c:'#f59e0b',i:'₿'},{pct:5,l:'Inmuebles/REITs',c:'#8b5cf6',i:'🏠'},{pct:5,l:'Alternativos',c:'#ef4444',i:'🚀'}]
        .map(r=>`<div class="flex items-center gap-2 mb-2"><span style="width:20px">${r.i}</span><span class="fs-sm" style="flex:1">${r.l}</span><div style="width:50px;height:5px;background:var(--surface2);border-radius:3px"><div style="width:${r.pct}%;height:100%;background:${r.c};border-radius:3px"></div></div><span class="fs-sm fw-bold" style="width:28px;text-align:right">${r.pct}%</span></div>`).join('')}
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-title">📉 Impacto de la inflación</div>
      <form id="inflation-form" onsubmit="calcInflation(event)">
        <div class="form-row">
          <div class="form-group"><label>Monto</label><div class="input-prefix"><span>$</span><input name="amount" type="number" value="1000000" inputmode="decimal"></div></div>
          <div class="form-group"><label>Inflación anual (%)</label><input name="inflation" type="number" value="60" inputmode="decimal"></div>
        </div>
        <div class="form-group"><label>Años</label><input name="years" type="number" value="5" min="1" max="30" inputmode="numeric"></div>
        <button class="btn btn-primary btn-block" type="submit">Ver impacto</button>
      </form>
      <div id="inflation-result" class="mt-3"></div>
    </div>
  `);
  setTimeout(()=>{
    renderParetoChart();
    calcCompound({preventDefault:()=>{},target:document.getElementById('compound-form')});
  },50);
}

window.calcCompound=(e)=>{
  e.preventDefault();const fd=new FormData(e.target);
  const C=parseFloat(fd.get('capital')||100000),M=parseFloat(fd.get('monthly')||10000),r=parseFloat(fd.get('rate')||12)/100/12,Y=parseInt(fd.get('years')||30),n=Y*12;
  const compound=C*Math.pow(1+r,n)+M*((Math.pow(1+r,n)-1)/r);
  const simple=C+C*(r*12)*Y+M*n;
  document.getElementById('compound-result').innerHTML=`
    <div class="grid-2" style="gap:8px">
      <div class="kpi green" style="padding:12px"><div class="kpi-label">Compuesto</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(compound)}</div></div>
      <div class="kpi amber" style="padding:12px"><div class="kpi-label">Simple</div><div class="kpi-value" style="font-size:1.1rem">${fmtShort(simple)}</div></div>
    </div>
    <div class="alert alert-success mt-2 fs-sm">💡 El compuesto genera <strong>${fmtShort(compound-simple)}</strong> extra en ${Y} años.</div>`;
  if(activeCharts.compound){activeCharts.compound.destroy();delete activeCharts.compound;}
  const ctx=document.getElementById('chart-compound');if(!ctx)return;
  const labels=[],comp=[],simp=[],contrib=[];
  for(let yr=0;yr<=Y;yr++){const nn=yr*12;labels.push(yr+'a');
    comp.push(+(C*Math.pow(1+r,nn)+M*((Math.pow(1+r,nn)-1)/r)).toFixed(0));
    simp.push(+(C+C*(r*12)*yr+M*nn).toFixed(0));contrib.push(C+M*nn);}
  activeCharts.compound=new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Compuesto',data:comp,borderColor:'#10b981',backgroundColor:'#10b98115',fill:true,tension:.4,borderWidth:2,pointRadius:0},
    {label:'Simple',data:simp,borderColor:'#f59e0b',backgroundColor:'transparent',borderDash:[5,5],tension:.4,borderWidth:2,pointRadius:0},
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},scales:{x:{ticks:{color:'#64748b',font:{size:9},maxTicksLimit:8},grid:{color:'#33415566'}},y:{ticks:{color:'#64748b',font:{size:9},callback:v=>fmtShort(v)},grid:{color:'#33415566'}}}}});
};
function renderParetoChart(){
  const ctx=document.getElementById('chart-pareto');if(!ctx)return;
  if(activeCharts.pareto){activeCharts.pareto.destroy();delete activeCharts.pareto;}
  activeCharts.pareto=new Chart(ctx,{type:'doughnut',data:{labels:['SP500','Bonos','FCI','Cripto','Inmuebles','Otros'],datasets:[{data:[40,25,15,10,5,5],backgroundColor:['#10b981','#38bdf8','#6366f1','#f59e0b','#8b5cf6','#ef4444'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{display:false}}}});
}
window.calcInflation=(e)=>{
  e.preventDefault();const fd=new FormData(e.target);const A=parseFloat(fd.get('amount')),inf=parseFloat(fd.get('inflation'))/100,Y=parseInt(fd.get('years'));
  const fv=A/Math.pow(1+inf,Y);
  document.getElementById('inflation-result').innerHTML=`<div class="alert alert-danger">En ${Y} años, ${fmtShort(A)} valen <strong>${fmtShort(fv)}</strong>. Pérdida: <strong>${fmtShort(A-fv)}</strong> (${((1-fv/A)*100).toFixed(1)}%)</div><div class="alert alert-success">💡 En cuenta remunerada mantenés el valor real.</div>`;
};

// ════════════════════════════════════════════════
// CRÉDITO
// ════════════════════════════════════════════════
async function renderCredito(){
  document.getElementById('topbar-action').innerHTML=`<button class="btn btn-primary btn-sm" onclick="openNewCard()">+ Tarjeta</button>`;
  const cards=await getCards();
  const totalDeuda=cards.reduce((s,c)=>s+(c.balance||0),0);
  const totalLim=cards.reduce((s,c)=>s+(c.limit||0),0);
  const util=totalLim?(totalDeuda/totalLim*100):0;
  setContent(`
    ${totalDeuda>0?`<div class="grid-2 mb-3"><div class="kpi red" style="padding:14px"><div class="kpi-label">Deuda total</div><div class="kpi-value" style="font-size:1.2rem">${fmtShort(totalDeuda)}</div></div><div class="kpi ${util>80?'red':util>50?'amber':'green'}" style="padding:14px"><div class="kpi-label">Utilización</div><div class="kpi-value" style="font-size:1.2rem">${util.toFixed(1)}%</div></div></div>`:''}
    <div class="card mb-3">
      <div class="card-header"><span class="card-title">💳 Tarjetas</span><button class="btn btn-ghost btn-sm" onclick="openNewCard()">+</button></div>
      ${!cards.length?`<div class="empty-state"><div class="es-icon">💳</div><button class="btn btn-primary mt-3" onclick="openNewCard()">Agregar</button></div>`:cards.map(c=>cardBlock(c)).join('')}
    </div>
    <div class="card mb-3">
      <div class="card-title">📅 50 días de financiamiento gratis</div>
      <div class="alert alert-info mb-3">Comprá el día DESPUÉS del cierre. <strong>NUNCA pagar el mínimo.</strong></div>
      ${cards.map(c=>{const dT=((c.cutDate-new Date().getDate()+31)%31)||31;const w=dT+(c.payDate>c.cutDate?c.payDate-c.cutDate:30+c.payDate-c.cutDate);
        return `<div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px;margin-bottom:8px"><div class="flex justify-between items-center"><span class="fw-bold fs-sm">${c.name}</span><span class="badge badge-green">🟢 ~${w} días</span></div><div class="fs-xs text-2 mt-1">Cierre: día ${c.cutDate} · Pago: día ${c.payDate}</div></div>`;}).join('')||'<div class="fs-sm text-2">Agregá tarjetas para ver el calendario.</div>'}
    </div>
    ${cards.filter(c=>c.balance>0).length?`<div class="card mb-3"><div class="card-title">🧘 Plan Avalancha</div><div class="alert alert-info mb-3 fs-sm">Pagá primero la de mayor tasa.</div>${cards.filter(c=>c.balance>0).sort((a,b)=>(b.apr||0)-(a.apr||0)).map(c=>`<div style="background:var(--surface2);border-radius:var(--r-sm);padding:12px;margin-bottom:8px"><div class="flex justify-between mb-1"><span class="fw-bold fs-sm">${c.name}</span><span class="text-danger fw-bold">${fmt(c.balance)}</span></div><div class="fs-xs text-2">APR: ${c.apr||'?'}%</div><div class="progress-bar mt-2" style="height:5px"><div class="progress-fill" style="width:${Math.min(100,c.balance/(c.limit||c.balance)*100)}%;background:var(--danger)"></div></div></div>`).join('')}</div>`:''}
  `);
}

function cardBlock(c){const u=c.limit?(c.balance/c.limit*100):0;
  return `<div style="background:var(--surface2);border-radius:var(--r-sm);padding:14px;margin-bottom:10px;border-left:4px solid ${u>80?'var(--danger)':u>50?'var(--warning)':'var(--primary)'}">
    <div class="flex justify-between items-center mb-1"><span class="fw-bold">${c.name}</span><div class="flex gap-2"><button class="btn btn-ghost btn-sm" onclick="openEditCard('${c.id}')">✏️</button><button class="btn btn-ghost btn-sm" onclick="removeCard('${c.id}')">🗑</button></div></div>
    <div class="fs-xs text-2 mb-2">${c.bank||''} · Cierre día ${c.cutDate} · APR ${c.apr||'?'}%</div>
    <div class="flex justify-between mb-1"><span class="text-danger fw-bold">${fmt(c.balance)}</span><span class="text-2 fs-sm">Límite: ${fmt(c.limit)}</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,u)}%;background:${u>80?'var(--danger)':u>50?'var(--warning)':'var(--success)'}"></div></div>
    <div class="fs-xs text-2 mt-1">Utilización: ${u.toFixed(1)}%</div>
  </div>`;}

function cardForm(c={}){return `<form onsubmit="submitCard(event,'${c.id||''}')">
    <div class="form-row"><div class="form-group"><label>Nombre</label><input name="name" value="${c.name||''}" required></div><div class="form-group"><label>Banco</label><input name="bank" value="${c.bank||''}"></div></div>
    <div class="form-row"><div class="form-group"><label>Límite</label><input name="limit" type="number" step="100" value="${c.limit||''}" inputmode="decimal"></div><div class="form-group"><label>Saldo</label><input name="balance" type="number" step="0.01" value="${c.balance||0}" inputmode="decimal"></div></div>
    <div class="form-row"><div class="form-group"><label>Día cierre</label><input name="cutDate" type="number" min="1" max="31" value="${c.cutDate||15}" inputmode="numeric"></div><div class="form-group"><label>Día pago</label><input name="payDate" type="number" min="1" max="31" value="${c.payDate||5}" inputmode="numeric"></div></div>
    <div class="form-row"><div class="form-group"><label>APR (%)</label><input name="apr" type="number" step="0.1" value="${c.apr||45}" inputmode="decimal"></div><div class="form-group"><label>Pago mínimo</label><input name="minPayment" type="number" step="0.01" value="${c.minPayment||0}" inputmode="decimal"></div></div>
    <button class="btn btn-primary btn-block mt-3" type="submit">Guardar</button>
  </form>`;}

window.openNewCard=()=>{showGenericModal('💳 Nueva Tarjeta',cardForm());};
window.openEditCard=async(id)=>{const cards=await getCards();const c=cards.find(x=>x.id===id);if(!c)return;showGenericModal('✏️ Editar',cardForm(c));};
window.submitCard=async(e,existingId)=>{e.preventDefault();const fd=new FormData(e.target);await saveCard({id:existingId||undefined,name:fd.get('name'),bank:fd.get('bank'),limit:parseFloat(fd.get('limit'))||0,balance:parseFloat(fd.get('balance'))||0,cutDate:parseInt(fd.get('cutDate')),payDate:parseInt(fd.get('payDate')),apr:parseFloat(fd.get('apr'))||0,minPayment:parseFloat(fd.get('minPayment'))||0});closeModal('modal-generic');renderCredito();};
window.removeCard=async(id)=>{if(!confirm('¿Eliminar?'))return;await deleteCard(id);renderCredito();};

// ════════════════════════════════════════════════
// REPORTES
// ════════════════════════════════════════════════
async function renderReportes(){
  setContent(`<div style="text-align:center;padding:32px;color:var(--text2)"><div class="spinner" style="width:32px;height:32px;margin:0 auto 12px"></div>Cargando...</div>`);
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({d,ym:monthKey(d),label:d.toLocaleDateString('es-AR',{month:'short'})});}
  const allTxsByMonth=await Promise.all(months.map(m=>getMonthTransactions(m.ym).catch(()=>[])));
  const monthTotals=allTxsByMonth.map(txs=>calcPeriodTotals(txs,DEFAULT_CATS));
  const curTotals=monthTotals[5];const prevTotals=monthTotals[4];
  const variation=prevTotals.egresos?((curTotals.egresos-prevTotals.egresos)/prevTotals.egresos*100):0;
  const savRate=curTotals.ingresos?(curTotals.ahorros/curTotals.ingresos*100):0;
  const curTxs=allTxsByMonth[5];
  const catTotals=calcCategoryTotals(curTxs,DEFAULT_CATS);
  const top10=Object.entries(catTotals).map(([id,v])=>({id,v,cat:DEFAULT_CATS.find(c=>c.id===id)})).filter(x=>x.cat&&x.cat.macro!=='Ahorro/Inversión').sort((a,b)=>b.v-a.v).slice(0,10);
  const macro={};Object.entries(catTotals).forEach(([cid,amt])=>{const cat=DEFAULT_CATS.find(c=>c.id===cid);if(cat)macro[cat.macro]=(macro[cat.macro]||0)+amt;});
  setContent(`
    <div class="grid-2 mb-3">
      <div class="kpi ${variation<=0?'green':'red'}" style="padding:14px"><div class="kpi-label">Variación vs mes ant.</div><div class="kpi-value">${variation>=0?'+':''}${variation.toFixed(1)}%</div></div>
      <div class="kpi blue" style="padding:14px"><div class="kpi-label">Tasa de ahorro</div><div class="kpi-value">${savRate.toFixed(1)}%</div><div class="kpi-sub">${savRate>=20?'✅ Por encima del objetivo':'Meta: 20%'}</div></div>
    </div>
    <div class="grid-2 mb-3">
      <div class="card"><div class="card-title">Últimos 6 meses</div><div class="chart-wrap h220"><canvas id="chart-hist"></canvas></div></div>
      <div class="card"><div class="card-title">Por categoría</div><div class="chart-wrap h220"><canvas id="chart-macro"></canvas></div></div>
    </div>
    <div class="card mb-3"><div class="card-title">Evolución del ahorro</div><div class="chart-wrap h180"><canvas id="chart-saving"></canvas></div></div>
    <div class="card"><div class="card-title">Top ${top10.length} gastos este mes</div>
      ${top10.map((x,i)=>{const pct=(x.v/top10[0].v*100).toFixed(0);return `<div class="flex items-center gap-2 mb-3"><span class="fs-xs text-3" style="width:18px">#${i+1}</span><span style="width:20px">${x.cat.icon}</span><span class="fs-sm" style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${x.cat.name}</span><div style="width:80px;height:6px;background:var(--surface2);border-radius:3px;flex-shrink:0"><div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px"></div></div><span class="fs-sm fw-bold" style="flex-shrink:0;min-width:60px;text-align:right">${fmtShort(x.v)}</span></div>`;}).join('')||'<div class="empty-state fs-sm">Sin gastos este mes</div>'}
    </div>
  `);
  setTimeout(()=>{
    const ctx1=document.getElementById('chart-hist');
    if(ctx1) activeCharts.hist=new Chart(ctx1,{type:'bar',data:{labels:months.map(m=>m.label),datasets:[{label:'Ingresos',data:monthTotals.map(t=>t.ingresos),backgroundColor:'#10b98180',borderRadius:4,borderSkipped:false},{label:'Gastos',data:monthTotals.map(t=>t.egresos),backgroundColor:'#ef444480',borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10},callback:v=>fmtShort(v)},grid:{color:'#33415566'}}}}});
    const entries=Object.entries(macro).filter(([,v])=>v>0);
    const ctx2=document.getElementById('chart-macro');
    if(ctx2&&entries.length) activeCharts.macro=new Chart(ctx2,{type:'doughnut',data:{labels:entries.map(([k])=>k),datasets:[{data:entries.map(([,v])=>v),backgroundColor:['#6366f1','#10b981','#f59e0b','#ef4444','#38bdf8','#8b5cf6'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'right',labels:{color:'#94a3b8',font:{size:10},padding:6}}}}});
    const rates=monthTotals.map(t=>t.ingresos?+(t.ahorros/t.ingresos*100).toFixed(1):0);
    const ctx3=document.getElementById('chart-saving');
    if(ctx3) activeCharts.saving=new Chart(ctx3,{type:'line',data:{labels:months.map(m=>m.label),datasets:[{label:'Tasa ahorro %',data:rates,borderColor:'#6366f1',backgroundColor:'#6366f115',fill:true,tension:.4,borderWidth:2,pointRadius:4,pointBackgroundColor:'#6366f1'},{label:'Objetivo 20%',data:Array(6).fill(20),borderColor:'#10b981',borderDash:[6,3],borderWidth:1.5,pointRadius:0,tension:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{min:0,ticks:{color:'#64748b',font:{size:10},callback:v=>v+'%'},grid:{color:'#33415566'}}}}});
  },50);
}

// ════════════════════════════════════════════════
// EDUCACIÓN, MÁS, CONFIGURACIÓN
// ════════════════════════════════════════════════
function renderEducacion(){
  const lessons=[{i:'📚',t:'Activos vs Pasivos',c:'Un activo pone dinero en tu bolsillo. Un pasivo lo saca.'},{i:'🔄',t:'Interés compuesto',c:'"El octavo milagro del mundo." Empezar hoy vale más que más dinero mañana.'},{i:'🛡️',t:'Fondo de emergencia primero',c:'La base de todo plan financiero sólido. 3 a 6 meses de gastos en activos líquidos.'},{i:'📊',t:'ETFs y DCA',c:'Comprá un ETF de índice mensualmente sin importar el precio. Simple y efectivo.'},{i:'💳',t:'Deuda buena vs mala',c:'Buena: financia activos que generan más de lo que cuesta. Mala: financia consumo.'},{i:'📅',t:'Regla 24/48 horas',c:'Ante un gasto impulsivo, esperá. El 80% de los caprichos se olvidan con el tiempo.'},{i:'🧠',t:'Págate primero',c:'Al cobrar, separá el ahorro antes de cualquier gasto. No lo que sobra: lo primero.'},{i:'💡',t:'Tu mejor inversión: vos',c:'Educación y habilidades dan el mayor retorno posible. Invertí en tu crecimiento.'}];
  setContent(`<div class="grid-2">${lessons.map(l=>`<div class="card"><div style="font-size:1.8rem;margin-bottom:8px">${l.i}</div><div class="fw-bold mb-2">${l.t}</div><div class="fs-sm text-2" style="line-height:1.6">${l.c}</div></div>`).join('')}</div>`);
}

function renderMas(){
  const items=[{icon:'🏦',label:'Cuentas',page:'cuentas'},{icon:'📋',label:'Presupuesto',page:'presupuesto'},{icon:'🛡️',label:'Fondo Emergencia',page:'objetivos'},{icon:'📈',label:'Inversiones',page:'inversiones'},{icon:'💳',label:'Crédito y Deuda',page:'credito'},{icon:'📊',label:'Reportes',page:'reportes'},{icon:'🎓',label:'Educación',page:'educacion'},{icon:'⚙️',label:'Configuración',page:'configuracion'}];
  setContent(`<div class="card">${items.map(item=>`<div class="flex items-center gap-3" style="padding:14px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="navigate('${item.page}')"><span style="font-size:1.3rem;width:30px;text-align:center">${item.icon}</span><span class="fw-bold">${item.label}</span><span class="text-3" style="margin-left:auto">›</span></div>`).join('')}</div>`);
}

async function renderConfiguracion(){
  setContent(`
    <div class="card mb-3">
      <div class="card-title">Mi cuenta</div>
      <form onsubmit="submitConfig(event)">
        <div class="form-group"><label>Moneda</label><select name="currency"><option value="ARS" ${settings.currency==='ARS'?'selected':''}>ARS — Peso Argentino</option><option value="USD" ${settings.currency==='USD'?'selected':''}>USD — Dólar</option></select></div>
        <div class="form-group"><label>Págate primero (%)</label><input name="pyf" type="number" value="${settings.payYourselfFirst||20}" min="0" max="100" inputmode="numeric"></div>
        <button class="btn btn-primary btn-block" type="submit">Guardar</button>
      </form>
    </div>
    <div class="card mb-3"><div class="card-title">Datos</div>
      <button class="btn btn-ghost btn-sm" onclick="exportData()">📥 Exportar JSON</button>
    </div>
    <div class="card"><button class="btn btn-danger btn-block" onclick="handleLogout()">🚪 Cerrar sesión</button></div>
  `);
}

window.submitConfig=async(e)=>{e.preventDefault();const fd=new FormData(e.target);settings.currency=fd.get('currency');settings.payYourselfFirst=parseInt(fd.get('pyf'));await saveSettings(settings);alert('✅ Guardado');};
window.exportData=async()=>{const [txs,accounts,goals,cards]=await Promise.all([getTransactions(),getAccounts(),getGoals(),getCards()]);const blob=new Blob([JSON.stringify({txs,accounts,goals,cards,settings},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`financeos-backup.json`;a.click();};

// ════════════════════════════════════════════════
// TRANSACTION FORM
// ════════════════════════════════════════════════
window.openNewTx=async(type='egreso',prefill=null)=>{
  txState={type,psychFilter:prefill?.psychFilter||null,cooldownHours:0};
  document.getElementById('modal-tx-title').textContent={ingreso:'+ Ingreso',egreso:'- Gasto',traslado:'⇄ Transferencia'}[type]||'Transacción';
  await renderTxForm(prefill);openModal('modal-tx');
};
async function renderTxForm(prefill=null){
  const accounts=await cachedAccounts();
  const cats=DEFAULT_CATS.filter(c=>c.type===txState.type||txState.type==='traslado');
  const groups={};cats.forEach(c=>{(groups[c.macro]||=[]).push(c);});
  const catOpts=Object.entries(groups).map(([g,cs])=>`<optgroup label="${g}">${cs.map(c=>`<option value="${c.id}" ${prefill?.categoryId===c.id?'selected':''}>${c.icon} ${c.name}</option>`).join('')}</optgroup>`).join('');
  const accOpts=accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('');
  const isEg=txState.type==='egreso';const isTr=txState.type==='traslado';
  document.getElementById('modal-tx-body').innerHTML=`
    <div class="type-tabs mb-3">
      <button class="type-tab ${txState.type==='ingreso'?'sel-ing':''}" onclick="changeTxType('ingreso')">💰 Ingreso</button>
      <button class="type-tab ${txState.type==='egreso'?'sel-eg':''}" onclick="changeTxType('egreso')">📤 Gasto</button>
      <button class="type-tab ${txState.type==='traslado'?'sel-tr':''}" onclick="changeTxType('traslado')">🔄 Transferir</button>
    </div>
    <form onsubmit="submitTx(event)">
      <div class="form-group"><label>Monto</label><div class="input-prefix"><span>${settings.currency==='USD'?'U$S':'$'}</span><input name="amount" type="number" step="0.01" placeholder="0.00" inputmode="decimal" value="${prefill?.amount||''}" required autofocus style="font-size:1.4rem;font-weight:700;padding:14px"></div></div>
      <div class="form-group"><label>Descripción</label><input name="description" placeholder="${isTr?'Ej: Transferencia':'Ej: Almuerzo...'}" value="${prefill?.description||''}"></div>
      ${!isTr?`<div class="form-group"><label>Categoría</label><select name="categoryId" required><option value="">— Seleccioná —</option>${catOpts}</select></div>`:''}
      <div class="form-group"><label>${isTr?'Cuenta origen':'Cuenta'}</label><select name="accountId" required><option value="">— Seleccioná —</option>${accOpts}</select></div>
      ${isTr?`<div class="form-group"><label>Cuenta destino</label><select name="toAccountId" required><option value="">— Seleccioná —</option>${accOpts}</select></div>`:''}
      <div class="form-group"><label>Fecha</label><input name="date" type="date" value="${today()}"></div>
      ${isEg?`<div class="form-group"><label>¿Qué tipo de gasto?</label>
        <div class="psych-row">${[['necesidad','✅','Necesidad','Indispensable'],['gusto','👍','Gusto','Lo querés'],['capricho','⚠️','Capricho','Impulso']].map(([v,e,n,d])=>`<div class="psych-opt ${txState.psychFilter===v?'sel':''}" onclick="setPsych('${v}')"><span class="psych-emoji">${e}</span><div class="psych-name">${n}</div><div class="psych-sub">${d}</div></div>`).join('')}</div>
        ${txState.psychFilter==='capricho'?`<div class="alert alert-warning">⏰ <div><strong>¡Pausa!</strong><div class="flex gap-2 mt-2"><button type="button" class="btn btn-ghost btn-sm ${txState.cooldownHours===24?'btn-primary':''}" onclick="setCooldown(24)">24 hs</button><button type="button" class="btn btn-ghost btn-sm ${txState.cooldownHours===48?'btn-primary':''}" onclick="setCooldown(48)">48 hs</button><button type="button" class="btn btn-ghost btn-sm ${txState.cooldownHours===0?'btn-primary':''}" onclick="setCooldown(0)">Sin espera</button></div></div></div>`:''}`:''}
      <button type="submit" class="btn btn-${txState.type==='ingreso'?'success':txState.type==='traslado'?'primary':'danger'} btn-block" style="min-height:50px;font-size:1rem;margin-top:4px">
        ${txState.cooldownHours>0?`⏰ Guardar (esperar ${txState.cooldownHours}h)`:txState.type==='ingreso'?'💰 Registrar ingreso':txState.type==='traslado'?'🔄 Registrar transferencia':'📤 Registrar gasto'}
      </button>
    </form>`;
}
window.changeTxType=(t)=>{txState.type=t;txState.psychFilter=null;txState.cooldownHours=0;renderTxForm();document.getElementById('modal-tx-title').textContent={ingreso:'+ Ingreso',egreso:'- Gasto',traslado:'⇄ Transferencia'}[t];};
window.setPsych=(v)=>{txState.psychFilter=v;if(v!=='capricho')txState.cooldownHours=0;renderTxForm();};
window.setCooldown=(h)=>{txState.cooldownHours=h;renderTxForm();};
window.submitTx=async(e)=>{
  e.preventDefault();const fd=new FormData(e.target);
  const cooldownUntil=txState.cooldownHours>0?new Date(Date.now()+txState.cooldownHours*3_600_000).toISOString():null;
  await addTransaction({date:fd.get('date')||today(),type:txState.type,amount:parseFloat(fd.get('amount')),description:fd.get('description'),categoryId:fd.get('categoryId')||null,accountId:fd.get('accountId'),toAccountId:fd.get('toAccountId')||null,psychFilter:txState.psychFilter,isPendingCooldown:txState.cooldownHours>0,cooldownUntil});
  closeModal('modal-tx');dismissVoiceCard();clearCache();navigate(currentPage);
};
window.confirmCooldown=async(id)=>{await updateTransaction(id,{isPendingCooldown:false,cooldownUntil:null});clearCache();renderInicio();};
window.cancelTx=async(id)=>{await deleteTransaction(id);clearCache();renderInicio();};

// TX LIST
function renderTxList(txs){
  if(!txs?.length)return`<div class="empty-state"><div class="es-icon">📋</div>Sin movimientos<br><button class="btn btn-primary mt-3" onclick="openNewTx('egreso')">+ Registrar</button></div>`;
  const groups={};txs.forEach(t=>{(groups[t.date]||=[]).push(t);});
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,items])=>`
    <div class="tx-date-group">${fmtDateFull(date)}</div>
    ${items.map(t=>{const cat=DEFAULT_CATS.find(c=>c.id===t.categoryId);const isTr=t.type==='traslado';
      return `<div class="tx-item" onclick="showTxDetail('${t.id}')">
        <div class="tx-icon ${t.type==='ingreso'?'ing':isTr?'tr':'eg'}">${cat?.icon||(isTr?'🔄':'📦')}</div>
        <div class="tx-info"><div class="tx-name">${t.description||(cat?.name||'Sin descripción')}</div><div class="tx-cat">${isTr?'Traslado':(cat?.macro||'—')} ${t.psychFilter?'· '+{necesidad:'✅',gusto:'👍',capricho:'⚠️'}[t.psychFilter]:''}</div></div>
        <div class="tx-amount" style="color:${t.type==='ingreso'?'var(--success)':isTr?'var(--info)':'var(--danger)'}">${t.type==='ingreso'?'+':isTr?'⇄':'-'}${fmt(t.amount)}</div>
      </div>`;}).join('')}`).join('');
}
window.showTxDetail=async(id)=>{
  const txs=await getTransactions({limit:200});const t=txs.find(x=>x.id===id);if(!t)return;
  const cat=DEFAULT_CATS.find(c=>c.id===t.categoryId);
  showGenericModal('Detalle',`<div class="text-center mb-4"><div style="font-size:2rem">${cat?.icon||'📦'}</div><div class="fw-800 fs-lg mt-2" style="color:${t.type==='ingreso'?'var(--success)':'var(--danger)'}">${t.type==='ingreso'?'+':'-'}${fmt(t.amount)}</div></div>
    <div style="background:var(--surface2);border-radius:var(--r-sm);padding:14px;margin-bottom:14px">${[['Descripción',t.description||'—'],['Categoría',cat?cat.icon+' '+cat.name:'—'],['Tipo',t.type],['Fecha',fmtDateFull(t.date)]].map(([l,v])=>`<div class="flex justify-between fs-sm mb-2"><span class="text-2">${l}</span><span class="fw-bold">${v}</span></div>`).join('')}</div>
    <button class="btn btn-danger btn-block" onclick="deleteTxFromDetail('${t.id}')">🗑 Eliminar</button>`);
};
window.deleteTxFromDetail=async(id)=>{if(!confirm('¿Eliminar?'))return;await deleteTransaction(id);closeModal('modal-generic');clearCache();navigate(currentPage);};

// ── VOICE BRIDGE ─────────────────────────────────────
window.toggleVoice=toggleVoice;
window.dismissVoiceCard=dismissVoiceCard;
window.confirmVoiceTx=async()=>{const p=getVoiceParsed();if(!p)return;dismissVoiceCard();await openNewTx(p.type==='ahorro'?'egreso':p.type,{...p,categoryId:p.type==='ahorro'?'gas-ahorro':p.categoryId});};
window.editVoiceTx=async()=>{const p=getVoiceParsed();dismissVoiceCard();if(p)await openNewTx(p.type==='ahorro'?'egreso':p.type,p);};

// ── HELPERS ───────────────────────────────────────────
function setContent(html){document.getElementById('content').innerHTML=html;}
function showGenericModal(title,body){document.getElementById('modal-generic-title').textContent=title;document.getElementById('modal-generic-body').innerHTML=body;openModal('modal-generic');}
function openModal(id){document.getElementById(id)?.classList.add('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
window.openModal=openModal;window.closeModal=closeModal;window.navigate=navigate;
window.toggleSidebar=()=>{document.getElementById('sidebar').classList.toggle('open');document.getElementById('sidebar-overlay').classList.toggle('open');};
window.closeSidebar=()=>{document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('open');};
window.openUserMenu=()=>navigate('configuracion');
window.handleLogout=async()=>{await logout();};
function getMonthOptions(selected=monthKey()){let o='';for(let i=0;i<13;i++){const d=new Date();d.setMonth(d.getMonth()-i);const ym=monthKey(d);o+=`<option value="${ym}" ${ym===selected?'selected':''}>${d.toLocaleDateString('es-AR',{month:'long',year:'numeric'})}</option>`;}return o;}

// ── KICK OFF ─────────────────────────────────────────
init().catch(err=>{
  document.getElementById('loading-screen').innerHTML=`<div style="text-align:center;padding:24px;color:#f1f5f9"><div style="font-size:2rem;margin-bottom:12px">⚠️</div><div style="font-weight:700;margin-bottom:8px">Error al cargar</div><div style="font-size:.82rem;color:#94a3b8;margin-bottom:16px">${err.message}</div><button onclick="location.reload()" style="padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">Reintentar</button></div>`;
});
