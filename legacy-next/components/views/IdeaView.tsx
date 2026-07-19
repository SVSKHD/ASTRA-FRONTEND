import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  Clock,
  Plus,
  Trash2,
  Link,
  FileText,
  ChevronLeft,
  Calendar,
  FilePlus2,
  X,
  Edit2,
  Share2,
  Globe,
} from "lucide-react";
import { useIdeas } from "../../hooks/useIdeas";
import { useNotes } from "../../hooks/useNotes";
import { Idea, TimelineEvent } from "../../services/ideasService";
import { NoteDialog, Note as DialogNote } from "../NoteDialog";
import { Note } from "../../services/notesService";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";
import { ShareDialog } from "../ShareDialog";

const mapToDialogNote = (note: Note): DialogNote => ({
  id: note.id,
  title: note.title,
  content: note.content,
  isShared: note.isShared,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

export const IdeaView = () => {
  const { ideas, loading, createIdea, updateIdea, deleteIdea } = useIdeas();
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    ideaId: string | null;
  }>({ isOpen: false, ideaId: null });

  const confirmDeleteIdea = async () => {
    if (deleteConfirmation.ideaId) {
      await deleteIdea(deleteConfirmation.ideaId);
    }
    setDeleteConfirmation({ isOpen: false, ideaId: null });
  };

  const handleCreateIdea = async () => {
    if (newTitle.trim()) {
      await createIdea({ title: newTitle, description: newDescription });
      setIsCreating(false);
      setNewTitle("");
      setNewDescription("");
    }
  };

  if (loading)
    return (
      <div className="h-full flex items-center justify-center text-white/50 animate-pulse">
        Loading Ideas...
      </div>
    );

  if (selectedIdea) {
    const refreshedIdea =
      ideas.find((i) => i.id === selectedIdea.id) || selectedIdea;
    return (
      <IdeaDetail
        idea={refreshedIdea}
        onBack={() => setSelectedIdea(null)}
        updateIdea={updateIdea}
      />
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">Ideas Hub</h2>
          <p className="text-sm text-white/40 mt-1">
            Brainstorm and track execution timelines
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl font-semibold hover:bg-white/90 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
        >
          <Plus size={18} /> New Idea
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 pr-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {isCreating && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="bg-white/5 border border-white/10 p-5 rounded-3xl flex flex-col gap-3 mb-6 relative overflow-hidden backdrop-blur-xl"
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
                placeholder="Flesh out the details here..."
                className="bg-transparent text-white/60 focus:outline-none resize-none text-sm h-16 w-full placeholder:text-white/10"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors bg-white/5 rounded-xl hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateIdea}
                  disabled={!newTitle.trim()}
                  className="px-5 py-2 text-sm bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                >
                  Start Brainstorming
                </button>
              </div>
            </motion.div>
          )}

          {ideas.length === 0 && !isCreating ? (
            <div className="flex flex-col items-center justify-center p-20 text-center border border-dashed border-white/10 rounded-3xl">
              <Lightbulb size={48} className="text-white/10 mb-4" />
              <p className="text-white/40 mb-2">
                You haven't added any ideas yet.
              </p>
              <button
                onClick={() => setIsCreating(true)}
                className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
              >
                Create your first idea
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ideas.map((idea) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={idea.id}
                  onClick={() => setSelectedIdea(idea)}
                  className="bg-[#0a0a0a]/50 border border-white/10 p-6 rounded-3xl cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all group flex flex-col h-48 backdrop-blur-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors pointer-events-none" />

                  <div className="flex justify-between items-start mb-3 relative z-10">
                    <h3 className="text-lg font-bold text-white/90 group-hover:text-blue-200 transition-colors line-clamp-1 pr-6">
                      {idea.title}
                    </h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmation({
                          isOpen: true,
                          ideaId: idea.id,
                        });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all p-2 rounded-xl hover:bg-red-500/10 -mt-2 -mr-2 shadow-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="text-sm text-white/50 line-clamp-3 flex-1 relative z-10 leading-relaxed">
                    {idea.description || "No description provided."}
                  </p>
                  <div className="flex gap-4 text-xs text-white/30 pt-4 border-t border-white/5 mt-auto relative z-10 font-medium">
                    <span className="flex items-center gap-1.5">
                      <FileText size={12} /> {idea.noteIds.length} Note
                      {idea.noteIds.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={12} /> {idea.timeline.length} Event
                      {idea.timeline.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, ideaId: null })}
        onConfirm={confirmDeleteIdea}
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

const IdeaDetail = ({
  idea,
  onBack,
  updateIdea,
}: {
  idea: Idea;
  onBack: () => void;
  updateIdea: (id: string, updates: Partial<Idea>) => Promise<boolean>;
}) => {
  const [activeTab, setActiveTab] = useState<"notes" | "timeline">("notes");
  const { notes, createNote, updateNote } = useNotes();
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DialogNote | null>(null);

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [sharePrompt, setSharePrompt] = useState(false);
  const [shareDialog, setShareDialog] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
  }>({ isOpen: false, title: "", content: "" });

  const [eventDeleteConfirmation, setEventDeleteConfirmation] = useState<{
    isOpen: boolean;
    eventId: string | null;
  }>({ isOpen: false, eventId: null });

  const ideaTimeline = idea.timeline || [];
  const ideaNoteIds = idea.noteIds || [];

  // Filter notes belonging to this idea vs unattached ones
  const ideaNotes = notes.filter((n) => ideaNoteIds.includes(n.id));
  const unattachedNotes = notes.filter((n) => !ideaNoteIds.includes(n.id));

  const handleCreateOrUpdateNote = async (noteData: Partial<DialogNote>) => {
    if (noteData.id) {
      await updateNote(noteData.id, {
        title: noteData.title,
        content: noteData.content,
        isShared: noteData.isShared,
      });
    } else if (noteData.title && noteData.content) {
      const newId = await createNote({
        title: noteData.title,
        content: noteData.content,
        isShared: noteData.isShared,
      });
      if (newId) {
        await updateIdea(idea.id, {
          noteIds: [...ideaNoteIds, newId as string],
        });
      }
    }
    setIsNoteDialogOpen(false);
    setEditingNote(null);
  };

  const handleAttachNote = async (noteId: string) => {
    await updateIdea(idea.id, { noteIds: [...ideaNoteIds, noteId] });
    setIsAttachMenuOpen(false);
  };

  const handleDetachNote = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    await updateIdea(idea.id, {
      noteIds: ideaNoteIds.filter((id) => id !== noteId),
    });
  };

  const handleSaveEvent = async () => {
    if (newEventTitle.trim()) {
      let updatedTimeline;
      if (editingEventId) {
        updatedTimeline = ideaTimeline.map((e) =>
          e.id === editingEventId
            ? { ...e, title: newEventTitle, description: newEventDesc }
            : e,
        );
      } else {
        const newEvent: TimelineEvent = {
          id: Date.now().toString(),
          title: newEventTitle,
          description: newEventDesc,
          date: Date.now(),
        };
        updatedTimeline = [...ideaTimeline, newEvent];
      }
      await updateIdea(idea.id, { timeline: updatedTimeline });
      setIsAddingEvent(false);
      setEditingEventId(null);
      setNewEventTitle("");
      setNewEventDesc("");
    }
  };

  const openEditEvent = (event: TimelineEvent) => {
    setNewEventTitle(event.title);
    setNewEventDesc(event.description);
    setEditingEventId(event.id);
    setIsAddingEvent(true);
  };

  const handleTogglePrivacy = async () => {
    const newSharedState = !idea.isShared;
    await updateIdea(idea.id, { isShared: newSharedState });

    // Synergistically toggle all securely bound notes
    await Promise.all(
      ideaNoteIds.map((noteId) =>
        updateNote(noteId, { isShared: newSharedState }),
      ),
    );
  };

  const handleShareClick = () => {
    if (idea.isShared) {
      setShareDialog({
        isOpen: true,
        title: `Share "${idea.title}"`,
        content: `${window.location.origin}/idea/${idea.id}`,
      });
    } else {
      setSharePrompt(true);
    }
  };

  const confirmEnableShare = async () => {
    await updateIdea(idea.id, { isShared: true });
    // Also synchronously pull bound notes to public exposure
    await Promise.all(
      ideaNoteIds.map((noteId) => updateNote(noteId, { isShared: true })),
    );
    setSharePrompt(false);
    setShareDialog({
      isOpen: true,
      title: `Share "${idea.title}"`,
      content: `${window.location.origin}/idea/${idea.id}`,
    });
  };

  const confirmDeleteEvent = async () => {
    if (eventDeleteConfirmation.eventId) {
      await updateIdea(idea.id, {
        timeline: ideaTimeline.filter(
          (e) => e.id !== eventDeleteConfirmation.eventId,
        ),
      });
    }
    setEventDeleteConfirmation({ isOpen: false, eventId: null });
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-white/5 pb-6 shrink-0 pt-2">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors border border-white/10 shadow-sm"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-2xl font-bold text-white truncate drop-shadow-sm">
            {idea.title}
          </h2>
          <p className="text-sm text-white/40 truncate mt-0.5">
            {idea.description}
          </p>
        </div>
        <button
          onClick={handleTogglePrivacy}
          className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors shadow-sm shrink-0 border ${
            idea.isShared
              ? "bg-blue-500/20 text-blue-400 border-blue-500/20"
              : "bg-white/5 hover:bg-white/10 text-white/40 border-white/10"
          }`}
          title={idea.isShared ? "Publicly Accessible" : "Private Session"}
        >
          <Globe size={20} />
        </button>
        <button
          onClick={handleShareClick}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-medium shadow-sm shrink-0"
        >
          <Share2 size={16} /> Share
        </button>
      </div>

      {/* Tabs Menu */}
      <div className="flex items-center justify-between pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-[#0a0a0a]/50 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md">
          <button
            onClick={() => setActiveTab("notes")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              activeTab === "notes"
                ? "bg-white/15 text-white shadow-md ring-1 ring-white/20"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            <Lightbulb size={16} />
            <span className="font-semibold text-sm">Idea Notes</span>
            <span className="bg-white/10 px-1.5 py-0.5 rounded-md text-[10px] ml-1">
              {ideaNoteIds.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              activeTab === "timeline"
                ? "bg-white/15 text-white shadow-md ring-1 ring-white/20"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            <Clock size={16} />
            <span className="font-semibold text-sm">Timeline</span>
            <span className="bg-white/10 px-1.5 py-0.5 rounded-md text-[10px] ml-1">
              {ideaTimeline.length}
            </span>
          </button>
        </div>
      </div>

      {/* Active Tab Area */}
      <div className="flex-1 overflow-hidden relative mt-2">
        {activeTab === "notes" ? (
          <div className="h-full flex flex-col animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6 shrink-0 relative z-20">
              <h3 className="text-white/60 font-semibold text-sm px-1 uppercase tracking-wider">
                Attached Knowledge
              </h3>
              <div className="flex gap-3">
                <div className="relative">
                  <button
                    onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium shadow-sm"
                  >
                    <Link size={14} /> Attach Existing
                  </button>
                  <AnimatePresence>
                    {isAttachMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 top-full mt-3 w-72 max-h-64 overflow-y-auto bg-black/95 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-3xl z-[100]"
                      >
                        <div className="text-[10px] text-white/30 px-3 py-2 font-bold tracking-widest uppercase mb-1">
                          Select Note to Bind
                        </div>
                        {unattachedNotes.length === 0 ? (
                          <div className="p-4 text-white/30 text-xs text-center border border-dashed border-white/10 rounded-xl m-1">
                            No unattached notes found.
                          </div>
                        ) : (
                          unattachedNotes.map((n) => (
                            <button
                              key={n.id}
                              onClick={() => handleAttachNote(n.id)}
                              className="w-full text-left p-3 rounded-xl hover:bg-white/10 transition-colors mb-1 group"
                            >
                              <div className="text-sm font-medium text-white/80 group-hover:text-amber-300 truncate">
                                {n.title}
                              </div>
                              <div className="text-xs text-white/30 truncate mt-1">
                                Updated:{" "}
                                {new Date(n.updatedAt).toLocaleDateString()}
                              </div>
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={() => {
                    setEditingNote(null);
                    setIsNoteDialogOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white border border-blue-400/50 hover:bg-blue-400 transition-colors text-sm font-medium shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                >
                  <Plus size={16} /> Create Note
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-4 auto-rows-max custom-scrollbar">
              {ideaNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => {
                    setEditingNote(mapToDialogNote(note));
                    setIsNoteDialogOpen(true);
                  }}
                  className="p-6 rounded-3xl bg-[#0a0a0a]/50 border border-white/10 backdrop-blur-xl hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer group flex flex-col h-56 relative overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg text-white/90 group-hover:text-blue-300 transition-colors line-clamp-1 pr-12">
                      {note.title}
                    </h3>
                    <button
                      title="Detach from Idea"
                      onClick={(e) => handleDetachNote(e, note.id)}
                      className="opacity-0 group-hover:opacity-100 p-2.5 -mr-3 -mt-3 rounded-xl hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-all"
                    >
                      <Link
                        size={16}
                        className="opacity-50 hover:opacity-100 line-through"
                      />
                    </button>
                  </div>
                  <div
                    className="text-sm text-white/50 line-clamp-4 prose prose-invert prose-sm shrink-0 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: note.content }}
                  />
                  <div className="mt-auto pt-4 flex items-center justify-between text-xs text-white/30 border-t border-white/5 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Clock size={12} />{" "}
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}

              {ideaNotes.length === 0 && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-3xl bg-[#0a0a0a]/30">
                  <FilePlus2 size={40} className="text-white/10 mb-4" />
                  <p className="text-white/40 text-sm font-medium">
                    No notes attached to this idea yet.
                  </p>
                  <p className="text-white/20 text-xs mt-1">
                    Create a new note or bind an existing one to keep your
                    knowledge connected.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6 shrink-0 relative z-20">
              <h3 className="text-white/60 font-semibold text-sm px-1 uppercase tracking-wider">
                Project execution
              </h3>
              <button
                onClick={() => {
                  setNewEventTitle("");
                  setNewEventDesc("");
                  setEditingEventId(null);
                  setIsAddingEvent(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-medium shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.3)]"
              >
                <Plus size={16} /> Add Event
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 pb-10 custom-scrollbar relative">
              <AnimatePresence>
                {isAddingEvent && (
                  <motion.div
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    className="bg-[#0a0a0a]/60 border border-white/10 p-6 rounded-3xl mb-8 ml-8 relative backdrop-blur-xl ring-1 ring-white/5 shadow-xl overflow-hidden"
                  >
                    <div className="absolute -left-[38px] top-8 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-[#0a0a0a] z-10 shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                    <div className="absolute -left-[31px] top-12 bottom-[-32px] w-[2px] bg-blue-500/30" />
                    <input
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      placeholder="Milestone name..."
                      className="bg-transparent text-lg text-white font-bold focus:outline-none mb-3 w-full placeholder:text-white/20 tracking-tight"
                      autoFocus
                    />
                    <textarea
                      value={newEventDesc}
                      onChange={(e) => setNewEventDesc(e.target.value)}
                      placeholder="What was achieved?"
                      className="bg-transparent text-white/50 text-sm focus:outline-none w-full resize-none h-16 placeholder:text-white/10 leading-relaxed"
                    />
                    <div className="flex justify-end gap-3 mt-4 border-t border-white/5 pt-4">
                      <button
                        onClick={() => {
                          setIsAddingEvent(false);
                          setEditingEventId(null);
                          setNewEventTitle("");
                          setNewEventDesc("");
                        }}
                        className="px-4 py-2 text-xs font-semibold text-white/40 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-xl"
                      >
                        Discard
                      </button>
                      <button
                        onClick={handleSaveEvent}
                        disabled={!newEventTitle.trim()}
                        className="px-5 py-2 text-xs bg-blue-500 text-white rounded-xl font-bold disabled:opacity-50 tracking-wide uppercase shadow-md transition-all"
                      >
                        {editingEventId ? "Update Event" : "Save Event"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-0 pl-8 border-l-2 border-white/10 ml-1 py-4 relative">
                {ideaTimeline.map((event, i) => (
                  <motion.div
                    layout
                    key={event.id}
                    className="relative pb-10 pl-8"
                  >
                    <div
                      className={`absolute -left-[41px] top-2.5 w-4 h-4 rounded-full ring-4 ring-[#0a0a0a] z-10 shadow-sm ${i === ideaTimeline.length - 1 && !isAddingEvent ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.6)]" : "bg-white/30"}`}
                    />
                    <div className="bg-[#0a0a0a]/40 border border-white/5 p-6 rounded-3xl backdrop-blur-md hover:bg-white/5 hover:border-white/10 transition-all group shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="text-white/90 font-bold group-hover:text-blue-300 transition-colors text-lg tracking-tight">
                          {event.title}
                        </h4>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono font-medium text-white/40 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 shadow-inner">
                            {new Date(event.date).toLocaleDateString()}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditEvent(event);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-blue-400 transition-colors p-1.5 -mr-1 -mt-1.5 rounded-xl hover:bg-blue-500/10"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEventDeleteConfirmation({
                                isOpen: true,
                                eventId: event.id,
                              });
                            }}
                            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-colors p-1.5 -mr-2 -mt-1.5 rounded-xl hover:bg-red-500/10"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-white/50 leading-relaxed font-medium">
                        {event.description}
                      </p>
                    </div>
                  </motion.div>
                ))}

                {ideaTimeline.length === 0 && !isAddingEvent && (
                  <div className="relative border-b border-dashed border-white/10 pb-12 pt-8 text-center text-white/30 text-sm mt-4 ml-6 font-medium">
                    A blank slate. Map out the phases of your execution!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isNoteDialogOpen && (
          <NoteDialog
            isOpen={isNoteDialogOpen}
            onClose={() => {
              setIsNoteDialogOpen(false);
              setEditingNote(null);
            }}
            onSave={handleCreateOrUpdateNote}
            initialNote={editingNote}
          />
        )}
      </AnimatePresence>

      <DeleteConfirmationDialog
        isOpen={eventDeleteConfirmation.isOpen}
        onClose={() =>
          setEventDeleteConfirmation({ isOpen: false, eventId: null })
        }
        onConfirm={confirmDeleteEvent}
        title="Delete Timeline Event"
        description={
          <p>
            Are you sure you want to remove this milestone from the timeline?
          </p>
        }
      />

      <AnimatePresence>
        {sharePrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1C1C1E] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4 mx-auto border border-blue-500/20">
                  <Globe className="text-blue-400" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-white text-center mb-2">
                  Enable Public Access?
                </h3>
                <div className="text-white/50 text-center text-sm mb-6">
                  Anyone with the link will be able to view this idea hub and
                  all currently attached notes.
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSharePrompt(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmEnableShare}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
                  >
                    Enable & Copy
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ShareDialog
        isOpen={shareDialog.isOpen}
        onClose={() => setShareDialog((prev) => ({ ...prev, isOpen: false }))}
        title={shareDialog.title}
        content={shareDialog.content}
      />
    </div>
  );
};
