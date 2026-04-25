// src/app/(auth)/register/page.tsx
import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = {
  title: "Inscription — AlbaDrive",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
