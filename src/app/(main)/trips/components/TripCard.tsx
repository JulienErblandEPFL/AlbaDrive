// src/app/(main)/trips/components/TripCard.tsx
// Client Component — handles the inline booking form state.
"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Calendar, Users, Euro, MessageSquare, ChevronDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { requestBooking } from "@/app/(main)/bookings/actions";
import type { LocationJsonb } from "@/types/database.types";

interface TripCardProps {
  trip: {
    id: string;
    origin: LocationJsonb;
    destination: LocationJsonb;
    departure_at: string;
    available_seats: number;
    total_seats: number;
    price_per_seat: number | null;
    vehicle_description: string | null;
    notes: string | null;
  };
  driverName: string;
  currentUserId: string;
}

export function TripCard({ trip, driverName, currentUserId }: TripCardProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [seats, setSeats] = useState(1);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<
    { type: "success" } | { type: "error"; message: string } | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const departureDate = new Date(trip.departure_at);
  const formattedDate = format(departureDate, "EEEE d MMMM 'à' HH'h'mm", {
    locale: fr,
  });

  function handleBook() {
    startTransition(async () => {
      const res = await requestBooking({
        trip_id: trip.id,
        seats_requested: seats,
        passenger_message: message.trim() || undefined,
      });

      if (res.success) {
        setResult({ type: "success" });
        setIsFormOpen(false);
      } else {
        setResult({ type: "error", message: res.error });
      }
    });
  }

  return (
    <article className="bg-white border border-stone-200 rounded-2xl overflow-hidden hover:border-stone-300 hover:shadow-sm transition-all duration-150">
      {/* Trip header */}
      <div className="p-5">
        {/* Route */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-stone-400" />
            <div className="w-px h-5 bg-stone-200" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-red-800 bg-white" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-semibold text-stone-900">
              {trip.origin.label}
            </span>
            <span className="text-stone-600 text-sm">{trip.destination.label}</span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
            {formattedDate}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
            {trip.available_seats} place
            {trip.available_seats !== 1 ? "s" : ""} disponible
            {trip.available_seats !== 1 ? "s" : ""}
          </span>
          {trip.price_per_seat != null && trip.price_per_seat > 0 ? (
            <span className="flex items-center gap-1.5">
              <Euro className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
              {trip.price_per_seat} CHF / siège
            </span>
          ) : (
            <span className="text-green-700 font-medium">Gratuit</span>
          )}
        </div>

        {/* Driver name */}
        <div className="flex items-center gap-1.5 mt-3 text-xs text-stone-400">
          <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <span className="text-red-800 font-bold text-[10px]">
              {driverName[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <span>
            Conducteur :{" "}
            <span className="font-medium text-stone-600">{driverName}</span>
          </span>
        </div>

        {/* Notes */}
        {trip.notes && (
          <p className="mt-3 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2 leading-relaxed">
            <MessageSquare className="inline w-3 h-3 mr-1" aria-hidden="true" />
            {trip.notes}
          </p>
        )}

        {/* Success message */}
        {result?.type === "success" && (
          <div className="mt-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            ✓ Demande envoyée ! Le conducteur sera notifié.
          </div>
        )}

        {/* Error message */}
        {result?.type === "error" && (
          <div
            role="alert"
            className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            {result.message}
          </div>
        )}

        {/* CTA — varies by auth state */}
        {result?.type !== "success" && (
          currentUserId ? (
            <button
              onClick={() => setIsFormOpen((v) => !v)}
              className="mt-4 w-full flex items-center justify-between px-4 h-11 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 active:bg-red-950 transition-colors duration-150 cursor-pointer"
              aria-expanded={isFormOpen}
            >
              <span>Réserver une place</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isFormOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              <Link
                href={`/trips/${trip.id}`}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors duration-150"
              >
                Voir le trajet
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          )
        )}
      </div>

      {/* Inline booking form */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${isFormOpen ? "max-h-72" : "max-h-0"}`}
        aria-hidden={!isFormOpen}
      >
        <div className="border-t border-stone-100 px-5 py-4 flex flex-col gap-4 bg-stone-50">
          {/* Seats */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`seats-${trip.id}`}
              className="text-sm font-medium text-stone-700"
            >
              Nombre de places
            </label>
            <select
              id={`seats-${trip.id}`}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-stone-900 text-base focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none cursor-pointer"
            >
              {Array.from(
                { length: trip.available_seats },
                (_, i) => i + 1
              ).map((n) => (
                <option key={n} value={n}>
                  {n} place{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Optional message */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`msg-${trip.id}`}
              className="text-sm font-medium text-stone-700"
            >
              Message au conducteur{" "}
              <span className="text-stone-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              id={`msg-${trip.id}`}
              rows={2}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="ex: Je viens de l'aéroport, j'ai une valise…"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 text-sm resize-none focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none placeholder:text-stone-400"
            />
          </div>

          {/* Error in form */}
          {result?.type === "error" && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700"
            >
              {result.message}
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            onClick={handleBook}
            isLoading={isPending}
            className="w-full"
          >
            Envoyer la demande
          </Button>
        </div>
      </div>
    </article>
  );
}
