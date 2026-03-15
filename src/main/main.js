// ═══════════════════════════════════════════════════════════════
// SecureVPN Desktop — Main Process
// Architecture: Electron → Xray-core (VLESS+REALITY) → sing-box (TUN)
// Flow: Apps → TUN(sing-box) → SOCKS5:45361(xray) → VLESS+REALITY → Server
//
// Author  : Hayder Odhafa (حيدر عذافة)
// GitHub  : https://github.com/Hayder-IRAQ
// Version : 1.0.0
// License : MIT
// ═══════════════════════════════════════════════════════════════

const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const log = require('electron-log');
const Store = require('electron-store');

// ─── Constants ───────────────────────────────────────────────
const SOCKS_HOST = '127.0.0.1';
const SOCKS_PORT = 45361;
const TUN_INTERFACE = 'securevpn-tun';
const TUN_ADDRESS = '172.19.0.1/30';
const TUN_MTU = 1420;
const CONNECTION_CHECK_URLS = [
  'https://api.ipify.org',
  'http://ifconfig.me/ip',
  'http://ipecho.net/plain',
];

// ─── State ───────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let xrayProcess = null;
let singboxProcess = null;
let vpnState = {
  connected: false,
  connecting: false,
  currentServer: null,
  connectedTime: null,
  publicIp: null,
};

// ─── Store ───────────────────────────────────────────────────
const store = new Store({
  defaults: {
    xraySettings: {
      fingerprint: 'random',
      mtu: 1420,
      vlessPort: 443,
      blockTorrent: true,
    },
    lastServer: null,
    servers: [],
    autoConnect: false,
  },
});

// ═══════════════════════════════════════════════════════════════
// PATH HELPERS
// ═══════════════════════════════════════════════════════════════

function getResourcesPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'xray');
  }
  return path.join(__dirname, '..', '..', 'resources', 'xray');
}

function getBinaryPath(name) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  return path.join(getResourcesPath(), `${name}${ext}`);
}

function getConfigDir() {
  const dir = path.join(app.getPath('userData'), 'configs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogsDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ═══════════════════════════════════════════════════════════════
// CONFIG GENERATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Generate Xray-core JSON config
 * Creates a local SOCKS5 proxy that tunnels via VLESS + REALITY
 */
function generateXrayConfig(server, settings) {
  return {
    log: { loglevel: 'warning' },
    inbounds: [
      {
        port: SOCKS_PORT,
        listen: SOCKS_HOST,
        tag: 'inbound-socks',
        protocol: 'socks',
        settings: { udp: true },
      },
    ],
    outbounds: [
      {
        protocol: 'vless',
        tag: 'proxy-vless',
        settings: {
          vnext: [
            {
              port: server.port || settings.vlessPort,
              address: server.ip,
              users: [
                {
                  id: server.uuid,
                  encryption: 'none',
                  flow: 'xtls-rprx-vision',
                },
              ],
            },
          ],
        },
        streamSettings: {
          network: 'tcp',
          security: 'reality',
          realitySettings: {
            serverName: server.sni,
            publicKey: server.publicKey,
            shortId: server.shortId || '',
            fingerprint: settings.fingerprint || 'random',
            spiderX: '',
          },
        },
      },
      { protocol: 'freedom', tag: 'direct' },
      { protocol: 'blackhole', tag: 'block' },
    ],
    routing: {
      domainStrategy: 'AsIs',
      rules: [
        {
          type: 'field',
          ip: ['geoip:private'],
          outboundTag: 'direct',
        },
        ...(settings.blockTorrent
          ? [
              {
                type: 'field',
                protocol: ['bittorrent'],
                outboundTag: 'block',
              },
            ]
          : []),
      ],
    },
  };
}

/**
 * Generate sing-box JSON config
 * Creates a TUN interface that routes all traffic through the Xray SOCKS5 proxy
 */
function generateSingboxConfig(settings) {
  return {
    log: { level: 'info' },
    dns: {
      servers: [
        {
          tag: 'dns-remote-doh',
          type: 'https',
          server: '1.1.1.1',
          server_port: 443,
          path: '/dns-query',
          detour: 'xray-socks',
          domain_resolver: 'dns-bootstrap',
        },
        {
          tag: 'dns-remote-dot',
          type: 'tls',
          server: '8.8.8.8',
          server_port: 853,
          tls: { enabled: true, server_name: 'dns.google' },
          detour: 'xray-socks',
          domain_resolver: 'dns-bootstrap',
        },
        {
          tag: 'dns-bootstrap',
          type: 'udp',
          server: '8.8.8.8',
          server_port: 53,
        },
      ],
      rules: [
        {
          process_name: ['xray-core', 'xray-core.exe', 'sing-box', 'sing-box.exe'],
          server: 'dns-bootstrap',
        },
      ],
      strategy: 'ipv4_only',
      independent_cache: true,
      cache_capacity: 10000,
      reverse_mapping: true,
      final: 'dns-remote-doh',
    },
    inbounds: [
      {
        type: 'tun',
        interface_name: TUN_INTERFACE,
        address: [TUN_ADDRESS],
        auto_route: true,
        strict_route: true,
        mtu: settings.mtu || TUN_MTU,
        stack: 'gvisor',
        endpoint_independent_nat: true,
      },
    ],
    outbounds: [
      {
        type: 'socks',
        tag: 'xray-socks',
        server: SOCKS_HOST,
        server_port: SOCKS_PORT,
        udp_fragment: true,
      },
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [
        {
          ip_cidr: [
            '10.0.0.0/8',
            '172.16.0.0/12',
            '192.168.0.0/16',
            '127.0.0.0/8',
            '169.254.0.0/16',
            '224.0.0.0/4',
            '::1/128',
            'fc00::/7',
            'fe80::/10',
          ],
          action: 'route',
          outbound: 'direct',
        },
        {
          domain_suffix: ['.local', '.localhost', '.lan'],
          action: 'route',
          outbound: 'direct',
        },
        ...(settings.blockTorrent
          ? [
              {
                process_path_regex: [
                  '(?i)torrent',
                  '(?i)deluge',
                  '(?i)transmission',
                  '(?i)bitcomet',
                  '(?i)aria2',
                ],
                action: 'reject',
              },
            ]
          : []),
      ],
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// VPN SERVICE
// ═══════════════════════════════════════════════════════════════

async function saveConfigFile(name, config) {
  const filePath = path.join(getConfigDir(), `${name}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2));
  return filePath;
}

async function startXray(server, settings) {
  const config = generateXrayConfig(server, settings);
  const configPath = await saveConfigFile('xray-config', config);
  const binaryPath = getBinaryPath('xray-core');

  log.info('Starting Xray:', binaryPath, '-config', configPath);

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Xray binary not found at: ${binaryPath}. Run "npm run download-xray" first.`);
  }

  xrayProcess = spawn(binaryPath, ['-config', configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Xray start timeout (10s)'));
    }, 10000);

    const onExit = (code) => {
      clearTimeout(timeout);
      xrayProcess = null;
      reject(new Error(`Xray exited unexpectedly with code ${code}`));
    };

    const onData = (data) => {
      const text = data.toString();
      log.info('[xray]', text.trim());
      if (text.match(/Xray \d+\.\d+\.\d+ started/)) {
        clearTimeout(timeout);
        xrayProcess?.removeListener('close', onExit);
        xrayProcess?.on('close', onUnexpectedClose('xray'));
        resolve(true);
      }
    };

    xrayProcess.on('close', onExit);
    xrayProcess.stdout?.on('data', onData);
    xrayProcess.stderr?.on('data', (data) => {
      log.error('[xray stderr]', data.toString().trim());
    });
  });
}

async function startSingbox(settings) {
  const config = generateSingboxConfig(settings);
  const configPath = await saveConfigFile('singbox-config', config);
  const binaryPath = getBinaryPath('sing-box');

  log.info('Starting sing-box:', binaryPath, '--disable-color', '-c', configPath, 'run');

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`sing-box binary not found at: ${binaryPath}. Run "npm run download-xray" first.`);
  }

  singboxProcess = spawn(binaryPath, ['--disable-color', '-c', configPath, 'run'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      // sing-box may not print a "started" message, resolve after 3s
      singboxProcess?.removeListener('close', onExit);
      singboxProcess?.on('close', onUnexpectedClose('sing-box'));
      resolve(true);
    }, 3000);

    const onExit = (code) => {
      clearTimeout(timeout);
      singboxProcess = null;
      reject(new Error(`sing-box exited unexpectedly with code ${code}`));
    };

    singboxProcess.on('close', onExit);
    singboxProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      log.info('[sing-box]', text.trim());
      if (text.includes('started')) {
        clearTimeout(timeout);
        singboxProcess?.removeListener('close', onExit);
        singboxProcess?.on('close', onUnexpectedClose('sing-box'));
        resolve(true);
      }
    });
    singboxProcess.stderr?.on('data', (data) => {
      log.error('[sing-box stderr]', data.toString().trim());
    });
  });
}

function onUnexpectedClose(name) {
  return (code) => {
    log.error(`[${name}] process exited unexpectedly with code ${code}`);
    if (name === 'xray') xrayProcess = null;
    if (name === 'sing-box') singboxProcess = null;
    stopVpn().then(() => {
      sendToRenderer('vpn-state-changed', { ...vpnState, connected: false, connecting: false });
    });
  };
}

async function stopProcess(proc, name) {
  if (!proc) return;
  return new Promise((resolve) => {
    const killTimeout = setTimeout(() => {
      log.warn(`[${name}] didn't exit gracefully, sending SIGKILL`);
      proc.kill('SIGKILL');
      resolve();
    }, 5000);

    proc.removeAllListeners('close');
    proc.once('exit', () => {
      clearTimeout(killTimeout);
      log.info(`[${name}] stopped`);
      resolve();
    });

    proc.kill('SIGTERM');
  });
}

async function checkConnection(serverIp) {
  for (const url of CONNECTION_CHECK_URLS) {
    try {
      const ip = await fetchUrl(url, 5000);
      if (ip && ip.trim() !== '' && ip.trim() !== serverIp) {
        vpnState.publicIp = ip.trim();
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function fetchUrl(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? require('https') : require('http');
    const req = proto.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── Main VPN Control Functions ──────────────────────────────

async function connectVpn(server) {
  if (vpnState.connecting || vpnState.connected) {
    await disconnectVpn();
  }

  vpnState.connecting = true;
  vpnState.currentServer = server;
  sendToRenderer('vpn-state-changed', vpnState);

  const settings = store.get('xraySettings');

  try {
    // Step 1: Start Xray (SOCKS5 proxy via VLESS+REALITY)
    log.info('Step 1: Starting Xray-core...');
    await startXray(server, settings);

    // Step 2: Start sing-box (TUN to capture all traffic)
    log.info('Step 2: Starting sing-box TUN...');
    await startSingbox(settings);

    // Step 3: Verify connection
    log.info('Step 3: Verifying connection...');
    const ok = await checkConnection(server.ip);

    if (!ok) {
      throw new Error('Connection verification failed — traffic not routing through VPN');
    }

    vpnState.connected = true;
    vpnState.connecting = false;
    vpnState.connectedTime = Date.now();
    store.set('lastServer', server);

    log.info(`VPN connected successfully via ${server.country} (${server.ip})`);
    sendToRenderer('vpn-state-changed', vpnState);
    return { success: true };
  } catch (error) {
    log.error('VPN connection failed:', error.message);
    await disconnectVpn();
    throw error;
  }
}

async function disconnectVpn() {
  log.info('Disconnecting VPN...');

  await stopProcess(singboxProcess, 'sing-box');
  singboxProcess = null;

  await stopProcess(xrayProcess, 'xray');
  xrayProcess = null;

  vpnState = {
    connected: false,
    connecting: false,
    currentServer: null,
    connectedTime: null,
    publicIp: null,
  };

  sendToRenderer('vpn-state-changed', vpnState);
  log.info('VPN disconnected');
}

async function changeServer(newServer) {
  const settings = store.get('xraySettings');

  // Only restart xray, keep singbox running
  await stopProcess(xrayProcess, 'xray');
  xrayProcess = null;

  await startXray(newServer, settings);

  const ok = await checkConnection(newServer.ip);
  if (!ok) throw new Error('Server change verification failed');

  vpnState.currentServer = newServer;
  vpnState.connectedTime = Date.now();
  store.set('lastServer', newServer);

  sendToRenderer('vpn-state-changed', vpnState);
}

// ═══════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════

function setupIpcHandlers() {
  ipcMain.handle('vpn:connect', async (_event, server) => {
    try {
      return await connectVpn(server);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('vpn:disconnect', async () => {
    await disconnectVpn();
    return { success: true };
  });

  ipcMain.handle('vpn:change-server', async (_event, server) => {
    try {
      await changeServer(server);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('vpn:get-state', () => vpnState);

  ipcMain.handle('store:get', (_event, key) => store.get(key));
  ipcMain.handle('store:set', (_event, key, value) => store.set(key, value));

  ipcMain.handle('servers:get', () => store.get('servers'));
  ipcMain.handle('servers:set', (_event, servers) => store.set('servers', servers));

  ipcMain.handle('settings:get', () => store.get('xraySettings'));
  ipcMain.handle('settings:set', (_event, settings) => {
    store.set('xraySettings', settings);
    return true;
  });

  ipcMain.handle('app:open-logs', () => {
    shell.openPath(getLogsDir());
  });

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:check-engines', () => {
    const xrayPath = getBinaryPath('xray-core');
    const singboxPath = getBinaryPath('sing-box');
    return {
      xrayExists: fs.existsSync(xrayPath),
      singboxExists: fs.existsSync(singboxPath),
      xrayPath,
      singboxPath,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// WINDOW
// ═══════════════════════════════════════════════════════════════

function sendToRenderer(channel, data) {
  mainWindow?.webContents?.send(channel, data);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 380,
    minHeight: 600,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', '..', 'resources', 'icons', 'icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (event) => {
    if (vpnState.connected) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // Simple 16x16 tray icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEbSURBVDiNpZMxTsMwFIa/Z6dDJyQuABIHYGBgYeMa3IALcAMuwMIFGFjYGJAYkDgAEheoo+04GAYSO00i8SRLz/b3/3/+/2wz5+i9X2DGcc7lqnoqIjcA/wC+q+pzVX0xxrwdJahqDlwCZ8AikJnZ0bqu39JM0oBVNQduqMkJkJtZ0bbtRxInSTJX1RXgGjg1s+IvQRIn0RwogAJYBnJjzD7AN6BU1QJ4Aq6Bf3vQ3d0dAKp6DiwBF8CemRUxEDPLVHUJuAeugCMzKybdl3uOgKfAI3AQ+IuYTwC9968islTX9T6wi3swy8ysGLl3C1DV+8ADsMPkHpiZFW4YBjNbBq6BXWBuZsXU/G+MHQFPwCNwGGMBfgG03m6JVufMlgAAAABJRU5ErkJggg=='
  );
  tray = new Tray(icon);
  tray.setToolTip('SecureVPN Desktop');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => mainWindow?.show(),
    },
    {
      label: 'Disconnect',
      click: () => disconnectVpn(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: async () => {
        await disconnectVpn();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow?.show());
}

// ═══════════════════════════════════════════════════════════════
// APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!vpnState.connected && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await disconnectVpn();
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception:', error);
});
