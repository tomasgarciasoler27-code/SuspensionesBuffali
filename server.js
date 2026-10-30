'use strict';
/*
 * Suspensión Buffali — sistema de historial de vehículos
 * Servidor sin dependencias externas: necesita Node.js 22.11 o superior
 * (usa el módulo SQLite que trae Node incorporado).
 *
 *   npm start
 *
 * Variables de entorno (o archivo .env en esta carpeta):
 *   PORT          Puerto donde escucha (por defecto 3000)
 *   BASE_URL      Dirección pública, ej. https://historial.suspensionbuffali.com.ar
 *   ADMIN_USUARIO / ADMIN_CLAVE   Crea ese usuario la primera vez si no hay ninguno
 *   DB_PATH       Ruta del archivo de base de datos (por defecto ./data/taller.db)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scryptAsync = promisify(crypto.scrypt);

// ---------- .env robusto sin dependencias ----------
(function loadEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const rawLine of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (key in process.env) continue;
    let val = m[2].trim();
    if (!val.startsWith('"') && !val.startsWith("'")) {
      const commentIdx = val.indexOf('#');
      if (commentIdx >= 0) val = val.slice(0, commentIdx).trim();
    }
    process.env[key] = val.replace(/^["']|["']$/g, '');
  }
})();

// Oculta específicamente el aviso experimental de SQLite sin anular otros warnings de Node
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && warning.message && warning.message.includes('SQLite')) {
    return;
  }
  console.warn(warning);
});

const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECURE_COOKIE = BASE_URL.startsWith('https://');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'taller.db');

function loadConfig() { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
let CONFIG = loadConfig();

// ---------- base de datos ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  clave_hash TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  vence INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vehiculos (
  id INTEGER PRIMARY KEY,
  patente TEXT NOT NULL UNIQUE,
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  anio TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  cliente TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  codigo TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ingresos (
  id INTEGER PRIMARY KEY,
  vehiculo_id INTEGER NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
  fecha_entrada TEXT NOT NULL,
  fecha_salida TEXT,
  km INTEGER,
  estado TEXT NOT NULL DEFAULT 'en_taller',
  trabajos TEXT NOT NULL DEFAULT '[]',
  cambio_gomas INTEGER NOT NULL DEFAULT 0,
  gomas_detalle TEXT NOT NULL DEFAULT '',
  observaciones TEXT NOT NULL DEFAULT '',
  notas_internas TEXT NOT NULL DEFAULT '',
  proximo_km INTEGER,
  proxima_fecha TEXT,
  importe INTEGER,
  creado_por TEXT NOT NULL DEFAULT '',
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ingresos_vehiculo ON ingresos(vehiculo_id, fecha_entrada);
CREATE INDEX IF NOT EXISTS idx_ingresos_estado ON ingresos(estado);
`);

// ---------- utilidades ----------
const ESTADOS = ['en_taller', 'listo', 'entregado'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O, 1/I para evitar confusiones

async function hashClave(clave) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(clave, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function verificarClave(clave, guardado) {
  if (!guardado || !guardado.includes(':')) return false;
  const [salt, h] = guardado.split(':');
  const calc = await scryptAsync(clave, salt, 64);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

function nuevoCodigo(n = 6) {
  let s = '';
  for (const b of crypto.randomBytes(n)) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}
const nuevoToken = (n = 18) => crypto.randomBytes(n).toString('base64url');

function normPatente(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function patenteValida(p) {
  return /^[A-Z]{3}\d{3}$/.test(p)          // AAA123 (formato tradicional)
    || /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)    // AA123BB (Mercosur auto)
    || /^[A-Z]\d{3}[A-Z]{3}$/.test(p)       // A123BCD (Mercosur moto)
    || /^\d{3}[A-Z]{3}$/.test(p);           // 123ABC (moto tradicional)
}
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const intOrNull = v => { if (v === '' || v == null) return null; const n = Math.round(Number(String(v).replace(/\./g, ''))); return Number.isFinite(n) && n >= 0 ? n : null; };
const fechaOrNull = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

function filaIngreso(r, publico) {
  const o = {
    id: r.id, fecha_entrada: r.fecha_entrada, fecha_salida: r.fecha_salida, km: r.km, estado: r.estado,
    trabajos: JSON.parse(r.trabajos || '[]'), cambio_gomas: !!r.cambio_gomas, gomas_detalle: r.gomas_detalle,
    observaciones: r.observaciones, proximo_km: r.proximo_km, proxima_fecha: r.proxima_fecha,
  };
  if (!publico) Object.assign(o, { notas_internas: r.notas_internas, importe: r.importe, creado_por: r.creado_por, actualizado: r.actualizado });
  else if (CONFIG.mostrarImportesAlCliente) o.importe = r.importe;
  return o;
}

function filaVehiculo(v, publico) {
  const o = { id: v.id, patente: v.patente, marca: v.marca, modelo: v.modelo, anio: v.anio, color: v.color };
  if (!publico) Object.assign(o, { cliente: v.cliente, telefono: v.telefono, codigo: v.codigo, token: v.token,
    link: CONFIG.requerirCodigo ? `${BASE_URL}/a/${v.token}` : `${BASE_URL}/?p=${v.patente}` });
  else o.cliente = CONFIG.requerirCodigo ? ((v.cliente || '').split(/\s+/)[0] || '') : '';
  return o;
}

function historial(vehiculoId, publico) {
  return db.prepare('SELECT * FROM ingresos WHERE vehiculo_id = ? ORDER BY fecha_entrada DESC, id DESC').all(vehiculoId).map(r => filaIngreso(r, publico));
}

// ---------- inicialización del usuario administrador ----------
(async () => {
  if (process.env.ADMIN_USUARIO && process.env.ADMIN_CLAVE) {
    const adminUser = process.env.ADMIN_USUARIO.trim().toLowerCase();
    const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(adminUser);
    if (!existe) {
      const hash = await hashClave(process.env.ADMIN_CLAVE);
      db.prepare('INSERT INTO usuarios (usuario, nombre, clave_hash) VALUES (?, ?, ?)').run(adminUser, 'Administrador', hash);
      console.log(`Usuario inicial "${adminUser}" creado.`);
    }
  } else {
    const hayUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
    if (!hayUsuarios) {
      console.warn('No hay usuarios en la base de datos. Creá uno con: node --experimental-sqlite crear-usuario.js <usuario> <clave> [nombre]');
    }
  }
})();

// ---------- HTTP helpers & Seguridad ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self';",
  ...(SECURE_COOKIE ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
};

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SEC_HEADERS, 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
const fail = (res, status, error) => send(res, status, { error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 200_000) { reject(new Error('muy grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('json')); } });
    req.on('error', reject);
  });
}

function cookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return o;
}

function sesion(req) {
  const t = cookies(req).sesion; if (!t) return null;
  const r = db.prepare('SELECT u.id, u.usuario, u.nombre, s.vence FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?').get(t);
  if (!r || r.vence < Date.now()) return null;
  return r;
}

function serveStatic(res, file) {
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return fail(res, 404, 'No encontrado');
  const ext = path.extname(full);
  res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(full).pipe(res);
}

// Control de IP confiable para rate limiting (evita IP spoofing si no viene de loopback/proxy local)
function getClientIp(req) {
  const remoteAddr = req.socket.remoteAddress || '';
  const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
  if (isLocal && req.headers['x-forwarded-for']) {
    const forwarded = String(req.headers['x-forwarded-for']).split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return remoteAddr;
}

const intentos = new Map();
function limitar(ip, max = 20, ventanaMs = 10 * 60_000) {
  const now = Date.now(); const a = (intentos.get(ip) || []).filter(t => now - t < ventanaMs);
  a.push(now); intentos.set(ip, a);
  return a.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of intentos) if (!a.some(t => now - t < 600_000)) intentos.delete(k);
  db.prepare('DELETE FROM sesiones WHERE vence < ?').run(now);
}, 600_000).unref();

// ---------- rutas de API ----------
async function api(req, res, url) {
  const m = req.method; const p = url.pathname;
  const ip = getClientIp(req);

  if (m !== 'GET' && !(req.headers['content-type'] || '').includes('application/json')) return fail(res, 415, 'Formato no válido');
  let body = {};
  if (m === 'POST' || m === 'PUT') { try { body = await readBody(req); } catch { return fail(res, 400, 'Datos no válidos'); } }

  // --- públicas ---
  if (p === '/api/config' && m === 'GET') {
    return send(res, 200, { taller: CONFIG.taller, requerirCodigo: CONFIG.requerirCodigo, mostrarImportesAlCliente: CONFIG.mostrarImportesAlCliente, trabajos: CONFIG.trabajos, baseUrl: BASE_URL });
  }
  if (p === '/api/publico/consulta' && m === 'POST') {
    if (limitar(ip)) return fail(res, 429, 'Demasiados intentos. Esperá unos minutos y probá de nuevo.');
    const pat = normPatente(body.patente);
    const v = db.prepare('SELECT * FROM vehiculos WHERE patente = ?').get(pat);
    const codigoOk = v && (!CONFIG.requerirCodigo || normPatente(body.codigo) === v.codigo);
    if (!codigoOk) return fail(res, 404, CONFIG.requerirCodigo ? 'No encontramos un vehículo con esa patente y código. Revisá los datos del ticket del taller.' : 'No encontramos un vehículo con esa patente.');
    return send(res, 200, { vehiculo: filaVehiculo(v, true), ingresos: historial(v.id, true) });
  }
  let mt = p.match(/^\/api\/publico\/a\/([A-Za-z0-9_-]{10,40})$/);
  if (mt && m === 'GET') {
    if (limitar(ip, 60)) return fail(res, 429, 'Demasiados intentos. Esperá unos minutos.');
    const v = db.prepare('SELECT * FROM vehiculos WHERE token = ?').get(mt[1]);
    if (!v) return fail(res, 404, 'Este link no es válido. Pedile al taller un ticket nuevo.');
    return send(res, 200, { vehiculo: filaVehiculo(v, true), ingresos: historial(v.id, true) });
  }

  // --- sesión & autenticación ---
  if (p === '/api/login' && m === 'POST') {
    if (limitar('login:' + ip, 10)) return fail(res, 429, 'Demasiados intentos. Esperá 10 minutos.');
    const u = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(str(body.usuario, 60).toLowerCase());
    if (!u || !(await verificarClave(String(body.clave || ''), u.clave_hash))) {
      return fail(res, 401, 'Usuario o clave incorrectos.');
    }
    const token = nuevoToken(32); const dias = 30;
    db.prepare('INSERT INTO sesiones (token, usuario_id, vence) VALUES (?, ?, ?)').run(token, u.id, Date.now() + dias * 864e5);
    return send(res, 200, { usuario: u.usuario, nombre: u.nombre }, { 'Set-Cookie': `sesion=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${dias * 86400}${SECURE_COOKIE ? '; Secure' : ''}` });
  }
  if (p === '/api/logout' && m === 'POST') {
    const t = cookies(req).sesion; if (t) db.prepare('DELETE FROM sesiones WHERE token = ?').run(t);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'sesion=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
  }

  const yo = sesion(req);
  if (!yo) return fail(res, 401, 'Iniciá sesión para continuar.');

  if (p === '/api/yo' && m === 'GET') return send(res, 200, { usuario: yo.usuario, nombre: yo.nombre });

  if (p === '/api/clave' && m === 'POST') {
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(yo.id);
    if (!(await verificarClave(String(body.actual || ''), u.clave_hash))) return fail(res, 400, 'La clave actual no es correcta.');
    if (String(body.nueva || '').length < 8) return fail(res, 400, 'La clave nueva tiene que tener al menos 8 caracteres.');
    const nuevoHash = await hashClave(body.nueva);
    db.prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(nuevoHash, yo.id);
    // Invalidación de seguridad: cerrar todas las demás sesiones activas excepto la actual
    const currentToken = cookies(req).sesion;
    db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?').run(yo.id, currentToken);
    return send(res, 200, { ok: true });
  }

  // resumen del taller
  if (p === '/api/resumen' && m === 'GET') {
    const enTaller = db.prepare(`SELECT i.*, v.patente, v.marca, v.modelo, v.cliente, v.telefono, v.id AS vid FROM ingresos i JOIN vehiculos v ON v.id = i.vehiculo_id WHERE i.estado IN ('en_taller','listo') ORDER BY i.estado DESC, i.fecha_entrada ASC`).all()
      .map(r => ({ ...filaIngreso(r, false), vehiculo: { id: r.vid, patente: r.patente, marca: r.marca, modelo: r.modelo, cliente: r.cliente, telefono: r.telefono } }));
    const cantEntregados = db.prepare(`SELECT COUNT(*) AS n FROM vehiculos v WHERE COALESCE((SELECT estado FROM ingresos WHERE vehiculo_id = v.id ORDER BY fecha_entrada DESC, id DESC LIMIT 1), 'entregado') = 'entregado'`).get().n;
    const totales = db.prepare('SELECT (SELECT COUNT(*) FROM vehiculos) AS vehiculos, (SELECT COUNT(*) FROM ingresos) AS ingresos').get();
    return send(res, 200, { enTaller, totales, cantEntregados });
  }

  // búsqueda y listado de vehículos
  if (p === '/api/vehiculos' && m === 'GET') {
    const q = str(url.searchParams.get('q') || '', 60);
    const qp = normPatente(q);
    const like = `%${q.toLowerCase()}%`;
    const rows = db.prepare(`SELECT v.*,
      (SELECT MAX(fecha_entrada) FROM ingresos WHERE vehiculo_id = v.id) AS ultimo,
      (SELECT COUNT(*) FROM ingresos WHERE vehiculo_id = v.id) AS n,
      (SELECT km FROM ingresos WHERE vehiculo_id = v.id ORDER BY fecha_entrada DESC, id DESC LIMIT 1) AS ultimo_km,
      (SELECT estado FROM ingresos WHERE vehiculo_id = v.id ORDER BY fecha_entrada DESC, id DESC LIMIT 1) AS ultimo_estado
      FROM vehiculos v
      WHERE (? <> '' AND v.patente LIKE ?) OR lower(v.cliente) LIKE ? OR lower(v.marca || ' ' || v.modelo) LIKE ?
      ORDER BY ultimo DESC NULLS LAST LIMIT 200`).all(qp, `%${qp}%`, like, like);
    return send(res, 200, rows.map(v => ({
      ...filaVehiculo(v, false),
      ultimo: v.ultimo,
      ingresos: v.n,
      ultimo_km: v.ultimo_km,
      ultimo_estado: v.ultimo_estado
    })));
  }
  if (p === '/api/vehiculos' && m === 'POST') {
    const pat = normPatente(body.patente);
    if (!patenteValida(pat)) return fail(res, 400, 'La patente no tiene un formato válido (ej. AB123CD o ABC123).');
    if (db.prepare('SELECT 1 FROM vehiculos WHERE patente = ?').get(pat)) return fail(res, 409, 'Esa patente ya está cargada.');
    const r = db.prepare('INSERT INTO vehiculos (patente, marca, modelo, anio, color, cliente, telefono, codigo, token) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(pat, str(body.marca, 60), str(body.modelo, 80), str(body.anio, 4), str(body.color, 40), str(body.cliente, 120), str(body.telefono, 40), nuevoCodigo(), nuevoToken());
    const v = db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(r.lastInsertRowid);
    return send(res, 201, filaVehiculo(v, false));
  }
  mt = p.match(/^\/api\/vehiculos\/(\d+)$/);
  if (mt) {
    const v = db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(Number(mt[1]));
    if (!v) return fail(res, 404, 'Ese vehículo no existe.');
    if (m === 'GET') return send(res, 200, { vehiculo: filaVehiculo(v, false), ingresos: historial(v.id, false) });
    if (m === 'PUT') {
      const pat = body.patente != null ? normPatente(body.patente) : v.patente;
      if (!patenteValida(pat)) return fail(res, 400, 'La patente no tiene un formato válido.');
      if (pat !== v.patente && db.prepare('SELECT 1 FROM vehiculos WHERE patente = ?').get(pat)) return fail(res, 409, 'Esa patente ya está cargada en otro vehículo.');
      db.prepare('UPDATE vehiculos SET patente=?, marca=?, modelo=?, anio=?, color=?, cliente=?, telefono=? WHERE id=?')
        .run(pat, str(body.marca ?? v.marca, 60), str(body.modelo ?? v.modelo, 80), str(body.anio ?? v.anio, 4), str(body.color ?? v.color, 40), str(body.cliente ?? v.cliente, 120), str(body.telefono ?? v.telefono, 40), v.id);
      return send(res, 200, filaVehiculo(db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(v.id), false));
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM vehiculos WHERE id = ?').run(v.id); return send(res, 200, { ok: true }); }
  }

  // ingresos
  function datosIngreso(b, previo = {}) {
    const g = (k, d) => (k in b ? b[k] : previo[k] ?? d);
    const estado = ESTADOS.includes(g('estado')) ? g('estado') : 'en_taller';
    let fechaSalida = fechaOrNull(g('fecha_salida'));
    const trabajos = Array.isArray(g('trabajos')) ? g('trabajos').map(t => str(t, 80)).filter(Boolean).slice(0, 40) : JSON.parse(previo.trabajos || '[]');
    return {
      fecha_entrada: fechaOrNull(g('fecha_entrada')), fecha_salida: fechaSalida, km: intOrNull(g('km')), estado,
      trabajos: JSON.stringify(trabajos), cambio_gomas: g('cambio_gomas') ? 1 : 0, gomas_detalle: str(g('gomas_detalle', ''), 300),
      observaciones: str(g('observaciones', ''), 5000), notas_internas: str(g('notas_internas', ''), 5000),
      proximo_km: intOrNull(g('proximo_km')), proxima_fecha: fechaOrNull(g('proxima_fecha')), importe: intOrNull(g('importe')),
    };
  }
  mt = p.match(/^\/api\/vehiculos\/(\d+)\/ingresos$/);
  if (mt && m === 'POST') {
    const v = db.prepare('SELECT id FROM vehiculos WHERE id = ?').get(Number(mt[1]));
    if (!v) return fail(res, 404, 'Ese vehículo no existe.');
    const d = datosIngreso(body);
    if (!d.fecha_entrada) return fail(res, 400, 'Falta la fecha de entrada.');
    if (d.fecha_salida && d.fecha_salida < d.fecha_entrada) return fail(res, 400, 'La fecha de salida no puede ser anterior a la de entrada.');
    const r = db.prepare(`INSERT INTO ingresos (vehiculo_id, fecha_entrada, fecha_salida, km, estado, trabajos, cambio_gomas, gomas_detalle, observaciones, notas_internas, proximo_km, proxima_fecha, importe, creado_por)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(v.id, d.fecha_entrada, d.fecha_salida, d.km, d.estado, d.trabajos, d.cambio_gomas, d.gomas_detalle, d.observaciones, d.notas_internas, d.proximo_km, d.proxima_fecha, d.importe, yo.nombre || yo.usuario);
    return send(res, 201, filaIngreso(db.prepare('SELECT * FROM ingresos WHERE id = ?').get(r.lastInsertRowid), false));
  }
  mt = p.match(/^\/api\/ingresos\/(\d+)$/);
  if (mt) {
    const prev = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(Number(mt[1]));
    if (!prev) return fail(res, 404, 'Ese ingreso no existe.');
    if (m === 'PUT') {
      const d = datosIngreso(body, prev);
      if (!d.fecha_entrada) return fail(res, 400, 'Falta la fecha de entrada.');
      if (d.fecha_salida && d.fecha_salida < d.fecha_entrada) return fail(res, 400, 'La fecha de salida no puede ser anterior a la de entrada.');
      db.prepare(`UPDATE ingresos SET fecha_entrada=?, fecha_salida=?, km=?, estado=?, trabajos=?, cambio_gomas=?, gomas_detalle=?, observaciones=?, notas_internas=?, proximo_km=?, proxima_fecha=?, importe=?, actualizado=datetime('now') WHERE id=?`)
        .run(d.fecha_entrada, d.fecha_salida, d.km, d.estado, d.trabajos, d.cambio_gomas, d.gomas_detalle, d.observaciones, d.notas_internas, d.proximo_km, d.proxima_fecha, d.importe, prev.id);
      return send(res, 200, filaIngreso(db.prepare('SELECT * FROM ingresos WHERE id = ?').get(prev.id), false));
    }
    if (m === 'DELETE') { db.prepare('DELETE FROM ingresos WHERE id = ?').run(prev.id); return send(res, 200, { ok: true }); }
  }

  // exportar todo a CSV (con protección contra CSV Injection)
  if (p === '/api/exportar.csv' && m === 'GET') {
    const rows = db.prepare(`SELECT v.patente, v.marca, v.modelo, v.anio, v.cliente, v.telefono, i.fecha_entrada, i.fecha_salida, i.km, i.estado, i.trabajos, i.cambio_gomas, i.gomas_detalle, i.observaciones, i.notas_internas, i.importe
      FROM ingresos i JOIN vehiculos v ON v.id = i.vehiculo_id ORDER BY v.patente, i.fecha_entrada`).all();
    const cols = ['patente', 'marca', 'modelo', 'anio', 'cliente', 'telefono', 'fecha_entrada', 'fecha_salida', 'km', 'estado', 'trabajos', 'cambio_gomas', 'gomas_detalle', 'observaciones', 'notas_internas', 'importe'];
    const escCsv = v => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // Neutralizar fórmulas en Excel / Calc
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '\uFEFF' + cols.join(';') + '\r\n' + rows.map(r => cols.map(c => c === 'trabajos' ? escCsv(JSON.parse(r[c] || '[]').join(', ')) : c === 'cambio_gomas' ? (r[c] ? 'sí' : 'no') : escCsv(r[c])).join(';')).join('\r\n');
    return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="buffali-historial-${new Date().toISOString().slice(0, 10)}.csv"` });
  }

  return fail(res, 404, 'Ruta no encontrada');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Método no permitido');
    if (p === '/' || p === '/consulta' || /^\/a\/[A-Za-z0-9_-]+$/.test(p)) return serveStatic(res, 'index.html');
    if (p === '/panel' || p === '/panel/') return serveStatic(res, 'panel.html');
    return serveStatic(res, p.replace(/^\/+/, ''));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'Error del servidor. Probá de nuevo.');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Suspensión Buffali escuchando en ${BASE_URL}  (panel: ${BASE_URL}/panel)`));
}
module.exports = { server, db, hashClave, verificarClave };
