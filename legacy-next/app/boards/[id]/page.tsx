"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Share2, Github, CheckCircle2 } from "lucide-react";
import { Board, Task, ColumnType } from "@/utils/kanban-service";

export default function SharedBoardPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBoardAndTasks = async () => {
      try {
        if (typeof id !== "string") return;

        // 1. Fetch Board
        const boardRef = doc(db, "astra-boards", id);
        const boardSnap = await getDoc(boardRef);

        if (!boardSnap.exists()) {
          console.error("Board not found");
          setLoading(false);
          return;
        }

        const boardData = boardSnap.data() as Omit<Board, "id">;
        const isOwner = user && boardData.userId === user.id;
        const isSharable = boardData.isSharable === true;
        // Also check members if needed

        if (isSharable || isOwner) {
          setBoard({ id: boardSnap.id, ...boardData });

          // 2. Fetch Tasks
          // We can fetch tasks because we are "in" the board context now.
          // Note: Firestore rules need to allow this read.
          const tasksQ = query(
            collection(db, "astra-tasks"),
            where("boardId", "==", id),
          );
          const tasksSnap = await getDocs(tasksQ);
          const fetchedTasks = tasksSnap.docs.map(
            (doc) => ({ id: doc.id, ...doc.data() }) as Task,
          );

          // Client-side sort
          fetchedTasks.sort((a, b) => {
            const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tB - tA;
          });

          setTasks(fetchedTasks);
        } else {
          console.error("Unauthorized");
        }
      } catch (error) {
        console.error("Error fetching board:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBoardAndTasks();
  }, [id, user]);

  const boardColumns = useMemo(() => {
    return board?.columns || ["To Do", "In Progress", "Done"];
  }, [board]);

  const tasksByColumn = useMemo(() => {
    const acc: Record<string, Task[]> = {};
    boardColumns.forEach((col) => {
      acc[col] = [];
    });
    tasks.forEach((task) => {
      if (acc[task.column]) {
        acc[task.column].push(task);
      } else {
        // Fallback
        if (acc[boardColumns[0]]) acc[boardColumns[0]].push(task);
      }
    });
    return acc;
  }, [tasks, boardColumns]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">Board not found or private</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 relative overflow-hidden font-sans flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-green-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 w-full h-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-2xl font-bold">{board.name}</h1>
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] rounded uppercase tracking-wider font-medium">
              Public View
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {board.members?.map((m: any) => (
                <div
                  key={m.id}
                  className="w-8 h-8 rounded-full border-2 border-black bg-white/10 overflow-hidden"
                  title={m.username}
                >
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex gap-4 h-full min-w-max">
            {boardColumns.map((col) => (
              <div key={col} className="w-80 flex flex-col h-full opacity-100">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-medium text-white/70">{col}</h3>
                  <span className="text-xs text-white/30">
                    {tasksByColumn[col]?.length || 0}
                  </span>
                </div>

                <div className="flex-1 bg-white/5 border border-white/5 rounded-2xl p-3 overflow-y-auto space-y-3 backdrop-blur-sm">
                  {tasksByColumn[col]?.map((task) => (
                    <div
                      key={task.id}
                      className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl p-3 shadow-sm transition-colors cursor-pointer group"
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <p className="text-sm text-white/90">{task.content}</p>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-white/30">
                        <span>
                          {task.createdAt?.toDate
                            ? task.createdAt.toDate().toLocaleDateString()
                            : "Just now"}
                        </span>
                        {task.priority && (
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              task.priority === "High"
                                ? "bg-red-500/20 text-red-400"
                                : task.priority === "Medium"
                                  ? "bg-yellow-500/20 text-yellow-400"
                                  : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {task.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {tasksByColumn[col]?.length === 0 && (
                    <div className="h-20 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl">
                      <p className="text-[10px] text-white/20">Empty</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
