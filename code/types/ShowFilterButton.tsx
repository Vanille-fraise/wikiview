import React from "react";
import { Filter } from "lucide-react";

interface ShowFilterButtonProps {
  onClick: () => void;
}

export const ShowFilterButton: React.FC<ShowFilterButtonProps> = ({
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className="fixed top-4 left-4 z-50 flex h-16 w-16 items-center
                 justify-center rounded-full bg-slate-800
                 border-2 border-teal-500/50 text-teal-400
                 shadow-lg transition-all
                 hover:border-teal-400 hover:text-teal-300 hover:scale-105"
      aria-label="Show filters"
    >
      <Filter size={32} />
    </button>
  );
};
