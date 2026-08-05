const assert = require('assert');
const { cardFromString } = require('../src/cards');
const { rankFiveCardHand, compareHandRank, bestPloHand, combinations } = require('../src/handEvaluator');
const { calculatePayouts } = require('../src/payout');

function cs(str) {
  return str.split(' ').map(cardFromString);
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exitCode = 1;
  }
}

// --- מעריך 5 קלפים: סוגי ידיים בסיסיים ---
check('פלאש מזוהה נכון', () => {
  const rank = rankFiveCardHand(cs('2c 5c 9c Jc Kc'));
  assert.strictEqual(rank[0], 5);
});

check('סטרייט רגיל מזוהה נכון', () => {
  const rank = rankFiveCardHand(cs('5c 6d 7h 8s 9c'));
  assert.strictEqual(rank[0], 4);
  assert.strictEqual(rank[1], 9);
});

check('wheel (A-2-3-4-5) מזוהה כסטרייט עם קלף גבוה = 5', () => {
  const rank = rankFiveCardHand(cs('Ac 2d 3h 4s 5c'));
  assert.strictEqual(rank[0], 4);
  assert.strictEqual(rank[1], 5);
});

check('סטרייט פלאש גובר על פור', () => {
  const sf = rankFiveCardHand(cs('5c 6c 7c 8c 9c'));
  const quads = rankFiveCardHand(cs('Kc Kd Kh Ks 2c'));
  assert.ok(compareHandRank(sf, quads) > 0);
});

check('פול האוס גובר על פלאש', () => {
  const fh = rankFiveCardHand(cs('Kc Kd Kh 2s 2c'));
  const flush = rankFiveCardHand(cs('2c 5c 9c Jc Kc'));
  assert.ok(compareHandRank(fh, flush) > 0);
});

check('בין שני זוגות, הקיקר מכריע', () => {
  const a = rankFiveCardHand(cs('Kc Kd 5h 5s Ac'));
  const b = rankFiveCardHand(cs('Kc Kd 5h 5s 2c'));
  assert.ok(compareHandRank(a, b) > 0);
});

// --- PLO: בדיוק 2 מהיד + 3 מהבורד ---
check('bestPloHand בוחר את הזוג הטוב ביותר מהיד ומהבורד', () => {
  const hole = cs('Ac Ad 7h 2s');
  const board = cs('Ah 9c 3d 8s 4c');
  const { rank } = bestPloHand(hole, board);
  assert.strictEqual(rank[0], 3);
  assert.strictEqual(rank[1], 14);
});

check('bestPloHand לא מאפשר להשתמש ביותר מ-2 קלפי יד (בודק שלא "רואה" פלאש עם 5 קלפי יד מאותה סוג)', () => {
  const hole = cs('Ac 2c 3c 4c');
  const board = cs('5c 9d 8h 3s Kd');
  const { rank } = bestPloHand(hole, board);
  assert.notStrictEqual(rank[0], 5, 'אסור להיווצר פלאש - יש רק קלף עלה אחד בבורד');
});

// --- מנוע תשלומים: הדוגמאות מתוך הדרישות ---
check('שני בורדים מול בורד אחד -> נטו +10', () => {
  const me = [[4, 9], [3, 10], [1, 5]];
  const dani = [[1, 2], [1, 3], [4, 9]];
  const { net } = calculatePayouts(['me', 'dani'], { me, dani }, 10);
  assert.strictEqual(net.me, 10);
  assert.strictEqual(net.dani, -10);
});

check('ספליט בבורד אחד + 2 ניצחונות -> נטו +20', () => {
  const me = [[4, 9], [3, 10], [1, 5]];
  const dani = [[4, 9], [1, 3], [0, 2]];
  const { net } = calculatePayouts(['me', 'dani'], { me, dani }, 10);
  assert.strictEqual(net.me, 20);
  assert.strictEqual(net.dani, -20);
});

check('סוויפ מכפיל את הרווח מ-30 ל-60', () => {
  const me = [[4, 9], [3, 10], [1, 5]];
  const dani = [[1, 2], [1, 3], [0, 2]];
  const { net } = calculatePayouts(['me', 'dani'], { me, dani }, 10);
  assert.strictEqual(net.me, 60);
  assert.strictEqual(net.dani, -60);
});

check('שלושה שחקנים: סוויפ מלא מול 2 יריבים = 120', () => {
  const winner = [[4, 9], [3, 10], [1, 5]];
  const loser1 = [[1, 2], [1, 3], [0, 2]];
  const loser2 = [[0, 2], [0, 3], [0, 4]];
  const { net } = calculatePayouts(
    ['winner', 'loser1', 'loser2'],
    { winner, loser1, loser2 },
    10
  );
  assert.strictEqual(net.winner, 120);
});

check('ספליט בין שני שחקנים: ביניהם התוצאה היא 0, שניהם מרוויחים מהמפסיד', () => {
  const avi = [[4, 9], [4, 9], [4, 9]];
  const dani = [[4, 9], [4, 9], [4, 9]];
  const yossi = [[1, 2], [1, 2], [1, 2]];
  const { net, pairDetails } = calculatePayouts(['avi', 'dani', 'yossi'], { avi, dani, yossi }, 10);

  const aviDani = pairDetails.find((p) => p.players.includes('avi') && p.players.includes('dani'));
  assert.strictEqual(aviDani.netForA, 0, 'בין אבי לדני אין רווח או הפסד');
  assert.ok(net.avi > 0 && net.dani > 0, 'שניהם ברווח מול יוסי');
  assert.strictEqual(net.avi, net.dani, 'אבי ודני מרוויחים אותו סכום (סימטרייה מול יוסי)');
  assert.strictEqual(net.yossi, -(net.avi + net.dani));
});

// === בדיקות לפי מפרט Omaha High פורמלי (מקרי הקצה הקריטיים ביותר) ===

check('Omaha spec: אי אפשר "לשחק את הבורד" (רויאל פלאש בבורד לא עובר לשחקן)', () => {
  const hole = cs('2c 3d 7h 9c');
  const board = cs('As Ks Qs Js Ts');
  const { rank, cards } = bestPloHand(hole, board);
  assert.notStrictEqual(rank[0], 8, 'אסור לקבל סטרייט פלאש מהבורד בלבד');
  const holeUsedCount = cards.filter((c) =>
    hole.some((h) => h.rankChar === c.rankChar && h.suit === c.suit)
  ).length;
  assert.strictEqual(holeUsedCount, 2, 'חייב להשתמש בדיוק ב-2 קלפי יד');
});

check('Omaha spec: קלף מותאם בודד ביד לא מספיק לפלאש', () => {
  const hole = cs('As Kd 7c 2h');
  const board = cs('Qs Js 8s 4s 3d');
  const { rank } = bestPloHand(hole, board);
  assert.notStrictEqual(rank[0], 5, 'עלה בודד ביד אסור שייתן פלאש');
});

check('Omaha spec: שני קלפים מותאמים ביד כן מספיקים לפלאש', () => {
  const hole = cs('As 8s Kd Qc');
  const board = cs('2s 5s Js Jh 9d');
  const { rank, cards } = bestPloHand(hole, board);
  assert.strictEqual(rank[0], 5, 'שני עלים ביד + 3 בבורד חייבים לתת פלאש');
  const cardStrs = cards.map((c) => c.rankChar + c.suit).sort();
  assert.deepStrictEqual(cardStrs, ['2s', '5s', '8s', 'As', 'Js']);
});

check('Omaha spec: בדיוק 6 זוגות יד, 10 שלשות בורד, 60 קומבינציות סה"כ', () => {
  const holePairs = combinations(cs('As Ks Qs Js'), 2);
  const boardTriples = combinations(cs('2c 3c 4c 5c 6c'), 3);
  assert.strictEqual(holePairs.length, 6);
  assert.strictEqual(boardTriples.length, 10);
  assert.strictEqual(holePairs.length * boardTriples.length, 60);
});

check('Omaha spec: רצפי wraparound אסורים (Q-K-A-2-3 וכו")', () => {
  for (const combo of ['Qc Kd As 2h 3s', 'Kc As 2d 3h 4s', 'Jc Qd Kh As 2s']) {
    const rank = rankFiveCardHand(cs(combo));
    assert.notStrictEqual(rank[0], 4, combo + ' לא אמור להיחשב רצף');
  }
});

check('Omaha spec: A-K-Q-J-T הוא רצף חוקי עם קלף גבוה = אס (14)', () => {
  const rank = rankFiveCardHand(cs('Ac Kd Qh Js Tc'));
  assert.strictEqual(rank[0], 4);
  assert.strictEqual(rank[1], 14);
});

check('Omaha spec: דוגמת ה-API המלאה (flush מול four-of-a-kind)', () => {
  const p1 = bestPloHand(cs('As 8s Kd Qc'), cs('2s 5s Js Jc 9d'));
  const p2 = bestPloHand(cs('Jh Jd 9c 9h'), cs('2s 5s Js Jc 9d'));
  assert.strictEqual(p1.rank[0], 5, 'שחקן 1 אמור לקבל פלאש');
  assert.strictEqual(p2.rank[0], 7, 'שחקן 2 אמור לקבל פור');
  assert.ok(compareHandRank(p2.rank, p1.rank) > 0, 'פור מנצח פלאש');
});

console.log(`\n${passed} בדיקות עברו בהצלחה`);
