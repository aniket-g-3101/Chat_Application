const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const mysql = require("mysql2");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: "chatsecret",
  resave: false,
  saveUninitialized: true,
});

app.use(sessionMiddleware);

// ===== Serve static frontend =====
app.use(express.static(path.join(__dirname, "public")));

// ===== MySQL Auto-Reconnect Logic =====
let db;

function handleDisconnect() {
  db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: 3306,
  });

  db.connect((err) => {
    if (err) {
      console.error("❌ MySQL reconnect error:", err.message);
      setTimeout(handleDisconnect, 2000);
    } else {
      console.log("✅ Connected to MySQL");
    }
  });

  db.on("error", (err) => {
    console.error("⚠️ MySQL error:", err.code);
    if (err.code === "PROTOCOL_CONNECTION_LOST" || err.code === "ECONNRESET") {
      handleDisconnect();
    } else {
      throw err;
    }
  });
}

handleDisconnect();

// ===== Routes =====
app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/chat.html");
  else res.redirect("/login.html");
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
  db.query(sql, [username, hashed], (err) => {
    if (err) return res.send("Username already exists!");
    res.redirect("/login.html");
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], async (err, results) => {
    if (err || results.length === 0) return res.send("User not found!");
    const match = await bcrypt.compare(password, results[0].password);
    if (!match) return res.send("Incorrect password!");
    req.session.user = username;
    res.redirect("/chat.html");
  });
});

app.get("/session-user", (req, res) => {
  res.json({ username: req.session.user || null });
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login.html");
});

app.get("/chat.html", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// Load message history (last 100 messages)
app.get("/messages", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
  
  const sql = "SELECT username, message, timestamp FROM messages ORDER BY id DESC LIMIT 100";
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Error loading messages:", err);
      return res.status(500).json({ error: "Failed to load messages" });
    }
    // Reverse to show oldest first
    res.json(results.reverse());
  });
});

// ===== WebSocket Logic =====
wss.on("connection", (ws) => {
  let username = null;

  console.log("📡 New WebSocket connection");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "join") {
        username = data.username;
        console.log(`✅ ${username} joined the chat`);
        
        // Send confirmation back to the client
        ws.send(JSON.stringify({
          type: "joined",
          username: username
        }));
        
      } else if (data.type === "chat") {
        if (!username) {
          console.error("❌ Message from unauthenticated user");
          return;
        }

        const timestamp = new Date().toLocaleTimeString();
        const saveSql = "INSERT INTO messages (username, room, message, timestamp) VALUES (?, ?, ?, ?)";
        
        db.query(saveSql, [username, "general", data.message, timestamp], (err) => {
          if (err) {
            console.error("❌ Failed to save message:", err);
            ws.send(JSON.stringify({
              type: "error",
              message: "Failed to send message"
            }));
            return;
          }

          const msgData = {
            type: "message",
            user: username,
            message: data.message,
            timestamp
          };

          // Broadcast to ALL connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(msgData));
            }
          });
          
          console.log(`📨 Message sent by ${username}`);
        });
      }
    } catch (err) {
      console.error("❌ WebSocket error:", err);
      ws.send(JSON.stringify({
        type: "error",
        message: "Invalid message format"
      }));
    }
  });

  ws.on("close", () => {
    console.log(`📴 ${username || "Unknown user"} disconnected`);
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket connection error:", err);
  });
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});