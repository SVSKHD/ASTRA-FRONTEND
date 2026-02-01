import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X,
  Calendar,
  Flag,
  AlignLeft,
  Trash2,
  Clock,
  Timer,
  Github,
  GitBranch,
  FileCode,
  Folder,
  // ChevronRight, // Already used? No, checked file content, not there.
  CornerLeftUp,
  User,
} from "lucide-react";
import { Task, Priority } from "../utils/kanban-service";
import { DatePicker } from "./ui/DatePicker";
import {
  fetchBranches,
  fetchTree,
  GithubBranch,
  GithubTreeItem,
} from "../services/githubService";

import { UserProfile } from "../context/UserContext";

interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string | undefined, updates: Partial<Task>) => void;
  onDelete?: (taskId: string) => void;
  initialTask?: Task | null;
  members?: UserProfile[];
}

export const TaskDialog = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialTask,
  members = [],
}: TaskDialogProps) => {
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [deadline, setDeadline] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [timeSpent, setTimeSpent] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  // GitHub State
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("");
  const [githubPath, setGithubPath] = useState("");

  const [branches, setBranches] = useState<GithubBranch[]>([]);
  const [tree, setTree] = useState<GithubTreeItem[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const [browserPath, setBrowserPath] = useState(""); // Current folder in browser

  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setContent(initialTask.content);
        setDescription(initialTask.description || "");
        setPriority(initialTask.priority || "Medium");
        setEstimatedTime(initialTask.estimatedTime?.toString() || "");
        setTimeSpent(initialTask.timeSpent?.toString() || "");

        if (initialTask.deadline) {
          // Check if it's a Firestore timestamp (has toDate) or string/date
          const d = initialTask.deadline.toDate
            ? initialTask.deadline.toDate()
            : new Date(initialTask.deadline);
          // Format to YYYY-MM-DD for date input
          const iso = d.toISOString().split("T")[0];
          setDeadline(iso);
        } else {
          setDeadline("");
        }
        setGithubRepo(initialTask.githubRepo || "");
        setGithubBranch(initialTask.githubBranch || "");
        setGithubPath(initialTask.githubPath || "");
        setAssignedTo(initialTask.assignedTo || "");
      } else {
        // Create Mode - Reset
        setContent("");
        setDescription("");
        setPriority("Medium");
        setDeadline("");
        setEstimatedTime("");
        setTimeSpent("");
        setGithubRepo("");
        setGithubBranch("");
        setGithubPath("");
        setBranches([]);
        setTree([]);
        setAssignedTo("");
      }
    }
  }, [isOpen, initialTask]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSave = () => {
    if (content.trim()) {
      const updates: Partial<Task> = {
        content,
        description,
        priority,
        deadline: deadline ? new Date(deadline) : null,
        estimatedTime: estimatedTime ? parseFloat(estimatedTime) : undefined,
        timeSpent: timeSpent ? parseFloat(timeSpent) : undefined,
        githubRepo: githubRepo || undefined,
        githubBranch: githubBranch || undefined,
        githubPath: githubPath || undefined,
        assignedTo: assignedTo || undefined,
      };
      onSave(initialTask?.id, updates);
      onClose();
    }
  };

  const handleDelete = () => {
    if (initialTask && onDelete) {
      if (confirm("Are you sure you want to delete this task?")) {
        onDelete(initialTask.id);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-[#111] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-2 text-white/50 text-sm font-medium uppercase tracking-wider">
            {initialTask ? (
              <>
                <span
                  className={`w-2 h-2 rounded-full ${priority === "High" ? "bg-red-400" : priority === "Medium" ? "bg-yellow-400" : "bg-blue-400"}`}
                />
                {priority} Priority
              </>
            ) : (
              <>Wait to create...</>
            )}
          </div>
          <div className="flex items-center gap-2">
            {initialTask && onDelete && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-full hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                title="Delete Task"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          {/* Title Input */}
          <div className="space-y-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-transparent text-2xl font-bold text-white placeholder:text-white/20 focus:outline-none"
              placeholder="Task Title"
              autoFocus
            />
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Assigned To */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <User size={12} /> Assigned To
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 appearance-none"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.username}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <Flag size={12} /> Priority
                </label>
                <div className="flex gap-2">
                  {(["Low", "Medium", "High"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        priority === p
                          ? "bg-white/10 border-white/20 text-white"
                          : "bg-transparent border-transparent text-white/30 hover:bg-white/5"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                  <Calendar size={12} /> Deadline
                </label>
                <DatePicker
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="Select deadline"
                />
              </div>
            </div>

            {/* Right Column - Time Logging */}
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                <Clock size={12} /> Time Tracking (Hrs)
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-white/30 uppercase">
                    Estimated
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={estimatedTime}
                      onChange={(e) => setEstimatedTime(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white/5 border border-white/5 rounded-lg pl-3 pr-2 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/20"
                    />
                    <Timer
                      size={14}
                      className="absolute right-2 top-2 text-white/20"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-white/30 uppercase">
                    Spent
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={timeSpent}
                      onChange={(e) => setTimeSpent(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white/5 border border-white/5 rounded-lg pl-3 pr-2 py-1.5 text-sm text-white/80 focus:outline-none focus:border-white/20"
                    />
                    <Clock
                      size={14}
                      className="absolute right-2 top-2 text-white/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GitHub Integration */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <label className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
              <Github size={12} /> GitHub Integration
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Repo Input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="owner/repo"
                    className="flex-1 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                  />
                  <button
                    onClick={async () => {
                      if (!githubRepo) return;
                      setLoadingBranches(true);
                      try {
                        const data = await fetchBranches(githubRepo);
                        setBranches(data);
                        // If editing and we have a branch, try to fetch tree too if not loaded
                        if (githubBranch && tree.length === 0) {
                          const b = data.find((br) => br.name === githubBranch);
                          if (b) {
                            setLoadingTree(true);
                            const t = await fetchTree(githubRepo, b.commit.sha);
                            setTree(t);
                            setLoadingTree(false);
                          }
                        }
                      } catch (e) {
                        alert("Failed to fetch repo. Check name/visibility.");
                      }
                      setLoadingBranches(false);
                    }}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-colors text-xs font-semibold"
                    disabled={loadingBranches}
                  >
                    {loadingBranches ? "..." : "Load"}
                  </button>
                </div>
              </div>

              {/* Branch Select */}
              <div className="space-y-2">
                <select
                  value={githubBranch}
                  onChange={async (e) => {
                    const branchName = e.target.value;
                    setGithubBranch(branchName);
                    if (!branchName) return;

                    const branch = branches.find((b) => b.name === branchName);
                    if (branch) {
                      setLoadingTree(true);
                      try {
                        const t = await fetchTree(
                          githubRepo,
                          branch.commit.sha,
                        );
                        setTree(t);
                        setBrowserPath(""); // Reset browser to root
                        setGithubPath("");
                      } catch (e) {
                        alert("Failed to fetch tree.");
                      }
                      setLoadingTree(false);
                    }
                  }}
                  disabled={branches.length === 0}
                  className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20 disabled:opacity-50 appearance-none"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* File Browser */}
            {(tree.length > 0 || githubPath) && (
              <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                {/* Breadcrumb / Header */}
                <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-white/5">
                  <button
                    onClick={() => setBrowserPath("")}
                    className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white"
                    disabled={!browserPath}
                  >
                    <CornerLeftUp size={14} />
                  </button>
                  <span className="text-xs text-white/50 font-mono">
                    {browserPath || "/"}
                  </span>
                  {githubPath && (
                    <div className="ml-auto flex items-center gap-2 text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded">
                      <FileCode size={12} />
                      <span className="truncate max-w-[150px]">
                        {githubPath}
                      </span>
                      <button
                        onClick={() => setGithubPath("")}
                        className="hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* List */}
                <div className="max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {loadingTree ? (
                    <p className="text-center text-xs text-white/30 py-4">
                      Loading files...
                    </p>
                  ) : (
                    tree
                      .filter((item) => {
                        // Simplistic client-side filter for browser path
                        if (!item.path.startsWith(browserPath)) return false;
                        const relative = item.path
                          .slice(browserPath.length)
                          .replace(/^\//, "");
                        return !relative.includes("/");
                      })
                      .sort((a, b) =>
                        a.type === "tree" && b.type === "blob" ? -1 : 1,
                      )
                      .map((item) => {
                        const relative = item.path
                          .slice(browserPath.length)
                          .replace(/^\//, "");
                        return (
                          <button
                            key={item.path}
                            onClick={() => {
                              if (item.type === "tree") {
                                setBrowserPath(item.path + "/");
                              } else {
                                setGithubPath(item.path);
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm hover:bg-white/5 transition-colors ${githubPath === item.path ? "bg-blue-500/20 text-blue-200" : "text-white/70"}`}
                          >
                            {item.type === "tree" ? (
                              <Folder
                                size={14}
                                className="text-yellow-500/80"
                              />
                            ) : (
                              <FileCode
                                size={14}
                                className="text-blue-400/80"
                              />
                            )}
                            <span className="truncate flex-1">{relative}</span>
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-3 pt-4 border-t border-white/5">
            <label className="flex items-center gap-2 text-sm font-medium text-white/60">
              <AlignLeft size={16} /> Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details about this task..."
              className="w-full h-32 bg-white/5 border border-white/5 rounded-xl p-4 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:bg-white/10 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors"
          >
            {initialTask ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
