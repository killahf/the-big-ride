const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const rooms = new Map();

function makeCode() {
  for (let i = 0; i < 200; i++) {
    const code = String(Math.floor(Math.random() * 100)).padStart(2, "0");
    const room = rooms.get(code);
    if (!room || room.clients.size === 0) return code;
  }
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function leave(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (room) {
    room.clients.delete(ws);
    for (const client of room.clients) {
      send(client, { type: "error", message: "L’autre joueur s’est déconnecté." });
    }
    if (room.clients.size === 0) rooms.delete(ws.roomCode);
  }
  ws.roomCode = null;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.join(__dirname, urlPath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "create") {
      leave(ws);
      const code = makeCode();
      const room = { clients: new Set([ws]), host: ws };
      rooms.set(code, room);
      ws.roomCode = code;
      ws.player = 0;
      ws.name = String(msg.name || "Joueur 1").slice(0, 18);
      send(ws, { type: "created", code });
      return;
    }

    if (msg.type === "join") {
      const code = String(msg.code || "").replace(/\D/g, "").slice(0, 2);
      const room = rooms.get(code);
      if (!room || room.clients.size === 0) {
        send(ws, { type: "error", message: "Code introuvable." });
        return;
      }
      if (room.clients.size >= 2) {
        send(ws, { type: "error", message: "Partie déjà complète." });
        return;
      }
      room.clients.add(ws);
      ws.roomCode = code;
      ws.player = 1;
      ws.name = String(msg.name || "Joueur 2").slice(0, 18);
      send(ws, { type: "joined", code });
      for (const client of room.clients) {
        if (client !== ws) send(client, { type: "player_joined", name: ws.name });
      }
      return;
    }

    if (msg.type === "relay") {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      for (const client of room.clients) {
        if (client !== ws) send(client, { type: "relay", payload: msg.payload });
      }
    }
  });

  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});

server.listen(PORT, () => {
  console.log(`THE BIG RIDE server running on port ${PORT}`);
});
