const { createDeck, shuffle, cardToString } = require('./cards');
const { bestPloHand } = require('./handEvaluator');
const { calculatePayouts } = require('./payout');

const NUM_BOARDS = 3;
const CARDS_PER_PLAYER = 12;
const CARDS_PER_BOARD_SPLIT = 4;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 3;

function createRoom(roomId, boardValue = 10) {
  return {
    id: roomId,
    boardValue,
    phase: 'waiting',
    players: [],
    deck: null,
    holeCards: {},
    boards: null,
    splits: {},
    lockedPlayers: new Set(),
    result: null,
    manualScores: {},
    scoreDirty: new Set(),
    boardWinners: {},
    revealStage: null,
  };
}

function addPlayer(room, playerId, name) {
  if (room.phase !== 'waiting') throw new Error('היד כבר התחילה, אי אפשר להצטרף עכשיו');
  if (room.players.some((p) => p.id === playerId)) return;
  if (room.players.length >= MAX_PLAYERS) throw new Error(`החדר מלא (מקסימום ${MAX_PLAYERS} שחקנים)`);
  room.players.push({ id: playerId, name });
  if (!(playerId in room.manualScores)) room.manualScores[playerId] = 0;
}

function updateManualScore(room, playerId, value) {
  if (!room.players.some((p) => p.id === playerId)) throw new Error('שחקן לא נמצא בחדר');
  room.manualScores[playerId] = Number(value) || 0;
  room.scoreDirty.add(playerId);

  const ids = room.players.map((p) => p.id);
  const notDirty = ids.filter((id) => !room.scoreDirty.has(id));
  if (ids.length >= 2 && notDirty.length === 1) {
    const lastId = notDirty[0];
    const sum = ids
      .filter((id) => id !== lastId)
      .reduce((acc, id) => acc + (room.manualScores[id] || 0), 0);
    room.manualScores[lastId] = -sum;
  }

  return { scores: { ...room.manualScores }, dirty: [...room.scoreDirty] };
}

function startHand(room) {
  if (room.phase === 'dealt') throw new Error('יד עדיין באמצע - אי אפשר להתחיל יד חדשה עכשיו');
  if (room.players.length < MIN_PLAYERS) throw new Error(`נדרשים לפחות ${MIN_PLAYERS} שחקנים`);
  if (room.players.length > MAX_PLAYERS) throw new Error(`מקסימום ${MAX_PLAYERS} שחקנים`);

  const cardsNeeded = room.players.length * CARDS_PER_PLAYER + NUM_BOARDS * 5;
  if (cardsNeeded > 52) {
    throw new Error(`אין מספיק קלפים בחפיסה (נדרשים ${cardsNeeded}, יש 52) - הגנה פנימית, לא אמור לקרות`);
  }

  const deck = shuffle(createDeck());
  let cursor = 0;

  const holeCards = {};
  for (const player of room.players) {
    holeCards[player.id] = deck.slice(cursor, cursor + CARDS_PER_PLAYER).map(cardToString);
    cursor += CARDS_PER_PLAYER;
  }

  const boards = [];
  for (let b = 0; b < NUM_BOARDS; b++) {
    const flop = deck.slice(cursor, cursor + 3).map(cardToString);
    cursor += 3;
    const turn = cardToString(deck[cursor]);
    cursor += 1;
    const river = cardToString(deck[cursor]);
    cursor += 1;
    boards.push({ flop, turn, river });
  }

  room.deck = deck;
  room.holeCards = holeCards;
  room.boards = boards;
  room.splits = {};
  room.lockedPlayers = new Set();
  room.result = null;
  room.boardWinners = {};
  room.revealStage = null;
  room.phase = 'dealt';
}

function submitSplit(room, playerId, split) {
  if (room.phase !== 'dealt') throw new Error('אי אפשר להגיש חלוקה בשלב הנוכחי');
  if (room.lockedPlayers.has(playerId)) throw new Error('החלוקה כבר ננעלה, אי אפשר לשנות');

  const playerHole = room.holeCards[playerId];
  if (!playerHole) throw new Error('שחקן לא נמצא בחדר');

  const allAssigned = [];
  for (let b = 0; b < NUM_BOARDS; b++) {
    const boardCards = split[b];
    if (!Array.isArray(boardCards) || boardCards.length !== CARDS_PER_BOARD_SPLIT) {
      throw new Error(`בורד ${b + 1} חייב לקבל בדיוק ${CARDS_PER_BOARD_SPLIT} קלפים`);
    }
    allAssigned.push(...boardCards);
  }

  if (allAssigned.length !== CARDS_PER_PLAYER) {
    throw new Error('סך כל הקלפים המוקצים חייב להיות 12');
  }
  const uniqueAssigned = new Set(allAssigned);
  if (uniqueAssigned.size !== CARDS_PER_PLAYER) {
    throw new Error('אי אפשר להשתמש באותו קלף פעמיים');
  }
  const holeSet = new Set(playerHole);
  for (const c of allAssigned) {
    if (!holeSet.has(c)) throw new Error(`קלף ${c} לא שייך ליד של השחקן`);
  }

  room.splits[playerId] = split;
  room.lockedPlayers.add(playerId);
}

function allPlayersLocked(room) {
  return room.players.every((p) => room.lockedPlayers.has(p.id));
}

function resolveHand(room) {
  if (!allPlayersLocked(room)) throw new Error('לא כל השחקנים ננעלו עדיין');

  const handRanksByPlayer = {};
  const bestHandCardsByPlayer = {};

  for (const player of room.players) {
    const ranks = [];
    const cardsUsed = [];
    for (let b = 0; b < NUM_BOARDS; b++) {
      const boardFull = [...room.boards[b].flop, room.boards[b].turn, room.boards[b].river];
      const holeForBoard = room.splits[player.id][b];
      const { rank, cards } = bestPloHand(holeForBoard, boardFull);
      ranks.push(rank);
      cardsUsed.push(cards);
    }
    handRanksByPlayer[player.id] = ranks;
    bestHandCardsByPlayer[player.id] = cardsUsed;
  }

  const { net, pairDetails } = calculatePayouts(
    room.players.map((p) => p.id),
    handRanksByPlayer,
    room.boardValue
  );

  room.result = { net, pairDetails, handRanksByPlayer, bestHandCardsByPlayer };
  room.revealStage = { boardIndex: 0, turnShown: false, riverShown: false };
  room.phase = 'revealed';
  return room.result;
}

function setBoardWinner(room, boardIndex, playerId) {
  if (room.phase !== 'revealed') throw new Error('אפשר לסמן מנצח רק אחרי חשיפת הידיים');
  if (boardIndex < 0 || boardIndex >= NUM_BOARDS) throw new Error('מספר בורד לא תקין');
  if (playerId !== null && !room.players.some((p) => p.id === playerId)) {
    throw new Error('שחקן לא נמצא בחדר');
  }

  if (room.boardWinners[boardIndex] === playerId) {
    delete room.boardWinners[boardIndex];
  } else {
    room.boardWinners[boardIndex] = playerId;
  }

  return { ...room.boardWinners };
}

function setRevealFlag(room, flag) {
  if (!room.revealStage) return null;
  room.revealStage[flag] = true;
  return { ...room.revealStage };
}

function advanceRevealStage(room) {
  if (!room.revealStage) return null;
  if (room.revealStage.boardIndex >= NUM_BOARDS - 1) return { ...room.revealStage };
  room.revealStage = { boardIndex: room.revealStage.boardIndex + 1, turnShown: false, riverShown: false };
  return { ...room.revealStage };
}

function getStateForPlayer(room, viewerId) {
  const base = {
    id: room.id,
    boardValue: room.boardValue,
    phase: room.phase,
    players: room.players.map((p) => ({ id: p.id, name: p.name, locked: room.lockedPlayers.has(p.id) })),
    scores: { ...room.manualScores },
    scoreDirty: [...room.scoreDirty],
    boardWinners: { ...room.boardWinners },
    revealStage: room.revealStage ? { ...room.revealStage } : null,
  };

  if (room.phase === 'waiting') return base;

  base.myHoleCards = room.holeCards[viewerId] || null;
  base.boards = room.boards.map((b, idx) => {
    if (room.phase !== 'revealed' || !room.revealStage) {
      return { flop: b.flop, turn: null, river: null };
    }
    const stage = room.revealStage;
    const isPast = idx < stage.boardIndex;
    const isActive = idx === stage.boardIndex;
    const showTurn = isPast || (isActive && stage.turnShown);
    const showRiver = isPast || (isActive && stage.riverShown);
    return {
      flop: b.flop,
      turn: showTurn ? b.turn : null,
      river: showRiver ? b.river : null,
    };
  });

  if (room.phase === 'revealed') {
    base.holeCards = room.holeCards;
    base.splits = room.splits;
    base.result = room.result;
  }

  return base;
}

module.exports = {
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
  MIN_PLAYERS,
  MAX_PLAYERS,
};
