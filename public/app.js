let socket;
let username;
let room;

function joinChat() {
  username = document.getElementById("username").value;
  room = document.getElementById("room").value;

  if (!username || !room) {
    alert("Username and Room are required!");
    return;
  }

  document.getElementById("login").style.display = "none";
  document.getElementById("chat").style.display = "block";
  document.getElementById("roomName").textContent = `Room: ${room}`;

  // ✅ WebSocket now works on Replit or localhost
  socket = new WebSocket(`wss://${window.location.host}`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "join", username, room }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const messages = document.getElementById("messages");
    const msg = `[${data.timestamp}] ${data.user}: ${data.message}`;
    messages.innerHTML += `<div>${msg}</div>`;
    messages.scrollTop = messages.scrollHeight;
  };
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (message) {
    socket.send(JSON.stringify({ type: "chat", message }));
    input.value = "";
  }
}