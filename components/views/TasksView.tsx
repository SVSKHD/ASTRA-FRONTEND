import React, { useState, useEffect, useMemo } from "react";
import {
  Plus,
  GripVertical,
  CheckCircle2,
  ChevronRight,
  X,
  Layout,
  AlertCircle,
  Check,
  Circle,
  Columns,
  Rows,
  ArrowRight,
  Flag,
  Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createBoard,
  subscribeToBoards,
  addTask as firebaseAddTask,
  updateTask as firebaseUpdateTask,
  moveTask as firebaseMoveTask,
  deleteTask as firebaseDeleteTask,
  subscribeToTasks,
  Board,
  Task,
  ColumnType,
} from "@/utils/kanban-service";
import { TaskDialog } from "../TaskDialog";

const AVAILABLE_COLUMNS: ColumnType[] = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Testing",
  "Done",
  // Legacy/Custom
  "Dock",
  "Finished",
  "Parked"
];

const DEFAULT_SELECTION: ColumnType[] = ["To Do", "In Progress", "In Review", "Done"];

// Sortable Task Component
const SortableTaskItem = ({
  task,
  onDelete,
  onEdit,
  isVerticalView
}: {
  task: Task;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  isVerticalView?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "Task",
      task,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-white/10 touch-none ${isVerticalView ? 'p-2 flex items-center justify-between gap-4 mb-2' : 'p-3 mb-3'
        }`}
    >
      <div className={`flex justify-between items-start gap-2 ${isVerticalView ? 'flex-1 items-center' : ''}`}>
        <p className={`text-white/80 break-all ${isVerticalView ? 'text-sm font-medium mb-0' : 'text-sm mb-2'}`}>
          {task.content}
        </p>
        {!isVerticalView && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={14} className="text-white/20" />
          </div>
        )}
      </div>

      <div className={`flex items-center justify-between ${isVerticalView ? 'gap-4 border-t-0 pt-0' : 'mt-2 pt-2 border-t border-white/5'}`}>
        <span className="text-[10px] text-white/30 whitespace-nowrap">
          {task.createdAt?.toDate
            ? task.createdAt.toDate().toLocaleDateString()
            : "Just now"}
        </span>

        <div
          className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {task.column !== "Done" && task.column !== "Finished" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
              className="p-1 hover:bg-red-500/20 rounded text-white/50 hover:text-red-400"
              title="Delete"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const KanbanColumn = ({
  column,
  children,
  isOver,
  isVerticalView
}: {
  column: ColumnType;
  children: React.ReactNode;
  isOver?: boolean;
  isVerticalView?: boolean;
}) => {
  const { setNodeRef, isOver: droppableIsOver } = useDroppable({
    id: column,
    data: {
      type: "Column",
      column,
    },
  });

  const isActive = isOver || droppableIsOver;

  if (isVerticalView) {
    return (
      <div
        ref={setNodeRef}
        className={`flex flex-col rounded-2xl border transition-colors duration-200 overflow-hidden w-full ${isActive
          ? "bg-white/10 border-blue-500/30"
          : "bg-white/5 border-white/5 backdrop-blur-sm"
          }`}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-none w-72 md:w-80 flex flex-col rounded-2xl border transition-colors duration-200 overflow-hidden h-full max-h-[600px] ${isActive
        ? "bg-white/10 border-blue-500/30"
        : "bg-white/5 border-white/5 backdrop-blur-sm"
        }`}
    >
      {children}
    </div>
  );
};

export const TasksView = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout preference (could be saved to local storage)
  const [isVerticalView, setIsVerticalView] = useState(false);

  // DND State
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Board Creation State
  const [newBoardName, setNewBoardName] = useState("");
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<ColumnType[]>(DEFAULT_SELECTION);

  const [activeTaskContent, setActiveTaskContent] = useState("");
  const [isAddingTask, setIsAddingTask] = useState<ColumnType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor),
  );

  const activeBoard = useMemo(() => boards.find((b) => b.id === selectedBoardId), [boards, selectedBoardId]);

  const boardColumns = useMemo(() => {
    return activeBoard?.columns || DEFAULT_SELECTION;
  }, [activeBoard]);

  const tasksByColumn = useMemo(() => {
    const acc: Record<string, Task[]> = {};
    boardColumns.forEach(col => { acc[col] = [] });

    tasks.forEach((task) => {
      if (acc[task.column]) {
        acc[task.column].push(task);
      } else {
        // If a task ends up in a legacy column, or one not visible, we can group it under the first one or a "Parked" one if it exists.
        // For now, let's look for "Backlog" or "Parked"
        const fallback = boardColumns.includes("Backlog") ? "Backlog" : (boardColumns.includes("Parked") ? "Parked" : boardColumns[0]);
        if (acc[fallback]) acc[fallback].push(task);
      }
    });
    return acc;
  }, [tasks, boardColumns]);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToBoards(
      (fetchedBoards) => {
        setBoards(fetchedBoards);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Failed to load boards:", err);
        setError("Unable to load boards. Please check your connection or configuration.");
        setIsLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedBoardId) {
      const unsubscribe = subscribeToTasks(
        selectedBoardId,
        (fetchedTasks) => {
          if (!activeId) {
            setTasks(fetchedTasks);
          }
        },
        (err) => {
          console.error("Failed to load tasks:", err);
        },
      );
      return () => unsubscribe();
    } else {
      setTasks([]);
    }
  }, [selectedBoardId, activeId]);

  const handleCreateBoard = async () => {
    if (newBoardName.trim()) {
      try {
        setError(null);
        const columnsToSave = selectedColumns.length > 0 ? selectedColumns : DEFAULT_SELECTION;

        setIsCreatingBoard(false);
        const boardId = await createBoard(newBoardName.trim(), columnsToSave);

        setNewBoardName("");
        setSelectedColumns(DEFAULT_SELECTION);
        setSelectedBoardId(boardId);

      } catch (error) {
        console.error("Failed to create board", error);
        setError("Failed to create board. Please try again.");
        setIsCreatingBoard(true);
      }
    }
  };

  const toggleColumnSelection = (column: ColumnType) => {
    setSelectedColumns(prev =>
      prev.includes(column)
        ? prev.filter(c => c !== column)
        : [...prev, column]
    );
  };

  const handleAddTask = async (column: ColumnType) => {
    if (activeTaskContent.trim() && selectedBoardId) {
      await firebaseAddTask(selectedBoardId, activeTaskContent.trim(), column);
      setActiveTaskContent("");
      setIsAddingTask(null);
    }
  };

  const handleUpdateTask = async (taskId: string | undefined, updates: Partial<Task>) => {
    if (taskId) {
      await firebaseUpdateTask(taskId, updates);
    }
    setEditingTask(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    await firebaseDeleteTask(taskId);
    setEditingTask(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setActiveTask(
      active.data.current?.task || tasks.find((t) => t.id === active.id) || null,
    );
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // Check if over a column directly
    if (boardColumns.includes(overId as ColumnType)) {
      const overColumn = overId as ColumnType;
      if (activeTask.column !== overColumn) {
        setTasks((items) => {
          return items.map((t) =>
            t.id === activeId ? { ...t, column: overColumn } : t,
          );
        });
      }
    } else {
      // Over another task
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask && activeTask.column !== overTask.column) {
        setTasks((items) => {
          return items.map((t) =>
            t.id === activeId ? { ...t, column: overTask.column } : t,
          );
        });
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const taskId = active.id as string;

    // Use the stored activeTask from state which represents the task at DragStart
    const originalTask = activeTask;

    if (!over) {
      setActiveId(null);
      setActiveTask(null);
      return;
    }

    const overId = over.id;
    let targetColumn: ColumnType | null = null;

    if (boardColumns.includes(overId as ColumnType)) {
      targetColumn = overId as ColumnType;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetColumn = overTask.column;
      }
    }

    // Compare original column with new target column
    if (originalTask && targetColumn && originalTask.column !== targetColumn) {
      moveTask(taskId, targetColumn);
    }

    setActiveId(null);
    setActiveTask(null);
  };

  const moveTask = async (taskId: string, targetColumn: ColumnType) => {
    if (selectedBoardId) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, column: targetColumn } : t)),
      );
      await firebaseMoveTask(taskId, targetColumn);
    }
  };

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.5",
        },
      },
    }),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
        Loading boards...
      </div>
    );
  }

  // --- BOARD CREATE / SELECT VIEW ---

  if (!selectedBoardId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 w-full max-w-2xl mx-auto p-4">
        {/* Error ... */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 flex items-center gap-3 backdrop-blur-md"
            >
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto hover:text-white"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!isCreatingBoard ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Your Boards</h2>
              <button
                onClick={() => {
                  setIsCreatingBoard(true);
                  setSelectedColumns(DEFAULT_SELECTION);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl font-semibold hover:bg-white/90 transition-colors"
              >
                <Plus size={16} /> New Board
              </button>
            </div>

            {boards.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-md">
                <Layout size={48} className="text-white/20 mx-auto mb-4" />
                <p className="text-white/50">
                  {error
                    ? "Could not verify existing boards."
                    : "No boards yet."}{" "}
                  <br /> Create one to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    onClick={() => setSelectedBoardId(board.id)}
                    className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group"
                  >
                    <h3 className="font-semibold text-lg text-white mb-1 group-hover:text-blue-300 transition-colors">
                      {board.name}
                    </h3>
                    <p className="text-xs text-white/40">
                      Created{" "}
                      {board.createdAt?.toDate
                        ? board.createdAt.toDate().toLocaleDateString()
                        : "Just now"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          // --- CREATE BOARD DIALOG ---
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg p-8 rounded-3xl bg-neutral-900 border border-white/10 backdrop-blur-xl shadow-2xl"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-blue-500 mb-6 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Plus size={24} className="text-white" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              Create New Board
            </h2>
            <p className="text-white/40 mb-6 text-sm">Customize your Kanban workflow.</p>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Board Name</label>
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="e.g. Q1 Roadmap"
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">Statuses</label>
                <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                  {AVAILABLE_COLUMNS.map(col => {
                    const isSelected = selectedColumns.includes(col);
                    return (
                      <button
                        key={col}
                        onClick={() => toggleColumnSelection(col)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-sm transition-all ${isSelected
                          ? "bg-blue-500/10 border-blue-500/50 text-white"
                          : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                          }`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-blue-400 bg-blue-400" : "border-white/30"
                          }`}>
                          {isSelected && <Check size={10} className="text-black" />}
                        </div>
                        {col}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setIsCreatingBoard(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white/70 font-semibold hover:bg-white/10 transition-colors hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBoard}
                disabled={!newBoardName.trim() || selectedColumns.length === 0}
                className="flex-1 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Create Board
              </button>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  // --- KANBAN VIEW ---

  if (!activeBoard) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-white/50 animate-pulse">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
        <p>Setting up your board...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedBoardId(null)}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <Layout size={18} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight hidden">
              {activeBoard.name}
            </h2>
            <div className="flex gap-2 items-center text-white/40 text-xs mt-1">
              <span>Kanban Board</span>
              <span>•</span>
              <span>{tasks.length} Tasks</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white/5 p-1 rounded-lg flex border border-white/10">
            <button
              onClick={() => setIsVerticalView(false)}
              className={`p-1.5 rounded-md transition-all ${!isVerticalView ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/80'}`}
              title="Board View"
            >
              <Columns size={16} />
            </button>
            <button
              onClick={() => setIsVerticalView(true)}
              className={`p-1.5 rounded-md transition-all ${isVerticalView ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/80'}`}
              title="List View"
            >
              <Rows size={16} />
            </button>
          </div>

          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full bg-white/10 border border-black backdrop-blur-md flex items-center justify-center text-[10px] text-white/70"
              >
                U{i}
              </div>
            ))}
            <button className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={`flex-1 ${isVerticalView ? 'overflow-y-auto px-4' : 'overflow-x-auto overflow-y-hidden'}`}>
          <div className={`${isVerticalView ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 w-full' : 'flex h-full gap-4 min-w-full pb-4'}`}>
            {boardColumns.map((column) => (
              <KanbanColumn
                key={column}
                column={column}
                isVerticalView={isVerticalView}
              >
                {/* Column Header */}
                <div className={`flex items-center justify-between ${isVerticalView ? 'p-2 mb-2 bg-transparent text-white/50 border-b border-white/10' : 'p-4 border-b border-white/5 bg-white/5'}`}>
                  <h3 className={`font-semibold text-sm flex items-center gap-2 ${isVerticalView ? 'text-white/80' : 'text-white/90'}`}>
                    {/* Status Dot */}
                    <span
                      className={`w-2 h-2 rounded-full ${column === "To Do" || column === "Backlog" || column === "Dock" ? "bg-blue-400"
                        : column === "In Progress"
                          ? "bg-yellow-400"
                          : column === "In Review" || column === "Testing"
                            ? "bg-purple-400"
                            : column === "Done" || column === "Finished"
                              ? "bg-green-400"
                              : "bg-gray-400"
                        }`}
                    />
                    {column}
                  </h3>
                  <span className={`bg-white/10 text-white/50 px-2 py-0.5 rounded text-[10px] ${isVerticalView ? 'bg-white/5' : ''}`}>
                    {tasksByColumn[column]?.length || 0}
                  </span>
                </div>

                {/* Tasks List */}
                <SortableContext
                  items={(tasksByColumn[column] || []).map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={`custom-scrollbar ${isVerticalView ? 'space-y-1' : 'flex-1 overflow-y-auto p-3 space-y-0'}`}>
                    {(tasksByColumn[column] || []).map((task) => (
                      <SortableTaskItem
                        key={task.id}
                        task={task}
                        onDelete={handleDeleteTask}
                        onEdit={setEditingTask}
                        isVerticalView={isVerticalView}
                      />
                    ))}

                    {/* Drop placeholder for empty columns */}
                    {(tasksByColumn[column] || []).length === 0 && !isVerticalView && (
                      <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl m-2 bg-white/5">
                        <p className="text-[10px] text-white/20">Drop here</p>
                      </div>
                    )}
                    {(tasksByColumn[column] || []).length === 0 && isVerticalView && (
                      <div className="py-2 px-4 border border-dashed border-white/5 rounded-lg text-center">
                        <p className="text-[10px] text-white/20">Empty</p>
                      </div>
                    )}
                  </div>
                </SortableContext>

                {/* Add Task Input */}
                <div className={`${isVerticalView ? 'mt-3 mb-2' : 'p-3 border-t border-white/5'}`}>
                  {isAddingTask === column ? (
                    <div className="space-y-2">
                      {/* Input UI */}
                      <textarea
                        autoFocus
                        value={activeTaskContent}
                        onChange={(e) => setActiveTaskContent(e.target.value)}
                        placeholder="What needs to be done?"
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm text-white placeholder:text-white/20 focus:outline-none resize-none"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddTask(column);
                          }
                          if (e.key === "Escape") setIsAddingTask(null);
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddTask(column)}
                          className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs py-1.5 rounded-lg transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setIsAddingTask(null)}
                          className="px-3 hover:bg-white/5 text-white/50 text-xs py-1.5 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsAddingTask(column);
                        setActiveTaskContent("");
                      }}
                      className={`text-xs hover:bg-white/5 transition-all flex items-center gap-2 ${isVerticalView ? 'w-auto px-4 py-2 rounded-lg text-white/30 hover:text-white border border-transparent hover:border-white/10' : 'w-full py-2 rounded-lg border border-dashed border-white/10 text-white/40 hover:text-white hover:border-white/20 justify-center'}`}
                    >
                      <Plus size={12} />
                      Add Task
                    </button>
                  )}
                </div>
              </KanbanColumn>
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <div className={`p-3 rounded-xl bg-white/10 border border-white/20 shadow-2xl backdrop-blur-md cursor-grabbing ${isVerticalView ? 'w-full' : 'w-72 md:w-80 rotate-2'}`}>
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm text-white mb-2">{activeTask.content}</p>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleUpdateTask}
        onDelete={handleDeleteTask}
        initialTask={editingTask}
      />
    </div >
  );
};
