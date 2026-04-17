// src/app/(auth)/login/LoginForm.tsx
"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginSchema, type LoginInput } from "@/lib/validations/auth.schema";
import { signIn } from "./actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [isGooglePending, startGoogleTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  function onSubmit(data: LoginInput) {
    startTransition(async () => {
      const result = await signIn(data);
      // If we reach here, signIn returned an error (redirect throws, so no return on success).
      if (result && !result.success) {
        setError("root", { message: result.error });
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

  return (
    <div>
      <h2 className="text-2xl font-bold text-stone-900 mb-1">Connexion</h2>
      <p className="text-stone-500 text-sm mb-8">
        Pas encore de compte ?{" "}
        <a
          href="/register"
          className="text-red-800 font-medium hover:text-red-900 transition-colors"
        >
          S&apos;inscrire
        </a>
      </p>

      {/* Google OAuth */}
      <Button
        type="button"
        variant="secondary"
        className="w-full mb-4"
        onClick={handleGoogleLogin}
        isLoading={isGooglePending}
        aria-label="Continuer avec Google"
      >
        <GoogleIcon />
        Continuer avec Google
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-stone-200" />
        <span className="text-xs text-stone-400 font-medium uppercase tracking-wide">
          ou
        </span>
        <div className="flex-1 h-px bg-stone-200" />
      </div>

      {/* Email/password form */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          error={errors.email?.message}
          required
          {...register("email")}
        />

        <Input
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          required
          {...register("password")}
        />

        {/* Root-level error (server-returned) */}
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
          Se connecter
        </Button>
      </form>
    </div>
  );
}
