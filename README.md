# FinanceOS 💰
**Gestión financiera integral para equipos RE/MAX**

App mobile-first con Firebase, login por rol (Broker / Agente) y entrada por voz.

---

## Demo
> (Completar con URL de Firebase Hosting después del primer deploy)

---

## Stack
- **Frontend**: HTML + CSS + JS vanilla (ES Modules, sin build step)
- **Auth**: Firebase Authentication (email/password + Google)
- **DB**: Cloud Firestore
- **Hosting**: Firebase Hosting
- **CI/CD**: GitHub Actions → deploy automático en cada push a `main`

---

## Setup en 6 pasos

### 1. Clonar el repo
```bash
git clone https://github.com/TU_USUARIO/financeos.git
cd financeos
```

### 2. Crear proyecto en Firebase
1. Ir a [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → nombre: `financeos`
3. Habilitar **Authentication** → Sign-in method → Email/Password ✅ y Google ✅
4. Crear **Firestore Database** → modo producción
5. Ir a **Project Settings** → **Your apps** → `</>` Web → registrar app → copiar config

### 3. Configurar credenciales locales
```bash
cp js/firebase-config.example.js js/firebase-config.js
# Editar js/firebase-config.js con tus datos reales
```

### 4. Subir reglas de Firestore
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Secrets para GitHub Actions
En GitHub → Settings → Secrets → Actions, agregar:

| Secret | Valor |
|--------|-------|
| `FIREBASE_CONFIG_JSON` | Objeto JSON de la config de Firebase (sin `const ...=`) |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de la service account (Firebase → Project Settings → Service accounts) |
| `FIREBASE_PROJECT_ID` | ID del proyecto (ej: `financeos-abc12`) |

### 6. Primer deploy manual (opcional)
```bash
firebase deploy --only hosting
```

A partir de ahí, cada `git push origin main` despliega automáticamente.

---

## Cómo crear el primer Broker

1. Abrir la app en el navegador
2. Click en **"Soy Broker"** tab
3. Completar nombre, email, oficina y contraseña
4. La cuenta queda registrada con rol `broker`

## Cómo agregar Agentes

Desde el Panel del Broker → **Invitar Agente** (Fase 4 del desarrollo):
- Ingresar email del agente
- El sistema envía un email con link de registro
- El agente crea su contraseña
- El broker asigna las habilidades disponibles

---

## Estructura del proyecto

```
financeos/
├── index.html              ← Login (único entry point)
├── broker/
│   └── index.html          ← Dashboard del broker
├── agent/
│   └── index.html          ← Dashboard del agente
├── css/
│   └── styles.css          ← Estilos compartidos
├── js/
│   ├── firebase-config.js  ← Config Firebase (NO subir al repo)
│   ├── firebase-config.example.js
│   ├── auth.js             ← Login, logout, routing por rol
│   ├── broker-app.js       ← Lógica del broker (Fase 4)
│   ├── agent-app.js        ← Lógica del agente (Fase 5)
│   └── voice.js            ← Input por voz (Fase 6)
├── firestore.rules         ← Reglas de seguridad
├── firestore.indexes.json
├── firebase.json
├── .firebaserc
├── .github/workflows/
│   └── deploy.yml          ← CI/CD automático
└── README.md
```

---

## Fases de desarrollo

| Fase | Estado | Descripción |
|------|--------|-------------|
| 1 | ✅ | Estructura repo, login, routing por rol |
| 2 | 🔄 | Firebase Auth funcional + Firestore schema |
| 3 | ⏳ | DB layer → Firestore (migrar de localStorage) |
| 4 | ⏳ | Broker app completa |
| 5 | ⏳ | Agent app completa |
| 6 | ⏳ | Input por voz (Web Speech API) |
| 7 | ⏳ | Deploy + CI/CD |

---

## Licencia
MIT — RE/MAX Argentina · 2026
