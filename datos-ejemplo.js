'use strict';
// Carga algunos vehículos de EJEMPLO para probar el sistema.  node datos-ejemplo.js
// No lo corras en el servidor real una vez que el taller empiece a cargar datos.
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && warning.message && warning.message.includes('SQLite')) return;
  console.warn(warning);
});
const { db } = require('./server.js');
const crypto = require('node:crypto');
const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const cod = () => [...crypto.randomBytes(6)].map(b => C[b % C.length]).join('');
const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

const autos = [
  ['AE482KD', 'Volkswagen', 'Amarok', '2021', 'Gris', 'Ejemplo Martín Sosa', '358 4111111', [
    [-420, -418, 61200, 'entregado', ['Amortiguadores traseros', 'Alineación', 'Balanceo'], false, '', 'Se reemplazaron amortiguadores traseros. Delanteros en buen estado, revisar en próximo service.', 80000],
    [-150, -148, 78950, 'entregado', ['Amortiguadores delanteros', 'Bujes', 'Alineación'], true, '4 cubiertas Pirelli Scorpion ATR 245/70 R16', 'Cambio de amortiguadores delanteros y bujes de parrilla. Se colocaron 4 cubiertas nuevas.', 100000],
    [-1, null, 84320, 'en_taller', ['Revisión de tren delantero', 'Extremos de dirección'], false, '', 'Ruido en tren delantero al pasar lomas de burro. En diagnóstico.', null],
  ]],
  ['KJT518', 'Fiat', 'Palio', '2011', 'Blanco', 'Ejemplo Laura Giménez', '358 4222222', [
    [-60, -59, 182400, 'entregado', ['Espirales', 'Cazoletas / soportes', 'Alineación'], false, '', 'Espiral delantero derecho quebrado, se cambiaron ambos delanteros y cazoletas.', 195000],
    [-2, null, 189750, 'listo', ['Bieletas', 'Balanceo'], true, '2 delanteras Fate Maxisport 175/65 R14', 'Bieletas de barra estabilizadora reemplazadas. Se cambiaron las dos gomas delanteras.', null],
  ]],
  ['AD019PM', 'Toyota', 'Hilux', '2019', 'Negro', 'Ejemplo Agro San Pedro', '358 4333333', [
    [-5, null, 132000, 'en_taller', ['Amortiguadores delanteros', 'Amortiguadores traseros', 'Rótulas'], false, '', '', null],
  ]],
  ['AF730RT', 'Peugeot', '208', '2023', 'Rojo', 'Ejemplo Carla Ruiz', '', [
    [-12, -12, 24100, 'entregado', ['Alineación', 'Balanceo', 'Rotación de neumáticos'], false, '', 'Alineación y balanceo. Rotación de cubiertas. Todo el tren en buen estado.', 34000],
  ]],
];
for (const [pat, marca, modelo, anio, color, cliente, tel, ings] of autos) {
  if (db.prepare('SELECT 1 FROM vehiculos WHERE patente = ?').get(pat)) continue;
  const v = db.prepare('INSERT INTO vehiculos (patente, marca, modelo, anio, color, cliente, telefono, codigo, token) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(pat, marca, modelo, anio, color, cliente, tel, cod(), crypto.randomBytes(18).toString('base64url'));
  for (const [e, s, km, est, tr, g, gd, obs, pk] of ings)
    db.prepare('INSERT INTO ingresos (vehiculo_id, fecha_entrada, fecha_salida, km, estado, trabajos, cambio_gomas, gomas_detalle, observaciones, proximo_km, creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(v.lastInsertRowid, d(e), s == null ? null : d(s), km, est, JSON.stringify(tr), g ? 1 : 0, gd, obs, pk, 'Ejemplo');
}
console.log('Datos de ejemplo cargados.');
for (const r of db.prepare('SELECT patente, codigo FROM vehiculos').all()) console.log(`  ${r.patente}  código ${r.codigo}`);
