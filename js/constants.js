// ═══════════════════════════════════════════════
// CONSTANTS.JS — Datos compartidos entre módulos
// ═══════════════════════════════════════════════

export const DEFAULT_SETTINGS = {
  auditPhaseActive: true,
  auditPhaseStart: new Date().toISOString().slice(0,10),
  payYourselfFirst: 20,
  currency: 'ARS',
  needs: 50, wants: 30, savings: 20,
  emergencyMonths: 6
};

export const ACCOUNT_TYPES = [
  { id:'banco',     label:'Banco / Cuenta bancaria', icon:'<i class="ph ph-bank"></i>', color:'#6366f1' },
  { id:'billetera', label:'Billetera Virtual',        icon:'<i class="ph ph-heart"></i>', color:'#8b5cf6' },
  { id:'efectivo',  label:'Efectivo / Caja',          icon:'<i class="ph ph-money"></i>', color:'#10b981' },
  { id:'inversion', label:'Inversión / Bróker',       icon:'<i class="ph ph-trend-up"></i>', color:'#f59e0b' },
];

export const DEFAULT_CATS = [
  // Ingresos
  {id:'ing-salario',    name:'Salario',             type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-briefcase"></i>'},
  {id:'ing-freelance',  name:'Freelance',            type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-laptop"></i>'},
  {id:'ing-negocio',    name:'Negocio / Comisión',   type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-buildings"></i>'},
  {id:'ing-renta',      name:'Renta cobrada',        type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-house"></i>'},
  {id:'ing-inversion',  name:'Rendimiento',          type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-trend-up"></i>'},
  {id:'ing-bono',       name:'Bono / Aguinaldo',     type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-gift"></i>'},
  {id:'ing-otro',       name:'Otro ingreso',         type:'ingreso', macro:'Ingresos',        icon:'<i class="ph ph-money"></i>'},
  // Necesidades
  {id:'gas-alquiler',   name:'Alquiler / Hipoteca',  type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-house"></i>'},
  {id:'gas-comida',     name:'Supermercado',         type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-shopping-cart"></i>'},
  {id:'gas-luz',        name:'Electricidad',         type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-lightbulb"></i>'},
  {id:'gas-agua',       name:'Agua',                 type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-shower"></i>'},
  {id:'gas-internet',   name:'Internet / Telefonía', type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-wifi-high"></i>'},
  {id:'gas-gas',        name:'Gas',                  type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-fire"></i>'},
  {id:'gas-transporte', name:'Transporte / SUBE',    type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-bus"></i>'},
  {id:'gas-salud',      name:'Salud / Obra social',  type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-hospital"></i>'},
  {id:'gas-seguro',     name:'Seguros',              type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-shield-check"></i>'},
  {id:'gas-educacion',  name:'Educación',            type:'egreso',  macro:'Gastos fijos',     icon:'<i class="ph ph-books"></i>'},
  // Estilo de vida
  {id:'gas-restaurant', name:'Restaurantes/Delivery',type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-fork-knife"></i>'},
  {id:'gas-entret',     name:'Entretenimiento',      type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-film-slate"></i>'},
  {id:'gas-ropa',       name:'Ropa / Calzado',       type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-dress"></i>'},
  {id:'gas-gym',        name:'Gym / Deporte',        type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-barbell"></i>'},
  {id:'gas-suscr',      name:'Suscripciones',        type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-device-mobile"></i>'},
  {id:'gas-viajes',     name:'Viajes / Vacaciones',  type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-airplane"></i>'},
  {id:'gas-regalos',    name:'Regalos',              type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-ribbon"></i>'},
  {id:'gas-belleza',    name:'Belleza / Personal',   type:'egreso',  macro:'Estilo de vida',  icon:'<i class="ph ph-nail-polish"></i>'},
  // Ahorro / Inversión
  {id:'gas-ahorro',     name:'Ahorro',               type:'egreso',  macro:'Ahorro/Inversión',icon:'<i class="ph ph-bank"></i>'},
  {id:'gas-inversion',  name:'Inversión',            type:'egreso',  macro:'Ahorro/Inversión',icon:'<i class="ph ph-chart-bar"></i>'},
  {id:'gas-fondo-em',   name:'Fondo emergencia',     type:'egreso',  macro:'Ahorro/Inversión',icon:'<i class="ph ph-shield-check"></i>'},
  // Deuda
  {id:'gas-tarjeta',    name:'Pago tarjeta',         type:'egreso',  macro:'Deuda',           icon:'<i class="ph ph-credit-card"></i>'},
  {id:'gas-prestamo',   name:'Cuota préstamo',       type:'egreso',  macro:'Deuda',           icon:'<i class="ph ph-bank"></i>'},
  // Varios
  {id:'gas-cafe',       name:'Café / Snacks',        type:'egreso',  macro:'Varios',          icon:'<i class="ph ph-coffee"></i>'},
  {id:'gas-propina',    name:'Propinas',             type:'egreso',  macro:'Varios',          icon:'<i class="ph ph-handshake"></i>'},
  {id:'gas-mascotas',   name:'Mascotas',             type:'egreso',  macro:'Varios',          icon:'<i class="ph ph-paw-print"></i>'},
  {id:'gas-otro',       name:'Otro gasto',           type:'egreso',  macro:'Varios',          icon:'<i class="ph ph-package"></i>'},
];

export const HABILIDADES = [
  {id:'movimientos', icon:'<i class="ph ph-credit-card"></i>', name:'Registro de movimientos', desc:'Ingresos, gastos y transferencias diarias.',        page:'movimientos'},
  {id:'presupuesto', icon:'<i class="ph ph-clipboard-text"></i>', name:'Presupuesto',              desc:'Seguimiento de gastos fijos, variables y ahorro.',  page:'presupuesto'},
  {id:'objetivos',   icon:'<i class="ph ph-shield-check"></i>', name:'Fondo de Emergencia',     desc:'Fondo de seguridad y otros objetivos.',             page:'objetivos'  },
  {id:'inversiones', icon:'<i class="ph ph-trend-up"></i>', name:'Inversiones',              desc:'Interés compuesto y cartera 80/20.',                page:'inversiones'},
  {id:'simulador',   icon:'<i class="ph ph-bank"></i>', name:'Simulador de crédito',     desc:'Calculadora de apalancamiento hipotecario.',        page:null         },
  {id:'credito',     icon:'<i class="ph ph-credit-card"></i>', name:'Crédito y Deuda',          desc:'Tarjetas y gestión de deuda.',                      page:'credito'    },
  {id:'reportes',    icon:'<i class="ph ph-chart-bar"></i>', name:'Reportes & Análisis',      desc:'Históricos, tendencias y top gastos.',              page:'reportes'   },
  {id:'graficos',    icon:'<i class="ph ph-trend-down"></i>', name:'Gráficos en dashboard',    desc:'Gráfico de gasto diario en la pantalla principal.', page:null         },
  {id:'educacion',   icon:'<i class="ph ph-graduation-cap"></i>', name:'Educación Financiera',     desc:'Conceptos y estrategias clave.',                    page:'educacion'  },
  {id:'exportar',    icon:'<i class="ph ph-download-simple"></i>', name:'Exportar datos',           desc:'Descargar backup en CSV/JSON.',                     page:null         },
  {id:'importar',    icon:'<i class="ph ph-upload-simple"></i>', name:'Importar datos',           desc:'Cargar transacciones desde CSV con plantilla.',     page:null         },
];

export const DEFAULT_HABS = {
  movimientos:true, presupuesto:false, objetivos:false,
  inversiones:false, simulador:false, credito:false,
  reportes:false, graficos:false, educacion:true,
  exportar:false, importar:false,
};

export const HABS_BY_SITUATION = {
  'basico':   {movimientos:true, presupuesto:false, objetivos:false, inversiones:false, simulador:false, credito:false, reportes:false, graficos:false, educacion:true,  exportar:false, importar:false},
  'medio':    {movimientos:true, presupuesto:true,  objetivos:true,  inversiones:false, simulador:false, credito:true,  reportes:false, graficos:false, educacion:true,  exportar:false, importar:false},
  'avanzado': {movimientos:true, presupuesto:true,  objetivos:true,  inversiones:true,  simulador:true,  credito:true,  reportes:true,  graficos:true,  educacion:true,  exportar:true,  importar:true },
};

// Utilitarios de formato
export function today() { return new Date().toISOString().slice(0,10); }
export function monthKey(d = new Date()) {
  return (typeof d === 'string' ? d : d.toISOString()).slice(0,7);
}
export function yearKey(d = new Date()) {
  return (typeof d === 'string' ? d : d.toISOString()).slice(0,4);
}
export function fmtDate(d) {
  return new Date(d+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'});
}
export function fmtDateFull(d) {
  return new Date(d+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
}
export function fmt(n, currency='ARS') {
  const sym = currency === 'USD' ? 'U$S ' : '$ ';
  return sym + Math.abs(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
export function fmtShort(n, currency='ARS') {
  const sym = currency === 'USD' ? 'U$S ' : '$ ';
  if (Math.abs(n) >= 1_000_000) return sym+(Math.abs(n)/1_000_000).toFixed(1)+'M';
  if (Math.abs(n) >= 1_000)     return sym+(Math.abs(n)/1_000).toFixed(0)+'K';
  return sym+Math.abs(n||0).toFixed(0);
}
export function scoreColor(s){ return s>=70?'var(--success)':s>=40?'var(--warning)':'var(--danger)'; }
export function scoreLabel(s){ return s>=70?'Saludable <i class="ph ph-heart"></i>':s>=40?'Atención <i class="ph ph-warning-circle"></i>':'Crítico <i class="ph ph-circle"></i>'; }
export function scoreClass(s){ return s>=70?'health-green':s>=40?'health-yellow':'health-red'; }
