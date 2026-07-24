import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  GripVertical,
  Check,
  Circle,
  Trash2,
  Clock,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  DATE_GROUPS,
  DateGroupId,
  bucketForDate,
  dateForBucket,
  dueLabel,
  relativeTime,
  isOverdue,
} from "../../utils/time";

// Generic item the board understands. Consumers (Todos, Tasks) adapt their
// own model to this shape.
export interface AccordionItem {
  id: string;
  title: string;
  dueDate?: any;
  completed: boolean;
  order?: number;
  createdAt?: any;
  // Optional badge rendered on the right of the card (e.g. priority dot).
  badge?: React.ReactNode;
}

interface DateAccordionBoardProps {
  items: AccordionItem[];
  // Called when an item is dropped into a different date group. dueDate is the
  // representative epoch-ms for that group (null for "No Date"), completed is
  // whether the target group is "Completed".
  onMove: (id: string, dueDate: number | null, completed: boolean) => void;
  // Called with the final ordering of a group so order can be persisted.
  onPersistOrder: (orderedIds: string[]) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  isMobile?: boolean;
}

type Groups = Record<DateGroupId, AccordionItem[]>;

const emptyGroups = (): Groups => ({
  today: [],
  tomorrow: [],
  week: [],
  later: [],
  none: [],
  completed: [],
});

const groupColors: Record<DateGroupId, string> = {
  today: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  tomorrow: "text-purple-300 bg-purple-500/10 border-purple-500/20",
  week: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  later: "text-white/60 bg-white/5 border-white/10",
  none: "text-white/50 bg-white/5 border-white/10",
  completed: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
};

const buildGroups = (items: AccordionItem[]): Groups => {
  const g = emptyGroups();
  items.forEach((it) => {
    const bucket = bucketForDate(it.dueDate, it.completed);
    g[bucket].push(it);
  });
  (Object.keys(g) as DateGroupId[]).forEach((k) => {
    g[k].sort((a, b) => {
      const oa = a.order ?? Number.MAX_SAFE_INTEGER;
      const ob = b.order ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return 0;
    });
  });
  return g;
};

const SortableCard: React.FC<{
  item: AccordionItem;
  onToggleComplete: (id: string, completed: boolean) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ item, onToggleComplete, onOpen, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { type: "item" } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const overdue = isOverdue(item.dueDate, item.completed);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded-2xl bg-white/5 hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-colors mb-2 pr-2 touch-none"
    >
      {/* Drag handle — always visible (not hover-only), 44px target */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reschedule"
        className="flex items-center justify-center w-11 h-11 shrink-0 text-white/25 hover:text-white/60 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} />
      </button>

      {/* Complete toggle */}
      <button
        onClick={() => onToggleComplete(item.id, !item.completed)}
        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
        className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full border transition-colors ${
          item.completed
            ? "bg-emerald-500 border-emerald-500 text-black"
            : "border-white/20 text-transparent hover:border-emerald-400"
        }`}
      >
        {item.completed ? <Check size={14} /> : <Circle size={4} />}
      </button>

      {/* Body — click opens detail */}
      <button
        onClick={() => onOpen(item.id)}
        className="flex-1 min-w-0 text-left py-2.5"
      >
        <p
          className={`text-sm font-medium truncate ${
            item.completed ? "text-white/40 line-through" : "text-white/85"
          }`}
        >
          {item.title || "Untitled"}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[11px]">
          {item.dueDate && (
            <span
              className={`flex items-center gap-1 ${
                overdue ? "text-red-300" : "text-white/40"
              }`}
            >
              {overdue ? (
                <AlertTriangle size={10} />
              ) : (
                <CalendarDays size={10} />
              )}
              {dueLabel(item.dueDate, true)}
            </span>
          )}
          {item.createdAt && (
            <span className="flex items-center gap-1 text-white/25">
              <Clock size={10} /> {relativeTime(item.createdAt, true)}
            </span>
          )}
        </div>
      </button>

      {item.badge}

      <button
        onClick={() => onDelete(item.id)}
        aria-label="Delete"
        className="flex items-center justify-center w-9 h-9 shrink-0 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-500/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

const AccordionSection: React.FC<{
  group: DateGroupId;
  label: string;
  items: AccordionItem[];
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ group, label, items, open, onToggle, children }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: group,
    data: { type: "group", group },
  });

  return (
    <div
      className={`rounded-3xl border overflow-hidden transition-colors ${
        isOver
          ? "border-blue-500/40 bg-blue-500/[0.04]"
          : "border-white/10 bg-[#0a0a0a]/40"
      } backdrop-blur-xl`}
    >
      <button
        onClick={onToggle}
        className="sticky top-0 z-10 w-full flex items-center justify-between gap-3 px-4 min-h-[52px] bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            size={18}
            className={`text-white/40 transition-transform ${
              open ? "" : "-rotate-90"
            }`}
          />
          <span className="font-semibold text-white/90 text-sm">{label}</span>
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${groupColors[group]}`}
          >
            {items.length}
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div ref={setNodeRef} className="p-3 min-h-[64px]">
              {children}
              {items.length === 0 && (
                <div className="h-14 flex items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
                  <p className="text-[11px] text-white/20">Drop here</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const DateAccordionBoard: React.FC<DateAccordionBoardProps> = ({
  items,
  onMove,
  onPersistOrder,
  onToggleComplete,
  onOpen,
  onDelete,
  isMobile = false,
}) => {
  const [groups, setGroups] = useState<Groups>(() => buildGroups(items));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<DateGroupId>>(
    () => new Set<DateGroupId>(["today", "tomorrow", "week", "later", "none"]),
  );

  // Sync from props when not actively dragging.
  useEffect(() => {
    if (!activeId) setGroups(buildGroups(items));
  }, [items, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Long-press to drag on touch devices with a little tolerance.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    for (const g of Object.values(groups)) {
      const found = g.find((i) => i.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, groups]);

  const findGroupOfItem = (id: string): DateGroupId | null => {
    for (const key of Object.keys(groups) as DateGroupId[]) {
      if (groups[key].some((i) => i.id === id)) return key;
    }
    return null;
  };

  const resolveGroup = (overId: string): DateGroupId | null => {
    if ((DATE_GROUPS.map((g) => g.id) as string[]).includes(overId)) {
      return overId as DateGroupId;
    }
    return findGroupOfItem(overId);
  };

  const toggleGroup = (group: DateGroupId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (isMobile) {
        // One open at a time on mobile.
        const wasOpen = next.has(group);
        next.clear();
        if (!wasOpen) next.add(group);
        return next;
      }
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(e.active.id as string);
    // Ensure the target group can be seen while dragging on mobile.
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    const fromGroup = findGroupOfItem(activeIdStr);
    const toGroup = resolveGroup(overIdStr);
    if (!fromGroup || !toGroup) return;
    if (fromGroup === toGroup) return;

    setGroups((prev) => {
      const next: Groups = { ...prev };
      const fromArr = [...next[fromGroup]];
      const toArr = [...next[toGroup]];
      const idx = fromArr.findIndex((i) => i.id === activeIdStr);
      if (idx === -1) return prev;
      const [moved] = fromArr.splice(idx, 1);

      // Insert at position of the over item, or append.
      const overIdx = toArr.findIndex((i) => i.id === overIdStr);
      if (overIdx === -1) toArr.push(moved);
      else toArr.splice(overIdx, 0, moved);

      next[fromGroup] = fromArr;
      next[toGroup] = toArr;
      return next;
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    const id = active.id as string;
    setActiveId(null);
    if (!over) return;

    const overIdStr = over.id as string;
    const targetGroup = resolveGroup(overIdStr) || findGroupOfItem(id);
    if (!targetGroup) return;

    // Reorder within the target group using the current (post-dragOver) state.
    const arr = [...groups[targetGroup]];
    const fromIdx = arr.findIndex((i) => i.id === id);
    const overIdx = arr.findIndex((i) => i.id === overIdStr);
    if (fromIdx !== -1 && overIdx !== -1 && fromIdx !== overIdx) {
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(overIdx, 0, moved);
      setGroups({ ...groups, [targetGroup]: arr });
    }

    // Did the item change date groups? If so, reschedule / complete it.
    const orig = items.find((i) => i.id === id);
    const originalBucket = orig
      ? bucketForDate(orig.dueDate, orig.completed)
      : null;
    if (originalBucket !== targetGroup) {
      const completed = targetGroup === "completed";
      const newDue = completed ? null : dateForBucket(targetGroup);
      onMove(id, newDue, completed);
    }

    // Persist ordering of the affected group.
    onPersistOrder(arr.map((i) => i.id));
  };

  const orderedGroups = DATE_GROUPS;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      autoScroll={{ threshold: { x: 0, y: 0.2 } }}
    >
      <div className="space-y-3">
        {orderedGroups.map(({ id: gid, label }) => (
          <AccordionSection
            key={gid}
            group={gid}
            label={label}
            items={groups[gid]}
            open={openGroups.has(gid)}
            onToggle={() => toggleGroup(gid)}
          >
            <SortableContext
              items={groups[gid].map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {groups[gid].map((item) => (
                <SortableCard
                  key={item.id}
                  item={item}
                  onToggleComplete={onToggleComplete}
                  onOpen={onOpen}
                  onDelete={onDelete}
                />
              ))}
            </SortableContext>
          </AccordionSection>
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white/10 border border-white/20 shadow-2xl backdrop-blur-md pr-2 rotate-1">
            <div className="flex items-center justify-center w-11 h-11 text-white/50">
              <GripVertical size={16} />
            </div>
            <p className="text-sm text-white font-medium py-3 pr-4 truncate max-w-[240px]">
              {activeItem.title || "Untitled"}
            </p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
