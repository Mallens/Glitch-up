// server/src/index.ts — UPDATED & TESTED VERSION
import express from "express";
import { createServer, Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

// FIX: Split type imports (PlayerId, Match) from value import (MatchManager)
import { MatchManager } from "./match_manager.ts";
import type { PlayerId, Match } from "./match_manager.ts"; 

import type { Move } from "./logic/checkers.ts"; //
import { Wallet } from "./wallet.ts"; // 

// --- Initialize Wallet + Match Manager ---
const wallet = new Wallet();
const matchManager = new MatchManager(wallet);

// --- Express + Socket.io setup ---
const app = express();
app.use(express.json());
const httpServer: HttpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// --- HTTP health check route ---
app.get("/", (_req, res) => {
  res.send("GlitchUp Checkers Server is Running.");
});

// --- ADMIN / SMS DEPOSIT ENDPOINT ---
app.post("/sms", async (req, res) => {
  const { playerId, amount, transactionId, secretHeader } = req.body;

  if (secretHeader !== process.env.SMS_SECRET_KEY) {
    return res.status(401).send({ error: "Unauthorized SMS source." });
  }
  if (!playerId || typeof amount !== "number" || !transactionId) {
    return res.status(400).send({ error: "Missing required deposit parameters." });
  }

  try {
    await wallet.deposit(playerId, amount);
    console.log(`[DEPOSIT SUCCESS] ${playerId} credited ${amount} (TxID: ${transactionId})`);
    res.status(200).send({ success: true, newBalance: await wallet.getBalance(playerId) });
  } catch (e) {
    console.error("Deposit Error:", e);
    res.status(500).send({ error: "Internal server error during deposit." });
  }
});

// =========================
// 🔥 SOCKET.IO REALTIME LOBBY
// =========================
let waitingPlayer: { id: string; playerId: PlayerId } | null = null;

io.on("connection", (socket: Socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  // --- CREATE ROOM ---
  socket.on("create_room", (code: string) => {
    socket.join(code);
    io.to(socket.id).emit("room_created", code);
    console.log(`[ROOM] ${socket.id} created room ${code}`);
  });

  // --- JOIN ROOM ---
  socket.on("join_room", (code: string) => {
    const room = io.sockets.adapter.rooms.get(code);
    if (room && room.size === 1) {
      socket.join(code);
      io.to(socket.id).emit("joined_room", code);
      io.to(code).emit("match_ready", code);
      console.log(`[ROOM] ${socket.id} joined room ${code}`);
    } else {
      io.to(socket.id).emit("error_message", "Room not found or full.");
    }
  });

  // --- QUICK MATCH ---
  socket.on("quick_match", async (playerId: PlayerId) => {
    if (!waitingPlayer) {
      waitingPlayer = { id: socket.id, playerId };
      io.to(socket.id).emit("status", "Waiting for opponent...");
      console.log(`[QUEUE] ${socket.id} (${playerId}) waiting for quick match...`);
    } else {
      const matchCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const playerA = waitingPlayer;
      const playerB = { id: socket.id, playerId };

      waitingPlayer = null;

      io.sockets.sockets.get(playerA.id)?.join(matchCode);
      io.sockets.sockets.get(playerB.id)?.join(matchCode);

      console.log(
        `[QUEUE] Match found between ${playerA.id} (${playerA.playerId}) and ${playerB.id} (${playerB.playerId}) -> ${matchCode}`
      );

      try {
        // Automatically start match
        const match = matchManager.createMatch(matchCode, 20);
        await matchManager.joinMatch(matchCode, "p1", playerA.playerId);
        await matchManager.joinMatch(matchCode, "p2", playerB.playerId);

        io.to(matchCode).emit("match_found", {
          matchId: matchCode,
          players: { p1: playerA.playerId, p2: playerB.playerId },
          message: "Match ready!",
        });

        io.to(matchCode).emit("match_update", matchManager.getMatch(matchCode));
      } catch (error: any) {
        // If wallet deduction failed, inform players
        io.to(playerA.id).emit("error", { message: error.message });
        io.to(playerB.id).emit("error", { message: error.message });
        console.error(`[QUEUE ERROR] Failed to start match ${matchCode}: ${error.message}`);
      }
    }
  });

  // --- JOIN MATCH (Manual / Private) ---
  socket.on("join_match", async (data: { matchId: string; playerId: PlayerId; seat: "p1" | "p2" }) => {
    const { matchId, playerId, seat } = data;

    try {
      let match: Match | undefined = matchManager.getMatch(matchId);
      if (!match) match = matchManager.createMatch(matchId, 20);

      const updatedMatch = await matchManager.joinMatch(matchId, seat, playerId);
      socket.join(matchId);

      console.log(`👤 ${playerId} joined match ${matchId} as ${seat}`);
      io.to(matchId).emit("match_update", updatedMatch);
    } catch (error: any) {
      socket.emit("error", { message: error.message });
    }
  });

  // --- MAKE MOVE ---
  socket.on(
    "make_move",
    async (data: { matchId: string; playerId: PlayerId; playerSide: 1 | -1; move: Move }) => {
      const { matchId, playerId, playerSide, move } = data;

      try {
        const result = await matchManager.submitMove(matchId, playerId, playerSide, move);

        if (result.success) {
          const updatedMatch = matchManager.getMatch(matchId);
          io.to(matchId).emit("match_update", updatedMatch);

          if (result.matchEnd) {
            io.to(matchId).emit("game_over", {
              winner: result.matchEnd.winner,
              finalState: updatedMatch?.state,
              pot: updatedMatch?.pot,
            });
          }
        } else {
          socket.emit("move_error", { error: result.error, suggestion: result.suggestion });
        }
      } catch (error) {
        console.error("❌ Move processing error:", error);
        socket.emit("error", { message: "Server error processing move." });
      }
    }
  );

  // --- DISCONNECT ---
  socket.on("disconnect", () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
    if (waitingPlayer?.id === socket.id) waitingPlayer = null;
  });
});

// --- Start server ---
httpServer.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
