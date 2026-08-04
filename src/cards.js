const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['c', 'd', 'h', 's'];

// כרטיס מיוצג כ-{rank, suit} כאשר rank הוא ערך מספרי 2-14 (A=14)
function rankValue(rankChar) {
  return RANKS.indexOf(rankChar) + 2;
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rankChar of RANKS) {
      deck.push({ rank: rankValue(rankChar), suit, rankChar });
    }
  }
  return deck;
}

// Fisher-Yates, עם מקור אקראיות ניתן להזרקה (נוח לבדיקות דטרמיניסטיות)
function shuffle(deck, rng = Math.random) {
  const result = deck.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function cardToString(card) {
  return `${card.rankChar}${card.suit}`;
}

// עוזר קטן לבדיקות: הופך "As" / "Td" וכו' לאובייקט קלף
function cardFromString(str) {
  const rankChar = str.slice(0, -1);
  const suit = str.slice(-1);
  return { rank: rankValue(rankChar), suit, rankChar };
}

module.exports = { createDeck, shuffle, cardToString, cardFromString, RANKS, SUITS };
