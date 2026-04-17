// src/app/(main)/dashboard/DriverTripCard.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar,
  Users,
  Euro,
  MapPin,
  UserCheck,
  X,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TripStatusBadge, BookingStatusBadge } from "@/components/ui/StatusBadge";
import { acceptBooking, cancelBooking } from "@/app/(main)/bookings/actions";
import { cancelTrip } from "@/app/(main)/trips/actions";
import type { LocationJsonb, BookingStatus, TripStatus } from "@/types/database.types";

export interface BookingItem {
  id: string;
  passenger_id: string;
  passenger_name: string;
  seats_requested: number;
  status: BookingStatus;
  passenger_message: string | null;
  created_at: string;
}

export interface DriverTripItem {
  id: string;
  origin: LocationJsonb;
  destination: LocationJsonb;
  departure_at: string;
  total_seats: number;
  available_seats: number;
  price_per_seat: number | null;
  status: TripStatus;
  bookings: BookingItem[];
}

interface DriverTripCardProps {
  trip: DriverTripItem;
}

function BookingRow({ booking, tripId }: { booking: BookingItem; tripId: string }) {
  const router = useRouter();
  const [isAccepting, startAccept] = useTransition();
  const [isCancelling, startCancel] = useTransition();

  function handleAccept() {
    if (!window.confirm(`Accepter la demande de ${booking.passenger_name} ?`)) return;
    startAccept(async () => {
      const result = await acceptBooking({ booking_id: booking.id });
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  function handleDecline() {
    if (!window.confirm(`Refuser la demande de ${booking.passenger_name} ?`)) return;
    startCancel(async () => {
      // We cancel the booking from the driver's side
      const result = await cancelBooking({ booking_id: booking.id });
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  const isPending = booking.status === "pending";

  return (
    <div
      className={`flex items-start justify-between gap-3 py-3 ${isPending ? "" : "opacity-60"}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {/* Avatar initial */}
        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-stone-600 text-xs font-bold">
            {booking.passenger_name[0]?.toUpperCase() ?? "?"}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-stone-900 truncate">
              {booking.passenger_name}
            </span>
            <span className="text-xs text-stone-400">
              {booking.seats_requested} siège
              {booking.seats_requested !== 1 ? "s" : ""}
            </span>
            <BookingStatusBadge status={booking.status} />
          </div>
          {booking.passenger_message && (
            <p className="text-xs text-stone-500 mt-1 flex items-start gap-1">
              <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
              {booking.passenger_message}
            </p>
          )}
        </div>
      </div>

      {/* Actions — only for pending bookings */}
      {isPending && (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleDecline}
            isLoading={isCancelling}
            aria-label={`Refuser ${booking.passenger_name}`}
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={handleAccept}
            isLoading={isAccepting}
            aria-label={`Accepter ${booking.passenger_name}`}
          >
            <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
            Accepter
          </Button>
        </div>
      )}
    </div>
  );
}

export function DriverTripCard({ trip }: DriverTripCardProps) {
  const router = useRouter();
  const [isCancelling, startCancel] = useTransition();

  const formattedDate = format(
    new Date(trip.departure_at),
    "EEE d MMM 'à' HH'h'mm",
    { locale: fr }
  );

  const pendingBookings = trip.bookings.filter((b) => b.status === "pending");
  const otherBookings = trip.bookings.filter((b) => b.status !== "pending");
  const canCancel = !["cancelled", "completed"].includes(trip.status);

  function handleCancelTrip() {
    if (
      !window.confirm(
        "Annuler ce trajet ? Toutes les réservations en cours seront annulées."
      )
    )
      return;
    startCancel(async () => {
      const result = await cancelTrip({ trip_id: trip.id });
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  return (
    <article className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      {/* Trip header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          {/* Route */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-stone-400" />
              <div className="w-px h-4 bg-stone-200" />
              <div className="w-2.5 h-2.5 rounded-full border-2 border-red-800 bg-white" />
            </div>
            <div>
              <p className="font-semibold text-stone-900 text-sm">
                {trip.origin.label}
              </p>
              <p className="text-stone-500 text-sm">{trip.destination.label}</p>
            </div>
          </div>
          <TripStatusBadge status={trip.status} />
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            {formattedDate}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            {trip.available_seats}/{trip.total_seats} places dispo
          </span>
          {trip.price_per_seat != null && trip.price_per_seat > 0 && (
            <span className="flex items-center gap-1">
              <Euro className="w-3.5 h-3.5" aria-hidden="true" />
              {trip.price_per_seat} CHF / siège
            </span>
          )}
        </div>
      </div>

      {/* Bookings section */}
      {trip.bookings.length > 0 && (
        <div className="border-t border-stone-100 px-5">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide py-3">
            Demandes ({trip.bookings.length})
          </p>

          {/* Pending first */}
          {pendingBookings.map((b, i) => (
            <div key={b.id}>
              {i > 0 && <div className="border-t border-stone-50" />}
              <BookingRow booking={b} tripId={trip.id} />
            </div>
          ))}

          {/* Other statuses */}
          {otherBookings.map((b, i) => (
            <div key={b.id}>
              <div className="border-t border-stone-50" />
              <BookingRow booking={b} tripId={trip.id} />
            </div>
          ))}
        </div>
      )}

      {trip.bookings.length === 0 && trip.status === "open" && (
        <div className="border-t border-stone-100 px-5 py-4">
          <p className="text-xs text-stone-400 text-center">
            Aucune demande pour l&apos;instant
          </p>
        </div>
      )}

      {/* Footer actions */}
      {canCancel && (
        <div className="border-t border-stone-100 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancelTrip}
            isLoading={isCancelling}
            className="text-red-700 hover:text-red-800 hover:bg-red-50 text-xs"
          >
            Annuler ce trajet
          </Button>
        </div>
      )}
    </article>
  );
}
