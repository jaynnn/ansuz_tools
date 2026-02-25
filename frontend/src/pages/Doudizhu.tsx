import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Doudizhu.css';

// ============ Types ============
interface Card {
  suit: string; // ♠ ♥ ♣ ♦ or 'joker'
  rank: string; // 3-10, J, Q, K, A, 2, SMALL, BIG
  value: number; // numeric value for comparison
  id: string;
}

type GamePhase = 'selecting' | 'matching' | 'bidding' | 'playing' | 'gameOver';
type PlayerIndex = 0 | 1 | 2; // 0 = human, 1 = AI left, 2 = AI right

interface PlayedCards {
  cards: Card[];
  playerIndex: PlayerIndex;
  type: HandType;
}

type HandType =
  | 'single' | 'pair' | 'triple'
  | 'triple_one' | 'triple_pair'
  | 'straight' | 'straight_pairs' | 'airplane'
  | 'airplane_single' | 'airplane_pair'
  | 'bomb' | 'rocket'
  | 'four_two_single' | 'four_two_pair'
  | 'pass';

interface HandInfo {
  type: HandType;
  mainValue: number;
  length: number;
}

// ============ Constants ============
const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const RANK_VALUES: Record<string, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  'SMALL': 16, 'BIG': 17,
};
const PLAYER_NAMES = ['你', '电脑左', '电脑右'];

// ============ Deck Helpers ============
function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_VALUES[rank], id: `${suit}${rank}` });
    }
  }
  deck.push({ suit: 'joker', rank: 'SMALL', value: 16, id: 'joker_small' });
  deck.push({ suit: 'joker', rank: 'BIG', value: 17, id: 'joker_big' });
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    const suitOrder = ['♦', '♣', '♥', '♠'];
    return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
  });
}

// ============ Hand Detection ============
function getRankCounts(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of cards) {
    counts.set(c.value, (counts.get(c.value) || 0) + 1);
  }
  return counts;
}

function detectHandType(cards: Card[]): HandInfo | null {
  const n = cards.length;
  if (n === 0) return null;

  const counts = getRankCounts(cards);
  const values = cards.map(c => c.value);
  const uniqueValues = [...counts.keys()].sort((a, b) => a - b);

  // Rocket: both jokers
  if (n === 2 && values.includes(16) && values.includes(17)) {
    return { type: 'rocket', mainValue: 17, length: 2 };
  }

  // Single
  if (n === 1) {
    return { type: 'single', mainValue: values[0], length: 1 };
  }

  // Pair
  if (n === 2 && counts.size === 1 && [...counts.values()][0] === 2) {
    return { type: 'pair', mainValue: uniqueValues[0], length: 2 };
  }

  // Triple
  if (n === 3 && counts.size === 1 && [...counts.values()][0] === 3) {
    return { type: 'triple', mainValue: uniqueValues[0], length: 3 };
  }

  // Bomb (4 of a kind)
  if (n === 4 && counts.size === 1 && [...counts.values()][0] === 4) {
    return { type: 'bomb', mainValue: uniqueValues[0], length: 4 };
  }

  // Triple + 1
  if (n === 4 && counts.size === 2) {
    for (const [val, cnt] of counts) {
      if (cnt === 3) return { type: 'triple_one', mainValue: val, length: 4 };
    }
  }

  // Triple + pair
  if (n === 5 && counts.size === 2) {
    let tripleVal = -1;
    let hasPair = false;
    for (const [val, cnt] of counts) {
      if (cnt === 3) tripleVal = val;
      if (cnt === 2) hasPair = true;
    }
    if (tripleVal >= 0 && hasPair) {
      return { type: 'triple_pair', mainValue: tripleVal, length: 5 };
    }
  }

  // Straight (5+ consecutive, values 3-14 only, no 2 or jokers)
  if (n >= 5 && uniqueValues.every(v => v >= 3 && v <= 14)) {
    if (uniqueValues.length === n && [...counts.values()].every(c => c === 1)) {
      const isConsecutive = uniqueValues.every((v, i) =>
        i === 0 || v === uniqueValues[i - 1] + 1
      );
      if (isConsecutive) {
        return { type: 'straight', mainValue: uniqueValues[uniqueValues.length - 1], length: n };
      }
    }
  }

  // Consecutive pairs (3+ pairs, values 3-14 only)
  if (n >= 6 && n % 2 === 0) {
    const allPairs = [...counts.values()].every(c => c === 2);
    if (allPairs && uniqueValues.every(v => v >= 3 && v <= 14)) {
      const isConsecutive = uniqueValues.every((v, i) =>
        i === 0 || v === uniqueValues[i - 1] + 1
      );
      if (isConsecutive && uniqueValues.length >= 3) {
        return { type: 'straight_pairs', mainValue: uniqueValues[uniqueValues.length - 1], length: n };
      }
    }
  }

  // Airplane (2+ consecutive triples, values 3-14 only)
  const tripleValues = [...counts.entries()]
    .filter(([, cnt]) => cnt === 3)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  if (tripleValues.length >= 2) {
    // Find longest consecutive triple sequence
    const consecutiveTriples = findConsecutiveSequence(tripleValues.filter(v => v >= 3 && v <= 14));

    if (consecutiveTriples.length >= 2) {
      const tripleCount = consecutiveTriples.length;
      const extraCards = n - tripleCount * 3;

      // Pure airplane
      if (extraCards === 0) {
        return { type: 'airplane', mainValue: consecutiveTriples[consecutiveTriples.length - 1], length: n };
      }

      // Airplane + singles (one per triple)
      if (extraCards === tripleCount) {
        return { type: 'airplane_single', mainValue: consecutiveTriples[consecutiveTriples.length - 1], length: n };
      }

      // Airplane + pairs (one pair per triple)
      if (extraCards === tripleCount * 2) {
        // Check that extra cards form pairs
        const extraCounts = new Map(counts);
        for (const tv of consecutiveTriples) extraCounts.delete(tv);
        const allExtraPairs = [...extraCounts.values()].every(c => c === 2);
        if (allExtraPairs) {
          return { type: 'airplane_pair', mainValue: consecutiveTriples[consecutiveTriples.length - 1], length: n };
        }
      }
    }
  }

  // Four + 2 singles
  if (n === 6) {
    for (const [val, cnt] of counts) {
      if (cnt === 4) {
        return { type: 'four_two_single', mainValue: val, length: 6 };
      }
    }
  }

  // Four + 2 pairs
  if (n === 8) {
    let fourVal = -1;
    const pairVals: number[] = [];
    for (const [val, cnt] of counts) {
      if (cnt === 4) fourVal = val;
      else if (cnt === 2) pairVals.push(val);
    }
    if (fourVal >= 0 && pairVals.length === 2) {
      return { type: 'four_two_pair', mainValue: fourVal, length: 8 };
    }
  }

  return null;
}

function findConsecutiveSequence(sorted: number[]): number[] {
  if (sorted.length < 2) return sorted;
  let best: number[] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      current.push(sorted[i]);
    } else {
      if (current.length > best.length) best = current;
      current = [sorted[i]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

// ============ Play Validation ============
function canBeat(current: HandInfo, lastPlay: HandInfo): boolean {
  // Rocket beats everything
  if (current.type === 'rocket') return true;
  // Bomb beats non-bomb, non-rocket
  if (current.type === 'bomb' && lastPlay.type !== 'bomb' && lastPlay.type !== 'rocket') return true;
  // Same type, same length, higher value
  if (current.type === lastPlay.type && current.length === lastPlay.length && current.mainValue > lastPlay.mainValue) {
    return true;
  }
  // Bomb vs bomb: higher value wins
  if (current.type === 'bomb' && lastPlay.type === 'bomb' && current.mainValue > lastPlay.mainValue) {
    return true;
  }
  return false;
}

// ============ AI Logic ============
function findAllValidPlays(hand: Card[], lastPlay: HandInfo | null): Card[][] {
  const results: Card[][] = [];

  if (!lastPlay) {
    // Leading: can play anything valid
    // Singles
    for (const c of hand) results.push([c]);
    // Pairs
    addGroupPlays(hand, 2, results);
    // Triples
    addGroupPlays(hand, 3, results);
    // Triple + 1
    addTripleWithKicker(hand, 1, results);
    // Triple + pair
    addTripleWithPairKicker(hand, results);
    // Bombs
    addGroupPlays(hand, 4, results);
    // Straights
    addStraights(hand, results);
    // Consecutive pairs
    addConsecutivePairs(hand, results);
    // Airplanes
    addAirplanes(hand, results);
    // Rocket
    addRocket(hand, results);
    // Four + 2
    addFourWithKickers(hand, results);
  } else {
    // Following: must beat last play
    switch (lastPlay.type) {
      case 'single':
        for (const c of hand) {
          if (c.value > lastPlay.mainValue) results.push([c]);
        }
        break;
      case 'pair':
        addGroupBeats(hand, 2, lastPlay.mainValue, results);
        break;
      case 'triple':
        addGroupBeats(hand, 3, lastPlay.mainValue, results);
        break;
      case 'triple_one':
        addTripleOneBeats(hand, lastPlay.mainValue, results);
        break;
      case 'triple_pair':
        addTriplePairBeats(hand, lastPlay.mainValue, results);
        break;
      case 'straight':
        addStraightBeats(hand, lastPlay.length, lastPlay.mainValue, results);
        break;
      case 'straight_pairs':
        addConsecutivePairBeats(hand, lastPlay.length, lastPlay.mainValue, results);
        break;
      case 'airplane':
      case 'airplane_single':
      case 'airplane_pair':
        addAirplaneBeats(hand, lastPlay, results);
        break;
      case 'bomb':
        addBombBeats(hand, lastPlay.mainValue, results);
        break;
      case 'four_two_single':
        addFourTwoSingleBeats(hand, lastPlay.mainValue, results);
        break;
      case 'four_two_pair':
        addFourTwoPairBeats(hand, lastPlay.mainValue, results);
        break;
      default:
        break;
    }
    // Bombs can beat anything except rocket
    if (lastPlay.type !== 'bomb' && lastPlay.type !== 'rocket') {
      addGroupPlays(hand, 4, results);
    }
    // Rocket beats everything
    addRocket(hand, results);
  }

  return results;
}

function addGroupPlays(hand: Card[], count: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  for (const [val, cnt] of counts) {
    if (cnt >= count) {
      const group = hand.filter(c => c.value === val).slice(0, count);
      results.push(group);
    }
  }
}

function addGroupBeats(hand: Card[], count: number, minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  for (const [val, cnt] of counts) {
    if (cnt >= count && val > minValue) {
      const group = hand.filter(c => c.value === val).slice(0, count);
      results.push(group);
    }
  }
}

function addTripleWithKicker(hand: Card[], kickerCount: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  const triples = [...counts.entries()].filter(([, cnt]) => cnt >= 3);
  for (const [tripleVal] of triples) {
    const tripleCards = hand.filter(c => c.value === tripleVal).slice(0, 3);
    const kickers = hand.filter(c => c.value !== tripleVal);
    if (kickers.length >= kickerCount) {
      // Just use smallest kicker
      results.push([...tripleCards, ...kickers.slice(0, kickerCount)]);
    }
  }
}

function addTripleWithPairKicker(hand: Card[], results: Card[][]) {
  const counts = getRankCounts(hand);
  const triples = [...counts.entries()].filter(([, cnt]) => cnt >= 3);
  const pairs = [...counts.entries()].filter(([, cnt]) => cnt >= 2);
  for (const [tripleVal] of triples) {
    const tripleCards = hand.filter(c => c.value === tripleVal).slice(0, 3);
    for (const [pairVal] of pairs) {
      if (pairVal !== tripleVal) {
        const pairCards = hand.filter(c => c.value === pairVal).slice(0, 2);
        results.push([...tripleCards, ...pairCards]);
      }
    }
  }
}

function addTripleOneBeats(hand: Card[], minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  const triples = [...counts.entries()].filter(([val, cnt]) => cnt >= 3 && val > minValue);
  for (const [tripleVal] of triples) {
    const tripleCards = hand.filter(c => c.value === tripleVal).slice(0, 3);
    const kickers = hand.filter(c => c.value !== tripleVal);
    if (kickers.length >= 1) {
      results.push([...tripleCards, kickers[0]]);
    }
  }
}

function addTriplePairBeats(hand: Card[], minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  const triples = [...counts.entries()].filter(([val, cnt]) => cnt >= 3 && val > minValue);
  const pairs = [...counts.entries()].filter(([, cnt]) => cnt >= 2);
  for (const [tripleVal] of triples) {
    const tripleCards = hand.filter(c => c.value === tripleVal).slice(0, 3);
    for (const [pairVal] of pairs) {
      if (pairVal !== tripleVal) {
        const pairCards = hand.filter(c => c.value === pairVal).slice(0, 2);
        results.push([...tripleCards, ...pairCards]);
      }
    }
  }
}

function addStraights(hand: Card[], results: Card[][]) {
  const uniqueVals = [...new Set(hand.filter(c => c.value >= 3 && c.value <= 14).map(c => c.value))].sort((a, b) => a - b);
  for (let len = 5; len <= uniqueVals.length; len++) {
    for (let i = 0; i <= uniqueVals.length - len; i++) {
      const seq = uniqueVals.slice(i, i + len);
      if (seq.every((v, j) => j === 0 || v === seq[j - 1] + 1)) {
        const cards = seq.map(v => hand.find(c => c.value === v)!);
        results.push(cards);
      }
    }
  }
}

function addStraightBeats(hand: Card[], length: number, minValue: number, results: Card[][]) {
  const numCards = length;
  const uniqueVals = [...new Set(hand.filter(c => c.value >= 3 && c.value <= 14).map(c => c.value))].sort((a, b) => a - b);
  const seqLen = numCards;
  for (let i = 0; i <= uniqueVals.length - seqLen; i++) {
    const seq = uniqueVals.slice(i, i + seqLen);
    if (seq[seq.length - 1] > minValue && seq.every((v, j) => j === 0 || v === seq[j - 1] + 1)) {
      const cards = seq.map(v => hand.find(c => c.value === v)!);
      results.push(cards);
    }
  }
}

function addConsecutivePairs(hand: Card[], results: Card[][]) {
  const counts = getRankCounts(hand);
  const pairVals = [...counts.entries()]
    .filter(([val, cnt]) => cnt >= 2 && val >= 3 && val <= 14)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  for (let len = 3; len <= pairVals.length; len++) {
    for (let i = 0; i <= pairVals.length - len; i++) {
      const seq = pairVals.slice(i, i + len);
      if (seq.every((v, j) => j === 0 || v === seq[j - 1] + 1)) {
        const cards = seq.flatMap(v => hand.filter(c => c.value === v).slice(0, 2));
        results.push(cards);
      }
    }
  }
}

function addConsecutivePairBeats(hand: Card[], length: number, minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  const pairVals = [...counts.entries()]
    .filter(([val, cnt]) => cnt >= 2 && val >= 3 && val <= 14)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  const seqLen = length / 2;
  for (let i = 0; i <= pairVals.length - seqLen; i++) {
    const seq = pairVals.slice(i, i + seqLen);
    if (seq[seq.length - 1] > minValue && seq.every((v, j) => j === 0 || v === seq[j - 1] + 1)) {
      const cards = seq.flatMap(v => hand.filter(c => c.value === v).slice(0, 2));
      results.push(cards);
    }
  }
}

function addAirplanes(hand: Card[], results: Card[][]) {
  const counts = getRankCounts(hand);
  const tripleVals = [...counts.entries()]
    .filter(([val, cnt]) => cnt >= 3 && val >= 3 && val <= 14)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  for (let len = 2; len <= tripleVals.length; len++) {
    for (let i = 0; i <= tripleVals.length - len; i++) {
      const seq = tripleVals.slice(i, i + len);
      if (seq.every((v, j) => j === 0 || v === seq[j - 1] + 1)) {
        const tripleCards = seq.flatMap(v => hand.filter(c => c.value === v).slice(0, 3));
        // Pure airplane
        results.push(tripleCards);
        // Airplane with single wings
        const remaining = hand.filter(c => !seq.includes(c.value));
        if (remaining.length >= len) {
          results.push([...tripleCards, ...remaining.slice(0, len)]);
        }
        // Airplane with pair wings
        const remainingCounts = getRankCounts(remaining);
        const pairKickers = [...remainingCounts.entries()]
          .filter(([, cnt]) => cnt >= 2)
          .map(([val]) => val);
        if (pairKickers.length >= len) {
          const pairCards = pairKickers.slice(0, len).flatMap(v =>
            remaining.filter(c => c.value === v).slice(0, 2)
          );
          results.push([...tripleCards, ...pairCards]);
        }
      }
    }
  }
}

function addAirplaneBeats(hand: Card[], lastPlay: HandInfo, results: Card[][]) {
  const counts = getRankCounts(hand);
  const tripleVals = [...counts.entries()]
    .filter(([val, cnt]) => cnt >= 3 && val >= 3 && val <= 14)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  // Determine how many triples in the airplane
  let tripleCount: number;
  if (lastPlay.type === 'airplane') {
    tripleCount = lastPlay.length / 3;
  } else if (lastPlay.type === 'airplane_single') {
    tripleCount = lastPlay.length / 4;
  } else {
    tripleCount = lastPlay.length / 5;
  }

  for (let i = 0; i <= tripleVals.length - tripleCount; i++) {
    const seq = tripleVals.slice(i, i + tripleCount);
    if (seq[seq.length - 1] > lastPlay.mainValue && seq.every((v, j) => j === 0 || v === seq[j - 1] + 1)) {
      const tripleCards = seq.flatMap(v => hand.filter(c => c.value === v).slice(0, 3));

      if (lastPlay.type === 'airplane') {
        results.push(tripleCards);
      } else if (lastPlay.type === 'airplane_single') {
        const remaining = hand.filter(c => !seq.includes(c.value));
        if (remaining.length >= tripleCount) {
          results.push([...tripleCards, ...remaining.slice(0, tripleCount)]);
        }
      } else {
        const remaining = hand.filter(c => !seq.includes(c.value));
        const remainingCounts = getRankCounts(remaining);
        const pairKickers = [...remainingCounts.entries()]
          .filter(([, cnt]) => cnt >= 2)
          .map(([val]) => val);
        if (pairKickers.length >= tripleCount) {
          const pairCards = pairKickers.slice(0, tripleCount).flatMap(v =>
            remaining.filter(c => c.value === v).slice(0, 2)
          );
          results.push([...tripleCards, ...pairCards]);
        }
      }
    }
  }
}

function addBombBeats(hand: Card[], minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  for (const [val, cnt] of counts) {
    if (cnt === 4 && val > minValue) {
      results.push(hand.filter(c => c.value === val));
    }
  }
}

function addRocket(hand: Card[], results: Card[][]) {
  const small = hand.find(c => c.rank === 'SMALL');
  const big = hand.find(c => c.rank === 'BIG');
  if (small && big) results.push([small, big]);
}

function addFourWithKickers(hand: Card[], results: Card[][]) {
  const counts = getRankCounts(hand);
  const fours = [...counts.entries()].filter(([, cnt]) => cnt >= 4);
  for (const [fourVal] of fours) {
    const fourCards = hand.filter(c => c.value === fourVal).slice(0, 4);
    const remaining = hand.filter(c => c.value !== fourVal);
    // Four + 2 singles
    if (remaining.length >= 2) {
      results.push([...fourCards, remaining[0], remaining[1]]);
    }
    // Four + 2 pairs
    const remCounts = getRankCounts(remaining);
    const pairVals = [...remCounts.entries()].filter(([, cnt]) => cnt >= 2).map(([v]) => v);
    if (pairVals.length >= 2) {
      const pairCards = pairVals.slice(0, 2).flatMap(v =>
        remaining.filter(c => c.value === v).slice(0, 2)
      );
      results.push([...fourCards, ...pairCards]);
    }
  }
}

function addFourTwoSingleBeats(hand: Card[], minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  const fours = [...counts.entries()].filter(([val, cnt]) => cnt >= 4 && val > minValue);
  for (const [fourVal] of fours) {
    const fourCards = hand.filter(c => c.value === fourVal).slice(0, 4);
    const remaining = hand.filter(c => c.value !== fourVal);
    if (remaining.length >= 2) {
      results.push([...fourCards, remaining[0], remaining[1]]);
    }
  }
}

function addFourTwoPairBeats(hand: Card[], minValue: number, results: Card[][]) {
  const counts = getRankCounts(hand);
  const fours = [...counts.entries()].filter(([val, cnt]) => cnt >= 4 && val > minValue);
  for (const [fourVal] of fours) {
    const fourCards = hand.filter(c => c.value === fourVal).slice(0, 4);
    const remaining = hand.filter(c => c.value !== fourVal);
    const remCounts = getRankCounts(remaining);
    const pairVals = [...remCounts.entries()].filter(([, cnt]) => cnt >= 2).map(([v]) => v);
    if (pairVals.length >= 2) {
      const pairCards = pairVals.slice(0, 2).flatMap(v =>
        remaining.filter(c => c.value === v).slice(0, 2)
      );
      results.push([...fourCards, ...pairCards]);
    }
  }
}

// ============ AI Decision ============
function aiDecide(hand: Card[], lastPlay: PlayedCards | null, isNewRound: boolean): Card[] | null {
  const lastInfo = lastPlay && !isNewRound ? detectHandType(lastPlay.cards) : null;

  const allPlays = findAllValidPlays(hand, lastInfo);
  if (allPlays.length === 0) return null; // pass

  // Sort plays by strength (weakest first)
  allPlays.sort((a, b) => {
    const infoA = detectHandType(a);
    const infoB = detectHandType(b);
    if (!infoA || !infoB) return 0;
    // Prefer non-bombs when not necessary
    if (infoA.type === 'bomb' && infoB.type !== 'bomb') return 1;
    if (infoA.type !== 'bomb' && infoB.type === 'bomb') return -1;
    if (infoA.type === 'rocket') return 1;
    if (infoB.type === 'rocket') return -1;
    return infoA.mainValue - infoB.mainValue;
  });

  if (isNewRound || !lastInfo) {
    // Leading: play smallest single if hand > 4, otherwise try to empty hand
    if (hand.length <= 4) {
      // Try to play all at once if possible
      const fullPlay = detectHandType(hand);
      if (fullPlay) return hand;
    }
    return allPlays[0]; // smallest play
  }

  // Following: play smallest valid beat, avoid bombs unless hand is small
  const nonBombs = allPlays.filter(p => {
    const info = detectHandType(p);
    return info && info.type !== 'bomb' && info.type !== 'rocket';
  });

  if (nonBombs.length > 0) {
    return nonBombs[0];
  }

  // Use bomb only if hand is small or last chance
  if (hand.length <= 6) {
    return allPlays[0];
  }

  // 50% chance to pass on bombs
  if (Math.random() < 0.5) return null;
  return allPlays[0];
}

// ============ Card Display Helper ============
function getCardDisplay(card: Card): { text: string; color: string } {
  if (card.rank === 'SMALL') return { text: '小王', color: '#1a1a1a' };
  if (card.rank === 'BIG') return { text: '大王', color: '#cc0000' };
  const isRed = card.suit === '♥' || card.suit === '♦';
  return {
    text: `${card.suit}${card.rank}`,
    color: isRed ? '#cc0000' : '#1a1a1a',
  };
}

// ============ Main Component ============
const HAND_TYPE_NAMES: Record<string, string> = {
  single: '单张', pair: '对子', triple: '三条',
  triple_one: '三带一', triple_pair: '三带二',
  straight: '顺子', straight_pairs: '连对', airplane: '飞机',
  airplane_single: '飞机带单', airplane_pair: '飞机带对',
  bomb: '💣 炸弹!', rocket: '🚀 火箭!',
  four_two_single: '四带二', four_two_pair: '四带二对',
};

interface GameState {
  phase: GamePhase;
  hands: Card[][];
  landlordCards: Card[];
  landlordIndex: PlayerIndex | null;
  currentPlayer: PlayerIndex;
  lastPlay: PlayedCards | null;
  passCount: number;
  message: string;
  gameResult: string;
  playedCardsDisplay: Array<{ playerIndex: PlayerIndex; cards: Card[]; text: string }>;
  bombMultiplier: number;
  currentBidder: PlayerIndex;
  highestBid: number;
  highestBidder: PlayerIndex | null;
  bidCount: number;
}

const initialGameState: GameState = {
  phase: 'selecting',
  hands: [[], [], []],
  landlordCards: [],
  landlordIndex: null,
  currentPlayer: 0,
  lastPlay: null,
  passCount: 0,
  message: '',
  gameResult: '',
  playedCardsDisplay: [],
  bombMultiplier: 1,
  currentBidder: 0,
  highestBid: 0,
  highestBidder: null,
  bidCount: 0,
};

const Doudizhu: React.FC = () => {
  const navigate = useNavigate();

  // State for rendering, ref for callbacks to avoid stale closures
  const [gameState, setGameState] = useState<GameState>({ ...initialGameState });
  const gs = useRef<GameState>({ ...initialGameState });

  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [matchCount, setMatchCount] = useState(1);
  const [matchMode, setMatchMode] = useState<'ai' | 'player' | null>(null);
  const matchModeRef = useRef<'ai' | 'player' | null>(null);
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());

  // Multiplayer WebSocket state
  const wsRef = useRef<WebSocket | null>(null);
  const myServerIndexRef = useRef<0 | 1 | 2>(0);
  const [myServerIndex, setMyServerIndex] = useState<0 | 1 | 2>(0);
  const multiPlayerNamesRef = useRef<string[]>([]);
  const [multiPlayerNames, setMultiPlayerNames] = useState<string[]>([]);
  const handleServerMsgRef = useRef<(msg: Record<string, unknown>) => void>(() => {});

  // Helper to update game state (both ref and render state)
  const updateGame = useCallback((updates: Partial<GameState>) => {
    Object.assign(gs.current, updates);
    setGameState({ ...gs.current });
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, []);

  // ============ Game Start ============
  const startGame = useCallback(() => {
    const deck = shuffleDeck(createDeck());
    updateGame({
      phase: 'bidding',
      hands: [sortCards(deck.slice(0, 17)), sortCards(deck.slice(17, 34)), sortCards(deck.slice(34, 51))],
      landlordCards: deck.slice(51, 54),
      landlordIndex: null,
      currentBidder: 0,
      highestBid: 0,
      highestBidder: null,
      bidCount: 0,
      message: '请选择是否叫地主',
      playedCardsDisplay: [],
      bombMultiplier: 1,
      lastPlay: null,
      passCount: 0,
      gameResult: '',
    });
    setSelectedCards(new Set());
  }, [updateGame]);

  // ============ Matching Phase (AI mode only – player mode uses WebSocket) ============
  // The old fake-countdown useEffect is removed; AI mode calls startGame() directly.

  // ============ WebSocket (player mode) ============
  const connectToServer = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = import.meta.env.DEV ? 'localhost:4000' : window.location.host;
    const ws = new WebSocket(`${proto}://${host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = localStorage.getItem('token');
      if (!token) {
        ws.close();
        updateGame({ phase: 'selecting' });
        return;
      }
      ws.send(JSON.stringify({ type: 'ddz:auth', token }));
    };

    ws.onmessage = (event) => {
      try {
        handleServerMsgRef.current(JSON.parse(event.data));
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      wsRef.current = null;
      const phase = gs.current.phase;
      if (phase === 'matching') {
        updateGame({ phase: 'selecting' });
      } else if (phase !== 'selecting' && phase !== 'gameOver') {
        updateGame({ phase: 'gameOver', gameResult: '连接已断开', message: '连接已断开' });
      }
    };

    ws.onerror = () => { /* handled by onclose */ };
  }, [updateGame]);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Helper: make fake placeholder cards for opponents (only length matters for card-back display)
  const makeFakeHand = (count: number, prefix: string): Card[] =>
    Array.from({ length: count }, (_, i) => ({ suit: '?', rank: '?', value: 0, id: `${prefix}${i}` }));

  // Convert server seat index → local display index (0=me, 1=left, 2=right)
  const serverToLocal = (serverIdx: number): PlayerIndex =>
    (((serverIdx - myServerIndexRef.current) + 3) % 3) as PlayerIndex;

  // ============ Server Message Handler ============
  const handleServerMsg = useCallback((msg: Record<string, unknown>) => {
    const type = msg.type as string;

    if (type === 'ddz:auth_ok') {
      wsRef.current?.send(JSON.stringify({ type: 'ddz:join' }));
      setMatchCount(1);
      updateGame({ phase: 'matching' });
      return;
    }

    if (type === 'ddz:waiting') {
      setMatchCount(msg.total as number);
      return;
    }

    if (type === 'ddz:game_start') {
      const { myCards, landlordCards, myIndex, playerNames, firstBidder, handSizes } = msg as {
        myCards: Card[]; landlordCards: Card[]; myIndex: 0|1|2;
        playerNames: string[]; firstBidder: number; handSizes: number[];
      };
      myServerIndexRef.current = myIndex;
      setMyServerIndex(myIndex);
      multiPlayerNamesRef.current = playerNames;
      setMultiPlayerNames(playerNames);

      const leftServer = (myIndex + 1) % 3;
      const rightServer = (myIndex + 2) % 3;
      const localFirstBidder = serverToLocal(firstBidder);

      updateGame({
        phase: 'bidding',
        hands: [sortCards(myCards), makeFakeHand(handSizes[leftServer], 'L'), makeFakeHand(handSizes[rightServer], 'R')],
        landlordCards: sortCards(landlordCards),
        landlordIndex: null,
        currentBidder: localFirstBidder,
        highestBid: 0,
        highestBidder: null,
        bidCount: 0,
        message: localFirstBidder === 0 ? '请选择是否叫地主' : `等待 ${playerNames[firstBidder]} 叫地主...`,
        playedCardsDisplay: [],
        bombMultiplier: 1,
        lastPlay: null,
        passCount: 0,
        gameResult: '',
      });
      setSelectedCards(new Set());
      return;
    }

    if (type === 'ddz:bid_update') {
      const { playerIndex, displayText, highestBid, done, nextBidder } = msg as {
        playerIndex: number; displayText: string; highestBid: number;
        done: boolean; nextBidder: number;
      };
      const localPlayer = serverToLocal(playerIndex);
      const displayEntry = { playerIndex: localPlayer, cards: [] as Card[], text: displayText };

      if (done) {
        updateGame({
          currentBidder: 1, // hide bid buttons
          playedCardsDisplay: [displayEntry],
          message: highestBid > 0 ? '地主已确定，准备开始...' : '无人叫地主，重新发牌...',
        });
        return;
      }

      const localNext = serverToLocal(nextBidder);
      const names = multiPlayerNamesRef.current;
      updateGame({
        currentBidder: localNext,
        highestBid,
        playedCardsDisplay: [displayEntry],
        message: localNext === 0
          ? '请选择是否叫地主'
          : `${names[nextBidder] || `玩家${nextBidder}`} 正在思考...`,
      });
      return;
    }

    if (type === 'ddz:bid_finalized') {
      const { landlordIndex, handSizes, myCards } = msg as {
        landlordIndex: number; landlordCards: Card[]; handSizes: number[]; myCards?: Card[];
      };
      const myIdx = myServerIndexRef.current;
      const localLandlord = serverToLocal(landlordIndex);
      const leftServer = (myIdx + 1) % 3;
      const rightServer = (myIdx + 2) % 3;
      const myNewCards = myCards ? sortCards(myCards) : gs.current.hands[0];
      const names = multiPlayerNamesRef.current;

      updateGame({
        phase: 'playing',
        hands: [myNewCards, makeFakeHand(handSizes[leftServer], 'L'), makeFakeHand(handSizes[rightServer], 'R')],
        landlordIndex: localLandlord,
        currentPlayer: localLandlord,
        lastPlay: null,
        passCount: 0,
        playedCardsDisplay: [],
        message: localLandlord === 0
          ? '你是地主！请出牌'
          : `${names[landlordIndex] || `玩家${landlordIndex}`} 是地主，正在出牌...`,
      });
      return;
    }

    if (type === 'ddz:play_update') {
      const { playerIndex, cards, handType, handSize, nextPlayer, bombMultiplier } = msg as {
        playerIndex: number; cards: Card[]; handType: string;
        handSize: number; nextPlayer: number; bombMultiplier: number;
      };
      const localPlayer = serverToLocal(playerIndex);
      const localNext = serverToLocal(nextPlayer);
      const newHands = [...gs.current.hands] as Card[][];

      if (localPlayer === 0) {
        const playedIds = new Set(cards.map(c => c.id));
        newHands[0] = gs.current.hands[0].filter(c => !playedIds.has(c.id));
      } else if (localPlayer === 1) {
        newHands[1] = makeFakeHand(handSize, 'L');
      } else {
        newHands[2] = makeFakeHand(handSize, 'R');
      }

      const names = multiPlayerNamesRef.current;
      updateGame({
        hands: newHands,
        lastPlay: { cards, playerIndex: localPlayer, type: handType as HandType },
        passCount: 0,
        bombMultiplier,
        currentPlayer: localNext,
        message: localNext === 0
          ? '轮到你出牌'
          : `轮到 ${names[nextPlayer] || `玩家${nextPlayer}`} 出牌`,
        playedCardsDisplay: [{ playerIndex: localPlayer, cards, text: HAND_TYPE_NAMES[handType] || '' }],
      });
      setSelectedCards(new Set());
      return;
    }

    if (type === 'ddz:pass_update') {
      const { playerIndex, nextPlayer, isNewRound, passCount } = msg as {
        playerIndex: number; nextPlayer: number; isNewRound: boolean; passCount: number;
      };
      const localPlayer = serverToLocal(playerIndex);
      const localNext = serverToLocal(nextPlayer);
      const names = multiPlayerNamesRef.current;
      const nextName = localNext === 0 ? '你' : (names[nextPlayer] || `玩家${nextPlayer}`);

      updateGame({
        passCount,
        lastPlay: isNewRound ? null : gs.current.lastPlay,
        currentPlayer: localNext,
        message: isNewRound
          ? (localNext === 0 ? '轮到你出牌（新一轮）' : `轮到 ${nextName} 出牌（新一轮）`)
          : (localNext === 0 ? '轮到你出牌' : `轮到 ${nextName} 出牌`),
        playedCardsDisplay: [{ playerIndex: localPlayer, cards: [], text: '不出' }],
      });
      return;
    }

    if (type === 'ddz:game_over') {
      const { winnerIndex, landlordIndex, isLandlordWin, lastCards, lastHandType } = msg as {
        winnerIndex: number; landlordIndex: number; isLandlordWin: boolean;
        lastCards: Card[]; lastHandType: string;
      };
      const localWinner = serverToLocal(winnerIndex);
      const localLandlord = serverToLocal(landlordIndex);
      const names = multiPlayerNamesRef.current;
      const winnerName = localWinner === 0 ? '你' : (names[winnerIndex] || `玩家${winnerIndex}`);

      let result: string;
      if (isLandlordWin) {
        result = localLandlord === 0
          ? '🎉 恭喜！你（地主）赢了！'
          : `${winnerName}（地主）赢了！你输了...`;
      } else {
        result = localLandlord !== 0
          ? '🎉 恭喜！农民赢了！'
          : `农民赢了！你（地主）输了...`;
      }

      updateGame({
        phase: 'gameOver',
        gameResult: result,
        message: result,
        playedCardsDisplay: lastCards?.length > 0
          ? [{ playerIndex: localWinner, cards: lastCards, text: HAND_TYPE_NAMES[lastHandType] || '' }]
          : gs.current.playedCardsDisplay,
      });
      return;
    }

    if (type === 'ddz:redeal') {
      const { myCards, landlordCards, handSizes } = msg as {
        myCards: Card[]; landlordCards: Card[]; handSizes: number[];
      };
      const myIdx = myServerIndexRef.current;
      const leftServer = (myIdx + 1) % 3;
      const rightServer = (myIdx + 2) % 3;

      updateGame({
        phase: 'bidding',
        hands: [sortCards(myCards), makeFakeHand(handSizes[leftServer], 'L'), makeFakeHand(handSizes[rightServer], 'R')],
        landlordCards: sortCards(landlordCards),
        landlordIndex: null,
        currentBidder: 0,
        highestBid: 0,
        highestBidder: null,
        bidCount: 0,
        message: '无人叫地主，重新发牌...',
        playedCardsDisplay: [],
        bombMultiplier: 1,
        lastPlay: null,
        passCount: 0,
        gameResult: '',
      });
      setSelectedCards(new Set());
      return;
    }

    if (type === 'ddz:player_left') {
      updateGame({ phase: 'gameOver', gameResult: '对手已断线，游戏结束', message: '对手已断线' });
      return;
    }

    if (type === 'ddz:error') {
      updateGame({ message: msg.message as string });
    }
  }, [updateGame]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep handleServerMsg ref in sync
  useEffect(() => { handleServerMsgRef.current = handleServerMsg; }, [handleServerMsg]);

  // Use a ref for AI play to break circular callback dependencies
  const doAiPlayRef = useRef<(playerIdx: PlayerIndex) => void>(() => {});

  // ============ Playing Phase ============
  const doExecutePlay = useCallback((playerIdx: PlayerIndex, cards: Card[], handInfo: HandInfo) => {
    const g = gs.current;
    const newHands = g.hands.map(h => [...h]);
    const cardIds = new Set(cards.map(c => c.id));
    newHands[playerIdx] = newHands[playerIdx].filter(c => !cardIds.has(c.id));

    const newPlay: PlayedCards = { cards, playerIndex: playerIdx, type: handInfo.type };
    let newMultiplier = g.bombMultiplier;
    if (handInfo.type === 'bomb' || handInfo.type === 'rocket') {
      newMultiplier *= 2;
    }

    // Check win
    if (newHands[playerIdx].length === 0) {
      const isLandlord = playerIdx === g.landlordIndex;
      const humanIsLandlord = g.landlordIndex === 0;
      let result: string;
      if (isLandlord) {
        result = humanIsLandlord ? '🎉 恭喜！你（地主）赢了！' : `${PLAYER_NAMES[playerIdx]}（地主）赢了！`;
      } else {
        result = !humanIsLandlord ? '🎉 恭喜！农民赢了！' : `农民赢了！你输了...`;
      }
      updateGame({
        hands: newHands, lastPlay: newPlay, passCount: 0, bombMultiplier: newMultiplier,
        playedCardsDisplay: [{ playerIndex: playerIdx, cards: sortCards(cards), text: HAND_TYPE_NAMES[handInfo.type] || '' }],
        gameResult: result, phase: 'gameOver', message: result,
      });
      setSelectedCards(new Set());
      return;
    }

    const nextPlayer = ((playerIdx + 1) % 3) as PlayerIndex;
    updateGame({
      hands: newHands, lastPlay: newPlay, passCount: 0, bombMultiplier: newMultiplier,
      currentPlayer: nextPlayer,
      message: `轮到${PLAYER_NAMES[nextPlayer]}出牌`,
      playedCardsDisplay: [{ playerIndex: playerIdx, cards: sortCards(cards), text: HAND_TYPE_NAMES[handInfo.type] || '' }],
    });
    setSelectedCards(new Set());

    if (nextPlayer !== 0) {
      aiTimerRef.current = setTimeout(() => doAiPlayRef.current(nextPlayer), 800 + Math.random() * 700);
    }
  }, [updateGame]);

  const doExecutePass = useCallback((playerIdx: PlayerIndex) => {
    const g = gs.current;
    const newPassCount = g.passCount + 1;
    const isNewRound = newPassCount >= 2;
    const nextPlayer = ((playerIdx + 1) % 3) as PlayerIndex;

    updateGame({
      passCount: newPassCount,
      lastPlay: isNewRound ? null : g.lastPlay,
      currentPlayer: nextPlayer,
      message: isNewRound
        ? `轮到${PLAYER_NAMES[nextPlayer]}出牌（新一轮）`
        : `轮到${PLAYER_NAMES[nextPlayer]}出牌`,
      playedCardsDisplay: [{ playerIndex: playerIdx, cards: [], text: '不出' }],
    });
    setSelectedCards(new Set());

    if (nextPlayer !== 0) {
      aiTimerRef.current = setTimeout(() => doAiPlayRef.current(nextPlayer), 800 + Math.random() * 700);
    }
  }, [updateGame]);

  const doAiPlay = useCallback((playerIdx: PlayerIndex) => {
    const g = gs.current;
    if (g.phase === 'gameOver') return;
    const isNewRound = g.passCount >= 2 || !g.lastPlay;
    const hand = g.hands[playerIdx];
    const decision = aiDecide(hand, g.lastPlay, isNewRound);

    if (decision) {
      const handInfo = detectHandType(decision);
      if (handInfo) {
        doExecutePlay(playerIdx, decision, handInfo);
        return;
      }
    }
    doExecutePass(playerIdx);
  }, [doExecutePlay, doExecutePass]);

  // Keep ref in sync
  useEffect(() => { doAiPlayRef.current = doAiPlay; }, [doAiPlay]);

  // ============ Bidding ============
  const finalizeBidding = useCallback((landlord: PlayerIndex) => {
    const g = gs.current;
    const newHands = g.hands.map(h => [...h]);
    newHands[landlord] = sortCards([...newHands[landlord], ...g.landlordCards]);
    updateGame({
      phase: 'playing',
      hands: newHands,
      landlordIndex: landlord,
      currentPlayer: landlord,
      lastPlay: null,
      passCount: 0,
      playedCardsDisplay: [],
      message: landlord === 0 ? '你是地主！请出牌' : `${PLAYER_NAMES[landlord]}是地主`,
    });
    if (landlord !== 0) {
      aiTimerRef.current = setTimeout(() => doAiPlayRef.current(landlord), 1500);
    }
  }, [updateGame]);

  // Use a ref for processBid to allow self-referencing in setTimeout
  const processBidRef = useRef<(playerIdx: PlayerIndex, bid: boolean) => void>(() => {});

  const processBid = useCallback((playerIdx: PlayerIndex, bid: boolean) => {
    const g = gs.current;
    const newBidCount = g.bidCount + 1;
    let newHighestBid = g.highestBid;
    let newHighestBidder = g.highestBidder;

    if (bid) {
      newHighestBid = g.highestBid + 1;
      newHighestBidder = playerIdx;
    }

    const displayEntry = { playerIndex: playerIdx, cards: [] as Card[], text: bid ? '叫地主!' : '不叫' };

    gs.current.bidCount = newBidCount;
    gs.current.highestBid = newHighestBid;
    gs.current.highestBidder = newHighestBidder;

    if ((bid && newHighestBid >= 3) || newBidCount >= 3) {
      if (newHighestBidder !== null) {
        updateGame({ playedCardsDisplay: [displayEntry] });
        finalizeBidding(newHighestBidder);
      } else {
        updateGame({ message: '无人叫地主，重新发牌...', playedCardsDisplay: [displayEntry] });
        setTimeout(() => {
          startGame();
        }, 1500);
      }
      return;
    }

    const nextBidder = ((playerIdx + 1) % 3) as PlayerIndex;
    gs.current.currentBidder = nextBidder;

    if (nextBidder !== 0) {
      updateGame({
        message: `${PLAYER_NAMES[nextBidder]}正在思考...`,
        playedCardsDisplay: [displayEntry],
      });
      aiTimerRef.current = setTimeout(() => {
        const aiBid = gs.current.highestBid === 0 ? Math.random() < 0.6 : Math.random() < 0.3;
        processBidRef.current(nextBidder, aiBid);
      }, 1000 + Math.random() * 500);
    } else {
      updateGame({ message: '请选择是否叫地主', playedCardsDisplay: [displayEntry] });
    }
  }, [updateGame, finalizeBidding, startGame]);

  // Keep ref in sync
  useEffect(() => { processBidRef.current = processBid; }, [processBid]);

  // Auto-start AI bidding if AI goes first
  useEffect(() => {
    if (gameState.phase === 'bidding' && gs.current.currentBidder !== 0 && gs.current.bidCount === 0) {
      aiTimerRef.current = setTimeout(() => {
        const aiBid = Math.random() < 0.5;
        processBidRef.current(gs.current.currentBidder, aiBid);
      }, 1000);
    }
  }, [gameState.phase]);

  const handleBid = useCallback((bid: boolean) => {
    if (matchModeRef.current === 'player') {
      if (gs.current.phase !== 'bidding' || gs.current.currentBidder !== 0) return;
      // Optimistically hide bid buttons to prevent double-send
      updateGame({ currentBidder: 1 });
      wsRef.current?.send(JSON.stringify({ type: 'ddz:bid', bid }));
      return;
    }
    if (gs.current.phase !== 'bidding' || gs.current.currentBidder !== 0) return;
    processBid(0, bid);
  }, [processBid, updateGame]);

  const toggleCardSelection = useCallback((cardId: string) => {
    if (gs.current.phase !== 'playing' || gs.current.currentPlayer !== 0) return;
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const handlePlay = useCallback(() => {
    const g = gs.current;
    if (g.phase !== 'playing' || g.currentPlayer !== 0) return;

    const selected = g.hands[0].filter(c => selectedCards.has(c.id));
    if (selected.length === 0) return;

    const handInfo = detectHandType(selected);
    if (!handInfo) {
      updateGame({ message: '无效的出牌组合！' });
      return;
    }

    const isNewRound = g.passCount >= 2 || !g.lastPlay;
    if (!isNewRound && g.lastPlay) {
      const lastInfo = detectHandType(g.lastPlay.cards);
      if (lastInfo && !canBeat(handInfo, lastInfo)) {
        updateGame({ message: '打不过上家，请重新选牌！' });
        return;
      }
    }

    if (matchModeRef.current === 'player') {
      // Optimistically hide play buttons
      updateGame({ currentPlayer: 1 });
      wsRef.current?.send(JSON.stringify({ type: 'ddz:play', cardIds: selected.map(c => c.id) }));
      return;
    }

    doExecutePlay(0, selected, handInfo);
  }, [selectedCards, updateGame, doExecutePlay]);

  const handlePass = useCallback(() => {
    const g = gs.current;
    if (g.phase !== 'playing' || g.currentPlayer !== 0) return;
    const isNewRound = g.passCount >= 2 || !g.lastPlay;
    if (isNewRound) {
      updateGame({ message: '你必须出牌（新一轮）！' });
      return;
    }

    if (matchModeRef.current === 'player') {
      updateGame({ currentPlayer: 1 }); // optimistically hide pass button
      wsRef.current?.send(JSON.stringify({ type: 'ddz:pass' }));
      return;
    }

    doExecutePass(0);
  }, [updateGame, doExecutePass]);

  // ============ Hint System ============
  const handleHint = useCallback(() => {
    const g = gs.current;
    if (g.phase !== 'playing' || g.currentPlayer !== 0) return;

    const isNewRound = g.passCount >= 2 || !g.lastPlay;
    const lastInfo = isNewRound || !g.lastPlay ? null : detectHandType(g.lastPlay.cards);
    const allPlays = findAllValidPlays(g.hands[0], lastInfo);

    if (allPlays.length === 0) {
      updateGame({ message: '没有可出的牌，请点击"不出"' });
      return;
    }

    const play = allPlays[Math.floor(Math.random() * allPlays.length)];
    setSelectedCards(new Set(play.map(c => c.id)));
  }, [updateGame]);

  // ============ New Game ============
  const handleNewGame = useCallback(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    // Close WebSocket if in player mode
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    matchModeRef.current = null;
    setMatchMode(null);
    Object.assign(gs.current, { ...initialGameState });
    setGameState({ ...initialGameState });
    setMatchCount(1);
    setSelectedCards(new Set());
    setMyServerIndex(0);
    setMultiPlayerNames([]);
    myServerIndexRef.current = 0;
    multiPlayerNamesRef.current = [];
  }, []);

  // ============ Render ============
  const g = gameState;

  // Helper: get display name for local seat (0=me, 1=left, 2=right)
  const getPlayerName = (localIdx: number): string => {
    if (matchMode === 'player' && multiPlayerNames.length > 0) {
      if (localIdx === 0) return '你';
      return multiPlayerNames[(myServerIndex + localIdx) % 3] || PLAYER_NAMES[localIdx];
    }
    return PLAYER_NAMES[localIdx];
  };

  const cancelMatching = () => {
    wsRef.current?.send(JSON.stringify({ type: 'ddz:leave' }));
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    matchModeRef.current = null;
    setMatchMode(null);
    setMatchCount(1);
    updateGame({ phase: 'selecting' });
  };

  const renderCard = (card: Card, selectable: boolean = false, isSelected: boolean = false) => {
    const display = getCardDisplay(card);
    const isJoker = card.rank === 'SMALL' || card.rank === 'BIG';
    return (
      <div
        key={card.id}
        className={`ddz-card ${isSelected ? 'ddz-card-selected' : ''} ${selectable ? 'ddz-card-selectable' : ''} ${isJoker ? 'ddz-card-joker' : ''}`}
        style={{ color: display.color }}
        onClick={selectable ? () => toggleCardSelection(card.id) : undefined}
      >
        <div className="ddz-card-rank">{isJoker ? display.text : card.rank}</div>
        {!isJoker && <div className="ddz-card-suit">{card.suit}</div>}
      </div>
    );
  };

  const renderCardBack = (count: number, label: string) => (
    <div className="ddz-opponent-area">
      <div className="ddz-opponent-name">{label}</div>
      <div className="ddz-card-backs">
        {count > 0 && (
          <div className="ddz-card-back-stack">
            <div className="ddz-card ddz-card-back" />
            <span className="ddz-card-count">×{count}</span>
          </div>
        )}
      </div>
    </div>
  );

  // Selecting phase
  if (g.phase === 'selecting') {
    return (
      <div className="ddz-page">
        <div className="ddz-header">
          <button className="btn-back" onClick={() => navigate('/')}>← 返回</button>
          <h1>🃏 斗地主</h1>
          <div />
        </div>
        <div className="ddz-matching">
          <div className="ddz-matching-card">
            <div className="ddz-matching-icon">🃏</div>
            <h2>选择游戏模式</h2>
            <div className="ddz-mode-buttons">
              <button
                className="ddz-mode-btn ddz-mode-btn-player"
                onClick={() => {
                  matchModeRef.current = 'player';
                  setMatchMode('player');
                  connectToServer();
                }}
              >
                👥 匹配玩家
              </button>
              <button
                className="ddz-mode-btn ddz-mode-btn-ai"
                onClick={() => {
                  matchModeRef.current = 'ai';
                  setMatchMode('ai');
                  startGame();
                }}
              >
                🤖 匹配电脑
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Matching phase
  if (g.phase === 'matching') {
    return (
      <div className="ddz-page">
        <div className="ddz-header">
          <button className="btn-back" onClick={cancelMatching}>← 取消匹配</button>
          <h1>🃏 斗地主</h1>
          <div />
        </div>
        <div className="ddz-matching">
          <div className="ddz-matching-card">
            <div className="ddz-matching-icon">🃏</div>
            <h2>正在匹配玩家...</h2>
            <div className="ddz-matching-count">
              <span className="ddz-match-number">{matchCount}</span> / 3
            </div>
            <div className="ddz-matching-players">
              {[1, 2, 3].map(i => (
                <div key={i} className={`ddz-player-dot ${i <= matchCount ? 'ddz-player-dot-active' : ''}`}>
                  {i <= matchCount ? '✓' : '...'}
                </div>
              ))}
            </div>
            {matchCount >= 3 && <p className="ddz-match-ready">匹配成功！即将开始...</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ddz-page">
      <div className="ddz-header">
        <button className="btn-back" onClick={() => navigate('/')}>← 返回</button>
        <h1>🃏 斗地主</h1>
        <div className="ddz-header-info">
          {g.landlordIndex !== null && (
            <span className="ddz-multiplier">倍数: ×{g.bombMultiplier}</span>
          )}
        </div>
      </div>

      <div className="ddz-table">
        {/* Opponent areas */}
        <div className="ddz-opponents">
          <div className="ddz-opponent ddz-opponent-left">
            {renderCardBack(g.hands[1].length, `${getPlayerName(1)}${g.landlordIndex === 1 ? ' 👑地主' : ' 🌾农民'}`)}
            {g.playedCardsDisplay.length > 0 && g.playedCardsDisplay[0].playerIndex === 1 && (
              <div className="ddz-played-section ddz-played-opponent">
                {g.playedCardsDisplay[0].cards.length > 0 ? (
                  <div className="ddz-played-cards">
                    {g.playedCardsDisplay[0].cards.map(c => renderCard(c))}
                  </div>
                ) : (
                  <div className="ddz-play-text">{g.playedCardsDisplay[0].text}</div>
                )}
              </div>
            )}
          </div>

          <div className="ddz-opponent ddz-opponent-right">
            {renderCardBack(g.hands[2].length, `${getPlayerName(2)}${g.landlordIndex === 2 ? ' 👑地主' : ' 🌾农民'}`)}
            {g.playedCardsDisplay.length > 0 && g.playedCardsDisplay[0].playerIndex === 2 && (
              <div className="ddz-played-section ddz-played-opponent">
                {g.playedCardsDisplay[0].cards.length > 0 ? (
                  <div className="ddz-played-cards">
                    {g.playedCardsDisplay[0].cards.map(c => renderCard(c))}
                  </div>
                ) : (
                  <div className="ddz-play-text">{g.playedCardsDisplay[0].text}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center area - landlord cards & last play */}
        <div className="ddz-center">
          {g.landlordCards.length > 0 && (
            <div className="ddz-landlord-cards">
              <span className="ddz-landlord-label">地主牌：</span>
              <div className="ddz-landlord-card-row">
                {g.landlordCards.map(c => renderCard(c))}
              </div>
            </div>
          )}

          {g.playedCardsDisplay.length > 0 && g.playedCardsDisplay[0].playerIndex === 0 && (
            <div className="ddz-played-section">
              {g.playedCardsDisplay[0].cards.length > 0 ? (
                <div className="ddz-played-cards">
                  {g.playedCardsDisplay[0].cards.map(c => renderCard(c))}
                </div>
              ) : (
                <div className="ddz-play-text">{g.playedCardsDisplay[0].text}</div>
              )}
            </div>
          )}

          <div className="ddz-message">{g.message}</div>
        </div>

        {/* Player hand */}
        <div className="ddz-player-area">
          <div className="ddz-player-label">
            {getPlayerName(0)}{g.landlordIndex === 0 ? ' 👑地主' : g.landlordIndex !== null ? ' 🌾农民' : ''}
            {' · '}剩余 {g.hands[0].length} 张
          </div>
          <div className="ddz-hand">
            {g.hands[0].map(card => renderCard(card, g.phase === 'playing' && g.currentPlayer === 0, selectedCards.has(card.id)))}
          </div>

          <div className="ddz-actions">
            {g.phase === 'bidding' && g.currentBidder === 0 && (
              <>
                <button className="ddz-btn ddz-btn-primary" onClick={() => handleBid(true)}>叫地主</button>
                <button className="ddz-btn ddz-btn-secondary" onClick={() => handleBid(false)}>不叫</button>
              </>
            )}
            {g.phase === 'playing' && g.currentPlayer === 0 && (
              <>
                <button className="ddz-btn ddz-btn-primary" onClick={handlePlay} disabled={selectedCards.size === 0}>出牌</button>
                <button className="ddz-btn ddz-btn-secondary" onClick={handlePass} disabled={g.passCount >= 2 || !g.lastPlay}>不出</button>
                <button className="ddz-btn ddz-btn-hint" onClick={handleHint}>提示</button>
              </>
            )}
            {g.phase === 'gameOver' && (
              <>
                <div className="ddz-game-result">{g.gameResult}</div>
                <button className="ddz-btn ddz-btn-primary" onClick={handleNewGame}>再来一局</button>
                <button className="ddz-btn ddz-btn-secondary" onClick={() => navigate('/')}>返回首页</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Doudizhu;
