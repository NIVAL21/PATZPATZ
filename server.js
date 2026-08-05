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
  setBoardWinner,
  setRevealFlag,
  advanceRevealStage,
  NUM_BOARDS,
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
const roomLastActivity = new Map();

const ROOM_INACTIVITY_MS = 6 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

function touchRoom(roomId) {
  roomLastActivity.set(roomId, Date.now());
}

setInterval(() => {
  const now = Date.now();
  for (const [roomId, lastActive] of roomLastActivity.entries()) {
    if (now - lastActive > ROOM_INACTIVITY_MS) {
      rooms.delete(roomId);
      roomLastActivity.delete(roomId);
      console.log(`חדר "${roomId}" נמחק אוטומטית - לא פעיל מעל 6 שעות`);
    }
  }
}, CLEANUP_INTERVAL_MS);

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

function scheduleReveal(room) {
  setTimeout(() => {
    if (!room.revealStage) return;
    setRevealFlag(room, 'turnShown');
    broadcastRoomState(io, room);
    setTimeout(() => {
      if (!room.revealStage) return;
      setRevealFlag(room, 'riverShown');
      broadcastRoomState(io, room);
    }, 1300);
  }, 700);
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
      touchRoom(roomId);
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
      touchRoom(roomId);
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
      touchRoom(entry.roomId);
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
      touchRoom(entry.roomId);
      ack?.({ ok: true });

      if (allPlayersLocked(room)) {
        resolveHand(room);
        broadcastRoomState(io, room);
        scheduleReveal(room);
      } else {
        broadcastRoomState(io, room);
      }
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
      touchRoom(entry.roomId);
      io.to(room.id).emit('score_update', scoreState);
      ack?.({ ok: true });
    } catch (e) {
      ack?.({ ok: false, error: e.message });
    }
  });

  socket.on('set_board_winner', ({ board, playerId }, ack) => {
    try {
      const entry = socketRoom.get(socket.id);
      const room = rooms.get(entry?.roomId);
      if (!room) throw new Error('חדר לא נמצא');
      setBoardWinner(room, board, playerId);
      touchRoom(entry.roomId);

      let advanced = false;
      if (
        playerId !== null &&
        room.revealStage &&
        board === room.revealStage.boardIndex &&
        room.revealStage.boardIndex < NUM_BOARDS - 1
      ) {
        advanceRevealStage(room);
        advanced = true;
      }

      broadcastRoomState(io, room);
      if (advanced) scheduleReveal(room);
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
