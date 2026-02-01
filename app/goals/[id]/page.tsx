"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Calendar, Flag, AlignLeft, Target } from "lucide-react";

import { Goal } from "@/utils/goals-service";

export default function GoalPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchGoal = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra-goals", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Omit<Goal, "id">;
          if (data.userId === user.id || user.role === "admin") {
            setGoal({ id: docSnap.id, ...data });
          } else {
            console.error("Unauthorized");
          }
        }
      } catch (error) {
        console.error("Error fetching goal:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGoal();
  }, [id, user]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        {/* Background Elements */}
        <div className="fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        </div>
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin z-10" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white relative overflow-hidden">
        {/* Background Elements */}
        <div className="fixed inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        </div>

        <p className="opacity-50 mb-4 z-10">Goal not found</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline z-10"
        >
          Go Home
        </button>
      </div>
    );
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "medium":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "low":
        return "text-green-400 bg-green-500/10 border-green-500/20";
      default:
        return "text-white/50 bg-white/5 border-white/10";
    }
  };

  return (
    <div className="min-h-screen text-white p-6 flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Background Elements */}
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] bg-orange-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-4xl relative z-10">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="w-full bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10 min-h-[40vh]">
          {/* Header */}
          <div className="flex items-start justify-between p-8 border-b border-white/5">
            <div className="flex gap-4">
              <div className="p-3 rounded-xl bg-orange-500/10 text-orange-500 h-fit">
                <Target size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">
                  {goal.title}
                </h1>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${getPriorityColor(goal.priority)}`}
                >
                  <Flag size={12} />
                  <span className="capitalize">{goal.priority} Priority</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/50 text-sm font-medium">
                <Calendar size={16} />
                <span>Target Date</span>
              </div>
              <p className="text-lg text-white">
                {new Date(goal.deadline).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            {goal.notes && (
              <div className="space-y-2 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 text-white/50 text-sm font-medium">
                  <AlignLeft size={16} />
                  <span>Notes</span>
                </div>
                <div className="prose prose-invert max-w-none text-white/80 whitespace-pre-wrap">
                  {goal.notes}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
