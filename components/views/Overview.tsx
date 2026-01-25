export const OverviewView = () => (
  <div className="space-y-6">


    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-40 rounded-3xl bg-gradient-to-br from-red-500/10 to-purple-500/10 backdrop-blur-2xl border border-white/20 p-6 flex flex-col justify-between shadow-lg">
        <span className="text-white/60 text-sm font-medium uppercase tracking-wider">
          Total Balance
        </span>
        <span className="text-4xl font-bold">$12,450.00</span>
      </div>
      <div className="h-40 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/20 p-6 flex flex-col justify-between shadow-lg">
        <span className="text-white/60 text-sm font-medium uppercase tracking-wider">
          Profit
        </span>
        <span className="text-4xl font-bold text-green-400">+12%</span>
      </div>
    </div>

    <div className="rounded-3xl bg-black/10 backdrop-blur-2xl border border-white/20 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Activity</h3>
        <button className="text-xs bg-white/10 border border-white/10 px-3 py-1 rounded-full hover:bg-white/20 transition-colors">
          See All
        </button>
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center border border-white/5">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              </div>
              <div>
                <div className="font-medium">Transaction #{i}23</div>
                <div className="text-xs text-white/40">Today, 12:00 PM</div>
              </div>
            </div>
            <span className="font-semibold text-white/90">-$120.00</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);
