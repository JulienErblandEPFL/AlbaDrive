// src/app/(main)/trips/components/SearchBar.tsx
// Server Component — pure HTML <form method="get"> for progressive enhancement.
// Works without JavaScript; datalist provides native browser autocomplete.
import { Search } from "lucide-react";
import { citiesByRegion } from "@/lib/constants/cities";

interface SearchBarProps {
  from?: string;
  to?: string;
  date?: string;
}

export function SearchBar({ from = "", to = "", date = "" }: SearchBarProps) {
  const today = new Date().toISOString().split("T")[0];
  const grouped = citiesByRegion();
  const allCities = Object.values(grouped).flat();

  return (
    <form
      method="get"
      action="/trips"
      className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm"
    >
      {/* Cities datalist — shared between both inputs */}
      <datalist id="alba-cities">
        {allCities.map((c) => (
          <option key={c.label} value={c.label} />
        ))}
      </datalist>

      <div className="flex flex-col sm:flex-row gap-3">
        {/* Origin */}
        <div className="flex-1 flex flex-col gap-1.5">
          <label htmlFor="search-from" className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
            Départ
          </label>
          <input
            id="search-from"
            name="from"
            list="alba-cities"
            defaultValue={from}
            placeholder="ex: Genève"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 text-stone-900 text-base placeholder:text-stone-400 focus:border-red-800 focus:ring-2 focus:ring-red-100 focus:bg-white outline-none transition-colors duration-150"
          />
        </div>

        {/* Destination */}
        <div className="flex-1 flex flex-col gap-1.5">
          <label htmlFor="search-to" className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
            Arrivée
          </label>
          <input
            id="search-to"
            name="to"
            list="alba-cities"
            defaultValue={to}
            placeholder="ex: Pristina"
            autoComplete="off"
            className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 text-stone-900 text-base placeholder:text-stone-400 focus:border-red-800 focus:ring-2 focus:ring-red-100 focus:bg-white outline-none transition-colors duration-150"
          />
        </div>

        {/* Date */}
        <div className="sm:w-44 flex flex-col gap-1.5">
          <label htmlFor="search-date" className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
            Date
          </label>
          <input
            id="search-date"
            name="date"
            type="date"
            defaultValue={date}
            min={today}
            className="h-12 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 text-stone-900 text-base focus:border-red-800 focus:ring-2 focus:ring-red-100 focus:bg-white outline-none transition-colors duration-150 cursor-pointer"
          />
        </div>

        {/* Submit */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-transparent uppercase tracking-wide select-none" aria-hidden="true">
            &nbsp;
          </span>
          <button
            type="submit"
            className="h-12 px-6 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 active:bg-red-950 transition-colors duration-150 flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            Rechercher
          </button>
        </div>
      </div>
    </form>
  );
}
