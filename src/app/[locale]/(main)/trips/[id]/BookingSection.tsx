// src/app/(main)/trips/[id]/BookingSection.tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { requestBooking } from "@/app/[locale]/(main)/bookings/actions";
import { Button } from "@/components/ui/Button";
import { LogIn, CheckCircle, AlertCircle } from "lucide-react";

interface BookingSectionProps {
  tripId: string;
  availableSeats: number;
  isAuthenticated: boolean;
  isOwnTrip: boolean;
  tripPath: string;
}

export function BookingSection({
  tripId,
  availableSeats,
  isAuthenticated,
  isOwnTrip,
  tripPath,
}: BookingSectionProps) {
  const [seats, setSeats] = useState(1);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { type: "success" } | { type: "error"; message: string } | null
  >(null);
  const t = useTranslations();
  const tDetail = useTranslations("trips.detail");

  if (!isAuthenticated) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5">
        <p className="text-sm text-stone-600 mb-4">
          {tDetail("loginPromptText")}
        </p>
        <Link
          href={`/login?redirect=${encodeURIComponent(tripPath)}`}
          className="flex items-center justify-center gap-2 h-12 w-full rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors duration-150"
        >
          <LogIn className="w-4 h-4" aria-hidden="true" />
          {tDetail("loginPromptButton")}
        </Link>
        <p className="text-center text-xs text-stone-400 mt-3">
          {tDetail("noAccount")}{" "}
          <Link href="/register" className="text-red-700 hover:underline">
            {tDetail("registerLink")}
          </Link>
        </p>
      </div>
    );
  }

  if (isOwnTrip) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 text-center">
        <p className="text-sm font-medium text-stone-600">
          {tDetail("ownTrip")}
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 mt-3 text-sm text-red-700 hover:underline"
        >
          {tDetail("ownTripCta")}
        </Link>
      </div>
    );
  }

  if (result?.type === "success") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-green-800">
            {tDetail("successTitle")}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            {tDetail("successDescription")}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 mt-3 text-xs text-green-700 font-semibold hover:underline"
          >
            {tDetail("viewBookings")}
          </Link>
        </div>
      </div>
    );
  }

  function handleSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await requestBooking({
        trip_id: tripId,
        seats_requested: seats,
        passenger_message: message.trim() || undefined,
      });

      if (res.success) {
        setResult({ type: "success" });
      } else {
        setResult({ type: "error", message: t(res.error.code, res.error.params) });
      }
    });
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 flex flex-col gap-4">
      <h2 className="text-base font-semibold text-stone-900">
        {tDetail("bookTitle")}
      </h2>

      {/* Seats selector */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="booking-seats"
          className="text-sm font-medium text-stone-700"
        >
          {tDetail("seatsLabel")}
        </label>
        <select
          id="booking-seats"
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-stone-900 text-base focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none cursor-pointer"
        >
          {Array.from({ length: availableSeats }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {tDetail("seatsOption", { count: n })}
            </option>
          ))}
        </select>
      </div>

      {/* Optional message */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="booking-message"
          className="text-sm font-medium text-stone-700"
        >
          {tDetail("messageLabel")}{" "}
          <span className="text-stone-400 font-normal">{tDetail("messageOptional")}</span>
        </label>
        <textarea
          id="booking-message"
          rows={3}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={tDetail("messagePlaceholder")}
          className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 text-sm resize-none focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none placeholder:text-stone-400"
        />
      </div>

      {/* Error */}
      {result?.type === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          {result.message}
        </div>
      )}

      <Button
        type="button"
        variant="primary"
        onClick={handleSubmit}
        isLoading={isPending}
        className="w-full"
      >
        {tDetail("submit")}
      </Button>
    </div>
  );
}
