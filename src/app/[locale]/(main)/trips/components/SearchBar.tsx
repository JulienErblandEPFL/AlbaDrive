// src/app/(main)/trips/components/SearchBar.tsx
// Server Component wrapper — <form method="get"> for shareable URLs + progressive enhancement.
// City inputs use CityCombobox (client) for fuzzy search and suggestions.
import { Search } from "lucide-react";
import { CityCombobox } from "./CityCombobox";

interface SearchBarProps {
  from?: string;
  to?: string;
  date?: string;
  glass?: boolean; // glassmorphism variant for photo backgrounds
}

export function SearchBar({ from = "", to = "", date = "", glass = false }: SearchBarProps) {
  const today = new Date().toISOString().split("T")[0];

  const cardClass = glass
    ? "bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl p-4 shadow-xl"
    : "bg-white rounded-2xl border border-stone-200 p-4 shadow-sm";

  const dateClass = glass
    ? "h-12 w-full rounded-xl border border-white/30 bg-white/20 backdrop-blur-sm px-4 text-white text-base placeholder:text-white/60 focus:border-white/60 focus:ring-2 focus:ring-white/20 outline-none transition-colors duration-150 cursor-pointer [color-scheme:dark]"
    : "h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 text-stone-900 text-base focus:border-red-800 focus:ring-2 focus:ring-red-100 focus:bg-white outline-none transition-colors duration-150 cursor-pointer";

  const labelClass = glass
    ? "text-xs font-semibold text-white/70 uppercase tracking-wide"
    : "text-xs font-semibold text-stone-500 uppercase tracking-wide";

  return (
    <form method="get" action="/trips" className={cardClass}>
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Origin */}
        <div className="flex-1">
          <CityCombobox
            name="from"
            label="Départ"
            placeholder="ex: Genève"
            defaultValue={from}
            glass={glass}
          />
        </div>

        {/* Destination */}
        <div className="flex-1">
          <CityCombobox
            name="to"
            label="Arrivée"
            placeholder="ex: Pristina"
            defaultValue={to}
            glass={glass}
          />
        </div>

        {/* Date */}
        <div className="sm:w-44 flex flex-col gap-1.5">
          <label htmlFor="search-date" className={labelClass}>
            Date
          </label>
          <input
            id="search-date"
            name="date"
            type="date"
            defaultValue={date}
            min={today}
            className={dateClass}
          />
        </div>

        {/* Submit */}
        <div className="flex flex-col gap-1.5">
          <span
            className="text-xs font-semibold text-transparent uppercase tracking-wide select-none"
            aria-hidden="true"
          >
            &nbsp;
          </span>
          <button
            type="submit"
            className="h-12 px-6 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 active:bg-red-950 transition-colors duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer min-w-[44px]"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Rechercher</span>
          </button>
        </div>
      </div>
    </form>
  );
}
