// Utilidades compartidas entre la consulta pública y el panel
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatoPatente(p) {
  p = String(p || '').toUpperCase();
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) return { txt: `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`, nueva: true };
  if (/^[A-Z]\d{3}[A-Z]{3}$/.test(p)) return { txt: `${p.slice(0, 1)} ${p.slice(1, 4)} ${p.slice(4)}`, nueva: true };
  if (/^[A-Z]{3}\d{3}$/.test(p)) return { txt: `${p.slice(0, 3)} ${p.slice(3)}`, nueva: false };
  if (/^\d{3}[A-Z]{3}$/.test(p)) return { txt: `${p.slice(0, 3)} ${p.slice(3)}`, nueva: false };
  return { txt: p, nueva: true };
}
function chapa(p, size = '') {
  const f = formatoPatente(p);
  return `<span class="plate ${size} ${f.nueva ? '' : 'old'}" aria-label="Patente ${esc(p)}"><span class="band">República Argentina</span><span class="chars">${esc(f.txt)}</span></span>`;
}

const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const aUTC = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const dias = (a, b) => Math.round((aUTC(b) - aUTC(a)) / 864e5);
function fecha(s, largo) {
  if (!s) return '—';
  return new Intl.DateTimeFormat('es-AR', largo ? { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(aUTC(s))).replace(/\./g, '');
}
const km = n => (n == null ? '—' : new Intl.NumberFormat('es-AR').format(n) + ' km');
const pesos = n => (n == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n));
const ESTADO_TXT = { en_taller: 'En el taller', listo: 'Listo para retirar', entregado: 'Entregado' };
const pill = e => `<span class="pill ${e}">${ESTADO_TXT[e] || e}</span>`;

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data?.error || 'No se pudo conectar con el servidor.'); e.status = r.status; throw e; }
  return data;
}
function waLink(numero, texto) {
  let n = String(numero || '').replace(/\D/g, '');
  if (!n) return '';
  if (!n.startsWith('54')) {
    n = n.replace(/^0/, '');
    // número con "15" después de la característica (ej. 358 15 4123456): se saca el 15
    if (n.length === 12) for (const L of [4, 3, 2]) if (n.substr(L, 2) === '15') { n = n.slice(0, L) + n.slice(L + 2); break; }
    if (n.length === 7) n = '358' + n; // sin característica: se asume Río Cuarto
    n = '549' + n;
  }
  return `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
}
