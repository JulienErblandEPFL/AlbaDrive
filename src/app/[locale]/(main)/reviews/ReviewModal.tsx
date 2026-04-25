// src/app/(main)/reviews/ReviewModal.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StarRating } from "@/components/ui/StarRating";
import { submitReview } from "./actions";
import { submitReviewSchema } from "@/lib/validations/review.schema";

type FormValues = z.infer<typeof submitReviewSchema>;

interface ReviewModalProps {
  tripId: string;
  revieweeId: string;
  revieweeName: string;
  /** Contextual — e.g. "votre conducteur" or "votre passager" */
  revieweeLabel: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful submission so the parent can refresh */
  onSubmitted?: () => void;
}

export function ReviewModal({
  tripId,
  revieweeId,
  revieweeName,
  revieweeLabel,
  isOpen,
  onClose,
  onSubmitted,
}: ReviewModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(submitReviewSchema),
    defaultValues: {
      trip_id: tripId,
      reviewee_id: revieweeId,
      rating: 0 as unknown as 1,
      comment: "",
    },
  });

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Reset form when the modal closes
  useEffect(() => {
    if (!isOpen) {
      reset({ trip_id: tripId, reviewee_id: revieweeId, rating: 0 as unknown as 1, comment: "" });
      setSubmitError(null);
    }
  }, [isOpen, reset, tripId, revieweeId]);

  if (!isOpen) return null;

  const rating = watch("rating");

  function onSubmit(values: FormValues) {
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitReview(values);
      if (result.success) {
        onSubmitted?.();
        onClose();
      } else {
        setSubmitError(result.error);
      }
    });
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id="review-modal-title" className="text-lg font-bold text-stone-900">
              Évaluer {revieweeLabel}
            </h2>
            <p className="text-sm text-stone-500 mt-0.5">{revieweeName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-5 pb-5 flex flex-col gap-4">
          {/* Hidden inputs for trip_id and reviewee_id (set via defaultValues) */}
          <input type="hidden" {...register("trip_id")} />
          <input type="hidden" {...register("reviewee_id")} />

          {/* Rating */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-stone-700">Note</label>
            <StarRating
              mode="interactive"
              value={rating ?? 0}
              onChange={(v) => setValue("rating", v as 1, { shouldValidate: true })}
              size="lg"
              ariaLabel="Note du trajet"
            />
            {errors.rating && (
              <p className="text-xs text-red-600" role="alert">
                {errors.rating.message}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-comment" className="text-sm font-medium text-stone-700">
              Commentaire <span className="text-stone-400 font-normal">(optionnel)</span>
            </label>
            <textarea
              id="review-comment"
              rows={4}
              maxLength={1000}
              placeholder="Partagez votre expérience…"
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-900 text-sm resize-none focus:border-red-800 focus:ring-2 focus:ring-red-100 outline-none placeholder:text-stone-400"
              {...register("comment")}
            />
            {errors.comment && (
              <p className="text-xs text-red-600" role="alert">
                {errors.comment.message}
              </p>
            )}
          </div>

          {submitError && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} size="sm">
              Annuler
            </Button>
            <Button type="submit" variant="primary" isLoading={isPending} size="sm">
              Envoyer l&apos;avis
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
