// server/match_manager.ts (FINAL ASYNC VERSION for Stage 4)

import type { // <-- USE `import type` FOR TYPES
  State,
  Move,
} from "./logic/checkers.ts";

import { // <-- USE REGULAR IMPORT FOR VALUES
  createInitialState,
  validateAndApplyMove,
  prettyBoard,
  isGameOver,
} from "./logic/checkers.ts";

export type PlayerId = string;

// Interface methods are now ASYNC (return Promise<void>)
interface TransactionHandler {
    deduct(playerId: PlayerId, amount: number): Promise<void>;
    payout(winnerId: PlayerId, amount: number): Promise<void>;
}

export interface Match {
  id: string;
  state: State;
  players: { p1: PlayerId | null; p2: PlayerId | null };
  stake: number;
  pot: number;
  createdAt: number;
  status: 'pending' | 'active' | 'completed';
}

export class MatchManager {
  matches: Map<string, Match> = new Map();
  private wallet: TransactionHandler;

  // Ensure constructor takes the async handler
  constructor(walletHandler: TransactionHandler) { 
    this.wallet = walletHandler;
  }

  public createMatch(id: string, stake = 0): Match {
    const m: Match = {
      id,
      state: createInitialState(),
      players: { p1: null, p2: null },
      stake,
      pot: 0,
      createdAt: Date.now(),
      status: 'pending'
    };
    this.matches.set(id, m);
    return m;
  }

  // Function is now ASYNC
  public async joinMatch(matchId: string, seat: "p1" | "p2", playerId: PlayerId): Promise<Match> {
    const m = this.matches.get(matchId);
    if (!m) throw new Error("Match not found");
    if (m.players[seat] && m.players[seat] !== playerId) throw new Error("Seat taken");
    m.players[seat] = playerId;

    // Deduct stake and activate match if both players are ready
    if (m.players.p1 && m.players.p2 && m.status === 'pending') {
        try {
            // ADD AWAIT
            await this.wallet.deduct(m.players.p1, m.stake);
            await this.wallet.deduct(m.players.p2, m.stake);
            m.pot = m.stake * 2;
            m.status = 'active';
            console.log(`Match ${m.id} activated. Pot: ${m.pot}`);
        } catch (e: any) { 
            // Handle insufficient funds error from the Wallet/DB
            m.players.p1 = null; m.players.p2 = null;
            throw new Error("Could not join: Insufficient funds or wallet error. Details: " + e.message);
        }
    }
    return m;
  }

  // Function is now ASYNC
  private async endMatch(match: Match, winnerSide: 1 | -1 | 'Draw') {
      match.status = 'completed';
      const winnerId = winnerSide === 1 ? match.players.p1 : match.players.p2;
      
      if (winnerSide === 'Draw') {
          // ADD AWAIT
          if (match.players.p1) await this.wallet.payout(match.players.p1, match.pot / 2);
          if (match.players.p2) await this.wallet.payout(match.players.p2, match.pot / 2);
          console.log(`Match ${match.id} ended in a Draw. Pot refunded.`);
          return { winner: 'Draw' };
      }
      
      // Payout the full pot to the winner 
      if (winnerId) {
          // ADD AWAIT
          await this.wallet.payout(winnerId, match.pot);
          console.log(`Match ${match.id} won by ${winnerId}. Payout: ${match.pot}`);
          return { winner: winnerSide === 1 ? 'p1' : 'p2' };
      }
      return { winner: 'Error' };
  }


  // This function was already async, but needs await on endMatch call
  public async submitMove(
    matchId: string,
    playerId: PlayerId,
    playerSide: 1 | -1,
    move: Move,
  ): Promise<{ success: boolean; state?: State; error?: string; suggestion?: Move; matchEnd?: { winner: string } }> {
    const m = this.matches.get(matchId);
    if (!m) return { success: false, error: "Match not found" };

    if (m.status !== 'active') return { success: false, error: "Match is not active." };
    
    // Check player seating and turn
    const requiredPlayerId = playerSide === 1 ? m.players.p1 : m.players.p2;
    if (playerId !== requiredPlayerId) return { success: false, error: "Authentication failed: Not your piece." };
    if (m.state.currentPlayer !== playerSide) return { success: false, error: "Not your turn." };
    
    try {
      const result = validateAndApplyMove(m.state, move, playerSide);

      if (result.suggestion) {
          return { success: false, error: "Illegal move: A capture is mandatory.", suggestion: result.suggestion };
      }

      m.state = result.state;
      
      // Check for Game Over after the move is applied
      const gameOverResult = isGameOver(m.state);
      if (gameOverResult.over) {
          const winnerMap = { 1: 1, '-1': -1, 'Draw': 'Draw' };
          const winnerSide = winnerMap[String(gameOverResult.winner) as keyof typeof winnerMap] as (1 | -1 | 'Draw');
          // ADD AWAIT to endMatch call
          const endResult = await this.endMatch(m, winnerSide); 
          return { success: true, state: m.state, matchEnd: endResult };
      }
      
      return { success: true, state: m.state };

    } catch (err: any) {
      return { success: false, error: err.message || "Illegal move" };
    }
  }


  public getMatch(matchId: string): Match | undefined {
    return this.matches.get(matchId);
  }

  public debugBoard(matchId: string): string {
    const m = this.matches.get(matchId);
    if (!m) return "not found";
    return prettyBoard(m.state.board);
  }
}
