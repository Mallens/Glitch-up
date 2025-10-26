// server/logic/checkers.ts - Updated Logic Layer

export type Piece = 0 | 1 | 2 | -1 | -2;

// Explicitly define State and Move as exported interfaces/types
export interface State {
  board: Piece[];
  currentPlayer: 1 | -1;
  moveNumber: number;
  // New: Counter for 50-move draw rule (moves without capture or kinging)
  noProgressCount: number; 
}

export interface Move {
  seq: number[];
  captures: number[];
}

// --- Utility Functions (indexToRC, rcToIndex, pieceOwner, isKing, arraysEqual, prettyBoard) ---
// (Assuming these remain the same as the last version you received)

function indexToRC(idx: number): { r: number; c: number } {
  const r = Math.floor(idx / 4);
  const posInRow = idx % 4;
  const c = (r % 2 === 0) ? (1 + 2 * posInRow) : (0 + 2 * posInRow);
  return { r, c };
}

function rcToIndex(r: number, c: number): number | null {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  if ((r + c) % 2 === 0) return null;
  const base = r * 4;
  const posInRow = (r % 2 === 0) ? ((c - 1) / 2) : (c / 2);
  if (!Number.isInteger(posInRow)) return null;
  return base + posInRow;
}

export function createInitialState(): State {
  const board: Piece[] = new Array(32).fill(0);
  for (let i = 0; i < 12; i++) board[i] = -1;
  for (let i = 20; i < 32; i++) board[i] = 1;
  return { board, currentPlayer: 1, moveNumber: 0, noProgressCount: 0 };
}

function pieceOwner(p: Piece): 1 | -1 | 0 {
  if (p === 0) return 0;
  return p > 0 ? 1 : -1;
}

function isKing(p: Piece): boolean {
  return p === 2 || p === -2;
}

function cloneState(s: State): State {
  return { 
    board: s.board.slice() as Piece[], 
    currentPlayer: s.currentPlayer, 
    moveNumber: s.moveNumber,
    noProgressCount: s.noProgressCount // Include new counter
  };
}

function reachesKingRow(owner: 1 | -1, idx: number): boolean {
  const { r } = indexToRC(idx);
  return owner === 1 ? r === 0 : r === 7;
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ... (findNormalMovesFrom, findCapturesFrom, generateLegalMoves remain the same)
function findNormalMovesFrom(board: Piece[], idx: number): Move[] {
  const res: Move[] = [];
  const p = board[idx];
  if (p === 0) return res;
  const owner = pieceOwner(p);
  const king = isKing(p);
  const { r, c } = indexToRC(idx);

  const directions = king ? [[1,1],[1,-1],[-1,1],[-1,-1]] :
    (owner === 1 ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]); // FIX: Player -1 moves down, so [1,-1], [1,1]

  for (const [dr, dc] of directions) {
    const nr = r + dr, nc = c + dc;
    const ni = rcToIndex(nr, nc);
    if (ni === null) continue;
    if (board[ni] === 0) res.push({ seq: [idx, ni], captures: [] });
  }
  return res;
}

function findCapturesFrom(boardOrig: Piece[], startIdx: number): Move[] {
  const results: Move[] = [];
  const piece = boardOrig[startIdx];
  if (piece === 0) return results;
  const owner = pieceOwner(piece) as 1 | -1;
  const kingAtStart = isKing(piece);

  const board = boardOrig.slice() as Piece[];

  function dfs(currIdx: number, workingBoard: Piece[], path: number[], captured: number[], promoted: boolean) {
    const { r, c } = indexToRC(currIdx);
    const directions = kingAtStart || promoted ? [[1,1],[1,-1],[-1,1],[-1,-1]] :
      (owner === 1 ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]);

    let foundAny = false;

    for (const [dr, dc] of directions) {
      const ar = r + dr, ac = c + dc;
      const ai = rcToIndex(ar, ac);
      if (ai === null) continue;
      const adjPiece = workingBoard[ai];
      if (pieceOwner(adjPiece) === -owner) {
        const lr = ar + dr, lc = ac + dc;
        const li = rcToIndex(lr, lc);
        if (li === null || workingBoard[li] !== 0) continue;

        // simulate capture
        const snapshot = workingBoard.slice();
        snapshot[currIdx] = 0;
        snapshot[ai] = 0;
        const willBeKing = promoted || reachesKingRow(owner, li);
        snapshot[li] = willBeKing ? (owner === 1 ? 2 : -2) : (owner === 1 ? 1 : -1);

        dfs(li, snapshot, path.concat([li]), captured.concat([ai]), promoted || willBeKing);
        foundAny = true;
      }
    }

    if (!foundAny && captured.length > 0) {
      // Check if this path is already covered by a longer jump sequence
      const isOptimal = results.every(existing => 
          existing.captures.length <= captured.length || (existing.captures.length === captured.length && existing.seq.join(',') >= path.join(','))
      );
      if (isOptimal) {
          results.push({ seq: path.slice(), captures: captured.slice() });
      }
    }
  }

  dfs(startIdx, board, [startIdx], [], kingAtStart);
  return results;
}

export function generateLegalMoves(state: State, player: 1 | -1): Move[] {
  const captures: Move[] = [];
  const normals: Move[] = [];
  for (let idx = 0; idx < 32; idx++) {
    const p = state.board[idx];
    if (pieceOwner(p) !== player) continue;
    const caps = findCapturesFrom(state.board, idx);
    if (caps.length > 0) captures.push(...caps);
    else normals.push(...findNormalMovesFrom(state.board, idx));
  }

  if (captures.length > 0) {
    const maxCap = Math.max(...captures.map(c => c.captures.length));
    return captures.filter(c => c.captures.length === maxCap);
  }
  return normals;
}
// -----------------------------------------------------------------

export function applyMove(state: State, move: Move): State {
  const s = cloneState(state);
  const b = s.board;
  if (move.seq.length < 2) throw new Error('Invalid move.seq');
  const from = move.seq[0];
  const to = move.seq[move.seq.length - 1];
  const piece = b[from];
  
  // Logic for updating noProgressCount
  const wasKinged = !isKing(piece) && reachesKingRow(pieceOwner(piece) as 1 | -1, to);
  if (move.captures.length > 0 || wasKinged) {
      s.noProgressCount = 0;
  } else {
      s.noProgressCount++;
  }
  
  // Apply changes to the board
  b[from] = 0;
  for (const ci of move.captures) b[ci] = 0;

  let placed: Piece = piece;
  if (wasKinged) {
    placed = piece > 0 ? 2 : -2;
  }
  b[to] = placed;

  s.currentPlayer = s.currentPlayer === 1 ? -1 : 1;
  s.moveNumber++;
  return s;
}

export function findEnforcedCapture(state: State, player: 1 | -1): Move | null {
  const captures: Move[] = [];
  for (let idx = 0; idx < 32; idx++) {
    const p = state.board[idx];
    if (pieceOwner(p) !== player) continue;
    const caps = findCapturesFrom(state.board, idx);
    captures.push(...caps);
  }
  if (captures.length === 0) return null;
  const maxCap = Math.max(...captures.map(c => c.captures.length));
  const longest = captures.filter(c => c.captures.length === maxCap);
  longest.sort((a, b) => a.seq.join(',').localeCompare(b.seq.join(',')));
  return longest[0];
}

export interface ValidationResult { 
  state: State; 
  suggestion?: Move; 
}

export function validateAndApplyMove(
  state: State,
  move: Move,
  player: 1 | -1,
): ValidationResult {
  if (state.currentPlayer !== player) throw new Error("Not your turn");

  const legalMoves = generateLegalMoves(state, player);
  const longestCapture = legalMoves.length > 0 && legalMoves[0].captures.length > 0 ? legalMoves[0] : null;

  // --- MANDATORY CAPTURE ENFORCEMENT ---
  if (longestCapture) {
    const isLegalCapture = legalMoves.some(m => arraysEqual(m.seq, move.seq) && arraysEqual(m.captures, move.captures));
    
    if (!isLegalCapture) {
      // Return suggestion for illegal non-capture move
      return { state: cloneState(state), suggestion: longestCapture }; 
    }
  } 
  // --- END MANDATORY CAPTURE ENFORCEMENT ---

  // Check if the submitted move is one of the generated legal moves
  const found = legalMoves.find(m => arraysEqual(m.seq, move.seq) && arraysEqual(m.captures, move.captures));
  if (!found) {
    throw new Error("Illegal move: Path or sequence is invalid"); 
  }

  // Apply legal move normally
  return { state: applyMove(state, move) };
}


export function isGameOver(state: State): { over: boolean; winner: 1 | -1 | 0 | 'Draw' } {
  // 1. Piece Count Check
  const counts: { [k: string]: number } = { '1': 0, '-1': 0 };
  for (const p of state.board) {
    if (p === 1 || p === 2) counts['1']++;
    if (p === -1 || p === -2) counts['-1']++;
  }
  if (counts['1'] === 0) return { over: true, winner: -1 };
  if (counts['-1'] === 0) return { over: true, winner: 1 };

  // 2. No Legal Moves Check
  if (generateLegalMoves(state, state.currentPlayer).length === 0) {
    // Current player has no moves, opponent wins
    return { over: true, winner: -state.currentPlayer as (1 | -1) };
  }
  
  // 3. Draw by 50-Move Rule (No capture or kinging)
  if (state.noProgressCount >= 100) { // 50 moves for each player (100 total half-moves)
      return { over: true, winner: 'Draw' };
  }
  
  return { over: false, winner: 0 };
}

export function prettyBoard(board: Piece[]): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    const cols: string[] = [];
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) cols.push(' .');
      else {
        const idx = rcToIndex(r, c);
        if (idx === null) cols.push('?');
        else {
          const p = board[idx];
          // Use two spaces for formatting consistency with single-digit and negative numbers
          const pStr = p === 0 ? ' _' : (p > 0 ? ` ${p}` : `${p}`);
          cols.push(pStr);
        }
      }
    }
    rows.push(cols.join(''));
  }
  return rows.join('\n');
}
