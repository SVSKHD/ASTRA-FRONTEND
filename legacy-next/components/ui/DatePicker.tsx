import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  X,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DatePickerProps {
  value?: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
}

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = "Select date",
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse value on init/change to update viewDate if needed
  // Assuming value is YYYY-MM-DD
  useEffect(() => {
    if (value) {
      const [y, m, d] = value.split("-").map(Number);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        // Determine if we should update viewDate?
        // Only if the current viewDate is wildly different?
        // Or just on initial load?
        // Let's just keep viewDate separate unless we want to jump to selected date
        // For now, let's jump to it if it's set
        const date = new Date(y, m - 1, d);
        setViewDate(new Date(y, m - 1, 1));
      }
    }
  }, [value]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateClick = (day: number) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    // Format YYYY-MM-DD
    const formattedDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(formattedDate);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];

    // Empty slots for days before first day of month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8" />);
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isSelected = value === dateStr;
      const isToday =
        new Date().toDateString() === new Date(year, month, day).toDateString();

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(day)}
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all relative",
            isSelected
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25 font-bold"
              : "text-white/80 hover:bg-white/10 hover:text-white",
            !isSelected && isToday && "ring-1 ring-blue-500/50 text-blue-400",
          )}
        >
          {day}
          {isToday && !isSelected && (
            <span className="absolute bottom-1 w-1 h-1 bg-blue-500 rounded-full" />
          )}
        </button>,
      );
    }

    return days;
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white cursor-pointer transition-all",
          "focus-within:ring-1 focus-within:ring-blue-500/50",
          isOpen && "ring-1 ring-blue-500/50 bg-white/10",
        )}
      >
        <CalendarIcon size={16} className="text-white/50 mr-2" />
        <span className={cn("flex-grow text-sm", !value && "text-white/30")}>
          {value
            ? new Date(value).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : placeholder}
        </span>
        {value && (
          <div
            onClick={handleClear}
            className="p-1 hover:bg-white/10 rounded-full transition-colors mr-1"
          >
            <X size={14} className="text-white/50 hover:text-white" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 z-50 mt-2 p-4 w-[280px] bg-[#111] border border-white/10 rounded-2xl shadow-xl shadow-black/50 backdrop-blur-xl ring-1 ring-white/5"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-white">
                {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Weekday Labels */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-white/30 py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-y-1 justify-items-center">
              {renderCalendar()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
