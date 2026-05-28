const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const YTDLP_PATH    = path.join(__dirname, '..', 'yt-dlp');
const API_URL       = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

function obtenerVersionActual() {
    return new Promise((resolve) => {
        execFile(YTDLP_PATH, ['--version'], { timeout: 10000 }, (err, stdout) => {
            resolve(err ? null : stdout.trim());
        });
    });
}

function httpGet(url, seguirRedireccion = true) {
    return new Promise((resolve, reject) => {
        const opts = {
            headers: { 'User-Agent': 'NexusBot-ytdlp-updater/1.0' },
            timeout: 15000
        };
        https.get(url, opts, (res) => {
            if (seguirRedireccion && (res.statusCode === 301 || res.statusCode === 302)) {
                return httpGet(res.headers.location, true).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
    });
}

async function actualizarYtdlp() {
    try {
        const versionActual = await obtenerVersionActual();

        const rawRelease = await httpGet(API_URL);
        const release    = JSON.parse(rawRelease.toString('utf8'));
        const tagName    = (release.tag_name || '').replace(/^v/, '');

        if (!tagName) {
            console.log('🔧 yt-dlp: no se pudo obtener versión remota.');
            return;
        }

        if (versionActual === tagName) {
            console.log(`✅ yt-dlp ya está en la última versión (${versionActual}).`);
            return;
        }

        console.log(`🔄 yt-dlp: actualizando ${versionActual || 'desconocida'} → ${tagName}...`);

        const asset = (release.assets || []).find(a => a.name === 'yt-dlp');
        if (!asset?.browser_download_url) {
            console.log('⚠️  yt-dlp: no se encontró el binario Linux en el release. Saltando.');
            return;
        }

        const binaryData = await httpGet(asset.browser_download_url);

        const tmpPath = `${YTDLP_PATH}.tmp`;
        fs.writeFileSync(tmpPath, binaryData, { mode: 0o755 });
        fs.renameSync(tmpPath, YTDLP_PATH);
        fs.chmodSync(YTDLP_PATH, 0o755);

        const versionNueva = await obtenerVersionActual();
        console.log(`✅ yt-dlp actualizado correctamente a ${versionNueva}.`);

    } catch (err) {
        console.log(`⚠️  yt-dlp auto-update: ${err.message} (el bot sigue funcionando con la versión actual).`);
    }
}

module.exports = { actualizarYtdlp };
