import Link from "next/link";
import { MoveLeft, HelpCircle } from "lucide-react";
import { TicTacToe } from "@/components/TicTacToe";

export default function NotFound() {
  return (
    <div className="h-screen w-full bg-[#050505] text-white flex flex-col md:flex-row items-center justify-center p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="z-10 flex flex-col items-center md:items-start max-w-lg text-center md:text-left space-y-8 md:mr-20">
        <div className="flex items-center justify-center md:justify-start gap-3 text-white/40 mb-2">
          <HelpCircle size={24} />
          <span className="font-mono text-sm tracking-wider">ERROR 404</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-bold tracking-tight bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">
          Page Not Found
        </h1>

        <p className="text-xl text-white/50 leading-relaxed max-w-sm">
          Astra doesn&apos;t have this page. While you are here, why not play a
          quick game?
        </p>

        <Link
          href="/"
          className="group flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-white/90 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95"
        >
          <MoveLeft
            size={20}
            className="group-hover:-translate-x-1 transition-transform"
          />
          <span>Return to Dashboard</span>
        </Link>
      </div>

      <div className="z-10 mt-10 md:mt-0">
        <TicTacToe />
      </div>
    </div>
  );
}
