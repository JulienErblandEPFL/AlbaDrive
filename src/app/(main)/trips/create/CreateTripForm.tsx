// src/app/(main)/trips/create/CreateTripForm.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ArrowLeft, MapPin, Calendar, Car, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createTrip } from "@/app/(main)/trips/actions";
import { citiesByRegion, findCity } from "@/lib/constants/cities";

// ── Client-side form schema (city labels, not LocationJsonb) ────────────────

const formSchema = z
  .object({
    originLabel: z.string().min(1, "Veuillez sélectionner une ville de départ"),
    destinationLabel: z.string().min(1, "Veuillez sélectionner une ville d'arrivée"),
    date: z.string().min(1, "Date requise"),
    time: z.string().min(1, "Heure requise"),
    total_seats: z.number().int().min(1).max(9),
    price_per_seat: z.string().optional(),
    vehicle_description: z.string().max(200).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((d) => d.originLabel !== d.destinationLabel, {
    message: "La ville de départ et d'arrivée doivent être différentes",
    path: ["destinationLabel"],
  });

type FormData = z.infer<typeof formSchema>;

// ── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Itinéraire", icon: MapPin },
  { id: 2, label: "Date & Places", icon: Calendar },
  { id: 3, label: "Détails", icon: Car },
] as const;

const STEP_FIELDS: Record<number, (keyof FormData)[]> = {
  1: ["originLabel", "destinationLabel"],
  2: ["date", "time", "total_seats"],
  3: [],
};

// ── City select component ───────────────────────────────────────────────────

function CitySelect({
  id,
  label,
  error,
  required,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
}) {
  const grouped = citiesByRegion();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-700">
        {label}
        {required && (
          <span className="ml-1 text-red-700" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <select
        id={id}
        aria-invalid={!!error}
        className={[
          "h-12 w-full rounded-xl border bg-white px-4 text-stone-900 text-base",
          "transition-colors duration-150 outline-none cursor-pointer",
          error
            ? "border-red-500 focus:ring-2 focus:ring-red-200"
            : "border-stone-200 focus:border-red-800 focus:ring-2 focus:ring-red-100",
        ].join(" ")}
        {...props}
      >
        <option value="">Sélectionner une ville…</option>
        {Object.entries(grouped).map(([region, cities]) => (
          <optgroup key={region} label={region}>
            {cities.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function CreateTripForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  const today = new Date().toISOString().split("T")[0];

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
    setError,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      total_seats: 1,
    },
  });

  async function goNext() {
    const fields = STEP_FIELDS[step];
    const valid = await trigger(fields);
    if (valid) setStep((s) => Math.min(s + 1, 3));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  const originLabel = watch("originLabel");
  const destinationLabel = watch("destinationLabel");

  function onSubmit(data: FormData) {
    const origin = findCity(data.originLabel);
    const destination = findCity(data.destinationLabel);

    if (!origin || !destination) {
      setError("root", { message: "Ville non reconnue. Veuillez réessayer." });
      return;
    }

    // Combine date + time into an ISO string (UTC)
    const departure_at = new Date(
      `${data.date}T${data.time}:00`
    ).toISOString();

    const priceRaw = data.price_per_seat?.trim();
    const price_per_seat =
      priceRaw && priceRaw !== "" ? parseFloat(priceRaw) : null;

    startTransition(async () => {
      const result = await createTrip({
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        destination: {
          label: destination.label,
          lat: destination.lat,
          lng: destination.lng,
        },
        departure_at,
        total_seats: data.total_seats,
        price_per_seat,
        vehicle_description: data.vehicle_description || undefined,
        notes: data.notes || undefined,
      });

      if (!result.success) {
        setError("root", { message: result.error });
        return;
      }

      router.push("/dashboard");
    });
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      {/* Back to dashboard */}
      <button
        onClick={() => router.push("/dashboard")}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-8 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Retour
      </button>

      <h1 className="text-2xl font-bold text-stone-900 mb-1">
        Proposer un trajet
      </h1>
      <p className="text-stone-500 text-sm mb-8">
        Partagez votre route avec la communauté albanaise.
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10" aria-label="Étapes du formulaire">
        {STEPS.map(({ id, label, icon: Icon }, i) => {
          const isDone = step > id;
          const isActive = step === id;
          return (
            <div key={id} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    "w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-200",
                    isDone
                      ? "bg-red-800 text-white"
                      : isActive
                        ? "bg-red-100 text-red-800 ring-2 ring-red-800 ring-offset-2"
                        : "bg-stone-100 text-stone-400",
                  ].join(" ")}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isDone ? (
                    <CheckCircle className="w-4.5 h-4.5" aria-hidden="true" />
                  ) : (
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={`text-xs font-medium ${isActive ? "text-red-800" : "text-stone-400"}`}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mb-5 ${step > id ? "bg-red-800" : "bg-stone-200"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* ── STEP 1: Route ─────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <CitySelect
              id="originLabel"
              label="Ville de départ"
              required
              error={errors.originLabel?.message}
              {...register("originLabel")}
            />

            {/* Swap visual */}
            {originLabel && destinationLabel && (
              <div className="flex items-center gap-2 text-stone-400 text-sm">
                <div className="flex-1 h-px bg-stone-200" />
                <span className="font-medium text-stone-500">
                  {originLabel} → {destinationLabel}
                </span>
                <div className="flex-1 h-px bg-stone-200" />
              </div>
            )}

            <CitySelect
              id="destinationLabel"
              label="Ville d'arrivée"
              required
              error={errors.destinationLabel?.message}
              {...register("destinationLabel")}
            />
          </div>
        )}

        {/* ── STEP 2: Date & seats ──────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <Input
              label="Date du départ"
              type="date"
              min={today}
              required
              error={errors.date?.message}
              {...register("date")}
            />

            <Input
              label="Heure de départ"
              type="time"
              required
              error={errors.time?.message}
              {...register("time")}
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="total_seats"
                className="text-sm font-medium text-stone-700"
              >
                Nombre de places disponibles{" "}
                <span className="text-red-700" aria-hidden="true">
                  *
                </span>
              </label>
              <select
                id="total_seats"
                aria-invalid={!!errors.total_seats}
                className="h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-stone-900 text-base focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none cursor-pointer"
                {...register("total_seats", { valueAsNumber: true })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    {n} place{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
              {errors.total_seats && (
                <p role="alert" className="text-sm text-red-600">
                  {errors.total_seats.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 3: Optional details ─────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-5">
            <Input
              label="Prix par siège (optionnel)"
              type="number"
              min="0"
              step="0.50"
              placeholder="ex: 50"
              helperText={
                !errors.price_per_seat
                  ? "Laisser vide si gratuit ou à discuter."
                  : undefined
              }
              error={errors.price_per_seat?.message}
              {...register("price_per_seat")}
            />

            <Input
              label="Description du véhicule (optionnel)"
              type="text"
              maxLength={200}
              placeholder="ex: VW Golf grise, plaque GE"
              error={errors.vehicle_description?.message}
              {...register("vehicle_description")}
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="notes"
                className="text-sm font-medium text-stone-700"
              >
                Notes / Instructions (optionnel)
              </label>
              <textarea
                id="notes"
                rows={3}
                maxLength={500}
                placeholder="ex: Point de rendez-vous, stops prévus…"
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 text-base resize-none focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none placeholder:text-stone-400"
                {...register("notes")}
              />
              {errors.notes && (
                <p role="alert" className="text-sm text-red-600">
                  {errors.notes.message}
                </p>
              )}
            </div>

            {errors.root && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              >
                {errors.root.message}
              </div>
            )}
          </div>
        )}

        {/* ── Navigation buttons ──────────────────────────── */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <Button
              type="button"
              variant="secondary"
              onClick={goBack}
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Précédent
            </Button>
          )}

          {step < 3 ? (
            <Button
              type="button"
              variant="primary"
              onClick={goNext}
              className="flex-1"
            >
              Suivant
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              isLoading={isPending}
            >
              Publier le trajet
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
