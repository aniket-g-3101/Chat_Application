let socket;
let username;

// Load username from session on page load
window.onload = async () => {
  try {
    const response = await fetch('/session-user');
    const data = await response.json();
    
    if (!data.username) {
      window.location.href = '/login.html';
      return;
    }
    
    username = data.username;
    document.getElementById('currentUser').textContent = username;
    
    // Load message history
    loadMessageHistory();
    
    // Connect WebSocket
    connectWebSocket();
    
  } catch (err) {
    console.error('Failed to load session:', err);
    window.location.href = '/login.html';
  }
};

async function loadMessageHistory() {
  try {
    const response = await fetch('/messages');
    const messages = await response.json();
    
    messages.forEach(msg => {
      displayMessage(msg.username, msg.message, msg.timestamp);
    });
  } catch (err) {
    console.error('Failed to load message history:', err);
  }
}

function connectWebSocket() {
  // Use wss:// for HTTPS, ws:// for HTTP
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${window.location.host}`);

  socket.onopen = () => {
    console.log('✅ WebSocket connected');
    socket.send(JSON.stringify({ type: "join", username }));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === "message") {
        displayMessage(data.user, data.message, data.timestamp);
      } else if (data.type === "joined") {
        console.log(`Joined as ${data.username}`);
      } else if (data.type === "error") {
        alert(`Error: ${data.message}`);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  };

  socket.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
    alert('Connection error. Please refresh the page.');
  };

  socket.onclose = () => {
    console.log('📴 WebSocket disconnected');
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect...');
      connectWebSocket();
    }, 3000);
  };
}

function displayMessage(user, message, timestamp) {
  const messagesDiv = document.getElementById("messages");
  const msgElement = document.createElement('div');
  msgElement.className = 'message';
  
  // Highlight own messages
  if (user === username) {
    msgElement.classList.add('own-message');
  }
  
  msgElement.innerHTML = `
    <span class="timestamp">[${timestamp}]</span>
    <span class="username">${user}:</span>
    <span class="text">${escapeHtml(message)}</span>
  `;
  
  messagesDiv.appendChild(msgElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  
  if (!message) return;
  
  if (socket.readyState !== WebSocket.OPEN) {
    alert('Not connected to chat. Please wait...');
    return;
  }
  
  socket.send(JSON.stringify({ type: "chat", message }));
  input.value = "";
}

// Send message on Enter key
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById("messageInput");
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
});

// Prevent XSS attacks
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}