// src/app/(main)/dashboard/PassengerBookingCard.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Users, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BookingStatusBadge } from "@/components/ui/StatusBadge";
import { cancelBooking, getWhatsAppLink } from "@/app/(main)/bookings/actions";
import type { LocationJsonb, BookingStatus, TripStatus } from "@/types/database.types";

// WhatsApp SVG icon
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export interface PassengerBookingItem {
  id: string;
  trip_id: string;
  seats_requested: number;
  status: BookingStatus;
  passenger_message: string | null;
  created_at: string;
  trip: {
    id: string;
    origin: LocationJsonb;
    destination: LocationJsonb;
    departure_at: string;
    status: TripStatus;
    driver_id: string;
  };
  driver_name: string;
}

interface PassengerBookingCardProps {
  booking: PassengerBookingItem;
}

export function PassengerBookingCard({ booking }: PassengerBookingCardProps) {
  const router = useRouter();
  const [isCancelling, startCancel] = useTransition();
  const [isLoadingWA, startLoadingWA] = useTransition();
  const [waError, setWaError] = useState<string | null>(null);

  const formattedDate = format(
    new Date(booking.trip.departure_at),
    "EEE d MMM 'à' HH'h'mm",
    { locale: fr }
  );

  const isAccepted = booking.status === "accepted";
  const isTripCancelled = booking.status === "trip_cancelled";
  const canCancel = ["pending", "accepted"].includes(booking.status);

  function handleCancel() {
    if (!window.confirm("Annuler votre réservation ?")) return;
    startCancel(async () => {
      const result = await cancelBooking({ booking_id: booking.id });
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  }

  function handleWhatsApp() {
    setWaError(null);
    startLoadingWA(async () => {
      const result = await getWhatsAppLink({ booking_id: booking.id });
      if (result.success && result.data) {
        window.open(result.data.link_to_contact, "_blank", "noopener,noreferrer");
      } else {
        setWaError(result.success === false ? result.error : "Erreur inattendue");
      }
    });
  }

  return (
    <article
      className={`bg-white border rounded-2xl overflow-hidden transition-all duration-150 ${
        isAccepted
          ? "border-green-200 ring-1 ring-green-100"
          : isTripCancelled
            ? "border-amber-200 ring-1 ring-amber-100"
            : "border-stone-200"
      }`}
    >
      <div className="p-5">
        {/* Header */}
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
                {booking.trip.origin.label}
              </p>
              <p className="text-stone-500 text-sm">
                {booking.trip.destination.label}
              </p>
            </div>
          </div>
          <BookingStatusBadge status={booking.status} />
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-500 mb-3">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            {formattedDate}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            {booking.seats_requested} siège
            {booking.seats_requested !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Driver */}
        <div className="flex items-center gap-1.5 text-xs text-stone-400 mb-3">
          <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
            <span className="text-stone-600 font-bold text-[10px]">
              {booking.driver_name[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          Conducteur :{" "}
          <span className="font-medium text-stone-600">{booking.driver_name}</span>
        </div>

        {/* My message */}
        {booking.passenger_message && (
          <p className="text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 flex items-start gap-1 mb-3 leading-relaxed">
            <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
            {booking.passenger_message}
          </p>
        )}

        {/* Trip cancelled by driver — prominent alert */}
        {isTripCancelled && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-3 flex items-start gap-2.5">
            <AlertTriangle
              className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-semibold text-amber-800">
                Votre chauffeur a annulé ce trajet.
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Votre réservation a été automatiquement annulée. Vous pouvez chercher un autre trajet.
              </p>
            </div>
          </div>
        )}

        {/* Accepted — show WhatsApp CTA */}
        {isAccepted && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-3">
            <p className="text-xs text-green-700 font-medium mb-2">
              ✓ Réservation confirmée ! Contactez le conducteur sur WhatsApp.
            </p>
            {waError && (
              <p role="alert" className="text-xs text-red-600 mb-2">
                {waError}
              </p>
            )}
            <Button
              type="button"
              variant="whatsapp"
              className="w-full"
              size="md"
              onClick={handleWhatsApp}
              isLoading={isLoadingWA}
            >
              <WhatsAppIcon />
              Contacter sur WhatsApp
            </Button>
          </div>
        )}

        {/* Cancel */}
        {canCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            isLoading={isCancelling}
            className="text-stone-500 hover:text-red-700 text-xs"
          >
            Annuler ma réservation
          </Button>
        )}
      </div>
    </article>
  );
}
