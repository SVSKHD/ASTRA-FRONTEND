import { ForexView } from "@/components/views/Forex";
import { OverviewView } from "@/components/views/Overview";
import { LayoutDashboard, Globe, IndianRupee, Notebook, CheckSquare, MessageCircle, Lock } from "lucide-react";
import { IndianView } from "../components/views/Indian";
import { NotesView } from "@/components/views/NotesView";
import { TasksView } from "@/components/views/TasksView";
import { RequestAccessView } from "@/components/views/RequestAccessView";
import { ChatView } from "@/components/views/ChatView";
import React from "react";

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
    id: "chat",
    label: "Chat",
    caption: "Connect with others",
    icon: MessageCircle,
    component: <ChatView />,
  },
];
