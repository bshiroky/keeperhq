// Yahoo discovery spike — start of the OAuth flow. Throwaway; see
// server/yahooSpike.js for what it does and how to remove it.
import { createClient } from '@supabase/supabase-js';
import { createStartHandler } from '../../server/yahooSpike.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

// The ONLY Supabase call in the spike: is this request from a signed-in
// KeeperHQ user? Read-only; nothing is written anywhere.
async function verifyUser(token) {
  if (!url || !anonKey) return null;
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  return error || !data?.user ? null : { id: data.user.id };
}

export default createStartHandler({ verifyUser });
