// src/app/page.tsx
// Public landing page — own header, hero, how-it-works, driver CTA.
// Uses root layout only (no (main) layout shell).
import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SearchBar } from "./(main)/trips/components/SearchBar";
import { Car, ArrowRight, Search, UserCheck, MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "AlbaDrive — Covoiturage albanais en Europe",
  description:
    "Le covoiturage de confiance pour la diaspora albanaise. Genève → Pristina, München → Tirana et bien plus.",
};

// ── Header ────────────────────────────────────────────────────

function LandingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
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

        <nav className="flex items-center gap-2" aria-label="Navigation">
          <Link
            href="/trips"
            className="h-9 px-4 rounded-xl text-stone-300 text-sm font-medium hover:text-white hover:bg-white/10 transition-colors duration-150 flex items-center"
          >
            Trajets
          </Link>

          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="h-9 px-4 rounded-xl bg-white text-stone-900 text-sm font-semibold hover:bg-stone-100 transition-colors duration-150 flex items-center gap-1.5"
            >
              Tableau de bord
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="h-9 px-4 rounded-xl text-stone-300 text-sm font-medium hover:text-white hover:bg-white/10 transition-colors duration-150 flex items-center"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="h-9 px-4 rounded-xl bg-red-700 text-white text-sm font-semibold hover:bg-red-600 transition-colors duration-150 flex items-center"
              >
                S&apos;inscrire
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

// ── How it works ──────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: Search,
    title: "Cherchez un trajet",
    description:
      "Parcourez les trajets disponibles sur le corridor Europe ↔ Balkans. Filtrez par ville de départ, d'arrivée et par date.",
  },
  {
    step: "02",
    icon: UserCheck,
    title: "Réservez une place",
    description:
      "Envoyez une demande de réservation au conducteur avec un message optionnel. Zéro paiement en ligne.",
  },
  {
    step: "03",
    icon: MessageCircle,
    title: "Voyagez ensemble",
    description:
      "Une fois accepté, contactez le conducteur directement sur WhatsApp pour organiser le rendez-vous.",
  },
] as const;

// ── Page ──────────────────────────────────────────────────────

export default async function LandingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-stone-950 pt-16"
        aria-label="Accueil"
      >
        {/* Dot-grid texture */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />

        {/* Diagonal red accent */}
        <div
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-red-950/60 blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <LandingHeader isAuthenticated={isAuthenticated} />

        <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-xs font-medium text-stone-300 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
            Communauté albanaise en Europe
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight tracking-tight mb-5">
            Voyagez ensemble.
            <br />
            <span className="text-red-400">Vers les Balkans.</span>
          </h1>

          <p className="text-stone-400 text-lg sm:text-xl leading-relaxed mb-12 max-w-xl mx-auto">
            Le covoiturage de confiance pour la diaspora albanaise.
            Genève → Pristina, München → Tirana et bien plus.
          </p>

          {/* Search card */}
          <div className="text-left">
            <SearchBar />
          </div>

          {/* Route examples */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
            {[
              "Genève → Pristina",
              "München → Tirana",
              "Zürich → Shkodër",
              "Berlin → Sarajevo",
            ].map((route) => {
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

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-stone-50 pointer-events-none"
          aria-hidden="true"
        />
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="bg-stone-50 py-20 px-6" aria-labelledby="how-it-works-title">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2
              id="how-it-works-title"
              className="text-2xl sm:text-3xl font-bold text-stone-900 mb-3"
            >
              Comment ça marche ?
            </h2>
            <p className="text-stone-500 text-base max-w-md mx-auto">
              Trois étapes simples pour voyager avec la communauté.
            </p>
          </div>

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
            Vous rentrez en Albanie ou au Kosovo ?
          </h2>
          <p className="text-red-200 text-base mb-8 max-w-md mx-auto">
            Proposez votre trajet et partagez les frais avec des compatriotes.
            Simple, gratuit, communautaire.
          </p>
          <Link
            href={isAuthenticated ? "/trips/create" : "/register"}
            className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-white text-red-800 text-sm font-bold hover:bg-stone-100 active:bg-stone-200 transition-colors duration-150"
          >
            Proposer un trajet
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          {!isAuthenticated && (
            <p className="text-red-300 text-xs mt-4">
              Déjà inscrit ?{" "}
              <Link href="/login" className="text-white underline underline-offset-2">
                Connexion
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
            Covoiturage pour la diaspora albanaise en Europe.
          </p>
          <nav className="flex items-center gap-4" aria-label="Liens footer">
            <Link href="/trips" className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
              Trajets
            </Link>
            <Link href="/register" className="text-xs text-stone-500 hover:text-stone-300 transition-colors">
              S&apos;inscrire
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
