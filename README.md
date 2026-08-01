# 🦸 Marvel Auction Championship

A real-time, responsive multiplayer Marvel/IPL-style draft auction game designed for multiple players playing simultaneously from their own devices. 

---

## ⚡ Key Features

* **Multi-Party Scoping**: Create a private party or join friends using unique 6-character room codes. Host multiple concurrent drafts without cross-lobby interference.
* **Three Game Modes**:
  1. **Highest Total Team Score**: Standard mode where team rating is the sum of characters' average stats.
  2. **Budget Efficiency**: Rank players by `Team Score / Total Credits Spent` to reward value-drafting.
  3. **Random Mission Deck**: Randomly draws one of 13 missions (e.g. *Defend Wakanda*, *Zombie Apocalypse*, *Multiverse Chaos*) applying custom stat weights and matching role bonuses (+15 Avengers, +20 Cosmic, +25 Mutants, +20 Villains).
* **🚫 Out of Credits Spectator Mode**: Prevents players from bidding if their remaining budget falls below the lowest base price of all unsold superheroes. Displays a spectators banner and locks bidding controls.
* **Immediate Auction End**: The draft automatically concludes early if all active players run out of credits or all characters are sold.
* **Viewport Scroll Optimizations**: Custom CSS restrictions limit panels (like the 380px chat container on desktop and 480px section on mobile) to scroll independently, preventing the page from stretching and keeping the active card fixed at the top.
* **Smooth Auto-Scroll**: Real-time chats and bidding events trigger smooth auto-scroll snapping directly to the bottom.
* **Real-Time Bidding**: Powered by WebSockets (Socket.io) for instantaneous bid registration and syncing.
* **Anti-Sniping Timer**: Resets the bidding countdown to 8 seconds if a bid is placed in the final moments.
* **Interactive Chat Room & Reaction Bursts**: Chat in real-time and send emoji animations floating up everyone's screens.
* **Zero-Latency Audio Synthesis**: Uses browser Web Audio API to synthesize SFX on the fly without network delays.

---

## 🚀 Quick Start

### 1. Install Dependencies
Make sure you have [Node.js](https://nodejs.org/) installed, then run:
```bash
npm install
```

### 2. Run the Server
Start the local server:
```bash
npm start
```

### 3. Open the Game
* **PC Access**: Open [http://localhost:3000](http://localhost:3000)
* **Mobile Access**: Connect your mobile devices to the **same Wi-Fi network** as the server, and enter the local IP address shown in the console banner (e.g. `http://192.168.1.15:3000`).

---

## ☁️ Deployment / Hosting

Since the app uses live WebSockets, you can deploy it to hosting platforms like **Render.com** or **Railway.app**.
* **Build Command**: `npm install`
* **Start Command**: `npm start`
