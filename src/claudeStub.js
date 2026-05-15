// Stub for the artifact-only `window.claude.complete` API that the prototype used.
// In the Claude Design artifact runtime, this called an LLM to:
//   1. Suggest player names from a partial query (tab-setup.jsx)
//   2. Extract a roster from a screenshot image (tab-roster-import.jsx)
//
// In a real deployment we'll need a backend that proxies to the Anthropic API
// (so the API key stays on the server). For now, this stub keeps the UI working
// by returning empty/placeholder results instead of crashing.

export async function complete(promptOrPayload) {
  console.warn(
    '[claudeStub] window.claude.complete was called, but no backend is connected yet.',
    promptOrPayload,
  );

  // Player search path: prompt is a string asking for a JSON array.
  if (typeof promptOrPayload === 'string') {
    return '[]';
  }

  // Roster screenshot path: payload is { messages: [...] }.
  // Returning an empty array keeps the parser happy; the user will see
  // "no players extracted" rather than a crash.
  return '[]';
}

// Install on window so the existing call sites (window.claude.complete(...))
// keep working without touching their bodies.
if (typeof window !== 'undefined') {
  window.claude = window.claude || {};
  window.claude.complete = complete;
}
