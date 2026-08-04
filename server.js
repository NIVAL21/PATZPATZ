const { Server } = require('socket.io');
const http = require('http');
const {
  createRoom,
  addPlayer,
  startHand,
  submitSplit,
  allPlayersLocked,
  resolveHand,
  getStateForPlayer,
} = require('./src/gameEngine');

const PORT = process.env.PORT || 3000;

const rooms = new Map(); // roomId -> room
const socketRoom = new Map(); // socketId -> {roomId, playerId}

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

const httpServer = http.createServer();
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

  socket.on('disconnect', () => {
    // MVP: לא מסירים שחקן מהחדר בניתוק - מאפשר reconnect באותה יד.
    // אם צריך timeout/ניקוי חדרים ישנים, זה המקום להוסיף אותו בהמשך.
    socketRoom.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`patzpatz server listening on :${PORT}`);
});
