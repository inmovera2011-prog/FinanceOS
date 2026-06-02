// ═══════════════════════════════════════════════
// DB.JS — Capa de datos Firestore
// Colecciones: users, admins, users_data/{uid}/*
// ═══════════════════════════════════════════════
import { auth, db } from './auth.js';
import {
  collection, doc, getDocs, getDoc, addDoc, setDoc,
  deleteDoc, query, orderBy, where, limit,
  serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { DEFAULT_SETTINGS, DEFAULT_HABS } from './constants.js';

// ── UID activo (admin puede ver datos de cualquier user) ──
let _viewingUid = null;
export const ViewingUser = {
  set(uid)   { _viewingUid = uid; },
  clear()    { _viewingUid = null; },
  get()      { return _viewingUid || auth.currentUser?.uid; },
  isAdmin()  { return _viewingUid !== null; },
};

// ── Refs ─────────────────────────────────────────
const col  = (sub)     => collection(db, 'users_data', ViewingUser.get(), sub);
const uDoc = (sub, id) => doc(db, 'users_data', ViewingUser.get(), sub, id);
const settRef = ()     => doc(db, 'users_data', ViewingUser.get(), 'settings', 'main');
const habRef  = (uid)  => doc(db, 'users_data', uid || ViewingUser.get(), 'settings', 'habilidades');

// ── UUID ─────────────────────────────────────────
export const uuid = () =>
  crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

// ════════════════════════════════════════════════
// CUENTAS
// ════════════════════════════════════════════════
export async function getAccounts() {
  const snap = await getDocs(col('accounts'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveAccount(account) {
  const { id, ...data } = account;
  if (id) {
    await setDoc(uDoc('accounts', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('accounts'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function deleteAccount(id) { await deleteDoc(uDoc('accounts', id)); }

// ════════════════════════════════════════════════
// TRANSACCIONES
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
export async function getMonthTransactions(ym) {
  return getTransactions({ startDate: ym + '-01', endDate: ym + '-31' });
}
export async function addTransaction(tx) {
  const { id, ...data } = tx;
  if (id) {
    await setDoc(uDoc('transactions', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('transactions'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function updateTransaction(id, partial) {
  await setDoc(uDoc('transactions', id), { ...partial, updatedAt: serverTimestamp() }, { merge: true });
}
export async function deleteTransaction(id) { await deleteDoc(uDoc('transactions', id)); }

// ════════════════════════════════════════════════
// OBJETIVOS
// ════════════════════════════════════════════════
export async function getGoals() {
  const snap = await getDocs(col('goals'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveGoal(goal) {
  const { id, ...data } = goal;
  if (id) {
    await setDoc(uDoc('goals', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('goals'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function deleteGoal(id) { await deleteDoc(uDoc('goals', id)); }

// ════════════════════════════════════════════════
// TARJETAS
// ════════════════════════════════════════════════
export async function getCards() {
  const snap = await getDocs(col('cards'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveCard(card) {
  const { id, ...data } = card;
  if (id) {
    await setDoc(uDoc('cards', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return id;
  }
  const ref = await addDoc(col('cards'), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}
export async function deleteCard(id) { await deleteDoc(uDoc('cards', id)); }

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
// CÁLCULOS
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
  transactions
    .filter(t => !t.isPendingCooldown || new Date(t.cooldownUntil) <= new Date())
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
// USUARIOS (nivel admin)
// ════════════════════════════════════════════════
export async function getAllUsers() {
  const snap = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'user'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users_data', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function updateUserProfile(uid, data) {
  await setDoc(doc(db, 'users_data', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'users', uid), { name: data.name, updatedAt: serverTimestamp() }, { merge: true });
}
export async function deleteUserAndData(uid) {
  const batch = writeBatch(db);
  const subs = ['accounts', 'transactions', 'goals', 'cards'];
  for (const sub of subs) {
    const snap = await getDocs(collection(db, 'users_data', uid, sub));
    snap.docs.forEach(d => batch.delete(d.ref));
  }
  const settSnap = await getDocs(collection(db, 'users_data', uid, 'settings'));
  settSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(db, 'users_data', uid));
  batch.delete(doc(db, 'users', uid));
  await batch.commit();
}
export async function promoteToAdmin(uid) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) return;
  const data = userSnap.data();
  await setDoc(doc(db, 'users', uid), { role: 'admin', updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(doc(db, 'admins', uid), { name: data.name, email: data.email, promotedAt: serverTimestamp() });
}

// ════════════════════════════════════════════════
// HEALTH SCORE
// ════════════════════════════════════════════════
export async function calcHealthScore(userUid) {
  const prev = _viewingUid;
  ViewingUser.set(userUid);
  try {
    const ym = new Date().toISOString().slice(0, 7);
    const [txs, goals, settings] = await Promise.all([
      getMonthTransactions(ym),
      getGoals(),
      getSettings(),
    ]);
    const { DEFAULT_CATS } = await import('./constants.js');
    const totals = calcPeriodTotals(txs, DEFAULT_CATS);
    const emGoal = goals.find(g => g.type === 'emergency_fund');
    const savRate = totals.ingresos ? totals.ahorros / totals.ingresos * 100 : 0;
    const savPts  = Math.min(25, (savRate / (settings.savings || 20)) * 25);
    const emPct   = emGoal ? Math.min(100, emGoal.currentAmount / emGoal.targetAmount * 100) : 0;
    const emPts   = emPct / 4;
    const catTot  = calcCategoryTotals(txs, DEFAULT_CATS);
    let needsSpent = 0;
    Object.entries(catTot).forEach(([cid, amt]) => {
      const cat = DEFAULT_CATS.find(c => c.id === cid);
      if (cat?.macro === 'Necesidades') needsSpent += amt;
    });
    const needsPct  = totals.ingresos ? needsSpent / totals.ingresos * 100 : 100;
    const budgetPts = Math.max(0, 25 - Math.max(0, needsPct - (settings.needs || 50)));
    const d7 = new Date(); d7.setDate(d7.getDate() - 7);
    const recent = txs.filter(t => new Date(t.date) >= d7).length;
    const engPts = Math.min(25, recent * 4);
    return Math.round(Math.min(100, savPts + emPts + budgetPts + engPts));
  } finally {
    ViewingUser.set(prev);
  }
}

// ════════════════════════════════════════════════
// INVITACIONES (admin → user)
// ════════════════════════════════════════════════
export async function createInvite({ adminId, adminName, userEmail, habs }) {
  const token = uuid();
  await setDoc(doc(db, 'invites', token), {
    adminId, adminName, userEmail, habs,
    used: false, createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString()
  });
  return token;
}
export async function getInvite(token) {
  const snap = await getDoc(doc(db, 'invites', token));
  return snap.exists() ? { token, ...snap.data() } : null;
}
export async function markInviteUsed(token, uid) {
  await setDoc(doc(db, 'invites', token), { used: true, usedAt: serverTimestamp(), userUid: uid }, { merge: true });
}
