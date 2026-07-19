import React, { useState, useEffect } from "react";
import {
  Target,
  TrendingUp,
  CheckCircle,
  Plus,
  MoreVertical,
  Calendar,
  Flag,
  Trash2,
  Edit2,
  CheckSquare,
  Share2,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import {
  Goal,
  subscribeToGoals,
  deleteGoal,
  updateGoal,
} from "@/utils/goals-service";
import { GoalDialog } from "../GoalDialog";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { motion, AnimatePresence } from "framer-motion";

export const GoalsView = () => {
  const { user } = useUser();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setIsLoading(true);
      const unsubscribe = subscribeToGoals(user.id, (data) => {
        setGoals(data);
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const handleEdit = (goal: Goal) => {
    setSelectedGoal(goal);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteGoal(deleteId);
      setDeleteId(null);
    }
  };

  const handleToggleStatus = async (goal: Goal) => {
    const newStatus = goal.status === "active" ? "completed" : "active";
    await updateGoal(goal.id, { status: newStatus });
  };

  const handleAddGoal = () => {
    setSelectedGoal(null);
    setIsDialogOpen(true);
  };

  const handleShare = (e: React.MouseEvent, goal: Goal) => {
    e.stopPropagation();
    const url = `${window.location.origin}/goals/${goal.id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(goal.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Stats
  const totalGoals = goals.length;
  const completedGoals = goals.filter((g) => g.status === "completed").length;
  const activeGoals = goals.filter((g) => g.status === "active").length;
  const completionRate =
    totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-400 bg-red-400/10 border-red-400/20";
      case "medium":
        return "text-orange-400 bg-orange-400/10 border-orange-400/20";
      case "low":
        return "text-green-400 bg-green-400/10 border-green-400/20";
      default:
        return "text-gray-400 bg-gray-400/10 border-gray-400/20";
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 backdrop-blur-2xl border border-white/20 p-6 flex flex-col justify-between shadow-lg h-40">
          <div className="flex justify-between items-start">
            <span className="text-white/60 text-sm font-medium uppercase tracking-wider">
              Progress
            </span>
            <div className="p-2 bg-blue-500/20 rounded-xl">
              <Target className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div>
            <span className="text-4xl font-bold">{completionRate}%</span>
            <p className="text-white/40 text-xs mt-1">Goal Completion Rate</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/20 p-6 flex flex-col justify-between shadow-lg h-40">
          <div className="flex justify-between items-start">
            <span className="text-white/60 text-sm font-medium uppercase tracking-wider">
              Active Goals
            </span>
            <div className="p-2 bg-orange-500/20 rounded-xl">
              <TrendingUp className="w-5 h-5 text-orange-400" />
            </div>
          </div>
          <span className="text-4xl font-bold">{activeGoals}</span>
        </div>

        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/20 p-6 flex flex-col justify-between shadow-lg h-40">
          <div className="flex justify-between items-start">
            <span className="text-white/60 text-sm font-medium uppercase tracking-wider">
              Completed
            </span>
            <div className="p-2 bg-green-500/20 rounded-xl">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <span className="text-4xl font-bold">{completedGoals}</span>
        </div>
      </div>

      {/* Goals List */}
      <div className="rounded-3xl bg-black/10 backdrop-blur-2xl border border-white/20 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Your Goals</h3>
          <button
            onClick={handleAddGoal}
            className="flex items-center gap-2 text-xs bg-white text-black font-bold px-4 py-2 rounded-full hover:bg-white/90 transition-colors"
          >
            <Plus size={14} /> New Goal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {isLoading ? (
              <div className="col-span-full py-20 flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/20"></div>
              </div>
            ) : goals.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full text-center py-10 text-white/30 text-sm"
              >
                No goals yet. Start by creating one!
              </motion.div>
            ) : (
              goals.map((goal) => (
                <motion.div
                  key={goal.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`group p-4 rounded-2xl border transition-all ${
                    goal.status === "completed"
                      ? "bg-white/5 border-white/5 opacity-60"
                      : "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => handleToggleStatus(goal)}
                      className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                        goal.status === "completed"
                          ? "bg-green-500 border-green-500 text-black"
                          : "border-white/30 hover:border-white/60"
                      }`}
                    >
                      {goal.status === "completed" && <CheckCircle size={12} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h4
                          className={`font-medium text-lg leading-tight mb-1 ${goal.status === "completed" ? "line-through text-white/50" : "text-white"}`}
                        >
                          {goal.title}
                        </h4>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEdit(goal)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={(e) => handleShare(e, goal)}
                            className={`p-1.5 hover:bg-white/10 rounded-lg transition-colors ${
                              copiedId === goal.id
                                ? "text-green-400"
                                : "text-white/50 hover:text-white"
                            }`}
                          >
                            {copiedId === goal.id ? (
                              <CheckCircle size={14} />
                            ) : (
                              <Share2 size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(goal.id)}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-white/50 mb-3 line-clamp-2">
                        {goal.notes}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {goal.deadline && (
                          <div className="flex items-center gap-1.5 text-white/60 bg-white/5 px-2 py-1 rounded-md">
                            <Calendar size={12} />
                            <span>
                              {new Date(goal.deadline).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${getPriorityColor(goal.priority)}`}
                        >
                          <Flag size={12} />
                          <span className="capitalize">{goal.priority}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <GoalDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        goal={selectedGoal}
      />

      <DeleteConfirmationDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Goal"
        description={
          <p>
            Are you sure you want to delete this goal? This action cannot be
            undone.
          </p>
        }
      />
    </div>
  );
};
