import { useState, useEffect, useMemo } from "react";
import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import {
  Wallet,
  Activity,
  Notebook,
  Target,
  CheckSquare,
  ArrowRight,
  Clock,
} from "lucide-react";
import {
  fetchUserBalances,
  fetchDeals,
  UserBalance,
  Deal,
} from "@/utils/forex-service";
import { DataTable, Column } from "@/components/ui/data-table";
import { useCurrency } from "../../hooks/useCurrency";
import { useNotes } from "../../hooks/useNotes";
import { useUser } from "@/context/UserContext";
import { Goal, subscribeToGoals } from "@/utils/goals-service";
import {
  Task,
  subscribeToBoards,
  subscribeToTasks,
} from "@/utils/kanban-service";

export const OverviewView = () => {
  // Existing State
  const [userBalances, setUserBalances] = useState<UserBalance[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activeAccount, setActiveAccount] = useState<UserBalance | undefined>(
    undefined,
  );
  const { currencySymbol, exchangeRate, formatCurrency } = useCurrency();

  // New Widget State
  const { user } = useUser();
  const { notes } = useNotes();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingWidgets, setLoadingWidgets] = useState(true);

  // Existing Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      const balanceData = await fetchUserBalances();
      setUserBalances(balanceData);

      const dealsData = await fetchDeals();
      setDeals(dealsData);
    };

    fetchData(); // Initial fetch

    // Polling every 5 seconds
    const intervalId = setInterval(fetchData, 5000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (userBalances.length > 0 && !activeAccount) {
      setActiveAccount(userBalances[0]);
    }
  }, [userBalances, activeAccount]);

  // New Widget Data Fetching
  useEffect(() => {
    if (!user?.id) return;

    // Fetch Goals
    const unsubscribeGoals = subscribeToGoals(user.id, (data) => {
      setGoals(data);
    });

    // Fetch Tasks (First Board)
    let unsubscribeTasks: () => void = () => {};
    const unsubscribeBoards = subscribeToBoards(user.id, (boards) => {
      if (boards.length > 0) {
        unsubscribeTasks = subscribeToTasks(boards[0].id, (data) => {
          setTasks(data);
        });
      }
    });

    setLoadingWidgets(false);

    return () => {
      unsubscribeGoals();
      unsubscribeBoards();
      unsubscribeTasks();
    };
  }, [user]);

  // Calculate Wins/Losses
  const wins = deals.filter((d) => d.profit_usd > 0).length;
  const losses = deals.filter((d) => d.profit_usd <= 0).length;

  const dealColumns = useMemo<Column<Deal>[]>(
    () => [
      {
        key: "time",
        header: "Time",
        render: (deal) => (
          <div className="text-xs text-white/60">
            {new Date(deal.time).toLocaleString()}
          </div>
        ),
        sortable: true,
      },
      {
        key: "ticket",
        header: "Ticket",
        render: (deal) => (
          <div className="font-mono text-xs text-white/40">#{deal.ticket}</div>
        ),
        sortable: true,
      },
      {
        key: "symbol",
        header: "Symbol",
        render: (deal) => (
          <div className="font-bold text-white">{deal.symbol}</div>
        ),
        sortable: true,
      },
      {
        key: "side",
        header: "Side",
        render: (deal) => (
          <span
            className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${deal.side === "BUY" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
          >
            {deal.side}
          </span>
        ),
        sortable: true,
      },
      {
        key: "volume",
        header: "Volume",
        render: (deal) => <div className="text-white/80">{deal.volume}</div>,
        sortable: true,
      },
      {
        key: "price",
        header: "Price",
        render: (deal) => (
          <div className="text-white/60 text-xs">{deal.price}</div>
        ),
        sortable: true,
      },
      {
        key: "profit_usd",
        header: `Profit (${currencySymbol})`,
        render: (deal) => {
          const profit = (deal.profit_usd ?? 0) * exchangeRate;
          return (
            <div
              className={`font-bold ${profit > 0 ? "text-green-400" : "text-red-400"}`}
            >
              {profit > 0 ? "+" : ""}
              {currencySymbol}
              {Math.abs(profit).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          );
        },
        sortable: true,
      },
    ],
    [currencySymbol, exchangeRate],
  );

  // Widget Data Helpers
  const recentNotes = notes.slice(0, 3);
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 3);
  const pendingTasks = tasks
    .filter((t) => t.column !== "Done" && t.column !== "Finished")
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MarketStatsCard
          title="Total Balance"
          value={
            activeAccount
              ? formatCurrency(activeAccount.balance ?? 0)
              : `${currencySymbol}0.00`
          }
          icon={Wallet}
          trend={{ value: "+0.0%", isPositive: true, label: "today" }}
          gradient="from-emerald-900/40 to-emerald-600/10"
        />
        <MarketStatsCard
          title="Equity"
          value={
            activeAccount
              ? formatCurrency(activeAccount.equity ?? 0)
              : `${currencySymbol}0.00`
          }
          icon={Activity}
          gradient="from-blue-900/40 to-blue-600/10"
          subContent={
            <div className="flex items-center gap-2 mt-1">
              <div className="flex items-center gap-1 text-xs text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>{" "}
                {wins}
                Wins
              </div>
              <div className="flex items-center gap-1 text-xs text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>{" "}
                {losses}
                Loss
              </div>
            </div>
          }
        />
      </div>

      {/* Quick Glance Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Notes Widget */}
        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 p-5 flex flex-col h-64 shadow-lg group hover:bg-white/10 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white/70">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                <Notebook size={16} />
              </div>
              <span className="text-sm font-medium uppercase tracking-wider">
                Latest Notes
              </span>
            </div>
            <ArrowRight
              size={16}
              className="text-white/30 group-hover:text-white transition-colors"
            />
          </div>

          <div className="flex-1 overflow-hidden space-y-3">
            {recentNotes.length > 0 ? (
              recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <h4 className="text-sm font-medium text-white truncate">
                    {note.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-white/40">
                    <Clock size={10} />
                    <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/20 text-xs">
                <span>No notes found</span>
              </div>
            )}
          </div>
        </div>

        {/* Goals Widget */}
        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 p-5 flex flex-col h-64 shadow-lg group hover:bg-white/10 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white/70">
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                <Target size={16} />
              </div>
              <span className="text-sm font-medium uppercase tracking-wider">
                Active Goals
              </span>
            </div>
            <ArrowRight
              size={16}
              className="text-white/30 group-hover:text-white transition-colors"
            />
          </div>

          <div className="flex-1 overflow-hidden space-y-3">
            {activeGoals.length > 0 ? (
              activeGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">
                      {goal.title}
                    </h4>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded uppercase mt-1 inline-block ${
                        goal.priority === "high"
                          ? "bg-red-500/20 text-red-300"
                          : goal.priority === "medium"
                            ? "bg-orange-500/20 text-orange-300"
                            : "bg-green-500/20 text-green-300"
                      }`}
                    >
                      {goal.priority}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/20 text-xs">
                <span>No active goals</span>
              </div>
            )}
          </div>
        </div>

        {/* Tasks Widget */}
        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 p-5 flex flex-col h-64 shadow-lg group hover:bg-white/10 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-white/70">
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <CheckSquare size={16} />
              </div>
              <span className="text-sm font-medium uppercase tracking-wider">
                My Tasks
              </span>
            </div>
            <ArrowRight
              size={16}
              className="text-white/30 group-hover:text-white transition-colors"
            />
          </div>

          <div className="flex-1 overflow-hidden space-y-3">
            {pendingTasks.length > 0 ? (
              pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <h4 className="text-sm font-medium text-white truncate decoration-white/50">
                    {task.content}
                  </h4>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                      {task.column}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/20 text-xs text-center px-4">
                <span>No pending tasks in default board</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-black/10 backdrop-blur-2xl border border-white/20 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <div className="mb-4 px-2">
          <h3 className="text-lg font-semibold">Activity</h3>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
          <DataTable columns={dealColumns} data={deals} perPage={5} />
        </div>
      </div>
    </div>
  );
};
