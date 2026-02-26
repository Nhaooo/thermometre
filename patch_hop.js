const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Bloquer updateTokens pendant l'animation
const OLD_UPDATE = "    function updateTokens(players, board) {\n      document.querySelectorAll('.player-token').forEach(t => t.remove());";
const NEW_UPDATE = "    function updateTokens(players, board) {\n      if (isAnimating) return; // hop animation running\n      document.querySelectorAll('.player-token').forEach(t => t.remove());";
if (!html.includes(OLD_UPDATE)) { console.error('updateTokens not found'); process.exit(1); }
html = html.replace(OLD_UPDATE, NEW_UPDATE);

// 2. Remplacer doRoll pour capturer la position de départ + lancer l'animation
const OLD_ROLL = `    function doRoll(diceEl) { diceEl.classList.add('rolling'); let i = 0; const ani = setInterval(() => { diceEl.textContent = FACES[Math.floor(Math.random() * 6)]; if (++i > 8) clearInterval(ani); }, 60); socket.emit('roll_dice', res => { diceEl.classList.remove('rolling'); if (!res?.ok) { toast('❌ ' + (res?.error || 'Erreur')); return; } const f = FACES[res.dice - 1]; $('dice-el').textContent = f; $('dice-mob').textContent = f; toast('🎲 ' + res.dice + ' !'); if (res.square) setTimeout(() => { const cur = currentState?.players[currentState?.currentPlayerIndex]; const isHot = squareHotness[res.square.id]; showCaseToast(res.square, cur?.name || '?', isHot); }, 500); }); }`;
const NEW_ROLL = `    let isAnimating = false;

    // ── ANIMATION SAUT DE CASE ──
    function smoothCamTo(idx) {
      if (!cellPositions[idx]) return;
      const col = $('game-board-col');
      const p = cellPositions[idx];
      const cx = p.x + CELL_SZ/2, cy = p.y + CELL_SZ/2;
      const world = $('board-world');
      world.style.transition = 'transform 0.2s ease';
      camX = col.offsetWidth/2 - cx*camScale;
      camY = col.offsetHeight/2 - cy*camScale;
      applyTransform();
      setTimeout(() => { world.style.transition = ''; }, 220);
    }

    function animateHop(player, fromPos, steps) {
      if (!cellPositions.length) return;
      isAnimating = true;
      const world = $('board-world');
      // Remove this player's token, add animated one
      document.querySelectorAll('.player-token').forEach(t => t.remove());

      const tok = document.createElement('div');
      tok.className = 'player-token';
      tok.id = 'token-anim-' + player.id;
      tok.innerHTML = '<div>'+player.name[0].toUpperCase()+'</div><div class="tok-name">'+player.name.slice(0,5)+'</div>';
      tok.style.cssText = 'background:'+player.color+';transition:none;';
      const sp = cellPositions[fromPos];
      tok.style.left = (sp.x + CELL_SZ/2)+'px';
      tok.style.top  = (sp.y + CELL_SZ/2)+'px';
      world.appendChild(tok);

      const HOP = 280; // ms par case
      let step = 0;

      function hop() {
        if (step >= steps) {
          // Fin animation → rendu normal
          tok.remove();
          isAnimating = false;
          if (currentState) updateTokens(currentState.players, currentBoard);
          updateActiveCellHighlight();
          return;
        }
        step++;
        const pos = Math.min(fromPos + step, cellPositions.length - 1);
        const cp = cellPositions[pos];

        // Bounce spring via CSS transition
        tok.style.transition = 'left 0.16s cubic-bezier(0.34,1.56,0.64,1), top 0.16s cubic-bezier(0.34,1.56,0.64,1)';
        tok.style.left = (cp.x + CELL_SZ/2)+'px';
        tok.style.top  = (cp.y + CELL_SZ/2)+'px';

        // Flash cell
        const cell = $('cell-'+pos);
        if (cell) { cell.classList.add('cell-active-pulse'); setTimeout(()=>cell.classList.remove('cell-active-pulse'), HOP-30); }

        // Camera suit le jeton
        smoothCamTo(pos);

        setTimeout(hop, HOP);
      }
      setTimeout(hop, 80);
    }

    function doRoll(diceEl) {
      const cur = currentState?.players[currentState?.currentPlayerIndex];
      const startPos = cur?.position ?? 0;
      diceEl.classList.add('rolling');
      let i = 0;
      const ani = setInterval(() => { diceEl.textContent = FACES[Math.floor(Math.random()*6)]; if(++i>8) clearInterval(ani); }, 60);
      socket.emit('roll_dice', res => {
        diceEl.classList.remove('rolling');
        if (!res?.ok) { toast('❌ ' + (res?.error || 'Erreur')); return; }
        const f = FACES[res.dice-1]; $('dice-el').textContent=f; $('dice-mob').textContent=f;
        toast('🎲 '+res.dice+' !');
        // Lance l'animation de saut
        if (cur && cellPositions.length > 0) animateHop(cur, startPos, res.dice);
        // Toast case après fin d'animation
        if (res.square) {
          const delay = 80 + res.dice * 280 + 400;
          setTimeout(() => {
            const curNow = currentState?.players[currentState?.currentPlayerIndex];
            showCaseToast(res.square, curNow?.name||'?', squareHotness[res.square.id]);
          }, delay);
        }
      });
    }`;

if (!html.includes(OLD_ROLL)) { console.error('doRoll not found'); process.exit(1); }
html = html.replace(OLD_ROLL, NEW_ROLL);

fs.writeFileSync('index.html', html, 'utf8');
console.log('OK - hop animation added');
