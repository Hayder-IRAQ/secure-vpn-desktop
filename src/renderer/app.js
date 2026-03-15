// ═══════════════════════════════════════════════════════════════
// SecureVPN Desktop — Renderer (UI Logic)
// Pure vanilla JS — no framework needed for this scale
// ═══════════════════════════════════════════════════════════════

const api = window.vpnAPI;

// ─── State ───────────────────────────────────────────────────
let state = {
  connected: false,
  connecting: false,
  currentServer: null,
  connectedTime: null,
  publicIp: null,
  selectedServer: null,
  servers: [],
  settings: {},
};

let timerInterval = null;

// ─── Default Servers (user should replace with their own) ────
const DEFAULT_SERVERS = [
  {
    id: 'nl-1',
    country: 'Netherlands',
    countryCode: 'NL',
    city: 'Amsterdam',
    flag: '🇳🇱',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'us-1',
    country: 'United States',
    countryCode: 'US',
    city: 'New York',
    flag: '🇺🇸',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'de-1',
    country: 'Germany',
    countryCode: 'DE',
    city: 'Frankfurt',
    flag: '🇩🇪',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'gb-1',
    country: 'United Kingdom',
    countryCode: 'GB',
    city: 'London',
    flag: '🇬🇧',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'sg-1',
    country: 'Singapore',
    countryCode: 'SG',
    city: 'Singapore',
    flag: '🇸🇬',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'jp-1',
    country: 'Japan',
    countryCode: 'JP',
    city: 'Tokyo',
    flag: '🇯🇵',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'fi-1',
    country: 'Finland',
    countryCode: 'FI',
    city: 'Helsinki',
    flag: '🇫🇮',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
  {
    id: 'fr-1',
    country: 'France',
    countryCode: 'FR',
    city: 'Paris',
    flag: '🇫🇷',
    ip: '0.0.0.0',
    port: 443,
    uuid: 'YOUR-UUID-HERE',
    sni: 'www.google.com',
    publicKey: 'YOUR-REALITY-PUBLIC-KEY',
    shortId: '',
  },
];

// ─── DOM Elements ────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  statusIndicator: $('#status-indicator'),
  statusText: $('#status-text'),
  statusIp: $('#status-ip'),
  statusTimer: $('#status-timer'),
  connectBtn: $('#connect-btn'),
  connectBtnText: $('.connect-btn-text'),
  connectBtnLoader: $('.connect-btn-loader'),
  currentServer: $('#current-server'),
  serverFlag: $('#server-flag'),
  serverName: $('#server-name'),
  serverDetail: $('#server-detail'),
  serverList: $('#server-list'),
  serverSearch: $('#server-search-input'),
  toastContainer: $('#toast-container'),
};

// ═══════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════

$$('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    $$('.nav-item').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.page').forEach((p) => p.classList.remove('active'));
    $(`#page-${page}`).classList.add('active');
  });
});

// Navigate to servers page when clicking current server
els.currentServer.addEventListener('click', () => {
  $$('.nav-item').forEach((b) => b.classList.remove('active'));
  $('[data-page="servers"]').classList.add('active');
  $$('.page').forEach((p) => p.classList.remove('active'));
  $('#page-servers').classList.add('active');
});

// ═══════════════════════════════════════════════════════════════
// TITLEBAR
// ═══════════════════════════════════════════════════════════════

$('#btn-minimize')?.addEventListener('click', () => api.minimize());
$('#btn-close')?.addEventListener('click', () => api.close());

// ═══════════════════════════════════════════════════════════════
// UI UPDATE
// ═══════════════════════════════════════════════════════════════

function updateUI() {
  // Status indicator
  els.statusIndicator.className = 'status-indicator';
  if (state.connected) els.statusIndicator.classList.add('connected');
  else if (state.connecting) els.statusIndicator.classList.add('connecting');

  // Status text
  if (state.connected) {
    els.statusText.textContent = 'Connected';
    els.statusText.style.color = 'var(--accent)';
  } else if (state.connecting) {
    els.statusText.textContent = 'Connecting...';
    els.statusText.style.color = 'var(--warning)';
  } else {
    els.statusText.textContent = 'Disconnected';
    els.statusText.style.color = 'var(--text-secondary)';
  }

  // IP
  els.statusIp.textContent = state.publicIp ? `IP: ${state.publicIp}` : '';

  // Connect button
  els.connectBtn.className = 'connect-btn';
  if (state.connected) {
    els.connectBtn.classList.add('connected');
    els.connectBtnText.textContent = 'Disconnect';
    els.connectBtnText.style.display = '';
    els.connectBtnLoader.style.display = 'none';
  } else if (state.connecting) {
    els.connectBtn.classList.add('connecting');
    els.connectBtnText.style.display = 'none';
    els.connectBtnLoader.style.display = '';
  } else {
    els.connectBtnText.textContent = 'Connect';
    els.connectBtnText.style.display = '';
    els.connectBtnLoader.style.display = 'none';
  }

  // Current server
  if (state.selectedServer) {
    els.serverFlag.textContent = state.selectedServer.flag;
    els.serverName.textContent = state.selectedServer.country;
    els.serverDetail.textContent = state.selectedServer.city;
  }

  // Timer
  updateTimer();

  // Server list highlight
  renderServerList();
}

function updateTimer() {
  if (state.connected && state.connectedTime) {
    const elapsed = Math.floor((Date.now() - state.connectedTime) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    els.statusTimer.textContent = `${h}:${m}:${s}`;
  } else {
    els.statusTimer.textContent = '';
  }
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SERVER LIST
// ═══════════════════════════════════════════════════════════════

function renderServerList(filter = '') {
  const list = els.serverList;
  list.innerHTML = '';

  const filtered = state.servers.filter(
    (s) =>
      s.country.toLowerCase().includes(filter.toLowerCase()) ||
      s.city.toLowerCase().includes(filter.toLowerCase()) ||
      s.countryCode.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">No servers found</div>';
    return;
  }

  filtered.forEach((server) => {
    const isActive = state.selectedServer?.id === server.id;
    const item = document.createElement('div');
    item.className = `server-list-item${isActive ? ' active' : ''}`;
    item.innerHTML = `
      <span class="flag">${server.flag}</span>
      <div class="info">
        <div class="name">${server.country}</div>
        <div class="detail">${server.city}</div>
      </div>
      <span class="check">✓</span>
    `;
    item.addEventListener('click', () => selectServer(server));
    list.appendChild(item);
  });
}

function selectServer(server) {
  state.selectedServer = server;

  // If connected, switch server
  if (state.connected) {
    changeServerWhileConnected(server);
  } else {
    updateUI();
    // Switch back to home page
    $$('.nav-item').forEach((b) => b.classList.remove('active'));
    $('[data-page="home"]').classList.add('active');
    $$('.page').forEach((p) => p.classList.remove('active'));
    $('#page-home').classList.add('active');
  }
}

async function changeServerWhileConnected(server) {
  state.connecting = true;
  updateUI();
  try {
    const result = await api.changeServer(server);
    if (!result.success) throw new Error(result.error);
    showToast(`Switched to ${server.country}`, 'success');
  } catch (error) {
    showToast(`Failed: ${error.message}`, 'error');
  }
}

els.serverSearch.addEventListener('input', (e) => {
  renderServerList(e.target.value);
});

// ═══════════════════════════════════════════════════════════════
// CONNECT / DISCONNECT
// ═══════════════════════════════════════════════════════════════

els.connectBtn.addEventListener('click', async () => {
  if (state.connecting) return;

  if (state.connected) {
    // Disconnect
    state.connecting = false;
    state.connected = false;
    updateUI();
    stopTimer();

    try {
      await api.disconnect();
      showToast('Disconnected', 'warning');
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
    }
  } else {
    // Connect
    if (!state.selectedServer) {
      showToast('Select a server first', 'warning');
      return;
    }

    state.connecting = true;
    updateUI();

    try {
      const result = await api.connect(state.selectedServer);
      if (!result.success) throw new Error(result.error);
      showToast(`Connected to ${state.selectedServer.country}`, 'success');
      startTimer();
    } catch (error) {
      showToast(`Connection failed: ${error.message}`, 'error');
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// STATE LISTENER (from main process)
// ═══════════════════════════════════════════════════════════════

api.onStateChanged((newState) => {
  state = { ...state, ...newState };
  updateUI();

  if (newState.connected) startTimer();
  else stopTimer();
});

// ═══════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════

async function loadSettings() {
  try {
    state.settings = await api.getSettings();
    $('#setting-fingerprint').value = state.settings.fingerprint || 'random';
    $('#setting-vless-port').value = state.settings.vlessPort || 443;
    $('#setting-mtu').value = state.settings.mtu || 1420;
    $('#setting-block-torrent').checked = state.settings.blockTorrent !== false;
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function setupSettingsListeners() {
  const save = async () => {
    const settings = {
      fingerprint: $('#setting-fingerprint').value,
      vlessPort: parseInt($('#setting-vless-port').value) || 443,
      mtu: parseInt($('#setting-mtu').value) || 1420,
      blockTorrent: $('#setting-block-torrent').checked,
    };
    await api.setSettings(settings);
    state.settings = settings;
    showToast('Settings saved', 'success');
  };

  $('#setting-fingerprint').addEventListener('change', save);
  $('#setting-vless-port').addEventListener('change', save);
  $('#setting-mtu').addEventListener('change', save);
  $('#setting-block-torrent').addEventListener('change', save);

  $('#btn-open-logs')?.addEventListener('click', () => api.openLogs());

  $('#btn-check-engines')?.addEventListener('click', async () => {
    const result = await api.checkEngines();
    const xray = result.xrayExists ? '✅' : '❌';
    const singbox = result.singboxExists ? '✅' : '❌';
    showToast(`Xray: ${xray}  sing-box: ${singbox}`, result.xrayExists && result.singboxExists ? 'success' : 'error');
  });
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

async function init() {
  // Load servers
  let savedServers = await api.getServers();
  if (!savedServers || savedServers.length === 0) {
    savedServers = DEFAULT_SERVERS;
    await api.setServers(savedServers);
  }
  state.servers = savedServers;

  // Load last server
  const lastServer = await api.storeGet('lastServer');
  if (lastServer) {
    state.selectedServer = lastServer;
  } else if (state.servers.length > 0) {
    state.selectedServer = state.servers[0];
  }

  // Get current VPN state
  const vpnState = await api.getState();
  state = { ...state, ...vpnState };

  // Load settings
  await loadSettings();
  setupSettingsListeners();

  // Load version
  const version = await api.getVersion();
  $('#app-version').textContent = version;

  // Render
  updateUI();
  renderServerList();

  if (state.connected) startTimer();

  console.log('SecureVPN Desktop initialized');
}

init().catch(console.error);
