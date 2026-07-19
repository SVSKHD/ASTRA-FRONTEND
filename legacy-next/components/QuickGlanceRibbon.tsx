"use client";

import React, { useEffect, useState } from "react";
import {
  Target,
  Bell,
  Notebook,
  Lightbulb,
  CheckSquare,
  BookOpen,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useNotes } from "@/hooks/useNotes";
import { useIdeas } from "@/hooks/useIdeas";
import { subscribeToGoals, Goal } from "@/utils/goals-service";
import { subscribeToReminders, Reminder } from "@/services/remindersService";
import {
  subscribeToBoards,
  subscribeToTasks,
  Task,
} from "@/utils/kanban-service";
import { fetchJournalEntries } from "@/services/journalService";

interface QuickGlanceRibbonProps {
  onTabSelect: (tabId: string) => void;
  allowedRoles: string[]; // Pass down what tabs are allowed if needed, though clicking just attempts navigation
}

export const QuickGlanceRibbon = ({ onTabSelect }: QuickGlanceRibbonProps) => {
  const { user } = useUser();
  const { notes } = useNotes();
  const { ideas } = useIdeas();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journalCount, setJournalCount] = useState<number>(0);

  useEffect(() => {
    if (!user?.id) return;

    const unsubGoals = subscribeToGoals(user.id, setGoals);
    const unsubReminders = subscribeToReminders(user.id, setReminders);

    // Fetch a quick pulse of tasks from the primary board
    let unsubscribeTasks: () => void = () => {};
    const unsubscribeBoards = subscribeToBoards(user.id, (boards) => {
      if (boards.length > 0) {
        unsubscribeTasks = subscribeToTasks(boards[0].id, (data) =>
          setTasks(data),
        );
      }
    });

    // Optional quick fetch for Journal count to complete the loop
    fetchJournalEntries(user.id)
      .then((entries) => setJournalCount(entries.length))
      .catch(() => {});

    return () => {
      unsubGoals();
      unsubReminders();
      unsubscribeBoards();
      unsubscribeTasks();
    };
  }, [user?.id]);

  const activeGoalsCount = goals.filter((g) => g.status === "active").length;

  // Highlight upcoming reminders (within a week, or overdue but not completed)
  const now = new Date();
  const upcomingRemindersCount = reminders.filter((r) => !r.isCompleted).length;

  const pendingTasksCount = tasks.filter(
    (t) => t.column !== "Done" && t.column !== "Finished",
  ).length;

  const QuickCard = ({
    icon: Icon,
    title,
    stat,
    onClick,
    activeColor,
  }: {
    icon: any;
    title: string;
    stat: string | number;
    onClick: () => void;
    activeColor: string;
  }) => (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1 p-3.5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all shadow-sm shrink-0 w-[120px] text-left group`}
    >
      <div
        className={`flex items-center gap-2 mb-1.5 p-1.5 w-max rounded-xl bg-white/5 group-hover:${activeColor} transition-colors`}
      >
        <Icon
          size={16}
          className={`text-white/40 group-hover:text-white transition-colors`}
        />
      </div>
      <div className="text-xl font-bold tracking-tight text-white mb-0.5">
        {stat}
      </div>
      <span className="text-[10px] font-medium tracking-wider text-white/40 group-hover:text-white/60 transition-colors uppercase">
        {title}
      </span>
    </button>
  );

  return (
    <div className="w-full relative mb-6">
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2 pr-12">
        {/* Admin specific modules might fail strictly on role matching inside Dashboard but we show the pulse anyway! */}
        <QuickCard
          icon={Target}
          title="Active Goals"
          stat={activeGoalsCount}
          onClick={() => onTabSelect("goals")}
          activeColor="bg-purple-500/30"
        />
        <QuickCard
          icon={Bell}
          title="Reminders"
          stat={upcomingRemindersCount}
          onClick={() => onTabSelect("reminders")}
          activeColor="bg-yellow-500/30"
        />
        <QuickCard
          icon={Notebook}
          title="Total Notes"
          stat={notes.length}
          onClick={() => onTabSelect("notes")}
          activeColor="bg-blue-500/30"
        />
        <QuickCard
          icon={Lightbulb}
          title="Idea Hubs"
          stat={ideas.length}
          onClick={() => onTabSelect("idea")}
          activeColor="bg-amber-500/30"
        />
        <QuickCard
          icon={CheckSquare}
          title="Tasks Left"
          stat={pendingTasksCount}
          onClick={() => onTabSelect("tasks")}
          activeColor="bg-emerald-500/30"
        />
        <QuickCard
          icon={BookOpen}
          title="Journal Logs"
          stat={journalCount}
          onClick={() => onTabSelect("journal")}
          activeColor="bg-indigo-500/30"
        />
      </div>
      {/* Soft gradient blur on right edge to indicate scroll */}
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black/80 to-transparent pointer-events-none" />
    </div>
  );
};
