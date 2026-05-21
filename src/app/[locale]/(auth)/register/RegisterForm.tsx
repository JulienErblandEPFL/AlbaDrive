// src/app/(auth)/register/RegisterForm.tsx
"use client";

import { useTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth.schema";
import { signUp } from "./actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { CheckCircle } from "lucide-react";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
    />
    <path
      fill="#34A853"
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
    />
    <path
      fill="#FBBC05"
      d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
    />
    <path
      fill="#EA4335"
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
    />
  </svg>
);

export function RegisterForm() {
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();
  const [emailSent, setEmailSent] = useState(false);
  const t = useTranslations();
  const tRegister = useTranslations("auth.register");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  function onSubmit(data: RegisterInput) {
    startTransition(async () => {
      const result = await signUp(data);
      if (!result) return; // redirect happened

      if (!result.success) {
        setError("root", { message: t(result.error.code, result.error.params) });
        return;
      }

      if (result.data?.needsEmailConfirmation) {
        setEmailSent(true);
      }
    });
  }

  function handleGoogleLogin() {
    startGoogleTransition(async () => {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    });
  }

  if (emailSent) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-5">
          <CheckCircle className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-stone-900 mb-2">
          {tRegister("emailSent.title")}
        </h2>
        <p className="text-stone-500 text-sm leading-relaxed">
          {tRegister("emailSent.description")}
        </p>
        <Link
          href="/login"
          className="inline-block mt-6 text-sm font-medium text-red-800 hover:text-red-900"
        >
          {tRegister("emailSent.backLink")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 mb-1">{tRegister("title")}</h2>
      <p className="text-stone-500 text-sm mb-8">
        {tRegister("subtitle")}{" "}
        <Link
          href="/login"
          className="text-red-800 font-medium hover:text-red-900 transition-colors"
        >
          {tRegister("subtitleLink")}
        </Link>
      </p>

      {/* Google OAuth */}
      <Button
        type="button"
        variant="secondary"
        className="w-full mb-4"
        onClick={handleGoogleLogin}
        isLoading={isGooglePending}
        aria-label={tRegister("googleAriaLabel")}
      >
        <GoogleIcon />
        {tRegister("googleButton")}
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-stone-200" />
        <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">
          {tRegister("divider")}
        </span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label={tRegister("emailLabel")}
          type="email"
          autoComplete="email"
          placeholder={tRegister("emailPlaceholder")}
          error={errors.email?.message ? t(errors.email.message) : undefined}
          required
          {...register("email")}
        />

        <Input
          label={tRegister("passwordLabel")}
          type="password"
          autoComplete="new-password"
          placeholder={tRegister("passwordPlaceholder")}
          error={errors.password?.message ? t(errors.password.message) : undefined}
          helperText={!errors.password ? tRegister("passwordHelp") : undefined}
          required
          {...register("password")}
        />

        <Input
          label={tRegister("confirmPasswordLabel")}
          type="password"
          autoComplete="new-password"
          placeholder={tRegister("confirmPasswordPlaceholder")}
          error={errors.confirmPassword?.message ? t(errors.confirmPassword.message) : undefined}
          required
          {...register("confirmPassword")}
        />

        {errors.root && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
          >
            {errors.root.message}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full mt-2"
          isLoading={isPending}
        >
          {tRegister("submit")}
        </Button>

        <p className="text-center text-xs text-stone-400 leading-relaxed">
          {tRegister("termsNotice")}
        </p>
      </form>
    </div>
  );
}
