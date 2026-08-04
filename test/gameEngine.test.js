const assert = require('assert');
const {
  createRoom,
  addPlayer,
  startHand,
  submitSplit,
  allPlayersLocked,
  resolveHand,
  getStateForPlayer,
} = require('../src/gameEngine');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.stack}`);
    process.exitCode = 1;
  }
}

check('יד מלאה: הצטרפות -> חלוקה -> נעילה -> חשיפה -> תוצאה', () => {
  const room = createRoom('room1', 10);
  addPlayer(room, 'p1', 'אבי');
  addPlayer(room, 'p2', 'דני');
  addPlayer(room, 'p3', 'יוסי');

  startHand(room);
  assert.strictEqual(room.phase, 'dealt');
  assert.strictEqual(room.holeCards.p1.length, 12);
  assert.strictEqual(room.boards.length, 3);

  // לפני נעילה: הטרן/ריבר לא נחשפים ללקוח, וגם לא קלפי יריבים
  const stateBefore = getStateForPlayer(room, 'p1');
  assert.strictEqual(stateBefore.boards[0].turn, null);
  assert.strictEqual(stateBefore.boards[0].river, null);
  assert.strictEqual(stateBefore.holeCards, undefined, 'אסור לחשוף קלפי כל השחקנים לפני החשיפה');
  assert.strictEqual(stateBefore.myHoleCards.length, 12);

  // כל שחקן מחלק 4/4/4 - פשוט לוקחים את 4 הראשונים/אמצעיים/אחרונים מתוך 12 הקלפים שלו
  for (const pid of ['p1', 'p2', 'p3']) {
    const hole = room.holeCards[pid];
    submitSplit(room, pid, {
      0: hole.slice(0, 4),
      1: hole.slice(4, 8),
      2: hole.slice(8, 12),
    });
  }

  assert.strictEqual(allPlayersLocked(room), true);

  const result = resolveHand(room);
  assert.strictEqual(room.phase, 'revealed');
  assert.ok(result.net.p1 !== undefined);
  assert.ok(result.net.p2 !== undefined);
  assert.ok(result.net.p3 !== undefined);

  // סכום כל הנטו חייב להיות אפס (זה משחק זירו-סאם בין השחקנים)
  const totalNet = result.net.p1 + result.net.p2 + result.net.p3;
  assert.strictEqual(totalNet, 0);

  // אחרי חשיפה, מותר לראות הכל
  const stateAfter = getStateForPlayer(room, 'p1');
  assert.ok(stateAfter.boards[0].turn);
  assert.ok(stateAfter.holeCards.p2.length === 12);
});

check('אי אפשר להגיש חלוקה עם קלף כפול', () => {
  const room = createRoom('room2', 10);
  addPlayer(room, 'p1', 'אבי');
  addPlayer(room, 'p2', 'דני');
  startHand(room);
  const hole = room.holeCards.p1;
  assert.throws(() => {
    submitSplit(room, 'p1', {
      0: [hole[0], hole[0], hole[1], hole[2]], // כפילות
      1: hole.slice(4, 8),
      2: hole.slice(8, 12),
    });
  }, /פעמיים/);
});

check('אי אפשר להגיש חלוקה עם קלף שלא שייך לשחקן', () => {
  const room = createRoom('room3', 10);
  addPlayer(room, 'p1', 'אבי');
  addPlayer(room, 'p2', 'דני');
  startHand(room);
  const holeP1 = room.holeCards.p1;
  const holeP2 = room.holeCards.p2;
  assert.throws(() => {
    submitSplit(room, 'p1', {
      0: [holeP2[0], holeP1[1], holeP1[2], holeP1[3]], // קלף גנוב משחקן אחר
      1: holeP1.slice(4, 8),
      2: holeP1.slice(8, 12),
    });
  }, /שייך/);
});

check('אי אפשר לשנות חלוקה אחרי נעילה', () => {
  const room = createRoom('room4', 10);
  addPlayer(room, 'p1', 'אבי');
  addPlayer(room, 'p2', 'דני');
  startHand(room);
  const hole = room.holeCards.p1;
  submitSplit(room, 'p1', { 0: hole.slice(0, 4), 1: hole.slice(4, 8), 2: hole.slice(8, 12) });
  assert.throws(() => {
    submitSplit(room, 'p1', { 0: hole.slice(0, 4), 1: hole.slice(4, 8), 2: hole.slice(8, 12) });
  }, /ננעלה/);
});

check('חדר עם 5 שחקנים נדחה', () => {
  const room = createRoom('room5', 10);
  addPlayer(room, 'p1', 'a');
  addPlayer(room, 'p2', 'b');
  addPlayer(room, 'p3', 'c');
  addPlayer(room, 'p4', 'd');
  assert.throws(() => addPlayer(room, 'p5', 'e'), /מלא/);
});

console.log(`\n${passed} בדיקות עברו בהצלחה`);
