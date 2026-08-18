// Scheduled (and manual) NFL directory refresh — a Vercel serverless function.
//
// Why a Vercel cron and not Supabase pg_cron: doing it in Postgres would mean
// enabling pg_net, fetching 5MB of JSON from inside the database and parsing
// it in a SQL function — more moving parts, in the layer that's hardest to
// debug, for a job whose whole point is being boring. Vercel already builds
// and deploys this app, so the cron is one entry in vercel.json plus this
// file, and the logs are in the same place as everything else.
//
// The manual button on the Import page calls this SAME endpoint, so the
// scheduled path and the "refresh before my draft" path are one code path.
// Only when this endpoint is missing or unconfigured does the browser fall
// back to writing directly (see refreshNflDirectory in nflDirectoryStore.js).
//
// ENV VARS (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL               — same value as VITE_SUPABASE_URL. Optional:
//                                VITE_SUPABASE_URL is read as a fallback.
//   SUPABASE_SERVICE_ROLE_KEY  — REQUIRED. The service_role key from Supabase
//                                → Project Settings → API. SERVER-ONLY: it
//                                bypasses RLS, so it must never be prefixed
//                                VITE_ (that would ship it in the browser
//                                bundle).
//   VITE_SUPABASE_PUBLISHABLE_KEY — used only to verify a signed-in user's
//                                token on manual runs. Already set.
//   CRON_SECRET                — optional but recommended. Vercel sends it as
//                                `Authorization: Bearer <CRON_SECRET>` on
//                                scheduled invocations; when set, this
//                                endpoint requires it (or a valid user token).
//
// Preserve-don't-delete holds identically here: this writes through the same
// upsert_nfl_players() function — no deletes, every column COALESCEd — so a
// scheduled run can never orphan a stored player_id.

import { createClient } from '@supabase/supabase-js';
import {
  sleeperPayloadToRows, summarizeCrossIds, writeDirectoryRows, diagnoseWrite,
} from '../src/lib/nflDirectory.js';

const SLEEPER_URL = 'https://api.sleeper.app/v1/players/nfl';
// Server-to-server, so a larger budget than the browser uses — still far
// below any plausible request-size limit, which is what the failed run was
// most likely hitting.
const SERVER_BUDGET_BYTES = 256 * 1024;

export const config = { maxDuration: 60 };

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

// Scheduled runs authenticate with CRON_SECRET; manual runs carry the signed-in
// user's Supabase access token. Anything else is rejected — this endpoint can
// write to a shared table, so it is not open.
async function authorize(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, reason: 'Missing authorization.' };

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return { ok: true, trigger: 'scheduled' };

  // Vercel marks its own invocations; without a CRON_SECRET set we still
  // accept them, but setting one is strongly preferred.
  if (!cronSecret && req.headers['x-vercel-cron']) return { ok: true, trigger: 'scheduled' };

  if (!anonKey) return { ok: false, reason: 'No key configured to verify user tokens.' };
  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { ok: false, reason: 'Not signed in.' };
  return { ok: true, trigger: 'manual', userId: data.user.id };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!url || !serviceKey) {
    // 501 (not 500) is the signal the client uses to fall back to writing
    // from the browser: the endpoint exists but hasn't been configured yet.
    return res.status(501).json({
      error: 'Scheduled refresh is not configured — set SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL) in Vercel.',
    });
  }

  const auth = await authorize(req);
  if (!auth.ok) return res.status(401).json({ error: auth.reason });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const started = Date.now();

  let rows;
  try {
    const sleeper = await fetch(SLEEPER_URL, { headers: { accept: 'application/json' } });
    if (!sleeper.ok) throw new Error(`Sleeper returned ${sleeper.status} ${sleeper.statusText}`);
    rows = sleeperPayloadToRows(await sleeper.json());
  } catch (e) {
    // Log the failed fetch so a broken schedule is visible in the app rather
    // than only in Vercel's logs.
    await db.from('nfl_directory_refreshes').insert({
      source: 'sleeper', trigger: auth.trigger, status: 'error',
      error: `Sleeper fetch failed: ${String(e?.message || e)}`.slice(0, 500),
      finished_at: new Date().toISOString(),
    });
    return res.status(502).json({ error: `Couldn't reach Sleeper: ${e?.message || e}` });
  }

  if (rows.length === 0) {
    await db.from('nfl_directory_refreshes').insert({
      source: 'sleeper', trigger: auth.trigger, status: 'error',
      error: 'Sleeper returned zero usable players', finished_at: new Date().toISOString(),
    });
    return res.status(502).json({ error: 'Sleeper returned zero usable players — nothing was written.' });
  }

  const ids = summarizeCrossIds(rows);
  // Open the run row BEFORE writing: a run that dies mid-flight (function
  // timeout, instance killed) leaves a 'running' row behind, which the card
  // reports. Silence is the one outcome a scheduled job must never produce.
  const { data: runRow } = await db.from('nfl_directory_refreshes')
    .insert({ source: 'sleeper', trigger: auth.trigger, status: 'running', payload_count: rows.length })
    .select('id').maybeSingle();
  const runId = runRow?.id ?? null;

  const close = (patch) => runId
    ? db.from('nfl_directory_refreshes').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', runId)
    : Promise.resolve();

  try {
    const stats = await writeDirectoryRows({
      rows,
      budgetBytes: SERVER_BUDGET_BYTES,
      call: async chunk => {
        const { data, error } = await db.rpc('upsert_nfl_players', { p_players: chunk });
        if (error) throw new Error(error.message || 'upsert failed');
        return Number(data) || chunk.length;
      },
    });

    const notes = diagnoseWrite(stats);
    await close({
      status: 'ok', payload_count: rows.length, upserted_count: stats.written,
      active_count: ids.active, yahoo_id_count: ids.yahooActive, espn_id_count: ids.espnActive,
      notes,
    });

    return res.status(200).json({
      ok: true, trigger: auth.trigger,
      payloadCount: rows.length, upserted: stats.written,
      ids, notes, seconds: Math.round((Date.now() - started) / 100) / 10,
    });
  } catch (e) {
    const written = e?.stats?.written ?? 0;
    await close({
      status: 'error', payload_count: rows.length, upserted_count: written,
      active_count: ids.active, yahoo_id_count: ids.yahooActive, espn_id_count: ids.espnActive,
      error: String(e?.message || e).slice(0, 500),
    });
    // Partial writes are safe to leave: the upsert is idempotent, so the next
    // run (scheduled or manual) simply overwrites the same rows.
    return res.status(500).json({
      error: `Wrote ${written} of ${rows.length} players before failing: ${e?.message || e}`,
      upserted: written, payloadCount: rows.length,
    });
  }
}
