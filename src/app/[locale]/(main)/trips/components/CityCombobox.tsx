// src/app/(main)/trips/components/CityCombobox.tsx
"use client";

import { useState, useRef, useEffect, useId } from "react";
import { MapPin, X } from "lucide-react";
import { CITIES } from "@/lib/constants/cities";

const POPULAR: string[] = ["Genève", "Lausanne", "Lyon", "Pristina", "Tirana"];

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

interface CityComboboxProps {
  name: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  glass?: boolean;
}

export function CityCombobox({ name, label, placeholder, defaultValue = "", glass = false }: CityComboboxProps) {
  const inputId = useId();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Derived: suggestions based on current input
  const suggestions = (() => {
    const q = normalize(value);
    if (!q) {
      // Focus state: show popular cities
      return POPULAR.map((label) => CITIES.find((c) => c.label === label)).filter(
        Boolean
      ) as (typeof CITIES)[number][];
    }
    return CITIES.filter((c) => normalize(c.label).includes(q)).slice(0, 8);
  })();

  const isEmpty = suggestions.length === 0;

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleSelect(cityLabel: string) {
    setValue(cityLabel);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }

  function handleBlur() {
    // Normalize on blur: trim + capitalize
    setValue((v) => capitalize(v.trim()));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") setIsOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelect(suggestions[activeIndex].label);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  const inputClass = glass
    ? "h-12 w-full rounded-xl border border-white/30 bg-white/20 backdrop-blur-sm pl-9 pr-9 text-white text-base placeholder:text-white/60 focus:border-white/60 focus:ring-2 focus:ring-white/20 outline-none transition-colors duration-150"
    : "h-12 w-full rounded-xl border border-stone-200 bg-stone-50 pl-9 pr-9 text-stone-900 text-base placeholder:text-stone-400 focus:border-red-700 focus:ring-2 focus:ring-red-100 focus:bg-white outline-none transition-colors duration-150";

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={glass ? "text-xs font-semibold text-white/70 uppercase tracking-wide" : "text-xs font-semibold text-stone-500 uppercase tracking-wide"}
      >
        {label}
      </label>

      <div className="relative">
        <MapPin
          className={["absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none", glass ? "text-white/50" : "text-stone-400"].join(" ")}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            setValue(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={inputClass}
        />
        {value && (
          <button
            type="button"
            aria-label="Effacer"
            onMouseDown={(e) => {
              e.preventDefault();
              setValue("");
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 rounded-2xl border border-white/40 bg-white/90 backdrop-blur-md shadow-xl overflow-hidden py-1"
        >
          {!value && (
            <li className="px-4 py-2 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
              Villes populaires
            </li>
          )}

          {isEmpty ? (
            <li className="px-4 py-3 text-sm text-stone-500 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-stone-300 shrink-0" aria-hidden="true" />
              <span>
                Ville non répertoriée —{" "}
                <span className="text-stone-700 font-medium">vous pouvez quand même chercher</span>
              </span>
            </li>
          ) : (
            suggestions.map((city, i) => (
              <li
                key={city.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(city.label);
                }}
                className={[
                  "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-100 min-h-[44px]",
                  i === activeIndex
                    ? "bg-red-50 text-red-800"
                    : "text-stone-800 hover:bg-stone-50",
                ].join(" ")}
              >
                <MapPin
                  className={[
                    "w-4 h-4 shrink-0",
                    i === activeIndex ? "text-red-600" : "text-stone-300",
                  ].join(" ")}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{city.label}</span>
                  <span className="ml-2 text-xs text-stone-400">{city.region}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
