const fs = require('fs-extra');
const path = require('path');

const LOG_FILE      = path.join(__dirname, '../data/errors.log');
const MAX_LINES     = 500;
const FLUSH_INTERVAL = 30 * 1000;

const SILENT_PATTERNS = [
    /rate-overlimit/i,
    /too many requests/i,
    /overlimit/i,
    /429/i,
    /sin resultados/i,
    /no encontr[ée] resultados/i,
    /no encontr[ée] nada/i
];

let _lines   = [];
let _dirty   = false;
let _loaded  = false;

function _load() {
    if (_loaded) return;
    _loaded = true;
    try {
        fs.ensureFileSync(LOG_FILE);
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        _lines = content.split('\n').filter(Boolean);
        if (_lines.length > MAX_LINES) _lines = _lines.slice(-MAX_LINES);
    } catch { _lines = []; }
}

function _flush() {
    if (!_dirty) return;
    try {
        fs.ensureFileSync(LOG_FILE);
        fs.writeFileSync(LOG_FILE, _lines.join('\n') + '\n');
        _dirty = false;
    } catch {}
}

setInterval(_flush, FLUSH_INTERVAL).unref();
process.on('exit',    _flush);
process.on('SIGINT',  () => { _flush(); process.exit(0); });
process.on('SIGTERM', () => { _flush(); process.exit(0); });

function timestamp() {
    return new Date().toISOString();
}

function writeLog(level, msg) {
    try {
        const text = String(msg || '');
        if (SILENT_PATTERNS.some(r => r.test(text))) return;
        _load();
        const line = `[${timestamp()}] [${level}] ${text}`;
        _lines.push(line);
        if (_lines.length > MAX_LINES) _lines = _lines.slice(-MAX_LINES);
        _dirty = true;
        if (level === 'ERROR') _flush();
    } catch (_) {}
}

function logError(msg, err) {
    const errMsg = err ? `${msg}: ${err.message || String(err)}` : msg;
    if (SILENT_PATTERNS.some(r => r.test(errMsg))) return;
    console.error(`❌ ${errMsg}`);
    writeLog('ERROR', errMsg);
}

function logInfo(msg) {
    writeLog('INFO', msg);
}

function logWarn(msg) {
    console.warn(`⚠️  ${msg}`);
    writeLog('WARN', msg);
}

function getRecentLogs(n = 80) {
    _load();
    return _lines.slice(-n);
}

module.exports = { logError, logInfo, logWarn, getRecentLogs };
