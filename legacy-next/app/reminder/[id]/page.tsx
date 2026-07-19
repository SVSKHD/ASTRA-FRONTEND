"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/utils/firebase";
import { Reminder } from "@/services/remindersService";
import { useUser } from "@/context/UserContext";
import {
  ArrowLeft,
  Calendar,
  Clock,
  RotateCw,
  Bell,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function ReminderPage() {
  const { id } = useParams();
  const { user } = useUser();
  const router = useRouter();
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(true);

  const [unauthorized, setUnauthorized] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );

  useEffect(() => {
    const fetchReminder = async () => {
      try {
        if (typeof id !== "string") return;
        const docRef = doc(db, "astra-reminders", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Omit<Reminder, "id">;
          if (
            data.isShared ||
            (user && (data.userId === user.id || user.role === "admin"))
          ) {
            setReminder({ id: docSnap.id, ...data });
          } else {
            setUnauthorized(true);
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

  if (unauthorized) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="opacity-50 mb-4">
          Unauthorized to view this reminder. It may be private.
        </p>
        <button
          onClick={() => router.push("/")}
          className="text-blue-400 hover:underline"
        >
          Go Home
        </button>
      </div>
    );
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

  const getOccurrencesForYear = (
    baseDate: Date,
    recurrence: string,
    targetYear: number,
    interval?: number,
  ) => {
    if (targetYear < baseDate.getFullYear()) return [];

    let nextDate = new Date(baseDate);
    const occurrences: Date[] = [];

    let iterations = 0;
    while (nextDate.getFullYear() < targetYear && iterations < 100000) {
      if (recurrence === "Daily") nextDate.setDate(nextDate.getDate() + 1);
      else if (recurrence === "Weekly")
        nextDate.setDate(nextDate.getDate() + 7);
      else if (recurrence === "Monthly")
        nextDate.setMonth(nextDate.getMonth() + 1);
      else if (recurrence === "Yearly")
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      else if (recurrence === "Custom" && interval)
        nextDate.setDate(nextDate.getDate() + interval);
      else break;
      iterations++;
    }

    iterations = 0;
    // Cap at 400 iterations per year to support daily occurrences safely
    while (nextDate.getFullYear() === targetYear && iterations < 400) {
      occurrences.push(new Date(nextDate));
      if (recurrence === "Daily") nextDate.setDate(nextDate.getDate() + 1);
      else if (recurrence === "Weekly")
        nextDate.setDate(nextDate.getDate() + 7);
      else if (recurrence === "Monthly")
        nextDate.setMonth(nextDate.getMonth() + 1);
      else if (recurrence === "Yearly")
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      else if (recurrence === "Custom" && interval)
        nextDate.setDate(nextDate.getDate() + interval);
      else break;
      iterations++;
    }

    return occurrences;
  };

  const upcomingOccurrences =
    reminder.recurrence !== "None"
      ? getOccurrencesForYear(
          date,
          reminder.recurrence,
          selectedYear,
          reminder.customInterval,
        )
      : [];

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
              <div className="flex items-start gap-3 text-white/70">
                <RotateCw size={18} className="text-white/30 mt-0.5" />
                <div className="flex-1">
                  <span className="block mb-2 font-medium">
                    {reminder.recurrence === "Custom"
                      ? `Repeat every ${reminder.customInterval} days`
                      : `Repeat ${reminder.recurrence}`}
                  </span>

                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 mt-3">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-white/30">
                        Schedule
                      </h3>
                      <div className="flex items-center gap-2 bg-black/40 rounded-lg px-2 py-1 border border-white/5">
                        <button
                          onClick={() => setSelectedYear((y) => y - 1)}
                          className="p-0.5 text-white/40 hover:text-white transition-colors"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-bold text-white/80 w-10 text-center select-none tracking-wider">
                          {selectedYear}
                        </span>
                        <button
                          onClick={() => setSelectedYear((y) => y + 1)}
                          className="p-0.5 text-white/40 hover:text-white transition-colors"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-52 overflow-y-auto custom-scrollbar pr-2">
                      {upcomingOccurrences.length === 0 ? (
                        <div className="text-xs text-white/30 text-center py-6 border border-dashed border-white/5 rounded-xl">
                          No occurrences in {selectedYear}
                        </div>
                      ) : (
                        upcomingOccurrences.map((upDate, idx) => {
                          const isPast =
                            upDate.getTime() < new Date().getTime();
                          // Highlight the very first future occurrence
                          const isNext =
                            !isPast &&
                            (idx === 0 ||
                              upcomingOccurrences[idx - 1]?.getTime() <
                                new Date().getTime());
                          return (
                            <div
                              key={idx}
                              className={`flex justify-between items-center text-sm ${isPast ? "opacity-30" : "opacity-100"}`}
                            >
                              <span
                                className={`${isNext ? "text-blue-400 font-medium" : "text-white/60"}`}
                              >
                                {upDate.toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                              <span
                                className={`${isNext ? "text-blue-400/70" : "text-white/30"}`}
                              >
                                {upDate.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
