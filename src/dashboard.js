const path = require('path');
const { getStats } = require('./database');
const { listarBackups } = require('./backup');
const { getRecentLogs } = require('./logger');
const botState = require('./botState');
const { getOfertasActivas } = require('./mercado');

const HTML = String.raw;

function getBotUptime() {
    const ms = Date.now() - botState.startTime;
    const h  = Math.floor(ms / 3600000);
    const m  = Math.floor((ms % 3600000) / 60000);
    const s  = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
}

function getHealthSummary() {
    const mods = botState.healthModules || {};
    const entries = Object.entries(mods);
    const ok = entries.filter(([, value]) => value).length;
    const bad = entries.length - ok;
    return { entries, ok, bad, total: entries.length };
}

function getTopCmds(n = 10) {
    const stats = botState.cmdStats || new Map();
    return [...stats.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
}

function renderDashboard(req, res) {
    try {
        const stats    = getStats();
        const backups  = listarBackups();
        const logs     = getRecentLogs(60).reverse();
        const uptime   = getBotUptime();
        const status   = botState.conectado ? '🟢 Conectado' : '🔴 Desconectado';
        const health   = getHealthSummary();
        const topCmds  = getTopCmds(10);
        const ofertas  = (() => { try { return getOfertasActivas(); } catch { return []; } })();
        const ITEMS_NOMBRES = {
            escudo: '🛡️ Escudo', boost_trabajo: '💊 Boost', dado_suerte: '🎲 Dado',
            detector: '🕵️ Detector', pocion_exp: '⚗️ Poción EXP',
            caja_misteriosa: '🎁 Caja misteriosa', fianza: '⚖️ Fianza'
        };

        const topRows = stats.topEconomia.map((u, i) =>
            `<tr><td>#${i + 1}</td><td>${esc(u.nombre)}</td><td>${u.total.toLocaleString()} ⓃNC</td></tr>`
        ).join('');

        const backupRows = backups.slice(0, 10).map(b =>
            `<tr><td>${esc(b.name)}</td><td>${b.files}</td><td>${b.sizeKb} KB</td></tr>`
        ).join('') || '<tr><td colspan="3">Sin backups aún</td></tr>';

        const logLines = logs.map(l => {
            const cls = l.includes('[ERROR]') ? 'log-error'
                      : l.includes('[WARN]')  ? 'log-warn'
                      : 'log-info';
            return `<div class="log-line ${cls}">${esc(l)}</div>`;
        }).join('') || '<div class="log-line log-info">Sin logs aún.</div>';

        const errorCount = logs.filter(l => l.includes('[ERROR]')).length;
        const warnCount = logs.filter(l => l.includes('[WARN]')).length;
        const infoCount = logs.filter(l => l.includes('[INFO]')).length;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>Nexus-Bot — Panel</title>
<style>
  :root {
    --bg:    #0d0d14;
    --card:  #15151f;
    --border:#2a2a3d;
    --accent:#7c3aed;
    --green: #22c55e;
    --red:   #ef4444;
    --warn:  #f59e0b;
    --text:  #e2e8f0;
    --muted: #64748b;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', sans-serif; padding: 24px; }
  h1 { font-size: 1.6rem; color: var(--accent); margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: .85rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; }
  .stat .val { font-size: 2rem; font-weight: 700; color: var(--accent); }
  .stat .lbl { font-size: .8rem; color: var(--muted); margin-top: 4px; }
  .status-ok  { color: var(--green); }
  .status-bad { color: var(--red);   }
  .section { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
  .section h2 { font-size: 1rem; color: var(--accent); margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; font-size: .87rem; }
  th { color: var(--muted); font-weight: 600; }
  tr:not(:last-child) td { border-bottom: 1px solid var(--border); }
  .logs { max-height: 320px; overflow-y: auto; font-family: monospace; font-size: .78rem; }
  .log-line { padding: 3px 0; white-space: pre-wrap; word-break: break-all; }
  .log-error { color: #f87171; }
  .log-warn  { color: #fbbf24; }
  .log-info  { color: #94a3b8; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: .75rem; font-weight: 700; }
  .badge-green { background: #14532d; color: var(--green); }
  .badge-red   { background: #450a0a; color: var(--red);   }
  footer { text-align: center; color: var(--muted); font-size: .75rem; margin-top: 24px; }
</style>
</head>
<body>
<h1>⚡ Nexus-Bot — Panel</h1>
<p class="subtitle">Se actualiza cada 30 segundos · ${new Date().toLocaleString('es-MX')}</p>

<div class="grid">
  <div class="stat">
    <div class="val ${botState.conectado ? 'status-ok' : 'status-bad'}">${botState.conectado ? '🟢' : '🔴'}</div>
    <div class="lbl">Estado WhatsApp</div>
  </div>
  <div class="stat">
    <div class="val">${uptime}</div>
    <div class="lbl">Uptime</div>
  </div>
  <div class="stat">
    <div class="val">${stats.totalUsuarios.toLocaleString()}</div>
    <div class="lbl">Usuarios</div>
  </div>
  <div class="stat">
    <div class="val">${stats.totalGrupos.toLocaleString()}</div>
    <div class="lbl">Grupos</div>
  </div>
  <div class="stat">
    <div class="val">${stats.totalMonedas.toLocaleString()}</div>
    <div class="lbl">ⓃNC en circulación</div>
  </div>
  <div class="stat">
    <div class="val">${botState.intentosReconexion}</div>
    <div class="lbl">Reconexiones</div>
  </div>
  <div class="stat">
    <div class="val">${health.ok}/${health.total}</div>
    <div class="lbl">Módulos OK</div>
  </div>
  <div class="stat">
    <div class="val">${errorCount}</div>
    <div class="lbl">Errores recientes</div>
  </div>
  <div class="stat">
    <div class="val">${warnCount}</div>
    <div class="lbl">Avisos recientes</div>
  </div>
</div>

<div class="section">
  <h2>🏆 Top Economía</h2>
  <table>
    <thead><tr><th>#</th><th>Usuario</th><th>Total</th></tr></thead>
    <tbody>${topRows || '<tr><td colspan="3">Sin datos aún</td></tr>'}</tbody>
  </table>
</div>

<div class="section">
  <h2>📈 Top comandos más usados</h2>
  <table>
    <thead><tr><th>#</th><th>Comando</th><th>Usos</th></tr></thead>
    <tbody>
      ${topCmds.length
        ? topCmds.map(([cmd, n], i) => `<tr><td>${i + 1}</td><td>#${esc(cmd)}</td><td>${n.toLocaleString()}</td></tr>`).join('')
        : '<tr><td colspan="3">Sin datos aún (se llena en tiempo real)</td></tr>'
      }
    </tbody>
  </table>
</div>

<div class="section">
  <h2>🏪 Mercado activo</h2>
  <table>
    <thead><tr><th>ID</th><th>Ítem</th><th>Cant.</th><th>Precio u.</th><th>Vendedor</th></tr></thead>
    <tbody>
      ${ofertas.length
        ? ofertas.slice(0, 15).map(o => `<tr>
            <td>#${o.id}</td>
            <td>${esc(ITEMS_NOMBRES[o.item] || o.item)}</td>
            <td>${o.cantidad}</td>
            <td>${o.precio.toLocaleString()} ⓃNC</td>
            <td>${esc(o.vendedorNombre || o.vendedorJid.split('@')[0])}</td>
          </tr>`).join('')
        : '<tr><td colspan="5">Sin ofertas activas</td></tr>'
      }
    </tbody>
  </table>
  <p style="color:var(--muted);font-size:.8rem;margin-top:8px">${ofertas.length} oferta(s) activa(s) · #mercado, #listar, #comprarof, #cancelaroferta</p>
</div>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
  <div class="section" style="margin-bottom:0">
    <h2>💾 Backups recientes</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Archivos</th><th>Tamaño</th></tr></thead>
      <tbody>${backupRows}</tbody>
    </table>
  </div>
  <div class="section" style="margin-bottom:0">
    <h2>🧾 Resumen de logs</h2>
    <table>
      <thead><tr><th>Tipo</th><th>Cantidad</th></tr></thead>
      <tbody>
        <tr><td>✅ INFO</td><td>${infoCount}</td></tr>
        <tr><td>⚠️ WARN</td><td>${warnCount}</td></tr>
        <tr><td>❌ ERROR</td><td>${errorCount}</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>🩺 Healthcheck por módulos</h2>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
    ${health.entries.map(([name, ok]) =>
      `<span class="badge ${ok ? 'badge-green' : 'badge-red'}">${esc(name)} ${ok ? '✅' : '❌'}</span>`
    ).join('')}
  </div>
</div>

<div class="section">
  <h2>📋 Últimos logs</h2>
  <div class="logs">${logLines}</div>
</div>

<footer>Nexus-Bot by Alejx_h · Panel v2.0 — 🆕 Mercado, Misiones Semanales, Banco de Clan</footer>
</body>
</html>`);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error al cargar el panel: ' + err.message);
    }
}

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = { renderDashboard };
