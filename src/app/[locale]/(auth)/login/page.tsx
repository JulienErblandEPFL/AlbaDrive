import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { SupportedLocale } from "@/i18n/routing";
import { LoginForm } from "./LoginForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metadataTitle") };
}

export default function LoginPage() {
  return <LoginForm />;
}
