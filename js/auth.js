// ═══════════════════════════════════════════════
// AUTH.JS — Login, logout, role routing
// ═══════════════════════════════════════════════
import { initializeApp }                          from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword,
         createUserWithEmailAndPassword,
         GoogleAuthProvider, signInWithPopup,
         sendPasswordResetEmail, signOut,
         onAuthStateChanged, setPersistence,
         browserLocalPersistence }                from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc,
         serverTimestamp }                        from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import FIREBASE_CONFIG                            from './firebase-config.js';

// ── Init ─────────────────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

setPersistence(auth, browserLocalPersistence);

// ── Exports para otros módulos ────────────────────
export { auth, db };

// ── Role routing ─────────────────────────────────
// Determina si el usuario ya tiene sesión y redirige
// Se llama desde index.html (login) y desde los shells
export async function checkAuthAndRoute() {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      if (!user) { resolve(null); return; }

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) {
          // Usuario en Auth pero sin perfil Firestore → esperando asignación
          resolve({ uid: user.uid, role: 'pending', email: user.email });
          return;
        }
        const data = snap.data();
        resolve({ uid: user.uid, ...data });
      } catch(e) {
        console.error('Error leyendo perfil:', e);
        resolve(null);
      }
    });
  });
}

// Redirige según rol (llamado desde login page)
export function routeByRole(profile) {
  if (!profile) return;
  const base = getBasePath();
  if (profile.role === 'broker') {
    window.location.href = base + 'broker/';
  } else if (profile.role === 'agent') {
    window.location.href = base + 'agent/';
  } else {
    // pending — sin rol asignado
    showPendingScreen(profile.email);
  }
}

// ── Login con email/password ──────────────────────
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, 'users', cred.user.uid));
  if (!snap.exists()) return { uid: cred.user.uid, role: 'pending', email };
  return { uid: cred.user.uid, ...snap.data() };
}

// ── Login con Google ──────────────────────────────
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  const snap   = await getDoc(doc(db, 'users', result.user.uid));
  if (!snap.exists()) return { uid: result.user.uid, role: 'pending', email: result.user.email };
  return { uid: result.user.uid, ...snap.data() };
}

// ── Registrar primer broker ───────────────────────
// Solo para el setup inicial — crea cuenta + perfil en Firestore
export async function registerBroker(name, email, password, office) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid  = cred.user.uid;

  // Crea perfil en /users
  await setDoc(doc(db, 'users', uid), {
    name, email, role: 'broker', office,
    createdAt: serverTimestamp()
  });

  // Crea registro en /brokers
  await setDoc(doc(db, 'brokers', uid), {
    name, email, office, agents: [],
    plan: 'free', createdAt: serverTimestamp()
  });

  return { uid, name, email, role: 'broker', office };
}

// ── Reset de contraseña ───────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ── Logout ────────────────────────────────────────
export async function logout() {
  await signOut(auth);
  window.location.href = getBasePath();
}

// ── Protección de rutas ───────────────────────────
// Llamar al inicio de broker/index.html y agent/index.html
// expectedRole: 'broker' | 'agent'
export async function requireRole(expectedRole) {
  const profile = await checkAuthAndRoute();
  if (!profile) {
    window.location.href = getBasePath();
    return null;
  }
  if (profile.role !== expectedRole) {
    routeByRole(profile); // manda al lugar correcto
    return null;
  }
  return profile;
}

// ── Helpers ───────────────────────────────────────

// Detecta el base path correcto en cualquier entorno:
//   localhost:3030/                    → /
//   usuario.github.io/FinanceOS/       → /FinanceOS/
//   miapp.web.app/                     → /
function getBasePath() {
  const path = window.location.pathname;
  // Si estamos dentro de /broker/ o /agent/, removemos ese segmento y el resto
  if (/\/(broker|agent)(\/|$)/.test(path)) {
    return path.replace(/\/(broker|agent)(\/.*)?$/, '/');
  }
  // Si estamos en la raíz del proyecto (puede ser subdirectorio en GitHub Pages)
  // Devolvemos el path actual con trailing slash
  return path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);
}

// Exportamos logout globalmente para poder usarlo desde HTML inline
window._fosLogout = async () => { await signOut(auth); window.location.href = getBasePath(); };

function showPendingScreen(email) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:24px;text-align:center;background:#0f172a;color:#f1f5f9;font-family:system-ui">
      <div style="font-size:3rem">⏳</div>
      <div style="font-size:1.2rem;font-weight:700">Cuenta en revisión</div>
      <div style="color:#94a3b8;max-width:360px">Tu cuenta <strong>${email}</strong> existe pero aún no tiene un rol asignado. Contactá a tu broker para que active tu acceso.</div>
      <button onclick="window._fosLogout()" style="margin-top:12px;padding:10px 20px;background:#334155;color:#f1f5f9;border:none;border-radius:8px;cursor:pointer">Cerrar sesión</button>
    </div>`;
}
