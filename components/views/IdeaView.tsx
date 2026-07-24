import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  Plus,
  Trash2,
  FileText,
  Calendar,
  Clock,
  Tag as TagIcon,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  TimerReset,
} from "lucide-react";
import { useIdeas } from "../../hooks/useIdeas";
import { IDEA_TYPES } from "../../services/ideasService";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { IdeaDialog } from "../IdeaDialog";
import { TagInput } from "../ui/TagInput";
import { EditableSelect } from "../ui/EditableSelect";
import { DatePicker } from "../ui/DatePicker";
import { dueLabel, isOverdue, toMillis } from "../../utils/time";

type SortKey = "updated" | "deadline" | "title";

export const IdeaView = () => {
  const { ideas, loading, createIdea, updateIdea, deleteIdea } = useIdeas();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);

  const [filterType, setFilterType] = useState<string>("");
  const [filterTag, setFilterTag] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    ideaId: string | null;
  }>({ isOpen: false, ideaId: null });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((i) => (i.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [ideas]);

  const allTypes = useMemo(() => {
    const set = new Set<string>(IDEA_TYPES);
    ideas.forEach((i) => i.ideaType && set.add(i.ideaType));
    return Array.from(set);
  }, [ideas]);

  const filteredIdeas = useMemo(() => {
    let list = [...ideas];
    if (filterType) list = list.filter((i) => i.ideaType === filterType);
    if (filterTag)
      list = list.filter((i) => (i.tags || []).includes(filterTag));

    list.sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "deadline") {
        const da = toMillis(a.deadline);
        const db = toMillis(b.deadline);
        if (da === null && db === null) return b.updatedAt - a.updatedAt;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [ideas, filterType, filterTag, sortKey]);

  // Upcoming deadlines (future, sorted) power the ticker + overview.
  const upcoming = useMemo(() => {
    return ideas
      .filter((i) => toMillis(i.deadline) !== null)
      .sort((a, b) => toMillis(a.deadline)! - toMillis(b.deadline)!)
      .filter((i) => !isOverdue(i.deadline));
  }, [ideas]);

  const overdueItems = useMemo(
    () => ideas.filter((i) => isOverdue(i.deadline)),
    [ideas],
  );

  const nextDeadline = upcoming[0];

  const handleCreateIdea = async () => {
    if (!newTitle.trim()) return;
    await createIdea({
      title: newTitle,
      description: newDescription,
      ideaType: newType,
      deadline: newDeadline ? new Date(newDeadline).getTime() : null,
      tags: newTags,
    });
    setIsCreating(false);
    setNewTitle("");
    setNewDescription("");
    setNewType("");
    setNewDeadline("");
    setNewTags([]);
  };

  const confirmDelete = async () => {
    if (deleteConfirmation.ideaId) await deleteIdea(deleteConfirmation.ideaId);
    setDeleteConfirmation({ isOpen: false, ideaId: null });
  };

  const selectedIdea = ideas.find((i) => i.id === selectedId) || null;

  if (loading)
    return (
      <div className="h-full flex items-center justify-center text-white/50 animate-pulse">
        Loading Ideas…
      </div>
    );

  return (
    <div className="h-full flex flex-col space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">Ideas Hub</h2>
          <p className="text-sm text-white/40 mt-1">
            Brainstorm, tag and track execution timelines
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-white text-black px-4 py-2 min-h-[44px] rounded-xl font-semibold hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          <Plus size={18} /> New Idea
        </button>
      </div>

      {/* Next-deadline ticker */}
      {(nextDeadline || overdueItems.length > 0) && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 backdrop-blur-xl">
          <span className="flex items-center gap-2 text-xs font-semibold text-white/40 uppercase tracking-wider shrink-0">
            <TimerReset size={14} /> Next up
          </span>
          {nextDeadline ? (
            <button
              onClick={() => setSelectedId(nextDeadline.id)}
              className="flex items-center gap-2 text-sm text-white/80 hover:text-blue-300 transition-colors min-w-0"
            >
              <span className="font-medium truncate max-w-[200px]">
                {nextDeadline.title}
              </span>
              <span className="text-blue-300 text-xs bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-lg shrink-0">
                {dueLabel(nextDeadline.deadline)}
              </span>
            </button>
          ) : (
            <span className="text-sm text-white/40">No upcoming deadlines</span>
          )}
          {overdueItems.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-red-300 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg ml-auto">
              <AlertTriangle size={12} /> {overdueItems.length} overdue
            </span>
          )}
        </div>
      )}

      {/* Filters + sort */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Filter size={14} />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[40px]"
        >
          <option value="" className="bg-black">
            All types
          </option>
          {allTypes.map((t) => (
            <option key={t} value={t} className="bg-black">
              {t}
            </option>
          ))}
        </select>
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[40px]"
        >
          <option value="" className="bg-black">
            All tags
          </option>
          {allTags.map((t) => (
            <option key={t} value={t} className="bg-black">
              {t}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <ArrowUpDown size={14} className="text-white/40" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-h-[40px]"
          >
            <option value="updated" className="bg-black">
              Recently updated
            </option>
            <option value="deadline" className="bg-black">
              By deadline
            </option>
            <option value="title" className="bg-black">
              By title
            </option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-10 pr-1 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {isCreating && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="bg-white/5 border border-white/10 p-5 rounded-3xl flex flex-col gap-3 mb-6 overflow-visible backdrop-blur-xl"
            >
              <h3 className="text-white/80 font-medium text-sm">
                Create a new idea
              </h3>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What's your big idea?"
                className="bg-transparent text-xl text-white font-bold focus:outline-none placeholder:text-white/20"
                autoFocus
              />
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Flesh out the details…"
                className="bg-transparent text-white/60 focus:outline-none resize-none text-sm h-14 w-full placeholder:text-white/10"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <EditableSelect
                  value={newType}
                  onChange={setNewType}
                  options={[...IDEA_TYPES]}
                  placeholder="Idea type"
                  icon={<Lightbulb size={16} />}
                />
                <DatePicker
                  value={newDeadline}
                  onChange={setNewDeadline}
                  placeholder="Deadline"
                />
              </div>
              <TagInput
                value={newTags}
                onChange={setNewTags}
                suggestions={allTags}
              />
              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-sm text-white/40 hover:text-white bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateIdea}
                  disabled={!newTitle.trim()}
                  className="px-5 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                >
                  Create idea
                </button>
              </div>
            </motion.div>
          )}

          {filteredIdeas.length === 0 && !isCreating ? (
            <div className="flex flex-col items-center justify-center p-16 text-center border border-dashed border-white/10 rounded-3xl">
              <Lightbulb size={44} className="text-white/10 mb-4" />
              <p className="text-white/40 mb-2">
                {ideas.length === 0
                  ? "You haven't added any ideas yet."
                  : "No ideas match these filters."}
              </p>
              {ideas.length === 0 && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
                >
                  Create your first idea
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIdeas.map((idea) => {
                const overdue = isOverdue(idea.deadline);
                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    key={idea.id}
                    onClick={() => setSelectedId(idea.id)}
                    className="bg-[#0a0a0a]/50 border border-white/10 p-5 rounded-3xl cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all group flex flex-col min-h-[12rem] backdrop-blur-xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors pointer-events-none" />

                    <div className="flex justify-between items-start mb-2 relative z-10 gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {idea.ideaType && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/20 font-semibold">
                            {idea.ideaType}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmation({
                            isOpen: true,
                            ideaId: idea.id,
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all p-2 rounded-xl hover:bg-red-500/10 -mt-2 -mr-2"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <h3 className="text-lg font-bold text-white/90 group-hover:text-blue-200 transition-colors line-clamp-1 relative z-10">
                      {idea.title}
                    </h3>
                    <p className="text-sm text-white/50 line-clamp-2 flex-1 relative z-10 leading-relaxed mt-1">
                      {idea.description || "No description provided."}
                    </p>

                    {(idea.tags || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3 relative z-10">
                        {(idea.tags || []).slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/10"
                          >
                            <TagIcon size={9} /> {t}
                          </span>
                        ))}
                        {(idea.tags || []).length > 3 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-white/40 border border-white/10">
                            +{(idea.tags || []).length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-3 text-xs text-white/30 pt-3 border-t border-white/5 mt-3 relative z-10 font-medium items-center">
                      <span className="flex items-center gap-1.5">
                        <FileText size={12} /> {(idea.noteIds || []).length}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} /> {(idea.timeline || []).length}
                      </span>
                      {idea.deadline && (
                        <span
                          className={`flex items-center gap-1.5 ml-auto ${
                            overdue ? "text-red-300" : "text-white/40"
                          }`}
                        >
                          {overdue ? (
                            <AlertTriangle size={12} />
                          ) : (
                            <Calendar size={12} />
                          )}
                          {dueLabel(idea.deadline, true)}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      {selectedIdea && (
        <IdeaDialog
          idea={selectedIdea}
          isOpen={!!selectedIdea}
          onClose={() => setSelectedId(null)}
          updateIdea={updateIdea}
          allTags={allTags}
        />
      )}

      <DeleteConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, ideaId: null })}
        onConfirm={confirmDelete}
        title="Delete Idea"
        description={
          <p>
            Are you sure you want to delete this idea? All associated data will
            be permanently removed.
          </p>
        }
      />
    </div>
  );
};
