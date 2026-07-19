"use client";

import React, { useState, useEffect } from "react";
import { RotateCcw, Home } from "lucide-react";
import Link from "next/link";

type Player = "X" | "O" | null;

export const TicTacToe = () => {
  const [board, setBoard] = useState<Player[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState<Player | "Draw">(null);

  const checkWinner = (squares: Player[]) => {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (const [a, b, c] of lines) {
      if (
        squares[a] &&
        squares[a] === squares[b] &&
        squares[a] === squares[c]
      ) {
        return squares[a];
      }
    }
    return squares.every((square) => square !== null) ? "Draw" : null;
  };

  const handleClick = (index: number) => {
    if (board[index] || winner) return;

    const newBoard = [...board];
    newBoard[index] = isXNext ? "X" : "O";
    setBoard(newBoard);

    const gameWinner = checkWinner(newBoard);
    if (gameWinner) {
      setWinner(gameWinner);
    } else {
      setIsXNext(!isXNext);
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setWinner(null);
  };

  // Minimax AI for 'O' (Computer) - Optional, but keeps it simple for now if it's 2 player or basic random default.
  // For this request, I'll keep it as 2-player hotseat or basic random AI if preferred,
  // but "X and O game" usually implies 2 players or play against bot.
  // Let's make it Play vs Computer (Random/Basic) for immediate engaging fun on a 404 page.

  useEffect(() => {
    if (!isXNext && !winner) {
      // Simple AI delay
      const timer = setTimeout(() => {
        const availableMoves = board
          .map((val, idx) => (val === null ? idx : null))
          .filter((val) => val !== null) as number[];

        if (availableMoves.length > 0) {
          const randomMove =
            availableMoves[Math.floor(Math.random() * availableMoves.length)];
          const newBoard = [...board];
          newBoard[randomMove] = "O";
          setBoard(newBoard);

          const gameWinner = checkWinner(newBoard);
          if (gameWinner) {
            setWinner(gameWinner);
          } else {
            setIsXNext(true);
          }
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isXNext, winner, board]);

  return (
    <div className="flex flex-col items-center gap-6 p-6 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md relative overflow-hidden min-w-[300px]">
      {/* Winner Overlay */}
      {winner && (
        <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300 rounded-3xl">
          <h3 className="text-3xl font-bold text-white mb-2">
            {winner === "Draw"
              ? "It's a Draw!"
              : `${winner === "X" ? "You" : "Astra"} Won!`}
          </h3>
          <div className="flex gap-3 mt-4">
            <button
              onClick={resetGame}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors text-sm font-medium shadow-lg shadow-blue-500/20"
            >
              <RotateCcw size={16} />
              Play Again
            </button>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-sm font-medium"
            >
              <Home size={16} />
              Home
            </Link>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between w-full mb-2">
        <h3 className="text-xl font-bold text-white">Tic Tac Toe</h3>
        <div className="text-sm text-white/60">
          Turn: {isXNext ? "You (X)" : "Astra (O)"}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {board.map((cell, index) => (
          <button
            key={index}
            onClick={() => isXNext && handleClick(index)}
            disabled={!!cell || !!winner || !isXNext}
            className={`w-20 h-20 rounded-xl text-3xl font-bold flex items-center justify-center transition-all ${
              cell === "X"
                ? "bg-blue-500/20 text-blue-400 border-2 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                : cell === "O"
                  ? "bg-purple-500/20 text-purple-400 border-2 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                  : "bg-white/5 hover:bg-white/10 border border-white/10"
            }`}
          >
            {cell}
          </button>
        ))}
      </div>

      {!winner && (
        <button
          onClick={resetGame}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs font-medium"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      )}
    </div>
  );
};
