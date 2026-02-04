import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Plus,
  Calendar as CalendarIcon,
  RotateCw,
  MoreVertical,
  CheckCircle2,
  Circle,
  Trash2,
  Edit2,
  Clock,
  Share2,
} from "lucide-react";
import {
  createReminder,
  subscribeToReminders,
  updateReminder,
  deleteReminder,
  Reminder,
} from "@/services/remindersService";
import { useUser } from "@/context/UserContext";
import { ReminderDialog } from "../ReminderDialog";
import { ShareDialog } from "../ShareDialog";

export const RemindersView = () => {
  const { user } = useUser();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [shareDialog, setShareDialog] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
  }>({
    isOpen: false,
    title: "",
    content: "",
  });

  const handleShare = (reminder: Reminder) => {
    const url = `${window.location.origin}/reminder/${reminder.id}`;
    setShareDialog({
      isOpen: true,
      title: `Share "${reminder.title}"`,
      content: url,
    });
  };

  const [isLoading, setIsLoading] = useState(true);

  // Sync with user's reminders
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToReminders(user.id, (data) => {
      setReminders(data);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleSave = async (data: any) => {
    if (!user?.id) return;

    try {
      if (editingReminder) {
        await updateReminder(editingReminder.id, data);
      } else {
        await createReminder(user.id, data);
      }
    } catch (error) {
      console.error("Failed to save reminder:", error);
    }
    setEditingReminder(null);
  };

  const toggleComplete = async (reminder: Reminder) => {
    try {
      await updateReminder(reminder.id, {
        isCompleted: !reminder.isCompleted,
      });
    } catch (error) {
      console.error("Failed to toggle completion:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this reminder?")) {
      await deleteReminder(id);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  };

  const activeReminders = reminders.filter((r) => !r.isCompleted);
  const completedReminders = reminders.filter((r) => r.isCompleted);

  return (
    <div className="w-full max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Reminders</h2>
          <p className="text-white/40 text-sm">
            Manage your tasks and notifications
          </p>
        </div>
        <button
          onClick={() => {
            setEditingReminder(null);
            setIsDialogOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-xl font-semibold hover:bg-white/90 transition-colors"
        >
          <Plus size={18} />
          New Reminder
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Active Reminders */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider sticky top-0 bg-transparent backdrop-blur-md py-2 z-10">
                Upcoming
              </h3>
              <AnimatePresence mode="popLayout">
                {activeReminders.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/5"
                  >
                    <Bell size={32} className="mx-auto text-white/20 mb-3" />
                    <p className="text-white/40">No active reminders.</p>
                  </motion.div>
                ) : (
                  activeReminders.map((reminder) => (
                    <ReminderItem
                      key={reminder.id}
                      reminder={reminder}
                      onToggle={() => toggleComplete(reminder)}
                      onEdit={() => {
                        setEditingReminder(reminder);
                        setIsDialogOpen(true);
                      }}
                      onDelete={() => handleDelete(reminder.id)}
                      onShare={() => handleShare(reminder)}
                      formatDate={formatDate}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Completed Reminders */}
            {completedReminders.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-white/50 uppercase tracking-wider sticky top-0 bg-transparent backdrop-blur-md py-2 z-10">
                  Completed
                </h3>
                <div className="opacity-60">
                  {completedReminders.map((reminder) => (
                    <ReminderItem
                      key={reminder.id}
                      reminder={reminder}
                      onToggle={() => toggleComplete(reminder)}
                      onEdit={() => {
                        setEditingReminder(reminder);
                        setIsDialogOpen(true);
                      }}
                      onDelete={() => handleDelete(reminder.id)}
                      onShare={() => handleShare(reminder)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ReminderDialog
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setEditingReminder(null);
        }}
        onSave={handleSave}
        initialData={
          editingReminder
            ? {
                title: editingReminder.title,
                description: editingReminder.description || "",
                dateTime: editingReminder.dateTime.toDate
                  ? editingReminder.dateTime.toDate()
                  : new Date(editingReminder.dateTime),
                recurrence: editingReminder.recurrence,
                customInterval: editingReminder.customInterval,
              }
            : null
        }
      />

      <ShareDialog
        isOpen={shareDialog.isOpen}
        onClose={() => setShareDialog((prev) => ({ ...prev, isOpen: false }))}
        title={shareDialog.title}
        content={shareDialog.content}
      />
    </div>
  );
};

const ReminderItem = ({
  reminder,
  onToggle,
  onEdit,
  onDelete,
  onShare,
  formatDate,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  formatDate: (d: any) => string;
}) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group relative p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all"
    >
      <div className="flex items-start gap-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
            reminder.isCompleted
              ? "bg-blue-500 border-blue-500 text-white"
              : "border-white/30 text-transparent hover:border-white/60"
          }`}
        >
          <CheckCircle2 size={12} strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4
              className={`font-medium text-white truncate ${
                reminder.isCompleted ? "line-through text-white/40" : ""
              }`}
            >
              {reminder.title}
            </h4>
            {reminder.recurrence !== "None" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 flex items-center gap-1">
                <RotateCw size={8} />{" "}
                {reminder.recurrence === "Custom"
                  ? `Every ${reminder.customInterval} days`
                  : reminder.recurrence}
              </span>
            )}
          </div>
          {reminder.description && (
            <p className="text-sm text-white/40 mb-2 line-clamp-2">
              {reminder.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span
              className={`flex items-center gap-1 ${
                !reminder.isCompleted &&
                new Date() >
                  (reminder.dateTime.toDate
                    ? reminder.dateTime.toDate()
                    : reminder.dateTime)
                  ? "text-red-400"
                  : ""
              }`}
            >
              <Clock size={12} />
              {formatDate(reminder.dateTime)}
            </span>
            {/* Next Occurrence Preview for Recurring Items */}
            {!reminder.isCompleted && reminder.recurrence !== "None" && (
              <span className="flex items-center gap-1 text-white/30">
                <RotateCw size={10} />
                Next:{" "}
                {(() => {
                  const currentDue = reminder.dateTime.toDate
                    ? reminder.dateTime.toDate()
                    : new Date(reminder.dateTime);
                  const next = new Date(currentDue);
                  if (reminder.recurrence === "Daily")
                    next.setDate(next.getDate() + 1);
                  else if (reminder.recurrence === "Weekly")
                    next.setDate(next.getDate() + 7);
                  else if (reminder.recurrence === "Monthly")
                    next.setMonth(next.getMonth() + 1);
                  else if (reminder.recurrence === "Yearly")
                    next.setFullYear(next.getFullYear() + 1);
                  else if (
                    reminder.recurrence === "Custom" &&
                    reminder.customInterval
                  )
                    next.setDate(next.getDate() + reminder.customInterval);

                  return next.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "numeric",
                  });
                })()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              const url = `${window.location.origin}/reminder/${reminder.id}`;
              navigator.clipboard.writeText(url);
              alert("Reminder link copied to clipboard!");
            }}
            className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            title="Share Reminder"
          >
            <Share2 size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
