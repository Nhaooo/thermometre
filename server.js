/**
 * ============================================================
 *  Le Thermomètre — Serveur Backend
 *  Node.js + Express + Socket.io, tout en mémoire
 * ============================================================
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Sert l'index depuis la racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────────────────────
//  Modèle de données en mémoire
// ─────────────────────────────────────────────────────────────

/**
 * games = {
 *   [code]: {
 *     code: string,
 *     host: socketId,
 *     phase: 'lobby' | 'playing' | 'finished',
 *     players: [{ id, name, color, ready, position, jokerUsed, isActive }],
 *     currentPlayerIndex: number,
 *     diceValue: number | null
 *   }
 * }
 */
const games = {};

// Couleurs attribuées aux joueurs
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

// ─────────────────────────────────────────────────────────────
//  Définition du plateau (35 cases)
//  type: 'hot' | 'cold' | 'G' | 'GH' | 'GF' | 'start' | 'finish'
// ─────────────────────────────────────────────────────────────
const BOARD = [
  { id: 0, type: 'start', label: 'START' },
  { id: 1, type: 'cold', label: '❄️' },
  { id: 2, type: 'cold', label: '❄️' },
  { id: 3, type: 'GF', label: 'GF' },
  { id: 4, type: 'cold', label: '❄️' },
  { id: 5, type: 'cold', label: '❄️' },
  { id: 6, type: 'G', label: 'G' },
  { id: 7, type: 'cold', label: '❄️' },
  { id: 8, type: 'cold', label: '❄️' },
  { id: 9, type: 'GF', label: 'GF' },
  { id: 10, type: 'cold', label: '❄️' },
  { id: 11, type: 'cold', label: '❄️' },
  { id: 12, type: 'hot', label: '🔥' },
  { id: 13, type: 'G', label: 'G' },
  { id: 14, type: 'hot', label: '🔥' },
  { id: 15, type: 'hot', label: '🔥' },
  { id: 16, type: 'GH', label: 'GH' },
  { id: 17, type: 'hot', label: '🔥' },
  { id: 18, type: 'cold', label: '❄️' },
  { id: 19, type: 'cold', label: '❄️' },
  { id: 20, type: 'G', label: 'G' },
  { id: 21, type: 'cold', label: '❄️' },
  { id: 22, type: 'hot', label: '🔥' },
  { id: 23, type: 'GH', label: 'GH' },
  { id: 24, type: 'hot', label: '🔥' },
  { id: 25, type: 'hot', label: '🔥' },
  { id: 26, type: 'G', label: 'G' },
  { id: 27, type: 'hot', label: '🔥' },
  { id: 28, type: 'GH', label: 'GH' },
  { id: 29, type: 'hot', label: '🔥' },
  { id: 30, type: 'cold', label: '❄️' },
  { id: 31, type: 'GF', label: 'GF' },
  { id: 32, type: 'cold', label: '❄️' },
  { id: 33, type: 'hot', label: '🔥' },
  { id: 34, type: 'GH', label: 'GH' },
  { id: 35, type: 'finish', label: 'FINISH 🏆' }
];

const TOTAL_SQUARES = BOARD.length - 1; // index max = 35

// ─────────────────────────────────────────────────────────────
//  Utilitaires
// ─────────────────────────────────────────────────────────────

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getGame(code) {
  return games[code] || null;
}

function getPlayer(game, socketId) {
  return game.players.find(p => p.id === socketId) || null;
}

function broadcastGame(game) {
  io.to(game.code).emit('game_state', sanitize(game));
}

/** Enlève les infos inutiles côté client */
function sanitize(game) {
  return {
    code: game.code,
    phase: game.phase,
    players: game.players,
    currentPlayerIndex: game.currentPlayerIndex,
    diceValue: game.diceValue,
    board: BOARD
  };
}

/** Calcule le nouveau tour */
function nextTurn(game) {
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  game.diceValue = null;
  broadcastGame(game);
}

// ─────────────────────────────────────────────────────────────
//  Gestion Socket.io
// ─────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // ── Créer une partie ──────────────────────────────────────
  socket.on('create_game', ({ name }, callback) => {
    let code;
    do { code = generateCode(); } while (games[code]);

    const player = {
      id: socket.id,
      name: name || 'Joueur 1',
      color: PLAYER_COLORS[0],
      ready: false,
      position: 0,
      jokerUsed: false,
      isActive: false
    };

    games[code] = {
      code,
      host: socket.id,
      phase: 'lobby',
      players: [player],
      currentPlayerIndex: 0,
      diceValue: null
    };

    socket.join(code);
    socket.data.gameCode = code;
    console.log(`[CREATE] Partie ${code} par ${name}`);
    callback({ ok: true, code, playerId: socket.id });
    broadcastGame(games[code]);
  });

  // ── Rejoindre une partie ──────────────────────────────────
  socket.on('join_game', ({ code, name }, callback) => {
    const game = getGame(code);
    if (!game) return callback({ ok: false, error: 'Partie introuvable.' });
    if (game.phase !== 'lobby') return callback({ ok: false, error: 'La partie a déjà commencé.' });
    if (game.players.length >= 8) return callback({ ok: false, error: 'Partie complète (8 joueurs max).' });
    if (game.players.some(p => p.name === name)) return callback({ ok: false, error: 'Pseudo déjà utilisé.' });

    const player = {
      id: socket.id,
      name: name || `Joueur ${game.players.length + 1}`,
      color: PLAYER_COLORS[game.players.length % PLAYER_COLORS.length],
      ready: false,
      position: 0,
      jokerUsed: false,
      isActive: false
    };

    game.players.push(player);
    socket.join(code);
    socket.data.gameCode = code;
    console.log(`[JOIN] ${name} rejoint ${code}`);
    callback({ ok: true, code, playerId: socket.id });
    broadcastGame(game);
  });

  // ── Joueur prêt ───────────────────────────────────────────
  socket.on('player_ready', () => {
    const game = getGame(socket.data.gameCode);
    if (!game) return;
    const player = getPlayer(game, socket.id);
    if (player) { player.ready = !player.ready; broadcastGame(game); }
  });

  // ── Lancer la partie (host seulement) ─────────────────────
  socket.on('start_game', (callback) => {
    const game = getGame(socket.data.gameCode);
    if (!game) return callback?.({ ok: false, error: 'Partie introuvable.' });
    if (game.host !== socket.id) return callback?.({ ok: false, error: 'Seul le host peut lancer.' });
    if (game.players.length < 2) return callback?.({ ok: false, error: 'Il faut au moins 2 joueurs.' });
    if (!game.players.every(p => p.ready)) return callback?.({ ok: false, error: 'Tout le monde doit être prêt.' });

    game.phase = 'playing';
    game.currentPlayerIndex = 0;
    game.players.forEach(p => { p.position = 0; p.jokerUsed = false; p.isActive = false; });
    game.players[0].isActive = true;
    console.log(`[START] Partie ${game.code}`);
    callback?.({ ok: true });
    broadcastGame(game);
  });

  // ── Lancer le dé ─────────────────────────────────────────
  socket.on('roll_dice', (callback) => {
    const game = getGame(socket.data.gameCode);
    if (!game || game.phase !== 'playing') return callback?.({ ok: false });

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) return callback?.({ ok: false, error: "Ce n'est pas ton tour." });
    if (game.diceValue !== null) return callback?.({ ok: false, error: 'Dé déjà lancé.' });

    const dice = Math.floor(Math.random() * 6) + 1;
    game.diceValue = dice;

    // Calculer la nouvelle position
    const newPos = Math.min(currentPlayer.position + dice, TOTAL_SQUARES);
    currentPlayer.position = newPos;

    // A-t-on atteint la fin ?
    if (newPos >= TOTAL_SQUARES) {
      game.phase = 'finished';
      game.winner = currentPlayer.name;
      console.log(`[WIN] ${currentPlayer.name} gagne la partie ${game.code}`);
      broadcastGame(game);
      io.to(game.code).emit('game_finished', { winner: currentPlayer.name });
      callback?.({ ok: true, dice, square: BOARD[TOTAL_SQUARES] });
      return;
    }

    const square = BOARD[newPos];
    console.log(`[ROLL] ${currentPlayer.name} lance ${dice} → case ${newPos} (${square.type})`);
    broadcastGame(game);
    callback?.({ ok: true, dice, square });
  });

  // ── Fin du tour ───────────────────────────────────────────
  socket.on('end_turn', () => {
    const game = getGame(socket.data.gameCode);
    if (!game || game.phase !== 'playing') return;
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) return;

    // Met à jour isActive
    game.players.forEach(p => { p.isActive = false; });
    const nextIdx = (game.currentPlayerIndex + 1) % game.players.length;
    game.players[nextIdx].isActive = true;
    game.currentPlayerIndex = nextIdx;
    game.diceValue = null;
    broadcastGame(game);
  });

  // ── Joker ─────────────────────────────────────────────────
  socket.on('use_joker', (callback) => {
    const game = getGame(socket.data.gameCode);
    if (!game || game.phase !== 'playing') return callback?.({ ok: false });
    const player = getPlayer(game, socket.id);
    if (!player) return callback?.({ ok: false });
    if (player.jokerUsed) return callback?.({ ok: false, error: 'Joker déjà utilisé !' });

    player.jokerUsed = true;
    io.to(game.code).emit('joker_used', { playerName: player.name, playerId: player.id });
    console.log(`[JOKER] ${player.name}`);
    broadcastGame(game);
    callback?.({ ok: true });
  });

  // ── Vote Joker ────────────────────────────────────────────
  socket.on('vote_joker', ({ accept }) => {
    const game = getGame(socket.data.gameCode);
    if (!game) return;
    io.to(game.code).emit('joker_vote', { voterId: socket.id, accept });
  });

  // ── Déconnexion ───────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.data.gameCode;
    const game = getGame(code);
    if (!game) return;

    game.players = game.players.filter(p => p.id !== socket.id);
    console.log(`[DISCONNECT] ${socket.id} quitte ${code}`);

    if (game.players.length === 0) {
      delete games[code];
      console.log(`[DELETE] Partie ${code} supprimée (plus de joueurs)`);
      return;
    }

    // Passe le host si nécessaire
    if (game.host === socket.id) game.host = game.players[0].id;

    // Ajuste le currentPlayerIndex
    if (game.currentPlayerIndex >= game.players.length) {
      game.currentPlayerIndex = 0;
    }
    game.players.forEach((p, i) => { p.isActive = i === game.currentPlayerIndex; });
    broadcastGame(game);
  });
});

// ─────────────────────────────────────────────────────────────
//  Démarrage du serveur
// ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🌡️  Le Thermomètre — Serveur démarré sur http://localhost:${PORT}\n`);
});
