const assert = require('assert');
const { cardFromString } = require('../src/cards');
const { rankFiveCardHand, compareHandRank, bestPloHand } = require('../src/handEvaluator');
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
  // יד: AA + זבל, בורד: פלופ/טרן/ריבר שנותן לזוג אסים סט
  const hole = cs('Ac Ad 7h 2s');
  const board = cs('Ah 9c 3d 8s 4c'); // סט אסים באמצעות Ac/Ad + Ah מהבורד
  const { rank } = bestPloHand(hole, board);
  assert.strictEqual(rank[0], 3); // שלישייה (סט)
  assert.strictEqual(rank[1], 14); // אסים
});

check('bestPloHand לא מאפשר להשתמש ביותר מ-2 קלפי יד (בודק שלא "רואה" פלאש עם 5 קלפי יד מאותה סוג)', () => {
  // 4 קלפי יד עם 4 עלים, בורד עם עלה חמישי - אי אפשר פלאש כי מותר רק 2 מהיד
  const hole = cs('Ac 2c 3c 4c');
  const board = cs('5c 9d 8h 3s Kd');
  const { rank } = bestPloHand(hole, board);
  assert.notStrictEqual(rank[0], 5, 'אסור להיווצר פלאש - יש רק קלף עלה אחד בבורד');
});

// --- מנוע תשלומים: הדוגמאות מתוך הדרישות ---
check('שני בורדים מול בורד אחד -> נטו +10', () => {
  // "אתה" מנצח בבורדים 1,2, דני מנצח בבורד 3
  const me = [[4, 9], [3, 10], [1, 5]]; // ערכים גבוהים = ניצחון בבורד
  const dani = [[1, 2], [1, 3], [4, 9]];
  const { net } = calculatePayouts(['me', 'dani'], { me, dani }, 10);
  assert.strictEqual(net.me, 10);
  assert.strictEqual(net.dani, -10);
});

check('ספליט בבורד אחד + 2 ניצחונות -> נטו +20', () => {
  const me = [[4, 9], [3, 10], [1, 5]];
  const dani = [[4, 9], [1, 3], [0, 2]]; // בורד 1 = תיקו מדויק
  const { net } = calculatePayouts(['me', 'dani'], { me, dani }, 10);
  assert.strictEqual(net.me, 20);
  assert.strictEqual(net.dani, -20);
});

check('סוויפ מכפיל את הרווח מ-30 ל-60', () => {
  const me = [[4, 9], [3, 10], [1, 5]];
  const dani = [[1, 2], [1, 3], [0, 2]]; // אני מנצח בכל 3 הבורדים
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
  assert.strictEqual(net.winner, 120); // 60 מכל יריב
});

check('ספליט בין שני שחקנים: ביניהם התוצאה היא 0, שניהם מרוויחים מהמפסיד', () => {
  // אבי ודני זהים בכל הבורדים (ספליט מלא ביניהם), יוסי מפסיד בכולם
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

console.log(`\n${passed} בדיקות עברו בהצלחה`);
