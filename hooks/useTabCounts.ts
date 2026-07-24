import { useEffect, useMemo, useState } from "react";
import { useUser } from "@/context/UserContext";
import { useTodos } from "./useTodos";
import { useIdeas } from "./useIdeas";
import { useStocks } from "./useStocks";
import { useNotes } from "./useNotes";
import { subscribeToUserTasks, Task } from "@/utils/kanban-service";
import { subscribeToReminders, Reminder } from "@/services/remindersService";
import { subscribeToGoals, Goal } from "@/utils/goals-service";
import { toMillis } from "@/utils/time";

export interface NextDeadline {
  title: string;
  when: number; // epoch ms
  tabId: string;
}

// Aggregates lightweight "pending" counts per tab and the soonest upcoming
// deadline across ideas / todos / tasks — powering the top-bar badges + ticker.
export const useTabCounts = () => {
  const { user } = useUser();
  const { todos } = useTodos();
  const { ideas } = useIdeas();
  const { stocks } = useStocks();
  const { notes } = useNotes();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    if (!user?.id) {
      setTasks([]);
      setReminders([]);
      setGoals([]);
      return;
    }
    const unsubTasks = subscribeToUserTasks(user.id, setTasks);
    const unsubReminders = subscribeToReminders(user.id, setReminders);
    const unsubGoals = subscribeToGoals(user.id, setGoals);
    return () => {
      unsubTasks();
      unsubReminders();
      unsubGoals();
    };
  }, [user?.id]);

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.column !== "Done" && t.column !== "Finished"),
    [tasks],
  );

  const counts = useMemo<Record<string, number>>(
    () => ({
      todos: todos.filter((t) => !t.completed).length,
      tasks: pendingTasks.length,
      notes: notes.length,
      idea: ideas.length,
      stocks: stocks.length,
      reminders: reminders.filter((r) => !r.isCompleted).length,
      goals: goals.filter((g) => g.status === "active").length,
    }),
    [todos, pendingTasks, notes, ideas, stocks, reminders, goals],
  );

  const nextDeadline = useMemo<NextDeadline | null>(() => {
    const now = Date.now();
    const candidates: NextDeadline[] = [];

    ideas.forEach((i) => {
      const ms = toMillis(i.deadline);
      if (ms !== null && ms >= now)
        candidates.push({ title: i.title, when: ms, tabId: "idea" });
    });
    todos.forEach((t) => {
      if (t.completed) return;
      const ms = toMillis(t.dueDate);
      if (ms !== null && ms >= now)
        candidates.push({ title: t.title, when: ms, tabId: "todos" });
    });
    pendingTasks.forEach((t) => {
      const ms = toMillis(t.deadline);
      if (ms !== null && ms >= now)
        candidates.push({ title: t.content, when: ms, tabId: "tasks" });
    });

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.when - b.when);
    return candidates[0];
  }, [ideas, todos, pendingTasks]);

  return { counts, nextDeadline };
};
