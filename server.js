const { Server } = require('socket.io');
const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  createRoom,
  addPlayer,
  startHand,
  submitSplit,
  allPlayersLocked,
  resolveHand,
  getStateForPlayer,
  updateManualScore,
} = require('./src/gameEngine');

const PORT = process.env.PORT || 3000;

function serveClient(req, res) {
  if (req.url.startsWith('/socket.io')) return;
  fs.readFile(path.join(__dirname, 'test-client.html'), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('לא נמצא test-client.html');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
}

const rooms = new Map();
const socketRoom = new Map();

function broadcastRoomState(io, room) {
  for (const player of room.players) {
    const socketEntry = [...socketRoom.entries()].find(
      ([, v]) => v.roomId === room.id && v.playerId === player.id
    );
    if (!socketEntry) continue;
    const [socketId] = socketEntry;
    io.to(socketId).emit('room_state', getStateForPlayer(room, player.id));
  }
}

const httpServer = http.createServer(serveClient);
const io = new Server(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('create_room', ({ roomId, playerId, name, boardValue }, ack) => {
    try {
      if (rooms.has(roomId)) throw new Error('קוד חדר כבר בשימוש');
      const room = createRoom(roomId, boardValue || 10);
      addPlayer(room, playerId, name);
      rooms.set(roomId, room);
      socket.join(roomId);
      socketRoom.set(socket.id, { roomId, playerId });
      ack?.({ ok: true, state: getStateForPlayer(room, playerId) });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('join_room', ({ roomId, playerId, name }, ack) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('חדר לא נמצא');
      addPlayer(room, playerId, name);
      socket.join(roomId);
      socketRoom.set(socket.id, { roomId, playerId });
      ack?.({ ok: true, state: getStateForPlayer(room, playerId) });
      broadcastRoomState(io, room);
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('start_hand', (_, ack) => {
    try {
      const entry = socketRoom.get(socket.id);
      const room = rooms.get(entry?.roomId);
      if (!room) throw new Error('חדר לא נמצא');
      startHand(room);
      ack?.({ ok: true });
      broadcastRoomState(io, room);
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('submit_split', ({ split }, ack) => {
    try {
      const entry = socketRoom.get(socket.id);
      const room = rooms.get(entry?.roomId);
      if (!room) throw new Error('חדר לא נמצא');
      submitSplit(room, entry.playerId, split);
      ack?.({ ok: true });

      if (allPlayersLocked(room)) {
        resolveHand(room);
      }
      broadcastRoomState(io, room);
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('update_score', ({ targetPlayerId, value }, ack) => {
    try {
      const entry = socketRoom.get(socket.id);
      const room = rooms.get(entry?.roomId);
      if (!room) throw new Error('חדר לא נמצא');
      const scoreState = updateManualScore(room, targetPlayerId, value);
      io.to(room.id).emit('score_update', scoreState);
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('disconnect', () => {
    socketRoom.delete(socket.id);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`patzpatz server listening on :${PORT}`);
  const os = require('os');
  const nets = os.networkInterfaces();
  console.log('לפתוח מהטלפון (באותו WiFi כמו המחשב), נסה אחת מהכתובות הבאות:');
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  http://${net.address}:${PORT}`);
      }
    }
  }
});
