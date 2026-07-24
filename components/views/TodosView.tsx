import React, { useMemo, useState } from "react";
import { Plus, CheckSquare, AlertTriangle } from "lucide-react";
import { useTodos } from "../../hooks/useTodos";
import useBreakpoints from "../../hooks/useBreakpoints";
import { DateAccordionBoard, AccordionItem } from "../todos/DateAccordionBoard";
import { TodoDialog } from "../TodoDialog";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { isOverdue } from "../../utils/time";

export const TodosView = () => {
  const {
    todos,
    loading,
    createTodo,
    editTodo,
    toggleTodo,
    removeTodo,
    reorder,
  } = useTodos();
  const { isMobile } = useBreakpoints();

  const [newTitle, setNewTitle] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const items: AccordionItem[] = useMemo(
    () =>
      todos.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
        order: t.order,
        createdAt: t.createdAt,
      })),
    [todos],
  );

  const overdueCount = useMemo(
    () => todos.filter((t) => isOverdue(t.dueDate, t.completed)).length,
    [todos],
  );

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createTodo({ title: newTitle.trim() });
    setNewTitle("");
  };

  const selectedTodo = todos.find((t) => t.id === selectedId) || null;

  if (loading)
    return (
      <div className="h-full flex items-center justify-center text-white/50 animate-pulse">
        Loading Todos…
      </div>
    );

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">Todos</h2>
          <p className="text-sm text-white/40 mt-1">
            Organised by due date — drag to reschedule
          </p>
        </div>
        {overdueCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
            <AlertTriangle size={13} /> {overdueCount} overdue
          </span>
        )}
      </div>

      {/* Quick add */}
      <div className="shrink-0 flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 backdrop-blur-xl">
        <CheckSquare size={18} className="text-white/30 shrink-0 ml-1" />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Add a todo and press Enter…"
          className="flex-1 bg-transparent text-sm text-white focus:outline-none placeholder:text-white/25 py-2"
        />
        <button
          onClick={handleCreate}
          disabled={!newTitle.trim()}
          className="flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-blue-500 text-white text-sm font-medium disabled:opacity-40 hover:bg-blue-400 transition-colors shadow-[0_0_15px_rgba(59,130,246,0.4)]"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 md:pb-10 pr-1 custom-scrollbar">
        <DateAccordionBoard
          items={items}
          isMobile={isMobile}
          onMove={(id, dueDate, completed) => {
            const prev = todos.find((t) => t.id === id);
            if (completed) {
              // Dropped into "Completed" — keep the due date, just complete it.
              toggleTodo(id, true);
            } else {
              editTodo(id, { dueDate });
              if (prev?.completed) toggleTodo(id, false);
            }
          }}
          onPersistOrder={(orderedIds) => reorder(orderedIds)}
          onToggleComplete={(id, completed) => toggleTodo(id, completed)}
          onOpen={(id) => setSelectedId(id)}
          onDelete={(id) => setDeleteId(id)}
        />
      </div>

      {selectedTodo && (
        <TodoDialog
          todo={selectedTodo}
          isOpen={!!selectedTodo}
          onClose={() => setSelectedId(null)}
          onUpdate={editTodo}
          onToggle={toggleTodo}
          onDelete={removeTodo}
        />
      )}

      <DeleteConfirmationDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) removeTodo(deleteId);
          setDeleteId(null);
        }}
        title="Delete Todo"
        description={<p>Are you sure you want to delete this todo?</p>}
      />
    </div>
  );
};
