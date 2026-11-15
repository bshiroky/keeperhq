// Shared by the Yahoo functions: is this request from a signed-in KeeperHQ
// user? Read-only. Lives outside api/ so Vercel doesn't deploy it as a function.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

export async function verifyUser(token) {
  if (!url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? null : { id: data.user.id };
}
