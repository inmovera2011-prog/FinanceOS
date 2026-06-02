// ═══════════════════════════════════════════════
// AUTH.JS — Login, registro, routing por rol
// Roles: 'admin' | 'user'
// ═══════════════════════════════════════════════
import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         GoogleAuthProvider, signInWithPopup,
         sendPasswordResetEmail, signOut,
         onAuthStateChanged, setPersistence,
         browserLocalPersistence }                from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc,
         serverTimestamp, collection,
         getDocs, query, limit }                  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import FIREBASE_CONFIG                            from './firebase-config.js';

// ── Init ─────────────────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

// ── Detecta si ya existe algún admin registrado ──
// El primer usuario que se registre se convierte en admin automáticamente
async function hasAnyAdmin() {
  const snap = await getDocs(
    query(collection(db, 'admins'), limit(1))
  );
  return !snap.empty;
}

// ── Crear perfil en Firestore ─────────────────────
async function createUserProfile(uid, name, email, role) {
  await setDoc(doc(db, 'users', uid), {
    name, email, role, createdAt: serverTimestamp()
  });
  if (role === 'admin') {
    await setDoc(doc(db, 'admins', uid), {
      name, email, createdAt: serverTimestamp()
    });
  } else {
    // Perfil de usuario con habilidades por defecto
    await setDoc(doc(db, 'users_data', uid), {
      name, email, status: 'activo',
      joinDate: new Date().toISOString().slice(0,10),
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'users_data', uid, 'settings', 'habilidades'), {
      presupuesto: true, movimientos: true, objetivos: false,
      credito: false, reportes: false, inversiones: false, educacion: true,
    });
    await setDoc(doc(db, 'users_data', uid, 'settings', 'main'), {
      auditPhaseActive: true,
      auditPhaseStart: new Date().toISOString().slice(0,10),
      payYourselfFirst: 20, currency: 'ARS',
      needs: 50, wants: 30, savings: 20, emergencyMonths: 6,
    });
  }
}

// ── Leer perfil ───────────────────────────────────
async function loadProfile(uid, email) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { uid, role: 'pending', email };
  return { uid, ...snap.data() };
}

// ── Routing por rol ───────────────────────────────
export function routeByRole(profile) {
  if (!profile) return;
  const base = getBasePath();
  if (profile.role === 'admin') {
    window.location.href = base + 'admin/';
  } else if (profile.role === 'user') {
    window.location.href = base + 'user/';
  } else {
    showPendingScreen(profile.email);
  }
}

// ── Check sesión activa ───────────────────────────
export async function checkAuthAndRoute() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) { resolve(null); return; }
      try {
        const profile = await loadProfile(user.uid, user.email);
        resolve(profile);
      } catch(e) {
        console.error('Error cargando perfil:', e);
        resolve(null);
      }
    });
  });
}

// ── Protección de rutas ───────────────────────────
export async function requireRole(expectedRole) {
  const profile = await checkAuthAndRoute();
  if (!profile) { window.location.href = getBasePath(); return null; }
  if (profile.role !== expectedRole) { routeByRole(profile); return null; }
  return profile;
}

// ── Login email/password ──────────────────────────
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return loadProfile(cred.user.uid, email);
}

// ── Login Google ──────────────────────────────────
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  const uid = result.user.uid;

  // Si no tiene perfil aún → registrarlo
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    const isFirstAdmin = !(await hasAnyAdmin());
    const role = isFirstAdmin ? 'admin' : 'user';
    await createUserProfile(uid, result.user.displayName || result.user.email, result.user.email, role);
  }
  return loadProfile(uid, result.user.email);
}

// ── Registro nuevo usuario ────────────────────────
// El primer usuario registrado se convierte en admin automáticamente.
// Los siguientes son 'user' por defecto.
export async function registerUser(name, email, password) {
  // Crear cuenta primero → ya hay sesión activa para las lecturas de Firestore
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const isFirstAdmin = !(await hasAnyAdmin());
  const role = isFirstAdmin ? 'admin' : 'user';
  await createUserProfile(cred.user.uid, name, email, role);
  return loadProfile(cred.user.uid, email);
}

// ── Reset password ────────────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Logout ────────────────────────────────────────
export async function logout() {
  await signOut(auth);
  window.location.href = getBasePath();
}
window._fosLogout = logout;

// ── Base path (funciona en localhost, gh-pages y Firebase Hosting) ──
export function getBasePath() {
  const path = window.location.pathname;
  if (/\/(admin|user|broker|agent)(\/|$)/.test(path)) {
    return path.replace(/\/(admin|user|broker|agent)(\/.*)?$/, '/');
  }
  return path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
}

// ── Pantalla "cuenta pendiente" ───────────────────
function showPendingScreen(email) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:24px;text-align:center;background:#0f172a;color:#f1f5f9;font-family:system-ui">
      <div style="font-size:3rem">⏳</div>
      <div style="font-size:1.2rem;font-weight:700">Cuenta en revisión</div>
      <div style="color:#94a3b8;max-width:360px">Tu cuenta <strong>${email}</strong> existe pero aún no tiene un rol asignado. Contactá al administrador.</div>
      <button onclick="window._fosLogout()" style="margin-top:12px;padding:10px 20px;background:#334155;color:#f1f5f9;border:none;border-radius:8px;cursor:pointer">Cerrar sesión</button>
    </div>`;
}
