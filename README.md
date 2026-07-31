# 🦸 Marvel Auction Championship

A real-time, responsive multiplayer Marvel/IPL-style draft auction game designed for 10-15 players playing simultaneously from their own mobile devices. 

---

## ⚡ Key Features

* **Real-Time Bidding**: Powered by WebSockets (Socket.io) for instantaneous bid registration and syncing across all player screens.
* **Automated Next Character Reveal**: Features a 5-second automatic countdown transition after a sale completes to keep the draft fast-paced and hands-free.
* **Anti-Sniping Timer**: Resets the bidding countdown to 8 seconds if a bid is placed in the final moments, giving other bidders time to react fairly.
* **Interactive Chat Room**: Syncs text messages and server announcements in real-time.
* **Emoji Reaction Bursts**: Tap reactions (😂, 🔥, 😮, 💸, 👑, 😱) to send drifting floating emoji animations floating up everyone's screens.
* **Zero-Latency Audio Synthesis**: Uses the browser HTML5 Web Audio API to synthesize game sound effects (bid chimes, clock ticks, sold buzzers, and victory fanfares) on the fly without network delays.
* **Squad Accordion & Leaderboard**: Track budgets ($100M start) and inspect the characters, prices, and stats of your friends' teams in real-time.

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

Since the app uses live WebSockets, you can deploy it to **Render.com** (Node.js Web Service) or **Railway.app** for free.
* **Build Command**: `npm install`
* **Start Command**: `npm start`
