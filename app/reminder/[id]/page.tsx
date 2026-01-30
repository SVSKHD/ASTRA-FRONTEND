"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { Reminder } from "@/services/remindersService";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Calendar, Clock, RotateCw, Bell } from "lucide-react";

export default function ReminderPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return; // Wait for user auth

    const fetchReminder = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra-reminders", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Reminder;
          // Security check: only show if user owns it (optional, but good practice)
          if (data.userId === user.id) {
            setReminder({ id: docSnap.id, ...data });
          } else {
            // Handle unauthorized (or just show not found)
            console.error("Unauthorized access");
          }
        }
      } catch (error) {
        console.error("Error fetching reminder:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReminder();
  }, [id, user]);

  if (!user) {
    // Redirect or show login (Layout handles basic auth, but just in case)
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!reminder) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">Reminder not found</p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
  }

  const date = reminder.dateTime.toDate
    ? reminder.dateTime.toDate()
    : new Date(reminder.dateTime);

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

        <div className="bg-[#111] border border-white/10 rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />

          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6">
            <Bell size={32} className="text-white/80" />
          </div>

          <h1 className="text-2xl font-bold mb-2">{reminder.title}</h1>
          {reminder.description && (
            <p className="text-white/50 mb-6 leading-relaxed">
              {reminder.description}
            </p>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/70">
              <Calendar size={18} className="text-white/30" />
              <span>
                {date.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <Clock size={18} className="text-white/30" />
              <span>
                {date.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {reminder.recurrence !== "None" && (
              <div className="flex items-center gap-3 text-white/70">
                <RotateCw size={18} className="text-white/30" />
                <span>
                  {reminder.recurrence === "Custom"
                    ? `Repeat every ${reminder.customInterval} days`
                    : `Repeat ${reminder.recurrence}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
