const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'chatsecret',
  resave: false,
  saveUninitialized: true,
}));
app.use(express.static(path.join(__dirname, '../public')));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password', // Change to your MySQL password
  database: 'chat_app',
});
db.connect(err => {
  if (err) throw err;
  console.log('✅ Connected to MySQL');
});

// ========== ROUTES ==========

app.get('/', (req, res) => {
  if (req.session.user) res.redirect('/chat.html');
  else res.redirect('/login.html');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
  db.query(sql, [username, hashed], (err) => {
    if (err) return res.send('Username already exists!');
    res.redirect('/login.html');
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const sql = 'SELECT * FROM users WHERE username = ?';
  db.query(sql, [username], async (err, results) => {
    if (results.length === 0) return res.send('User not found!');
    const match = await bcrypt.compare(password, results[0].password);
    if (!match) return res.send('Incorrect password!');
    req.session.user = username;
    res.redirect('/chat.html');
  });
});

app.get('/session-user', (req, res) => {
  res.json({ username: req.session.user || null });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login.html');
});

app.get('/chat.html', (req, res) => {
  if (!req.session.user) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, '../public/chat.html'));
});

// ========== WEBSOCKET LOGIC ==========

wss.on('connection', (ws, req) => {
  let username = null;
  let room = 'general';

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'join') {
        username = data.username;
        room = data.room;

        // Send previous messages
        db.query('SELECT * FROM messages WHERE room = ? ORDER BY id ASC LIMIT 50', [room], (err, results) => {
          if (!err) {
            results.forEach(row => {
              ws.send(JSON.stringify({
                user: row.username,
                message: row.message,
                timestamp: row.timestamp,
              }));
            });
          }
        });

      } else if (data.type === 'chat') {
        const timestamp = new Date().toLocaleTimeString();
        const saveSql = 'INSERT INTO messages (username, room, message, timestamp) VALUES (?, ?, ?, ?)';
        db.query(saveSql, [username, room, data.message, timestamp]);

        const msgData = {
          user: username,
          message: data.message,
          timestamp,
        };

        // Broadcast to all
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(msgData));
          }
        });
      }

    } catch (err) {
      console.error('Error in WebSocket message:', err);
    }
  });   
});

server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
