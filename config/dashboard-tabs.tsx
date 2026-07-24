import { ForexView } from "@/components/views/Forex";
import { GoalsView } from "@/components/views/GoalsView";
import { OverviewView } from "@/components/views/Overview";
import { ChatView } from "@/components/views/ChatView";
import { LLMChatView } from "@/components/views/LLMChatView";
import React from "react";
import {
  LayoutDashboard,
  Globe,
  IndianRupee,
  Notebook,
  CheckSquare,
  MessageCircle,
  Lock,
  Target,
  Sparkles,
  Bot,
  Bitcoin,
  Bell,
  Github,
  BookOpen,
  Lightbulb,
  TrendingUp,
  ListTodo,
} from "lucide-react";
import { IndianView } from "@/components/views/Indian";
import { CryptoView } from "@/components/views/CryptoView";
import { BotsView } from "@/components/views/BotsView";
import { NotesView } from "@/components/views/NotesView";
import { TasksView } from "@/components/views/TasksView";
import { RemindersView } from "@/components/views/RemindersView";
import { RequestAccessView } from "@/components/views/RequestAccessView";
import { GithubReposView } from "@/components/views/GithubReposView";
import { JournalView } from "@/components/views/JournalView";
import { IdeaView } from "@/components/views/IdeaView";
import { StocksView } from "@/components/views/StocksView";
import { TodosView } from "@/components/views/TodosView";

export interface TabConfig {
  id: string;
  label: string;
  caption: string;
  icon: any;
  component: React.ReactNode;
  allowedRoles?: string[];
}

export const tabsConfig: TabConfig[] = [
  {
    id: "overview",
    label: "Overview",
    caption: "Your daily summary",
    icon: LayoutDashboard,
    component: <OverviewView />,
  },
  {
    id: "forex",
    label: "Forex",
    caption: "Market",
    icon: Globe,
    component: <ForexView />,
    allowedRoles: ["admin"],
  },
  {
    id: "indian",
    label: "Indian",
    caption: "Market",
    icon: IndianRupee,
    component: <IndianView />,
    allowedRoles: ["admin"],
  },
  {
    id: "crypto",
    label: "Crypto",
    caption: "Market",
    icon: Bitcoin,
    component: <CryptoView />,
    allowedRoles: ["admin"],
  },
  {
    id: "journal",
    label: "Journal",
    caption: "Track your journey",
    icon: BookOpen,
    component: <JournalView />,
  },
  {
    id: "notes",
    label: "Notes",
    caption: "Note the markets and prices",
    icon: Notebook,
    component: <NotesView />,
    allowedRoles: ["admin"],
  },
  {
    id: "todos",
    label: "Todos",
    caption: "Date-wise, drag to reschedule",
    icon: ListTodo,
    component: <TodosView />,
  },
  {
    id: "tasks",
    label: "Tasks",
    caption: "Manage your tasks",
    icon: CheckSquare,
    component: <TasksView />,
    allowedRoles: ["admin"],
  },
  {
    id: "request-access",
    label: "Access",
    caption: "Request Admin Access",
    icon: Lock,
    component: <RequestAccessView />,
    allowedRoles: ["user"],
  },
  {
    id: "goals",
    label: "Goals",
    caption: "Track your targets",
    icon: Target,
    component: <GoalsView />,
    allowedRoles: ["admin"],
  },
  {
    id: "chat",
    label: "Chat",
    caption: "Connect with others",
    icon: MessageCircle,
    component: <ChatView />,
  },
  {
    id: "llm-chat",
    label: "LLM",
    caption: "Chat with AI",
    icon: Sparkles,
    component: <LLMChatView />,
  },
  {
    id: "bots",
    label: "Bots",
    caption: "Manage your bots",
    icon: Bot,
    component: <BotsView />,
  },
  {
    id: "github",
    label: "Github",
    caption: "Code Repositories",
    icon: Github,
    component: <GithubReposView />,
  },
  {
    id: "reminders",
    label: "Reminders",
    caption: "Never forget",
    icon: Bell,
    component: <RemindersView />,
    allowedRoles: ["admin"],
  },
  {
    id: "idea",
    label: "Idea",
    caption: "Brainstorming and timeline",
    icon: Lightbulb,
    component: <IdeaView />,
  },
  {
    id: "stocks",
    label: "Stocks",
    caption: "Your watchlist and theses",
    icon: TrendingUp,
    component: <StocksView />,
  },
];
