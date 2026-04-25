// src/components/ui/StatusBadge.tsx
"use client";

import { useTranslations } from "next-intl";
import type { TripStatus, BookingStatus } from "@/types/database.types";

const TRIP_STATUS_STYLE: Record<TripStatus, string> = {
  open: "bg-green-100 text-green-800",
  full: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
  completed: "bg-stone-100 text-stone-600",
};

const BOOKING_STATUS_STYLE: Record<BookingStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-stone-100 text-stone-600",
  trip_cancelled: "bg-stone-100 text-stone-500",
};

const BADGE_BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const t = useTranslations("status.trip");
  return (
    <span className={`${BADGE_BASE} ${TRIP_STATUS_STYLE[status]}`}>
      {t(status)}
    </span>
  );
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("status.booking");
  return (
    <span className={`${BADGE_BASE} ${BOOKING_STATUS_STYLE[status]}`}>
      {t(status)}
    </span>
  );
}
