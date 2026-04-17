// src/app/(main)/layout.tsx
// App shell for all (main) routes — public and authenticated alike.
// /trips and /trips/[id] are public; middleware no longer guarantees a user here.
import { createServerClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/layout/Navbar";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { full_name: string; avatar_url: string | null } | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  }

  return (
    <div className="min-h-dvh flex flex-col bg-stone-50">
      <Navbar
        fullName={profile?.full_name ?? ""}
        avatarUrl={profile?.avatar_url ?? null}
        email={user?.email ?? ""}
        isAuthenticated={!!user}
      />
      <main className="flex-1 w-full pb-16 md:pb-0">{children}</main>
    </div>
  );
}
