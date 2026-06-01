// ═══════════════════════════════════════════════
// VOICE.JS — Input por voz (Web Speech API)
// Fase 6: implementación completa
// Fase 2: stub funcional con UI
// ═══════════════════════════════════════════════
import { DEFAULT_CATS, fmt } from './constants.js';

// ── Soporte del navegador ─────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SpeechRecognition;

let recognition  = null;
let isListening  = false;
let onResultCb   = null;  // callback: (parsedTx) => void

// ── Init ─────────────────────────────────────────────
export function initVoice(onResult) {
  onResultCb = onResult;
  const fab  = document.getElementById('voice-fab');
  if (!fab) return;

  if (!voiceSupported) {
    fab.title = 'Tu navegador no soporta reconocimiento de voz (usá Chrome)';
    fab.style.opacity = '0.4';
    fab.style.cursor  = 'not-allowed';
    fab.onclick = () => showVoiceNotSupported();
    return;
  }

  fab.classList.remove('hidden');
  setupRecognition();
}

function setupRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang        = 'es-AR';
  recognition.continuous  = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const confidence = event.results[0][0].confidence;
    stopListening();
    processTranscript(transcript, confidence);
  };

  recognition.onerror = (event) => {
    stopListening();
    if (event.error === 'not-allowed') {
      showToast('❌ Permiso de micrófono denegado. Habilitalo en la configuración del navegador.');
    } else if (event.error !== 'no-speech') {
      showToast('No pude escucharte. Intentá de nuevo.');
    }
  };

  recognition.onend = () => {
    if (isListening) stopListening();
  };
}

// ── Toggle ─────────────────────────────────────────────
export function toggleVoice() {
  if (!voiceSupported) { showVoiceNotSupported(); return; }
  isListening ? stopListening() : startListening();
}

function startListening() {
  try {
    dismissVoiceCard();
    recognition.start();
    isListening = true;
    const fab     = document.getElementById('voice-fab');
    const tooltip = document.getElementById('voice-tooltip');
    const icon    = document.getElementById('voice-icon');
    if (fab)     fab.classList.add('listening');
    if (tooltip) tooltip.textContent = 'Escuchando... hablá ahora';
    if (icon)    icon.textContent    = '🔴';
  } catch (e) {
    console.error('Voice start error:', e);
  }
}

function stopListening() {
  isListening = false;
  try { recognition?.stop(); } catch {}
  const fab     = document.getElementById('voice-fab');
  const tooltip = document.getElementById('voice-tooltip');
  const icon    = document.getElementById('voice-icon');
  if (fab)     fab.classList.remove('listening');
  if (tooltip) tooltip.textContent = 'Decí un gasto o ingreso';
  if (icon)    icon.textContent    = '🎤';
}

// ── Parser de lenguaje natural en español ─────────────
// Frases soportadas:
//   "Gasté mil quinientos en supermercado"
//   "Cobré cincuenta mil de comisión"
//   "Pagué doce mil de alquiler"
//   "Transferí veinte mil a Mercado Pago"
//   "Guardé diez mil de ahorro"

const NUMBER_MAP = {
  'cero':0,'un':1,'una':1,'dos':2,'tres':3,'cuatro':4,'cinco':5,
  'seis':6,'siete':7,'ocho':8,'nueve':9,'diez':10,'once':11,
  'doce':12,'trece':13,'catorce':14,'quince':15,'dieciséis':16,
  'diecisiete':17,'dieciocho':18,'diecinueve':19,
  'veinte':20,'veintiún':21,'veintiuno':21,'veintidós':22,'veintitrés':23,
  'veinticuatro':24,'veinticinco':25,'veintiséis':26,'veintisiete':27,
  'veintiocho':28,'veintinueve':29,
  'treinta':30,'cuarenta':40,'cincuenta':50,'sesenta':60,
  'setenta':70,'ochenta':80,'noventa':90,
  'cien':100,'ciento':100,'doscientos':200,'trescientos':300,
  'cuatrocientos':400,'quinientos':500,'seiscientos':600,
  'setecientos':700,'ochocientos':800,'novecientos':900,
  'mil':1000,'millon':1000000,'millón':1000000,
};

const INGRESO_KEYWORDS = ['cobré','cobré','cobr','recibí','recibí','recibi','ingresé','ingresé','ingrese','gané','gané','gane','entró','entro','deposité','deposite'];
const EGRESO_KEYWORDS  = ['gasté','gaste','pagué','pague','compré','compre','salió','salio','gaté','gaste','erogué','erogue'];
const TRASLADO_KEYWORDS = ['transferí','transferi','moví','movi','pasé','pase','mandé','mande'];
const AHORRO_KEYWORDS   = ['ahorré','ahorre','guardé','guarde','invertí','invert'];

const CATEGORY_MAP = {
  'gas-comida':     ['supermercado','almacén','almacen','carnicería','carniceria','verdulería','verduleria','kiosco','feria','mercado','comida','fiambrería','fiambr'],
  'gas-restaurant': ['restaurant','restaurante','delivery','pedidos ya','rappi','mcdonald','burger','pizza','sushi','empanada','almuerzo','cena','lunch'],
  'gas-cafe':       ['café','cafe','bar','confitería','confiteria','medialunas','facturas','tostado','desayuno'],
  'gas-alquiler':   ['alquiler','alquilé','alquile','hipoteca','rent','renta'],
  'gas-luz':        ['luz','electricidad','edesur','edenor','cammesa','eléctrica','electrica'],
  'gas-gas':        ['gas','metrogas','naturgy','gasnor'],
  'gas-agua':       ['agua','aysa','absa'],
  'gas-internet':   ['internet','wifi','fibertel','claro','personal','movistar','telefonía','telefonia','celular','teléfono','telefono','cable','telecom'],
  'gas-transporte': ['sube','colectivo','subte','tren','taxi','uber','cabify','remís','remis','nafta','combustible','gasoil','transporte','estacionamiento'],
  'gas-salud':      ['salud','médico','medico','farmacia','obra social','prepaga','consultorio','laboratorio','hospital','clínica','clinica','dentista','odontólogo','odonotolog'],
  'gas-gym':        ['gym','gimnasio','deporte','fitness','running','crossfit','yoga','pilates'],
  'gas-ropa':       ['ropa','calzado','zapatillas','indumentaria','zapatos','camisa','pantalón','pantalon','vestido','vestimenta'],
  'gas-suscr':      ['netflix','spotify','amazon','disney','hbo','youtube','suscripción','suscripcion','streaming','apple','google one'],
  'gas-viajes':     ['viaje','hotel','vuelo','airbnb','turismo','vacaciones','excursión','excursion'],
  'gas-seguro':     ['seguro','póliza','poliza','sancor','rivadavia','aseguradora'],
  'gas-ahorro':     ['ahorro','ahorré','ahorre','guardé','guarde','fondo'],
  'gas-inversion':  ['inversión','inversion','cedear','bono','plazo fijo','crypto','cripto','bitcoin','dólar dólar','dolar','acciones'],
  'gas-tarjeta':    ['tarjeta','visa','mastercard','amex','naranja'],
  'gas-prestamo':   ['préstamo','prestamo','cuota','crédito','credito','banco'],
  'gas-educacion':  ['curso','libro','capacitación','capacitacion','colegio','escuela','facultad','universidad','seminario'],
  'gas-mascotas':   ['mascota','veterinario','perro','gato','veterinaria','pet'],
  'gas-regalos':    ['regalo','presente','cumpleaños','cumpleanos'],
  'gas-otro':       [],
  'ing-salario':    ['salario','sueldo','haberes','quincena','mensual'],
  'ing-negocio':    ['comisión','comision','honorarios','factura','cobro','venta','inmueble','propiedad'],
  'ing-freelance':  ['freelance','proyecto','trabajo','servicio','consultoria','consultoría'],
  'ing-inversion':  ['rendimiento','dividendo','interés','interes','plazo','fondo','cedear','bono'],
  'ing-renta':      ['alquiler cobrado','renta cobrada','inquilino','locatario'],
  'ing-bono':       ['bono','aguinaldo','sac','plus','premio'],
  'ing-otro':       ['reintegro','devolución','devolucion','transferencia','cobro'],
};

function parseAmount(text) {
  // Primero: números directos "1500", "50.000", "1.500,00"
  const numMatch = text.match(/[\d]+(?:[.,]\d+)*/g);
  if (numMatch) {
    const cleaned = numMatch[0].replace(/\./g,'').replace(',','.');
    const val = parseFloat(cleaned);
    if (!isNaN(val) && val > 0) return val;
  }

  // Segundo: palabras numéricas
  const words = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/\s+/);
  let total = 0, current = 0, multiplied = false;

  for (const w of words) {
    const num = NUMBER_MAP[w];
    if (num === undefined) continue;
    if (num === 1000) {
      if (current === 0) current = 1;
      current *= 1000; total += current; current = 0; multiplied = true;
    } else if (num === 1_000_000) {
      if (current === 0) current = 1;
      current *= 1_000_000; total += current; current = 0; multiplied = true;
    } else {
      current += num;
    }
  }
  total += current;
  return total > 0 ? total : null;
}

function detectType(text) {
  const lower = text.toLowerCase();
  if (AHORRO_KEYWORDS.some(k  => lower.includes(k))) return 'ahorro';
  if (TRASLADO_KEYWORDS.some(k => lower.includes(k))) return 'traslado';
  if (INGRESO_KEYWORDS.some(k  => lower.includes(k))) return 'ingreso';
  if (EGRESO_KEYWORDS.some(k   => lower.includes(k))) return 'egreso';
  // Default: egreso (más común en uso diario)
  return 'egreso';
}

function detectCategory(text, type) {
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  for (const [catId, keywords] of Object.entries(CATEGORY_MAP)) {
    // Filtrar por tipo
    const cat = DEFAULT_CATS.find(c => c.id === catId);
    if (!cat) continue;
    if (type === 'ingreso' && cat.type !== 'ingreso') continue;
    if (type !== 'ingreso' && cat.type !== 'egreso') continue;
    if (keywords.some(k => lower.includes(k.normalize('NFD').replace(/[̀-ͯ]/g,'')))) {
      return catId;
    }
  }
  return type === 'ingreso' ? 'ing-otro' : 'gas-otro';
}

function buildDescription(text, amount, type) {
  // Limpiar palabras de trigger y monto para quedarnos con la descripción útil
  const stopWords = [...INGRESO_KEYWORDS, ...EGRESO_KEYWORDS, ...TRASLADO_KEYWORDS, ...AHORRO_KEYWORDS,
    'pesos','peso','plata','dinero','de','en','por','para','el','la','un','una','del','al'];
  return text
    .split(/\s+/)
    .filter(w => {
      const n = w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      return !stopWords.includes(n) && !NUMBER_MAP[n] && !/^\d+$/.test(w);
    })
    .join(' ')
    .trim()
    .slice(0, 60) || text.slice(0, 60);
}

function processTranscript(transcript, confidence) {
  const type      = detectType(transcript);
  const amount    = parseAmount(transcript);
  const categoryId = detectCategory(transcript, type);
  const cat       = DEFAULT_CATS.find(c => c.id === categoryId);
  const desc      = buildDescription(transcript, amount, type);

  const parsed = { type, amount, categoryId, description: desc, transcript, confidence };

  // Mostrar en la voice result card
  showVoiceResult(transcript, parsed, cat);

  // Callback al app para que pueda pre-cargar el formulario
  if (onResultCb) onResultCb(parsed);
}

// ── UI ─────────────────────────────────────────────────
function showVoiceResult(transcript, parsed, cat) {
  const card = document.getElementById('voice-result-card');
  if (!card) return;

  const typeLabel = {
    ingreso:  '💰 Ingreso',
    egreso:   '📤 Gasto',
    traslado: '🔄 Transferencia',
    ahorro:   '🏦 Ahorro',
  }[parsed.type] || '📤 Gasto';

  const amountStr = parsed.amount
    ? `<span style="color:var(--${parsed.type==='ingreso'?'success':'danger'})">$${parsed.amount.toLocaleString('es-AR')}</span>`
    : '<span style="color:var(--warning)">Monto no detectado</span>';

  document.getElementById('vr-transcript').textContent = `"${transcript}"`;
  document.getElementById('vr-parsed').innerHTML =
    `${typeLabel} · ${amountStr} · ${cat ? cat.icon+' '+cat.name : '?'}`;

  // Guardamos parsed para el botón confirmar/editar
  card.dataset.parsed = JSON.stringify(parsed);
  card.style.display  = 'block';
}

export function dismissVoiceCard() {
  const card = document.getElementById('voice-result-card');
  if (card) card.style.display = 'none';
}

// confirmVoiceTx y editVoiceTx son llamados desde el HTML del agente
// y se conectan al módulo de transacciones vía callback
export function getVoiceParsed() {
  const card = document.getElementById('voice-result-card');
  if (!card || !card.dataset.parsed) return null;
  try { return JSON.parse(card.dataset.parsed); } catch { return null; }
}

function showVoiceNotSupported() {
  showToast('🎤 Tu navegador no soporta reconocimiento de voz. Usá Google Chrome o Microsoft Edge.');
}

function showToast(msg, duration = 3500) {
  const existing = document.getElementById('voice-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'voice-toast';
  toast.style.cssText = `
    position:fixed;bottom:calc(var(--nav-h,64px) + 80px + env(safe-area-inset-bottom,0px));
    left:50%;transform:translateX(-50%);
    background:var(--surface2,#334155);color:var(--text,#f1f5f9);
    padding:10px 18px;border-radius:20px;font-size:.82rem;font-weight:600;
    z-index:999;white-space:nowrap;box-shadow:0 4px 16px #0006;
    animation:fadeIn .2s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
