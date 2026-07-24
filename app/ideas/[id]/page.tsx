"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { useUser } from "@/context/UserContext";
import {
  ArrowLeft,
  Calendar,
  Lightbulb,
  Clock,
  Tag as TagIcon,
} from "lucide-react";
import { Idea } from "@/services/ideasService";
import { dueLabel, isOverdue, fullTimestamp } from "@/utils/time";

export default function SharedIdeaPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [idea, setIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIdea = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra_ideas", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Omit<Idea, "id">;
          const isOwner =
            user && (data.userId === user.id || user.role === "admin");
          if (data.isShared === true || isOwner) {
            setIdea({ id: docSnap.id, ...data });
          } else {
            console.error("Unauthorized");
          }
        }
      } catch (error) {
        console.error("Error fetching idea:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchIdea();
  }, [id, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">Idea not found or private</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  const timeline = idea.timeline || [];
  const overdue = isOverdue(idea.deadline);

  return (
    <div className="min-h-screen text-white p-6 flex flex-col items-center relative overflow-hidden font-sans">
      <div className="fixed inset-0 z-0 bg-black">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-amber-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10 py-8">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </button>

        <div className="w-full bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10">
          <div className="p-8 border-b border-white/5">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {idea.ideaType && (
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/20 font-medium">
                  <Lightbulb size={12} /> {idea.ideaType}
                </span>
              )}
              {idea.deadline && (
                <span
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium border ${
                    overdue
                      ? "bg-red-500/15 text-red-300 border-red-500/20"
                      : "bg-white/5 text-white/60 border-white/10"
                  }`}
                >
                  <Calendar size={12} /> {dueLabel(idea.deadline)}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white leading-tight">
              {idea.title}
            </h1>
            {idea.description && (
              <p className="text-white/60 leading-relaxed mt-3 whitespace-pre-wrap">
                {idea.description}
              </p>
            )}
            {(idea.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {(idea.tags || []).map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white/5 text-white/60 border border-white/10"
                  >
                    <TagIcon size={10} /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {timeline.length > 0 && (
            <div className="p-8">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-5">
                Execution Timeline
              </h3>
              <div className="space-y-0 pl-6 border-l-2 border-white/10 ml-1">
                {timeline.map((event, i) => (
                  <div key={event.id} className="relative pb-6 pl-6">
                    <div
                      className={`absolute -left-[33px] top-1.5 w-3.5 h-3.5 rounded-full ring-4 ring-[#0a0a0a] ${
                        i === timeline.length - 1
                          ? "bg-amber-400"
                          : "bg-white/30"
                      }`}
                    />
                    <div className="flex items-center gap-2">
                      <h4 className="text-white/90 font-bold">{event.title}</h4>
                      <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(event.date).toLocaleDateString()}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-white/50 mt-1 leading-relaxed">
                        {event.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-8 py-4 border-t border-white/5 text-xs text-white/30">
            Created {fullTimestamp(idea.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
