// ═══════════════════════════════════════════════
// VOICE.JS — Entrada por voz con globo de confirmación
// ═══════════════════════════════════════════════

// Palabras clave para tipos
const TYPE_KEYWORDS = {
  egreso:       ["gasté","gaste","pagué","pague","compré","compre"],
  ingreso:      ["cobré","cobr","recibí","recibi","gané","gane","ingresé","ingrese"],
  ahorroEgreso: ["guardé","guarde","ahorré","ahorre"],
};

const CATEGORY_KEYWORDS = {
  "gas-comida":    ["supermercado","verdulería","verduler","almacén","almacen","carnicería","comida","feria","mercado"],
  "gas-alquiler":  ["alquiler","hipoteca"],
  "gas-luz":       ["luz","electricidad","edesur","edenor"],
  "gas-gas":       ["gas","metrogas","naturgy"],
  "gas-agua":      ["agua","aysa"],
  "gas-internet":  ["internet","wifi","fibertel","claro","movistar","personal","telefonía","cable"],
  "gas-transporte":["transporte","sube","colectivo","subte","tren","taxi","uber","cabify","nafta","combustible"],
  "gas-salud":     ["médico","medico","farmacia","salud","obra social","prepaga","consultorio"],
  "gas-restaurant":["restaurante","delivery","sushi","pizza","empanada","almuerzo","cena","pedidos"],
  "gas-entret":    ["entretenimiento","cine","teatro","evento"],
  "gas-ropa":      ["ropa","zapatillas","calzado","indumentaria"],
  "gas-gym":       ["gym","gimnasio","deporte","fitness","yoga"],
  "gas-suscr":     ["netflix","spotify","amazon","disney","suscripción","suscripcion","streaming"],
  "gas-viajes":    ["viaje","hotel","vuelo","airbnb","vacaciones"],
  "gas-cafe":      ["café","cafe","bar","medialunas","facturas","desayuno","confitería"],
  "gas-ahorro":    ["ahorro","ahorré","ahorre","guardé","guarde","fondo"],
  "ing-salario":   ["salario","sueldo","haberes","quincena"],
  "ing-negocio":   ["comisión","comision","honorarios","cobré","venta","inmueble"],
};

const NUM_WORDS = {
  "un":1,"uno":1,"una":1,"dos":2,"tres":3,"cuatro":4,"cinco":5,
  "seis":6,"siete":7,"ocho":8,"nueve":9,"diez":10,"once":11,"doce":12,
  "trece":13,"catorce":14,"quince":15,"veinte":20,"treinta":30,
  "cuarenta":40,"cincuenta":50,"sesenta":60,"setenta":70,"ochenta":80,"noventa":90,
  "cien":100,"ciento":100,"doscientos":200,"trescientos":300,"cuatrocientos":400,
  "quinientos":500,"seiscientos":600,"setecientos":700,"ochocientos":800,"novecientos":900,
  "mil":1000,"millon":1000000,"millón":1000000,"millones":1000000,
};

function wordsToNumber(text) {
  const lower = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const parts  = lower.split(/\s+/);
  let total = 0, current = 0;
  for (const p of parts) {
    const n = NUM_WORDS[p];
    if (n === undefined) { const d = parseInt(p); if (!isNaN(d)) current += d; continue; }
    if (n >= 1000) { total += (current || 1) * n; current = 0; }
    else current += n;
  }
  return total + current || null;
}

export function parseVoiceInput(transcript) {
  const lower = transcript.toLowerCase();
  let type = "egreso", categoryId = null;

  if (TYPE_KEYWORDS.ahorroEgreso.some(k => lower.includes(k))) {
    type = "egreso"; categoryId = "gas-ahorro";
  } else if (TYPE_KEYWORDS.ingreso.some(k => lower.includes(k))) {
    type = "ingreso";
  } else if (TYPE_KEYWORDS.egreso.some(k => lower.includes(k))) {
    type = "egreso";
  }

  // Monto: primero busca número directo, luego palabras
  let amount = 0;
  const numMatch = transcript.match(/(\d[\d.,]*)/);
  if (numMatch) {
    amount = parseFloat(numMatch[0].replace(/\./g,"").replace(",",".")) || 0;
  }
  if (!amount) amount = wordsToNumber(transcript) || 0;

  // Categoría
  if (!categoryId) {
    for (const [id, kws] of Object.entries(CATEGORY_KEYWORDS)) {
      if (kws.some(k => lower.includes(k))) { categoryId = id; break; }
    }
  }
  if (!categoryId) categoryId = type === "ingreso" ? "ing-otro" : "gas-otro";

  return { type, amount, categoryId, description: transcript.trim(), transcript, confidence: 0.85 };
}

// ═══════════════════════════════════════════════
// UI — Globo de confirmación
// ═══════════════════════════════════════════════
let _onConfirm = null;
let _recognition = null;
let _listening = false;
let _lastParsed = null;
let _bubble = null;

export const voiceSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

function injectStyles() {
  if (document.getElementById("vjs-styles")) return;
  const s = document.createElement("style");
  s.id = "vjs-styles";
  s.textContent = `
    .vjs-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);z-index:2147483647;display:flex;align-items:flex-end;justify-content:center}
    .vjs-card{background:#1e293b;border-radius:18px 18px 0 0;width:100%;max-width:500px;padding:22px 24px 28px;color:#f1f5f9;box-shadow:0 -4px 24px rgba(0,0,0,.4);animation:vjsUp .25s ease-out;position:relative}
    @keyframes vjsUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
    .vjs-close{position:absolute;top:14px;right:18px;background:none;border:none;color:#64748b;font-size:1.3rem;cursor:pointer;line-height:1;padding:4px}
    .vjs-close:hover{color:#f1f5f9}
    .vjs-bars{display:flex;gap:5px;align-items:center;justify-content:center;height:44px;margin:8px 0}
    .vjs-bar{width:4px;border-radius:2px;background:#14b8a6;animation:vjsBar .5s ease-in-out infinite alternate}
    .vjs-bar:nth-child(1){height:12px;animation-duration:.4s}
    .vjs-bar:nth-child(2){height:26px;animation-duration:.6s}
    .vjs-bar:nth-child(3){height:18px;animation-duration:.5s}
    .vjs-bar:nth-child(4){height:30px;animation-duration:.7s}
    @keyframes vjsBar{0%{opacity:.35;transform:scaleY(.6)}100%{opacity:1;transform:scaleY(1.15)}}
    .vjs-title{text-align:center;font-size:1rem;font-weight:600;margin:8px 0 4px;color:#94a3b8}
    .vjs-interim{font-style:italic;font-size:.9rem;color:#cbd5e1;text-align:center;min-height:24px;padding:4px 0}
    .vjs-result-box{background:#0f172a;border-radius:12px;padding:14px 16px;margin:12px 0}
    .vjs-transcript{font-style:italic;color:#94a3b8;font-size:.82rem;margin-bottom:10px}
    .vjs-detected{font-size:1rem;font-weight:600;margin-bottom:6px}
    .vjs-amount{font-size:1.6rem;font-weight:900;margin-top:6px}
    .vjs-btns{display:flex;gap:10px;margin-top:16px}
    .vjs-btn{flex:1;padding:12px;border:none;border-radius:40px;font-weight:700;font-size:.9rem;cursor:pointer;transition:.15s}
    .vjs-btn:active{transform:scale(.96)}
    .vjs-btn-ok{background:#14b8a6;color:#fff}
    .vjs-btn-ok:hover{background:#0d9488}
    .vjs-btn-edit{background:#334155;color:#f1f5f9}
    .vjs-btn-edit:hover{background:#475569}
  `;
  document.head.appendChild(s);
}

function openBubble() {
  if (_bubble) { _bubble.remove(); _bubble = null; }
  injectStyles();
  _bubble = document.createElement("div");
  _bubble.className = "vjs-overlay";
  _bubble.innerHTML = `<div class="vjs-card">
    <button class="vjs-close" id="vjs-x">✕</button>
    <div class="vjs-bars">
      <div class="vjs-bar"></div><div class="vjs-bar"></div>
      <div class="vjs-bar"></div><div class="vjs-bar"></div>
    </div>
    <div class="vjs-title">Escuchando... hablá ahora</div>
    <div class="vjs-interim" id="vjs-interim"></div>
  </div>`;
  document.body.appendChild(_bubble);
  // Cerrar al tocar fuera
  _bubble.addEventListener("click", e => { if (e.target === _bubble) dismissVoiceCard(); });
  document.getElementById("vjs-x").addEventListener("click", dismissVoiceCard);
}

function showResult(parsed) {
  if (!_bubble) return;
  const cats = window._voiceCats || [];
  const cat  = cats.find(c => c.id === parsed.categoryId) || { name: "Otro", icon: "📦" };
  const typeLabel = parsed.type === "ingreso" ? "💰 Ingreso" : "📤 Gasto";
  const amtFmt = parsed.amount
    ? "$ " + parsed.amount.toLocaleString("es-AR", {minimumFractionDigits:0})
    : "Monto no detectado";
  const amtColor = parsed.amount ? (parsed.type==="ingreso"?"#34d399":"#f87171") : "#f59e0b";

  _bubble.querySelector(".vjs-card").innerHTML = `
    <button class="vjs-close" id="vjs-x">✕</button>
    <div class="vjs-result-box">
      <div class="vjs-transcript">"${esc(parsed.transcript)}"</div>
      <div class="vjs-detected">${typeLabel} &nbsp;·&nbsp; ${cat.icon} ${esc(cat.name)}</div>
      <div class="vjs-amount" style="color:${amtColor}">${amtFmt}</div>
    </div>
    <div class="vjs-btns">
      <button class="vjs-btn vjs-btn-edit" id="vjs-edit">✎ Corregir</button>
      <button class="vjs-btn vjs-btn-ok"   id="vjs-ok">✅ Registrar</button>
    </div>`;

  document.getElementById("vjs-x").addEventListener("click", dismissVoiceCard);
  document.getElementById("vjs-edit").addEventListener("click", () => {
    if (_onConfirm) _onConfirm({ ...parsed, edit: true });
    dismissVoiceCard();
  });
  document.getElementById("vjs-ok").addEventListener("click", () => {
    if (_onConfirm) _onConfirm(parsed);
    dismissVoiceCard();
  });
}

export function dismissVoiceCard() {
  if (_bubble) { _bubble.remove(); _bubble = null; }
  if (_recognition && _listening) { try { _recognition.stop(); } catch {} }
  _listening = false;
  setFabState(false);
}

function setFabState(active) {
  const fab = document.getElementById("voice-fab");
  if (!fab) return;
  if (active) fab.classList.add("listening");
  else        fab.classList.remove("listening");
}

// ═══════════════════════════════════════════════
// RECONOCIMIENTO
// ═══════════════════════════════════════════════
function startRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  const r = new SR();
  _recognition = r;
  r.lang = "es-AR";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 3;

  let finalText = "";

  r.onstart = () => {
    _listening = true;
    setFabState(true);
    // burbuja ya está abierta desde toggleVoice
  };

  r.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText = t;
      else interim += t;
    }
    // Actualizar texto parcial
    const el = document.getElementById("vjs-interim");
    if (el && !finalText) el.textContent = `"${interim}"`;
    // Si tenemos resultado final, mostrar resultado
    if (finalText) {
      _lastParsed = parseVoiceInput(finalText);
      showResult(_lastParsed);
    }
  };

  r.onerror = e => {
    if (e.error === "no-speech") {
      dismissVoiceCard();
    } else if (e.error === "not-allowed") {
      dismissVoiceCard();
      alert("Permiso de micrófono denegado. Habilitalo en la configuración del navegador.");
    } else {
      dismissVoiceCard();
    }
  };

  r.onend = () => {
    _listening = false;
    setFabState(false);
    if (!finalText && _bubble) {
      // Mostrar mensaje de "no se detectó voz"
      const card = _bubble.querySelector(".vjs-card");
      if (card) card.innerHTML = `
        <div style="text-align:center;padding:8px 0">
          <div style="font-size:2rem;margin-bottom:8px">🎤</div>
          <div style="font-size:.95rem;font-weight:600;margin-bottom:6px">No se detectó voz</div>
          <div style="font-size:.82rem;color:#94a3b8;margin-bottom:16px">Hablá más cerca del micrófono e intentá de nuevo</div>
          <button onclick="window.toggleVoice()" style="padding:10px 24px;background:#14b8a6;color:#fff;border:none;border-radius:40px;font-weight:700;cursor:pointer;font-size:.9rem">🎤 Intentar de nuevo</button>
          <button onclick="window.dismissVoiceCard()" style="margin-left:10px;padding:10px 16px;background:#334155;color:#fff;border:none;border-radius:40px;font-weight:600;cursor:pointer;font-size:.9rem">Cancelar</button>
        </div>`;
    }
  };

  r.start();
}

// ═══════════════════════════════════════════════
// EXPORTS PRINCIPALES
// ═══════════════════════════════════════════════
export function initVoice(onConfirm, cats) {
  _onConfirm = onConfirm;
  if (cats) window._voiceCats = cats;

  const fab = document.getElementById("voice-fab");
  if (!fab) return;

  fab.classList.remove("hidden");

  if (!voiceSupported) {
    fab.style.opacity = ".4";
    fab.style.cursor  = "not-allowed";
    // Reemplazar onclick solo si no hay soporte
    fab.onclick = () => alert("Tu navegador no soporta reconocimiento de voz.\nUsá Google Chrome o Microsoft Edge.");
  }
  // El click lo maneja window.toggleVoice (asignado en user-app.js)
  // desde el onclick="toggleVoice()" del HTML — no agregar segundo listener
}

export function toggleVoice() {
  if (_listening) {
    dismissVoiceCard();
  } else {
    // Abrir burbuja ANTES de iniciar reconocimiento (garantiza visibilidad)
    openBubble();
    startRecognition();
  }
}

export function getVoiceParsed() { return _lastParsed; }

function esc(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
