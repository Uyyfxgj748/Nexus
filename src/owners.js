const fs = require('fs-extra');
const path = require('path');

const OWNERS_PATH = path.join(__dirname, '../data/owners.json');
const SUPER_OWNER = '573228314749@s.whatsapp.net';

function cargarOwners() {
    if (!fs.existsSync(OWNERS_PATH)) {
        fs.writeJsonSync(OWNERS_PATH, [SUPER_OWNER]);
    }
    const data = fs.readJsonSync(OWNERS_PATH);
    if (!data.includes(SUPER_OWNER)) data.unshift(SUPER_OWNER);
    return data;
}

function guardarOwners(lista) {
    if (!lista.includes(SUPER_OWNER)) lista.unshift(SUPER_OWNER);
    fs.writeJsonSync(OWNERS_PATH, lista, { spaces: 2 });
}

function isOwner(jid) {
    const owners = cargarOwners();
    return owners.includes(jid);
}

function addOwner(jid) {
    const owners = cargarOwners();
    if (owners.includes(jid)) return false;
    owners.push(jid);
    guardarOwners(owners);
    return true;
}

function removeOwner(jid) {
    if (jid === SUPER_OWNER) return false;
    const owners = cargarOwners();
    const idx = owners.indexOf(jid);
    if (idx === -1) return false;
    owners.splice(idx, 1);
    guardarOwners(owners);
    return true;
}

function getOwners() {
    return cargarOwners();
}

module.exports = { isOwner, addOwner, removeOwner, getOwners, SUPER_OWNER };
