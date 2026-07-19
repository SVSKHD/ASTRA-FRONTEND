"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Calendar, Flag, Clock, Github } from "lucide-react";
import { Task } from "@/utils/kanban-service";

export default function SharedTaskPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra-tasks", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Omit<Task, "id">;

          // Check access
          const isOwner = user && data.userId === user.id;
          // Also check board members if possible, but basic share check:
          const isSharable = data.isSharable === true;

          if (isSharable || isOwner) {
            setTask({ id: docSnap.id, ...data });
          } else {
            console.error("Unauthorized");
          }
        }
      } catch (error) {
        console.error("Error fetching task:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTask();
  }, [id, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">Task not found or private</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  const priorityColors = {
    High: "text-red-400 bg-red-400/10",
    Medium: "text-yellow-400 bg-yellow-400/10",
    Low: "text-blue-400 bg-blue-400/10",
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Background Elements */}
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="w-full bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10">
          <div className="p-8 border-b border-white/5">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold text-white leading-tight">
                {task.content}
              </h1>
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium border border-white/5 ${priorityColors[task.priority || "Medium"]}`}
              >
                {task.priority || "Medium"} Priority
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-6 text-sm text-white/40">
              <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span>
                  Created{" "}
                  {new Date(
                    task.createdAt?.toDate
                      ? task.createdAt.toDate()
                      : Date.now(),
                  ).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Flag size={14} />
                <span>{task.column}</span>
              </div>
              {task.deadline && (
                <div className="flex items-center gap-2 text-red-300/70">
                  <Clock size={14} />
                  <span>
                    Due {new Date(task.deadline).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-8 space-y-6">
            {task.description && (
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-2">
                  Description
                </h3>
                <p className="text-white/80 leading-relaxed whitespace-pre-wrap">
                  {task.description}
                </p>
              </div>
            )}

            {task.githubRepo && (
              <div>
                <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-2">
                  GitHub Integration
                </h3>
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white transition-colors"
                >
                  <Github size={16} />
                  <span>{task.githubRepo}</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
