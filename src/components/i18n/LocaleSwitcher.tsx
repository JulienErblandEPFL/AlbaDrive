"use client";

import { Suspense, useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Check, Globe } from "lucide-react";
import { useRouter, usePathname } from "@/i18n/navigation";
import type { SupportedLocale } from "@/i18n/routing";
import { setLocale } from "@/i18n/actions";

// Diaspora-priority order: FR (default + biggest current share) → DE (Munich
// / Stuttgart corridor) → SQ (mother tongue) → EN (lingua-franca fallback).
const LOCALE_ORDER: readonly SupportedLocale[] = ["fr", "de", "sq", "en"] as const;

// Native endonyms — locale-invariant (Français is "Français" in any UI).
const NATIVE_NAMES: Record<SupportedLocale, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  sq: "Shqip",
};

interface LocaleSwitcherProps {
  className?: string;
}

// useSearchParams() bails statically-rendered pages out of SSG. We cap the
// blast radius with a Suspense boundary at the export so consumers don't have
// to know about it, and pages that include the switcher (e.g. /complete-profile)
// can still be prerendered.
export function LocaleSwitcher(props: LocaleSwitcherProps) {
  return (
    <Suspense fallback={<LocaleSwitcherFallback className={props.className} />}>
      <LocaleSwitcherImpl {...props} />
    </Suspense>
  );
}

function LocaleSwitcherFallback({ className = "" }: LocaleSwitcherProps) {
  return (
    <div
      aria-hidden="true"
      className={`${className} inline-flex h-9 w-[72px] rounded-xl border border-stone-200 bg-stone-50`}
    />
  );
}

function LocaleSwitcherImpl({ className = "" }: LocaleSwitcherProps) {
  const currentLocale = useLocale() as SupportedLocale;
  const t = useTranslations("common.localeSwitcher");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isPending, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // Esc + outside-click close
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isOpen]);

  // On open: cursor lands on the active locale (or first item if not found).
  useEffect(() => {
    if (!isOpen) return;
    const idx = LOCALE_ORDER.indexOf(currentLocale);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [isOpen, currentLocale]);

  // Move focus when activeIndex changes (arrow-key navigation).
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  function switchTo(loc: SupportedLocale) {
    if (loc === currentLocale) {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await setLocale({ locale: loc });
      if (!result.success) {
        // We control the input; this branch is defensive only.
        setIsOpen(false);
        return;
      }
      const query = Object.fromEntries(searchParams.entries());
      router.replace({ pathname, query }, { locale: loc });
      setIsOpen(false);
    });
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % LOCALE_ORDER.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + LOCALE_ORDER.length) % LOCALE_ORDER.length,
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(LOCALE_ORDER.length - 1);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={t("trigger", { language: NATIVE_NAMES[currentLocale] })}
        className={[
          "inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-stone-200 bg-white text-sm font-semibold",
          "text-stone-800 hover:bg-stone-50 active:bg-stone-100",
          "transition-colors duration-150 cursor-pointer",
          "focus-visible:outline-2 focus-visible:outline-red-800 focus-visible:outline-offset-2",
          "disabled:opacity-60 disabled:cursor-not-allowed",
        ].join(" ")}
      >
        <Globe className="w-4 h-4 text-stone-500" aria-hidden="true" />
        <span className="tracking-wide">{currentLocale.toUpperCase()}</span>
        {isPending ? (
          <span
            className="inline-block w-3.5 h-3.5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className={[
              "w-3.5 h-3.5 text-stone-400 transition-transform duration-200",
              isOpen ? "rotate-180" : "",
            ].join(" ")}
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen && (
        <ul
          id={menuId}
          role="menu"
          aria-label={t("menu")}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+6px)] min-w-[12rem] max-w-[16rem] bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden z-50 py-1"
        >
          {LOCALE_ORDER.map((loc, i) => {
            const isCurrent = loc === currentLocale;
            return (
              <li key={loc} role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  onClick={() => switchTo(loc)}
                  disabled={isPending}
                  tabIndex={i === activeIndex ? 0 : -1}
                  className={[
                    "w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm cursor-pointer",
                    "transition-colors duration-150",
                    "focus:outline-none focus:bg-stone-50",
                    isCurrent
                      ? "text-red-800 font-semibold bg-red-50/60"
                      : "text-stone-700 hover:bg-stone-50",
                    "disabled:cursor-not-allowed",
                  ].join(" ")}
                >
                  <span>{NATIVE_NAMES[loc]}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-stone-400 tracking-wide">
                      {loc.toUpperCase()}
                    </span>
                    {isCurrent && (
                      <Check
                        className="w-3.5 h-3.5 text-red-700"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
