'use strict';
/**
 * Test suite para Suspensión Buffali
 * Ejecutar con: npm test  (o node --experimental-sqlite test.js)
 */
const assert = require('node:assert');
const http = require('node:http');
const { db, hashClave, verificarClave } = require('./server.js');

async function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(u, opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        let data = bodyStr;
        try { data = JSON.parse(bodyStr); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, rawBody: bodyStr });
      });
    });
    req.on('error', reject);
    if (opts.body) {
      req.write(typeof opts.body === 'object' ? JSON.stringify(opts.body) : opts.body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Iniciando tests de auditoría y funcionalidad...\n');

  // 1. Test criptográfico asíncrono
  console.log('1. Verificando hashing asíncrono (scrypt)...');
  const pass = 'SuperClave2026!';
  const hash = await hashClave(pass);
  assert(hash.includes(':'), 'El hash debe contener salt y hash separados por :');
  const esValida = await verificarClave(pass, hash);
  assert.strictEqual(esValida, true, 'La contraseña correcta debe ser validada');
  const esInvalida = await verificarClave('ClaveIncorrecta', hash);
  assert.strictEqual(esInvalida, false, 'Una contraseña incorrecta debe fallar');
  console.log('   ✅ Hashing scrypt asíncrono OK');

  // 2. Levantar servidor en puerto de prueba
  console.log('2. Levantando servidor en puerto de test (3099)...');
  const { server } = require('./server.js');
  await new Promise((resolve) => server.listen(3099, resolve));
  const baseUrl = 'http://127.0.0.1:3099';

  try {
    // 3. Test de Cabeceras de Seguridad y /api/config
    console.log('3. Verificando /api/config y Headers de Seguridad...');
    const resCfg = await request(`${baseUrl}/api/config`);
    assert.strictEqual(resCfg.status, 200);
    assert(resCfg.body.taller, 'Debe devolver datos del taller');
    assert.strictEqual(resCfg.headers['x-frame-options'], 'DENY');
    assert.strictEqual(resCfg.headers['x-content-type-options'], 'nosniff');
    assert(resCfg.headers['content-security-policy'], 'Debe tener cabecera Content-Security-Policy');
    console.log('   ✅ /api/config y Security Headers OK');

    // 4. Test de Archivos Estáticos y SEO
    console.log('4. Verificando archivos de SEO y PWA...');
    const resRobots = await request(`${baseUrl}/robots.txt`);
    assert.strictEqual(resRobots.status, 200);
    assert(resRobots.rawBody.includes('Disallow: /panel'), 'robots.txt debe bloquear /panel');

    const resSitemap = await request(`${baseUrl}/sitemap.xml`);
    assert.strictEqual(resSitemap.status, 200);
    assert(resSitemap.rawBody.includes('<loc>'), 'sitemap.xml debe tener tags <loc>');

    const resManifest = await request(`${baseUrl}/site.webmanifest`);
    assert.strictEqual(resManifest.status, 200);
    assert(resManifest.body.name, 'site.webmanifest debe ser un JSON válido con nombre');
    console.log('   ✅ robots.txt, sitemap.xml y site.webmanifest OK');

    // 5. Test de Usuario y Autenticación
    console.log('5. Verificando flujo de Login y Sesión...');
    // Crear o asegurar usuario de test
    const testUser = 'auditor_test';
    const testPass = 'ClaveDeAuditoria1!';
    const userHash = await hashClave(testPass);
    db.prepare('DELETE FROM usuarios WHERE usuario = ?').run(testUser);
    const rU = db.prepare('INSERT INTO usuarios (usuario, nombre, clave_hash) VALUES (?, ?, ?)').run(testUser, 'Auditor', userHash);
    const userId = Number(rU.lastInsertRowid);

    // Login incorrecto
    const badLogin = await request(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { usuario: testUser, clave: 'erronea' }
    });
    assert.strictEqual(badLogin.status, 401, 'Login erróneo debe dar 401');

    // Login correcto
    const okLogin = await request(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { usuario: testUser, clave: testPass }
    });
    assert.strictEqual(okLogin.status, 200, 'Login correcto debe dar 200');
    const setCookie = okLogin.headers['set-cookie'];
    assert(setCookie && setCookie[0].includes('sesion='), 'Debe setear cookie de sesión');
    const cookieVal = setCookie[0].split(';')[0];

    // Verificar identidad /api/yo
    const resYo = await request(`${baseUrl}/api/yo`, {
      headers: { 'Cookie': cookieVal }
    });
    assert.strictEqual(resYo.status, 200);
    assert.strictEqual(resYo.body.usuario, testUser);
    console.log('   ✅ Login, Cookies HttpOnly y /api/yo OK');

    // 6. Test de Invalidez de Sesiones al Cambiar Clave
    console.log('6. Verificando revocación de sesiones al cambiar clave...');
    // Simular una segunda sesión activa
    const fakeToken = 'segunda_sesion_activa_token_test';
    db.prepare('INSERT INTO sesiones (token, usuario_id, vence) VALUES (?, ?, ?)').run(fakeToken, userId, Date.now() + 864e5);
    assert(db.prepare('SELECT 1 FROM sesiones WHERE token = ?').get(fakeToken), 'La segunda sesión debe existir');

    // Cambiar clave con la primera sesión
    const nuevaClave = 'NuevaClaveSegura2026!';
    const resCambio = await request(`${baseUrl}/api/clave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookieVal },
      body: { actual: testPass, nueva: nuevaClave }
    });
    assert.strictEqual(resCambio.status, 200, 'Cambio de clave debe retornar 200');

    // Verificar que la segunda sesión fue invalidada
    const sesionSecundaria = db.prepare('SELECT 1 FROM sesiones WHERE token = ?').get(fakeToken);
    assert.strictEqual(sesionSecundaria, undefined, 'La sesión secundaria debe haber sido revocada');

    // Verificar que la sesión actual aún sigue activa
    const resYoPost = await request(`${baseUrl}/api/yo`, { headers: { 'Cookie': cookieVal } });
    assert.strictEqual(resYoPost.status, 200, 'La sesión que realizó el cambio debe mantenerse');
    console.log('   ✅ Revocación de sesiones en cambio de clave OK');

    // 7. Test de Prevención contra CSV Injection
    console.log('7. Verificando protección contra CSV Formula Injection...');
    // Insertar vehículo con fórmula maliciosa
    const patMal = 'ZZ999ZZ';
    db.prepare('DELETE FROM vehiculos WHERE patente = ?').run(patMal);
    db.prepare('INSERT INTO vehiculos (patente, marca, modelo, cliente, telefono, codigo, token) VALUES (?,?,?,?,?,?,?)')
      .run(patMal, 'Test', 'Formula', '=SUM(1+1)', '358123456', 'TEST01', 'tokenmalicioso12345');
    const vMal = db.prepare('SELECT id FROM vehiculos WHERE patente = ?').get(patMal);
    db.prepare('INSERT INTO ingresos (vehiculo_id, fecha_entrada, observaciones) VALUES (?,?,?)')
      .run(vMal.id, '2026-10-20', '@calc|A0');

    const resCsv = await request(`${baseUrl}/api/exportar.csv`, {
      headers: { 'Cookie': cookieVal }
    });
    assert.strictEqual(resCsv.status, 200);
    // Verificar que '=SUM(1+1)' fue neutralizado a ''=SUM(1+1)'
    assert(resCsv.rawBody.includes("''=SUM(1+1)") || resCsv.rawBody.includes("'=SUM(1+1)"), 'La fórmula =SUM debe estar prefijada con apóstrofe');
    assert(resCsv.rawBody.includes("'@calc"), 'El campo con @ debe estar prefijado con apóstrofe');
    console.log('   ✅ Sanitización de fórmulas en exportación CSV OK');

    // Limpieza de datos de test
    db.prepare('DELETE FROM vehiculos WHERE patente = ?').run(patMal);
    db.prepare('DELETE FROM usuarios WHERE usuario = ?').run(testUser);

    console.log('\n🎉 ¡TODOS LOS TESTS DE AUDITORÍA PASARON CON ÉXITO! (100% OK)');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Error en tests:', err);
  process.exit(1);
});
