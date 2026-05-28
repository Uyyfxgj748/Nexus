const { isOwner } = require('./owners');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const { TODO_SFW, TODO_NSFW_IMG, TODO_NSFW_ACCION, TODO_IMAGEBOARDS, TODO_IMAGEBOARDS_VIDEO } = require('./interactions');
const { TODO_NSFW_DOWNLOADS } = require('./nsfwdownloads');

const MENU_IMAGE_PATH = path.join(__dirname, '../data/menu_image.jpg');
const MENU_MEDIA_META = path.join(__dirname, '../data/menu_media.json');
const NSFW_MENU_MEDIA_META = path.join(__dirname, '../data/nsfw_menu_media.json');

const CANAL_OFICIAL = 'https://whatsapp.com/channel/0029Vb7MdipBqbrEwYtefB21';
const DIVISOR = '༺☇༻༺☇༻༺☇༻༺☇༻༺☇༻';

// Lee metadatos de la media del menú: { tipo: 'image'|'video'|'gif', path }
function leerMenuMedia() {
    try {
        if (fs.existsSync(MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path)) return meta;
        }
    } catch {}
    if (fs.existsSync(MENU_IMAGE_PATH)) {
        return { tipo: 'image', path: MENU_IMAGE_PATH };
    }
    return null;
}

function guardarMenuMedia(meta) {
    fs.ensureDirSync(path.dirname(MENU_MEDIA_META));
    fs.writeFileSync(MENU_MEDIA_META, JSON.stringify(meta, null, 2));
}

function borrarMenuMedia() {
    try {
        if (fs.existsSync(MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path) && meta.path !== MENU_IMAGE_PATH) {
                fs.removeSync(meta.path);
            }
            fs.removeSync(MENU_MEDIA_META);
        }
    } catch {}
    if (fs.existsSync(MENU_IMAGE_PATH)) fs.removeSync(MENU_IMAGE_PATH);
}

// ── Media global del menú NSFW ────────────────────────────────────────────────
function leerNsfwMenuMedia() {
    try {
        if (fs.existsSync(NSFW_MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(NSFW_MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path)) return meta;
        }
    } catch {}
    return null;
}

function guardarNsfwMenuMedia(meta) {
    fs.ensureDirSync(path.dirname(NSFW_MENU_MEDIA_META));
    fs.writeFileSync(NSFW_MENU_MEDIA_META, JSON.stringify(meta, null, 2));
}

function borrarNsfwMenuMedia() {
    try {
        if (fs.existsSync(NSFW_MENU_MEDIA_META)) {
            const meta = JSON.parse(fs.readFileSync(NSFW_MENU_MEDIA_META, 'utf8'));
            if (meta && meta.path && fs.existsSync(meta.path)) fs.removeSync(meta.path);
            fs.removeSync(NSFW_MENU_MEDIA_META);
        }
    } catch {}
}

function comandosVertical(lista) {
    return [...new Set(lista)].map(cmd => `\`#${cmd}\``).join('\n');
}

function formatHora() {
    try {
        return new Date().toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true, timeZone: 'America/Bogota'
        });
    } catch {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }
}

// ── Construye el texto completo del menú principal ─────────────────────────
function construirMenu(pushName, totalUsers, senderPhone) {
    const hora = formatHora();
    const nombreVisible = pushName ? `${pushName}` : senderPhone;

    const header =
`╔══════( B  E  T  A )═══════╗
   ⚡ N  E  X  U  S • B  O  T ⚡
╚════════════════════════╝

Hola : @${senderPhone} (${nombreVisible}) soy Nexus bot ⚡,
aqui tienes todos los comandos disponibles:

╔════════════════════════╗

┃ 🕒 Hora    : ${hora}
┃ 👥 Total   : ${totalUsers}
┃ 👑 Dev     : Alejx_h
┃📢 Canal   : ${CANAL_OFICIAL}
┃
╚════════════════════════╝

🔍 *Busca un comando rápido:*
\`#searchcmd <texto>\` 
  |Te muestra todos los comandos que      |contienen ese texto.
`;

    return `${header}
${DIVISOR}

👤 *PERFIL Y USUARIO*
Tu identidad, progreso, fama y vida social en el bot.

\`#perfil\` \`#profile\` _<@usuario>_
  | Ver perfil completo
\`#racha\` \`#streak\` _<@usuario>_
  | Tu racha de victorias y estadísticas de juegos
\`#level\` \`#lvl\`
  | Tu nivel actual y XP
\`#leaderboard\` \`#top\` \`#lboard\`
  | Ranking de niveles del grupo
\`#rankglobal\` \`#globalrank\` \`#topglobal\`
  | Ranking global de todos los usuarios
\`#pfp\` \`#getpic\` _<@u>_
  | Ver foto de perfil de alguien
\`#marry\` \`#casarse\` _[@usuario]_
  | Casarse con alguien
\`#divorce\`
  | Divorciarte de tu pareja
\`#setbirth\` _[DD/MM/AAAA]_
  | Establecer cumpleaños
\`#delbirth\`
  | Quitar tu fecha de cumpleaños
\`#setdesc\` \`#setdescription\` _[texto]_
  | Establecer descripción de perfil
\`#setgenre\` _[m/f/nb]_ · \`#delgenre\`
  | Género del perfil
\`#setfav\` \`#setfavourite\` _[anime/personaje]_
  | Establecer tu favorito
\`#birthdays\` \`#cumpleaños\`
  | Cumpleaños del mes
\`#allbirthdays\` \`#allbirths\`
  | Todos los cumpleaños registrados
\`#rep\` \`#+rep\` _[@usuario]_
  | Dar punto de reputación
\`#reputation\` \`#reputacion\` _<@usuario>_
  | Ver reputación de alguien
\`#reptop\` \`#toprep\`
  | Ranking de reputación
\`#rango\` \`#rank\` _<@usuario>_
  | Ver tu rango actual y tabla de rangos
\`#afk\` \`#ausente\` _[razón]_
  | Marcarte ausente del chat
\`#afklist\` \`#listaafk\`
  | Ver usuarios AFK del grupo
\`#afkdel\` \`#volver\` \`#noafk\`
  | Quitarte del modo AFK manualmente

${DIVISOR}

💰 *ECONOMÍA*
Gana, pierde, invierte y conviértete en el magnate del grupo.

\`#balance\` \`#bal\` \`#saldo\` \`#coins\`
  | Ver tus ⓃNexCoins
\`#einfo\` \`#economyinfo\`
  | Tu estado económico completo
\`#daily\` \`#diario\`
  | Recompensa diaria
\`#work\` \`#w\` \`#trabajar\`
  | Trabajar (cd: 2h)
\`#crime\` \`#crimen\` _[simple|banco|mafia]_
  | Crimen por niveles de riesgo
\`#slut\`
  | Ganar de otra manera (cd: 45min)
\`#steal\` \`#rob\` \`#robar\` _[@usuario]_
  | Robar monedas (cd: 30min)
\`#pay\` \`#transferir\` \`#givecoins\` _[@u] [cantidad]_
  | Dar ⓃNexCoins a otro
\`#baltop\` \`#economyboard\`
  | Ranking de riqueza del grupo
\`#richtop\` \`#toprico\` \`#wealthtop\`
  | Ranking global de riqueza (todos los usuarios)
\`#richtopg\` \`#richtopgrupo\`
  | Ranking de riqueza del grupo actual
\`#leveltop\` \`#topnivel\` \`#globallevel\`
  | Ranking global de niveles (todos los usuarios)
\`#leveltopg\` \`#leveltopgrupo\`
  | Ranking de niveles del grupo actual
\`#minar\` \`#mine\`
  | Picar minerales (cd: 30min)
\`#adventure\` \`#aventura\`
  | Aventura épica (cd: 1h)
\`#cazar\` \`#hunt\`
  | Cazar presas (cd: 25min)
\`#fish\` \`#pescar\`
  | Pescar peces (cd: 20min)
\`#mazmorra\` \`#dungeon\`
  | Vencer monstruos (cd: 1h30)
\`#tienda\` / \`#comprar\` _[id]_ / \`#inventario\`
  | Tienda clásica con ítems

🏦 *Banco avanzado*
Guarda, retira, invierte y pide préstamos con tus ⓃNexCoins.

\`#deposit\` \`#dep\` _[cantidad|all]_
  | Depositar al banco
\`#withdraw\` \`#with\` _[cantidad|all]_
  | Retirar del banco
\`#invest\` \`#invertir\` _[cantidad]_
  | Invertir con 5% cada 6h
\`#interest\` \`#interes\`
  | Cobrar intereses acumulados
\`#loan\` \`#prestamo\` _[cantidad]_
  | Pedir préstamo
\`#payloan\` \`#pagarprestamo\`
  | Pagar tu préstamo
\`#bankinfo\` \`#bank\` \`#banco\`
  | Estado completo de tu banco

${DIVISOR}

⚔️ *RPG Y PROGRESIÓN*
Sube de nivel, lucha, completa misiones y desbloquea logros.

\`#fight\` \`#pelear\` \`#pvp\` \`#battle\` _[@usuario]_
  | Lucha 1v1 contra otro usuario
\`#stats\` \`#combate\` _<@usuario>_
  | Ver estadísticas de combate
\`#train\` \`#entrenar\`
  | Entrenar para subir stats (cd: 1h)
\`#missions\` \`#misiones\` \`#quest\`
  | Misiones activas del día y progreso
\`#claimmission\` \`#completar\`
  | Reclamar recompensa de misión diaria
\`#weeklymissions\` \`#misionessemanales\` \`#weekly\`
  | 📅 Misiones semanales (premios mayores)
\`#claimweekly\` \`#reclamarsemanales\`
  | Reclamar misiones semanales completadas
\`#achievements\` \`#logros\`
  | Logros desbloqueados
\`#achievementlist\` \`#listlogros\`
  | Todos los logros disponibles

🏰 *Clanes*
Crea o únete a un clan, compite y domina el ranking de grupos.

\`#createguild\` \`#crearclan\` _[nombre]_
  | Crear clan (cuesta 1000 ⓃNC)
\`#joinguild\` \`#unirclan\` _[nombre]_
  | Unirse a un clan
\`#leaveguild\` \`#salirclan\`
  | Salir de tu clan
\`#guildinfo\` \`#infoclan\` \`#miclan\` _<nombre>_
  | Ver info y miembros
\`#editguild\` \`#editclan\` _desc/foto_
  | Editar clan (líder/oficial)
\`#guildbattle\` \`#guerraclan\` _[clan]_
  | Declarar guerra entre clanes
\`#guildtop\` \`#topclanes\`
  | Ranking de clanes
\`#guildbankinfo\` \`#gbanco\`
  | 🏦 Banco del clan y movimientos
\`#guilddeposit\` _[cantidad]_
  | Depositar ⓃNC al banco del clan
\`#guildwithdraw\` _[cantidad]_
  | Retirar del banco (líder/oficial)
\`#guildpromote\` _[@usuario]_
  | Ascender miembro a Oficial
\`#guilddepromote\` _[@usuario]_
  | Bajar Oficial a Miembro
\`#disbandguild\`
  | Disolver el clan (solo líder)

🏪 *Mercado de usuarios*
Compra y vende ítems entre jugadores en tiempo real.

\`#mercado\` \`#market\`
  | Ver todas las ofertas activas
\`#listar\` _[item] [cantidad] [precio]_
  | Poner ítem a la venta (máx 3 ofertas)
\`#comprarof\` _[id]_
  | Comprar una oferta del mercado
\`#cancelaroferta\` _[id]_
  | Cancelar y recuperar tu oferta

${DIVISOR}

🃏 *GACHA Y COLECCIÓN*
Colecciona personajes, intercambia y cría tu Pokémon.

🎌 *Gacha (waifus / husbandos)*:

\`#roll\` \`#rw\` \`#rollwaifu\`
  | Personaje aleatorio (cd 5min, expira 3min)
\`#claim\` \`#c\` \`#reclamar\` _[nombre/responder roll]_
  | Reclamar el personaje (cd 3min)
\`#harem\` \`#waifus\` _<@usuario>_
  | Ver tus personajes (o de otro)
\`#charinfo\` \`#winfo\` _[nombre]_
  | Info completa del personaje
\`#charimage\` \`#cimage\` _[nombre]_
  | Imagen SFW del personaje
\`#charvideo\` \`#cvideo\` _[nombre]_
  | Video del personaje
\`#givechar\` \`#regalar\` _[@u] [nombre]_
  | Regalar personaje
\`#sell\` \`#vender\` _[precio] [nombre]_
  | Poner personaje en venta
\`#haremshop\` \`#wshop\`
  | Personajes en venta
\`#removesale\` \`#removerventa\` _[nombre]_
  | Quitar personaje de la venta
\`#trade\` \`#intercambiar\` _[@u] [tuChar] / [Char2]_
  | Intercambiar personajes
\`#favtop\` _<nombre>_
  | Ver favoritos / marcar favorito
\`#delwaifu\` \`#delchar\` _[nombre]_
  | Eliminar personaje
\`#gachainfo\` \`#ginfo\`
  | Tu info de gacha
\`#waifusboard\` \`#wtop\`
  | Top de personajes
\`#favoritetop\`
  | Top de favoritos del bot
\`#vote\` \`#votar\` _[nombre]_
  | Votar a un personaje
\`#serieinfo\` \`#ainfo\` _[nombre]_
  | Info de anime/serie
\`#serielist\` \`#slist\`
  | Listar series del bot
\`#buychar\` \`#buyc\` _[nombre]_
  | Comprar personaje en venta

🐾 *Pokémon (mascotas)*
Adopta, alimenta y cuida tu Pokémon favorito con hasta 5 niveles de rareza.

\`#adoptpet\` \`#adoptpokemon\` \`#pokemon\` _<nombre>_
  | Adoptar Pokémon (800 ⓃNC, 5 rarezas)
\`#petinfo\` \`#mipet\`
  | Ver stats de tu Pokémon
\`#petfeed\` \`#feed\`
  | Alimentar (30 ⓃNC, cd: 30min)
\`#petplay\` \`#jugar\`
  | Jugar (cd: 1h)
\`#changepet\` \`#newpet\` _<nombre>_
  | Cambiar de Pokémon (800 ⓃNC)
\`#abandopet\` \`#delpet\`
  | Liberar Pokémon (cd: 1h)

${DIVISOR}

🎮 *DIVERSIÓN*
Minijuegos, casino, eventos, cofres y caos divertido.

🧩 *Minijuegos*
Pon a prueba tu ingenio y suerte en distintos juegos grupales.

\`#trivia\` \`#quiz\`
  | Trivia con recompensa
\`#math\` _[facil|normal|dificil]_
  | Reto matemático
\`#ppt\` \`#rps\` _[piedra|papel|tijera] [apuesta]_
  | Piedra, papel o tijera vs bot
\`#guess\` \`#adivinar\`
  | Adivina el número secreto
\`#wordchain\` \`#palabras\`
  | Cadena de palabras sin repetir
\`#ahorcado\` \`#hangman\`
  | Adivina la palabra letra por letra
\`#scramble\` \`#descifra\`
  | Descifra la palabra revuelta
\`#quien\` \`#personaje\`
  | Adivina el personaje con pistas
\`#tsquiz\` \`#taylorswift\`
  | Trivia exclusiva de Taylor Swift 🌟
\`#completa\` \`#lyrics\`
  | Completa la letra de la canción 🎵
\`#vof\` \`#verdaderofalso\`
  | Verdadero o Falso ✅❌
\`#emojiadivina\` \`#emojiquiz\`
  | Adivina la peli/canción/anime con emojis 🎭
\`#8ball\` _[pregunta]_
  | La Bola 8 responde tu destino 🎱
\`#stopgame\` \`#endgame\`
  | Terminar minijuego activo

🎰 *Casino*
Apuesta tus ⓃNexCoins y prueba tu suerte en juegos de azar.

\`#coinflip\` \`#cf\` _[cantidad] [cara|cruz]_
  | Lanzar moneda
\`#ruleta\` \`#rt\` _[rojo|negro] [cantidad]_
  | Ruleta de colores
\`#blackjack\` \`#bj\` \`#21\` _[cantidad]_
  | Blackjack clásico
\`#hit\` / \`#stand\`
  | Pedir / Plantarse en BJ
\`#slots\` \`#tragamonedas\` _[cantidad]_
  | Tragamonedas
\`#jackpot\` \`#pozo\`
  | Ver pozo acumulado

🎁 *Cofres y eventos*
Suelta cofres con recompensas para el grupo y reclama los activos.

\`#givechest\` \`#darcofre\` \`#dropcofre\` \`#cofre\` _[cantidad]_
  | Soltar cofre con ⓃNC (admin/owner)
\`#claimchest\` \`#abrircofre\`
  | Reclamar cofre activo
\`#event\` \`#evento\`
  | Ver evento activo en este chat
\`#eventos\` \`#catalogo\`
  | Ver todos los eventos y sus efectos
\`#eventoson\`
  | Activar eventos en este grupo/chat (admin)
\`#eventosoff\`
  | Desactivar eventos en este grupo/chat (admin)

🎒 *Tienda de ítems*
Compra y usa objetos especiales con efectos únicos en el juego.

\`#shop\` \`#store\` \`#tiendaitems\`
  | Tienda especial
\`#buyitem\` \`#buyi\` _[id]_
  | Comprar ítem
\`#useitem\` \`#usar\` \`#usei\` _[id]_
  | Usar ítem del inventario
\`#inv\` \`#inventory\` \`#mochila\`
  | Ver tu inventario

🎭 *Social y trolleo*
Encuestas, verdad o reto, memes y diversas interacciones grupales.

\`#poll\` \`#encuesta\` _[Pregunta] | [Op1] | [Op2]_
  | Crear encuesta
\`#pollvote\` _[número]_
  | Votar en la encuesta activa
\`#pollresults\` \`#resultados\`
  | Ver resultados
\`#truth\` \`#verdad\` / \`#dare\` \`#reto\` / \`#tod\` _<@u>_
  | Verdad · Reto · Verdad o Reto
\`#ship\` _[@u1] [@u2]_
  | Compatibilidad amorosa
\`#meme\` \`#memes\` _[categoría]_
  | Meme aleatorio · categorías: anime | shitpost | dank | español | gaming | wholesome | dark | programacion | random
\`#frase\` \`#quote\` \`#cita\` _[tipo]_
  | Frase aleatoria · tipos: motivacional | sarcastica | filosofica | humor | amor | dark
\`#toprand\` \`#toprandom\` _[tema]_
  | Top aleatorio del grupo
\`#hack\` \`#hackear\` _<@u>_
  | Hackear a alguien (modo troll 😂)
\`#loot\` \`#recoger\` \`#pickup\`
  | Recoger loot del grupo

🎭 *Interacciones anime (SFW)* —
soportan @menciones:

${comandosVertical(TODO_SFW)}

${DIVISOR}

🤖 *NEXUS IA*
Habla, experimenta y desafía la mente de la IA.

\`#ai\` \`#nexus\` \`#gpt\` \`#ask\` _[pregunta]_
  | Hacer una pregunta a Nexus
\`#ai persona\` _[nexus|sarcastico|sabio|troll|tsundere]_
  | Cambiar la personalidad
\`#ai memory on|off\`
  | Activar/desactivar memoria del grupo
\`#ai roast\` _[@usuario]_
  | Roast creativo con IA
\`#ai reset\`
  | Borrar historial de conversación
\`#clearmemory\` \`#resetai\`
  | Limpiar memoria IA (solo admin)

${DIVISOR}

🎵 *MULTIMEDIA*
Stickers y descargas de múltiples plataformas.

🖼️ *Stickers*
Crea stickers estáticos o animados y busca packs de la comunidad.

\`#sticker\` \`#s\`
  | Crear sticker (responde imagen/video)
\`#ss\` _[búsqueda]_
  | Buscar 1 sticker animado
\`#ss\` _A[n] [búsqueda]_
  | Buscar n stickers animados (máx 5)
\`#ss\` _F[n] [búsqueda]_
  | Buscar n stickers estáticos (máx 5)
\`#again\`
  | Repetir búsqueda anterior del grupo
\`#toimage\` \`#toimg\`
  | Convertir sticker a imagen
\`#tovideo\` \`#tov\` \`#tomp4\`
  | Convertir sticker animado a video MP4

🎬 *Descargas*
Descarga videos y audio de YouTube, TikTok, Instagram y más.

\`#yt\` \`#mp4\` \`#ytmp4\` _[url]_
  | Descargar video de YouTube
\`#ytv\` \`#ytvideo\` \`#ytdescargar\` _[url]_
  | Descargar video YT (alterno HD)
\`#play\` \`#mp3\` \`#ytaudio\` _[url]_
  | Descargar audio de YouTube
\`#ytsearch\` \`#search\` _[búsqueda]_
  | Buscar en YouTube
\`#tiktok\` \`#tt\` _[url]_
  | Descargar video de TikTok
\`#ttplay\` \`#tiktokmp3\` \`#ttaudio\` _[url]_
  | Descargar audio de TikTok
\`#instagram\` \`#ig\` \`#reel\` _[url]_
  | Descargar video Instagram/Reels
\`#facebook\` \`#fb\` \`#fvideo\` _[url]_
  | Descargar video de Facebook
\`#twitter\` \`#x\` _[url]_
  | Descargar video Twitter/X
\`#pin\` \`#pinterest\` _[búsqueda]_
  | Buscar imágenes en Pinterest
\`#img\` _[búsqueda]_
  | Buscar imágenes en internet
\`#mediafire\` \`#mf\` _[url]_
  | Descargar archivo de MediaFire
\`#spotify\` \`#sp\` _[url]_
  | Descargar canción de Spotify
\`#soundcloud\` \`#sc\` _[url]_
  | Descargar audio de SoundCloud
\`#threads\` \`#thread\` _[url]_
  | Descargar de Threads (Meta)
\`#apk\` \`#apkpure\` _[nombre]_
  | Buscar y descargar APK
\`#drive\` \`#gdrive\` _[url]_
  | Descargar archivo público de Drive

${DIVISOR}

🛠️ *UTILIDADES*
Diagnóstico, info, búsqueda y comandos secundarios.

\`#searchcmd\` \`#sc\` \`#buscarcmd\` _[texto]_
  | Buscar comandos dentro del menú
\`#ping\` \`#p\`
  | Ver latencia del bot
\`#status\` \`#botinfo\` \`#infobot\`
  | Estado e info del bot
\`#del\` \`#delete\`
  | Borrar mensaje del bot (responde)
\`#suggest\` \`#sug\` \`#add\` _[texto]_
  | Sugerir algo al owner
\`#report\` \`#bug\` _[texto]_
  | Reportar un bug al owner
\`#gif\` \`#togif\` \`#mp4togif\` (responde video)
  | Convertir video corto (máx 30s) a GIF animado
\`#hd\` \`#enhance\` \`#remini\` (responde imagen)
  | Mejorar/escalar imagen ×2
\`#read\` \`#rvo\` \`#readviewonce\` (responde view-once)
  | Leer mensaje de visualización única
\`#bots\` \`#sockets\`
  | Detectar bots en el grupo
\`#invite\`
  | Link de invitación del grupo
\`#leave\` \`#salir\`
  | Salir del grupo automáticamente (el bot te saca sin que tengas que irte tú)
\`#testwelcome\` / \`#testgoodbye\`
  | Probar bienvenida o despedida
\`#gp\` \`#groupinfo\` \`#infogrupo\`
  | Info del grupo
\`#waifu\` _[nombre]_
  | Imagen SFW de personaje
\`#downloaddiag\` \`#diagdescargas\`
  | Diagnóstico de descargas 403/429
\`#logs\` \`#verlogs\` \`#errorlogs\`
  | Ver los últimos logs del bot
\`#setprimary\`
  | Establecer cuenta primaria
\`#hitomi\` / \`#nhentai\` / \`#vmp\`
  | Lectores de manga (en desarrollo)
\`#autojoin\` _<config>_
  | Auto-unirse a grupos (owner)
\`#setbotcurrency\` / \`#setbotowner\`
  | Configuración del bot (owner)
\`#menunsfw\` \`#nsfwmenu\` \`#menu18\`
  | Abrir menú NSFW (+18)

${DIVISOR}

🛡️ *ADMINISTRACIÓN* _(solo admins)_
Control total del grupo: orden, reglas y poder absoluto.

\`#welcome enable|disable\`
  | Activar/desactivar bienvenida
\`#setwelcome\` _[texto]_
  | Personalizar mensaje de bienvenida
\`#resetwelcome\`
  | Restablecer bienvenida al texto predeterminado
\`#setwelcomeimage\` \`#welcomeimg\`
  | Imagen de bienvenida (responde imagen)
\`#setmultimediawelcome\` \`#setwelcomemedia\` \`#setwelcomevideo\` \`#setwelcomegif\`
  | Imagen / GIF / video (máx 60s) bienvenida
\`#delwelcomeimage\` \`#delwelcomemedia\`
  | Quitar media de bienvenida
\`#goodbye enable|disable\`
  | Activar/desactivar despedida
\`#setgoodbye\` _[texto]_
  | Personalizar mensaje de despedida
\`#resetgoodbye\`
  | Restablecer despedida al texto predeterminado
\`#setgoodbyeimage\` \`#goodbyeimg\`
  | Imagen de despedida (responde imagen)
\`#setmultimediagoodbye\` \`#setgoodbyemedia\` \`#setgoodbyevideo\` \`#setgoodbyegif\`
  | Imagen / GIF / video (máx 60s) despedida
\`#delgoodbyeimage\` \`#delgoodbyemedia\`
  | Quitar media de despedida
\`#modlog\` _[n]_
  | Historial de moderación del grupo (últimas 15 acciones, o #modlog 30)
\`#clearmodlog\`
  | Limpiar el historial de moderación del grupo
\`#kick\` / \`#promote\` / \`#demote\` _[@u]_
  | Expulsar / Promover / Degradar
\`#fijar\` / \`#pinar\` (cita el mensaje)
  | Fijar un mensaje en el grupo (requiere citar el mensaje)
\`#desfijar\` / \`#unpinmsg\` (cita el mensaje)
  | Quitar el mensaje fijado del grupo
\`#tempban\` _[@u] [tiempo]_
  | Expulsar temporalmente (ej: #tempban @u 1h30m / 2d / 30m)
\`#tempbans\`
  | Ver todos los tempbans activos del grupo con tiempo restante
\`#untempban\` _[@u]_
  | Cancelar un tempban activo y reincorporar al usuario
\`#mutebot\` / \`#unmutebot\` _[@u]_
  | Silenciar/Activar al usuario para el bot (ignora comandos y XP)
\`#mutedlist\`
  | Ver usuarios silenciados en el grupo
\`#warn\` / \`#delwarn\` / \`#warns\` _[@u]_
  | Advertir / Quitar / Ver avisos (por grupo)
\`#resetwarns\` _[@u]_
  | Resetear todas las advertencias de un usuario en este grupo
\`#warnslist\`
  | Ver todos los usuarios con advertencias activas en el grupo
\`#setwarnlimit\` _[n]_
  | Límite de advertencias antes del kick automático
\`#open\` / \`#close\`
  | Abrir o cerrar el grupo
\`#antilink\` \`#antienlace\` _enable|disable_
  | Bloquear links en el grupo
\`#onlyadmin\` \`#onlyadmins\` _enable|disable_
  | Solo admins pueden hablar
\`#economy\` \`#economia\` _enable|disable_
  | Activar/desactivar economía
\`#nsfw\` _enable|disable_
  | Activar NSFW (+18) en el grupo
\`#gacha\` _enable|disable_
  | Activar/desactivar gacha
\`#alerts\` \`#alertas\` _enable|disable_
  | Alertas de promote/demote
\`#topmensajes\` \`#topmessages\`
  | Top de usuarios con más mensajes
\`#topinactive\` \`#topinactivos\`
  | Usuarios más inactivos del grupo
\`#cleanup\` \`#limpiar\`
  | Limpiar usuarios sin actividad
\`#tagall\` \`#tag\` \`#hidetag\` \`#tagsay\` _[mayus|minus]_
  | Mencionar a todos
\`#settag\` \`#tagmode\` _todos|admins_
  | Elegir quién puede usar el #tag (solo admins)
\`#groupimage\` \`#setgpbaner\` \`#setgroupimage\`
  | Cambiar imagen del grupo
\`#setgpname\` \`#setgroupname\` _[texto]_
  | Cambiar nombre del grupo
\`#setgpdesc\` \`#setgroupdesc\` _[texto]_
  | Cambiar descripción del grupo
\`#msgcount\` \`#count\` \`#mensajes\` _<@u>_
  | Contar mensajes del grupo o usuario
\`#config\` \`#settings\` \`#ajustes\`
  | Ver todos los ajustes actuales del grupo (cualquier miembro)

${DIVISOR}

👑 *SISTEMA / OWNER*
Control absoluto del bot, sólo para owners.

\`#botinfo\` \`#status\`
  | Información y estado del bot
\`#stats\` \`#botstats\` \`#estadisticas\`
  | Estadísticas detalladas del bot (mensajes, comandos, uptime)
\`#backup\`
  | Crear copia de seguridad manual de los datos
\`#stats\` \`#botstats\` \`#estadisticas\`
  | Estadísticas detalladas del bot (mensajes, comandos, uptime, top comandos)
\`#logs\` \`#verlogs\` \`#errorlogs\`
  | Ver los últimos errores registrados por el bot
\`#join\` _[link grupo]_
  | Unirse a un grupo por link
\`#logout\`
  | Cerrar sesión del bot
\`#reload\`
  | Reiniciar el bot
\`#on\` / \`#off\`
  | Encender o apagar el bot
\`#mantenimiento\` / \`#maint\`
  | Activar/desactivar modo mantenimiento (bloquea el bot para no-owners)
\`#setmaint\` _[mensaje]_
  | Personalizar el mensaje que ven los usuarios durante el mantenimiento
\`#grupos\` / \`#misgrupos\`
  | Listar todos los grupos donde está el bot con nombre y cantidad de miembros
\`#kickbot\` _[link grupo]_
  | Sacar el bot de un grupo (desde el grupo o por link)
\`#broadcast\` / \`#bc\` _[mensaje]_
  | Enviar un aviso a todos los grupos donde está el bot
\`#setprefix\` _[carácter]_
  | Cambiar prefijo (metadata)
\`#setchannel\` _[link]_
  | Definir canal oficial
\`#setlink\` _[link]_
  | Definir link público
\`#setpfp\` \`#setbotpic\` (responde imagen)
  | Cambiar foto de perfil del bot
\`#setusername\` \`#setbotname\` _[nombre]_
  | Cambiar nombre/about del bot
\`#addowner\` / \`#delowner\` / \`#owners\` / \`#ownerlist\`
  | Gestión de owners
\`#mediainfo\` \`#medialist\` _[sfw|nsfw]_
  | Info de archivos media cargados en el bot
\`#sfwprecalentar\` \`#sfwwarmup\`
  | Precalentar caché de imágenes SFW
\`#setmenuimage\` \`#menuimage\`
  | Imagen del menú (responde imagen)
\`#setmultimediamenu\` \`#setmenumedia\` \`#setmenuvideo\` \`#setmenugif\`
  | Imagen / GIF / video (máx 60s) del menú
\`#delmenuimage\` \`#delmenumedia\`
  | Quitar media del menú
\`#setnsfwmedia\`
  | Imagen / GIF / video para el #menunsfw
\`#delnsfwmedia\`
  | Quitar media del #menunsfw
\`#upload\` \`#uploadnsfw\` _<carpeta>_
  | Subir imagen/gif/video a una carpeta NSFW
\`#uploadsfw\` \`#subirsfw\` _<carpeta>_
  | Subir imagen/gif/video a una carpeta SFW

${DIVISOR}

⚠️El bot está en fase de pruebas 🧪, por lo que algunas funciones pueden fallar o no responder correctamente. Seguimos mejorándolo constantemente.

Si experimentas algun error, reportalo con el comando #report.

_Usa *#menunsfw* para comandos NSFW (+18).

_Nexus•System ⚡ by Alejx_h_`;
}

// ── Construye el contextInfo para que la imagen del menú sea clickeable ───
// PNG mínimo 1x1 px para no mostrar imagen grande en el banner
const TINY_THUMBNAIL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

function construirContextoCanal() {
    const ad = {
        title: '⚡ NEXUS•SYSTEM — Canal Oficial',
        body: 'Toca aquí para unirte al canal de WhatsApp',
        mediaType: 1,
        sourceUrl: CANAL_OFICIAL,
        showAdAttribution: false,
        renderLargerThumbnail: false,
        previewType: 'NONE',
        thumbnail: TINY_THUMBNAIL
    };
    return { externalAdReply: ad };
}

async function enviarMenu(sock, jid, pushName, groupMetadata, senderJid) {
    const senderId = senderJid || jid;
    const senderPhone = (senderId || '').split('@')[0];
    const totalUsers = groupMetadata?.participants?.length ?? '∞';

    const menu = construirMenu(pushName, totalUsers, senderPhone);

    const mentions = [];
    try { if (senderId) mentions.push(senderId); } catch {}

    const media = leerMenuMedia();
    if (media) {
        try {
            const buf = fs.readFileSync(media.path);
            const base = { caption: menu, mentions };
            if (media.tipo === 'image') {
                await sock.sendMessage(jid, { ...base, image: buf });
            } else if (media.tipo === 'gif') {
                await sock.sendMessage(jid, { ...base, video: buf, gifPlayback: true });
            } else if (media.tipo === 'video') {
                await sock.sendMessage(jid, { ...base, video: buf });
            } else {
                await sock.sendMessage(jid, { text: menu, mentions });
            }
            return;
        } catch (err) {
            console.error('Menu media error:', err.message);
        }
    }
    await sock.sendMessage(jid, { text: menu, mentions });
}

async function enviarMenuNsfw(sock, jid, g) {
    const nsfw = g?.nsfw === true;
    const estadoNsfw = nsfw ? '✅ ACTIVADO' : '❌ DESACTIVADO';
    const hora = formatHora();

    const menu = `╔══════( N  S  F  W )═══════╗
   🔞 N  E  X  U  S  •  +  1  8  🔞
╚════════════════════════╝

╔════════════════════════╗
┃ 🕒 Hora    : ${hora}
┃ 🔞 NSFW   : ${estadoNsfw}
┃ 👑 Dev     : Alejx_h
┃📢 Canal   : ${CANAL_OFICIAL}
┃
╚════════════════════════╝
${DIVISOR}

📷 *IMÁGENES NSFW*
_Envía una imagen +18 al instante según la categoría_

✧ \`#hentai\`
│ Hentai general explícito
✧ \`#hentaigif\`
│ Hentai en GIF animado
✧ \`#ass\` \`#poto\`
│ Culos explícitos
✧ \`#pussy\`
│ Coños explícitos
✧ \`#boobs\` \`#tetas\`
│ Tetas / paizuri
✧ \`#neko\` \`#nekomimi\`
│ Chicas neko (orejas de gato)
✧ \`#loli\`
│ Loli (flat chest)
✧ \`#milf\`
│ Milfs maduras
✧ \`#ecchi\`
│ Lencería y ropa interior
✧ \`#ero\`
│ Contenido ero / underwear
✧ \`#creampie\`
│ Creampie
✧ \`#trap\`
│ Trap / crossdresser
✧ \`#femdom\`
│ Dominación femenina

${DIVISOR}
💥 *ACCIONES NSFW* _(soportan @menciones)_
_Con o sin mención — el bot siempre reacciona_

✧ \`#anal\` <mención>
│ Hacer un anal
✧ \`#blowjob\` \`#mamada\` \`#bj\` <mención>
│ Dar una mamada
✧ \`#boobjob\` <mención>
│ Hacer una rusa
✧ \`#cum\` <mención>
│ Venirse encima de alguien
✧ \`#cummouth\` <mención>
│ Acabar en la boca de alguien
✧ \`#cumshot\` <mención>
│ Disparar semen a alguien
✧ \`#fap\` \`#paja\` <mención>
│ Hacerse una paja (pensando en alguien)
✧ \`#footjob\` <mención>
│ Paja con los pies
✧ \`#fuck\` \`#coger\` <mención>
│ Follarte a alguien
✧ \`#grabboobs\` <mención>
│ Agarrar las tetas de alguien
✧ \`#grope\` <mención>
│ Manosear a alguien
✧ \`#handjob\` <mención>
│ Hacer una paja con la mano
✧ \`#lickass\` <mención>
│ Lamer el culo de alguien
✧ \`#lickdick\` <mención>
│ Lamer un pene
✧ \`#lickpussy\` <mención>
│ Comer el coño de alguien
✧ \`#sixnine\` \`#69\` <mención>
│ Hacer un 69 con alguien
✧ \`#spank\` \`#nalgada\` <mención>
│ Darle una nalgada a alguien
✧ \`#suckboobs\` <mención>
│ Chupar las tetas de alguien
✧ \`#undress\` \`#encuerar\` <mención>
│ Desnudar a alguien
✧ \`#yuri\` \`#tijeras\` <mención>
│ Hacer tijeras con alguien

${DIVISOR}
🔍 *IMAGEBOARDS & DESCARGAS NSFW*

🗂️ _Busca por tags en booruboards_

✧ \`#rule34\` \`#r34\` <tag>
│ Busca en Rule34 (imagen)
✧ \`#danbooru\` \`#dbooru\` <tag>
│ Busca en Danbooru (imagen)
✧ \`#gelbooru\` \`#gbooru\` \`#booru\` <tag>
│ Busca en Gelbooru (imagen)
✧ \`#e621\` <tag>
│ Busca en e621 (imagen)
✧ \`#rule34video\` \`#r34video\` <tag>
│ Busca en Rule34 (video/GIF)
✧ \`#gelboorovideo\` \`#gboorovideo\` <tag>
│ Busca en Gelbooru (video/GIF)
  _Ej: #r34 miku · #danbooru rem · #r34video catgirl_

📥 _Doujins, mangas y vídeos +18_

✧ \`#hitomila\` \`#hitomi\` <link|código>
│ Descarga galería/PDF de Hitomi.la
✧ \`#nhentai\` \`#nh\` \`#nhdl\` <ID>
│ Descarga un doujin de nhentai
✧ \`#vermangasporno\` \`#vmp\` <URL/ID>
│ Descarga un manga de VerMangasPorno
✧ \`#xnxx\` <link>
│ Descarga un vídeo de XNXX
✧ \`#pornhub\` \`#ph\` <link>
│ Descarga un vídeo de Pornhub

${DIVISOR}
_Todos los comandos NSFW requieren NSFW activado en el grupo._`;

    const nsfwMedia = leerNsfwMenuMedia();
    if (nsfwMedia) {
        try {
            const buf = fs.readFileSync(nsfwMedia.path);
            if (nsfwMedia.tipo === 'image') {
                await sock.sendMessage(jid, { image: buf, caption: menu });
            } else if (nsfwMedia.tipo === 'gif') {
                await sock.sendMessage(jid, { video: buf, caption: menu, gifPlayback: true });
            } else if (nsfwMedia.tipo === 'video') {
                await sock.sendMessage(jid, { video: buf, caption: menu });
            } else {
                await sock.sendMessage(jid, { text: menu });
            }
            return;
        } catch (err) {
            console.error('[NSFW MENU] Error enviando media:', err.message);
        }
    }
    await sock.sendMessage(jid, { text: menu });
}

// ── Búsqueda de comandos dentro del menú (#searchcmd) ──────────────────────
async function cmdSearchCmd(sock, jid, args) {
    const query = (args || []).join(' ').trim().toLowerCase();
    if (!query) {
        await sock.sendMessage(jid, {
            text: '🔍 *Uso:* `#searchcmd <texto>`\n_Ejemplos:_\n• `#searchcmd waifu`\n• `#searchcmd banco`\n• `#searchcmd descargar`'
        });
        return;
    }
    const menuTxt = construirMenu(null, '∞', '0000');
    const lineas = menuTxt.split('\n');

    const resultados = [];
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        if (!linea.includes('`#')) continue;
        if (linea.toLowerCase().includes(query)) {
            const desc = (lineas[i + 1] || '').trim();
            const descLimpia = desc.startsWith('|') ? desc : '';
            resultados.push(descLimpia ? `${linea.trim()}\n  ${descLimpia}` : linea.trim());
        }
    }
    if (!resultados.length) {
        await sock.sendMessage(jid, {
            text: `🔍 No encontré comandos con: *${query}*\n_Prueba con otra palabra (ej: bal, rol, sticker, owner, etc.)_`
        });
        return;
    }
    const limit = 40;
    const total = resultados.length;
    const lista = resultados.slice(0, limit).join('\n\n');
    const sufijo = total > limit ? `\n\n_…y ${total - limit} más. Refina tu búsqueda._` : '';
    const respuesta =
        `🔍 *Resultados para:* "${query}"\n` +
        `📋 Encontré *${total}* comando(s):\n` +
        `${DIVISOR}\n\n${lista}${sufijo}`;
    await sock.sendMessage(jid, { text: respuesta });
}

// ── Comandos de imagen/multimedia del menú (solo owner) ─────────────────────
async function _guardarMenuMediaCmd(sock, jid, senderJid, msg, soloImagen) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede establecer la media del menú.' });
        return;
    }
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    let tipo = null, mediaMsg = null;
    if (msg.message?.imageMessage) { tipo = 'image'; mediaMsg = msg.message.imageMessage; }
    else if (quoted?.imageMessage) { tipo = 'image'; mediaMsg = quoted.imageMessage; }
    else if (msg.message?.videoMessage) {
        const m = msg.message.videoMessage;
        tipo = m.gifPlayback ? 'gif' : 'video'; mediaMsg = m;
    } else if (quoted?.videoMessage) {
        const m = quoted.videoMessage;
        tipo = m.gifPlayback ? 'gif' : 'video'; mediaMsg = m;
    }
    if (!mediaMsg) {
        const ej = soloImagen ? '❌ Responde a una *imagen* con *#setmenuimage*'
            : '❌ Responde a una *imagen / gif / video (máx 1 min)* con *#setmultimediamenu*';
        await sock.sendMessage(jid, { text: ej });
        return;
    }
    if (soloImagen && tipo !== 'image') {
        await sock.sendMessage(jid, { text: '❌ Este comando solo acepta *imágenes*. Para gif/video usa *#setmultimediamenu*.' });
        return;
    }
    if (tipo === 'video' || tipo === 'gif') {
        const segs = Number(mediaMsg.seconds || 0);
        if (segs && segs > 60) {
            await sock.sendMessage(jid, { text: `❌ El video dura *${segs}s*. El máximo permitido es *60 segundos*.` });
            return;
        }
    }
    try {
        const tipoBaileys = tipo === 'image' ? 'image' : 'video';
        const stream = await downloadContentFromMessage(mediaMsg, tipoBaileys);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        fs.ensureDirSync(path.dirname(MENU_IMAGE_PATH));
        const ext = tipo === 'image' ? 'jpg' : 'mp4';
        const destino = path.join(path.dirname(MENU_IMAGE_PATH), `menu_media.${ext}`);
        // Limpiar media anterior
        borrarMenuMedia();
        fs.writeFileSync(destino, buffer);
        guardarMenuMedia({ tipo, path: destino });
        const tipoTxt = tipo === 'image' ? 'imagen' : (tipo === 'gif' ? 'GIF' : 'video');
        await sock.sendMessage(jid, { text: `✅ ${tipoTxt} del menú establecida. Se mostrará al usar *#menu*.` });
    } catch (err) {
        await sock.sendMessage(jid, { text: `❌ No pude guardar la media: ${err.message}` });
    }
}

async function cmdSetMenuImage(sock, jid, senderJid, msg) {
    return _guardarMenuMediaCmd(sock, jid, senderJid, msg, true);
}
async function cmdSetMultimediaMenu(sock, jid, senderJid, msg) {
    return _guardarMenuMediaCmd(sock, jid, senderJid, msg, false);
}

async function cmdDelMenuImage(sock, jid, senderJid) {
    if (!isOwner(senderJid)) {
        await sock.sendMessage(jid, { text: '⛔ Solo el owner puede eliminar la media del menú.' });
        return;
    }
    if (!leerMenuMedia()) {
        await sock.sendMessage(jid, { text: '❌ No hay media de menú configurada.' });
        return;
    }
    borrarMenuMedia();
    await sock.sendMessage(jid, { text: '✅ Media del menú eliminada.' });
}

module.exports = {
    enviarMenu, enviarMenuNsfw, cmdSetMenuImage, cmdDelMenuImage,
    cmdSetMultimediaMenu, cmdSearchCmd,
    leerNsfwMenuMedia, guardarNsfwMenuMedia, borrarNsfwMenuMedia
};
