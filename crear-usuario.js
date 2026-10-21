'use strict';
// Crea un usuario del panel o le cambia la clave si ya existe.
//   node --experimental-sqlite crear-usuario.js <usuario> <clave> [nombre]
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && warning.message && warning.message.includes('SQLite')) return;
  console.warn(warning);
});

const [, , usuario, clave, ...nombre] = process.argv;
if (!usuario || !clave) {
  console.log('Uso: node --experimental-sqlite crear-usuario.js <usuario> <clave> [nombre]');
  process.exit(1);
}
if (clave.length < 8) {
  console.log('La clave tiene que tener al menos 8 caracteres.');
  process.exit(1);
}

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'taller.db');
if (!fs.existsSync(dbPath)) {
  console.log('Primero arrancá el servidor una vez (npm start) para inicializar la base de datos.');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const salt = crypto.randomBytes(16).toString('hex');
const hash = `${salt}:${crypto.scryptSync(clave, salt, 64).toString('hex')}`;
const u = usuario.toLowerCase().trim();

const existente = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(u);
if (existente) {
  db.prepare('UPDATE usuarios SET clave_hash = ? WHERE id = ?').run(hash, existente.id);
  // Invalidar sesiones activas del usuario por seguridad
  db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(existente.id);
  console.log(`Clave de "${u}" actualizada y sesiones anteriores revocadas.`);
} else {
  db.prepare('INSERT INTO usuarios (usuario, nombre, clave_hash) VALUES (?, ?, ?)').run(u, nombre.join(' ') || u, hash);
  console.log(`Usuario "${u}" creado con éxito.`);
}
