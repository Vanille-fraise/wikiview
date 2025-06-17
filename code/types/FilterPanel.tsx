import React, { useState, useEffect } from "react";
// UPDATED: Imported ChevronLeft for the hide button
import { ChevronLeft } from "lucide-react";

// The ThemedCheckbox sub-component remains unchanged.
const ThemedCheckbox = ({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <div className="flex items-center">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="peer h-4 w-4 shrink-0 rounded-sm border border-fuchsia-500/50 bg-slate-800 ring-offset-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 focus-visible:ring-offset-2 checked:bg-fuchsia-500 checked:border-fuchsia-500 appearance-none"
    />
    <div className="pointer-events-none absolute h-4 w-4 flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3 w-3 text-slate-900 transition-opacity ${
          checked ? "opacity-100" : "opacity-0"
        }`}
      >
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <label
      htmlFor={id}
      className="ml-3 text-sm font-medium text-gray-300 select-none cursor-pointer"
    >
      {label}
    </label>
  </div>
);

interface FilterPanelProps {
  filterList: string[];
  activeFilters: string[];
  onHide: () => void;
  onApply: (newFilters: string[]) => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  filterList,
  activeFilters,
  onHide,
  onApply,
}) => {
  const [draftFilters, setDraftFilters] = useState<string[]>(activeFilters);

  useEffect(() => {
    setDraftFilters(activeFilters);
  }, [activeFilters]);

  const handleFilterChange = (filter: string) => {
    setDraftFilters((prev) => {
      const newFilters = new Set(prev);
      if (newFilters.has(filter)) newFilters.delete(filter);
      else newFilters.add(filter);
      return Array.from(newFilters);
    });
  };

  const handleClearAll = () => setDraftFilters([]);

  const handleApply = () => {
    onApply(draftFilters);
  };

  return (
    // UPDATED: Changed from `right-0` to `left-0` and `border-l` to `border-r`.
    <aside className="fixed top-0 left-0 z-40 h-full w-80 bg-slate-900/95 border-r border-slate-700 backdrop-blur-sm shadow-2xl shadow-fuchsia-900/30">
      <div className="flex h-full flex-col">
        {/* Panel Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-gray-100">
            Filter Options
          </h2>
          {/* UPDATED: Changed icon to ChevronLeft */}
          <button
            onClick={onHide}
            className="p-2 rounded-md text-gray-400 hover:bg-slate-700 hover:text-white transition-colors"
            aria-label="Hide panel"
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Filter List (scrollable) */}
        <div className="flex-grow p-4 overflow-y-auto">
          <div className="grid grid-cols-1 gap-y-3">
            {filterList.map((filter) => (
              <ThemedCheckbox
                key={filter}
                id={`filter-${filter}`}
                label={filter}
                checked={draftFilters.includes(filter)}
                onChange={() => handleFilterChange(filter)}
              />
            ))}
          </div>
        </div>

        {/* Panel Footer */}
        <div className="flex justify-between items-center p-4 border-t border-slate-700">
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-sm font-medium text-fuchsia-400 hover:bg-fuchsia-500/10 rounded-md transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={handleApply}
            className="px-6 py-2 text-sm font-medium text-slate-100 bg-teal-600 hover:bg-teal-500 rounded-md transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </aside>
  );
};
