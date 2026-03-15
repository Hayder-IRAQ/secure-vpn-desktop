<div align="center">

# 🔒 SecureVPN Desktop

**Desktop VPN client built with Electron + Xray-core + sing-box**

[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)](https://electronjs.org)
[![Xray-core](https://img.shields.io/badge/Xray--core-VLESS+REALITY-blue)](https://github.com/XTLS/Xray-core)
[![sing-box](https://img.shields.io/badge/sing--box-TUN-orange)](https://github.com/SagerNet/sing-box)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-green)]()

</div>

---

## Architecture

```
User Apps → TUN (sing-box) → SOCKS5:45361 (Xray) → VLESS+REALITY → Server
```

Full system-level VPN — routes ALL traffic, no browser extension needed.

---

## Features

| Feature | Details |
|---|---|
| 🌍 **Multi-server** | Connect to any VLESS+REALITY server |
| 🔄 **Fast server switch** | Change server without full reconnect |
| 🛡️ **Full tunnel** | Routes ALL system traffic via TUN interface |
| 🔒 **DNS leak protection** | DoH + DoT through the VPN tunnel |
| 🚫 **Torrent blocking** | Optional BitTorrent block |
| 📦 **Auto binary download** | Downloads Xray + sing-box automatically |
| 🖥️ **System tray** | Minimize to tray, stays active while connected |
| 🏗️ **Cross-platform build** | Windows (NSIS), macOS (DMG), Linux (AppImage) |

---

## Quick Start

### 1. Install
```bash
npm install
npm run download-xray
```

### 2. Configure servers

Edit `src/renderer/app.js` → `DEFAULT_SERVERS`:

```javascript
{
  ip: '185.xx.xx.xx',
  port: 443,
  uuid: 'your-vless-uuid',
  sni: 'www.google.com',
  publicKey: 'your-reality-public-key',
  shortId: '',
}
```

### 3. Run
```bash
npm run dev       # Development
npm run build     # Build installer
```

---

## Project Structure

```
secure-vpn-desktop/
├── src/
│   ├── main/
│   │   ├── main.js          # Electron main — VPN lifecycle, process manager
│   │   └── preload.js       # Secure IPC bridge (contextBridge)
│   └── renderer/
│       ├── index.html
│       ├── app.js           # UI logic (vanilla JS)
│       └── styles/
├── scripts/
│   └── download-engines.js  # Auto-downloads xray + sing-box binaries
├── resources/
│   └── xray/                # VPN binaries (gitignored)
└── package.json
```

---

## How It Works

1. **Xray-core** starts → SOCKS5 proxy at `127.0.0.1:45361` → VLESS+REALITY tunnel to server
2. **sing-box** starts → TUN interface → captures all system traffic → routes through Xray
3. DNS goes through DoH/DoT via the tunnel — zero leaks
4. App verifies connection by checking public IP changed

**Server switch:** Only Xray restarts — sing-box TUN stays up, minimizing downtime.

---

## IPC API

| Channel | Description |
|---|---|
| `vpn:connect` | Connect to a server |
| `vpn:disconnect` | Disconnect |
| `vpn:change-server` | Switch server (fast) |
| `vpn-state-changed` | State update event (main→renderer) |
| `servers:get/set` | Manage server list |
| `settings:get/set` | Manage settings |
| `app:check-engines` | Check if binaries exist |

---

## Security

- `contextIsolation: true` — renderer has no Node.js access
- `nodeIntegration: false` — standard Electron security
- Typed `ipcMain.handle` for all IPC calls
- Configs generated dynamically, written to `userData/configs/`

---

## Dependencies

| Package | Purpose |
|---|---|
| `electron` | Desktop framework |
| `electron-builder` | Cross-platform packaging |
| `electron-store` | Persistent settings |
| `electron-log` | File logging |
| Xray-core *(external)* | VLESS+REALITY proxy engine |
| sing-box *(external)* | TUN + routing engine |

---

## Legal Notice

For legitimate privacy use. Users are responsible for local VPN regulations.

Third-party licenses:
- Xray-core: [MPL 2.0](https://github.com/XTLS/Xray-core/blob/main/LICENSE)
- sing-box: [GPL v3](https://github.com/SagerNet/sing-box/blob/dev-next/LICENSE)

---

## License

MIT — see [LICENSE](LICENSE)

## Author

**Hayder Odhafa / حيدر عذافة** — [@Hayder-IRAQ](https://github.com/Hayder-IRAQ)
