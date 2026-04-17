// src/app/(auth)/complete-profile/page.tsx
// This page is shown to any authenticated user who hasn't created a profile yet.
// The middleware ensures only authenticated users without a profile reach this page.
import type { Metadata } from "next";
import { CompleteProfileForm } from "./CompleteProfileForm";

export const metadata: Metadata = {
  title: "Compléter mon profil — AlbaDrive",
};

export default function CompleteProfilePage() {
  return <CompleteProfileForm />;
}
