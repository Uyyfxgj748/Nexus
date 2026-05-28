const fs   = require('fs-extra');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 10;

const FILES_TO_BACKUP = [
    'users.json', 'grupos.json', 'clanes.json', 'owners.json',
    'estado.json', 'tienda.json', 'chests.json', 'tempbans.json',
    'reportes.json', 'sugerencias.json'
];

async function hacerBackup() {
    try {
        fs.ensureDirSync(BACKUP_DIR);
        const ts           = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupFolder = path.join(BACKUP_DIR, ts);
        fs.ensureDirSync(backupFolder);

        let count = 0;
        for (const file of FILES_TO_BACKUP) {
            const src = path.join(DATA_DIR, file);
            if (fs.existsSync(src)) {
                fs.copySync(src, path.join(backupFolder, file));
                count++;
            }
        }

        const entries = fs.readdirSync(BACKUP_DIR)
            .filter(e => fs.statSync(path.join(BACKUP_DIR, e)).isDirectory())
            .sort();
        while (entries.length > MAX_BACKUPS) {
            fs.removeSync(path.join(BACKUP_DIR, entries.shift()));
        }

        console.log(`💾 Backup completado: ${ts} (${count} archivos guardados)`);
        return { ok: true, ts, count };
    } catch (err) {
        console.error(`❌ Error en backup: ${err.message}`);
        return { ok: false, err: err.message };
    }
}

function iniciarBackupAutomatico(intervaloMs = 60 * 60 * 1000) {
    hacerBackup();
    setInterval(hacerBackup, intervaloMs);
    const mins = Math.round(intervaloMs / 60000);
    console.log(`💾 Backup automático activo — cada ${mins} minuto(s)`);
}

function listarBackups() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return [];
        return fs.readdirSync(BACKUP_DIR)
            .filter(e => fs.statSync(path.join(BACKUP_DIR, e)).isDirectory())
            .sort()
            .reverse()
            .map(name => {
                const folder = path.join(BACKUP_DIR, name);
                const files  = fs.readdirSync(folder);
                const size   = files.reduce((acc, f) => {
                    try { return acc + fs.statSync(path.join(folder, f)).size; } catch { return acc; }
                }, 0);
                return { name, files: files.length, sizeKb: Math.round(size / 1024) };
            });
    } catch { return []; }
}

module.exports = { hacerBackup, iniciarBackupAutomatico, listarBackups };
