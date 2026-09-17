import { Database } from "bun:sqlite";

// ---- Database setup ----
const db = new Database("chat.sqlite");
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.run(`CREATE INDEX IF NOT EXISTS idx_room ON messages(room, id DESC)`);

// ---- Types ----
type ClientData = {
  id: string;
  username: string;
  room: string;
};

// Track connected clients: id -> WebSocket
const clients = new Map<string, any>();

// ---- Helpers ----
function broadcast(room: string, payload: unknown, excludeId?: string) {
  const data = JSON.stringify(payload);
  for (const [id, ws] of clients) {
    if (ws.data.room === room && id !== excludeId) {
      ws.send(data);
    }
  }
}

function usersInRoom(room: string): string[] {
  const set = new Set<string>();
  for (const ws of clients.values()) {
    if (ws.data.room === room) set.add(ws.data.username);
  }
  return [...set];
}

function sendUsers(room: string) {
  broadcast(room, { type: "users", users: usersInRoom(room) });
}

// ---- Server ----
const server = Bun.serve<ClientData>({
  port: 3000,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket endpoint
    if (url.pathname === "/ws") {
      const username = (url.searchParams.get("username") || "Anon").slice(0, 20);
      const room = url.searchParams.get("room") || "general";

      const ok = server.upgrade(req, {
        data: { id: crypto.randomUUID(), username, room },
      });
      return ok ? undefined : new Response("Upgrade failed", { status: 400 });
    }

    // Message history endpoint
    if (url.pathname === "/api/history") {
      const room = url.searchParams.get("room") || "general";
      const rows = db
        .query(
          `SELECT id, username, content, created_at FROM (
             SELECT * FROM messages WHERE room = ? ORDER BY id DESC LIMIT 50
           ) ORDER BY id ASC`
        )
        .all(room);
      return Response.json(rows);
    }

    // Static files
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`./public${path}`);
    return new Response(file);
  },

  websocket: {
    open(ws) {
      clients.set(ws.data.id, ws);

      broadcast(ws.data.room, {
        type: "system",
        content: `${ws.data.username} joined`,
      }, ws.data.id);

      sendUsers(ws.data.room);
    },

    message(ws, raw) {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "message") {
        const content = String(msg.content || "").trim().slice(0, 2000);
        if (!content) return;

        const result = db
          .prepare(
            "INSERT INTO messages (room, username, content) VALUES (?, ?, ?)"
          )
          .run(ws.data.room, ws.data.username, content);

        broadcast(ws.data.room, {
          type: "message",
          id: Number(result.lastInsertRowid),
          username: ws.data.username,
          content,
          created_at: new Date().toISOString(),
        });
      }
    },

    close(ws) {
      clients.delete(ws.data.id);

      broadcast(ws.data.room, {
        type: "system",
        content: `${ws.data.username} left`,
      });

      sendUsers(ws.data.room);
    },
  },
});

console.log(`🐰 Chat running at http://localhost:${server.port}`);