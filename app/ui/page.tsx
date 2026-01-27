"use client";

import React from "react";
import { ActiveSymbolCard } from "@/components/ui/cards/ActiveSymbolCard";
import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import { GreetCard } from "@/components/GreetCard";
import { DataTable, Column } from "@/components/ui/data-table";
import { Wallet, TrendingUp, Activity, CheckCircle2, MoreVertical, Flag, Calendar, Target, CheckCircle, Share2, Trash2, Edit2, User, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

// Helper to display code
const CodeBlock = ({ code }: { code: string }) => (
  <div className="relative group">
    <pre className="bg-black/80 p-4 rounded-lg overflow-x-auto text-xs text-white/70 font-mono border border-white/10 mt-4 leading-relaxed">
      <code>{code}</code>
    </pre>
  </div>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
  code: string;
  description?: string;
}

const Section = ({ title, children, code, description }: SectionProps) => (
  <div className="mb-12 border-b border-white/10 pb-12 last:border-0">
    <h2 className="text-2xl font-bold mb-4 text-white font-mono">{title}</h2>
    {description && <p className="text-white/60 mb-6 font-mono text-sm">{description}</p>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
      <div className="bg-white/5 p-8 rounded-2xl border border-white/10 flex flex-col gap-4">
        {children}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-2 font-mono">Usage & Props</h3>
        <CodeBlock code={code} />
      </div>
    </div>
  </div>
);

// --- MOCK COMPONENTS FOR DISPLAY ---

// Mock Task Card (based on TasksView.tsx)
const TaskCardMock = ({ title, tag, priority }: { title: string, tag: string, priority: "High" | "Medium" | "Low" }) => {
    const priorityColor = 
        priority === 'High' ? 'text-red-400 bg-red-400/10 border-red-400/20' : 
        priority === 'Medium' ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' : 
        'text-green-400 bg-green-400/10 border-green-400/20';

    return (
        <div className="group relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 p-4 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:shadow-black/20">
            <div className="flex justify-between items-start mb-3">
                <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${priorityColor}`}>
                    {priority}
                </div>
                <button className="text-white/20 hover:text-white transition-colors">
                    <MoreVertical size={16} />
                </button>
            </div>
            <h4 className="text-white font-medium text-sm leading-relaxed mb-3">{title}</h4>
            <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                <div className="flex items-center gap-2 text-[10px] text-white/40 font-medium bg-white/5 px-2 py-1 rounded-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                    {tag}
                </div>
                {priority === "High" && <Flag size={12} className="text-red-400" />}
            </div>
        </div>
    )
}

// Mock Goal Card (based on GoalsView.tsx)
const GoalCardMock = ({ title, progress, status }: { title: string, progress: number, status: "active" | "completed" }) => {
    return (
        <div className={cn(
            "group relative p-5 rounded-2xl border transition-all duration-300",
            status === 'completed' 
                ? "bg-green-500/5 border-green-500/20 opacity-70" 
                : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10"
        )}>
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-start gap-3">
                    <button className={cn(
                        "mt-1 w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                        status === 'completed'
                            ? "bg-green-500 border-green-500 text-black"
                            : "border-white/20 hover:border-white/60 text-transparent"
                    )}>
                        <CheckCircle size={12} strokeWidth={3} />
                    </button>
                    <div>
                        <h3 className={cn("font-medium text-lg leading-tight transition-all", status === 'completed' && "line-through text-white/50")}>
                            {title}
                        </h3>
                        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
                            <span className="flex items-center gap-1"><Calendar size={12} /> Dec 31, 2024</span>
                            <span className="w-1 h-1 rounded-full bg-white/20"></span>
                            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">High Priority</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"><Edit2 size={14}/></button>
                    <button className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"><Share2 size={14}/></button>
                </div>
            </div>
            {status === 'active' && (
                <div className="mt-4">
                    <div className="flex justify-between text-xs text-white/40 mb-2 font-medium">
                        <span>Progress</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Mock Chat Message (based on ChatView.tsx)
const ChatMessageMock = ({ text, isOwn }: { text: string, isOwn: boolean }) => (
    <div className={`flex w-full mb-4 ${isOwn ? "justify-end" : "justify-start"}`}>
        <div className={`flex max-w-[80%] md:max-w-[70%] gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
            <div className="flex-none">
                {isOwn ? (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold ring-2 ring-white/10">ME</div>
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-black ring-2 ring-white/10">JD</div>
                )}
            </div>
            <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-bold text-white/70">{isOwn ? "You" : "John Doe"}</span>
                    <span className="text-[10px] text-white/30">10:42 AM</span>
                </div>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isOwn 
                        ? "bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-900/20" 
                        : "bg-white/10 text-white rounded-tl-none border border-white/5"
                }`}>
                    {text}
                </div>
            </div>
        </div>
    </div>
)

// Mock Data for Table
interface MarketMock {
    id: string;
    pair: string;
    price: number;
    change: number;
    status: "Active" | "Closed";
}

const tableData: MarketMock[] = [
    { id: "1", pair: "EUR/USD", price: 1.0924, change: 0.45, status: "Active" },
    { id: "2", pair: "GBP/USD", price: 1.2634, change: -0.12, status: "Active" },
    { id: "3", pair: "USD/JPY", price: 148.12, change: 0.89, status: "Active" },
];

const tableColumns: Column<MarketMock>[] = [
    {
        key: "pair",
        header: "Symbol",
        sortable: true,
        render: (item) => <span className="font-bold text-blue-400">{item.pair}</span>
    },
    {
        key: "price",
        header: "Price",
        sortable: true,
        render: (item) => <span className="font-mono">{item.price}</span>
    },
    {
        key: "change",
        header: "24h Change",
        sortable: true,
        render: (item) => (
            <span className={item.change >= 0 ? "text-green-400" : "text-red-400"}>
                {item.change > 0 && "+"}{item.change}%
            </span>
        )
    },
    {
        key: "status",
        header: "Status",
        render: (item) => (
            <span className="px-2 py-1 rounded bg-white/10 text-xs border border-white/10">
                {item.status}
            </span>
        )
    }
];

export default function UiPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-12 font-mono">
        <header className="mb-12 border-b border-white/10 pb-8">
            <h1 className="text-4xl font-bold mb-4">UI Component Library</h1>
            <p className="text-white/50">Displaying all card components, data tables, and feature views used in the application. Access this page via <span className="text-white bg-white/10 px-2 py-1 rounded">/ui</span> route.</p>
        </header>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* --- CARDS SECTION --- */}
        <h2 className="text-xl font-bold text-blue-400 uppercase tracking-widest mb-6 pt-6">Core Cards</h2>
        
        <Section
          title="GreetCard"
          description="Displays a personalized greeting based on time of day, user info from context, and a random inspirational quote. It includes animations and weather icons."
          code={`import { GreetCard } from "@/components/GreetCard";

// Requires UserProvider context for full functionality
<GreetCard 
  pageTitle="Dashboard" 
  caption="Welcome back to your workspace" 
/>`}
        >
          <GreetCard pageTitle="UI Library" caption="Welcome back to your workspace" />
        </Section>

        <Section
          title="MarketStatsCard"
          description="A versatile card for displaying statistical data. It supports values, titles, icons, trend indicators, and custom gradients."
          code={`import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import { Wallet, Activity } from "lucide-react";

// Basic usage with icon
<MarketStatsCard
  title="Total Balance"
  value="$12,450.00"
  icon={Wallet}
/>

// Advanced usage with Trend and Custom Gradient
<MarketStatsCard
  title="Equity"
  value="$14,200.50"
  icon={Activity}
  gradient="from-blue-900/40 to-blue-600/10"
  trend={{ 
    value: "+2.5%", 
    isPositive: true, 
    label: "this week" 
  }}
/>`}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MarketStatsCard
                    title="Total Balance"
                    value="$12,450.00"
                    icon={Wallet}
                />
                <MarketStatsCard
                    title="Equity"
                    value="$14,200.50"
                    icon={Activity}
                    gradient="from-blue-900/40 to-blue-600/10"
                    trend={{ value: "+2.5%", isPositive: true, label: "this week" }}
                />
            </div>
        </Section>

        <Section
          title="ActiveSymbolCard"
          description="Specialized card for displaying trading pairs. It automatically styles 'XAU' (Gold) and 'XAG' (Silver) pairs, and provides defaults for others. Displays trade counts and ticker symbols."
          code={`import { ActiveSymbolCard } from "@/components/ui/cards/ActiveSymbolCard";

// Standard Pair (EURUSD)
<ActiveSymbolCard
  data={{
    pair: "EURUSD",
    code: "€", 
    name: "Euro / US Dollar",
    trades: 12
  }}
/>

// Gold Pair (Auto-styled based on 'XAU')
<ActiveSymbolCard
  data={{
    pair: "XAUUSD"
  }}
/>`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActiveSymbolCard
                data={{
                pair: "EURUSD",
                code: "€",
                name: "Euro / US Dollar",
                trades: 12,
                }}
            />
             <ActiveSymbolCard
                data={{
                pair: "XAUUSD",
                trades: 5,
                }}
            />
          </div>
        </Section>

        {/* --- DATA SECTION --- */}
        <h2 className="text-xl font-bold text-blue-400 uppercase tracking-widest mb-6 pt-12 border-t border-white/10">Data & Tables</h2>

        <Section
            title="Data Table"
            description="Reusable table component with sorting, filtering, and pagination support. Used heavily for market data display."
            code={`import { DataTable, Column } from "@/components/ui/data-table";

const columns: Column<MyData>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "value", header: "Value" }
];

<DataTable 
  data={myData} 
  columns={columns} 
  searchKeys={["name"]} 
/>`}
        >
            <DataTable 
                data={tableData} 
                columns={tableColumns} 
                searchKeys={["pair"]}
            />
        </Section>

        {/* --- VIEW COMPONENTS SECTION --- */}
        <h2 className="text-xl font-bold text-blue-400 uppercase tracking-widest mb-6 pt-12 border-t border-white/10">Feature Components</h2>

        <Section
            title="Task Items (Kanban)"
            description="Visual representation of task items used in the Project Board/Kanban view. Features priority indicators, tags, and action menus. (Component logic embedded in TasksView)"
            code={`// Visual Structure (from TasksView.tsx)
<div className="bg-white/5 border border-white/5 p-4 rounded-xl ...">
  <div className="flex justify-between...">
    <div className="text-red-400 bg-red-400/10 ...">HIGH</div>
  </div>
  <h4>Task Title</h4>
  <div className="flex items-center...">
     <span>Frontend</span>
  </div>
</div>`}
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TaskCardMock title="Implement Auth Flow" tag="Backend" priority="High" />
                <TaskCardMock title="Design System Updates" tag="Design" priority="Medium" />
            </div>
        </Section>

        <Section
            title="Goal Items"
            description="Interactive goal tracking cards with progress bars, completion toggles and metadata. Supports active and completed states."
            code={`// Visual Structure (from GoalsView.tsx)
<div className="p-5 rounded-2xl border bg-white/5 ...">
  <div className="flex justify-between...">
     <CheckCircle size={12} />
     <h3>Maximize Revenue</h3>
  </div>
  <div className="progress-bar-container">
     <div style={{ width: '75%' }} ... />
  </div>
</div>`}
        >
            <div className="flex flex-col gap-4">
                <GoalCardMock title="Complete Q1 Roadmap" progress={75} status="active" />
                <GoalCardMock title="Update Documentation" progress={100} status="completed" />
            </div>
        </Section>

        <Section
            title="Chat Messages"
            description="Message bubbles for the chat interface, handling sender/receiver styling states and user differentiation."
            code={`// Visual Structure (from ChatView.tsx)
<div className={isOwn ? "justify-end" : "justify-start"}>
  <div className="bubble bg-blue-600 ...">
     Message content
  </div>
</div>`}
        >
            <div className="flex flex-col gap-2 p-4 bg-white/5 rounded-xl border border-white/5">
                <ChatMessageMock text="Hey team, is the new build ready?" isOwn={true} />
                <ChatMessageMock text="Yes, just deployed it to staging." isOwn={false} />
                <ChatMessageMock text="Great work! I'll check it out." isOwn={true} />
            </div>
        </Section>

      </div>
    </div>
  );
}
