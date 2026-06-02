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

// Usa word boundary para keywords cortos ("gas" no matchea dentro de "gasto")
function hasKeyword(text, kw) {
  const words = kw.split(/\s+/);
  if (words.length === 1) return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`, 'i').test(text);
  return text.toLowerCase().includes(kw);
}

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
  "gas-educacion": ["colegio","educación","educacion","escuela","jardín","jardin","profesor","curso","universidad","facultad","cuota colegio","cuota escolar","particular"],
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

  if (TYPE_KEYWORDS.ahorroEgreso.some(k => hasKeyword(lower, k))) {
    type = "egreso"; categoryId = "gas-ahorro"; typeExplicit = true;
  } else if (TYPE_KEYWORDS.inversion.some(k => hasKeyword(lower, k))) {
    type = "egreso"; categoryId = "gas-inversion"; typeExplicit = true;
  } else if (TYPE_KEYWORDS.ingreso.some(k => hasKeyword(lower, k))) {
    type = "ingreso"; typeExplicit = true;
  } else if (TYPE_KEYWORDS.egreso.some(k => hasKeyword(lower, k))) {
    type = "egreso"; typeExplicit = true;
  }

  // Monto: combina dígitos + palabras ("120 mil" = 120000)
  let amount = 0;
  const normalized = transcript.replace(/(\d)\s+(?=\d)/g, "$1");
  const numMatch = normalized.match(/(\d[\d.,]*)/);
  if (numMatch) {
    let raw = numMatch[0];
    // Comma como separador de miles ("10,000", "1,234,567")
    if (/,\d{3}/.test(raw)) {
      raw = raw.replace(/,/g, "");
    }
    // Punto como separador de miles ("10.000", "1.234.567")
    else if (/\.\d{3}/.test(raw) && raw.includes(".")) {
      raw = raw.replace(/\./g, "");
    }
    // Cualquier coma restante es decimal
    raw = raw.replace(",", ".");
    amount = parseFloat(raw) || 0;
  }
  // wordsToNumber suma "mil", "millón", etc. aunque haya dígitos
  const wordAmount = wordsToNumber(transcript) || 0;
  if (wordAmount > amount) amount = wordAmount;

  // Categoría
  if (!categoryId) {
    for (const [id, kws] of Object.entries(CATEGORY_KEYWORDS)) {
      if (kws.some(k => hasKeyword(lower, k))) { categoryId = id; break; }
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

// ═══════════════════════════════════════════════
// VOICE WIZARD — Formularios paso a paso por voz
// ═══════════════════════════════════════════════
// steps: [{ prompt, field, type, hint?, options?:[{value,label,keywords}], required? }]
// types: "text" | "amount" | "number" | "option"

let _wiz = null;  // wizard state

export function startVoiceWizard(steps, onComplete) {
  if (!voiceSupported) { alert("Reconocimiento de voz no disponible. Usá Chrome."); return; }
  _wiz = { steps, current: 0, data: {}, onComplete };
  _wizShowStep();
}

function _wizShowStep() {
  const { steps, current } = _wiz;
  const step = steps[current];
  const p = portal(); if (!p) return;
  p.style.display = "flex";

  const progress = `${current + 1} / ${steps.length}`;
  const pct = Math.round((current / steps.length) * 100);

  cardBody().innerHTML = `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:.72rem;color:#64748b;margin-bottom:5px">
        <span>Paso ${progress}</span>
        <span>${step.required === false ? 'Opcional' : ''}</span>
      </div>
      <div style="height:4px;background:#334155;border-radius:2px">
        <div style="width:${pct}%;height:100%;background:#14b8a6;border-radius:2px;transition:.3s"></div>
      </div>
    </div>
    <div style="text-align:center;margin:16px 0">
      <div style="font-size:1.15rem;font-weight:700;color:#f1f5f9;margin-bottom:6px">${esc(step.prompt)}</div>
      ${step.hint ? `<div style="font-size:.78rem;color:#64748b">Ej: "${esc(step.hint)}"</div>` : ''}
      ${step.options ? `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:10px">${step.options.map(o=>`<span style="background:#334155;color:#94a3b8;border-radius:20px;padding:4px 10px;font-size:.75rem">${esc(o.label)}</span>`).join('')}</div>` : ''}
    </div>
    <div style="display:flex;gap:6px;align-items:center;justify-content:center;height:36px;margin:10px 0" id="wiz-bars">
      ${['.4s','.6s','.5s','.7s'].map(d=>`<div style="width:4px;height:20px;border-radius:2px;background:#14b8a6;animation:vjsBar .5s ease-in-out ${d} infinite alternate"></div>`).join('')}
    </div>
    <div id="vjs-interim" style="font-style:italic;font-size:.88rem;color:#94a3b8;text-align:center;min-height:22px;margin-bottom:10px"></div>
    <div style="display:flex;gap:8px">
      ${step.required === false ? `<button onclick="window._wizSkip()" style="flex:1;padding:11px;border:none;border-radius:40px;background:#334155;color:#94a3b8;font-weight:600;cursor:pointer;font-size:.85rem">Saltar</button>` : ''}
      <button onclick="window._wizCancel()" style="flex:1;padding:11px;border:none;border-radius:40px;background:#1e3a5f;color:#94a3b8;font-weight:600;cursor:pointer;font-size:.85rem">Cancelar</button>
    </div>`;

  document.getElementById("voice-portal-close").onclick = window._wizCancel;
  _wizStartRec(step);
}

function _wizStartRec(step) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  if (_recognition && _listening) { try { _recognition.stop(); } catch {} }

  const r = new SR();
  _recognition = r; r.lang = "es"; r.interimResults = true; r.continuous = false;
  let final = "", timer = setTimeout(() => { if (!final) _wizNoSpeech(); r.stop(); }, 9000);

  r.onstart = () => { _listening = true; };
  r.onresult = e => {
    clearTimeout(timer);
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final = t; else interim += t;
    }
    const el = document.getElementById("vjs-interim");
    if (el && !final) el.textContent = `"${interim}"`;
    if (final) { _listening = false; _wizConfirm(step, final); r.stop(); }
  };
  r.onerror = e => { clearTimeout(timer); _listening = false; if (e.error !== "aborted") _wizNoSpeech(); };
  r.onend = () => { clearTimeout(timer); _listening = false; };
  try { r.start(); } catch(e) { _wizNoSpeech(); }
}

function _wizConfirm(step, transcript) {
  const value = _wizParse(step, transcript);
  const display = _wizDisplay(step, value);
  cardBody().innerHTML = `
    <div style="text-align:center;margin:8px 0 16px">
      <div style="font-size:.8rem;color:#64748b;margin-bottom:6px">${esc(step.prompt)}</div>
      <div style="font-size:1.1rem;font-style:italic;color:#94a3b8;margin-bottom:12px">"${esc(transcript)}"</div>
      <div style="background:#0f172a;border-radius:12px;padding:14px 16px;margin-bottom:16px">
        <div style="font-size:.72rem;color:#64748b;margin-bottom:4px">Detecté:</div>
        <div style="font-size:1.3rem;font-weight:800;color:#14b8a6">${esc(display)}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="window._wizRetry()" style="flex:1;padding:12px;border:none;border-radius:40px;background:#334155;color:#f1f5f9;font-weight:700;cursor:pointer">🔄 Repetir</button>
      <button onclick="window._wizAccept()" style="flex:1;padding:12px;border:none;border-radius:40px;background:#14b8a6;color:#fff;font-weight:700;cursor:pointer">✅ Correcto</button>
    </div>`;

  window._wizPendingValue = value;
  window._wizPendingStep  = step;
}

function _wizParse(step, text) {
  const lower = text.toLowerCase().trim();
  if (step.type === "amount") return wordsToNumber(text) || parseFloat(text.replace(/[^\d.,]/g,'').replace(',','.')) || 0;
  if (step.type === "number") {
    const n = wordsToNumber(text) || parseInt(text.match(/\d+/)?.[0]);
    return isNaN(n) ? null : n;
  }
  if (step.type === "option" && step.options) {
    const match = step.options.find(o => (o.keywords || [o.label.toLowerCase()]).some(k => lower.includes(k)));
    return match ? match.value : step.options[0].value;
  }
  return text.trim();
}

function _wizDisplay(step, value) {
  if (step.type === "amount") return "$ " + (value||0).toLocaleString("es-AR");
  if (step.type === "option" && step.options) {
    const opt = step.options.find(o => o.value === value);
    return opt ? opt.label : value;
  }
  return value ?? "—";
}

function _wizNoSpeech() {
  cardBody().innerHTML = `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:2rem;margin-bottom:8px">🎤</div>
      <div style="font-size:.9rem;font-weight:600;margin-bottom:6px">No se detectó voz</div>
      <div style="font-size:.8rem;color:#64748b;margin-bottom:14px">Hablá más cerca del micrófono</div>
      <button onclick="window._wizRetry()" style="padding:10px 20px;background:#14b8a6;color:#fff;border:none;border-radius:40px;font-weight:700;cursor:pointer;margin-right:8px">🎤 Reintentar</button>
      <button onclick="window._wizCancel()" style="padding:10px 16px;background:#334155;color:#f1f5f9;border:none;border-radius:40px;font-weight:600;cursor:pointer">Cancelar</button>
    </div>`;
}

// Controles del wizard expuestos globalmente
window._wizAccept = () => {
  const { field } = window._wizPendingStep;
  _wiz.data[field] = window._wizPendingValue;
  _wiz.current++;
  if (_wiz.current >= _wiz.steps.length) _wizFinish();
  else _wizShowStep();
};
window._wizSkip   = () => { _wiz.current++; if (_wiz.current >= _wiz.steps.length) _wizFinish(); else _wizShowStep(); };
window._wizRetry  = () => _wizShowStep();
window._wizCancel = () => { _wiz = null; dismissVoiceCard(); };

function _wizFinish() {
  const data = _wiz.data;
  const onComplete = _wiz.onComplete;
  _wiz = null;
  dismissVoiceCard();
  onComplete(data);
}
