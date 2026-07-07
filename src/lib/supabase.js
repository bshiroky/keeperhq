import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Env vars are set in Vercel; missing locally (or in a container with no
// .env) shouldn't break logged-out browsing or `npm run build`.
export const supabase = url && key
  ? createClient(url, key, { auth: { detectSessionInUrl: true } })
  : null;
