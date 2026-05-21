// src/app/[locale]/page.tsx
// Public landing page — own header, hero, how-it-works, driver CTA.
// Uses root layout only (no (main) layout shell).
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import { SearchBar } from "./(main)/trips/components/SearchBar";
import { Car, ArrowRight, Search, UserCheck, MessageCircle } from "lucide-react";
import type { SupportedLocale } from "@/i18n/routing";
import {
  buildCanonical,
  buildLocaleAlternates,
  getOgAlternateLocales,
  getOgLocale,
} from "@/lib/intl/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.metadata" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: buildCanonical(locale, ""),
      languages: buildLocaleAlternates(""),
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      locale: getOgLocale(locale),
      alternateLocale: getOgAlternateLocales(locale),
      type: "website",
    },
  };
}

// ── Header ────────────────────────────────────────────────────

function LandingHeader({
  isAuthenticated,
  t,
}: {
  isAuthenticated: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"landing.header">>>;
}) {
  return (
    <header className="absolute top-0 left-0 right-0 z-10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-white"
        >
          <Car className="w-5 h-5 text-red-400" aria-hidden="true" />
          Alba<span className="text-red-400">Drive</span>
        </Link>

        <nav className="flex items-center gap-2" aria-label={t("nav")}>
          <Link
            href="/trips"
            className="h-9 px-4 rounded-xl text-stone-300 text-sm font-medium hover:text-white hover:bg-white/10 transition-colors duration-150 flex items-center"
          >
            {t("trips")}
          </Link>

          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="h-9 px-4 rounded-xl bg-white text-stone-900 text-sm font-semibold hover:bg-stone-100 transition-colors duration-150 flex items-center gap-1.5"
            >
              {t("dashboard")}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="h-9 px-4 rounded-xl text-stone-300 text-sm font-medium hover:text-white hover:bg-white/10 transition-colors duration-150 flex items-center"
              >
                {t("signIn")}
              </Link>
              <Link
                href="/register"
                className="h-9 px-4 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-600 transition-colors duration-150 flex items-center"
              >
                {t("register")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// ── Page ──────────────────────────────────────────────────────

const ROUTE_EXAMPLES = [
  "Genève → Pristina",
  "München → Tirana",
  "Zürich → Shkodër",
  "Berlin → Sarajevo",
] as const;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}) {
  const { locale } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  const t = await getTranslations({ locale, namespace: "landing" });
  const tHeader = await getTranslations({ locale, namespace: "landing.header" });

  const HOW_IT_WORKS = [
    { step: "01", icon: Search, title: t("howItWorks.step1.title"), description: t("howItWorks.step1.description") },
    { step: "02", icon: UserCheck, title: t("howItWorks.step2.title"), description: t("howItWorks.step2.description") },
    { step: "03", icon: MessageCircle, title: t("howItWorks.step3.title"), description: t("howItWorks.step3.description") },
  ] as const;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden min-h-[85vh] flex flex-col pt-16"
        aria-label={t("hero.ariaLabel")}
      >
        {/* Background photo */}
        <Image
          src="/images/albania_up_sea.webp"
          alt=""
          fill
          priority
          className="object-cover"
          aria-hidden="true"
        />

        {/* Dark overlay — ensures text readability */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/50 to-stone-950/90 pointer-events-none"
          aria-hidden="true"
        />

        {/* Subtle dot-grid texture on top of overlay */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />

        <LandingHeader isAuthenticated={isAuthenticated} t={tHeader} />

        <div className="relative flex-1 flex items-center max-w-3xl mx-auto px-6 pt-16 pb-20 text-center w-full">
        <div className="w-full">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-medium text-stone-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
            {t("hero.badge")}
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight tracking-tight mb-5">
            {t("hero.headline_part1")}
            <br />
            <span className="text-red-400">{t("hero.headline_part2")}</span>
          </h1>

          <p className="text-stone-400 text-lg sm:text-xl leading-relaxed mb-12 max-w-xl mx-auto">
            {t("hero.subtitle")}
          </p>

          {/* Search card */}
          <div className="text-left">
            <SearchBar glass />
          </div>

          {/* Route examples */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {ROUTE_EXAMPLES.map((route) => {
              const [from, to] = route.split(" → ");
              return (
                <Link
                  key={route}
                  href={`/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
                  className="text-xs text-stone-400 hover:text-stone-200 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-full transition-colors duration-150"
                >
                  {route}
                </Link>
              );
            })}
          </div>
        </div>
        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-stone-50 pointer-events-none"
          aria-hidden="true"
        />
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="bg-stone-50 pb-20" aria-labelledby="how-it-works-title">
        {/* Photo banner — pont albanais */}
        <div className="relative h-52 sm:h-64 overflow-hidden">
          <Image
            src="/images/albania_pont.jpg"
            alt={t("howItWorks.imgAlt")}
            fill
            className="object-cover object-center"
          />
          {/* Overlay dégradé rouge foncé → transparent → rouge foncé */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-stone-950/70 via-red-950/50 to-stone-50 pointer-events-none"
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <h2
              id="how-it-works-title"
              className="text-2xl sm:text-3xl font-bold text-white mb-2 drop-shadow-md"
            >
              {t("howItWorks.title")}
            </h2>
            <p className="text-stone-200 text-base max-w-md drop-shadow">
              {t("howItWorks.subtitle")}
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 pt-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map(({ step, icon: Icon, title, description }) => (
              <div
                key={step}
                className="bg-white border border-stone-200 rounded-2xl p-6 relative overflow-hidden group hover:border-red-200 hover:shadow-sm transition-all duration-200"
              >
                <span
                  className="absolute -top-3 -right-3 text-7xl font-black text-stone-100 leading-none select-none pointer-events-none group-hover:text-red-50 transition-colors duration-200"
                  aria-hidden="true"
                >
                  {step}
                </span>

                <div className="relative">
                  <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4 group-hover:bg-red-100 transition-colors duration-200">
                    <Icon className="w-5 h-5 text-red-800" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-bold text-stone-900 mb-2">{title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DRIVER CTA ────────────────────────────────────────── */}

      <section className="bg-red-800 py-16 px-6" aria-labelledby="driver-cta-title">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-700 mb-6">
            <Car className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h2
            id="driver-cta-title"
            className="text-2xl sm:text-3xl font-bold text-white mb-4"
          >
            {t("driverCta.title")}
          </h2>
          <p className="text-red-200 text-base mb-8 max-w-md mx-auto">
            {t("driverCta.subtitle")}
          </p>
          <Link
            href={isAuthenticated ? "/trips/create" : "/register"}
            className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-white text-red-800 text-sm font-bold hover:bg-stone-100 active:bg-stone-200 transition-colors duration-150"
          >
            {t("driverCta.button")}
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          {!isAuthenticated && (
            <p className="text-red-300 text-xs mt-4">
              {t("driverCta.alreadyMember")}{" "}
              <Link href="/login" className="text-white underline underline-offset-2">
                {t("driverCta.signInLink")}
              </Link>
            </p>
          )}
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="bg-stone-900 py-8 px-6 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-extrabold text-base text-white"
          >
            <Car className="w-4 h-4 text-red-400" aria-hidden="true" />
            Alba<span className="text-red-400">Drive</span>
          </Link>
          <p className="text-stone-500 text-xs text-center">
            {t("footer.tagline")}
          </p>
          <nav className="flex items-center gap-4" aria-label={t("footer.ariaLabel")}>
            <Link href="/trips" className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
              {t("footer.trips")}
            </Link>
            <Link href="/register" className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
              {t("footer.register")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
