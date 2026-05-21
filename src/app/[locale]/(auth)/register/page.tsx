import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { SupportedLocale } from "@/i18n/routing";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return { title: t("metadataTitle") };
}

export default function RegisterPage() {
  return <RegisterForm />;
}
