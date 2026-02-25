import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { logInfo, logError } from './logger';
import { dbGet } from './database';

// ============ Existing broadcast functionality ============
const clients = new Set<WebSocket>();

export const broadcastMessage = (type: string, data: unknown) => {
  const message = JSON.stringify({ type, data });
  let sent = 0;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        sent++;
      } catch (err) {
        logError('ws_send_error', err as Error);
      }
    }
  }
  logInfo('ws_broadcast', { type, sentTo: sent, totalClients: clients.size });
  return sent;
};

export const getConnectedCount = () => clients.size;

// ============ Doudizhu Card Types ============
interface DdzCard {
  suit: string;
  rank: string;
  value: number;
  id: string;
}

type DdzHandType =
  | 'single' | 'pair' | 'triple'
  | 'triple_one' | 'triple_pair'
  | 'straight' | 'straight_pairs' | 'airplane'
  | 'airplane_single' | 'airplane_pair'
  | 'bomb' | 'rocket'
  | 'four_two_single' | 'four_two_pair';

interface DdzHandInfo {
  type: DdzHandType;
  mainValue: number;
  length: number;
}

const DDZ_SUITS = ['♠', '♥', '♣', '♦'];
const DDZ_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const DDZ_RANK_VALUES: Record<string, number> = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  'SMALL': 16, 'BIG': 17,
};

function createDeck(): DdzCard[] {
  const deck: DdzCard[] = [];
  for (const suit of DDZ_SUITS) {
    for (const rank of DDZ_RANKS) {
      deck.push({ suit, rank, value: DDZ_RANK_VALUES[rank], id: `${suit}${rank}` });
    }
  }
  deck.push({ suit: 'joker', rank: 'SMALL', value: 16, id: 'joker_small' });
  deck.push({ suit: 'joker', rank: 'BIG', value: 17, id: 'joker_big' });
  return deck;
}

function shuffleDeck(deck: DdzCard[]): DdzCard[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortCards(cards: DdzCard[]): DdzCard[] {
  return [...cards].sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    const suitOrder = ['♦', '♣', '♥', '♠'];
    return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
  });
}

function getRankCounts(cards: DdzCard[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const c of cards) {
    counts.set(c.value, (counts.get(c.value) || 0) + 1);
  }
  return counts;
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

function detectHandType(cards: DdzCard[]): DdzHandInfo | null {
  const n = cards.length;
  if (n === 0) return null;
  const counts = getRankCounts(cards);
  const values = cards.map(c => c.value);
  const uniqueValues = [...counts.keys()].sort((a, b) => a - b);

  if (n === 2 && values.includes(16) && values.includes(17)) {
    return { type: 'rocket', mainValue: 17, length: 2 };
  }
  if (n === 1) return { type: 'single', mainValue: values[0], length: 1 };
  if (n === 2 && counts.size === 1 && [...counts.values()][0] === 2) {
    return { type: 'pair', mainValue: uniqueValues[0], length: 2 };
  }
  if (n === 3 && counts.size === 1 && [...counts.values()][0] === 3) {
    return { type: 'triple', mainValue: uniqueValues[0], length: 3 };
  }
  if (n === 4 && counts.size === 1 && [...counts.values()][0] === 4) {
    return { type: 'bomb', mainValue: uniqueValues[0], length: 4 };
  }
  if (n === 4 && counts.size === 2) {
    for (const [val, cnt] of counts) {
      if (cnt === 3) return { type: 'triple_one', mainValue: val, length: 4 };
    }
  }
  if (n === 5 && counts.size === 2) {
    let tripleVal = -1;
    let hasPair = false;
    for (const [val, cnt] of counts) {
      if (cnt === 3) tripleVal = val;
      if (cnt === 2) hasPair = true;
    }
    if (tripleVal >= 0 && hasPair) return { type: 'triple_pair', mainValue: tripleVal, length: 5 };
  }
  if (n >= 5 && uniqueValues.every(v => v >= 3 && v <= 14)) {
    if (uniqueValues.length === n && [...counts.values()].every(c => c === 1)) {
      const isConsecutive = uniqueValues.every((v, i) => i === 0 || v === uniqueValues[i - 1] + 1);
      if (isConsecutive) return { type: 'straight', mainValue: uniqueValues[uniqueValues.length - 1], length: n };
    }
  }
  if (n >= 6 && n % 2 === 0) {
    const allPairs = [...counts.values()].every(c => c === 2);
    if (allPairs && uniqueValues.every(v => v >= 3 && v <= 14)) {
      const isConsecutive = uniqueValues.every((v, i) => i === 0 || v === uniqueValues[i - 1] + 1);
      if (isConsecutive && uniqueValues.length >= 3) {
        return { type: 'straight_pairs', mainValue: uniqueValues[uniqueValues.length - 1], length: n };
      }
    }
  }
  const tripleValues = [...counts.entries()]
    .filter(([, cnt]) => cnt === 3)
    .map(([val]) => val)
    .sort((a, b) => a - b);
  if (tripleValues.length >= 2) {
    const consecutiveTriples = findConsecutiveSequence(tripleValues.filter(v => v >= 3 && v <= 14));
    if (consecutiveTriples.length >= 2) {
      const tripleCount = consecutiveTriples.length;
      const extraCards = n - tripleCount * 3;
      if (extraCards === 0) {
        return { type: 'airplane', mainValue: consecutiveTriples[consecutiveTriples.length - 1], length: n };
      }
      if (extraCards === tripleCount) {
        return { type: 'airplane_single', mainValue: consecutiveTriples[consecutiveTriples.length - 1], length: n };
      }
      if (extraCards === tripleCount * 2) {
        const extraCounts = new Map(counts);
        for (const tv of consecutiveTriples) extraCounts.delete(tv);
        const allExtraPairs = [...extraCounts.values()].every(c => c === 2);
        if (allExtraPairs) {
          return { type: 'airplane_pair', mainValue: consecutiveTriples[consecutiveTriples.length - 1], length: n };
        }
      }
    }
  }
  if (n === 6) {
    for (const [val, cnt] of counts) {
      if (cnt === 4) return { type: 'four_two_single', mainValue: val, length: 6 };
    }
  }
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

function canBeat(current: DdzHandInfo, last: DdzHandInfo): boolean {
  if (current.type === 'rocket') return true;
  if (current.type === 'bomb' && last.type !== 'bomb' && last.type !== 'rocket') return true;
  if (current.type === last.type && current.length === last.length && current.mainValue > last.mainValue) return true;
  if (current.type === 'bomb' && last.type === 'bomb' && current.mainValue > last.mainValue) return true;
  return false;
}

// ============ Doudizhu Room Manager ============
type SeatIndex = 0 | 1 | 2;

interface DdzQueueEntry {
  ws: WebSocket;
  userId: number;
  nickname: string;
}

interface DdzPlayer {
  ws: WebSocket;
  userId: number;
  nickname: string;
  seatIndex: SeatIndex;
}

interface DdzRoom {
  id: string;
  players: DdzPlayer[];
  hands: DdzCard[][];
  landlordCards: DdzCard[];
  phase: 'bidding' | 'playing' | 'gameOver';
  currentBidder: SeatIndex;
  highestBid: number;
  highestBidder: SeatIndex | null;
  bidCount: number;
  landlordIndex: SeatIndex | null;
  currentPlayer: SeatIndex;
  lastPlay: { cards: DdzCard[]; playerIndex: SeatIndex; type: DdzHandType } | null;
  passCount: number;
  bombMultiplier: number;
}

function wsSend(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      logError('ws_send_error', err as Error);
    }
  }
}

class DoudizhuRoomManager {
  private queue: DdzQueueEntry[] = [];
  private rooms = new Map<string, DdzRoom>();
  private wsToRoom = new Map<WebSocket, { roomId: string; seatIndex: SeatIndex }>();
  private wsToUser = new Map<WebSocket, { userId: number; nickname: string }>();

  async authenticate(ws: WebSocket, token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      const user = await dbGet('SELECT nickname FROM users WHERE id = ?', [decoded.userId]);
      if (!user) {
        wsSend(ws, { type: 'ddz:error', message: '用户不存在' });
        return false;
      }
      const nickname = user.nickname || `玩家${decoded.userId}`;
      this.wsToUser.set(ws, { userId: decoded.userId, nickname });
      wsSend(ws, { type: 'ddz:auth_ok' });
      return true;
    } catch {
      wsSend(ws, { type: 'ddz:error', message: '认证失败，请重新登录' });
      return false;
    }
  }

  joinQueue(ws: WebSocket) {
    const user = this.wsToUser.get(ws);
    if (!user) {
      wsSend(ws, { type: 'ddz:error', message: '请先认证' });
      return;
    }
    if (this.queue.some(q => q.userId === user.userId)) {
      wsSend(ws, { type: 'ddz:error', message: '已在匹配队列中' });
      return;
    }
    if (this.wsToRoom.has(ws)) {
      wsSend(ws, { type: 'ddz:error', message: '已在游戏中' });
      return;
    }
    this.queue.push({ ws, userId: user.userId, nickname: user.nickname });
    this.queue.forEach((entry, i) => {
      wsSend(entry.ws, { type: 'ddz:waiting', position: i + 1, total: this.queue.length });
    });
    if (this.queue.length >= 3) {
      this.createRoom();
    }
  }

  leaveQueue(ws: WebSocket) {
    const idx = this.queue.findIndex(q => q.ws === ws);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.queue.forEach((entry, i) => {
        wsSend(entry.ws, { type: 'ddz:waiting', position: i + 1, total: this.queue.length });
      });
    }
  }

  private createRoom() {
    const players = this.queue.splice(0, 3);
    const roomId = `ddz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const deck = shuffleDeck(createDeck());
    const hands: DdzCard[][] = [
      sortCards(deck.slice(0, 17)),
      sortCards(deck.slice(17, 34)),
      sortCards(deck.slice(34, 51)),
    ];
    const landlordCards = deck.slice(51, 54);
    const room: DdzRoom = {
      id: roomId,
      players: players.map((p, i) => ({ ...p, seatIndex: i as SeatIndex })),
      hands,
      landlordCards,
      phase: 'bidding',
      currentBidder: 0,
      highestBid: 0,
      highestBidder: null,
      bidCount: 0,
      landlordIndex: null,
      currentPlayer: 0,
      lastPlay: null,
      passCount: 0,
      bombMultiplier: 1,
    };
    this.rooms.set(roomId, room);
    room.players.forEach(p => {
      this.wsToRoom.set(p.ws, { roomId, seatIndex: p.seatIndex });
    });
    const playerNames = room.players.map(p => p.nickname);
    room.players.forEach(p => {
      wsSend(p.ws, {
        type: 'ddz:game_start',
        roomId,
        myCards: room.hands[p.seatIndex],
        landlordCards: room.landlordCards,
        myIndex: p.seatIndex,
        playerNames,
        firstBidder: 0,
        handSizes: [17, 17, 17],
      });
    });
    logInfo('ddz_room_created', { roomId, players: playerNames });
  }

  handleBid(ws: WebSocket, bid: boolean) {
    const roomInfo = this.wsToRoom.get(ws);
    if (!roomInfo) return;
    const room = this.rooms.get(roomInfo.roomId);
    if (!room || room.phase !== 'bidding') return;
    if (room.currentBidder !== roomInfo.seatIndex) {
      wsSend(ws, { type: 'ddz:error', message: '还没轮到你叫地主' });
      return;
    }
    room.bidCount++;
    if (bid) {
      room.highestBid++;
      room.highestBidder = roomInfo.seatIndex;
    }
    const displayText = bid ? '叫地主!' : '不叫';
    if ((bid && room.highestBid >= 3) || room.bidCount >= 3) {
      if (room.highestBidder !== null) {
        this.broadcastToRoom(room, {
          type: 'ddz:bid_update',
          playerIndex: roomInfo.seatIndex,
          bid,
          displayText,
          highestBid: room.highestBid,
          done: true,
          nextBidder: -1,
        });
        const landlord = room.highestBidder;
        setTimeout(() => this.finalizeBidding(room, landlord), 600);
      } else {
        this.broadcastToRoom(room, {
          type: 'ddz:bid_update',
          playerIndex: roomInfo.seatIndex,
          bid,
          displayText,
          highestBid: 0,
          done: true,
          nextBidder: -1,
        });
        setTimeout(() => this.redealRoom(room), 1500);
      }
      return;
    }
    const nextBidder = ((room.currentBidder + 1) % 3) as SeatIndex;
    room.currentBidder = nextBidder;
    this.broadcastToRoom(room, {
      type: 'ddz:bid_update',
      playerIndex: roomInfo.seatIndex,
      bid,
      displayText,
      highestBid: room.highestBid,
      done: false,
      nextBidder,
    });
  }

  private finalizeBidding(room: DdzRoom, landlord: SeatIndex) {
    const newHands = room.hands.map(h => [...h]);
    newHands[landlord] = sortCards([...newHands[landlord], ...room.landlordCards]);
    room.hands = newHands;
    room.landlordIndex = landlord;
    room.phase = 'playing';
    room.currentPlayer = landlord;
    room.lastPlay = null;
    room.passCount = 0;
    const handSizes = newHands.map(h => h.length) as [number, number, number];
    room.players.forEach(p => {
      wsSend(p.ws, {
        type: 'ddz:bid_finalized',
        landlordIndex: landlord,
        landlordCards: room.landlordCards,
        handSizes,
        myCards: p.seatIndex === landlord ? newHands[landlord] : undefined,
      });
    });
    logInfo('ddz_bidding_finalized', { roomId: room.id, landlordSeat: landlord });
  }

  private redealRoom(room: DdzRoom) {
    const deck = shuffleDeck(createDeck());
    room.hands = [
      sortCards(deck.slice(0, 17)),
      sortCards(deck.slice(17, 34)),
      sortCards(deck.slice(34, 51)),
    ];
    room.landlordCards = deck.slice(51, 54);
    room.phase = 'bidding';
    room.currentBidder = 0;
    room.highestBid = 0;
    room.highestBidder = null;
    room.bidCount = 0;
    room.landlordIndex = null;
    room.currentPlayer = 0;
    room.lastPlay = null;
    room.passCount = 0;
    room.bombMultiplier = 1;
    room.players.forEach(p => {
      wsSend(p.ws, {
        type: 'ddz:redeal',
        myCards: room.hands[p.seatIndex],
        landlordCards: room.landlordCards,
        firstBidder: 0,
        handSizes: [17, 17, 17],
      });
    });
    logInfo('ddz_redeal', { roomId: room.id });
  }

  handlePlay(ws: WebSocket, cardIds: string[]) {
    const roomInfo = this.wsToRoom.get(ws);
    if (!roomInfo) return;
    const room = this.rooms.get(roomInfo.roomId);
    if (!room || room.phase !== 'playing') return;
    if (room.currentPlayer !== roomInfo.seatIndex) {
      wsSend(ws, { type: 'ddz:error', message: '还没轮到你出牌' });
      return;
    }
    const myHand = room.hands[roomInfo.seatIndex];
    const idSet = new Set(cardIds);
    const cards = myHand.filter(c => idSet.has(c.id));
    if (cards.length !== cardIds.length || cards.length === 0) {
      wsSend(ws, { type: 'ddz:error', message: '牌不合法' });
      return;
    }
    const handInfo = detectHandType(cards);
    if (!handInfo) {
      wsSend(ws, { type: 'ddz:error', message: '无效的出牌组合' });
      return;
    }
    const isNewRound = room.passCount >= 2 || !room.lastPlay;
    if (!isNewRound && room.lastPlay) {
      const lastInfo = detectHandType(room.lastPlay.cards);
      if (lastInfo && !canBeat(handInfo, lastInfo)) {
        wsSend(ws, { type: 'ddz:error', message: '打不过上家' });
        return;
      }
    }
    room.hands[roomInfo.seatIndex] = myHand.filter(c => !idSet.has(c.id));
    room.lastPlay = { cards, playerIndex: roomInfo.seatIndex, type: handInfo.type };
    room.passCount = 0;
    if (handInfo.type === 'bomb' || handInfo.type === 'rocket') {
      room.bombMultiplier *= 2;
    }
    const handSize = room.hands[roomInfo.seatIndex].length;
    if (handSize === 0) {
      room.phase = 'gameOver';
      const isLandlordWin = roomInfo.seatIndex === room.landlordIndex;
      this.broadcastToRoom(room, {
        type: 'ddz:game_over',
        winnerIndex: roomInfo.seatIndex,
        landlordIndex: room.landlordIndex,
        isLandlordWin,
        lastCards: sortCards(cards),
        lastHandType: handInfo.type,
        bombMultiplier: room.bombMultiplier,
      });
      logInfo('ddz_game_over', { roomId: room.id, winnerSeat: roomInfo.seatIndex, isLandlordWin });
      setTimeout(() => this.cleanupRoom(room), 10000);
      return;
    }
    const nextPlayer = ((roomInfo.seatIndex + 1) % 3) as SeatIndex;
    room.currentPlayer = nextPlayer;
    this.broadcastToRoom(room, {
      type: 'ddz:play_update',
      playerIndex: roomInfo.seatIndex,
      cards: sortCards(cards),
      handType: handInfo.type,
      handSize,
      nextPlayer,
      bombMultiplier: room.bombMultiplier,
    });
  }

  handlePass(ws: WebSocket) {
    const roomInfo = this.wsToRoom.get(ws);
    if (!roomInfo) return;
    const room = this.rooms.get(roomInfo.roomId);
    if (!room || room.phase !== 'playing') return;
    if (room.currentPlayer !== roomInfo.seatIndex) {
      wsSend(ws, { type: 'ddz:error', message: '还没轮到你出牌' });
      return;
    }
    const isNewRound = room.passCount >= 2 || !room.lastPlay;
    if (isNewRound) {
      wsSend(ws, { type: 'ddz:error', message: '新一轮必须出牌' });
      return;
    }
    const newPassCount = room.passCount + 1;
    const isNowNewRound = newPassCount >= 2;
    room.passCount = newPassCount;
    if (isNowNewRound) {
      room.lastPlay = null;
    }
    const nextPlayer = ((roomInfo.seatIndex + 1) % 3) as SeatIndex;
    room.currentPlayer = nextPlayer;
    this.broadcastToRoom(room, {
      type: 'ddz:pass_update',
      playerIndex: roomInfo.seatIndex,
      nextPlayer,
      isNewRound: isNowNewRound,
      passCount: room.passCount,
    });
  }

  handleDisconnect(ws: WebSocket) {
    this.leaveQueue(ws);
    const roomInfo = this.wsToRoom.get(ws);
    if (roomInfo) {
      const room = this.rooms.get(roomInfo.roomId);
      if (room && room.phase !== 'gameOver') {
        this.broadcastToRoom(room, {
          type: 'ddz:player_left',
          playerIndex: roomInfo.seatIndex,
        }, ws);
        this.cleanupRoom(room);
        logInfo('ddz_room_closed_disconnect', { roomId: roomInfo.roomId });
      }
      this.wsToRoom.delete(ws);
    }
    this.wsToUser.delete(ws);
  }

  private cleanupRoom(room: DdzRoom) {
    room.players.forEach(p => {
      this.wsToRoom.delete(p.ws);
    });
    this.rooms.delete(room.id);
  }

  private broadcastToRoom(room: DdzRoom, message: object, exclude?: WebSocket) {
    const msg = JSON.stringify(message);
    room.players.forEach(p => {
      if (p.ws !== exclude && p.ws.readyState === WebSocket.OPEN) {
        try {
          p.ws.send(msg);
        } catch (err) {
          logError('ws_room_send_error', err as Error);
        }
      }
    });
  }

  getQueueLength(): number { return this.queue.length; }
  getRoomCount(): number { return this.rooms.size; }
}

const ddzRoomManager = new DoudizhuRoomManager();

// ============ WebSocket Server Initialization ============
export const initWebSocket = (server: Server) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    logInfo('ws_client_connected', { totalClients: clients.size });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case 'ddz:auth':
            await ddzRoomManager.authenticate(ws, msg.token || '');
            break;
          case 'ddz:join':
            ddzRoomManager.joinQueue(ws);
            break;
          case 'ddz:leave':
            ddzRoomManager.leaveQueue(ws);
            break;
          case 'ddz:bid':
            ddzRoomManager.handleBid(ws, !!msg.bid);
            break;
          case 'ddz:play':
            ddzRoomManager.handlePlay(ws, Array.isArray(msg.cardIds) ? msg.cardIds : []);
            break;
          case 'ddz:pass':
            ddzRoomManager.handlePass(ws);
            break;
        }
      } catch (err) {
        logError('ws_message_error', err as Error);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      ddzRoomManager.handleDisconnect(ws);
      logInfo('ws_client_disconnected', { totalClients: clients.size });
    });

    ws.on('error', (err) => {
      logError('ws_client_error', err);
      clients.delete(ws);
      ddzRoomManager.handleDisconnect(ws);
    });
  });

  logInfo('websocket_server_initialized', { path: '/ws' });
};
