// Client-side Application Script
const socket = io();

// Client State
let myId = null;
let isHost = false;
let selectedAvatar = '🦸';
let collapsedSquads = {}; // playerId -> boolean (true if collapsed)
let currentTimerMax = 15;

// Web Audio API Sound Synthesizer
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playSound(type) {
  try {
    initAudio();
    if (!audioCtx) return;
    
    // Resume context if suspended (browser security autoplays)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    
    if (type === 'bid') {
      // Upward electronic beep-boop
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.08); // G5
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      
      osc.start(now);
      osc.stop(now + 0.25);
    } 
    else if (type === 'sold') {
      // Triumphant chime
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(880.00, now + 0.2); // A5
      
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      osc.start(now);
      osc.stop(now + 0.5);
    } 
    else if (type === 'unsold') {
      // Downward buzzer
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.frequency.setValueAtTime(220.00, now); // A3
      osc.frequency.linearRampToValueAtTime(110.00, now + 0.4); // A2
      
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      
      osc.start(now);
      osc.stop(now + 0.45);
    }
    else if (type === 'warning') {
      // Short clock tick
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.frequency.setValueAtTime(1000, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      
      osc.start(now);
      osc.stop(now + 0.06);
    }
    else if (type === 'victory') {
      // Fanfare
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.1, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.3);
        
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.3);
      });
    }
  } catch (e) {
    console.warn("Audio synthesis failed:", e);
  }
}

// Avatar selection handler
function selectAvatar(emoji) {
  selectedAvatar = emoji;
  const options = document.querySelectorAll('.avatar-option');
  options.forEach(opt => {
    if (opt.textContent === emoji) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });
}

// Create a Party
function createParty() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();
  if (name.length === 0) {
    nameInput.reportValidity();
    return;
  }
  
  initAudio();
  socket.emit('join', {
    action: 'create',
    name: name,
    avatar: selectedAvatar
  });
}

// Join a Party with a Code
function joinParty() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();
  if (name.length === 0) {
    nameInput.reportValidity();
    return;
  }
  
  const codeInput = document.getElementById('party-code-input');
  const code = codeInput.value.trim();
  if (code.length === 0) {
    codeInput.reportValidity();
    return;
  }
  
  initAudio();
  socket.emit('join', {
    action: 'join',
    roomCode: code,
    name: name,
    avatar: selectedAvatar
  });
}

// Socket Response: Welcome
socket.on('joined-lobby', (data) => {
  myId = data.playerId;
  isHost = data.isHost;
  
  // Update party code display
  document.getElementById('party-code-val').textContent = data.roomCode;
  
  // Transition screens
  document.getElementById('lobby-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');
  
  // Initialize default tab on mobile
  if (window.innerWidth < 900) {
    switchTab('auction');
  }
});

// Copy party code helper
function copyPartyCode() {
  const codeVal = document.getElementById('party-code-val').textContent;
  if (!codeVal || codeVal === '------') return;
  
  navigator.clipboard.writeText(codeVal).then(() => {
    const badge = document.querySelector('.party-code-badge');
    const origHtml = badge.innerHTML;
    badge.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
    setTimeout(() => {
      badge.innerHTML = origHtml;
    }, 1500);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

// Main State Updates
socket.on('state-update', (state) => {
  renderHeader(state);
  renderRulesBoard(state);
  renderLobbyWait(state);
  renderActiveAuction(state);
  renderSoldState(state);
  renderFinishedState(state);
  renderLeaderboardAndSquads(state);
  renderLiveStats(state);
});

// Update Header details
function renderHeader(state) {
  const countSpan = document.getElementById('player-count');
  const totalPlayers = Object.keys(state.players).length;
  countSpan.textContent = totalPlayers;
  
  // Render personal profile info
  const myPlayerInfo = state.players[myId];
  if (myPlayerInfo) {
    document.getElementById('my-avatar').textContent = myPlayerInfo.avatar;
    document.getElementById('my-name').textContent = myPlayerInfo.name;
    const mySpent = myPlayerInfo.squad ? myPlayerInfo.squad.reduce((s, item) => s + item.price, 0) : 0;
    document.getElementById('my-budget').textContent = `Spent $${mySpent}M | Left $${myPlayerInfo.budget}M`;
    
    // Toggle host labels
    isHost = myPlayerInfo.isHost;
    const hostControls = document.querySelectorAll('.host-only-controls');
    hostControls.forEach(el => {
      if (isHost) el.classList.remove('hidden');
      else el.classList.add('hidden');
    });
    
    const hostBar = document.getElementById('host-control-bar');
    if (isHost && state.status !== 'LOBBY') {
      hostBar.classList.remove('hidden');
      // Update pause text
      const pauseBtn = document.getElementById('btn-host-pause');
      if (state.isPaused) {
        pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
        pauseBtn.className = 'btn btn-sm btn-accent';
      } else {
        pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
        pauseBtn.className = 'btn btn-sm btn-secondary';
      }
    } else {
      hostBar.classList.add('hidden');
    }
  }
}

// Render LIVE STATISTICS Dashboard
function renderLiveStats(state) {
  const stats = state.stats || { heroesSold: 0, unsoldCount: 0, highestBid: 0, averageBid: 0 };
  
  document.getElementById('stats-sold').textContent = stats.heroesSold;
  document.getElementById('stats-unsold').textContent = stats.unsoldCount;
  
  // Format Highest Bid and Average Bid. If 0, show $0M, otherwise format properly
  document.getElementById('stats-highest').textContent = stats.highestBid > 0 ? `$${stats.highestBid}M` : '$0M';
  document.getElementById('stats-average').textContent = stats.averageBid > 0 ? `$${stats.averageBid}M` : '$0M';
}

// Render LOBBY WAIT state panel
function renderLobbyWait(state) {
  const panel = document.getElementById('state-waiting');
  
  if (state.status === 'LOBBY') {
    panel.classList.add('active');
    
    const msg = document.getElementById('waiting-status-msg');
    const totalPlayers = Object.keys(state.players).length;
    
    if (isHost) {
      msg.innerHTML = `You are the <strong>Host</strong>! We have <strong>${totalPlayers}</strong> player(s) in the lobby.<br>Press the button below when everyone is connected.`;
    } else {
      msg.innerHTML = `Connected players in lobby: <strong>${totalPlayers}</strong>.<br>Waiting for the host to initiate the Marvel Auction Championship...`;
    }
  } else {
    panel.classList.remove('active');
  }
}

// Helper to calculate Current Team Rating
function calculateTeamRating(squad, mode, activeMission) {
  if (!squad || squad.length === 0) return 0;
  
  let teamScore = 0;
  squad.forEach(char => {
    if (char.stats) {
      let charScore = 0;
      const { power, intelligence, speed, durability, combat } = char.stats;
      
      if (mode === 'MISSION' && activeMission) {
        const w = activeMission.weights || {};
        charScore = 
          (power || 0) * (w.power || 0) +
          (intelligence || 0) * (w.intelligence || 0) +
          (speed || 0) * (w.speed || 0) +
          (durability || 0) * (w.durability || 0) +
          (combat || 0) * (w.combat || 0);
          
        // Add mission role bonus
        if (char.role && activeMission.bonusRole && char.role.toLowerCase() === activeMission.bonusRole.toLowerCase()) {
          charScore += activeMission.bonusAmount;
        }
      } else {
        // Default / Highest Total Team Score / Budget Efficiency base rating
        charScore = ((power || 0) + (intelligence || 0) + (speed || 0) + (durability || 0) + (combat || 0)) / 5;
      }
      
      teamScore += charScore;
    }
  });
  
  if (mode === 'EFFICIENCY') {
    const totalSpent = squad.reduce((sum, item) => sum + item.price, 0);
    return totalSpent > 0 ? parseFloat((teamScore / totalSpent).toFixed(2)) : 0;
  }
  
  return Math.round(teamScore);
}

// Helper to find the lowest base price among remaining unsold heroes
function getLowestUnsoldBasePrice(state) {
  if (!state || !state.characters) return 9999;
  const startIndex = state.status === 'AUCTION' ? state.currentIndex : state.currentIndex + 1;
  const remaining = state.characters.slice(startIndex);
  if (remaining.length === 0) return 9999;
  return Math.min(...remaining.map(c => c.basePrice));
}

// Render ACTIVE AUCTION panel
function renderActiveAuction(state) {
  const panel = document.getElementById('state-auction');
  
  if (state.status === 'AUCTION') {
    panel.classList.add('active');
    
    const character = state.characters[state.currentIndex];
    
    // Setup color configurations
    const cardWrapper = document.getElementById('char-card-wrapper');
    const colorTheme = character.color || '#e50914';
    cardWrapper.style.setProperty('--card-theme-color', colorTheme);
    cardWrapper.style.background = character.gradient || `linear-gradient(135deg, ${colorTheme}, #000000)`;
    
    // Set character properties
    document.getElementById('char-role').textContent = character.role;
    document.getElementById('char-emoji').textContent = character.emoji;
    document.getElementById('char-name').textContent = character.name;
    document.getElementById('char-desc').textContent = character.description;
    
    const imgEl = document.getElementById('char-image');
    if (imgEl) {
      if (character.image) {
        imgEl.src = character.image;
        imgEl.style.display = 'block';
      } else {
        imgEl.style.display = 'none';
      }
    }
    const basePriceEl = document.getElementById('char-base-price');
    if (basePriceEl) {
      basePriceEl.textContent = `Base: $${character.basePrice}M`;
    }
    
    // Remaining count
    const remainingCount = state.characters.length - state.currentIndex;
    const totalCount = state.characters.length;
    document.getElementById('remaining-count-val').textContent = `${remainingCount}/${totalCount}`;
    
    // Render Stats
    document.getElementById('stat-pwr').style.width = `${character.stats.power}%`;
    document.getElementById('val-pwr').textContent = character.stats.power;
    
    document.getElementById('stat-int').style.width = `${character.stats.intelligence}%`;
    document.getElementById('val-int').textContent = character.stats.intelligence;
    
    document.getElementById('stat-spd').style.width = `${character.stats.speed}%`;
    document.getElementById('val-spd').textContent = character.stats.speed;
    
    document.getElementById('stat-dur').style.width = `${character.stats.durability}%`;
    document.getElementById('val-dur').textContent = character.stats.durability;
    
    document.getElementById('stat-cmb').style.width = `${character.stats.combat}%`;
    document.getElementById('val-cmb').textContent = character.stats.combat;
    
    // Bids & high bidders
    document.getElementById('current-bid').textContent = `$${state.currentBid}M`;
    
    const bidderId = state.currentBidder;
    const bidderLabel = document.getElementById('high-bidder-name');
    const feedbackTip = document.getElementById('bid-status-tip');
    
    // Check if current user is Out of Credits (spectator)
    const lowestBase = getLowestUnsoldBasePrice(state);
    const myPlayer = state.players[myId];
    const isOut = myPlayer && myPlayer.budget < lowestBase;
    
    const bidButtonsContainer = document.getElementById('bid-buttons-container');
    const oocBanner = document.getElementById('out-of-credits-banner');
    
    if (isOut) {
      bidButtonsContainer.classList.add('hidden');
      feedbackTip.classList.remove('active');
      feedbackTip.className = "bid-feedback-message";
      oocBanner.classList.remove('hidden');
      
      // Still show the high bidder info in spectator mode
      if (bidderId) {
        const bidder = state.players[bidderId];
        if (bidder) {
          bidderLabel.innerHTML = `High Bidder: <span style="color:${bidder.color}; font-weight:800;">${bidder.name}</span>`;
        }
      } else {
        bidderLabel.textContent = "Opening Bid (Base Price)";
      }
    } else {
      bidButtonsContainer.classList.remove('hidden');
      oocBanner.classList.add('hidden');
      
      if (bidderId) {
        const bidder = state.players[bidderId];
        if (bidder) {
          bidderLabel.innerHTML = `High Bidder: <span style="color:${bidder.color}; font-weight:800;">${bidder.name}</span>`;
          
          // Show local status feedback
          if (bidderId === myId) {
            feedbackTip.textContent = "You hold the high bid! 👑";
            feedbackTip.className = "bid-feedback-message active";
          } else {
            feedbackTip.className = "bid-feedback-message";
          }
        }
      } else {
        bidderLabel.textContent = "Opening Bid (Base Price)";
        feedbackTip.className = "bid-feedback-message";
      }
    }
    
    // Setup bid button pricing options
    const plus1 = state.currentBid + 1;
    const plus5 = state.currentBid + 5;
    const plus10 = state.currentBid + 10;
    
    document.getElementById('btn-bid-val-1').textContent = `Bid $${plus1}M`;
    document.getElementById('btn-bid-val-2').textContent = `Bid $${plus5}M`;
    document.getElementById('btn-bid-val-3').textContent = `Bid $${plus10}M`;
    
  } else {
    panel.classList.remove('active');
  }
}

// Render SOLD / UNSOLD view
function renderSoldState(state) {
  const panel = document.getElementById('state-sold');
  
  if (state.status === 'SOLD') {
    panel.classList.add('active');
    
    const character = state.characters[state.currentIndex];
    const bidderId = state.currentBidder;
    
    // Set circle emoji & color styling
    const circle = document.getElementById('sold-char-circle');
    if (character.image) {
      circle.innerHTML = `<img src="${character.image}" class="sold-char-img" onerror="this.outerHTML='${character.emoji}'" />`;
    } else {
      circle.textContent = character.emoji;
    }
    const colorTheme = character.color || '#e50914';
    circle.style.setProperty('--card-theme-color', colorTheme);
    
    document.getElementById('sold-char-name').textContent = character.name;
    
    const title = document.getElementById('sold-title');
    const desc = document.getElementById('sold-winner-msg');
    
    if (bidderId && state.players[bidderId]) {
      const buyer = state.players[bidderId];
      title.textContent = "SOLD!";
      title.style.color = "var(--cosmic-gold)";
      desc.innerHTML = `Acquired by <span style="color:${buyer.color}; font-weight:800;">${buyer.name}</span> for <strong>$${state.currentBid}M</strong>`;
    } else {
      title.textContent = "UNSOLD";
      title.style.color = "var(--danger-pink)";
      desc.innerHTML = `No bids placed. The character returns to the deck.`;
    }
  } else {
    panel.classList.remove('active');
  }
}

// Render COMPLETED game state
function renderFinishedState(state) {
  const panel = document.getElementById('state-finished');
  
  if (state.status === 'FINISHED') {
    panel.classList.add('active');
    
    // Find winner logic by highest Team Rating
    let winner = null;
    let maxRating = -1;
    
    Object.values(state.players).forEach(p => {
      const rating = calculateTeamRating(p.squad, state.mode, state.activeMission);
      if (rating > maxRating && p.squad.length > 0) {
        maxRating = rating;
        winner = p;
      }
    });
    
    const nameEl = document.getElementById('end-winner-name');
    const statsEl = document.getElementById('end-winner-stats');
    
    if (winner) {
      nameEl.textContent = winner.name;
      nameEl.style.color = winner.color;
      let label = `Current Team Rating: ${maxRating}`;
      if (state.mode === 'EFFICIENCY') {
        label = `Budget Efficiency Score: ${maxRating}`;
      } else if (state.mode === 'MISSION') {
        label = `Mission Match Score: ${maxRating}`;
      }
      statsEl.textContent = label;
    } else {
      nameEl.textContent = "No Drafts!";
      statsEl.textContent = "No players made successful purchases.";
    }
  } else {
    panel.classList.remove('active');
  }
}

// Render Leaderboard & Squad accordion Lists with Spending Tracking
function renderLeaderboardAndSquads(state) {
  const players = Object.values(state.players);
  
  // Sort players by Current Team Rating desc
  const sortedPlayers = [...players].sort((a, b) => 
    calculateTeamRating(b.squad, state.mode, state.activeMission) - calculateTeamRating(a.squad, state.mode, state.activeMission)
  );
  
  // Render Leaderboard
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '';
  
  sortedPlayers.forEach(p => {
    const isCurrentUser = p.id === myId;
    const item = document.createElement('div');
    item.className = `leaderboard-item ${isCurrentUser ? 'mine' : ''}`;
    item.style.borderLeft = `4px solid ${p.color}`;
    
    const totalSpent = p.squad ? p.squad.reduce((sum, item) => sum + item.price, 0) : 0;
    const budgetLeft = p.budget;
    const spentPercent = Math.min(100, Math.max(0, (totalSpent / 100) * 100));
    const rating = calculateTeamRating(p.squad, state.mode, state.activeMission);
    const badgeLabel = state.mode === 'EFFICIENCY' ? `⚡ Eff: ${rating}` : `⭐ Rating: ${rating}`;
    
    item.innerHTML = `
      <div class="lead-top-row">
        <div class="lead-left">
          <span class="lead-avatar">${p.avatar}</span>
          <span class="lead-name" style="color:${p.color}">${p.name} ${p.isHost ? '<i class="fa-solid fa-crown lead-crown"></i>' : ''}</span>
          <span class="lead-squad-count"><i class="fa-solid fa-user-shield"></i> ${p.squad ? p.squad.length : 0}</span>
        </div>
        <div class="lead-right">
          <span class="lead-rating">${badgeLabel}</span>
        </div>
      </div>
      <div class="lead-spending-row">
        <div class="spending-text">
          <span class="spent-badge"><i class="fa-solid fa-coins"></i> Spent: <strong>$${totalSpent}M</strong></span>
          <span class="left-badge"><i class="fa-solid fa-wallet"></i> Remaining: <strong>$${budgetLeft}M</strong></span>
        </div>
        <div class="spending-bar-bg">
          <div class="spending-bar-fill" style="width: ${spentPercent}%; background: linear-gradient(90deg, ${p.color}, #f5a623);"></div>
        </div>
      </div>
    `;
    listEl.appendChild(item);
  });
  
  // Render Squad Accordions
  const squadEl = document.getElementById('squad-view-accordion');
  squadEl.innerHTML = '';
  
  sortedPlayers.forEach(p => {
    const isCollapsed = collapsedSquads[p.id] === undefined ? true : collapsedSquads[p.id];
    const totalSpent = p.squad ? p.squad.reduce((sum, item) => sum + item.price, 0) : 0;
    const spentPercent = Math.min(100, Math.max(0, (totalSpent / 100) * 100));
    
    const card = document.createElement('div');
    card.className = 'squad-player-card';
    card.style.borderLeft = `4px solid ${p.color}`;
    
    // Build characters list HTML
    let charListHtml = '';
    if (!p.squad || p.squad.length === 0) {
      charListHtml = `<div class="squad-empty-txt">No characters drafted yet.</div>`;
    } else {
      charListHtml = `<div class="squad-item-grid">`;
      p.squad.forEach(c => {
        charListHtml += `
          <div class="squad-char-row" style="background: linear-gradient(90deg, rgba(0,0,0,0.4) 0%, ${c.gradient ? c.gradient.substring(c.gradient.indexOf('#')) : 'rgba(255,255,255,0.05)'} 100%)">
            <div class="scr-left">
              ${c.image ? `<img src="${c.image}" class="scr-thumb" onerror="this.style.display='none'" />` : ''}
              <span class="scr-emoji">${c.emoji}</span>
              <span class="scr-name">${c.name}</span>
              <span class="scr-role">${c.role}</span>
            </div>
            <div class="scr-price">Bought: <strong>$${c.price}M</strong></div>
          </div>
        `;
      });
      charListHtml += `</div>`;
    }
    
    card.innerHTML = `
      <div class="squad-player-header" onclick="toggleSquadCollapse('${p.id}')">
        <div class="sph-info">
          <div class="sph-left">
            <span class="sph-avatar">${p.avatar}</span>
            <span class="sph-name" style="color:${p.color}">${p.name}</span>
            <span class="squad-count-pill">${p.squad ? p.squad.length : 0} Heroes</span>
          </div>
          <div class="sph-right">
            <span class="spent-val">Spent: <strong>$${totalSpent}M</strong> / $100M</span>
            <i class="fa-solid fa-chevron-${isCollapsed ? 'down' : 'up'}"></i>
          </div>
        </div>
        <div class="squad-spending-mini-bar">
          <div class="mini-bar-fill" style="width: ${spentPercent}%; background: ${p.color};"></div>
        </div>
      </div>
      <div class="squad-player-body ${isCollapsed ? '' : 'active'}">
        ${charListHtml}
      </div>
    `;
    squadEl.appendChild(card);
  });
}

function toggleSquadCollapse(playerId) {
  collapsedSquads[playerId] = !collapsedSquads[playerId];
  // Rerender lists using cache state
  socket.emit('emoji-react', ''); // Dummy trigger to trigger state sync logic locally, or just trigger manually:
  if (gameStateCache) {
    renderLeaderboardAndSquads(gameStateCache);
  }
}

let gameStateCache = null;
socket.on('state-update', (state) => {
  gameStateCache = state;
});

// Quick Bid trigger
function placeBidOffset(offset) {
  if (!gameStateCache) return;
  const bidAmount = gameStateCache.currentBid + offset;
  socket.emit('place-bid', { amount: bidAmount });
}

// Host controls trigger
function sendHostAction(action) {
  socket.emit('host-action', action);
}

function startGameWithMode() {
  const select = document.getElementById('game-mode-select');
  const mode = select ? select.value : 'MISSION';
  socket.emit('host-action', { action: 'start', mode: mode });
}

function renderRulesBoard(state) {
  const board = document.getElementById('rules-board');
  if (!state || state.status === 'LOBBY') {
    board.classList.add('hidden');
    return;
  }
  
  board.classList.remove('hidden');
  
  const modeEl = document.getElementById('board-mode-type');
  const titleEl = document.getElementById('board-mission-name');
  const weightsEl = document.getElementById('board-mission-weights');
  const bonusEl = document.getElementById('board-mission-bonus');
  
  if (state.mode === 'MISSION' && state.activeMission) {
    modeEl.textContent = "MISSION MODE";
    titleEl.textContent = state.activeMission.name;
    
    // Display weights
    let weightsHtml = '';
    const w = state.activeMission.weights || {};
    Object.keys(w).forEach(stat => {
      const val = w[stat];
      if (val > 0) {
        weightsHtml += `<span class="weight-tag">${stat.toUpperCase()}: ${(val * 100).toFixed(0)}%</span>`;
      }
    });
    weightsEl.innerHTML = weightsHtml;
    
    // Display bonus
    if (state.activeMission.bonusRole) {
      bonusEl.innerHTML = `<span class="bonus-tag"><i class="fa-solid fa-fire"></i> +${state.activeMission.bonusAmount} ${state.activeMission.bonusRole}s</span>`;
    } else {
      bonusEl.innerHTML = '';
    }
  } else if (state.mode === 'EFFICIENCY') {
    modeEl.textContent = "BUDGET EFFICIENCY";
    titleEl.textContent = "💰 Spend Wisely";
    weightsEl.innerHTML = '<span class="rules-desc">Scoring: Total Team Score / Total Credits Spent</span>';
    bonusEl.innerHTML = '';
  } else {
    modeEl.textContent = "CHAMPIONSHIP DRAFT";
    titleEl.textContent = "🏆 Highest Total Score";
    weightsEl.innerHTML = '<span class="rules-desc">Scoring: Sum of all character average attributes</span>';
    bonusEl.innerHTML = '';
  }
}

// Client Tab toggling on mobile view
function switchTab(tab) {
  const auctionBtn = document.getElementById('tab-btn-auction');
  const chatBtn = document.getElementById('tab-btn-chat');
  const squadsBtn = document.getElementById('tab-btn-squads');
  
  const leftSection = document.querySelector('.left-section');
  const rightSection = document.querySelector('.right-section');
  
  const chatPanel = document.getElementById('tab-content-chat');
  const squadsPanel = document.getElementById('tab-content-squads');
  
  const isMobile = window.innerWidth < 900;
  
  if (isMobile) {
    // Remove active class from all buttons
    if (auctionBtn) auctionBtn.classList.remove('active');
    if (chatBtn) chatBtn.classList.remove('active');
    if (squadsBtn) squadsBtn.classList.remove('active');
    
    if (tab === 'auction') {
      if (auctionBtn) auctionBtn.classList.add('active');
      if (leftSection) leftSection.style.display = 'flex';
      if (rightSection) rightSection.style.display = 'none';
    } 
    else if (tab === 'chat') {
      if (chatBtn) chatBtn.classList.add('active');
      if (leftSection) leftSection.style.display = 'none';
      if (rightSection) rightSection.style.display = 'flex';
      if (chatPanel) chatPanel.classList.add('active');
      if (squadsPanel) squadsPanel.classList.remove('active');
    } 
    else if (tab === 'squads') {
      if (squadsBtn) squadsBtn.classList.add('active');
      if (leftSection) leftSection.style.display = 'none';
      if (rightSection) rightSection.style.display = 'flex';
      if (chatPanel) chatPanel.classList.remove('active');
      if (squadsPanel) squadsPanel.classList.add('active');
    }
  } else {
    // Desktop layout styling cleanup
    if (leftSection) leftSection.style.display = '';
    if (rightSection) rightSection.style.display = '';
    if (chatPanel) chatPanel.classList.add('active');
    if (squadsPanel) squadsPanel.classList.add('active');
    
    if (auctionBtn) auctionBtn.classList.remove('active');
    if (chatBtn) chatBtn.classList.remove('active');
    if (squadsBtn) squadsBtn.classList.remove('active');
  }
}

// Window resize listener to handle transitioning between desktop and mobile views
window.addEventListener('resize', () => {
  const isMobile = window.innerWidth < 900;
  const leftSection = document.querySelector('.left-section');
  const rightSection = document.querySelector('.right-section');
  const chatPanel = document.getElementById('tab-content-chat');
  const squadsPanel = document.getElementById('tab-content-squads');
  
  if (!isMobile) {
    if (leftSection) leftSection.style.display = '';
    if (rightSection) rightSection.style.display = '';
    if (chatPanel) chatPanel.classList.add('active');
    if (squadsPanel) squadsPanel.classList.add('active');
    
    const auctionBtn = document.getElementById('tab-btn-auction');
    const chatBtn = document.getElementById('tab-btn-chat');
    const squadsBtn = document.getElementById('tab-btn-squads');
    if (auctionBtn) auctionBtn.classList.remove('active');
    if (chatBtn) chatBtn.classList.remove('active');
    if (squadsBtn) squadsBtn.classList.remove('active');
  } else {
    // On transition to mobile, activate the active tab
    const activeTab = document.querySelector('.tab-selectors .tab-btn.active');
    if (activeTab) {
      if (activeTab.id === 'tab-btn-auction') switchTab('auction');
      else if (activeTab.id === 'tab-btn-chat') switchTab('chat');
      else if (activeTab.id === 'tab-btn-squads') switchTab('squads');
    } else {
      switchTab('auction');
    }
  }
});

// Chat system
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text.length === 0) return;
  
  socket.emit('chat-message', text);
  input.value = '';
}

// Receive and render chat & bid messages
socket.on('chat-message', (msg) => {
  const chatMsgs = document.getElementById('chat-messages');
  const isMine = msg.name === (gameStateCache?.players[myId]?.name);
  
  const element = document.createElement('div');
  
  if (msg.isSystem) {
    element.className = 'chat-system';
    element.innerHTML = `${msg.message}`;
  } else {
    element.className = `chat-bubble ${isMine ? 'mine' : ''}`;
    element.innerHTML = `
      <div class="chat-meta">
        <span class="chat-name" style="color:${msg.color}">${msg.name}</span>
        <span class="chat-time">${msg.timestamp}</span>
      </div>
      <div class="chat-text">${msg.message}</div>
    `;
  }
  
  chatMsgs.appendChild(element);
  
  // Auto scroll to bottom smoothly
  chatMsgs.scrollTo({
    top: chatMsgs.scrollHeight,
    behavior: 'smooth'
  });
});

// Host/Bid updates
socket.on('bid-update', (data) => {
  // Play short chime sound on bids
  playSound('bid');
  
  // Shake active character card to indicate hot action!
  const card = document.getElementById('char-card');
  if (card) {
    card.classList.remove('shake-element');
    void card.offsetWidth; // Trigger reflow to restart animation
    card.classList.add('shake-element');
  }
});

// Error Alerts
socket.on('error-msg', (msg) => {
  // Play buzzer sound
  playSound('warning');
  
  // Build a sleek floating toast notification
  const toast = document.createElement('div');
  toast.className = 'chat-system';
  toast.style.background = 'rgba(244, 63, 94, 0.2)';
  toast.style.borderColor = 'rgba(244, 63, 94, 0.4)';
  toast.style.color = 'var(--danger-pink)';
  toast.style.position = 'fixed';
  toast.style.bottom = '100px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.zIndex = '99999';
  toast.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${msg}`;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 2500);
});

// Update SVG timer clock
socket.on('timer-update', (data) => {
  const timerNum = document.getElementById('timer-countdown');
  const timerCircle = document.getElementById('timer-progress');
  const timerBox = document.getElementById('timer-ring-container');
  const soldTimerNum = document.getElementById('sold-countdown-num');
  
  if (soldTimerNum) {
    soldTimerNum.textContent = data.timer;
  }
  
  if (timerNum && timerCircle) {
    timerNum.textContent = data.timer;
    
    // Circle math
    const totalCircumference = 283;
    const offset = totalCircumference - (data.timer / currentTimerMax) * totalCircumference;
    timerCircle.style.strokeDashoffset = offset;
    
    // Warning state when timer is low
    if (data.timer <= 5) {
      timerBox.classList.add('warning');
      const isAuction = gameStateCache && gameStateCache.status === 'AUCTION';
      if (isAuction) playSound('warning');
    } else {
      timerBox.classList.remove('warning');
    }
  }
});

// Emoji Reacts Sender
function sendEmoji(emoji) {
  socket.emit('emoji-react', emoji);
}

// Emoji Reaction Bursts Renderer
socket.on('emoji-burst', (data) => {
  if (!data.emoji) return; // Skip dummy trigger
  
  const container = document.getElementById('emoji-burst-container');
  const reactEl = document.createElement('div');
  reactEl.className = 'floating-reaction';
  reactEl.textContent = data.emoji;
  
  // Random start coordinates at bottom
  const randomXStart = Math.random() * 80 + 10; // between 10% and 90% width
  reactEl.style.left = `${randomXStart}vw`;
  
  // Randomize floating vector drift paths (X offset)
  const driftX = (Math.random() - 0.5) * 40; // drift up to 20vw left/right
  const driftXFinal = driftX * 1.5 + (Math.random() - 0.5) * 20;
  
  reactEl.style.setProperty('--x-path', `${driftX}vw`);
  reactEl.style.setProperty('--x-path-final', `${driftXFinal}vw`);
  
  // Random sizing
  const size = Math.random() * 1.2 + 0.8; // size multiplier
  reactEl.style.transform = `scale(${size})`;
  
  container.appendChild(reactEl);
  
  // Remove element after animation ends
  setTimeout(() => {
    reactEl.remove();
  }, 2500);
});

// Confetti Particle Celebration Engine
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let confettiInterval = null;

function resizeConfettiCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeConfettiCanvas);
resizeConfettiCanvas();

class ConfettiParticle {
  constructor(colors) {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * -canvas.height - 20;
    this.size = Math.random() * 8 + 4;
    this.color = colors[Math.floor(Math.random() * colors.length)];
    this.speedY = Math.random() * 3 + 2;
    this.speedX = (Math.random() - 0.5) * 4;
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 5;
  }
  
  update() {
    this.y += this.speedY;
    this.x += this.speedX;
    this.rotation += this.rotationSpeed;
  }
  
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate((this.rotation * Math.PI) / 180);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

function startConfetti(colorTheme) {
  canvas.style.display = 'block';
  particles = [];
  
  const colorsList = [colorTheme, '#ffffff', '#fbbf24', '#00f2fe', '#f43f5e'];
  
  // Generate particles
  for (let i = 0; i < 150; i++) {
    particles.push(new ConfettiParticle(colorsList));
  }
  
  if (confettiInterval) clearInterval(confettiInterval);
  
  confettiInterval = setInterval(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let allFinished = true;
    particles.forEach(p => {
      p.update();
      p.draw();
      if (p.y < canvas.height) allFinished = false;
    });
    
    if (allFinished) {
      clearInterval(confettiInterval);
      confettiInterval = null;
      canvas.style.display = 'none';
    }
  }, 1000 / 60);
}

socket.on('celebration', (data) => {
  if (data.type === 'sold') {
    playSound('sold');
    startConfetti(data.gradient ? data.gradient.substring(data.gradient.indexOf('#')) : '#fbbf24');
  } 
  else if (data.type === 'unsold') {
    playSound('unsold');
  }
  else if (data.type === 'end') {
    playSound('victory');
    startConfetti('#fbbf24');
  }
});
