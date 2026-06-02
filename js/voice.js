// ═══════════════════════════════════════════════
// VOICE.JS — Entrada por voz con globo de confirmación
// ═══════════════════════════════════════════════

// Palabras clave para tipos
const TYPE_KEYWORDS = {
  egreso:       ["gasté","gaste","pagué","pague","compré","compre","pago","gasto","compra"],
  ingreso:      ["cobré","cobr","recibí","recibi","gané","gane","ingresé","ingrese","ingreso","cobro","cobra","depósito","deposito","transferencia","honorarios","comisión","comisiones"],
  inversion:    ["invertí","invertiste","inversión","inversion","inversiones","invertido","cedear","acciones","plazo fijo","fci","fondo común"],
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
  "ing-negocio":   ["comisión","comision","honorarios","cobré","venta","inmueble","tasación","tasacion","tasa","consultoría","consultoria","proyecto","cliente"],
  "ing-freelance": ["freelance","trabajo","trabajé","trabaje","changa","proyecto freelance"],
  "ing-renta":     ["renta","alquiler cobrado","alquiler recibido","propiedad","inmueble alquilado"],
  "gas-inversion": ["invertí","invertiste","inversión","inversion","inversiones","invertido","cedear","acciones","compra acciones","plazo fijo","fci","fondo común","fondo inversión","bonos","letras"],
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
  let typeExplicit = false;

  if (TYPE_KEYWORDS.ahorroEgreso.some(k => lower.includes(k))) {
    type = "egreso"; categoryId = "gas-ahorro"; typeExplicit = true;
  } else if (TYPE_KEYWORDS.inversion.some(k => lower.includes(k))) {
    type = "egreso"; categoryId = "gas-inversion"; typeExplicit = true;
  } else if (TYPE_KEYWORDS.ingreso.some(k => lower.includes(k))) {
    type = "ingreso"; typeExplicit = true;
  } else if (TYPE_KEYWORDS.egreso.some(k => lower.includes(k))) {
    type = "egreso"; typeExplicit = true;
  }

  // Monto: primero busca número directo, luego palabras
  let amount = 0;
  // Une dígitos separados por espacio: "120 000" → "120000"
  const normalized = transcript.replace(/(\d)\s+(?=\d)/g, "$1");
  const numMatch = normalized.match(/(\d[\d.,]*)/);
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

  // Si no se dijo un tipo explícito pero la categoría es de ingreso, corregir tipo
  if (!typeExplicit && categoryId && categoryId.startsWith("ing-")) {
    type = "ingreso";
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

// Helpers para el portal estático en user/index.html
function portal()     { return document.getElementById("voice-portal"); }
function cardBody()   { return document.getElementById("voice-card-body"); }

function openBubble() {
  const p = portal(); if (!p) return;
  p.style.display = "flex";
  // Botón cerrar
  const closeBtn = document.getElementById("voice-portal-close");
  if (closeBtn) { closeBtn.onclick = dismissVoiceCard; }
  // Cerrar al tocar fuera (el overlay)
  p.onclick = e => { if (e.target === p) dismissVoiceCard(); };

  // Contenido inicial: barras + "escuchando"
  const body = cardBody(); if (!body) return;
  body.innerHTML = `
    <div style="display:flex;gap:5px;align-items:center;justify-content:center;height:44px;margin:8px 0" id="vjs-bars">
      <div style="width:4px;height:12px;border-radius:2px;background:#14b8a6;animation:vjsBar .5s ease-in-out .4s infinite alternate"></div>
      <div style="width:4px;height:26px;border-radius:2px;background:#14b8a6;animation:vjsBar .5s ease-in-out .6s infinite alternate"></div>
      <div style="width:4px;height:18px;border-radius:2px;background:#14b8a6;animation:vjsBar .5s ease-in-out .5s infinite alternate"></div>
      <div style="width:4px;height:30px;border-radius:2px;background:#14b8a6;animation:vjsBar .5s ease-in-out .7s infinite alternate"></div>
    </div>
    <div style="text-align:center;font-size:1rem;font-weight:600;color:#94a3b8;margin:8px 0 4px">Escuchando... hablá ahora</div>
    <div id="vjs-interim" style="font-style:italic;font-size:.9rem;color:#cbd5e1;text-align:center;min-height:24px;padding:4px 0"></div>`;

  // Inyectar animación una sola vez
  if (!document.getElementById("vjs-anim")) {
    const s = document.createElement("style"); s.id = "vjs-anim";
    s.textContent = `@keyframes vjsBar{0%{opacity:.3;transform:scaleY(.5)}100%{opacity:1;transform:scaleY(1.3)}}`;
    document.head.appendChild(s);
  }
}

function showResult(parsed) {
  const card = cardBody();
  if (!card) return;
  const cats = window._voiceCats || [];
  const cat  = cats.find(c => c.id === parsed.categoryId) || { name:"Otro", icon:"📦" };
  const esInv = parsed.type === "egreso" && cat?.macro === "Ahorro/Inversión";
  const typeLabel = parsed.type === "ingreso" ? "💰 Ingreso" : esInv ? "📊 Inversión" : "📤 Gasto";
  const amtFmt = parsed.amount
    ? "$ " + parsed.amount.toLocaleString("es-AR", {minimumFractionDigits:0})
    : "Monto no detectado";
  const amtColor = parsed.amount ? (parsed.type==="ingreso"?"#34d399":"#f87171") : "#f59e0b";

  card.innerHTML = "";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, { position:"absolute", top:"14px", right:"18px", background:"none", border:"none", color:"#64748b", fontSize:"1.3rem", cursor:"pointer", padding:"4px" });
  closeBtn.addEventListener("click", dismissVoiceCard);

  const box = document.createElement("div");
  Object.assign(box.style, { background:"#0f172a", borderRadius:"12px", padding:"14px 16px", margin:"8px 0 12px" });
  box.innerHTML = `
    <div style="font-style:italic;color:#94a3b8;font-size:.82rem;margin-bottom:10px">"${esc(parsed.transcript)}"</div>
    <div style="font-size:1rem;font-weight:600;margin-bottom:6px">${typeLabel} &nbsp;·&nbsp; ${cat.icon} ${esc(cat.name)}</div>
    <div style="font-size:1.6rem;font-weight:900;color:${amtColor}">${amtFmt}</div>`;

  const btns = document.createElement("div");
  Object.assign(btns.style, { display:"flex", gap:"10px", marginTop:"4px" });

  const editBtn = document.createElement("button");
  editBtn.textContent = "✎ Corregir";
  Object.assign(editBtn.style, { flex:"1", padding:"12px", border:"none", borderRadius:"40px", fontWeight:"700", fontSize:".9rem", cursor:"pointer", background:"#334155", color:"#f1f5f9" });
  editBtn.addEventListener("click", () => { if (_onConfirm) _onConfirm({...parsed, edit:true}); dismissVoiceCard(); });

  const okBtn = document.createElement("button");
  okBtn.textContent = "✅ Registrar";
  Object.assign(okBtn.style, { flex:"1", padding:"12px", border:"none", borderRadius:"40px", fontWeight:"700", fontSize:".9rem", cursor:"pointer", background:"#14b8a6", color:"#fff" });
  okBtn.addEventListener("click", () => { if (_onConfirm) _onConfirm(parsed); dismissVoiceCard(); });

  btns.appendChild(editBtn);
  btns.appendChild(okBtn);
  card.appendChild(closeBtn);
  card.appendChild(box);
  card.appendChild(btns);
}

export function dismissVoiceCard() {
  const p = portal();
  if (p) p.style.display = "none";
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
  if (!SR) { showVoiceError("Reconocimiento de voz no soportado. Usá Chrome o Edge."); return; }

  const r = new SR();
  _recognition = r;
  r.lang = "es";
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 3;

  let finalText = "";
  let silenceTimer = null;

  function resetSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (!finalText) {
        showVoiceRetry("No se detectó voz. Hablá más cerca del micrófono.");
        try { r.stop(); } catch {}
      }
    }, 7000);
  }

  r.onstart = () => {
    _listening = true;
    setFabState(true);
    resetSilenceTimer();
  };

  r.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText = t;
      else interim += t;
    }
    resetSilenceTimer();
    const el = document.getElementById("vjs-interim");
    if (el && !finalText) el.textContent = `"${interim}"`;
    if (finalText) {
      if (silenceTimer) clearTimeout(silenceTimer);
      _lastParsed = parseVoiceInput(finalText);
      showResult(_lastParsed);
      try { r.stop(); } catch {}
    }
  };

  r.onerror = e => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (e.error === "no-speech") {
      showVoiceRetry("No se detectó voz. Hablá más cerca del micrófono.");
    } else if (e.error === "not-allowed") {
      dismissVoiceCard();
      alert("Permiso de micrófono denegado. Habilitalo en la configuración del navegador.");
    } else if (e.error === "aborted") {
      // manual stop, ignore
    } else {
      showVoiceError(e.error || "Error de micrófono");
    }
  };

  r.onend = () => {
    _listening = false;
    setFabState(false);
    if (silenceTimer) clearTimeout(silenceTimer);
    if (!finalText && portal()?.style.display !== "none") {
      showVoiceRetry("No se detectó voz. Hablá más cerca del micrófono.");
    }
  };

  try {
    r.start();
  } catch(e) {
    showVoiceError(e.message || "Error al iniciar el micrófono");
  }
}

function showVoiceRetry(msg) {
  const card = cardBody();
  if (!card) return;
  card.innerHTML = `
    <div style="text-align:center;padding:8px 0">
      <div style="font-size:2rem;margin-bottom:8px">🎤</div>
      <div style="font-size:.95rem;font-weight:600;margin-bottom:6px">No se detectó voz</div>
      <div style="font-size:.82rem;color:#94a3b8;margin-bottom:16px">${msg}</div>
      <button onclick="window.toggleVoice()" style="padding:10px 24px;background:#14b8a6;color:#fff;border:none;border-radius:40px;font-weight:700;cursor:pointer;font-size:.9rem">🎤 Intentar de nuevo</button>
      <button onclick="window.dismissVoiceCard()" style="margin-left:10px;padding:10px 16px;background:#334155;color:#fff;border:none;border-radius:40px;font-weight:600;cursor:pointer;font-size:.9rem">Cancelar</button>
    </div>`;
}

function showVoiceError(msg) {
  const card = cardBody() || document.getElementById("voice-card");
  if (!card) return;
  card.innerHTML = `<div style="text-align:center;padding:12px"><div style="font-size:1.5rem;margin-bottom:8px">⚠️</div><div style="font-size:.9rem;color:#f87171">${msg}</div><button onclick="window.dismissVoiceCard()" style="margin-top:12px;padding:8px 20px;background:#334155;color:#fff;border:none;border-radius:20px;cursor:pointer">Cerrar</button></div>`;
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
