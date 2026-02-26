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
const QRCode = require('qrcode');

const CARDS = require('./cards.json');

function formatCardText(text, game, currentPlayer) {
  const otherPlayers = game.players.filter(p => p.id !== currentPlayer.id);
  const girls = otherPlayers.filter(p => p.sex === 'f');
  const boys = otherPlayers.filter(p => p.sex === 'm');

  const randomOther = () => otherPlayers.length > 0 ? `[[${otherPlayers[Math.floor(Math.random() * otherPlayers.length)].name}]]` : '[[quelqu\'un]]';
  const randomGirl = () => girls.length > 0 ? `[[${girls[Math.floor(Math.random() * girls.length)].name}]]` : randomOther();
  const randomBoy = () => boys.length > 0 ? `[[${boys[Math.floor(Math.random() * boys.length)].name}]]` : randomOther();
  const oppositeSex = () => currentPlayer.sex === 'm' ? randomGirl() : randomBoy();

  let formatted = text;
  formatted = formatted.replace(/{joueur oppos[eé]}/gi, oppositeSex());
  formatted = formatted.replace(/{F}/gi, randomGirl());
  formatted = formatted.replace(/{M}/gi, randomBoy());
  formatted = formatted.replace(/{autre}/gi, randomOther());
  return formatted;
}

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

// Serve cards database for admin UI
app.get('/cards.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'cards.json'));
});

// Board editor
app.get('/board-editor.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'board-editor.html'));
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
 *     players: [{ id, name, sex, color, ready, position, jokerUsed, isActive }],
 *     currentPlayerIndex: number,
 *     diceValue: number | null,
 *     playedCardsIds: Set<number>
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
// ── Plateau aligné : gauche=FROID (cols 0-2), milieu=G (col 3), droite=CHAUD (cols 4-6)
// Snake : top-left → bottom-right
// Row 0 L→R  idx 0-6  : col 0,1,2,3,4,5,6
// Row 1 R→L  idx 7-13 : col 6,5,4,3,2,1,0
// Row 2 L→R  idx 14-20: col 0,1,2,3,4,5,6
// Row 3 R→L  idx 21-27: col 6,5,4,3,2,1,0
// Row 4 L→R  idx 28-34: col 0,1,2,3,4,5,6
// Row 5 R→L  idx 35   : col 6 = FINISH bas-droite
const BOARD = [
  // Row 0
  { id: 0, type: 'start', label: 'START' },
  { id: 1, type: 'cold', label: '❄️' },
  { id: 2, type: 'GF', label: 'GF' },
  { id: 3, type: 'cold', label: '❄️' },
  { id: 4, type: 'hot', label: '🔥' },
  { id: 5, type: 'hot', label: '🔥', barred: true },
  { id: 6, type: 'hot', label: '🔥' },
  // Row 1
  { id: 7, type: 'hot', label: '🔥' },
  { id: 8, type: 'hot', label: '🔥', barred: true },
  { id: 9, type: 'GF', label: 'GF' },
  { id: 10, type: 'G', label: 'G' },
  { id: 11, type: 'cold', label: '❄️' },
  { id: 12, type: 'G', label: 'G' },
  { id: 13, type: 'cold', label: '❄️' },
  // Row 2
  { id: 14, type: 'GH', label: 'GH' },
  { id: 15, type: 'cold', label: '❄️' },
  { id: 16, type: 'cold', label: '❄️' },
  { id: 17, type: 'G', label: 'G' },
  { id: 18, type: 'hot', label: '🔥' },
  { id: 19, type: 'hot', label: '🔥', barred: true },
  { id: 20, type: 'GH', label: 'GH' },
  // Row 3
  { id: 21, type: 'hot', label: '🔥' },
  { id: 22, type: 'hot', label: '🔥', barred: true },
  { id: 23, type: 'GF', label: 'GF' },
  { id: 24, type: 'G', label: 'G' },
  { id: 25, type: 'cold', label: '❄️' },
  { id: 26, type: 'cold', label: '❄️' },
  { id: 27, type: 'cold', label: '❄️' },
  // Row 4
  { id: 28, type: 'GH', label: 'GH' },
  { id: 29, type: 'cold', label: '❄️' },
  { id: 30, type: 'cold', label: '❄️' },
  { id: 31, type: 'hot', label: '🔥', barred: true },
  { id: 32, type: 'hot', label: '🔥', barred: true },
  { id: 33, type: 'hot', label: '🔥', barred: true },
  { id: 34, type: 'hot', label: '🔥' },
  // Row 5
  { id: 35, type: 'finish', label: '🏆 FIN' },
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
    // Add "sex" to the allowed properties to broadcast
    players: game.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      ready: p.ready,
      position: p.position,
      jokerUsed: p.jokerUsed,
      isActive: p.isActive,
      sex: p.sex
    })),
    currentPlayerIndex: game.currentPlayerIndex,
    diceValue: game.diceValue,
    board: BOARD,
    qrUrl: game.qrUrl,
    pendingCardDraw: game.pendingCardDraw
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
  socket.on('create_game', ({ name, sex }, callback) => {
    let code;
    do { code = generateCode(); } while (games[code]);

    const player = {
      id: socket.id,
      name: name || 'Joueur 1',
      color: PLAYER_COLORS[0],
      ready: false,
      position: 0,
      jokerUsed: false,
      isActive: false,
      sex: sex || 'm'
    };

    games[code] = {
      code,
      host: socket.id,
      phase: 'lobby',
      players: [player],
      currentPlayerIndex: 0,
      diceValue: null,
      playedCardsIds: []
    };

    socket.join(code);
    socket.data.gameCode = code;
    console.log(`[CREATE] Partie ${code} par ${name}`);
    const protocol = socket.handshake.headers['x-forwarded-proto'] || 'http';
    const host = socket.handshake.headers.host || `localhost:${PORT}`;
    const joinUrl = `${protocol}://${host}?code=${code}`;

    QRCode.toDataURL(joinUrl, {
      color: { dark: '#000000', light: '#ffffff' },
      margin: 2
    }, (err, url) => {
      games[code].qrUrl = url;
      callback({ ok: true, code, playerId: socket.id, qrUrl: url, joinUrl });
      broadcastGame(games[code]);
    });
  });

  // ── Rejoindre une partie ──────────────────────────────────
  socket.on('join_game', ({ code, name, sex }, callback) => {
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
      isActive: false,
      sex: sex || 'm'
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

    // --- KARMA DU JEU (Le dé légèrement truqué) ---
    let dice = Math.floor(Math.random() * 6) + 1;
    const pos = currentPlayer.position;

    // Analyser les 6 cases potentielles devant le joueur
    const trapRolls = [];
    for (let r = 1; r <= 6; r++) {
      const targetPos = pos + r;
      if (targetPos <= TOTAL_SQUARES) {
        const sq = BOARD[targetPos];
        // On considère comme "piège" les Gages ou les actions extrêmes (cases barrées)
        if (sq.type === 'G' || sq.type === 'GH' || sq.type === 'GF' || sq.barred === true) {
          trapRolls.push(r);
        }
      }
    }

    // S'il y a des pièges à moins de 6 cases, on a 66% de chance brut de forcer le dé à aller dessus (2 fois sur 3)
    if (trapRolls.length > 0 && Math.random() < 0.48) {
      dice = trapRolls[Math.floor(Math.random() * trapRolls.length)];
      console.log(`[KARMA] Le serveur a truqué le dé pour faire tomber ${currentPlayer.name} (pos ${pos}) sur le piège à ${dice} cases !`);
    }

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

    // Si la partie est finie, on évite le card draw
    if (game.phase === 'finished' || square.type === 'start') {
      broadcastGame(game);
      callback?.({ ok: true, dice, square });
      return;
    }

    // --- CARDS DRAW LOGIC ---
    // On met en place l'algorithme biaisé avec PROGRESSION DE L'INTENSITÉ !
    const progress = Math.min(newPos / TOTAL_SQUARES, 1.0); // 0.0 à 1.0
    // On filtre d'abord Celles qui n'ont pas encore été jouées récemment
    let availableCards = CARDS.filter(c => !game.playedCardsIds.includes(c.id));
    if (availableCards.length < 5) {
      // Si on a presque épuisé le jeu complet, on vide l'historique !
      game.playedCardsIds = [];
      availableCards = [...CARDS];
    }

    const shuffledCards = [...availableCards].sort(() => 0.5 - Math.random());


    // On sépare Actions (Lettres/Barré) et Questions (Neutre)
    const isActionSquare = square.barred || ['G', 'GH', 'GF'].includes(square.type);
    const requiredCategory = isActionSquare ? 'action' : 'question';
    let usableCards = shuffledCards.filter(c => c.category === requiredCategory);

    // Sécurité: si on n'a plus assez de cartes (ne devrait pas arriver avec l'historique de 35)
    if (usableCards.length < 5) usableCards = shuffledCards;

    // Groupes par blocs d'intensité globale filtré
    const i1 = usableCards.filter(c => c.intensity <= 2);
    const i2 = usableCards.filter(c => c.intensity === 3 || c.intensity === 4);
    const i3 = usableCards.filter(c => c.intensity === 5 || c.intensity === 6);
    const i4 = usableCards.filter(c => c.intensity === 7 || c.intensity === 8);
    const i5 = usableCards.filter(c => c.intensity >= 9);

    let pGlace, pFroid, pChaud, pTresChaud, pExtreme;

    if (progress <= 0.33) {
      // DÉBUT DE PARTIE (Chaud dès le début comme demandé !)
      pGlace = [...i1, ...i2];
      pFroid = [...i2, ...i3];
      pChaud = [...i3, ...i4];
      pTresChaud = [...i4, ...i5];
      pExtreme = [...i5]; // On lâche déjà les extrêmes pour les cases barrées !
    } else if (progress <= 0.66) {
      // MILIEU DE PARTIE
      pGlace = [...i2];
      pFroid = [...i3];
      pChaud = [...i4];
      pTresChaud = [...i5];
      pExtreme = [...i5];
    } else {
      // FIN DE PARTIE (Hardcore !)
      pGlace = [...i3];
      pFroid = [...i4];
      pChaud = [...i5];
      pTresChaud = [...i5];

      const iMax = usableCards.filter(c => c.intensity >= 10);
      pExtreme = iMax.length >= 2 ? [...iMax] : [...i5];
    }

    let rawCards = [];

    // Fonction qui pioche la première carte dispo dans l'ordre de priorité des decks
    function draw(pools) {
      for (const p of pools) {
        if (p && p.length > 0) {
          const drawn = p.shift();

          // Ajout à l'historique récent (on bannit pratiquement toutes les cartes précédentes)
          game.playedCardsIds.push(drawn.id);
          if (game.playedCardsIds.length > 200) {
            game.playedCardsIds.shift();
          }

          return drawn;
        }
      }
      return usableCards[Math.floor(Math.random() * usableCards.length)] || CARDS[0]; // sécurité
    }

    for (let i = 0; i < 5; i++) {
      let pct = Math.random() * 100;

      if (square.barred) {
        // Case extrême : 100% extrême
        rawCards.push(draw([pExtreme, pTresChaud, pChaud, pFroid]));
      } else if (square.type === 'GH') {
        // Case très chaude : 70% extrême, 30% très chaud
        if (pct < 70) rawCards.push(draw([pExtreme, pTresChaud, pChaud, pFroid]));
        else rawCards.push(draw([pTresChaud, pExtreme, pChaud, pFroid]));
      } else if (square.type === 'G' || square.type === 'hot') {
        // Case chaude : 50% très chaud, 30% extrême, 20% chaud
        if (pct < 50) rawCards.push(draw([pTresChaud, pExtreme, pChaud, pFroid]));
        else if (pct < 80) rawCards.push(draw([pExtreme, pTresChaud, pChaud, pFroid]));
        else rawCards.push(draw([pChaud, pTresChaud, pExtreme, pFroid]));
      } else {
        // Case FROIDE (Cold / GF) 
        // TRÈS RARE glacé (10%), un peu de Froid (40%), beaucoup de chaud (50%)
        if (pct < 10) rawCards.push(draw([pGlace, pFroid, pChaud, pTresChaud]));
        else if (pct < 50) rawCards.push(draw([pFroid, pChaud, pGlace, pTresChaud]));
        else rawCards.push(draw([pChaud, pFroid, pTresChaud, pExtreme]));
      }
    }

    const drawnCards = rawCards.map(c => ({
      ...c,
      text: formatCardText(c.text, game, currentPlayer)
    }));

    // Pick a picker (another player randomly, if alone pick oneself)
    const otherPlayers = game.players.filter(p => p.id !== currentPlayer.id);
    const picker = otherPlayers.length > 0 ? otherPlayers[Math.floor(Math.random() * otherPlayers.length)] : currentPlayer;

    game.pendingCardDraw = {
      pickerId: picker.id,
      pickerName: picker.name,
      targetPlayerId: currentPlayer.id,
      targetName: currentPlayer.name,
      cards: drawnCards,
      selected: null
    };

    broadcastGame(game);
    callback?.({ ok: true, dice, square });
  });

  // ── Sélection de carte ─────────────────────────────────────
  socket.on('select_card', ({ cardId }, callback) => {
    const game = getGame(socket.data.gameCode);
    if (!game || !game.pendingCardDraw) return;
    if (game.pendingCardDraw.pickerId !== socket.id) return callback?.({ ok: false });

    const card = game.pendingCardDraw.cards.find(c => c.id === cardId);
    if (card) {
      game.pendingCardDraw.selected = card;
      console.log(`[CARD] ${game.pendingCardDraw.pickerName} a pioché la carte "${card.text}" pour ${game.pendingCardDraw.targetName}`);
      broadcastGame(game);
      callback?.({ ok: true });
    }
  });

  // ── Fin de tour ───────────────────────────────────────────
  socket.on('end_turn', () => {
    const game = getGame(socket.data.gameCode);
    if (!game || game.phase !== 'playing') return;
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== socket.id) return;

    // Met à jour isActive
    game.players.forEach(p => { p.isActive = false; });
    const nextIdx = (game.currentPlayerIndex + 1) % game.players.length;
    game.currentPlayerIndex = nextIdx;
    game.diceValue = null;
    game.pendingCardDraw = null;
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
    game.jokerVote = {
      playerId: player.id,
      yes: 0,
      no: 0,
      voters: []
    };

    io.to(game.code).emit('joker_used', { playerName: player.name, playerId: player.id });
    console.log(`[JOKER] ${player.name} lance un vote de Joker`);
    broadcastGame(game);
    callback?.({ ok: true });

    // Auto pass if testing alone
    if (game.players.length <= 1) {
      io.to(game.code).emit('joker_vote_result', { passed: true });
      game.jokerVote = null;
    }
  });

  // ── Vote Joker ────────────────────────────────────────────
  socket.on('vote_joker', ({ accept }) => {
    const game = getGame(socket.data.gameCode);
    if (!game || !game.jokerVote) return;

    // Empêcher le double vote ou le vote de l'initiateur
    if (game.jokerVote.voters.includes(socket.id)) return;
    if (socket.id === game.jokerVote.playerId) return;

    game.jokerVote.voters.push(socket.id);
    if (accept) game.jokerVote.yes++;
    else game.jokerVote.no++;

    const voter = getPlayer(game, socket.id);
    const voterName = voter ? voter.name : '?';
    io.to(game.code).emit('joker_vote', { accept, voterName });

    // Dépouillement
    const totalVoters = game.players.length - 1;
    if (game.jokerVote.voters.length >= totalVoters) {
      const passed = game.jokerVote.yes > game.jokerVote.no;
      io.to(game.code).emit('joker_vote_result', { passed });

      if (!passed) {
        // Joker refusé => on le rend au joueur
        const p = getPlayer(game, game.jokerVote.playerId);
        if (p) p.jokerUsed = false;
        console.log(`[JOKER] Refusé pour ${p ? p.name : '?'}, Joker rendu.`);
      } else {
        console.log(`[JOKER] Accepté !`);
      }

      game.jokerVote = null;
      broadcastGame(game);
    }
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
