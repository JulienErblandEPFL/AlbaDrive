// src/app/(auth)/layout.tsx
// Shared layout for all auth pages: /login, /register, /complete-profile

/** Decorative route line — visually communicates the carpooling concept */
function RouteVisual() {
  const routes = [
    { from: "Genève", to: "Pristina" },
    { from: "München", to: "Tirana" },
    { from: "Paris", to: "Shkodër" },
  ];

  return (
    <div className="flex flex-col gap-5 mt-10">
      {routes.map(({ from, to }) => (
        <div key={from} className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-white" />
            <div className="w-px h-6 bg-white/30" />
            <div className="w-2.5 h-2.5 rounded-full border-2 border-white bg-red-800" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-white text-sm font-medium leading-none">
              {from}
            </span>
            <span className="text-white/60 text-xs leading-none">↓</span>
            <span className="text-white/80 text-sm leading-none">{to}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** AlbaDrive wordmark — rendered as styled text, no external image needed */
export function AlbaDriveLogo({
  size = "md",
}: {
  size?: "sm" | "md" | "lg";
}) {
  const textClass =
    size === "lg"
      ? "text-3xl"
      : size === "sm"
        ? "text-xl"
        : "text-2xl";

  return (
    <span className={`font-extrabold tracking-tight ${textClass}`}>
      <span>Alba</span>
      <span className="text-red-700">Drive</span>
    </span>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex">
      {/* ── Left brand panel (desktop only) ─────────────────── */}
      <div
        className="hidden lg:flex lg:w-[42%] xl:w-[38%] flex-col justify-between
                    p-12 bg-stone-950 relative overflow-hidden"
        aria-hidden="true"
      >
        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
        />

        {/* Diagonal red accent block */}
        <div
          className="absolute bottom-0 right-0 w-64 h-64 bg-red-900/20 rounded-tl-[80px]"
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Logo */}
          <span className="text-3xl font-extrabold tracking-tight text-white">
            Alba<span className="text-red-500">Drive</span>
          </span>

          {/* Headline */}
          <div className="mt-12">
            <p className="text-white/50 text-sm font-medium uppercase tracking-widest mb-3">
              La communauté du voyage
            </p>
            <h1 className="text-white text-4xl xl:text-5xl font-bold leading-tight">
              Voyagez{" "}
              <span className="text-red-400">ensemble,</span>
              <br />
              voyagez en
              <br />
              famille.
            </h1>
          </div>

          <RouteVisual />
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-white/30 text-xs">
            Genève · München · Paris · Zürich → Balkans
          </p>
        </div>
      </div>

      {/* ── Right panel — form area ───────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center bg-stone-50 px-5 py-10 sm:px-8">
        {/* Mobile logo — only visible on small screens */}
        <div className="lg:hidden mb-8 text-stone-900">
          <AlbaDriveLogo size="lg" />
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
