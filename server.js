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

// Initial Game State
let gameState = {
  status: 'LOBBY', // LOBBY, AUCTION, SOLD, FINISHED
  players: {},     // socket.id -> { id, name, budget: 100, squad: [], avatar, isHost, color }
  characters: [],
  currentIndex: -1,
  currentBid: 0,
  currentBidder: null, // socket.id
  bidHistory: [],      // array of { bidderName, bidAmount, timestamp }
  chatHistory: [],     // array of { name, message, isSystem, timestamp, color, emoji }
  timer: 0,
  isPaused: false
};

const DEFAULT_BUDGET = 100; // $100 Million
const COUNTDOWN_SECONDS = 15; // default countdown length
const MINI_COUNTDOWN_SECONDS = 8; // reset to this if bid is in final seconds
let timerInterval = null;

// Clean / Reset game state
function resetGameState() {
  stopTimer();
  gameState.status = 'LOBBY';
  gameState.currentIndex = -1;
  gameState.currentBid = 0;
  gameState.currentBidder = null;
  gameState.bidHistory = [];
  gameState.isPaused = false;
  gameState.timer = 0;
  gameState.characters = shuffleArray(JSON.parse(JSON.stringify(characters))); // deep copy & shuffle
  
  // Reset player budgets and squads, keep names/avatars/hosts
  Object.keys(gameState.players).forEach(id => {
    gameState.players[id].budget = DEFAULT_BUDGET;
    gameState.players[id].squad = [];
  });
}

resetGameState();

function startTimer() {
  stopTimer();
  gameState.timer = COUNTDOWN_SECONDS;
  gameState.isPaused = false;
  
  timerInterval = setInterval(() => {
    if (!gameState.isPaused && gameState.status === 'AUCTION') {
      gameState.timer--;
      
      if (gameState.timer <= 0) {
        processSale();
      } else {
        io.emit('timer-update', { timer: gameState.timer });
      }
    }
  }, 1000);
  
  io.emit('timer-update', { timer: gameState.timer });
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function processSale() {
  stopTimer();
  
  const character = gameState.characters[gameState.currentIndex];
  const bidderId = gameState.currentBidder;
  
  if (bidderId && gameState.players[bidderId]) {
    const buyer = gameState.players[bidderId];
    
    // Process payment
    buyer.budget -= gameState.currentBid;
    buyer.squad.push({
      id: character.id,
      name: character.name,
      role: character.role,
      price: gameState.currentBid,
      emoji: character.emoji,
      gradient: character.gradient
    });
    
    gameState.status = 'SOLD';
    
    addSystemMessage(`${character.name} SOLD to ${buyer.name} for $${gameState.currentBid}M! 🏆`);
    io.emit('celebration', {
      type: 'sold',
      characterName: character.name,
      buyerName: buyer.name,
      price: gameState.currentBid,
      gradient: character.gradient,
      emoji: character.emoji
    });
  } else {
    // Went unsold
    gameState.status = 'SOLD';
    addSystemMessage(`${character.name} went UNSOLD! 💨`);
    io.emit('celebration', {
      type: 'unsold',
      characterName: character.name
    });
  }
  
  // Set automated countdown for next character reveal (5 seconds)
  gameState.timer = 5;
  timerInterval = setInterval(() => {
    if (!gameState.isPaused && gameState.status === 'SOLD') {
      gameState.timer--;
      
      if (gameState.timer <= 0) {
        stopTimer();
        selectNextCharacter();
      } else {
        io.emit('timer-update', { timer: gameState.timer });
      }
    }
  }, 1000);
  
  io.emit('timer-update', { timer: gameState.timer });
  io.emit('state-update', gameState);
}

function addSystemMessage(text) {
  const msg = {
    name: "System",
    message: text,
    isSystem: true,
    color: "#e50914",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };
  gameState.chatHistory.push(msg);
  if (gameState.chatHistory.length > 50) gameState.chatHistory.shift();
  io.emit('chat-message', msg);
}

function selectNextCharacter() {
  gameState.currentIndex++;
  if (gameState.currentIndex >= gameState.characters.length) {
    // End of game
    gameState.status = 'FINISHED';
    addSystemMessage("The Marvel Auction has officially ended! Check out the squads! 🏁");
    
    // Find winner (highest value squad or most members)
    let winner = null;
    let maxSquadValue = -1;
    Object.values(gameState.players).forEach(p => {
      const value = p.squad.reduce((sum, item) => sum + item.price, 0);
      if (value > maxSquadValue) {
        maxSquadValue = value;
        winner = p.name;
      }
    });
    
    io.emit('celebration', {
      type: 'end',
      winnerName: winner || 'No one',
      totalSpent: maxSquadValue
    });
  } else {
    // Setup character for auction
    const character = gameState.characters[gameState.currentIndex];
    gameState.status = 'AUCTION';
    gameState.currentBid = character.basePrice;
    gameState.currentBidder = null;
    gameState.bidHistory = [];
    
    addSystemMessage(`Next up: ${character.emoji} ${character.name} (Base Price: $${character.basePrice}M)`);
    startTimer();
  }
  io.emit('state-update', gameState);
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
  socket.on('join', ({ name, avatar }) => {
    if (!name || name.trim() === '') name = `Player-${socket.id.substring(0, 4)}`;
    
    // If first player, make them Host
    const isFirstPlayer = Object.keys(gameState.players).length === 0;
    
    gameState.players[socket.id] = {
      id: socket.id,
      name: name.trim().substring(0, 16),
      budget: DEFAULT_BUDGET,
      squad: [],
      avatar: avatar || '🦸',
      isHost: isFirstPlayer,
      color: colors[Math.floor(Math.random() * colors.length)]
    };
    
    console.log(`Player joined: ${name} (Host: ${isFirstPlayer})`);
    
    // Welcome message
    socket.emit('joined-lobby', { 
      playerId: socket.id, 
      isHost: isFirstPlayer 
    });
    
    addSystemMessage(`${name} has entered the auction lobby! 👋`);
    
    // Sync current state
    io.emit('state-update', gameState);
  });
  
  // Bid placing logic
  socket.on('place-bid', ({ amount }) => {
    const player = gameState.players[socket.id];
    if (!player) return;
    
    if (gameState.status !== 'AUCTION') {
      socket.emit('error-msg', 'Auction is not active right now.');
      return;
    }
    
    if (gameState.isPaused) {
      socket.emit('error-msg', 'Auction is currently paused.');
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      socket.emit('error-msg', 'Invalid bid amount.');
      return;
    }
    
    // Bid must be higher than current bid
    // Exception: First bid can be exactly the base price
    const isFirstBid = gameState.currentBidder === null;
    const minBidRequired = isFirstBid ? gameState.currentBid : gameState.currentBid + 1; // min increment $1M
    
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
    gameState.currentBid = amountNum;
    gameState.currentBidder = socket.id;
    
    const bidEntry = {
      bidderName: player.name,
      bidAmount: amountNum,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    gameState.bidHistory.push(bidEntry);
    if (gameState.bidHistory.length > 30) gameState.bidHistory.shift();
    
    // System log
    addSystemMessage(`💥 ${player.name} raised the bid to $${amountNum}M!`);
    
    // Reset timer to prevent sniping if less than 8 seconds remain
    if (gameState.timer < MINI_COUNTDOWN_SECONDS) {
      gameState.timer = MINI_COUNTDOWN_SECONDS;
      io.emit('timer-update', { timer: gameState.timer });
      addSystemMessage(`⏱️ Time extended to ${MINI_COUNTDOWN_SECONDS}s!`);
    }
    
    io.emit('bid-update', {
      currentBid: gameState.currentBid,
      currentBidder: gameState.currentBidder,
      bidHistory: gameState.bidHistory
    });
    io.emit('state-update', gameState);
  });
  
  // Real-time Chat
  socket.on('chat-message', (text) => {
    const player = gameState.players[socket.id];
    if (!player) return;
    
    const msg = {
      name: player.name,
      message: text.substring(0, 100),
      isSystem: false,
      color: player.color,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    gameState.chatHistory.push(msg);
    if (gameState.chatHistory.length > 50) gameState.chatHistory.shift();
    
    io.emit('chat-message', msg);
  });
  
  // Emoji Reacts
  socket.on('emoji-react', (emoji) => {
    const player = gameState.players[socket.id];
    if (!player) return;
    
    // Broadcast emoji details so others render floating animations
    io.emit('emoji-burst', {
      name: player.name,
      color: player.color,
      emoji: emoji
    });
  });
  
  // Host Controls
  socket.on('host-action', (action) => {
    const player = gameState.players[socket.id];
    if (!player || !player.isHost) {
      socket.emit('error-msg', 'Only the host can perform this action.');
      return;
    }
    
    console.log(`Host Action: ${action}`);
    
    if (action === 'start') {
      if (gameState.status === 'LOBBY') {
        resetGameState();
        selectNextCharacter();
      }
    } else if (action === 'next') {
      if (gameState.status === 'SOLD' || gameState.status === 'LOBBY') {
        selectNextCharacter();
      }
    } else if (action === 'pause') {
      if (gameState.status === 'AUCTION') {
        gameState.isPaused = !gameState.isPaused;
        addSystemMessage(gameState.isPaused ? "⏸️ The auction has been PAUSED by the host." : "▶️ The auction has been RESUMED by the host.");
        io.emit('state-update', gameState);
      }
    } else if (action === 'sell') {
      if (gameState.status === 'AUCTION') {
        addSystemMessage("⚡ Host forced an instant sale!");
        processSale();
      }
    } else if (action === 'reset') {
      resetGameState();
      addSystemMessage("🔄 Game reset to Lobby by the host.");
      io.emit('state-update', gameState);
    }
  });
  
  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const player = gameState.players[socket.id];
    
    if (player) {
      const wasHost = player.isHost;
      delete gameState.players[socket.id];
      
      addSystemMessage(`${player.name} has left the auction. 🔌`);
      
      // If host left, delegate host to another player
      if (wasHost && Object.keys(gameState.players).length > 0) {
        const firstRemainingId = Object.keys(gameState.players)[0];
        gameState.players[firstRemainingId].isHost = true;
        io.to(firstRemainingId).emit('joined-lobby', { 
          playerId: firstRemainingId, 
          isHost: true 
        });
        addSystemMessage(`${gameState.players[firstRemainingId].name} is now the host! 👑`);
      }
      
      // If no players are left, reset the game
      if (Object.keys(gameState.players).length === 0) {
        resetGameState();
      } else {
        io.emit('state-update', gameState);
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
