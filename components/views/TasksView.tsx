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
  Calendar,
  Share2,
  Github,
  Settings,
  Link,
  Edit2,
  Trash2,
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
  createTask as firebaseCreateTask,
  updateTask as firebaseUpdateTask,
  moveTask as firebaseMoveTask,
  deleteTask as firebaseDeleteTask,
  deleteBoard,
  subscribeToTasks,
  Board,
  Task,
  ColumnType,
  addMemberToBoard,
  updateBoard,
} from "@/utils/kanban-service";
import { searchUsers } from "@/services/userService";
import { UserProfile } from "@/context/UserContext";
import { TaskDialog } from "../TaskDialog";
import { BoardDialog } from "../BoardDialog";
import { ShareDialog } from "../ShareDialog";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { TaskBoardCard } from "../tasks/taskBoardCard";

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
  "Parked",
];

const DEFAULT_SELECTION: ColumnType[] = [
  "To Do",
  "In Progress",
  "In Review",
  "Done",
];

// Sortable Task Component
const SortableTaskItem = ({
  task,
  onDelete,
  onEdit,
  onComplete,
  onShare,
  isVerticalView,
  members,
}: {
  task: Task;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onComplete: (task: Task) => void;
  onShare: (task: Task) => void;
  isVerticalView?: boolean;
  members?: UserProfile[];
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

  const priorityColors = {
    High: "bg-red-500",
    Medium: "bg-yellow-500",
    Low: "bg-blue-500",
  };

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
      {...listeners}
      className={`group relative rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-white/10 touch-none flex flex-col justify-between ${
        isVerticalView
          ? "p-3 flex-row items-center gap-4 mb-2"
          : "p-3 mb-3 min-h-[100px]"
      }`}
    >
      <div
        className={`flex justify-between items-start gap-2 ${isVerticalView ? "flex-1 items-center" : ""}`}
      >
        <p
          className={`text-white/80 break-words ${isVerticalView ? "text-sm font-medium mb-0" : "text-sm mb-2"}`}
        >
          {task.content}
        </p>
        <div className="flex items-center gap-2">
          {task.assignedTo &&
            members &&
            (() => {
              const assignee = members.find((m) => m.id === task.assignedTo);
              if (!assignee) return null;
              return (
                <div
                  className="w-5 h-5 rounded-full bg-white/10 overflow-hidden border border-white/10"
                  title={`Assigned to ${assignee.username}`}
                >
                  {assignee.avatarUrl ? (
                    <img
                      src={assignee.avatarUrl}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[8px] flex items-center justify-center h-full text-white/50">
                      {assignee.username[0]}
                    </span>
                  )}
                </div>
              );
            })()}
          {!isVerticalView && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical size={14} className="text-white/20" />
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex items-center justify-between ${isVerticalView ? "gap-4 border-t-0 pt-0" : "mt-2 pt-2 border-t border-white/5"}`}
      >
        <span className="text-[10px] text-white/30 whitespace-nowrap">
          {task.createdAt?.toDate
            ? task.createdAt.toDate().toLocaleDateString()
            : "Just now"}
        </span>

        <div
          className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(task); // Quick View / Edit
            }}
            className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
            title="Edit Task"
          >
            <Edit2 size={12} />
          </button>

          {task.column !== "Done" && task.column !== "Finished" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete(task);
                }}
                className="p-1 hover:bg-green-500/20 rounded text-white/50 hover:text-green-400"
                title="Mark as Done"
              >
                <CheckCircle2 size={12} />
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="p-1 hover:bg-red-500/20 rounded text-white/50 hover:text-red-400"
            title="Delete Task"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShare(task);
            }}
            className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
            title="Share"
          >
            <Share2 size={12} />
          </button>

          {task.githubRepo && (
            <a
              href={`https://github.com/${task.githubRepo}${
                task.githubPath
                  ? `/blob/${task.githubBranch || "main"}/${task.githubPath}`
                  : task.githubBranch
                    ? `/tree/${task.githubBranch}`
                    : ""
              }`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
              title={`Open in GitHub: ${task.githubRepo}`}
            >
              <Github size={12} />
            </a>
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
  isVerticalView,
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
        className={`flex flex-col rounded-2xl border transition-colors duration-200 overflow-hidden w-full ${
          isActive
            ? "bg-white/10 border-blue-500/30"
            : "bg-white/5 border-white/5 backdrop-blur-sm"
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex-none w-72 md:w-80 flex flex-col rounded-2xl border transition-colors duration-200 overflow-hidden h-full max-h-[600px] ${
        isActive
          ? "bg-white/10 border-blue-500/30"
          : "bg-white/5 border-white/5 backdrop-blur-sm"
      }`}
    >
      {children}
    </div>
  );
};

import { useUser } from "@/context/UserContext";

// ... existing imports

export const TasksView = () => {
  const { user } = useUser();
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    taskId: string | null;
  }>({
    isOpen: false,
    taskId: null,
  });

  const [shareDialog, setShareDialog] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
    isSharable?: boolean;
    onToggle?: (status: boolean) => void;
  }>({
    isOpen: false,
    title: "",
    content: "",
    isSharable: false,
  });

  const handleShare = (task: Task) => {
    const isSharable = task.isSharable || false;
    const url = `${window.location.origin}/tasks/${task.id}`;

    setShareDialog({
      isOpen: true,
      title: `Share "${task.content}"`,
      content: url,
      isSharable,
      onToggle: async (newStatus: boolean) => {
        setShareDialog((prev) => ({ ...prev, isSharable: newStatus }));
        try {
          await firebaseUpdateTask(task.id, { isSharable: newStatus });
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, isSharable: newStatus } : t,
            ),
          );
        } catch (e) {
          console.error("Failed to update share status", e);
          setShareDialog((prev) => ({ ...prev, isSharable: !newStatus }));
        }
      },
    });
  };

  // Layout preference (could be saved to local storage)
  const [isVerticalView, setIsVerticalView] = useState(false);

  // DND State
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Board Creation State
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);

  const [activeTaskContent, setActiveTaskContent] = useState("");
  const [isAddingTask, setIsAddingTask] = useState<ColumnType | null>(null);

  // Invite Member State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Edit Board State
  const [isEditingBoard, setIsEditingBoard] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardName, setEditingBoardName] = useState("");
  const [editingBoardColumns, setEditingBoardColumns] = useState<ColumnType[]>(
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor),
  );

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === selectedBoardId),
    [boards, selectedBoardId],
  );

  const boardColumns = useMemo(() => {
    return activeBoard?.columns || DEFAULT_SELECTION;
  }, [activeBoard]);

  const tasksByColumn = useMemo(() => {
    const acc: Record<string, Task[]> = {};
    boardColumns.forEach((col) => {
      acc[col] = [];
    });

    tasks.forEach((task) => {
      if (acc[task.column]) {
        acc[task.column].push(task);
      } else {
        // If a task ends up in a legacy column, or one not visible, we can group it under the first one or a "Parked" one if it exists.
        // For now, let's look for "Backlog" or "Parked"
        const fallback = boardColumns.includes("Backlog")
          ? "Backlog"
          : boardColumns.includes("Parked")
            ? "Parked"
            : boardColumns[0];
        if (acc[fallback]) acc[fallback].push(task);
      }
    });
    return acc;
  }, [tasks, boardColumns]);

  useEffect(() => {
    if (!user?.id) {
      setBoards([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToBoards(
      user.id,
      (fetchedBoards) => {
        setBoards(fetchedBoards);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Failed to load boards:", err);
        setError(
          "Unable to load boards. Please check your connection or configuration.",
        );
        setIsLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user]);

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

  const handleSearchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchUsers(query);
      // Filter out existing members
      const currentMemberIds = activeBoard?.members?.map((m) => m.id) || [];
      // Also filter out self
      const filtered = results.filter(
        (u) => u.id !== user?.id && !currentMemberIds.includes(u.id),
      );
      setSearchResults(filtered);
    } catch (e) {
      console.error("Search failed", e);
    }
    setIsSearching(false);
  };

  const handleAddMember = async (member: UserProfile) => {
    if (!selectedBoardId) return;
    try {
      await addMemberToBoard(selectedBoardId, member);
      setIsInviteOpen(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch (e) {
      console.error("Failed to add member", e);
      setError("Failed to add member.");
    }
  };

  const handleCreateBoard = async (name: string, columns: ColumnType[]) => {
    if (name.trim() && user?.id) {
      try {
        setError(null);
        const columnsToSave = columns.length > 0 ? columns : DEFAULT_SELECTION;

        setIsCreatingBoard(false);
        const boardId = await createBoard(name.trim(), user.id, columnsToSave);

        setSelectedBoardId(boardId);
      } catch (error) {
        console.error("Failed to create board", error);
        setError("Failed to create board. Please try again.");
        setIsCreatingBoard(true);
      }
    }
  };

  const handleUpdateBoard = async (name: string, columns: ColumnType[]) => {
    const targetId = editingBoardId || selectedBoardId;
    if (name.trim() && targetId) {
      try {
        await updateBoard(targetId, {
          name: name.trim(),
          columns: columns,
        });
        setIsEditingBoard(false);
        setEditingBoardId(null);
      } catch (error) {
        console.error("Failed to update board", error);
        setError("Failed to update board.");
      }
    }
  };

  const handleShareBoard = () => {
    if (selectedBoardId && activeBoard) {
      const url = `${window.location.origin}/boards/${selectedBoardId}`;
      const isSharable = activeBoard.isSharable || false;

      setShareDialog({
        isOpen: true,
        title: "Share Board",
        content: url,
        isSharable,
        onToggle: async (newStatus: boolean) => {
          setShareDialog((prev) => ({ ...prev, isSharable: newStatus }));
          try {
            await updateBoard(selectedBoardId!, { isSharable: newStatus });
            setBoards((prev) =>
              prev.map((b) =>
                b.id === selectedBoardId ? { ...b, isSharable: newStatus } : b,
              ),
            );
          } catch (e) {
            console.error("Failed to update board share status", e);
            setShareDialog((prev) => ({ ...prev, isSharable: !newStatus }));
          }
        },
      });
    }
  };

  // Effect to load board from URL param if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const boardIdParam = params.get("boardId");
    if (boardIdParam && boards.length > 0) {
      // Only switch if we have the board (user has access)
      const targetBoard = boards.find((b) => b.id === boardIdParam);
      if (targetBoard) {
        setSelectedBoardId(boardIdParam);
      }
    }
  }, [boards]);

  const handleDeleteBoard = async () => {
    console.log("handleDeleteBoard called", boardToDelete);
    if (boardToDelete) {
      try {
        console.log("Calling service deleteBoard with", boardToDelete.id);
        await deleteBoard(boardToDelete.id);
        setBoardToDelete(null);
      } catch (error) {
        console.error("Failed to delete board", error);
        setError("Failed to delete board. Please try again.");
      }
    }
  };

  const handleSaveTask = async (
    taskId: string | undefined,
    updates: Partial<Task>,
  ) => {
    if (taskId) {
      // Update existing
      await firebaseUpdateTask(taskId, updates);
      setEditingTask(null);
    } else if (isAddingTask && selectedBoardId) {
      // Create new
      // We need to pass required fields. 'content' and 'column' are mandatory.
      // The updates object from TaskDialog will contain content, description, priority, deadline, etc.
      // But addTask expects explicit args. Let's update addTask signature OR call addDoc here directly OR update addTask to take an object.
      // Let's stick to calling firebaseAddTask but we might need to update it or manually construct the call.
      // Actually, the Plan said "Implement handleCreateTask to receive data...".

      // Let's check kanban-service.ts addTask signature:
      // export const addTask = async (boardId: string, content: string, column: ColumnType) => ...
      // It sets priority to Medium by default. It doesn't take other fields yet.
      // I should probably update kanban-service.ts to accept a Task object or Partial<Task>.

      // CHECK: I'll update this handler to use a new service method or just modify addTask in next step if needed.
      // For now, let's assume I will update kanban-service to allow passing full task details.
      // Wait, I haven't updated addTask in kanban-service to take extra fields yet!
      // I added fields to the interface but addTask still only takes (boardId, content, column).

      // I should update kanban-service.ts first or do it effectively here.
      // Let's use firebaseAddTask but I'll need to update it to accept the other fields.
      // For this step, I'll write the logic assuming firebaseAddTask will be updated or I'll implement a flexible adder.

      // Actually, let's just make `handleSaveTask` call `firebaseAddTask` with the content, and then immediately `firebaseUpdateTask` with the rest? No, that's sloppy.
      // I will update TasksView to assume `firebaseAddTask` can take an object or I will create `createTask` in service.

      // Let's temporarily call a new function `createTask` which I will add to service.
      if (user?.id) {
        await firebaseCreateTask(
          selectedBoardId,
          updates as any,
          isAddingTask,
          user.id,
        );
      }
      setIsAddingTask(null);
    }
  };

  const handleUpdateTask = async (
    taskId: string | undefined,
    updates: Partial<Task>,
  ) => {
    if (taskId) {
      await firebaseUpdateTask(taskId, updates);
    }
    setEditingTask(null);
  };

  const handleDeleteTask = (taskId: string) => {
    setDeleteConfirmation({ isOpen: true, taskId });
  };

  const confirmDeleteTask = async () => {
    if (deleteConfirmation.taskId) {
      await firebaseDeleteTask(deleteConfirmation.taskId);
      if (editingTask?.id === deleteConfirmation.taskId) {
        setEditingTask(null);
      }
    }
    setDeleteConfirmation({ isOpen: false, taskId: null });
  };

  const handleCompleteTask = async (task: Task) => {
    if (!task.id) return;
    try {
      await firebaseUpdateTask(task.id, { column: "Done" });
    } catch (error) {
      console.error("Failed to mark task as complete:", error);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setActiveTask(
      active.data.current?.task ||
        tasks.find((t) => t.id === active.id) ||
        null,
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {boards.map((board) => (
                  <TaskBoardCard
                    key={board.id}
                    board={board}
                    onClick={() => setSelectedBoardId(board.id)}
                    onEdit={(b) => {
                      setEditingBoardId(b.id);
                      setEditingBoardName(b.name);
                      setEditingBoardColumns(b.columns || []);
                      setIsEditingBoard(true);
                    }}
                    onDelete={(b) => setBoardToDelete(b)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          // --- CREATE BOARD DIALOG ---
          <BoardDialog
            isOpen={isCreatingBoard}
            onClose={() => setIsCreatingBoard(false)}
            onSave={handleCreateBoard}
            isCreation={true}
          />
        )}

        {/* EDIT BOARD DIALOG - Added here for list view */}
        <BoardDialog
          isOpen={isEditingBoard}
          onClose={() => setIsEditingBoard(false)}
          onSave={handleUpdateBoard}
          initialName={editingBoardName}
          initialColumns={editingBoardColumns}
          title="Board Settings"
          subtitle="Manage your board's name and workflow."
          confirmLabel="Save Changes"
        />

        {/* DELETE BOARD CONFIRMATION DIALOG */}
        <DeleteConfirmationDialog
          isOpen={!!boardToDelete}
          onClose={() => setBoardToDelete(null)}
          onConfirm={handleDeleteBoard}
          title="Delete Board?"
          description={
            <p className="text-white/50 text-center text-sm">
              Are you sure you want to delete{" "}
              <span className="text-white font-medium">
                "{boardToDelete?.name}"
              </span>
              ? First we will delete all tasks in this board and then the board
              itself. <br />
              This action cannot be undone.
            </p>
          }
        />
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
              className={`p-1.5 rounded-md transition-all ${!isVerticalView ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/80"}`}
              title="Board View"
            >
              <Columns size={16} />
            </button>
            <button
              onClick={() => setIsVerticalView(true)}
              className={`p-1.5 rounded-md transition-all ${isVerticalView ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/80"}`}
              title="List View"
            >
              <Rows size={16} />
            </button>

            <div className="w-px h-6 bg-white/10 mx-1" />
            <button
              onClick={() => {
                setEditingBoardId(activeBoard.id);
                setEditingBoardName(activeBoard.name);
                setEditingBoardColumns(activeBoard.columns || []);
                setIsEditingBoard(true);
              }}
              className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
              title="Edit Board"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={handleShareBoard}
              className={`p-1.5 rounded-md transition-all ${activeBoard.isSharable ? "text-green-400 bg-green-500/10" : "text-white/40 hover:text-white/80 hover:bg-white/10"}`}
              title="Share Board"
            >
              <Share2 size={16} />
            </button>
            <button
              onClick={() => setBoardToDelete(activeBoard)}
              className="p-1.5 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Delete Board"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex -space-x-2 relative">
            {activeBoard?.members?.map((m) => (
              <div
                key={m.id}
                className="w-8 h-8 rounded-full bg-white/10 border border-black backdrop-blur-md flex items-center justify-center overflow-hidden"
                title={m.username}
              >
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={m.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] text-white/70">
                    {m.username.charAt(0)}
                  </span>
                )}
              </div>
            ))}
            <div className="relative">
              <button
                onClick={() => setIsInviteOpen(!isInviteOpen)}
                className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50"
                title="Invite Member"
              >
                <Plus size={14} />
              </button>

              {isInviteOpen && (
                <div className="absolute top-10 right-0 w-72 bg-[#111] border border-white/10 rounded-xl shadow-2xl p-4 z-50 backdrop-blur-xl">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-semibold text-white">
                      Invite Member
                    </h4>
                    <button onClick={() => setIsInviteOpen(false)}>
                      <X size={14} className="text-white/50 hover:text-white" />
                    </button>
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(e) => handleSearchUsers(e.target.value)}
                    placeholder="Search by email..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-2 focus:outline-none focus:border-white/30"
                    autoFocus
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                    {isSearching ? (
                      <p className="text-xs text-white/30 text-center py-2">
                        Searching...
                      </p>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => handleAddMember(u)}
                          className="w-full flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg text-left transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                            {u.avatarUrl ? (
                              <img
                                src={u.avatarUrl}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px]">
                                {u.username[0]}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">
                              {u.username}
                            </p>
                            <p className="text-[10px] text-white/40 truncate">
                              {u.email}
                            </p>
                          </div>
                          <Plus size={14} className="text-blue-400" />
                        </button>
                      ))
                    ) : searchQuery.length >= 3 ? (
                      <p className="text-xs text-white/30 text-center py-2">
                        No users found.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
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
        <div
          className={`flex-1 ${isVerticalView ? "overflow-y-auto px-4" : "overflow-x-auto overflow-y-hidden"}`}
        >
          <div
            className={`${isVerticalView ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 w-full" : "flex h-full gap-4 min-w-full pb-4"}`}
          >
            {boardColumns.map((column) => (
              <KanbanColumn
                key={column}
                column={column}
                isVerticalView={isVerticalView}
              >
                {/* Column Header */}
                <div
                  className={`flex items-center justify-between ${isVerticalView ? "p-2 mb-2 bg-transparent text-white/50 border-b border-white/10" : "p-4 border-b border-white/5 bg-white/5"}`}
                >
                  <h3
                    className={`font-semibold text-sm flex items-center gap-2 ${isVerticalView ? "text-white/80" : "text-white/90"}`}
                  >
                    {/* Status Dot */}
                    <span
                      className={`w-2 h-2 rounded-full ${
                        column === "To Do" ||
                        column === "Backlog" ||
                        column === "Dock"
                          ? "bg-blue-400"
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
                  <span
                    className={`bg-white/10 text-white/50 px-2 py-0.5 rounded text-[10px] ${isVerticalView ? "bg-white/5" : ""}`}
                  >
                    {tasksByColumn[column]?.length || 0}
                  </span>
                </div>

                {/* Tasks List */}
                <SortableContext
                  items={(tasksByColumn[column] || []).map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    className={`custom-scrollbar ${isVerticalView ? "space-y-1" : "flex-1 overflow-y-auto p-3 space-y-0"}`}
                  >
                    {(tasksByColumn[column] || []).map((task) => (
                      <SortableTaskItem
                        key={task.id}
                        task={task}
                        onDelete={handleDeleteTask}
                        onEdit={setEditingTask}
                        onComplete={handleCompleteTask}
                        onShare={handleShare}
                        isVerticalView={isVerticalView}
                        members={activeBoard?.members}
                      />
                    ))}

                    {/* Drop placeholder for empty columns */}
                    {(tasksByColumn[column] || []).length === 0 &&
                      !isVerticalView && (
                        <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl m-2 bg-white/5">
                          <p className="text-[10px] text-white/20">Drop here</p>
                        </div>
                      )}
                    {(tasksByColumn[column] || []).length === 0 &&
                      isVerticalView && (
                        <div className="py-2 px-4 border border-dashed border-white/5 rounded-lg text-center">
                          <p className="text-[10px] text-white/20">Empty</p>
                        </div>
                      )}
                  </div>
                </SortableContext>

                {/* Add Task Button */}
                <div
                  className={`${isVerticalView ? "mt-3 mb-2" : "p-3 border-t border-white/5"}`}
                >
                  <button
                    onClick={() => {
                      setIsAddingTask(column);
                      setActiveTaskContent("");
                    }}
                    className={`text-xs hover:bg-white/5 transition-all flex items-center gap-2 ${isVerticalView ? "w-auto px-4 py-2 rounded-lg text-white/30 hover:text-white border border-transparent hover:border-white/10" : "w-full py-2 rounded-lg border border-dashed border-white/10 text-white/40 hover:text-white hover:border-white/20 justify-center"}`}
                  >
                    <Plus size={12} />
                    Add Task
                  </button>
                </div>
              </KanbanColumn>
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <div
              className={`p-3 rounded-xl bg-white/10 border border-white/20 shadow-2xl backdrop-blur-md cursor-grabbing ${isVerticalView ? "w-full" : "w-72 md:w-80 rotate-2"}`}
            >
              <div className="flex justify-between items-start gap-2">
                <p className="text-sm text-white mb-2">{activeTask.content}</p>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        isOpen={!!editingTask || !!isAddingTask}
        onClose={() => {
          setEditingTask(null);
          setIsAddingTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        initialTask={editingTask}
        members={activeBoard?.members || []}
      />

      <DeleteConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, taskId: null })}
        onConfirm={confirmDeleteTask}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
      />

      <ShareDialog
        isOpen={shareDialog.isOpen}
        onClose={() => setShareDialog((prev) => ({ ...prev, isOpen: false }))}
        title={shareDialog.title}
        content={shareDialog.content}
        isSharable={shareDialog.isSharable}
        onToggleShare={shareDialog.onToggle}
      />

      {/* Edit Board Dialog */}
      <BoardDialog
        isOpen={isEditingBoard}
        onClose={() => setIsEditingBoard(false)}
        onSave={handleUpdateBoard}
        initialName={editingBoardName}
        initialColumns={editingBoardColumns}
        title="Board Settings"
        subtitle="Manage your board's name and workflow."
        confirmLabel="Save Changes"
      />
    </div>
  );
};
