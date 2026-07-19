import { motion } from "framer-motion";
import { Bot, Zap, TrendingUp, Shield, Activity } from "lucide-react";

interface BotData {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive" | "maintenance";
  performance: string;
  icon: any;
  color: string;
}

const bots: BotData[] = [
  {
    id: "1",
    name: "Alpha Scout",
    description: "High-frequency scalping bot for major forex pairs",
    status: "active",
    performance: "+12.5%",
    icon: Zap,
    color: "from-yellow-400 to-orange-500",
  },
  {
    id: "2",
    name: "Trend Master",
    description: "Trend following algorithm with dynamic stop-loss",
    status: "active",
    performance: "+8.2%",
    icon: TrendingUp,
    color: "from-blue-400 to-indigo-500",
  },
  {
    id: "3",
    name: "SafeGuard AI",
    description: "Low-risk hedging strategy for volatile markets",
    status: "inactive",
    performance: "+3.1%",
    icon: Shield,
    color: "from-green-400 to-emerald-500",
  },
  {
    id: "4",
    name: "Volatility Hunter",
    description: "Capitalizes on sudden price movements during news events",
    status: "maintenance",
    performance: "-1.2%",
    icon: Activity,
    color: "from-red-400 to-pink-500",
  },
];

export function BotsView() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
      {bots.map((bot, index) => (
        <motion.div
          key={bot.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-all duration-300"
        >
          {/* Background Gradient */}
          <div
            className={`absolute inset-0 bg-gradient-to-br ${bot.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
          />

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div
                className={`p-3 rounded-2xl bg-gradient-to-br ${bot.color} bg-opacity-20 text-white shadow-lg`}
              >
                <bot.icon size={24} />
              </div>
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  bot.status === "active"
                    ? "bg-green-500/20 text-green-400 border-green-500/20"
                    : bot.status === "inactive"
                      ? "bg-white/10 text-white/40 border-white/10"
                      : "bg-yellow-500/20 text-yellow-400 border-yellow-500/20"
                }`}
              >
                {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-1">{bot.name}</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                {bot.description}
              </p>
            </div>

            <div className="pt-4 mt-auto border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-white/40 font-medium tracking-wider uppercase">
                Performance
              </span>
              <span
                className={`text-lg font-bold ${
                  bot.performance.startsWith("+")
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {bot.performance}
              </span>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Add New Bot Card */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: bots.length * 0.1 }}
        className="group relative flex flex-col items-center justify-center gap-4 bg-white/5 border border-white/10 border-dashed rounded-3xl p-6 hover:bg-white/10 transition-all duration-300 min-h-[200px]"
      >
        <div className="p-4 rounded-full bg-white/5 text-white/50 group-hover:scale-110 transition-transform duration-300">
          <Bot size={32} />
        </div>
        <span className="text-sm font-medium text-white/50 group-hover:text-white transition-colors">
          Connect New Bot
        </span>
      </motion.button>
    </div>
  );
}
