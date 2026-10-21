import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 3000;
const CDP_PORT = 9222;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  const srv = spawn('node', ['--experimental-sqlite', 'server.js'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });
  srv.stdout.on('data', d => console.log('[Server]', d.toString().trim()));
  srv.stderr.on('data', d => console.error('[Server ERR]', d.toString().trim()));
  
  // Esperar a que responda
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/config`);
      if (res.ok) {
        console.log('Servidor iniciado en puerto', PORT);
        return srv;
      }
    } catch {}
  }
  throw new Error('No se pudo iniciar el servidor');
}

async function startChrome() {
  const tmpDir = path.join(process.env.TEMP || 'C:\\Temp', 'chrome_cdp_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  
  const ch = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--window-size=1200,900',
    `--user-data-dir=${tmpDir}`,
    'about:blank'
  ]);
  
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        console.log('Chrome headless iniciado en CDP puerto', CDP_PORT);
        return { proc: ch, tmpDir };
      }
    } catch {}
  }
  throw new Error('No se pudo iniciar Chrome');
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    return await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  }

  async screenshot(outPath, clip = null) {
    const params = { format: 'png', captureBeyondViewport: true };
    if (clip) params.clip = clip;
    const res = await this.send('Page.captureScreenshot', params);
    const buf = Buffer.from(res.data, 'base64');
    fs.writeFileSync(outPath, buf);
    console.log('Captura guardada:', outPath, `(${buf.length} bytes)`);
  }
}

async function connectTab(url) {
  const newTabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const tab = await newTabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const client = new CDPClient(ws);
  await client.send('Page.enable');
  await client.send('DOM.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 800,
    deviceScaleFactor: 1.5,
    mobile: false
  });
  return { client, tabId: tab.id };
}

async function run() {
  let srv, chrome;
  try {
    srv = await startServer();
    chrome = await startChrome();

    const outDir = path.join(process.cwd(), 'capturas_doc');
    fs.mkdirSync(outDir, { recursive: true });

    // 1. Pantalla de Consulta (Inicio)
    console.log('Capturando: 01_consulta_inicio...');
    {
      const { client } = await connectTab(`http://127.0.0.1:${PORT}/consulta`);
      await sleep(1500);
      await client.eval(`document.querySelector('#pat').value = 'AE 482 KD';`);
      await client.screenshot(path.join(outDir, '01_consulta_inicio.png'));
    }

    // 2. Consulta de un Vehículo (Resultado del Cliente)
    console.log('Capturando: 02_consulta_resultado...');
    {
      const { client } = await connectTab(`http://127.0.0.1:${PORT}/?p=AE482KD`);
      await sleep(2000);
      await client.screenshot(path.join(outDir, '02_consulta_resultado.png'));
    }

    // 3. Login del Panel
    console.log('Capturando: 03_login...');
    {
      const { client } = await connectTab(`http://127.0.0.1:${PORT}/panel`);
      await sleep(1500);
      await client.screenshot(path.join(outDir, '03_login.png'));
    }

    // 4. Panel: "En el taller ahora" (Iniciamos sesión)
    console.log('Capturando: 04_panel_en_taller...');
    let panelClient;
    {
      const conn = await connectTab(`http://127.0.0.1:${PORT}/panel`);
      panelClient = conn.client;
      await sleep(1000);
      // Rellenar credenciales y login
      await panelClient.eval(`
        document.querySelector('#lu').value = 'admin';
        document.querySelector('#lp').value = 'tuContraseñaSegura';
        document.querySelector('#loginForm').dispatchEvent(new Event('submit', { cancelable: true }));
      `);
      await sleep(2000);
      await panelClient.screenshot(path.join(outDir, '04_panel_en_taller.png'));
    }

    // 5. Panel: "Listos para retirar"
    console.log('Capturando: 05_panel_listos...');
    {
      await panelClient.eval(`location.hash = 'listos';`);
      await sleep(1500);
      await panelClient.screenshot(path.join(outDir, '05_panel_listos.png'));
    }

    // 6. Panel: "Historial de vehículos"
    console.log('Capturando: 06_panel_historial...');
    {
      await panelClient.eval(`location.hash = 'historial';`);
      await sleep(1500);
      await panelClient.screenshot(path.join(outDir, '06_panel_historial.png'));
    }

    // 7. Panel: Ficha de un vehículo
    console.log('Capturando: 07_ficha_vehiculo...');
    {
      await panelClient.eval(`location.hash = 'v/1';`);
      await sleep(1500);
      await panelClient.screenshot(path.join(outDir, '07_ficha_vehiculo.png'));
    }

    // 8. Panel: Modal de Nuevo Ingreso
    console.log('Capturando: 08_modal_nuevo_ingreso...');
    {
      await panelClient.eval(`
        document.querySelector('#btnIngreso')?.click();
      `);
      await sleep(1500);
      await panelClient.screenshot(path.join(outDir, '08_modal_nuevo_ingreso.png'));
    }

    console.log('¡Todas las capturas se generaron con éxito!');
  } catch (err) {
    console.error('Error durante el proceso:', err);
  } finally {
    if (chrome && chrome.proc) {
      chrome.proc.kill('SIGKILL');
      try { fs.rmSync(chrome.tmpDir, { recursive: true, force: true }); } catch {}
    }
    if (srv) {
      srv.kill('SIGKILL');
    }
  }
}

run();
