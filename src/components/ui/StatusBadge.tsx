// src/components/ui/StatusBadge.tsx
import type { TripStatus, BookingStatus } from "@/types/database.types";

const TRIP_STATUS: Record<
  TripStatus,
  { label: string; className: string }
> = {
  open: {
    label: "Disponible",
    className: "bg-green-100 text-green-800",
  },
  full: {
    label: "Complet",
    className: "bg-amber-100 text-amber-800",
  },
  cancelled: {
    label: "Annulé",
    className: "bg-red-100 text-red-700",
  },
  completed: {
    label: "Terminé",
    className: "bg-stone-100 text-stone-600",
  },
};

const BOOKING_STATUS: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "En attente",
    className: "bg-amber-100 text-amber-800",
  },
  accepted: {
    label: "Acceptée",
    className: "bg-green-100 text-green-800",
  },
  declined: {
    label: "Refusée",
    className: "bg-red-100 text-red-700",
  },
  cancelled: {
    label: "Annulée",
    className: "bg-stone-100 text-stone-600",
  },
  trip_cancelled: {
    label: "Trajet annulé",
    className: "bg-stone-100 text-stone-500",
  },
};

interface TripStatusBadgeProps {
  status: TripStatus;
}

export function TripStatusBadge({ status }: TripStatusBadgeProps) {
  const { label, className } = TRIP_STATUS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

interface BookingStatusBadgeProps {
  status: BookingStatus;
}

export function BookingStatusBadge({ status }: BookingStatusBadgeProps) {
  const { label, className } = BOOKING_STATUS[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
