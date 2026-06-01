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
  { id:'banco',     label:'Banco / Cuenta bancaria', icon:'🏦', color:'#6366f1' },
  { id:'billetera', label:'Billetera Virtual',        icon:'💜', color:'#8b5cf6' },
  { id:'efectivo',  label:'Efectivo / Caja',          icon:'💵', color:'#10b981' },
  { id:'inversion', label:'Inversión / Bróker',       icon:'📈', color:'#f59e0b' },
];

export const DEFAULT_CATS = [
  // Ingresos
  {id:'ing-salario',    name:'Salario',             type:'ingreso', macro:'Ingresos',        icon:'💼'},
  {id:'ing-freelance',  name:'Freelance',            type:'ingreso', macro:'Ingresos',        icon:'💻'},
  {id:'ing-negocio',    name:'Negocio / Comisión',   type:'ingreso', macro:'Ingresos',        icon:'🏢'},
  {id:'ing-renta',      name:'Renta cobrada',        type:'ingreso', macro:'Ingresos',        icon:'🏠'},
  {id:'ing-inversion',  name:'Rendimiento',          type:'ingreso', macro:'Ingresos',        icon:'📈'},
  {id:'ing-bono',       name:'Bono / Aguinaldo',     type:'ingreso', macro:'Ingresos',        icon:'🎁'},
  {id:'ing-otro',       name:'Otro ingreso',         type:'ingreso', macro:'Ingresos',        icon:'💰'},
  // Necesidades
  {id:'gas-alquiler',   name:'Alquiler / Hipoteca',  type:'egreso',  macro:'Necesidades',     icon:'🏠'},
  {id:'gas-comida',     name:'Supermercado',         type:'egreso',  macro:'Necesidades',     icon:'🛒'},
  {id:'gas-luz',        name:'Electricidad',         type:'egreso',  macro:'Necesidades',     icon:'💡'},
  {id:'gas-agua',       name:'Agua',                 type:'egreso',  macro:'Necesidades',     icon:'🚿'},
  {id:'gas-internet',   name:'Internet / Telefonía', type:'egreso',  macro:'Necesidades',     icon:'📶'},
  {id:'gas-gas',        name:'Gas',                  type:'egreso',  macro:'Necesidades',     icon:'🔥'},
  {id:'gas-transporte', name:'Transporte / SUBE',    type:'egreso',  macro:'Necesidades',     icon:'🚌'},
  {id:'gas-salud',      name:'Salud / Obra social',  type:'egreso',  macro:'Necesidades',     icon:'🏥'},
  {id:'gas-seguro',     name:'Seguros',              type:'egreso',  macro:'Necesidades',     icon:'🛡️'},
  {id:'gas-educacion',  name:'Educación',            type:'egreso',  macro:'Necesidades',     icon:'📚'},
  // Estilo de vida
  {id:'gas-restaurant', name:'Restaurantes/Delivery',type:'egreso',  macro:'Estilo de vida',  icon:'🍽️'},
  {id:'gas-entret',     name:'Entretenimiento',      type:'egreso',  macro:'Estilo de vida',  icon:'🎬'},
  {id:'gas-ropa',       name:'Ropa / Calzado',       type:'egreso',  macro:'Estilo de vida',  icon:'👗'},
  {id:'gas-gym',        name:'Gym / Deporte',        type:'egreso',  macro:'Estilo de vida',  icon:'💪'},
  {id:'gas-suscr',      name:'Suscripciones',        type:'egreso',  macro:'Estilo de vida',  icon:'📱'},
  {id:'gas-viajes',     name:'Viajes / Vacaciones',  type:'egreso',  macro:'Estilo de vida',  icon:'✈️'},
  {id:'gas-regalos',    name:'Regalos',              type:'egreso',  macro:'Estilo de vida',  icon:'🎀'},
  {id:'gas-belleza',    name:'Belleza / Personal',   type:'egreso',  macro:'Estilo de vida',  icon:'💅'},
  // Ahorro / Inversión
  {id:'gas-ahorro',     name:'Ahorro',               type:'egreso',  macro:'Ahorro/Inversión',icon:'🏦'},
  {id:'gas-inversion',  name:'Inversión',            type:'egreso',  macro:'Ahorro/Inversión',icon:'📊'},
  {id:'gas-fondo-em',   name:'Fondo emergencia',     type:'egreso',  macro:'Ahorro/Inversión',icon:'🛡️'},
  // Deuda
  {id:'gas-tarjeta',    name:'Pago tarjeta',         type:'egreso',  macro:'Deuda',           icon:'💳'},
  {id:'gas-prestamo',   name:'Cuota préstamo',       type:'egreso',  macro:'Deuda',           icon:'🏦'},
  // Varios
  {id:'gas-cafe',       name:'Café / Snacks',        type:'egreso',  macro:'Varios',          icon:'☕'},
  {id:'gas-propina',    name:'Propinas',             type:'egreso',  macro:'Varios',          icon:'🤝'},
  {id:'gas-mascotas',   name:'Mascotas',             type:'egreso',  macro:'Varios',          icon:'🐾'},
  {id:'gas-otro',       name:'Otro gasto',           type:'egreso',  macro:'Varios',          icon:'📦'},
];

export const HABILIDADES = [
  {id:'presupuesto', icon:'📋', name:'Presupuesto 50/30/20',    desc:'Gestión mensual por categoría.',             minScore:0,  page:'presupuesto'},
  {id:'movimientos', icon:'💳', name:'Registro de movimientos', desc:'Ingresos, gastos y transferencias.',         minScore:0,  page:'movimientos'},
  {id:'objetivos',   icon:'🛡️', name:'Fondo de Emergencia',    desc:'Metas de ahorro y fondo de seguridad.',      minScore:20, page:'objetivos'  },
  {id:'credito',     icon:'💳', name:'Crédito y Deuda',         desc:'Tarjetas, préstamos y apalancamiento.',      minScore:30, page:'credito'    },
  {id:'reportes',    icon:'📊', name:'Reportes & Análisis',     desc:'Históricos y tendencias de gasto.',          minScore:40, page:'reportes'   },
  {id:'inversiones', icon:'📈', name:'Inversiones',             desc:'Interés compuesto, cartera 80/20 y DCA.',   minScore:60, page:'inversiones'},
  {id:'educacion',   icon:'🎓', name:'Educación Financiera',    desc:'Conceptos y estrategias clave.',             minScore:0,  page:'educacion'  },
];

export const DEFAULT_HABS = {
  presupuesto:true, movimientos:true, objetivos:false,
  credito:false, reportes:false, inversiones:false, educacion:true
};

// Habilidades por situación al crear un agente
export const HABS_BY_SITUATION = {
  'nuevo':          {presupuesto:true,  movimientos:true,  objetivos:false, credito:false, reportes:false, inversiones:false, educacion:true},
  'en-crecimiento': {presupuesto:true,  movimientos:true,  objetivos:true,  credito:false, reportes:false, inversiones:false, educacion:true},
  'estable':        {presupuesto:true,  movimientos:true,  objetivos:true,  credito:true,  reportes:true,  inversiones:false, educacion:true},
  'avanzado':       {presupuesto:true,  movimientos:true,  objetivos:true,  credito:true,  reportes:true,  inversiones:true,  educacion:true},
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
export function scoreLabel(s){ return s>=70?'Saludable 💚':s>=40?'Atención ⚠️':'Crítico 🔴'; }
export function scoreClass(s){ return s>=70?'health-green':s>=40?'health-yellow':'health-red'; }
