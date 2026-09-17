const ROOMS = ["general", "random", "tech"];

let ws = null;
let username = "";
let currentRoom = "general";
let reconnectTimer = null;

// ---- Elements ----
const loginEl = document.getElementById("login");
const appEl = document.getElementById("app");
const usernameInput = document.getElementById("username");
const joinBtn = document.getElementById("joinBtn");
const roomList = document.getElementById("roomList");
const userList = document.getElementById("userList");
const userCount = document.getElementById("userCount");
const roomName = document.getElementById("roomName");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("messageForm");
const input = document.getElementById("messageInput");
const statusEl = document.getElementById("status");

// ---- Login ----
joinBtn.addEventListener("click", join);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") join();
});

function join() {
  const name = usernameInput.value.trim();
  if (!name) return;
  username = name;
  loginEl.classList.add("hidden");
  appEl.classList.remove("hidden");
  renderRooms();
  connect();
  input.focus();
}

// ---- Rooms sidebar ----
function renderRooms() {
  roomList.innerHTML = "";
  for (const room of ROOMS) {
    const li = document.createElement("li");
    li.textContent = `# ${room}`;
    if (room === currentRoom) li.classList.add("active");
    li.onclick = () => switchRoom(room);
    roomList.appendChild(li);
  }
}

async function switchRoom(room) {
  if (room === currentRoom) return;
  currentRoom = room;
  roomName.textContent = `# ${room}`;
  renderRooms();
  messagesEl.innerHTML = "";
  await loadHistory(room);
  // Reconnect to new room (keeps things simple)
  if (ws) ws.close();
  connect();
}

// ---- WebSocket ----
function connect() {
  const url = `ws://${location.host}/ws?username=${encodeURIComponent(username)}&room=${currentRoom}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    statusEl.textContent = "online";
    statusEl.className = "status online";
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    statusEl.textContent = "reconnecting…";
    statusEl.className = "status offline";
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();
}

function handleMessage(msg) {
  if (msg.type === "message") {
    appendMessage(msg.username, msg.content, msg.created_at);
  } else if (msg.type === "system") {
    appendSystem(msg.content);
  } else if (msg.type === "users") {
    renderUsers(msg.users);
  }
}

function renderUsers(users) {
  userList.innerHTML = "";
  userCount.textContent = users.length;
  for (const u of users) {
    const li = document.createElement("li");
    li.textContent = u;
    userList.appendChild(li);
  }
}

// ---- Messages ----
async function loadHistory(room) {
  const res = await fetch(`/api/history?room=${room}`);
  const history = await res.json();
  for (const m of history) {
    appendMessage(m.username, m.content, m.created_at, false);
  }
  scrollToBottom();
}

function appendMessage(user, content, time, scroll = true) {
  const div = document.createElement("div");
  div.className = "msg" + (user === username ? " own" : "");
  const t = new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `<span class="user"></span><span class="text"></span><span class="time">${t}</span>`;
  div.querySelector(".user").textContent = user;
  div.querySelector(".text").textContent = content;
  messagesEl.appendChild(div);
  if (scroll) scrollToBottom();
}

function appendSystem(content) {
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = content;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---- Send ----
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const content = input.value.trim();
  if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "message", content }));
  input.value = "";
  input.focus();
});

// ---- Initial history ----
loadHistory(currentRoom);