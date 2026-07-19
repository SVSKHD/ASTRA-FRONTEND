"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Check, Clock, Calendar, AlertCircle } from "lucide-react";
import { Task } from "@/utils/kanban-service";

export default function TaskPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchTask = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra-tasks", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Task;
          if (data.userId === user.id) {
            setTask({ ...data, id: docSnap.id });
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

  if (!user) return null;

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
        <p className="opacity-50 mb-4">Task not found</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  const getPriorityColor = (p?: string) => {
    if (p === "High") return "text-red-400 bg-red-500/10 border-red-500/20";
    if (p === "Medium")
      return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
    return "text-green-400 bg-green-500/10 border-green-500/20";
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="bg-[#111] border border-white/10 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-6">
            <span
              className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${getPriorityColor(task.priority)}`}
            >
              {task.priority || "Low"}
            </span>
            <span className="text-white/30 text-xs">{task.column}</span>
          </div>

          <h1 className="text-2xl font-bold mb-4">{task.content}</h1>

          {task.description && (
            <p className="text-white/50 mb-6 leading-relaxed">
              {task.description}
            </p>
          )}

          <div className="space-y-4 pt-6 border-t border-white/5">
            {task.deadline && (
              <div className="flex items-center gap-3 text-white/70">
                <Calendar size={16} className="text-white/30" />
                <span>Due: {new Date(task.deadline).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-white/70">
              <Clock size={16} className="text-white/30" />
              <span>
                Est: {task.estimatedTime ? `${task.estimatedTime}h` : "N/A"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
