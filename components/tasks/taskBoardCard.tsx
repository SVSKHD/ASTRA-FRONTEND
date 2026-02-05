import React from "react";
import { Board } from "@/utils/kanban-service";
import { Calendar, Users, Edit2, Trash2 } from "lucide-react";

// Helper for time ago
const formatTimeAgo = (date: any) => {
  if (!date) return "Just now";
  const d = date.toDate ? date.toDate() : new Date(date);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return d.toLocaleDateString();
};

interface TaskBoardCardProps {
  board: Board;
  onClick: () => void;
  onEdit?: (board: Board) => void;
  onDelete?: (board: Board) => void;
}

export const TaskBoardCard = ({
  board,
  onClick,
  onEdit,
  onDelete,
}: TaskBoardCardProps) => {
  return (
    <div
      onClick={onClick}
      className="group relative p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 hover:bg-white/10 transition-all cursor-pointer backdrop-blur-sm overflow-hidden"
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(board);
            }}
            className="p-2 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70 backdrop-blur-md transition-all"
            title="Edit Board"
          >
            <Edit2 size={14} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(board);
            }}
            className="p-2 rounded-lg bg-black/50 text-white/70 hover:text-red-400 hover:bg-black/70 backdrop-blur-md transition-all"
            title="Delete Board"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-col h-full justify-between gap-4">
        <div>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors truncate pr-4">
              {board.name}
            </h3>
            {board.isSharable && (
              <span className="text-[10px] uppercase tracking-wider bg-green-500/10 text-green-400 px-2 py-1 rounded-full border border-green-500/20">
                Shared
              </span>
            )}
          </div>
          <p className="text-sm text-white/50 line-clamp-2">
            {board.columns?.length || 0} Columns •{" "}
            {board.members?.length
              ? `${board.members.length} Members`
              : "Private"}
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-white/30 border-t border-white/5 pt-3 mt-1">
          <div className="flex items-center gap-1.5">
            <Calendar size={12} />
            <span>{formatTimeAgo(board.createdAt)}</span>
          </div>
          {board.members && board.members.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <Users size={12} />
              <div className="flex -space-x-1.5">
                {board.members.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="w-4 h-4 rounded-full bg-white/10 border border-black overflow-hidden flex items-center justify-center"
                  >
                    {m.avatarUrl ? (
                      <img
                        src={m.avatarUrl}
                        alt={m.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[6px] text-white">
                        {m.username?.[0]}
                      </span>
                    )}
                  </div>
                ))}
                {board.members.length > 3 && (
                  <div className="w-4 h-4 rounded-full bg-white/10 border border-black flex items-center justify-center">
                    <span className="text-[6px] text-white">
                      +{board.members.length - 3}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Decorative gradient */}
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full pointer-events-none" />
    </div>
  );
};
