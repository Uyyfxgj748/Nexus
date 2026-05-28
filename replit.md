# Nexus-Bot — WhatsApp
A comprehensive WhatsApp bot providing entertainment, utility, and administrative features for groups and individual users.

## Run & Operate
To run the bot, execute the main script.
```bash
npm start
```
No specific environment variables are explicitly mentioned as required.

## Stack
- **Frameworks**: Node.js, Express (for dashboard)
- **Runtime**: Node.js
- **WhatsApp Library**: `@whiskeysockets/baileys`
- **ORM**: Flat JSON files (`data/*.json`)
- **Validation**: _Populate as you build_
- **Build Tool**: _Populate as you build_

## Where things live
- `src/`: Main application source code.
    - `src/handler.js`: Central command router.
    - `src/database.js`: Handles user and group data persistence.
    - `src/ai.js`: AI integration logic.
    - `src/downloads.js`: Multimedia download functionalities.
    - `src/personajes.js`: Gacha/character system.
    - `src/logger.js`: Error logging and retrieval.
    - `src/backup.js`: Automatic backup utility.
    - `src/cooldowns.js`: Centralized cooldown management.
    - `src/dashboard.js`: Web administration panel.
- `data/`: Persistent data storage.
    - `data/usuarios.json`: User data (source of truth).
    - `data/grupos.json`: Group configurations (source of truth).
    - `data/clanes.json`: Clan data.
    - `data/errors.log`: Error logs.
- `cookies.txt`: YouTube cookies for enhanced download reliability (template provided).
- `./yt-dlp`: Local `yt-dlp` binary.

## Architecture decisions
- **In-memory Caching with Disk Persistence**: User and group data are cached in RAM to minimize disk I/O, with changes flushed to disk every 5 seconds or immediately for critical writes. Data is also flushed on bot shutdown.
- **Multi-API Fallback for Downloads**: Download commands (e.g., `#yt`, `#tiktok`, `#mediafire`) utilize a chain of multiple APIs and `yt-dlp` for robustness and fallback in case one provider fails.
- **Centralized Cooldown Management**: A dedicated module (`src/cooldowns.js`) manages all bot cooldowns for consistency and ease of modification.
- **Modular Command Structure**: Commands are organized into distinct files (e.g., `economy.js`, `minijuegos.js`, `personajes.js`) and routed through a central `handler.js` switch-case, promoting maintainability.
- **AI Provider Chaining**: The `#ai` command uses a primary AI endpoint with multiple fallback providers to ensure high availability and resilience against API outages.

## Product
- **WhatsApp Bot**: Interacts with users via WhatsApp commands, using `#` as the prefix.
- **Economy System**: Features currency (`ⓃNexCoins`), work, crime, casino games, investments, loans, and item management.
- **Mini-games**: Includes trivia, math, guess, and rock-paper-scissors.
- **Gacha System**: Collectible characters (`#waifus`, `#harem`), trading, and character management.
- **Multimedia Downloads**: Supports downloading from YouTube, TikTok, Facebook, Instagram, Twitter, Spotify, SoundCloud, Mediafire, and more.
- **Imageboard Interaction**: Fetches images and videos from various imageboards (e.g., Rule34, Gelbooru) with tag translation.
- **AI Chatbot**: Conversational AI with customizable personalities and memory.
- **Group Administration**: Tools for group admins like banning, kicking, promoting, and managing group settings.
- **User Profiles & Levels**: Personalized profiles, experience points, and a ranking system.
- **Persistent Logging & Backups**: Automated error logging and hourly backups of all data files.
- **Web Dashboard**: A web interface for monitoring bot status, statistics, recent errors, and backups.

## User preferences
- _Populate as you build_

## Gotchas
- **YouTube 403 Errors**: YouTube commands require specific extractor arguments (`--extractor-args "youtube:player_client=android"`) to bypass 403 errors. Using `cookies.txt` is an additional layer of authentication.
- **NSFW Content**: NSFW commands and features are gated by a group-level `nsfw enable/disable` flag.
- **Command Cooldowns**: Many commands, especially downloads and NSFW interactions, have a global 10-second cooldown to prevent spam and blocking.
- **Owner Bypass**: Bot owners can bypass `#onlyadmin` restrictions but are still subject to the `#off` command.

## Pointers
- **WhatsApp Library**: [https://github.com/WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
- **`yt-dlp`**: [https://github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp)
- **Exporting `cookies.txt`**: Instructions are included within the `cookies.txt` file in the project root.