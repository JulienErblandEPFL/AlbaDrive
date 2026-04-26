// src/app/(auth)/complete-profile/CompleteProfileForm.tsx
"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  completeProfileSchema,
  type CompleteProfileInput,
} from "@/lib/validations/auth.schema";
import { completeProfile } from "./actions";

export function CompleteProfileForm() {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations();
  const tProfile = useTranslations("auth.completeProfile");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<CompleteProfileInput>({
    resolver: zodResolver(completeProfileSchema),
  });

  function onSubmit(data: CompleteProfileInput) {
    startTransition(async () => {
      const result = await completeProfile(data);
      if (result && !result.success) {
        setError("root", { message: t(result.error.code, result.error.params) });
      }
    });
  }

  return (
    <div>
      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex gap-1.5">
          <div className="w-6 h-1.5 rounded-full bg-stone-200" />
          <div className="w-6 h-1.5 rounded-full bg-red-800" />
        </div>
        <span className="text-xs text-stone-400">{tProfile("step")}</span>
      </div>

      <h2 className="text-2xl font-bold text-stone-900 mb-1">
        {tProfile("title")}
      </h2>
      <p className="text-stone-500 text-sm mb-8 leading-relaxed">
        {tProfile("subtitle")}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label={tProfile("fullNameLabel")}
          type="text"
          autoComplete="name"
          placeholder={tProfile("fullNamePlaceholder")}
          error={errors.full_name?.message ? t(errors.full_name.message) : undefined}
          required
          {...register("full_name")}
        />

        <Input
          label={tProfile("phoneLabel")}
          type="tel"
          autoComplete="tel"
          placeholder={tProfile("phonePlaceholder")}
          error={errors.phone?.message ? t(errors.phone.message) : undefined}
          helperText={!errors.phone ? tProfile("phoneHelp") : undefined}
          required
          {...register("phone")}
        />

        {errors.root && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            {errors.root.message}
          </div>
        )}

        {/* Phone privacy reassurance */}
        <div className="flex items-start gap-3 rounded-xl bg-stone-100 px-4 py-3 mt-1">
          <svg
            className="w-4 h-4 text-stone-500 shrink-0 mt-0.5"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8 1a4.5 4.5 0 00-4.5 4.5V7H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-.5V5.5A4.5 4.5 0 008 1zm3 6V5.5a3 3 0 10-6 0V7h6z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-xs text-stone-500 leading-relaxed">
            {tProfile("privacyNotice")}
          </p>
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={isPending}
        >
          {tProfile("submit")}
        </Button>
      </form>
    </div>
  );
}
