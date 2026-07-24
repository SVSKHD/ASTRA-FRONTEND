// Shared time helpers for Aureon: relative formatting, date bucketing and
// overdue detection. Used by Ideas, Stocks and Todos/Tasks.

export type DateGroupId =
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none"
  | "completed";

export interface DateGroupMeta {
  id: DateGroupId;
  label: string;
}

// Ordered list of the accordion groups. "completed" always renders last.
export const DATE_GROUPS: DateGroupMeta[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This Week" },
  { id: "later", label: "Later" },
  { id: "none", label: "No Date" },
  { id: "completed", label: "Completed" },
];

// Accepts Firestore Timestamp, JS Date, epoch millis or ISO string.
export const toDate = (value: any): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  try {
    if (typeof value === "object" && typeof value.toDate === "function") {
      return value.toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
};

export const toMillis = (value: any): number | null => {
  const d = toDate(value);
  return d ? d.getTime() : null;
};

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Whole calendar days from today (0 = today, 1 = tomorrow, -1 = yesterday).
export const daysFromToday = (value: any): number | null => {
  const d = toDate(value);
  if (!d) return null;
  const diff = startOfDay(d).getTime() - startOfDay(new Date()).getTime();
  return Math.round(diff / 86400000);
};

// End of the current week (Sunday-based) used to bucket "This Week".
const endOfThisWeek = () => {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const daysUntilSunday = 7 - day; // remaining days incl. next Sunday
  const end = startOfDay(now);
  end.setDate(end.getDate() + daysUntilSunday);
  return end;
};

// Determine which accordion group a due date falls into.
export const bucketForDate = (value: any, isCompleted = false): DateGroupId => {
  if (isCompleted) return "completed";
  const d = toDate(value);
  if (!d) return "none";

  const diffDays = daysFromToday(d)!;
  if (diffDays <= 0) return "today"; // overdue items surface under Today
  if (diffDays === 1) return "tomorrow";
  if (d.getTime() <= endOfThisWeek().getTime()) return "week";
  return "later";
};

// A representative due date for dropping an item into a given group, so the
// item auto-schedules (e.g. drop into "Tomorrow" -> tomorrow 9am).
export const dateForBucket = (group: DateGroupId): number | null => {
  const now = new Date();
  const base = startOfDay(now);
  switch (group) {
    case "today":
      base.setHours(17, 0, 0, 0);
      return base.getTime();
    case "tomorrow":
      base.setDate(base.getDate() + 1);
      base.setHours(9, 0, 0, 0);
      return base.getTime();
    case "week": {
      // Mid-point of the remaining week, clamped to at least 2 days out.
      const end = endOfThisWeek();
      const target = new Date(
        Math.max(base.getTime() + 2 * 86400000, end.getTime() - 86400000),
      );
      target.setHours(9, 0, 0, 0);
      return target.getTime();
    }
    case "later": {
      base.setDate(base.getDate() + 8);
      base.setHours(9, 0, 0, 0);
      return base.getTime();
    }
    case "none":
    case "completed":
    default:
      return null;
  }
};

export const isOverdue = (value: any, isCompleted = false): boolean => {
  if (isCompleted) return false;
  const ms = toMillis(value);
  if (ms === null) return false;
  return ms < Date.now();
};

const RELATIVE_UNITS: [number, string][] = [
  [60, "s"],
  [60, "m"],
  [24, "h"],
  [7, "d"],
  [4.34524, "w"],
  [12, "mo"],
  [Infinity, "y"],
];

// Compact "2h ago" / "in 3d" style relative time. `compact` keeps it terse
// for mobile cards.
export const relativeTime = (value: any, compact = false): string => {
  const d = toDate(value);
  if (!d) return "";
  const diffMs = d.getTime() - Date.now();
  const past = diffMs <= 0;
  let amount = Math.abs(diffMs) / 1000;

  if (amount < 45) return past ? "just now" : "in a moment";

  let unit = "s";
  for (let i = 0; i < RELATIVE_UNITS.length; i++) {
    const [divisor, label] = RELATIVE_UNITS[i];
    if (amount < divisor) {
      unit = label;
      break;
    }
    amount = amount / divisor;
    unit = label;
  }
  const n = Math.round(amount);
  if (compact) return past ? `${n}${unit} ago` : `${n}${unit}`;
  const unitWord = unit === "mo" ? "mo" : unit;
  return past ? `${n}${unitWord} ago` : `in ${n}${unitWord}`;
};

// Human "due tomorrow 5 PM" style label for a due date.
export const dueLabel = (value: any, compact = false): string => {
  const d = toDate(value);
  if (!d) return "";
  const diffDays = daysFromToday(d)!;
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: d.getMinutes() ? "2-digit" : undefined,
  });
  const overdue = d.getTime() < Date.now();

  let dayPart: string;
  if (overdue && diffDays <= 0)
    dayPart = diffDays === 0 ? "today" : `${Math.abs(diffDays)}d ago`;
  else if (diffDays === 0) dayPart = "today";
  else if (diffDays === 1) dayPart = "tomorrow";
  else if (diffDays > 1 && diffDays < 7)
    dayPart = d.toLocaleDateString(undefined, { weekday: "long" });
  else
    dayPart = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  if (compact) return overdue ? `${dayPart}` : dayPart;
  return overdue && diffDays < 0
    ? `overdue ${dayPart}`
    : `due ${dayPart} ${time}`;
};

// Full timestamp for detail dialogs.
export const fullTimestamp = (value: any): string => {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Convert an epoch-ms deadline into the YYYY-MM-DD string the DatePicker uses.
export const toDateInputValue = (value: any): string => {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};
