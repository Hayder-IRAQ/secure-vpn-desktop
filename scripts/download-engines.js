#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════
// Download VPN Engines: Xray-core + sing-box
// Run: node scripts/download-engines.js
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const XRAY_VERSION = '25.3.6';
const SINGBOX_VERSION = '1.12.0';

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'xray');

function getPlatformInfo() {
  const platform = os.platform();
  const arch = os.arch();

  let xrayPlatform, singboxPlatform;

  if (platform === 'win32') {
    xrayPlatform = arch === 'x64' ? 'Xray-windows-64' : 'Xray-windows-32';
    singboxPlatform = arch === 'x64' ? 'sing-box-windows-amd64' : 'sing-box-windows-386';
  } else if (platform === 'darwin') {
    xrayPlatform = arch === 'arm64' ? 'Xray-macos-arm64-v8a' : 'Xray-macos-64';
    singboxPlatform = arch === 'arm64' ? 'sing-box-darwin-arm64' : 'sing-box-darwin-amd64';
  } else {
    xrayPlatform = arch === 'arm64' ? 'Xray-linux-arm64-v8a' : 'Xray-linux-64';
    singboxPlatform = arch === 'arm64' ? 'sing-box-linux-arm64' : 'sing-box-linux-amd64';
  }

  return { platform, arch, xrayPlatform, singboxPlatform };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`  Downloading: ${url}`);
    const file = fs.createWriteStream(dest);

    const request = (url) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const pct = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${pct}%  `);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\n  ✅ Downloaded');
          resolve(dest);
        });
      }).on('error', reject);
    };

    request(url);
  });
}

async function extractZip(zipPath, destDir) {
  console.log(`  Extracting...`);
  if (os.platform() === 'win32') {
    execSync(`powershell -command "Expand-Archive -Force '${zipPath}' '${destDir}'"`, { stdio: 'inherit' });
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
  }
  fs.unlinkSync(zipPath);
  console.log('  ✅ Extracted');
}

async function main() {
  const info = getPlatformInfo();
  console.log(`\n═══ SecureVPN Engine Downloader ═══`);
  console.log(`Platform: ${info.platform} (${info.arch})\n`);

  // Create resources dir
  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  const ext = info.platform === 'win32' ? '.exe' : '';

  // ─── Download Xray-core ───
  const xrayDest = path.join(RESOURCES_DIR, `xray-core${ext}`);
  if (fs.existsSync(xrayDest)) {
    console.log(`[Xray-core] Already exists at ${xrayDest}`);
  } else {
    console.log(`[Xray-core] Downloading v${XRAY_VERSION}...`);
    const xrayUrl = `https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/${info.xrayPlatform}.zip`;
    const zipPath = path.join(RESOURCES_DIR, 'xray.zip');

    try {
      await downloadFile(xrayUrl, zipPath);
      await extractZip(zipPath, RESOURCES_DIR);

      // Rename binary
      const possibleNames = ['xray', 'xray.exe'];
      for (const name of possibleNames) {
        const src = path.join(RESOURCES_DIR, name);
        if (fs.existsSync(src)) {
          fs.renameSync(src, xrayDest);
          break;
        }
      }

      // Make executable on unix
      if (info.platform !== 'win32') {
        fs.chmodSync(xrayDest, '755');
      }
    } catch (e) {
      console.error(`  ❌ Failed to download Xray-core: ${e.message}`);
      console.log(`  Download manually from: https://github.com/XTLS/Xray-core/releases`);
      console.log(`  Place binary as: ${xrayDest}`);
    }
  }

  // ─── Download sing-box ───
  const singboxDest = path.join(RESOURCES_DIR, `sing-box${ext}`);
  if (fs.existsSync(singboxDest)) {
    console.log(`\n[sing-box] Already exists at ${singboxDest}`);
  } else {
    console.log(`\n[sing-box] Downloading v${SINGBOX_VERSION}...`);
    const singboxArchiveExt = info.platform === 'win32' ? 'zip' : 'tar.gz';
    const singboxUrl = `https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/${info.singboxPlatform}.${singboxArchiveExt}`;
    const archivePath = path.join(RESOURCES_DIR, `singbox.${singboxArchiveExt}`);

    try {
      await downloadFile(singboxUrl, archivePath);

      if (singboxArchiveExt === 'zip') {
        await extractZip(archivePath, RESOURCES_DIR);
      } else {
        execSync(`tar -xzf "${archivePath}" -C "${RESOURCES_DIR}"`, { stdio: 'inherit' });
        fs.unlinkSync(archivePath);
      }

      // Find and rename binary
      const findBinary = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findBinary(fullPath);
            if (found) return found;
          } else if (entry.name.startsWith('sing-box')) {
            return fullPath;
          }
        }
        return null;
      };

      const binaryPath = findBinary(RESOURCES_DIR);
      if (binaryPath && binaryPath !== singboxDest) {
        fs.renameSync(binaryPath, singboxDest);
      }

      // Make executable on unix
      if (info.platform !== 'win32') {
        fs.chmodSync(singboxDest, '755');
      }

      console.log('  ✅ Extracted');
    } catch (e) {
      console.error(`  ❌ Failed to download sing-box: ${e.message}`);
      console.log(`  Download manually from: https://github.com/SagerNet/sing-box/releases`);
      console.log(`  Place binary as: ${singboxDest}`);
    }
  }

  console.log(`\n═══ Done ═══`);
  console.log(`Binaries location: ${RESOURCES_DIR}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Edit server configs in src/renderer/app.js (DEFAULT_SERVERS)`);
  console.log(`  2. Run: npm start`);
}

main().catch(console.error);
