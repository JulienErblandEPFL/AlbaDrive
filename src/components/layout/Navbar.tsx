// src/components/layout/Navbar.tsx
"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Search,
  PlusCircle,
  User,
  LayoutDashboard,
  LogOut,
  Car,
  ChevronDown,
} from "lucide-react";
import { signOut } from "@/lib/auth/actions";

interface NavbarProps {
  fullName: string;
  avatarUrl: string | null;
  email: string;
  isAuthenticated: boolean;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  authOnly?: boolean;
  exact?: boolean;
};

const DESKTOP_NAV: NavItem[] = [
  { href: "/", label: "Accueil", icon: Home, exact: true },
  { href: "/trips", label: "Trajets", icon: Search },
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, authOnly: true },
];

const BOTTOM_TABS: NavItem[] = [
  { href: "/", label: "Accueil", icon: Home, exact: true },
  { href: "/trips", label: "Trajets", icon: Search },
  { href: "/trips/create", label: "Proposer", icon: PlusCircle, authOnly: true },
  { href: "/dashboard", label: "Profil", icon: User, authOnly: true },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        width={32}
        height={32}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <span className="text-red-800 text-xs font-bold">{initials || "?"}</span>
    </div>
  );
}

export function Navbar({ fullName, avatarUrl, email, isAuthenticated }: NavbarProps) {
  const pathname = usePathname();
  const [isDesktopDropdownOpen, setIsDesktopDropdownOpen] = useState(false);
  const [isMobileDropdownOpen, setIsMobileDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (desktopDropdownRef.current && !desktopDropdownRef.current.contains(e.target as Node)) {
        setIsDesktopDropdownOpen(false);
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(e.target as Node)) {
        setIsMobileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setIsDesktopDropdownOpen(false);
    setIsMobileDropdownOpen(false);
  }, [pathname]);

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  const firstName = fullName.split(" ")[0];
  const visibleDesktopLinks = DESKTOP_NAV.filter((l) => !l.authOnly || isAuthenticated);

  return (
    <>
      {/* ── TOP BAR ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">

            {/* Logo — toujours vers / */}
            <Link
              href="/"
              className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-stone-900 shrink-0"
            >
              <Car className="w-5 h-5 text-red-700" aria-hidden="true" />
              Alba<span className="text-red-700">Drive</span>
            </Link>

            {/* Desktop nav links */}
            <nav
              className="hidden md:flex items-center gap-0.5"
              aria-label="Navigation principale"
            >
              {visibleDesktopLinks.map(({ href, label, icon: Icon, exact: exactMatch }) => {
                const active = isActive(pathname, href, exactMatch);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                      active
                        ? "text-red-800 bg-red-50 font-semibold"
                        : "text-stone-600 hover:text-stone-900 hover:bg-stone-100",
                    ].join(" ")}
                  >
                    <Icon
                      className={["w-4 h-4", active ? "text-red-700" : "text-stone-400"].join(" ")}
                      aria-hidden="true"
                    />
                    {label}
                  </Link>
                );
              })}
            </nav>

            {/* Desktop right side */}
            <div className="hidden md:flex items-center gap-3 ml-auto">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/trips/create"
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 active:bg-red-950 transition-colors duration-150"
                  >
                    <PlusCircle className="w-4 h-4" aria-hidden="true" />
                    Proposer un trajet
                  </Link>

                  <div ref={desktopDropdownRef} className="relative">
                    <button
                      onClick={() => setIsDesktopDropdownOpen((v) => !v)}
                      aria-expanded={isDesktopDropdownOpen}
                      aria-haspopup="menu"
                      className="flex items-center gap-2 h-9 px-3 rounded-xl border border-stone-200 hover:bg-stone-50 active:bg-stone-100 transition-colors duration-150 cursor-pointer"
                    >
                      <UserAvatar name={fullName} avatarUrl={avatarUrl} />
                      <span className="text-sm font-medium text-stone-800 max-w-[6rem] truncate">
                        {firstName}
                      </span>
                      <ChevronDown
                        className={[
                          "w-3.5 h-3.5 text-stone-400 transition-transform duration-200",
                          isDesktopDropdownOpen ? "rotate-180" : "",
                        ].join(" ")}
                        aria-hidden="true"
                      />
                    </button>

                    {isDesktopDropdownOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-[calc(100%+6px)] w-60 bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden z-50"
                      >
                        <div className="px-4 py-3 border-b border-stone-100">
                          <p className="text-sm font-semibold text-stone-900 truncate">{fullName}</p>
                          <p className="text-xs text-stone-400 truncate mt-0.5">{email}</p>
                        </div>
                        <button
                          role="menuitem"
                          onClick={handleSignOut}
                          disabled={isPending}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                          {isPending ? "Déconnexion…" : "Se déconnecter"}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="h-9 px-4 rounded-xl border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors duration-150 flex items-center"
                  >
                    Se connecter
                  </Link>
                  <Link
                    href="/register"
                    className="h-9 px-4 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors duration-150 flex items-center"
                  >
                    S&apos;inscrire
                  </Link>
                </>
              )}
            </div>

            {/* Mobile — avatar + dropdown (connecté) */}
            {isAuthenticated && (
              <div ref={mobileDropdownRef} className="md:hidden relative ml-auto">
                <button
                  onClick={() => setIsMobileDropdownOpen((v) => !v)}
                  aria-expanded={isMobileDropdownOpen}
                  aria-haspopup="menu"
                  aria-label="Menu utilisateur"
                  className="flex items-center justify-center w-9 h-9 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors cursor-pointer overflow-hidden"
                >
                  <UserAvatar name={fullName} avatarUrl={avatarUrl} />
                </button>

                {isMobileDropdownOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-[calc(100%+6px)] w-64 bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden z-50"
                  >
                    <div className="px-4 py-3 border-b border-stone-100">
                      <p className="text-sm font-semibold text-stone-900 truncate">{fullName}</p>
                      <p className="text-xs text-stone-400 truncate mt-0.5">{email}</p>
                    </div>
                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      disabled={isPending}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                      {isPending ? "Déconnexion…" : "Se déconnecter"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile — connexion/inscription (non connecté) */}
            {!isAuthenticated && (
              <div className="md:hidden flex items-center gap-2 ml-auto">
                <Link
                  href="/login"
                  className="h-9 px-3 rounded-xl border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors flex items-center"
                >
                  Connexion
                </Link>
                <Link
                  href="/register"
                  className="h-9 px-3 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors flex items-center"
                >
                  S&apos;inscrire
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MOBILE BOTTOM NAV ────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200"
        aria-label="Navigation mobile"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch h-16">
          {BOTTOM_TABS.map(({ href, label, icon: Icon, authOnly, exact: exactMatch }) => {
            const resolvedHref = authOnly && !isAuthenticated ? "/login" : href;
            const active = isActive(pathname, href, exactMatch);
            return (
              <Link
                key={href}
                href={resolvedHref}
                aria-current={active ? "page" : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-colors duration-150"
              >
                {/* Active indicator — barre en haut du tab */}
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-red-700 rounded-full"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={[
                    "w-5 h-5 transition-colors duration-150",
                    active ? "text-red-700" : "text-stone-400",
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span
                  className={[
                    "text-[10px] font-medium transition-colors duration-150",
                    active ? "text-red-700 font-semibold" : "text-stone-400",
                  ].join(" ")}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
