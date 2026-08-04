const { compareHandRank } = require('./handEvaluator');

/**
 * מחשב תשלומים לפי המודל שהוגדר בדרישות: כל שחקן מתמודד כספית
 * מול כל שחקן אחר בנפרד, על כל אחד משלושת הבורדים.
 * זכייה בבורד = boardValue, ספליט = boardValue/2 לכל צד.
 * שחקן שמנצח לבד בכל 3 הבורדים מול יריב מסוים מקבל בונוס סוויפ (פי 2) מול אותו יריב בלבד.
 *
 * @param {string[]} playerIds
 * @param {Object} handRanksByPlayer - playerId -> מערך של 3 rank-ים (אחד לכל בורד), מ-bestPloHand().rank
 * @param {number} boardValue
 * @returns {{net: Object, pairDetails: Array}}
 */
function calculatePayouts(playerIds, handRanksByPlayer, boardValue = 10) {
  const net = {};
  playerIds.forEach((id) => (net[id] = 0));
  const pairDetails = [];

  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const idA = playerIds[i];
      const idB = playerIds[j];
      const ranksA = handRanksByPlayer[idA];
      const ranksB = handRanksByPlayer[idB];
      const numBoards = ranksA.length;

      let totalA = 0;
      let totalB = 0;
      let winsA = 0;
      let winsB = 0;
      const boardOutcomes = [];

      for (let b = 0; b < numBoards; b++) {
        const cmp = compareHandRank(ranksA[b], ranksB[b]);
        if (cmp > 0) {
          totalA += boardValue;
          winsA++;
          boardOutcomes.push({ board: b, winner: idA });
        } else if (cmp < 0) {
          totalB += boardValue;
          winsB++;
          boardOutcomes.push({ board: b, winner: idB });
        } else {
          totalA += boardValue / 2;
          totalB += boardValue / 2;
          boardOutcomes.push({ board: b, winner: 'split' });
        }
      }

      let sweptBy = null;
      if (winsA === numBoards) {
        totalA *= 2;
        sweptBy = idA;
      } else if (winsB === numBoards) {
        totalB *= 2;
        sweptBy = idB;
      }

      net[idA] += totalA - totalB;
      net[idB] += totalB - totalA;

      pairDetails.push({
        players: [idA, idB],
        boardOutcomes,
        sweptBy,
        totals: { [idA]: totalA, [idB]: totalB },
        netForA: totalA - totalB,
      });
    }
  }

  return { net, pairDetails };
}

module.exports = { calculatePayouts };
