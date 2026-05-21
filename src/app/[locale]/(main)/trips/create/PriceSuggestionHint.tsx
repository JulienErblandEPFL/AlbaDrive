"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { getSuggestedPriceRange } from "@/app/[locale]/(main)/trips/actions";
import { HIGH_PRICE_WARNING_MULTIPLIER, type PriceRangeResult } from "@/lib/pricing";

const DEBOUNCE_MS = 300;

interface Props {
  originLabel: string;
  destinationLabel: string;
  enteredPrice: string | undefined;
}

type HintState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: PriceRangeResult | null };

export function PriceSuggestionHint({ originLabel, destinationLabel, enteredPrice }: Props) {
  const t = useTranslations("trips.create.priceSuggestion");
  const locale = useLocale();
  const [state, setState] = useState<HintState>({ kind: "idle" });

  const tickRef = useRef(0);
  useEffect(() => {
    if (!originLabel || !destinationLabel) {
      setState({ kind: "idle" });
      return;
    }
    const myTick = ++tickRef.current;
    setState({ kind: "loading" });
    const timer = setTimeout(async () => {
      const result = await getSuggestedPriceRange({ originLabel, destinationLabel });
      if (tickRef.current !== myTick) return;
      if (result.success) {
        setState({ kind: "success", data: result.data ?? null });
      } else {
        setState({ kind: "success", data: null });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [originLabel, destinationLabel]);

  if (state.kind === "idle") {
    return <p className="mt-1 text-xs text-stone-500">{t("idle")}</p>;
  }
  if (state.kind === "loading") {
    return <p className="mt-1 text-xs text-stone-500">{t("loading")}</p>;
  }
  if (state.data == null) {
    return <p className="mt-1 text-xs text-stone-500">{t("unavailable")}</p>;
  }

  // Phase 1: always display CHF regardless of the carried currency tag.
  // The fuel_prices.currency value flows through PriceRange for forward-compat
  // with jurisdiction-aware pricing — see April 2026 legal analysis.
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const { low, typical, high } = state.data.range;
  const isFallback = state.data.source === "haversine_fallback";
  const enteredNum = enteredPrice ? Number.parseFloat(enteredPrice) : Number.NaN;
  const isHigh =
    Number.isFinite(enteredNum) && enteredNum > typical * HIGH_PRICE_WARNING_MULTIPLIER;

  return (
    <div className="mt-1 flex flex-col gap-1.5">
      <p className="text-xs text-stone-500">
        <span className="font-semibold">{t("label")}</span>{" "}
        <span className="text-stone-700">
          {fmt.format(low)} – {fmt.format(typical)} – {fmt.format(high)}
        </span>
        {isFallback && (
          <span className="ml-1 text-stone-400">· {t("estimated")}</span>
        )}
      </p>
      {isHigh && (
        <p
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
        >
          {t("highWarning")}
        </p>
      )}
    </div>
  );
}
