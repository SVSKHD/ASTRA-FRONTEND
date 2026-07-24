import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Clock,
  Plus,
  Calendar,
  Lightbulb,
  Edit2,
  Trash2,
  Globe,
  Share2,
  Tag as TagIcon,
  AlertTriangle,
} from "lucide-react";
import { Idea, TimelineEvent, IDEA_TYPES } from "../services/ideasService";
import { Note } from "../services/notesService";
import { useNotes } from "../hooks/useNotes";
import { useDialogTracking } from "@/hooks/useDialogTracking";
import { NoteDialog, Note as DialogNote } from "./NoteDialog";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog";
import { ShareDialog } from "./ShareDialog";
import { AttachNotes } from "./AttachNotes";
import { TagInput } from "./ui/TagInput";
import { EditableSelect } from "./ui/EditableSelect";
import { DatePicker } from "./ui/DatePicker";
import {
  toDateInputValue,
  dueLabel,
  isOverdue,
  fullTimestamp,
} from "../utils/time";

const mapToDialogNote = (note: Note): DialogNote => ({
  id: note.id,
  title: note.title,
  content: note.content,
  isShared: note.isShared,
  createdAt: note.createdAt,
  updatedAt: note.updatedAt,
});

interface IdeaDialogProps {
  idea: Idea;
  isOpen: boolean;
  onClose: () => void;
  updateIdea: (id: string, updates: Partial<Idea>) => Promise<boolean>;
  allTags: string[];
}

type DetailTab = "details" | "notes" | "timeline";

// Floating detail dialog for an idea — full CRUD of fields, tags, type,
// deadline, attached notes and execution timeline.
export const IdeaDialog: React.FC<IdeaDialogProps> = ({
  idea,
  isOpen,
  onClose,
  updateIdea,
  allTags,
}) => {
  useDialogTracking(isOpen);
  const { notes, createNote, updateNote } = useNotes();
  const [activeTab, setActiveTab] = useState<DetailTab>("details");

  // Local editable copies of the meta fields.
  const [title, setTitle] = useState(idea.title);
  const [description, setDescription] = useState(idea.description);

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DialogNote | null>(null);

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [shareDialog, setShareDialog] = useState(false);
  const [eventDelete, setEventDelete] = useState<{
    isOpen: boolean;
    eventId: string | null;
  }>({ isOpen: false, eventId: null });

  useEffect(() => {
    setTitle(idea.title);
    setDescription(idea.description);
  }, [idea.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const ideaTimeline = idea.timeline || [];
  const ideaNoteIds = idea.noteIds || [];
  const ideaTags = idea.tags || [];

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== idea.title) updateIdea(idea.id, { title: t });
  };
  const commitDescription = () => {
    if (description !== idea.description) updateIdea(idea.id, { description });
  };

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

  const handleSaveEvent = async () => {
    if (!newEventTitle.trim()) return;
    let updatedTimeline: TimelineEvent[];
    if (editingEventId) {
      updatedTimeline = ideaTimeline.map((e) =>
        e.id === editingEventId
          ? { ...e, title: newEventTitle, description: newEventDesc }
          : e,
      );
    } else {
      updatedTimeline = [
        ...ideaTimeline,
        {
          id: Date.now().toString(),
          title: newEventTitle,
          description: newEventDesc,
          date: Date.now(),
        },
      ];
    }
    await updateIdea(idea.id, { timeline: updatedTimeline });
    setIsAddingEvent(false);
    setEditingEventId(null);
    setNewEventTitle("");
    setNewEventDesc("");
  };

  const confirmDeleteEvent = async () => {
    if (eventDelete.eventId) {
      await updateIdea(idea.id, {
        timeline: ideaTimeline.filter((e) => e.id !== eventDelete.eventId),
      });
    }
    setEventDelete({ isOpen: false, eventId: null });
  };

  const handleShare = async () => {
    if (!idea.isShared) {
      await updateIdea(idea.id, { isShared: true });
      await Promise.all(
        ideaNoteIds.map((id) => updateNote(id, { isShared: true })),
      );
    }
    setShareDialog(true);
  };

  const overdue = isOverdue(idea.deadline);

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: "details", label: "Details" },
    { id: "notes", label: "Notes", count: ideaNoteIds.length },
    { id: "timeline", label: "Timeline", count: ideaTimeline.length },
  ];

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl h-[85vh] bg-[#0a0a0a]/90 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-2xl ring-1 ring-white/10"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 p-6 border-b border-white/5 shrink-0">
                <div className="flex-1 min-w-0">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={commitTitle}
                    placeholder="Idea title"
                    className="bg-transparent text-2xl font-bold text-white focus:outline-none w-full placeholder:text-white/20"
                  />
                  <div className="flex flex-wrap items-center gap-2 mt-2">
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
                        {overdue ? (
                          <AlertTriangle size={12} />
                        ) : (
                          <Calendar size={12} />
                        )}
                        {dueLabel(idea.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-3 py-2 min-h-[40px] rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-medium"
                  >
                    <Share2 size={16} />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-2 px-6 pt-4 shrink-0">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-sm font-semibold ${
                      activeTab === t.id
                        ? "bg-white/15 text-white ring-1 ring-white/20"
                        : "text-white/40 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {t.label}
                    {t.count !== undefined && (
                      <span className="bg-white/10 px-1.5 py-0.5 rounded-md text-[10px]">
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                {activeTab === "details" && (
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={commitDescription}
                        placeholder="Flesh out the details…"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none h-28 placeholder:text-white/25 leading-relaxed"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                          Idea type
                        </label>
                        <EditableSelect
                          value={idea.ideaType || ""}
                          onChange={(v) => updateIdea(idea.id, { ideaType: v })}
                          options={[...IDEA_TYPES]}
                          placeholder="Choose a type"
                          icon={<Lightbulb size={16} />}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                          Deadline
                        </label>
                        <DatePicker
                          value={toDateInputValue(idea.deadline)}
                          onChange={(d) =>
                            updateIdea(idea.id, {
                              deadline: d ? new Date(d).getTime() : null,
                            })
                          }
                          placeholder="Set a deadline"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-white/40 font-semibold uppercase tracking-wider mb-2 block">
                        Tags
                      </label>
                      <TagInput
                        value={ideaTags}
                        onChange={(tags) => updateIdea(idea.id, { tags })}
                        suggestions={allTags}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-white/40">
                      <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                        <span className="text-white/30 block mb-0.5">
                          Created
                        </span>
                        {fullTimestamp(idea.createdAt)}
                      </div>
                      <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2.5">
                        <span className="text-white/30 block mb-0.5">
                          Updated
                        </span>
                        {fullTimestamp(idea.updatedAt)}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "notes" && (
                  <AttachNotes
                    notes={notes}
                    attachedIds={ideaNoteIds}
                    onAttach={(id) =>
                      updateIdea(idea.id, { noteIds: [...ideaNoteIds, id] })
                    }
                    onDetach={(id) =>
                      updateIdea(idea.id, {
                        noteIds: ideaNoteIds.filter((n) => n !== id),
                      })
                    }
                    onOpenNote={(note) => {
                      setEditingNote(mapToDialogNote(note));
                      setIsNoteDialogOpen(true);
                    }}
                    onCreateNote={() => {
                      setEditingNote(null);
                      setIsNoteDialogOpen(true);
                    }}
                  />
                )}

                {activeTab === "timeline" && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-white/60 font-semibold text-sm uppercase tracking-wider">
                        Execution timeline
                      </h3>
                      <button
                        onClick={() => {
                          setNewEventTitle("");
                          setNewEventDesc("");
                          setEditingEventId(null);
                          setIsAddingEvent(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-medium"
                      >
                        <Plus size={16} /> Add event
                      </button>
                    </div>

                    <AnimatePresence>
                      {isAddingEvent && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-[#0a0a0a]/60 border border-white/10 p-5 rounded-2xl mb-5 overflow-hidden"
                        >
                          <input
                            value={newEventTitle}
                            onChange={(e) => setNewEventTitle(e.target.value)}
                            placeholder="Milestone name…"
                            className="bg-transparent text-lg text-white font-bold focus:outline-none mb-2 w-full placeholder:text-white/20"
                            autoFocus
                          />
                          <textarea
                            value={newEventDesc}
                            onChange={(e) => setNewEventDesc(e.target.value)}
                            placeholder="What was achieved?"
                            className="bg-transparent text-white/50 text-sm focus:outline-none w-full resize-none h-14 placeholder:text-white/10"
                          />
                          <div className="flex justify-end gap-3 mt-3 border-t border-white/5 pt-3">
                            <button
                              onClick={() => {
                                setIsAddingEvent(false);
                                setEditingEventId(null);
                              }}
                              className="px-4 py-2 text-xs font-semibold text-white/40 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                            >
                              Discard
                            </button>
                            <button
                              onClick={handleSaveEvent}
                              disabled={!newEventTitle.trim()}
                              className="px-5 py-2 text-xs bg-blue-500 text-white rounded-xl font-bold disabled:opacity-50 uppercase tracking-wide"
                            >
                              {editingEventId ? "Update" : "Save"}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-0 pl-6 border-l-2 border-white/10 ml-1">
                      {ideaTimeline.map((event, i) => (
                        <motion.div
                          layout
                          key={event.id}
                          className="relative pb-6 pl-6"
                        >
                          <div
                            className={`absolute -left-[33px] top-2 w-3.5 h-3.5 rounded-full ring-4 ring-[#0a0a0a] ${
                              i === ideaTimeline.length - 1
                                ? "bg-amber-400"
                                : "bg-white/30"
                            }`}
                          />
                          <div className="bg-[#0a0a0a]/40 border border-white/5 p-4 rounded-2xl hover:bg-white/5 transition-all group">
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="text-white/90 font-bold group-hover:text-blue-300 transition-colors">
                                {event.title}
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-white/40 bg-white/5 px-2 py-1 rounded-lg">
                                  {new Date(event.date).toLocaleDateString()}
                                </span>
                                <button
                                  onClick={() => {
                                    setNewEventTitle(event.title);
                                    setNewEventDesc(event.description);
                                    setEditingEventId(event.id);
                                    setIsAddingEvent(true);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-blue-400 p-1 rounded-lg hover:bg-blue-500/10 transition-all"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() =>
                                    setEventDelete({
                                      isOpen: true,
                                      eventId: event.id,
                                    })
                                  }
                                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            {event.description && (
                              <p className="text-sm text-white/50 mt-2 leading-relaxed">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                      {ideaTimeline.length === 0 && !isAddingEvent && (
                        <div className="py-8 text-center text-white/30 text-sm">
                          A blank slate — map out your execution phases.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        isOpen={eventDelete.isOpen}
        onClose={() => setEventDelete({ isOpen: false, eventId: null })}
        onConfirm={confirmDeleteEvent}
        title="Delete Timeline Event"
        description={<p>Remove this milestone from the timeline?</p>}
      />

      <ShareDialog
        isOpen={shareDialog}
        onClose={() => setShareDialog(false)}
        title={`Share "${idea.title}"`}
        content={
          typeof window !== "undefined"
            ? `${window.location.origin}/ideas/${idea.id}`
            : ""
        }
      />
    </>
  );
};
