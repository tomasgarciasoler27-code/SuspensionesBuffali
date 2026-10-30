# Suspensión Buffali · Historial de vehículos

Sistema web para el taller. Tiene dos partes:

| Dirección | Para quién | Qué hace |
|---|---|---|
| `/` o `/consulta` | Clientes | Escriben **la patente** y ven el estado y el historial de su vehículo |
| `/?p=AB123CD` | Clientes | El link que el taller manda por WhatsApp: abre el historial directo, sin escribir nada |
| `/panel` | Taller | Carga de vehículos e ingresos, estado del día, envío del link por WhatsApp, exportar a Excel |

Cada ingreso guarda: fecha de entrada, fecha de salida, kilometraje, estado (en el taller / listo / entregado), trabajos realizados, **cambio de gomas** con detalle, observaciones para el cliente, notas internas (el cliente no las ve), próximo control e importe (interno por defecto).

---

## Para quien lo instala

### Requisitos
- **Node.js 22.13 o más nuevo** (usa el SQLite que viene incluido en Node; no hay que instalar nada con `npm`).
- Un servidor que pueda correr Node (VPS, servidor propio, Railway, Render, etc.). **No sirve un hosting compartido solo PHP.**
- Dominio o subdominio con HTTPS (ej. `historial.suspensionbuffali.com.ar`).

### Instalación
```bash
# 1. copiar la carpeta al servidor y entrar
cd buffali

# 2. configuración
cp .env.example .env
nano .env          # poner BASE_URL real, usuario y clave del primer usuario

# 3. probar
node server.js     # debería decir "escuchando en ..."
```

### Dejarlo corriendo siempre (systemd)
`/etc/systemd/system/buffali.service`:
```ini
[Unit]
Description=Suspension Buffali
After=network.target

[Service]
WorkingDirectory=/opt/buffali
ExecStart=/usr/bin/node server.js
Restart=always
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now buffali
```
(Con pm2 también funciona: `pm2 start server.js --name buffali`.)

### Nginx delante (HTTPS)
```nginx
server {
  server_name historial.suspensionbuffali.com.ar;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}
```
Después `certbot --nginx` para el certificado. **`BASE_URL` en `.env` tiene que ser la dirección https final**, porque es la que se envía en los links de WhatsApp.

### Usuarios del panel
```bash
node --experimental-sqlite crear-usuario.js mecanico1 unaClaveSegura "Juan"
```
Si el usuario ya existe, le cambia la clave.

### Backup
Todo está en **`data/taller.db`** (un solo archivo). Hay que copiarlo seguido a otro lado, por ejemplo con un cron diario:
```bash
0 3 * * * sqlite3 /opt/buffali/data/taller.db ".backup '/backups/taller-$(date +\%F).db'"
```

---

## Configuración del taller (`config.json`)
- `taller`: nombre, dirección, teléfono, WhatsApp y horario. Aparecen en la página del cliente y en los tickets.
- `trabajos`: la lista de trabajos que aparecen para tildar. Se puede agregar o sacar lo que quieran. En cada ingreso también se puede escribir un trabajo que no esté en la lista.
- `requerirCodigo`: `false` (como está ahora) = alcanza con la patente. Para proteger al cliente, en la página pública **no se muestra ningún dato personal** (ni nombre ni teléfono), solo el vehículo y los trabajos. `true` = además de la patente piden un código de 6 letras.
- `mostrarImportesAlCliente`: `false` = el importe queda solo para el taller.

Después de cambiar `config.json` hay que reiniciar el servidor.

## Cómo se usa en el taller
1. Entra un auto → en el panel se busca la patente.
2. Si es nuevo, **Registrar vehículo** (marca, modelo, cliente, **teléfono**) → se abre directo la carga del ingreso.
3. Se carga km, trabajos y observaciones. Queda **En el taller**.
4. En la ficha del vehículo, **Enviar link por WhatsApp**: abre WhatsApp con un mensaje armado y el link. Al cliente le queda guardado en el chat; si lo pierde, entra a la página y escribe la patente.
5. Cuando está terminado se pasa a **Listo para retirar** → aparece **Avisar por WhatsApp** con el aviso y el link al detalle.
6. Al retirarlo se pasa a **Entregado** (la fecha de salida se completa sola).
