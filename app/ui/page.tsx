"use client";

import React from "react";
import { ActiveSymbolCard } from "@/components/ui/cards/ActiveSymbolCard";
import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import { GreetCard } from "@/components/GreetCard";
import { DataTable, Column } from "@/components/ui/data-table";
import { CryptoChart } from "@/components/market/CryptoChart";
import GradientPicker from "@/components/GradientPicker";
import {
  Wallet,
  TrendingUp,
  Activity,
  CheckCircle2,
  MoreVertical,
  Flag,
  Calendar,
  Target,
  CheckCircle,
  Share2,
  Trash2,
  Edit2,
  User,
  Play,
  Pencil,
  Plus,
  ArrowRight,
  Bitcoin,
  Layers,
  Sparkles,
  Bot,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

// Types for documentation
interface PropDef {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

const PropsTable = ({ props }: { props: PropDef[] }) => (
  <div className="mt-8 border rounded-xl border-white/10 overflow-hidden bg-black/20">
    <div className="bg-white/5 px-4 py-3 border-b border-white/10 font-bold text-sm text-white/80">
      Component Properties
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-white/5 text-white/60">
          <tr>
            <th className="px-4 py-3 font-medium w-1/4">Name</th>
            <th className="px-4 py-3 font-medium w-1/4">Type</th>
            <th className="px-4 py-3 font-medium w-1/2">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {props.map((prop) => (
            <tr key={prop.name} className="hover:bg-white/5 transition-colors">
              <td className="px-4 py-3 font-mono text-blue-400 align-top">
                {prop.name}
                {prop.required && (
                  <span className="text-red-400 ml-1" title="Required">
                    *
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-purple-400 align-top break-words">
                {prop.type}
              </td>
              <td className="px-4 py-3 text-white/70 align-top">
                <div className="mb-1">{prop.description}</div>
                {prop.default && (
                  <div className="text-white/30 text-[10px]">
                    Default:{" "}
                    <span className="font-mono bg-white/5 px-1 rounded">
                      {prop.default}
                    </span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

interface SectionProps {
  title: string;
  children: React.ReactNode;
  code: string;
  description?: string;
  props?: PropDef[];
  showHint?: boolean;
}

const Section = ({
  title,
  children,
  code,
  description,
  props,
  showHint = false,
}: SectionProps) => {
  const [isFlipped, setIsFlipped] = React.useState(false);

  return (
    <div className="mb-20 border-b border-white/10 pb-20 last:border-0 last:pb-0">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 md:gap-12 items-start">
        {/* Left Column: Interactive Component Card */}
        <div className="h-full min-h-[350px] md:min-h-[420px] w-full perspective-parent">
          <div
            className="relative w-full h-full cursor-pointer group"
            style={{ perspective: "1000px" }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div
              className="relative w-full h-full transition-all duration-700 ease-in-out"
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Front Face: Component Visual */}
              <div
                className="absolute inset-0 bg-white/5 p-4 md:p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center justify-center overflow-hidden"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="w-full h-full flex items-center justify-center overflow-y-auto custom-scrollbar p-2">
                  <div className="w-full">{children}</div>
                </div>

                <div className="mt-6 flex items-center gap-2 text-xs font-mono text-white/30 uppercase tracking-[0.2em] group-hover:text-white/60 transition-colors">
                  <ArrowRight size={12} className="animate-pulse" />
                  Click to view Types & Usage
                </div>
              </div>

              {/* Back Face: Code Usage */}
              <div
                className="absolute inset-0 bg-black p-0 rounded-3xl border border-white/20 shadow-2xl overflow-hidden flex flex-col"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex justify-between items-center shrink-0">
                  <span className="text-xs font-bold text-white/50 uppercase tracking-widest font-mono">
                    Usage Example
                  </span>
                  <div className="flex gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50"></div>
                  </div>
                </div>
                <div className="p-6 overflow-auto custom-scrollbar flex-1 bg-black/50">
                  <pre className="text-xs text-blue-300 font-mono leading-relaxed whitespace-pre-wrap">
                    <code>{code}</code>
                  </pre>
                </div>
                <div className="px-6 py-3 bg-white/5 border-t border-white/10 text-center text-xs text-white/20 uppercase tracking-wider font-mono hover:text-white/40 transition-colors shrink-0">
                  Click to return to Preview
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Documentation */}
        <div className="flex flex-col justify-center h-full">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white font-mono">
              {title}
            </h2>
            {description && (
              <p className="text-white/60 mb-8 font-light leading-relaxed text-sm md:text-lg">
                {description}
              </p>
            )}

            {props && <PropsTable props={props} />}

            {showHint && (
              <div className="mt-8 p-4 rounded-lg bg-blue-500/5 border border-blue-500/10 text-sm text-blue-200/60 flex gap-3 items-start">
                <div className="mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"></div>
                </div>
                <p>
                  Interact with the card on the left to invoke the 3D flip
                  animation and inspect the implementation code.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Mocks Definitions ---

const BotCardMock = ({
  name,
  status,
  performance,
  color,
}: {
  name: string;
  status: "active" | "inactive" | "maintenance";
  performance: string;
  color: string;
}) => {
  return (
    <div className="group relative overflow-hidden bg-white/5 border border-white/10 rounded-2xl p-5 w-full hover:bg-white/10 transition-all">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
      />
      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div
            className={`p-2 rounded-xl bg-gradient-to-br ${color} bg-opacity-20 text-white shadow-lg`}
          >
            <Bot size={20} />
          </div>
          <div
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              status === "active"
                ? "bg-green-500/20 text-green-400 border-green-500/20"
                : status === "inactive"
                  ? "bg-white/10 text-white/40 border-white/10"
                  : "bg-yellow-500/20 text-yellow-400 border-yellow-500/20"
            }`}
          >
            {status.toUpperCase()}
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white mb-1">{name}</h3>
          <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-2">
            <span className="text-xs text-white/40">Performance</span>
            <span
              className={`font-mono font-bold ${performance.startsWith("+") ? "text-green-400" : "text-red-400"}`}
            >
              {performance}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatMock = () => (
  <div className="w-full bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col h-[200px]">
    <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
          <User size={14} className="text-blue-400" />
        </div>
        <div className="bg-white/10 p-3 rounded-2xl rounded-tl-sm text-sm text-white/90">
          Analyze the current Bitcoin trend.
        </div>
      </div>
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
          <Sparkles size={14} className="text-purple-400" />
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 p-3 rounded-2xl rounded-tr-sm text-sm text-white/90">
          Bitcoin is currently showing strong momentum...
        </div>
      </div>
    </div>
    <div className="p-3 border-t border-white/10 bg-white/5">
      <div className="h-8 rounded-lg bg-black/20 border border-white/10 w-full animate-pulse"></div>
    </div>
  </div>
);

const TaskCardMock = ({
  title,
  tag,
  priority,
}: {
  title: string;
  tag: string;
  priority: "High" | "Medium" | "Low";
}) => {
  const priorityColor =
    priority === "High"
      ? "text-red-400 bg-red-400/10 border-red-400/20"
      : priority === "Medium"
        ? "text-orange-400 bg-orange-400/10 border-orange-400/20"
        : "text-green-400 bg-green-400/10 border-green-400/20";

  return (
    <div className="group relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 p-4 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:shadow-lg hover:shadow-black/20 w-full">
      <div className="flex justify-between items-start mb-3">
        <div
          className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${priorityColor}`}
        >
          {priority}
        </div>
        <button className="text-white/20 hover:text-white transition-colors">
          <MoreVertical size={16} />
        </button>
      </div>
      <h4 className="text-white font-medium text-sm leading-relaxed mb-3">
        {title}
      </h4>
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
        <div className="flex items-center gap-2 text-[10px] text-white/40 font-medium bg-white/5 px-2 py-1 rounded-md">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
          {tag}
        </div>
        {priority === "High" && <Flag size={12} className="text-red-400" />}
      </div>
    </div>
  );
};

const GoalCardMock = ({
  title,
  progress,
  status,
}: {
  title: string;
  progress: number;
  status: "active" | "completed";
}) => {
  return (
    <div
      className={cn(
        "group relative p-5 rounded-2xl border transition-all duration-300 w-full",
        status === "completed"
          ? "bg-green-500/5 border-green-500/20 opacity-70"
          : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10",
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-start gap-3">
          <button
            className={cn(
              "mt-1 w-5 h-5 rounded-md border flex items-center justify-center transition-all",
              status === "completed"
                ? "bg-green-500 border-green-500 text-black"
                : "border-white/20 hover:border-white/60 text-transparent",
            )}
          >
            <CheckCircle size={12} strokeWidth={3} />
          </button>
          <div>
            <h3
              className={cn(
                "font-medium text-lg leading-tight transition-all",
                status === "completed" && "line-through text-white/50",
              )}
            >
              {title}
            </h3>
            <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
              <span className="flex items-center gap-1">
                <Calendar size={12} /> Dec 31, 2024
              </span>
              <span className="w-1 h-1 rounded-full bg-white/20"></span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">
                High Priority
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
            <Edit2 size={14} />
          </button>
          <button className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
            <Share2 size={14} />
          </button>
        </div>
      </div>
      {status === "active" && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-white/40 mb-2 font-medium">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};

const ChatMessageMock = ({ text, isOwn }: { text: string; isOwn: boolean }) => (
  <div
    className={`flex w-full mb-4 ${isOwn ? "justify-end" : "justify-start"}`}
  >
    <div
      className={`flex max-w-[80%] md:max-w-[90%] gap-3 ${isOwn ? "flex-row-reverse" : "flex-row"}`}
    >
      <div className="flex-none">
        {isOwn ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold ring-2 ring-white/10">
            ME
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-xs font-bold text-black ring-2 ring-white/10">
            JD
          </div>
        )}
      </div>
      <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-bold text-white/70">
            {isOwn ? "You" : "John Doe"}
          </span>
          <span className="text-[10px] text-white/30">10:42 AM</span>
        </div>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isOwn
              ? "bg-blue-600 text-white rounded-tr-none shadow-lg shadow-blue-900/20"
              : "bg-white/10 text-white rounded-tl-none border border-white/5"
          }`}
        >
          {text}
        </div>
      </div>
    </div>
  </div>
);

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
    render: (item) => (
      <span className="font-bold text-blue-400">{item.pair}</span>
    ),
  },
  {
    key: "price",
    header: "Price",
    sortable: true,
    render: (item) => <span className="font-mono">{item.price}</span>,
  },
  {
    key: "change",
    header: "24h Change",
    sortable: true,
    render: (item) => (
      <span className={item.change >= 0 ? "text-green-400" : "text-red-400"}>
        {item.change > 0 && "+"}
        {item.change}%
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (item) => (
      <span className="px-2 py-1 rounded bg-white/10 text-xs border border-white/10">
        {item.status}
      </span>
    ),
  },
];

// --- Main Component ---

export default function UiPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8 md:p-12 font-mono selection:bg-blue-500/30">
      <header className="mb-20 border-b border-white/10 pb-8">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">
          Design System
        </h1>
        <p className="text-white/50 text-lg max-w-2xl">
          Component registry and documentation for the application. Use these
          components to build consistant user interfaces.
        </p>
      </header>

      <div className="max-w-7xl mx-auto space-y-24">
        {/* SECTION: Cards */}
        <div>
          <div className="flex items-center gap-4 mb-12">
            <h2 className="text-xl font-bold text-blue-400 uppercase tracking-widest">
              Core Components
            </h2>
            <div className="h-px bg-white/10 flex-1"></div>
          </div>

          <Section
            showHint={true}
            title="GreetCard"
            description="Displays a dynamic personalized greeting. It calculates the time of day (Morning/Afternoon/Evening) and pair it with a context-aware user name and an inspirational quote."
            props={[
              {
                name: "pageTitle",
                type: "string",
                required: true,
                description:
                  "The primary heading shown at the top of the card.",
              },
              {
                name: "caption",
                type: "string",
                required: false,
                description:
                  "Secondary text typically used for subtitles or status messages.",
              },
            ]}
            code={`import { GreetCard } from "@/components/GreetCard";

<GreetCard 
  pageTitle="Dashboard" 
  caption="Welcome back to your workspace" 
/>`}
          >
            <GreetCard
              pageTitle="UI Library"
              caption="Welcome back to your workspace"
            />
          </Section>

          <Section
            title="MarketStatsCard"
            description="A highly visual statistic card used for financial dashboards. Supports positive/negative trends, various icon sets, and custom gradient backgrounds."
            props={[
              {
                name: "title",
                type: "string",
                required: true,
                description: "Label for the metric.",
              },
              {
                name: "value",
                type: "string | number",
                required: true,
                description: "The primary numerical value.",
              },
              {
                name: "icon",
                type: "LucideIcon",
                required: false,
                description: "Reactiv Component from lucide-react.",
              },
              {
                name: "trend",
                type: "TrendObject",
                required: false,
                description: "{ value: string, isPositive: boolean }",
              },
              {
                name: "gradient",
                type: "string",
                required: false,
                description:
                  "Tailwind CSS class string for background gradient.",
                default: "from-emerald-900...",
              },
            ]}
            code={`import { MarketStatsCard } from "@/components/ui/cards/MarketStatsCard";
import { Wallet, Activity } from "lucide-react";

<MarketStatsCard
  title="Total Balance"
  value="$12,450.00"
  icon={Wallet}
/>`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
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
            description="Interactive card representing a trading instrument. Includes specific logic for handling Gold (XAU) and Silver (XAG) asset classes."
            props={[
              {
                name: "data",
                type: "SymbolData",
                required: true,
                description: "{ pair: string, trades?: number, ... }",
              },
              {
                name: "onClick",
                type: "function",
                required: false,
                description: "Callback when card is clicked.",
              },
            ]}
            code={`import { ActiveSymbolCard } from "@/components/ui/cards/ActiveSymbolCard";
<ActiveSymbolCard
  data={{
    pair: "EURUSD",
    code: "€",
    trades: 12
  }}
/>`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
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
        </div>

        {/* SECTION: Complex Views */}
        <div>
          <div className="flex items-center gap-4 mb-12">
            <h2 className="text-xl font-bold text-blue-400 uppercase tracking-widest">
              Complex Views
            </h2>
            <div className="h-px bg-white/10 flex-1"></div>
          </div>

          <Section
            title="DataTable"
            description="A generic, reusable data table component with sorting, pagination support, and custom cell rendering."
            props={[
              {
                name: "data",
                type: "T[]",
                required: true,
                description: "Array of data objects.",
              },
              {
                name: "columns",
                type: "Column<T>[]",
                required: true,
                description:
                  "Column definitions with headers and render functions.",
              },
              {
                name: "onRowClick",
                type: "(item: T) => void",
                required: false,
                description: "Row click handler.",
              },
            ]}
            code={`import { DataTable } from "@/components/ui/data-table";

const columns = [
  { key: "pair", header: "Symbol" },
  { key: "price", header: "Price" }
];

<DataTable 
  data={marketData} 
  columns={columns} 
/>`}
          >
            <div className="w-full">
              <DataTable data={tableData} columns={tableColumns} />
            </div>
          </Section>

          <Section
            title="Task Cards"
            description="Kanban-style task cards used in the Tasks View. Supports priority tagging and visual indicators."
            props={[
              {
                name: "title",
                type: "string",
                required: true,
                description: "Task description.",
              },
              {
                name: "priority",
                type: "High | Medium | Low",
                required: true,
                description: "Determines color scheme.",
              },
              {
                name: "tag",
                type: "string",
                required: true,
                description: "Project category tag.",
              },
            ]}
            code={`<div className="flex flex-col gap-4">
  <TaskCard 
     title="Refactor API endpoints" 
     priority="High" 
     tag="Backend" 
  />
  <TaskCard 
     title="Update documentation" 
     priority="Low" 
     tag="Docs" 
  />
</div>`}
          >
            <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
              <TaskCardMock
                title="Fix login validation bug on mobile"
                tag="Authentication"
                priority="High"
              />
              <TaskCardMock
                title="Update dashboard icons"
                tag="UI/UX"
                priority="Medium"
              />
              <TaskCardMock
                title="Write unit tests for services"
                tag="Testing"
                priority="Low"
              />
            </div>
          </Section>

          <Section
            title="Goal Tracker"
            description="Progress tracking card for the Goals View. Visualizes completion percentage and status states."
            props={[
              {
                name: "title",
                type: "string",
                required: true,
                description: "Goal name.",
              },
              {
                name: "progress",
                type: "number",
                required: true,
                description: "0-100 integer.",
              },
              {
                name: "status",
                type: "active | completed",
                required: true,
                description: "Affects opacity and styling.",
              },
            ]}
            code={`<GoalCard 
  title="Reach $50k Revenue" 
  progress={65} 
  status="active" 
/>`}
          >
            <div className="flex flex-col gap-3 w-full max-w-sm mx-auto">
              <GoalCardMock
                title="Complete Q1 Roadmap"
                progress={75}
                status="active"
              />
              <GoalCardMock
                title="Hire Senior Designer"
                progress={100}
                status="completed"
              />
            </div>
          </Section>

          <Section
            title="Chat Interface"
            description="Message bubbles for the Chat/LLM views. Distinguishes between user (sent) and other (received) messages."
            props={[
              {
                name: "text",
                type: "string",
                required: true,
                description: "Message content.",
              },
              {
                name: "isOwn",
                type: "boolean",
                required: true,
                description: "True if sent by current user.",
              },
            ]}
            code={`<ChatMessage text="Hello there!" isOwn={true} />
<ChatMessage text="Hi! How can I help?" isOwn={false} />`}
          >
            <div className="w-full max-w-md mx-auto bg-black/40 p-4 rounded-xl border border-white/5">
              <ChatMessageMock
                text="Can you generate a summary of the gold market?"
                isOwn={true}
              />
              <ChatMessageMock
                text="Gold (XAU/USD) is currently trading at 2034.50, showing strong bullish momentum..."
                isOwn={false}
              />
            </div>
          </Section>

          <Section
            title="Crypto Chart"
            description="High-performance financial time-series chart optimized for live data. Supports varying timeframes and dynamic value coloring."
            props={[
              {
                name: "data",
                type: "ChartDataPoint[]",
                required: true,
                description: "{ time: number, value: number }",
              },
              {
                name: "label",
                type: "string",
                required: false,
                description: "Tooltip label (e.g. 'BTC/USD').",
              },
              {
                name: "color",
                type: "string",
                required: false,
                description: "Hex color code for the line/fill.",
              },
              {
                name: "timeFrame",
                type: "string",
                required: false,
                description: "Format specifier ('Live', '1D', etc.).",
              },
            ]}
            code={`import { CryptoChart } from "@/components/market/CryptoChart";

<CryptoChart 
  data={historicalData} 
  label="Pre-Market" 
  color="#10B981" 
  timeFrame="1D"
/>`}
          >
            <div className="h-[300px] w-full bg-black/40 rounded-xl p-4 border border-white/5">
              <CryptoChart
                data={Array.from({ length: 50 }, (_, i) => ({
                  time: 1672531200000 + i * 60000,
                  value: 40000 + Math.sin(i / 5) * 500 + Math.random() * 200,
                }))}
                label="Demo Asset"
                timeFrame="Live"
              />
            </div>
          </Section>

          <Section
            title="Bitcoin Live Card"
            description="Specialized card for displaying real-time cryptocurrency data with WebSocket connection status."
            props={[
              {
                name: "price",
                type: "number",
                required: true,
                description: "Current live price.",
              },
              {
                name: "status",
                type: "string",
                required: false,
                description: "Connection status.",
              },
            ]}
            code={`// Note: This UI is typically embedded in CryptoView
// but follows this structure:

<div className="card">
  <div className="icon">
     <Bitcoin />
  </div>
  <h3 className="label">Bitcoin Live</h3>
  <div className="price-container">
     <span className="price">$43,205.50</span>
  </div>
</div>`}
          >
            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#F7931A]/20 to-[#F7931A]/5 backdrop-blur-xl border border-white/10 relative overflow-hidden group w-full max-w-sm mx-auto">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Bitcoin size={80} />
              </div>
              <h3 className="text-white/60 font-medium text-sm mb-1">
                Bitcoin Live
              </h3>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-[#F7931A]/20 flex items-center justify-center text-[#F7931A] font-bold border border-[#F7931A]/20">
                  <Bitcoin size={20} />
                </div>
                <div>
                  <div className="text-xl font-bold text-white">$43,250.50</div>
                  <div className="text-[10px] text-white/40">BTC/USDT</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium bg-emerald-500/10 w-fit px-2 py-1 rounded-lg">
                <span>Live Stream</span>
              </div>
            </div>
          </Section>

          <Section
            title="Gradient Picker"
            description="A complex UI for creating linear/solid gradients with multiple color stops and angle control."
            props={[
              {
                name: "initialBackground",
                type: "string",
                required: true,
                description: "Starting CSS background value.",
              },
              {
                name: "onChange",
                type: "(bg: string) => void",
                required: true,
                description: "Callback for background updates.",
              },
              {
                name: "onClose",
                type: "() => void",
                required: true,
                description: "Close handler.",
              },
            ]}
            code={`<GradientPicker
  initialBackground="linear-gradient(...)"
  onChange={(newBg) => setBackground(newBg)}
  onClose={() => setIsOpen(false)}
/>`}
          >
            <div className="flex justify-center w-full py-8">
              <div className="transform scale-90 origin-top">
                <GradientPicker
                  initialBackground="linear-gradient(135deg, #4a00e0, #8e2de2)"
                  onChange={() => {}}
                  onClose={() => {}}
                />
              </div>
            </div>
          </Section>

          <Section
            title="Top Navigation Header"
            description="The primary application controller floating at the top of the interface. Integrates navigation, system settings, and profile management."
            props={[
              {
                name: "activeTab",
                type: "string",
                required: true,
                description: "Current view identifier.",
              },
              {
                name: "currency",
                type: "string",
                required: true,
                description: "Selected global currency.",
              },
            ]}
            code={`// Application Navigation Bar Layout
<header className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 p-2 pl-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
  
  {/* 1. Currency Selector */}
  <CurrencyPicker />

  {/* 2. Theme Editor */}
  <ThemeToggle />

  {/* 3. Navigation Tabs */}
  <div className="flex items-center gap-1">
     <NavTab label="Overview" active={true} />
     <NavTab label="Forex" active={false} />
     ...
  </div>

  {/* 4. User Actions */}
  <UserProfileButton />
  <LockScreenButton />
</header>`}
          >
            <div className="w-full flex justify-center py-6">
              <div className="flex items-center gap-4 p-2 pl-3 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
                {/* Mock Currency */}
                <button className="h-8 px-3 rounded-full border border-white/5 bg-white/5 text-white/70 flex items-center gap-2 text-xs">
                  <span className="font-bold">USD</span>
                </button>
                {/* Mock Theme */}
                <button className="w-8 h-8 rounded-full border border-white/5 bg-white/5 text-white/70 flex items-center justify-center">
                  <Layers size={14} />
                </button>
                <div className="h-4 w-[1px] bg-white/10"></div>
                {/* Mock Tabs */}
                <div className="flex items-center gap-1">
                  <div className="px-4 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium border border-white/10">
                    Overview
                  </div>
                  <div className="px-4 py-1.5 rounded-full text-white/50 text-xs font-medium">
                    Forex
                  </div>
                  <div className="px-4 py-1.5 rounded-full text-white/50 text-xs font-medium">
                    Crypto
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Currency Converter"
            description="Global currency context provider and selection UI. Updates all financial data across the application (Crypto, Forex, Indian Stocks) instantly."
            props={[
              {
                name: "currency",
                type: "USD | EUR | INR",
                required: true,
                description: "Active currency state.",
              },
              {
                name: "setCurrency",
                type: "function",
                required: true,
                description: "State updater.",
              },
              {
                name: "exchangeRate",
                type: "number",
                required: true,
                description: "Derived rate based on selection.",
              },
            ]}
            code={`// 1. Context Usage
const { currency, currencySymbol, formatCurrency } = useCurrency();

// 2. Rendering Values
<div>
  Price: {formatCurrency(item.price)}
  {/* Renders: $100.00 or ₹8,312.00 or €92.00 */}
</div>

// 3. Selector Implementation
<button onClick={() => setCurrency("EUR")}>
   <EuroIcon /> EUR
</button>`}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full p-4">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center gap-2">
                <span className="text-blue-400 font-bold text-xl">
                  $1,000.00
                </span>
                <span className="text-xs text-white/40 uppercase tracking-wider">
                  USD Base
                </span>
              </div>
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col items-center justify-center gap-2">
                <span className="text-purple-400 font-bold text-xl">
                  €920.00
                </span>
                <span className="text-xs text-white/40 uppercase tracking-wider">
                  EUR (0.92x)
                </span>
              </div>
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col items-center justify-center gap-2">
                <span className="text-orange-400 font-bold text-xl">
                  ₹83,120.00
                </span>
                <span className="text-xs text-white/40 uppercase tracking-wider">
                  INR (83.12x)
                </span>
              </div>
            </div>
          </Section>

          <Section
            title="AI Chat Interface"
            description="LLM-powered chat interface supporting Gemini/ChatGPT models, file attachments, and markdown rendering."
            code={`// LLMChatView Component
<LLMChatView />

// Features:
// - Markdown Rendering
// - File Attachments
// - Context Retention
// - Model Switching`}
            props={[
              {
                name: "model",
                type: "'gemini' | 'chatgpt'",
                required: true,
                description: "Active LLM Model",
                default: "gemini",
              },
              {
                name: "onSend",
                type: "function",
                required: true,
                description: "Handler for message submission",
              },
            ]}
          >
            <ChatMock />
          </Section>

          <Section
            title="Trading Bots"
            description="Algorithmic trading bot cards displaying operational status and performance metrics."
            code={`// BotsView Cards
{bots.map(bot => (
  <BotCard 
    key={bot.id}
    data={bot}
  />
))}

// Data Structure
interface BotData {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  performance: string;
  color: string;
}`}
            props={[
              {
                name: "data",
                type: "BotData",
                required: true,
                description: "Bot configuration and current stats",
              },
              {
                name: "isActive",
                type: "boolean",
                required: false,
                description: "Visual highlight state",
              },
            ]}
          >
            <div className="grid grid-cols-1 gap-4 w-full">
              <BotCardMock
                name="Alpha Scout"
                status="active"
                performance="+12.5%"
                color="from-yellow-400 to-orange-500"
              />
              <BotCardMock
                name="SafeGuard AI"
                status="inactive"
                performance="+3.1%"
                color="from-green-400 to-emerald-500"
              />
            </div>
          </Section>

          <Section
            title="Utility Components"
            description="Other essential system components maintained in the project."
            code={`// LockScreen
<LockScreen isLocked={true} onUnlock={handleUnlock} />

// ShareDialog
<ShareDialog 
  isOpen={true} 
  title="Share Note" 
  content="https://astra.app/notes/123" 
/>

// Delete Dialog
<DeleteConfirmationDialog 
  isOpen={true} 
  title="Delete Item?" 
  onConfirm={handleDelete} 
  description="This action cannot be undone."
/>`}
          >
            <div className="grid grid-cols-1 gap-4 text-sm text-white/60 p-4">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <strong className="text-white block mb-1">LockScreen</strong>
                <p>
                  Full-screen security overlay requiring PIN entry. Connected to
                  UserContext.
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <strong className="text-white block mb-1">ShareDialog</strong>
                <p>
                  Modal for copying content/links to clipboard with visual
                  feedback.
                </p>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <strong className="text-white block mb-1">
                  DeleteConfirmationDialog
                </strong>
                <p>Standardized destructive action confirmation modal.</p>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
