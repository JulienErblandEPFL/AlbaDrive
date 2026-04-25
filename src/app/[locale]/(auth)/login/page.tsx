// src/app/(auth)/login/page.tsx
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Connexion — AlbaDrive",
};

export default function LoginPage() {
  return <LoginForm />;
}
