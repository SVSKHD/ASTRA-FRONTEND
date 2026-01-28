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
} from "lucide-react";
import { IndianView } from "@/components/views/Indian";
import { CryptoView } from "@/components/views/CryptoView";
import { BotsView } from "@/components/views/BotsView";
import { NotesView } from "@/components/views/NotesView";
import { TasksView } from "@/components/views/TasksView";
import { RemindersView } from "@/components/views/RemindersView";
import { RequestAccessView } from "@/components/views/RequestAccessView";

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
    id: "notes",
    label: "Notes",
    caption: "Note the markets and prices",
    icon: Notebook,
    component: <NotesView />,
    allowedRoles: ["admin"],
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
    id: "reminders",
    label: "Reminders",
    caption: "Never forget",
    icon: Bell,
    component: <RemindersView />,
  },
];
