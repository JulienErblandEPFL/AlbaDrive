// This page is shown to any authenticated user who hasn't created a profile yet.
// The middleware ensures only authenticated users without a profile reach this page.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { SupportedLocale } from "@/i18n/routing";
import { CompleteProfileForm } from "./CompleteProfileForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.completeProfile" });
  return { title: t("metadataTitle") };
}

export default function CompleteProfilePage() {
  return <CompleteProfileForm />;
}
