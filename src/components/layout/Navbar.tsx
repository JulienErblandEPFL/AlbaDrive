// src/components/layout/Navbar.tsx
"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X, ChevronDown, LogOut, Car } from "lucide-react";
import { signOut } from "@/lib/auth/actions";

interface NavbarProps {
  fullName: string;
  avatarUrl: string | null;
  email: string;
  isAuthenticated: boolean;
}

const NAV_LINKS: { href: string; label: string; authOnly?: boolean }[] = [
  { href: "/trips", label: "Trajets" },
  { href: "/dashboard", label: "Tableau de bord", authOnly: true },
];

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsDropdownOpen(false);
  }, [pathname]);

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
    });
  }

  const firstName = fullName.split(" ")[0];
  const visibleLinks = NAV_LINKS.filter((l) => !l.authOnly || isAuthenticated);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
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
            {visibleLinks.map(({ href, label }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "text-red-800 bg-red-50 font-semibold"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100",
                  ].join(" ")}
                >
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
                  <span aria-hidden="true">+</span> Proposer un trajet
                </Link>

                <div ref={dropdownRef} className="relative">
                  <button
                    onClick={() => setIsDropdownOpen((v) => !v)}
                    aria-expanded={isDropdownOpen}
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
                        isDropdownOpen ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  </button>

                  {isDropdownOpen && (
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

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl text-stone-700 hover:bg-stone-100 active:bg-stone-200 transition-colors duration-150 cursor-pointer"
          >
            {isMenuOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      <div
        id="mobile-menu"
        aria-hidden={!isMenuOpen}
        className={[
          "md:hidden overflow-hidden transition-all duration-200 ease-in-out",
          isMenuOpen ? "max-h-96 border-t border-stone-100" : "max-h-0",
        ].join(" ")}
      >
        <nav
          className="px-4 pt-3 pb-5 flex flex-col gap-1"
          aria-label="Navigation mobile"
        >
          {visibleLinks.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex items-center h-11 px-4 rounded-xl text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "text-red-800 bg-red-50 font-semibold"
                    : "text-stone-700 hover:bg-stone-100",
                ].join(" ")}
              >
                {label}
              </Link>
            );
          })}

          {isAuthenticated ? (
            <>
              <Link
                href="/trips/create"
                className="flex items-center h-11 px-4 rounded-xl bg-red-800 text-white text-sm font-semibold mt-1 hover:bg-red-900 transition-colors duration-150"
              >
                + Proposer un trajet
              </Link>

              <div className="mt-3 pt-3 border-t border-stone-100">
                <div className="flex items-center gap-3 px-4 py-2 mb-1">
                  <UserAvatar name={fullName} avatarUrl={avatarUrl} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 truncate">{fullName}</p>
                    <p className="text-xs text-stone-400 truncate">{email}</p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={isPending}
                  className="w-full flex items-center gap-2.5 h-11 px-4 rounded-xl text-sm text-stone-600 hover:bg-stone-50 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {isPending ? "Déconnexion…" : "Se déconnecter"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-2 pt-3 border-t border-stone-100 flex flex-col gap-2">
              <Link
                href="/login"
                className="flex items-center justify-center h-11 px-4 rounded-xl border border-stone-200 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors duration-150"
              >
                Se connecter
              </Link>
              <Link
                href="/register"
                className="flex items-center justify-center h-11 px-4 rounded-xl bg-red-800 text-white text-sm font-semibold hover:bg-red-900 transition-colors duration-150"
              >
                S&apos;inscrire
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
