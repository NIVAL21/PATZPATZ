// דירוג יד בת 5 קלפים: מחזיר מערך שאפשר להשוות לקסיקוגרפית
// [category, tiebreak1, tiebreak2, ...]
// קטגוריות: 8=סטרייט פלאש, 7=פור, 6=פול האוס, 5=פלאש, 4=סטרייט,
//            3=שלישייה, 2=שני זוגות, 1=זוג, 0=קלף גבוה

function combinations(arr, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

function rankFiveCardHand(cards) {
  if (cards.length !== 5) throw new Error('rankFiveCardHand מצפה בדיוק ל-5 קלפים');

  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  // בדיקת סטרייט, כולל wheel (A-2-3-4-5 כאשר A נחשב נמוך)
  const uniqueRanks = [...new Set(ranks)];
  let straightHigh = null;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      straightHigh = uniqueRanks[0];
    } else if (JSON.stringify(uniqueRanks) === JSON.stringify([14, 5, 4, 3, 2])) {
      straightHigh = 5; // wheel - הקלף הגבוה בפועל הוא ה-5
    }
  }

  // ספירת מופעים לכל דרגה, ומיון לפי (כמות יורד, דרגה יורדת)
  const countMap = {};
  for (const r of ranks) countMap[r] = (countMap[r] || 0) + 1;
  const groups = Object.entries(countMap)
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  if (straightHigh && isFlush) return [8, straightHigh];
  if (groups[0].count === 4) return [7, groups[0].rank, groups[1].rank];
  if (groups[0].count === 3 && groups[1].count === 2) return [6, groups[0].rank, groups[1].rank];
  if (isFlush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0].count === 3) return [3, groups[0].rank, ...groups.slice(1).map((g) => g.rank)];
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairRanks = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    return [2, ...pairRanks, groups[2].rank];
  }
  if (groups[0].count === 2) return [1, groups[0].rank, ...groups.slice(1).map((g) => g.rank)];
  return [0, ...ranks];
}

function compareHandRank(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// PLO: בדיוק 2 מתוך 4 קלפי היד + בדיוק 3 מתוך 5 קלפי הבורד
function bestPloHand(holeCards4, boardCards5) {
  if (holeCards4.length !== 4) throw new Error('נדרשים בדיוק 4 קלפי יד לבורד');
  if (boardCards5.length !== 5) throw new Error('נדרשים בדיוק 5 קלפי בורד');

  const holePairs = combinations(holeCards4, 2);
  const boardTriples = combinations(boardCards5, 3);

  let best = null;
  let bestCards = null;
  for (const hole2 of holePairs) {
    for (const board3 of boardTriples) {
      const five = [...hole2, ...board3];
      const rank = rankFiveCardHand(five);
      if (best === null || compareHandRank(rank, best) > 0) {
        best = rank;
        bestCards = five;
      }
    }
  }
  return { rank: best, cards: bestCards };
}

module.exports = { rankFiveCardHand, compareHandRank, bestPloHand, combinations };
