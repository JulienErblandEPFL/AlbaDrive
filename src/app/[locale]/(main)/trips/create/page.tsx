import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { SupportedLocale } from "@/i18n/routing";
import { CreateTripForm } from "./CreateTripForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "trips.metadata" });
  return { title: t("createTitle") };
}

export default function CreateTripPage() {
  return <CreateTripForm />;
}
