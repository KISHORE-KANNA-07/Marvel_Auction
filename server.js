const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Load characters
let characters = [];
try {
  const charData = fs.readFileSync(path.join(__dirname, 'characters.json'), 'utf8');
  characters = JSON.parse(charData);
} catch (err) {
  console.error("Error reading characters.json, using fallback database:", err);
  // Fallback database in case characters.json is missing or corrupted
  characters = [
    { id: "ironman", name: "Iron Man", role: "Avenger", basePrice: 10, stats: { power: 85, intelligence: 100, speed: 80, durability: 85, combat: 70 }, description: "Genius billionaire", color: "#e50914", gradient: "linear-gradient(135deg, #e50914, #f5a623)", emoji: "🤖" },
    { id: "spiderman", name: "Spider-Man", role: "Avenger", basePrice: 8, stats: { power: 75, intelligence: 90, speed: 95, durability: 75, combat: 85 }, description: "Web-slinger", color: "#0052cc", gradient: "linear-gradient(135deg, #0052cc, #ff1a1a)", emoji: "🕷️" }
  ];
}

// Shuffling characters array to randomize auction order
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Initial Game State Map
const rooms = {};

const DEFAULT_BUDGET = 100; // $100 Million
const COUNTDOWN_SECONDS = 15; // default countdown length
const MINI_COUNTDOWN_SECONDS = 8; // reset to this if bid is in final seconds

const MISSION_POOL = [
  {
    id: 1,
    name: "Defeat Thanos",
    weights: { power: 0.4, combat: 0.3, durability: 0.2, speed: 0.1, intelligence: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 2,
    name: "Save New York",
    weights: { speed: 0.4, intelligence: 0.3, combat: 0.2, durability: 0.1, power: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 3,
    name: "Secret Infiltration",
    weights: { intelligence: 0.5, speed: 0.3, combat: 0.2, power: 0.0, durability: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 4,
    name: "Defend Wakanda",
    weights: { durability: 0.45, combat: 0.3, power: 0.25, speed: 0.0, intelligence: 0.0 },
    bonusRole: "Avenger",
    bonusAmount: 15
  },
  {
    id: 5,
    name: "Battle Royale",
    weights: { power: 0.3, combat: 0.3, durability: 0.2, speed: 0.2, intelligence: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 6,
    name: "Infinity Stone Hunt",
    weights: { speed: 0.4, intelligence: 0.35, power: 0.15, combat: 0.1, durability: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 7,
    name: "Cosmic Crisis",
    weights: { power: 0.35, durability: 0.3, intelligence: 0.2, combat: 0.15, speed: 0.0 },
    bonusRole: "Cosmic",
    bonusAmount: 20
  },
  {
    id: 8,
    name: "Mutant Uprising",
    weights: { power: 0.2, intelligence: 0.2, speed: 0.2, durability: 0.2, combat: 0.2 },
    bonusRole: "Mutant",
    bonusAmount: 25
  },
  {
    id: 9,
    name: "Avengers Assemble",
    weights: { power: 0.2, intelligence: 0.2, speed: 0.2, durability: 0.2, combat: 0.2 },
    bonusRole: "Avenger",
    bonusAmount: 15
  },
  {
    id: 10,
    name: "Villain Invasion",
    weights: { power: 0.2, intelligence: 0.2, speed: 0.2, durability: 0.2, combat: 0.2 },
    bonusRole: "Villain",
    bonusAmount: 20
  },
  {
    id: 11,
    name: "Zombie Apocalypse",
    weights: { durability: 0.45, combat: 0.3, intelligence: 0.15, power: 0.1, speed: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 12,
    name: "Prison Break",
    weights: { combat: 0.35, speed: 0.35, intelligence: 0.3, power: 0.0, durability: 0.0 },
    bonusRole: null,
    bonusAmount: 0
  },
  {
    id: 13,
    name: "Multiverse Chaos",
    weights: {}, // dynamically generated
    bonusRole: null,
    bonusAmount: 0
  }
];

function generateRandomWeights() {
  const keys = ['power', 'intelligence', 'speed', 'durability', 'combat'];
  const cuts = [];
  for (let i = 0; i < 4; i++) {
    cuts.push(Math.floor(Math.random() * 101));
  }
  cuts.sort((a, b) => a - b);
  
  return {
    power: cuts[0] / 100,
    intelligence: (cuts[1] - cuts[0]) / 100,
    speed: (cuts[2] - cuts[1]) / 100,
    durability: (cuts[3] - cuts[2]) / 100,
    combat: (100 - cuts[3]) / 100
  };
}

function calculateScore(squad, mode, activeMission) {
  if (!squad || squad.length === 0) return 0;
  
  let totalBasePower = 0;
  const rolesSet = new Set();
  
  squad.forEach(char => {
    if (char.stats) {
      let charPower = 0;
      const { power = 50, intelligence = 50, speed = 50, durability = 50, combat = 50 } = char.stats;
      
      if (mode === 'MISSION' && activeMission) {
        const w = activeMission.weights || {};
        charPower = 
          power * (w.power || 0) +
          intelligence * (w.intelligence || 0) +
          speed * (w.speed || 0) +
          durability * (w.durability || 0) +
          combat * (w.combat || 0);
          
        // Mission role bonus
        if (char.role && activeMission.bonusRole && char.role.toLowerCase() === activeMission.bonusRole.toLowerCase()) {
          charPower += activeMission.bonusAmount || 15;
        }
        
        // High attribute specialization bonus (+8 if top stat >= 90)
        const maxStat = Math.max(power, intelligence, speed, durability, combat);
        if (maxStat >= 90) charPower += 8;
      } else {
        // Championship / Efficiency rating
        const avg = (power + intelligence + speed + durability + combat) / 5;
        charPower = avg;
        
        // Star Hero Bonus (+8 if character has two stats >= 90)
        const eliteStatsCount = [power, intelligence, speed, durability, combat].filter(s => s >= 90).length;
        if (eliteStatsCount >= 2) charPower += 8;
      }
      
      if (char.role) rolesSet.add(char.role.toLowerCase());
      totalBasePower += charPower;
    }
  });
  
  // Team Role Diversity Synergy Bonus (+12 points if squad has 3+ distinct roles)
  let synergyBonus = 0;
  if (rolesSet.size >= 3) {
    synergyBonus += 12;
  } else if (rolesSet.size === 2) {
    synergyBonus += 5;
  }
  
  // Roster Depth Bonus (+3 points per superhero drafted)
  const rosterDepthBonus = squad.length * 3;
  
  const finalTeamPower = totalBasePower + synergyBonus + rosterDepthBonus;
  
  if (mode === 'EFFICIENCY') {
    const totalSpent = squad.reduce((sum, item) => sum + item.price, 0);
    return totalSpent > 0 ? parseFloat((finalTeamPower / totalSpent).toFixed(2)) : 0;
  }
  
  return Math.round(finalTeamPower);
}

// Generate unique room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  // 50% chance of themed code (e.g. MARVEL123), 50% chance of random 6-character code (e.g. A7KQ9P)
  if (Math.random() < 0.5) {
    const prefixes = ['MARVEL', 'AVENGER', 'SHIELD', 'HYDRA', 'TITAN'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(100 + Math.random() * 900); // 3 digits
    code = `${prefix}${num}`;
  } else {
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  
  if (rooms[code]) {
    return generateRoomCode();
  }
  return code;
}

// Create a new room state
function createRoom(partyCode) {
  const room = {
    partyCode: partyCode,
    status: 'LOBBY',
    players: {},
    characters: shuffleArray(JSON.parse(JSON.stringify(characters))),
    currentIndex: -1,
    currentBid: 0,
    currentBidder: null,
    bidHistory: [],
    chatHistory: [],
    timer: 0,
    isPaused: false,
    timerInterval: null,
    mode: 'MISSION',
    activeMission: null,
    heroesSold: 0,
    unsoldCount: 0,
    highestBid: 0,
    totalSpent: 0
  };
  rooms[partyCode] = room;
  return room;
}

// Dynamically balance character deck pool based on player count and mission alignment
function prepareCharacterDeck(room) {
  const playerCount = Object.keys(room.players).length || 1;
  let targetPoolSize = 55;
  
  if (playerCount <= 5) {
    targetPoolSize = 32; // 30-35 range for small lobbies
  } else if (playerCount <= 9) {
    targetPoolSize = 42; // 40-45 range for medium lobbies
  } else {
    targetPoolSize = Math.min(55, characters.length); // Full pool for 10+ players
  }
  
  let allChars = JSON.parse(JSON.stringify(characters));
  
  if (room.mode === 'MISSION' && room.activeMission) {
    const bonusRole = room.activeMission.bonusRole ? room.activeMission.bonusRole.toLowerCase() : null;
    
    // Mission preferred pool (matching bonusRole)
    const missionPreferred = [];
    const generalChars = [];
    
    allChars.forEach(c => {
      const cRole = c.role ? c.role.toLowerCase() : '';
      if (bonusRole && cRole === bonusRole) {
        missionPreferred.push(c);
      } else {
        generalChars.push(c);
      }
    });
    
    shuffleArray(missionPreferred);
    shuffleArray(generalChars);
    
    // Combine preferred first, then general to reach targetPoolSize
    let selected = [...missionPreferred, ...generalChars].slice(0, targetPoolSize);
    room.characters = shuffleArray(selected);
  } else {
    room.characters = shuffleArray(allChars).slice(0, targetPoolSize);
  }
  
  addSystemMessage(room, `🎯 Auction Deck Loaded: ${room.characters.length} Superheroes for ${playerCount} participant(s)!`);
}

// Reset room state
function resetRoomState(room) {
  stopTimer(room);
  room.status = 'LOBBY';
  room.currentIndex = -1;
  room.currentBid = 0;
  room.currentBidder = null;
  room.bidHistory = [];
  room.isPaused = false;
  room.timer = 0;
  
  prepareCharacterDeck(room);
  
  room.heroesSold = 0;
  room.unsoldCount = 0;
  room.highestBid = 0;
  room.totalSpent = 0;
  
  // Reset player budgets and squads, keep names/avatars/hosts
  Object.keys(room.players).forEach(id => {
    room.players[id].budget = DEFAULT_BUDGET;
    room.players[id].squad = [];
  });
}

// Clean room state for client (remove Timeout object)
function cleanRoomStateForClient(room) {
  const averageBid = room.heroesSold > 0 ? parseFloat((room.totalSpent / room.heroesSold).toFixed(1)) : 0;
  return {
    partyCode: room.partyCode,
    status: room.status,
    players: room.players,
    characters: room.characters,
    currentIndex: room.currentIndex,
    currentBid: room.currentBid,
    currentBidder: room.currentBidder,
    bidHistory: room.bidHistory,
    chatHistory: room.chatHistory,
    timer: room.timer,
    isPaused: room.isPaused,
    mode: room.mode || 'MISSION',
    activeMission: room.activeMission || null,
    stats: {
      heroesSold: room.heroesSold || 0,
      unsoldCount: room.unsoldCount || 0,
      highestBid: room.highestBid || 0,
      averageBid: averageBid
    }
  };
}

function startTimer(room) {
  stopTimer(room);
  room.timer = COUNTDOWN_SECONDS;
  room.isPaused = false;
  
  room.timerInterval = setInterval(() => {
    if (!room.isPaused && room.status === 'AUCTION') {
      room.timer--;
      
      if (room.timer <= 0) {
        processSale(room);
      } else {
        io.to(room.partyCode).emit('timer-update', { timer: room.timer });
      }
    }
  }, 1000);
  
  io.to(room.partyCode).emit('timer-update', { timer: room.timer });
}

function stopTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function processSale(room) {
  stopTimer(room);
  
  const character = room.characters[room.currentIndex];
  const bidderId = room.currentBidder;
  
  if (bidderId && room.players[bidderId]) {
    const buyer = room.players[bidderId];
    
    // Process payment
    buyer.budget -= room.currentBid;
    buyer.squad.push({
      id: character.id,
      name: character.name,
      role: character.role,
      price: room.currentBid,
      emoji: character.emoji,
      image: character.image,
      gradient: character.gradient,
      stats: character.stats // Store stats for Team Rating calculation
    });
    
    // Update live statistics
    room.heroesSold++;
    room.totalSpent += room.currentBid;
    if (room.currentBid > room.highestBid) {
      room.highestBid = room.currentBid;
    }
    
    room.status = 'SOLD';
    
    addSystemMessage(room, `${character.name} SOLD to ${buyer.name} for $${room.currentBid}M! 🏆`);
    io.to(room.partyCode).emit('celebration', {
      type: 'sold',
      characterName: character.name,
      buyerName: buyer.name,
      price: room.currentBid,
      gradient: character.gradient,
      emoji: character.emoji
    });
  } else {
    // Went unsold
    room.status = 'SOLD';
    room.unsoldCount++;
    
    addSystemMessage(room, `${character.name} went UNSOLD! 💨`);
    io.to(room.partyCode).emit('celebration', {
      type: 'unsold',
      characterName: character.name
    });
  }
  
  // Set automated countdown for next character reveal (5 seconds)
  room.timer = 5;
  room.timerInterval = setInterval(() => {
    if (!room.isPaused && room.status === 'SOLD') {
      room.timer--;
      
      if (room.timer <= 0) {
        stopTimer(room);
        selectNextCharacter(room);
      } else {
        io.to(room.partyCode).emit('timer-update', { timer: room.timer });
      }
    }
  }, 1000);
  
  io.to(room.partyCode).emit('timer-update', { timer: room.timer });
  io.to(room.partyCode).emit('state-update', cleanRoomStateForClient(room));
}

function addSystemMessage(room, text) {
  const msg = {
    name: "System",
    message: text,
    isSystem: true,
    color: "#e50914",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
  room.chatHistory.push(msg);
  if (room.chatHistory.length > 50) room.chatHistory.shift();
  io.to(room.partyCode).emit('chat-message', msg);
}

function calculateTeamRating(squad, mode, activeMission) {
  return calculateScore(squad, mode, activeMission);
}

function endAuction(room) {
  stopTimer(room);
  room.status = 'FINISHED';
  addSystemMessage(room, "The Marvel Auction has officially ended! Check out the squads! 🏁");
  
  // Find winner (highest Current Team Rating)
  let winner = null;
  let maxRating = -1;
  Object.values(room.players).forEach(p => {
    const rating = calculateTeamRating(p.squad, room.mode, room.activeMission);
    if (rating > maxRating && p.squad.length > 0) {
      maxRating = rating;
      winner = p;
    }
  });
  
  io.to(room.partyCode).emit('celebration', {
    type: 'end',
    winnerName: winner ? winner.name : 'No one',
    totalSpent: maxRating
  });
  io.to(room.partyCode).emit('state-update', cleanRoomStateForClient(room));
}

function checkAuctionEndConditions(room) {
  if (room.status === 'FINISHED' || room.status === 'LOBBY') return false;
  
  // Condition 1: All superheroes sold / drafted
  if (room.currentIndex >= room.characters.length) {
    endAuction(room);
    return true;
  }
  
  // Get remaining unsold heroes (including current if status is AUCTION)
  const startIndex = room.status === 'AUCTION' ? room.currentIndex : room.currentIndex + 1;
  const remainingHeroes = room.characters.slice(startIndex);
  if (remainingHeroes.length === 0) {
    endAuction(room);
    return true;
  }
  
  const lowestBasePrice = Math.min(...remainingHeroes.map(h => h.basePrice));
  
  // Condition 2: Every active player in the room is Out of Credits (budget < lowest base price)
  const players = Object.values(room.players);
  if (players.length > 0) {
    const allOut = players.every(p => p.budget < lowestBasePrice);
    if (allOut) {
      console.log(`Ending room ${room.partyCode} immediately: all active players are Out of Credits.`);
      addSystemMessage(room, "🚫 Every player is Out of Credits! End auction immediately.");
      endAuction(room);
      return true;
    }
  }
  return false;
}

function selectNextCharacter(room) {
  room.currentIndex++;
  
  // Check ending conditions immediately
  if (checkAuctionEndConditions(room)) {
    return;
  }
  
  // Setup character for auction
  const character = room.characters[room.currentIndex];
  room.status = 'AUCTION';
  room.currentBid = character.basePrice;
  room.currentBidder = null;
  room.bidHistory = [];
  
  addSystemMessage(room, `Next up: ${character.emoji} ${character.name} (Base Price: $${character.basePrice}M)`);
  startTimer(room);
  io.to(room.partyCode).emit('state-update', cleanRoomStateForClient(room));
}

// Generate nice pastel colors for user names
const colors = [
  '#f87171', '#fb923c', '#fbbf24', '#facc15', '#a3e635', 
  '#4ade80', '#34d399', '#2dd4bf', '#22d3ee', '#38bdf8', 
  '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6'
];

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Initial join lobby handler
  socket.on('join', ({ action, roomCode, name, avatar }) => {
    if (!name || name.trim() === '') name = `Player-${socket.id.substring(0, 4)}`;
    name = name.trim().substring(0, 16);
    
    let room;
    let code;
    
    if (action === 'create') {
      code = generateRoomCode();
      room = createRoom(code);
    } else if (action === 'join') {
      if (!roomCode) {
        socket.emit('error-msg', 'Please enter a party code.');
        return;
      }
      code = roomCode.trim().toUpperCase();
      room = rooms[code];
      if (!room) {
        socket.emit('error-msg', `Party code ${code} not found.`);
        return;
      }
    } else {
      socket.emit('error-msg', 'Invalid join action.');
      return;
    }
    
    // If first player in this room, make them Host
    const isFirstPlayer = Object.keys(room.players).length === 0;
    
    room.players[socket.id] = {
      id: socket.id,
      name: name,
      budget: DEFAULT_BUDGET,
      squad: [],
      avatar: avatar || '🦸',
      isHost: isFirstPlayer,
      color: colors[Math.floor(Math.random() * colors.length)]
    };
    
    socket.roomCode = code;
    socket.join(code);
    
    console.log(`Player joined room ${code}: ${name} (Host: ${isFirstPlayer})`);
    
    // Welcome message
    socket.emit('joined-lobby', { 
      roomCode: code,
      playerId: socket.id, 
      isHost: isFirstPlayer 
    });
    
    addSystemMessage(room, `${name} has entered the auction lobby! 👋`);
    
    // Sync current state
    io.to(code).emit('state-update', cleanRoomStateForClient(room));
  });
  
  // Bid placing logic
  socket.on('place-bid', ({ amount }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    
    const player = room.players[socket.id];
    if (!player) return;
    
    if (room.status !== 'AUCTION') {
      socket.emit('error-msg', 'Auction is not active right now.');
      return;
    }
    
    if (room.isPaused) {
      socket.emit('error-msg', 'Auction is currently paused.');
      return;
    }
    
    // Check if player is Out of Credits (spectator)
    const remainingHeroes = room.characters.slice(room.currentIndex);
    const lowestBasePrice = remainingHeroes.length > 0 ? Math.min(...remainingHeroes.map(h => h.basePrice)) : 9999;
    if (player.budget < lowestBasePrice) {
      socket.emit('error-msg', 'You don\'t have enough credits to purchase any remaining superhero.');
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      socket.emit('error-msg', 'Invalid bid amount.');
      return;
    }
    
    // Bid must be higher than current bid
    // Exception: First bid can be exactly the base price
    const isFirstBid = room.currentBidder === null;
    const minBidRequired = isFirstBid ? room.currentBid : room.currentBid + 1; // min increment $1M
    
    if (amountNum < minBidRequired) {
      socket.emit('error-msg', `Bid must be at least $${minBidRequired}M!`);
      return;
    }
    
    // Bidder must have enough budget
    if (amountNum > player.budget) {
      socket.emit('error-msg', `Insufficient budget! You only have $${player.budget}M.`);
      return;
    }
    
    // Update Bid details
    room.currentBid = amountNum;
    room.currentBidder = socket.id;
    
    const bidEntry = {
      bidderName: player.name,
      bidAmount: amountNum,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    room.bidHistory.push(bidEntry);
    if (room.bidHistory.length > 30) room.bidHistory.shift();
    
    // System log
    addSystemMessage(room, `💥 ${player.name} raised the bid to $${amountNum}M!`);
    
    // Reset timer to prevent sniping if less than 8 seconds remain
    if (room.timer < MINI_COUNTDOWN_SECONDS) {
      room.timer = MINI_COUNTDOWN_SECONDS;
      io.to(roomCode).emit('timer-update', { timer: room.timer });
      addSystemMessage(room, `⏱️ Time extended to ${MINI_COUNTDOWN_SECONDS}s!`);
    }
    
    io.to(roomCode).emit('bid-update', {
      currentBid: room.currentBid,
      currentBidder: room.currentBidder,
      bidHistory: room.bidHistory
    });
    io.to(roomCode).emit('state-update', cleanRoomStateForClient(room));
  });
  
  // Real-time Chat
  socket.on('chat-message', (text) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    
    const player = room.players[socket.id];
    if (!player) return;
    
    const msg = {
      name: player.name,
      message: text.substring(0, 100),
      isSystem: false,
      color: player.color,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    room.chatHistory.push(msg);
    if (room.chatHistory.length > 50) room.chatHistory.shift();
    
    io.to(roomCode).emit('chat-message', msg);
  });
  
  // Emoji Reacts
  socket.on('emoji-react', (emoji) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    
    const player = room.players[socket.id];
    if (!player) return;
    
    // Broadcast emoji details so others render floating animations
    io.to(roomCode).emit('emoji-burst', {
      name: player.name,
      color: player.color,
      emoji: emoji
    });
  });
  
  // Host Controls
  socket.on('host-action', (actionData) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    
    const player = room.players[socket.id];
    if (!player || !player.isHost) {
      socket.emit('error-msg', 'Only the host can perform this action.');
      return;
    }
    
    console.log(`Host Action:`, actionData);
    
    let action = actionData;
    let selectedMode = 'MISSION';
    
    if (typeof actionData === 'object' && actionData !== null) {
      action = actionData.action;
      selectedMode = actionData.mode || 'MISSION';
    }
    
    if (action === 'start') {
      if (room.status === 'LOBBY') {
        room.mode = selectedMode;
        if (selectedMode === 'MISSION') {
          const randomMission = JSON.parse(JSON.stringify(MISSION_POOL[Math.floor(Math.random() * MISSION_POOL.length)]));
          if (randomMission.name === "Multiverse Chaos") {
            randomMission.weights = generateRandomWeights();
          }
          room.activeMission = randomMission;
          addSystemMessage(room, `🎲 Selected Mission: ${randomMission.name}!`);
        } else {
          room.activeMission = null;
        }
        
        resetRoomState(room);
        selectNextCharacter(room);
      }
    } else if (action === 'next') {
      if (room.status === 'SOLD' || room.status === 'LOBBY') {
        selectNextCharacter(room);
      }
    } else if (action === 'pause') {
      if (room.status === 'AUCTION') {
        room.isPaused = !room.isPaused;
        addSystemMessage(room, room.isPaused ? "⏸️ The auction has been PAUSED by the host." : "▶️ The auction has been RESUMED by the host.");
        io.to(roomCode).emit('state-update', cleanRoomStateForClient(room));
      }
    } else if (action === 'reset') {
      resetRoomState(room);
      addSystemMessage(room, "🔄 Game reset to Lobby by the host.");
      io.to(roomCode).emit('state-update', cleanRoomStateForClient(room));
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    const room = rooms[roomCode];
    
    const player = room.players[socket.id];
    
    if (player) {
      const wasHost = player.isHost;
      delete room.players[socket.id];
      
      addSystemMessage(room, `${player.name} has left the auction. 🔌`);
      
      // If host left, delegate host to another player
      if (wasHost && Object.keys(room.players).length > 0) {
        const firstRemainingId = Object.keys(room.players)[0];
        room.players[firstRemainingId].isHost = true;
        io.to(firstRemainingId).emit('joined-lobby', { 
          roomCode: roomCode,
          playerId: firstRemainingId, 
          isHost: true 
        });
        addSystemMessage(room, `${room.players[firstRemainingId].name} is now the host! 👑`);
      }
      
      // If no players are left, clear intervals and clean up room state
      if (Object.keys(room.players).length === 0) {
        stopTimer(room);
        delete rooms[roomCode];
        console.log(`Deleted empty room ${roomCode}`);
      } else {
        // Check ending conditions immediately in case the disconnect ends the auction
        if (!checkAuctionEndConditions(room)) {
          io.to(roomCode).emit('state-update', cleanRoomStateForClient(room));
        }
      }
    }
  });
});

// Find Local Network IP Addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    }
  }
  return addresses;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`   🚀 MARVEL AUCTION SERVER RUNNING LOCALLY!`);
  console.log(`===================================================`);
  console.log(`💻 Local access: http://localhost:${PORT}`);
  
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log(`📱 Mobile access (must be on same Wi-Fi):`);
    localIPs.forEach(ip => {
      console.log(`   👉 http://${ip}:${PORT}`);
    });
  } else {
    console.log(`📱 Mobile access: Connect to Wi-Fi to get IP address.`);
  }
  console.log(`===================================================`);
});
