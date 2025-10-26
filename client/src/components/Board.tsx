import React from "react";
import type { Piece } from "../utils/checkerUtils";
import { rcToIndex, isDarkSquare } from "../utils/checkerUtils";
import "./Board.css";

type Props = {
  matchId: string | null;
  stateBoard: Piece[] | null;
  currentPlayer: 1 | -1 | null;
  selectedIdx: number | null;
  onSelectPiece: (idx: number) => void;
  onAttemptMove: (fromIdx: number, toIdx: number) => void;
};

const squareSize = 70; // px for desktop (mobile handled via CSS)

export default function Board({
  matchId,
  stateBoard,
  currentPlayer: _currentPlayer, // silence unused warning
  selectedIdx,
  onSelectPiece,
  onAttemptMove,
}: Props) {
  if (!stateBoard) {
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        Waiting for match data...
      </div>
    );
  }

  const rows = [];

  for (let r = 0; r < 8; r++) {
    const cols = [];
    for (let c = 0; c < 8; c++) {
      const dark = isDarkSquare(r, c);
      const idx = rcToIndex(r, c);
      const piece =
        idx !== null && stateBoard && stateBoard[idx] !== undefined
          ? stateBoard[idx]
          : null;
      const isSelected = idx !== null && selectedIdx === idx;

      const handleClick = () => {
        if (idx === null) return;
        if (piece !== null && piece !== 0) onSelectPiece(idx);
        else if (selectedIdx !== null) onAttemptMove(selectedIdx, idx);
      };

      cols.push(
        <div
          key={`r${r}c${c}`}
          onClick={handleClick}
          className={`square ${dark ? "dark" : "light"} ${
            isSelected ? "selected" : ""
          }`}
          style={{
            width: squareSize,
            height: squareSize,
          }}
        >
          {piece !== null && piece !== 0 && (
            <div
              className={`piece ${piece > 0 ? "player1" : "player2"} ${
                Math.abs(piece) === 2 ? "king" : ""
              }`}
            />
          )}
        </div>
      );
    }
    rows.push(
      <div key={r} className="row">
        {cols}
      </div>
    );
  }

  return (
    <div className="board-container">
      <div className="match-info">
        <strong>Match:</strong> {matchId ?? "—"}
      </div>
      <div className="board-wrapper">{rows}</div>
    </div>
  );
}
