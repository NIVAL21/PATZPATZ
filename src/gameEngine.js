const { createDeck, shuffle, cardToString } = require('./cards');
const { bestPloHand } = require('./handEvaluator');
const { calculatePayouts } = require('./payout');

const NUM_BOARDS = 3;
const CARDS_PER_PLAYER = 12;
const CARDS_PER_BOARD_SPLIT = 4;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

function createRoom(roomId, boardValue = 10) {
  return {
    id: roomId,
    boardValue,
    phase: 'waiting', // waiting -> dealt -> revealed
    players: [], // [{id, name}]
    deck: null,
    holeCards: {}, // playerId -> [12 card strings]
    boards: null, // [{flop:[3], turn, river}] אמת מלאה, בצד שרת בלבד
    splits: {}, // playerId -> {0:[4 cards],1:[...],2:[...]}
    lockedPlayers: new Set(),
    result: null,
  };
}

function addPlayer(room, playerId, name) {
  if (room.phase !== 'waiting') throw new Error('היד כבר התחילה, אי אפשר להצטרף עכשיו');
  if (room.players.some((p) => p.id === playerId)) return; // כבר בחדר
  if (room.players.length >= MAX_PLAYERS) throw new Error('החדר מלא (מקסימום 4 שחקנים)');
  room.players.push({ id: playerId, name });
}

function startHand(room) {
  if (room.players.length < MIN_PLAYERS) throw new Error(`נדרשים לפחות ${MIN_PLAYERS} שחקנים`);
  if (room.players.length > MAX_PLAYERS) throw new Error(`מקסימום ${MAX_PLAYERS} שחקנים`);

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
  room.phase = 'dealt';
}

/**
 * @param {object} split - { 0: [card,card,card,card], 1: [...], 2: [...] }
 * שולח שגיאה אם הקלפים לא תואמים בדיוק ל-12 הקלפים של השחקן, ללא כפילויות,
 * ובדיוק 4 לכל בורד.
 */
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

/**
 * מחשב את תוצאת היד המלאה: היד הכי טובה של כל שחקן בכל בורד + תשלומים.
 * קורא רק אחרי שכל השחקנים ננעלו.
 */
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
  room.phase = 'revealed';
  return room.result;
}

/**
 * מצב מסונן ללקוח ספציפי: לא חושף קלפי יריבים או טרן/ריבר לפני החשיפה.
 */
function getStateForPlayer(room, viewerId) {
  const base = {
    id: room.id,
    boardValue: room.boardValue,
    phase: room.phase,
    players: room.players.map((p) => ({ id: p.id, name: p.name, locked: room.lockedPlayers.has(p.id) })),
  };

  if (room.phase === 'waiting') return base;

  base.myHoleCards = room.holeCards[viewerId] || null;
  base.boards = room.boards.map((b) => ({
    flop: b.flop,
    turn: room.phase === 'revealed' ? b.turn : null,
    river: room.phase === 'revealed' ? b.river : null,
  }));

  if (room.phase === 'revealed') {
    base.holeCards = room.holeCards; // כולם גלויים בחשיפה, כמו showdown
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
  NUM_BOARDS,
  MIN_PLAYERS,
  MAX_PLAYERS,
};
