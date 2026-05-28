const COOLDOWNS = {
    daily:      24 * 60 * 60 * 1000,
    work:       30 * 60 * 1000,        // era 2h → 30min
    crime:      10 * 60 * 1000,        // referencia de display; cada nivel tiene su espera en economy.js
    slut:       20 * 60 * 1000,        // era 45min → 20min
    minar:      15 * 60 * 1000,        // era 30min → 15min
    adventure:  25 * 60 * 1000,        // era 60min → 25min
    cazar:      15 * 60 * 1000,        // era 25min → 15min
    fish:       10 * 60 * 1000,        // era 20min → 10min
    mazmorra:   30 * 60 * 1000,        // era 90min → 30min
    steal:      15 * 60 * 1000,        // era 30min → 15min
    rep:        24 * 60 * 60 * 1000,
    train:      30 * 60 * 1000,        // era 1h → 30min
    fight:       5 * 60 * 1000,        // PVP: 5min (sin cambio)
    interest:    8 * 60 * 60 * 1000,
    loot:       12 * 60 * 60 * 1000,
    global:     10 * 1000,
};

function checkCooldown(lastTimestamp, commandName) {
    const ms = COOLDOWNS[commandName];
    if (!ms || !lastTimestamp) return { ok: true, remaining: 0, text: '' };
    const remaining = ms - (Date.now() - lastTimestamp);
    if (remaining <= 0) return { ok: true, remaining: 0, text: '' };
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    let text = '⏳ ';
    if (h > 0) text += `${h}h `;
    if (m > 0) text += `${m}m `;
    if (h === 0 && m === 0) text += `${s}s`;
    return { ok: false, remaining, text: text.trim() };
}

function formatCooldown(lastTimestamp, commandName) {
    const { ok, text } = checkCooldown(lastTimestamp, commandName);
    return ok ? '✅ ¡Listo!' : text;
}

function estaEnCooldown(lastTimestamp, commandName) {
    return !checkCooldown(lastTimestamp, commandName).ok;
}

module.exports = { COOLDOWNS, checkCooldown, formatCooldown, estaEnCooldown };
