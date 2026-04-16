/**
 * Edge Function: expire-trips
 *
 * Automatically marks trips as 'completed' when their departure time
 * has passed and they are still in 'open' or 'full' status.
 *
 * SCHEDULING: Configure in Supabase Dashboard →
 *   Functions → expire-trips → Schedule → "0 2 * * *" (daily at 02:00 UTC)
 * Or via supabase/config.toml once `supabase init` is run:
 *   [functions.expire-trips]
 *   schedule = "0 2 * * *"
 *
 * Uses the service role key (env var auto-injected by Supabase runtime)
 * to bypass RLS — this function runs server-side with no user context.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const now = new Date().toISOString();

  const { data: completedTrips, error } = await supabase
    .from("trips")
    .update({ status: "completed" })
    .in("status", ["open", "full"])
    .lt("departure_at", now)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    console.error("[expire-trips] Error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const count = completedTrips?.length ?? 0;
  console.log(`[expire-trips] Marked ${count} trip(s) as completed.`);

  return new Response(
    JSON.stringify({ success: true, completed_count: count }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
