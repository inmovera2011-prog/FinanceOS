// ═══════════════════════════════════════════════
// DB.JS — Capa de datos Firestore
// Reemplaza completamente el localStorage del prototipo.
// Misma interfaz, ahora async/await con Firestore.
// ═══════════════════════════════════════════════
import { auth, db } from './auth.js';
import {
  collection, doc, getDocs, getDoc, addDoc, setDoc,
  deleteDoc, query, orderBy, where, limit,
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { DEFAULT_SETTINGS, DEFAULT_HABS } from './constants.js';

// ── UID activo ──────────────────────────────────────────
// null  → usa auth.currentUser.uid (modo normal)
// string → broker está viendo datos de ese agente
let _viewingUid = null;

export const ViewingAgent = {
  set(uid)   { _viewingUid = uid; },
  clear()    { _viewingUid = null; },
  get()      { return _viewingUid || auth.currentUser?.uid; },
  isBroker() { return _viewingUid !== null; },
};

// ── Refs ────────────────────────────────────────────────
const col  = (sub)     => collection(db, 'agents', ViewingAgent.get(), sub);
const aDoc = (sub, id) => doc(db, 'agents', ViewingAgent.get(), sub, id);
const settRef = ()     => doc(db, 'agents', ViewingAgent.get(), 'settings', 'main');
const habRef  = (uid)  => doc(db, 'agents', uid || ViewingAgent.get(), 'settings', 'habilidades');

// ── UUID ────────────────────────────────────────────────
export const uuid = () =>
  crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

// ════════════════════════════════════════════════
// ACCOUNTS
// ════════════════════════════════════════════════
export async function getAccounts() {
  const snap = await getDocs(col('accounts'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveAccount(account) {
  const { id, ...data } = account;
  if (id) {
    await setDoc(aDoc('accounts', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('accounts'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteAccount(id) {
  await deleteDoc(aDoc('accounts', id));
}

// ════════════════════════════════════════════════
// TRANSACTIONS
// ════════════════════════════════════════════════
export async function getTransactions(opts = {}) {
  const constraints = [orderBy('date', 'desc')];
  if (opts.startDate) constraints.push(where('date', '>=', opts.startDate));
  if (opts.endDate)   constraints.push(where('date', '<=', opts.endDate));
  if (opts.type)      constraints.push(where('type', '==', opts.type));
  if (opts.limit)     constraints.push(limit(opts.limit));

  const snap = await getDocs(query(col('transactions'), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Shortcut: todas las transacciones del mes actual
export async function getMonthTransactions(ym) {
  const start = ym + '-01';
  const end   = ym + '-31';
  return getTransactions({ startDate: start, endDate: end });
}

export async function addTransaction(tx) {
  const { id, ...data } = tx;
  // Nunca guardar cooldown activo como permanente — solo la intención
  if (id) {
    await setDoc(aDoc('transactions', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('transactions'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateTransaction(id, partial) {
  await setDoc(aDoc('transactions', id), { ...partial, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteTransaction(id) {
  await deleteDoc(aDoc('transactions', id));
}

// ════════════════════════════════════════════════
// GOALS
// ════════════════════════════════════════════════
export async function getGoals() {
  const snap = await getDocs(col('goals'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveGoal(goal) {
  const { id, ...data } = goal;
  if (id) {
    await setDoc(aDoc('goals', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('goals'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteGoal(id) {
  await deleteDoc(aDoc('goals', id));
}

// ════════════════════════════════════════════════
// CARDS (tarjetas de crédito)
// ════════════════════════════════════════════════
export async function getCards() {
  const snap = await getDocs(col('cards'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveCard(card) {
  const { id, ...data } = card;
  if (id) {
    await setDoc(aDoc('cards', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('cards'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteCard(id) {
  await deleteDoc(aDoc('cards', id));
}

// ════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════
export async function getSettings() {
  const snap = await getDoc(settRef());
  return snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(partial) {
  await setDoc(settRef(), { ...partial, updatedAt: serverTimestamp() }, { merge: true });
}

// ════════════════════════════════════════════════
// HABILIDADES
// ════════════════════════════════════════════════
export async function getHabilidades(uid) {
  const snap = await getDoc(habRef(uid));
  return snap.exists() ? { ...DEFAULT_HABS, ...snap.data() } : { ...DEFAULT_HABS };
}

export async function saveHabilidades(uid, habs) {
  await setDoc(habRef(uid), { ...habs, updatedAt: serverTimestamp() });
}

// ════════════════════════════════════════════════
// CÁLCULOS (helpers que antes estaban en app.js)
// ════════════════════════════════════════════════
export function calcAccountBalance(account, transactions) {
  let bal = account.initialBalance || 0;
  transactions.forEach(t => {
    if (t.isPendingCooldown && new Date(t.cooldownUntil) > new Date()) return;
    if (t.accountId === account.id) {
      if (t.type === 'ingreso') bal += t.amount;
      else if (t.type === 'egreso' || t.type === 'traslado') bal -= t.amount;
    }
    if (t.type === 'traslado' && t.toAccountId === account.id) bal += t.amount;
  });
  return bal;
}

export function calcPeriodTotals(transactions, cats) {
  let ing = 0, eg = 0, sav = 0;
  transactions.filter(t => !t.isPendingCooldown || new Date(t.cooldownUntil) <= new Date())
    .forEach(t => {
      if (t.type === 'ingreso') ing += t.amount;
      else if (t.type === 'egreso') {
        const cat = cats.find(c => c.id === t.categoryId);
        if (cat?.macro === 'Ahorro/Inversión') sav += t.amount;
        else eg += t.amount;
      }
    });
  return { ingresos: ing, egresos: eg, ahorros: sav, neto: ing - eg - sav };
}

export function calcCategoryTotals(transactions, cats) {
  const map = {};
  transactions
    .filter(t => t.type === 'egreso' && (!t.isPendingCooldown || new Date(t.cooldownUntil) <= new Date()))
    .forEach(t => { map[t.categoryId] = (map[t.categoryId] || 0) + t.amount; });
  return map;
}

// ════════════════════════════════════════════════
// AGENTS (nivel broker)
// ════════════════════════════════════════════════
export async function getMyAgents(brokerId) {
  const snap = await getDocs(
    query(collection(db, 'agents'), where('brokerId', '==', brokerId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAgentProfile(uid) {
  const snap = await getDoc(doc(db, 'agents', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveAgentProfile(uid, data) {
  await setDoc(doc(db, 'agents', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'users', uid), {
    name: data.name, email: data.email, role: 'agent',
    brokerId: data.brokerId, updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteAgentAndData(uid) {
  const batch = writeBatch(db);
  const subs  = ['accounts', 'transactions', 'goals', 'cards'];
  for (const sub of subs) {
    const snap = await getDocs(collection(db, 'agents', uid, sub));
    snap.docs.forEach(d => batch.delete(d.ref));
  }
  // settings
  const settSnap = await getDocs(collection(db, 'agents', uid, 'settings'));
  settSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, 'agents', uid));
  batch.delete(doc(db, 'users', uid));
  await batch.commit();
}

// ════════════════════════════════════════════════
// INVITES
// ════════════════════════════════════════════════
export async function createInvite({ brokerId, brokerName, agentEmail, habs, situation }) {
  const token = uuid();
  const expires = new Date(Date.now() + 7 * 86_400_000); // 7 días
  await setDoc(doc(db, 'invites', token), {
    brokerId, brokerName, agentEmail, habs, situation,
    used: false, createdAt: serverTimestamp(), expiresAt: expires.toISOString()
  });
  return token;
}

export async function getInvite(token) {
  const snap = await getDoc(doc(db, 'invites', token));
  return snap.exists() ? { token, ...snap.data() } : null;
}

export async function markInviteUsed(token) {
  await setDoc(doc(db, 'invites', token), { used: true }, { merge: true });
}

// ════════════════════════════════════════════════
// HEALTH SCORE (calcula para un agente dado)
// ════════════════════════════════════════════════
export async function calcHealthScore(agentUid) {
  const prevUid = _viewingUid;
  ViewingAgent.set(agentUid);

  try {
    const ym  = new Date().toISOString().slice(0,7);
    const [txs, goals, settings] = await Promise.all([
      getMonthTransactions(ym),
      getGoals(),
      getSettings(),
    ]);
    const { DEFAULT_CATS } = await import('./constants.js');
    const totals = calcPeriodTotals(txs, DEFAULT_CATS);
    const emGoal = goals.find(g => g.type === 'emergency_fund');

    // 1. Tasa de ahorro (0–25 pts)
    const savRate = totals.ingresos ? totals.ahorros / totals.ingresos * 100 : 0;
    const savPts  = Math.min(25, (savRate / (settings.savings || 20)) * 25);

    // 2. Fondo emergencia (0–25 pts)
    const emPct = emGoal ? Math.min(100, emGoal.currentAmount / emGoal.targetAmount * 100) : 0;
    const emPts = emPct / 4;

    // 3. Cumplimiento presupuesto (0–25 pts)
    const catTot = calcCategoryTotals(txs, DEFAULT_CATS);
    let needsSpent = 0;
    Object.entries(catTot).forEach(([cid, amt]) => {
      const cat = DEFAULT_CATS.find(c => c.id === cid);
      if (cat?.macro === 'Necesidades') needsSpent += amt;
    });
    const needsPct  = totals.ingresos ? needsSpent / totals.ingresos * 100 : 100;
    const budgetPts = Math.max(0, 25 - Math.max(0, needsPct - (settings.needs || 50)));

    // 4. Actividad — transacciones últimos 7 días (0–25 pts)
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const recent = txs.filter(t => new Date(t.date) >= d7).length;
    const engPts = Math.min(25, recent * 4);

    return Math.round(Math.min(100, savPts + emPts + budgetPts + engPts));
  } finally {
    ViewingAgent.set(prevUid); // restaurar
  }
}
