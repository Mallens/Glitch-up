import React, { useState, useEffect } from "react";
import type { Piece } from "../utils/checkerUtils";
import { rcToIndex, isDarkSquare } from "../utils/checkerUtils";
import io, { Socket } from "socket.io-client";
import "./Board.css";

type Props = {
  matchId: string | null;
  playerId: string;
  initialBoard?: Piece[] | null;
  currentPlayer?: 1 | -1 | null; 
  stake?: number;
};

type ServerUpdate = {
  board: Piece[];
  currentPlayer: 1 | -1;
};

// Use Vite environment variable or fallback
const SERVER = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";
const socket: Socket = io(SERVER);

const squareSize = 70;

export default function Board({ matchId, playerId, initialBoard, currentPlayer }: Props) {
  const [board, setBoard] = useState<Piece[] | null>(initialBoard ?? null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [turn, setTurn] = useState<1 | -1 | null>(currentPlayer ?? null);
  const [statusMsg, setStatusMsg] = useState<string>("Waiting for match...");

  // --- Socket listeners ---
  useEffect(() => {
    if (!matchId) return;

    socket.emit("join_match", { matchId, playerId, seat: "p1" }, (res: any) => {
      if (res.error) setStatusMsg(res.error);
      else setStatusMsg("Joined match. Waiting for opponent...");
    });

    socket.on("match_update", (data: ServerUpdate) => {
      setBoard(data.board);
      setTurn(data.currentPlayer);
      setSelectedIdx(null);
    });

    socket.on("match_end", (winner: string) => {
      if (winner === "Draw") setStatusMsg("Match ended in a draw.");
      else if (winner === playerId) setStatusMsg("You won!");
      else setStatusMsg("You lost!");
    });

    return () => {
      socket.off("match_update");
      socket.off("match_end");
    };
  }, [matchId, playerId]);

  // --- Click handlers ---
  const handleSelectPiece = (idx: number) => {
    if (!board || turn === null) return;
    const piece = board[idx];
    if (piece != null && (piece === 1 || piece === 2 || piece === -1 || piece === -2)) {
      const owner = piece > 0 ? 1 : -1;
      if (owner === turn) setSelectedIdx(idx);
    }
  };

  const handleAttemptMove = (fromIdx: number, toIdx: number) => {
    if (!matchId) return;
    socket.emit("submit_move", { matchId, playerId, fromIdx, toIdx }, (res: any) => {
      if (res.error) setStatusMsg(res.error);
      else setStatusMsg("Move submitted.");
    });
    setSelectedIdx(null);
  };

  if (!board) return <div style={{ textAlign: "center", marginTop: 40 }}>{statusMsg}</div>;

  const rows = [];
  for (let r = 0; r < 8; r++) {
    const cols = [];
    for (let c = 0; c < 8; c++) {
      const dark = isDarkSquare(r, c);
      const idx = rcToIndex(r, c);
      const piece = idx !== null ? board[idx] : null;
      const isSelected = idx !== null && selectedIdx === idx;

      const onClick = () => {
        if (idx === null) return;
        if (piece != null && piece !== 0) handleSelectPiece(idx);
        else if (selectedIdx !== null) handleAttemptMove(selectedIdx, idx);
      };

      cols.push(
        <div
          key={`r${r}c${c}`}
          className={`square ${dark ? "dark" : "light"} ${isSelected ? "selected" : ""}`}
          onClick={onClick}
          style={{ width: squareSize, height: squareSize }}
        >
          {piece != null && piece !== 0 && (
            <div
              className={`piece ${piece > 0 ? "player1" : "player2"} ${Math.abs(piece) === 2 ? "king" : ""}`}
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
        <strong>Match:</strong> {matchId ?? "—"} | <strong>Turn:</strong> {turn === 1 ? "Player1" : turn === -1 ? "Player2" : "—"}
      </div>
      <div className="board-wrapper">{rows}</div>
      <div className="status-msg">{statusMsg}</div>
    </div>
  );
}
