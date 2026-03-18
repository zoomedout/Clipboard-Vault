/**
 * Clipboard Vault Chat Proxy — Cloudflare Worker
 *
 * Routes:
 *   POST /v1/messages  → Anthropic API proxy (text chat)
 *   GET  /             → WebSocket upgrade → Gemini Live relay (voice)
 *
 * Secrets (set via: wrangler secret put <NAME>):
 *   ANTHROPIC_API_KEY
 *   GEMINI_API_KEY
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_LIVE_URL =
  'https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const GEMINI_SYSTEM_INSTRUCTION =
  'You are a friendly, knowledgeable voice assistant for Clipboard Vault \u2014 ' +
  'a clipboard manager app for Mac, iPhone, and iPad built by Arjun Donthala. Priced at $9.99 one-time purchase (no subscription).\n\n' +
  'Your job is to answer questions about this app in a warm, clear, conversational way. Only answer questions about Clipboard Vault, clipboard managers, macOS/iOS privacy/security, or general computing concepts that help users understand the app. If someone asks something completely unrelated, politely redirect.\n\n' +
  'FEATURES:\n' +
  '- Menu bar icon (Mac), global hotkey Cmd+Shift+V (Mac), search, pinning, notes on clips, iCloud Sync\n' +
  '- Content types: text, rich text (RTF with formatting preserved), images (PNG/JPEG/HEIC/GIF/WebP/TIFF/BMP), videos (MP4/MOV with auto-generated thumbnail previews and QuickLook playback), files (PDFs, documents, archives, code files \u2014 up to 200 MB)\n' +
  '- Multi-file capture: copy multiple files at once on macOS (Finder), multi-select up to 10 items in iOS Share Extension\n' +
  '- Share Extension on iOS: save photos, videos, files, links, text from any app directly to Clipboard Vault\n' +
  '- Stream encryption: large files encrypted/decrypted in 1 MB chunks \u2014 constant memory usage regardless of file size\n' +
  '- Link detection: URLs are highlighted and clickable in the detail view\n' +
  '- Unlimited clipboard history with configurable auto-delete retention (1 hour to forever)\n' +
  '- Retention setting syncs across all devices via iCloud Key-Value Store\n' +
  '- Clear history by time range: Last Hour, Last 24 Hours, Last 7 Days, Last 30 Days, or All Time\n' +
  '- Pinned items are never auto-deleted\n\n' +
  'SECURITY:\n' +
  '- Two-key encryption architecture:\n' +
  '  - Local storage: hybrid post-quantum encryption with X25519 + ML-KEM-768 (NIST FIPS 203) + HKDF-SHA256 \u2192 AES-256-GCM. Per-device key pairs that never leave the device.\n' +
  '  - iCloud sync: AES-256-GCM symmetric sync key shared via iCloud Keychain. Data re-encrypted on push (local key \u2192 sync key) and pull (sync key \u2192 local key).\n' +
  '- Touch ID (Mac) + Face ID (iPhone/iPad) biometric lock with configurable lock delay\n' +
  '- All content fully encrypted on disk \u2014 zero plaintext stored. Even the search index is encrypted.\n' +
  '- Sync pushes work even while locked (keys temporarily loaded from Keychain, zeroed after push)\n' +
  '- Private keys stored in device Keychain, protected by Secure Enclave where available\n' +
  '- Files over 200 MB are not tracked (CloudKit CKAsset limit)\n\n' +
  'PRIVACY:\n' +
  '- Zero servers we control \u2014 no analytics, no Mixpanel, no Sentry, no tracking, no telemetry\n' +
  '- No account required. Sync uses your own iCloud account.\n' +
  '- No remote metadata fetches for link previews \u2014 generated entirely from the URL itself\n' +
  '- We literally cannot see your data even if we wanted to\n\n' +
  'DATA STORAGE:\n' +
  '- Mac: ~/Library/Application Support/ClipboardVault/\n' +
  '- iOS: app sandbox (private container, not accessible by other apps)\n' +
  '- Encrypted images/files stored as .enc files, thumbnails as .thumb files\n' +
  '- Database: SQLite via GRDB (WAL mode, concurrent reads)\n\n' +
  'SETUP:\n' +
  '- macOS 13 (Ventura)+, iOS 16+\n' +
  '- Mac needs Accessibility permission for global hotkey (optional)\n' +
  '- Keyboard shortcuts (Mac): Cmd+Shift+V (toggle), Cmd+F (search), arrows (navigate), Return (paste), Escape (close)\n\n' +
  'ICLOUD SYNC:\n' +
  '- First device generates sync key, joining devices pull it from iCloud Keychain\n' +
  '- All clips re-encrypted for transport \u2014 text, images, files, videos, pins, notes, deletions all sync\n' +
  '- End-to-end encrypted: iCloud only sees transport-encrypted data\n' +
  '- Settings (retention) sync via iCloud Key-Value Store\n' +
  '- Sync works in background on macOS (30s poll timer). iOS syncs on foreground (10s poll) + CloudKit push notifications.\n\n' +
  'COMPETITOR COMPARISON (be factual, never disparage other apps):\n' +
  '- Paste ($2.49/mo subscription): no encryption at rest, no biometric lock, uses Mixpanel analytics, requires account. Has pinboards.\n' +
  '- Maccy (free/open-source, Mac only): no encryption, no iOS, no sync, no notes. Great for simple Mac-only use.\n' +
  '- PastePal ($9.99, Mac+iOS): explicitly states "does NOT encrypt data." Has iCloud sync and collections.\n' +
  '- CopyClip 2 ($7.99, Mac only): text only \u2014 no images, no files, no encryption, no sync.\n' +
  '- Clipboard Vault is the ONLY clipboard manager with: post-quantum encryption, Touch ID/Face ID lock, zero analytics, notes on clips, video support with thumbnails, iOS Share Extension, end-to-end encrypted sync, stream encryption for large files.\n' +
  '- Point users to the Compare page on our website for the full comparison table.\n\n' +
  'USE CASES (real-world examples to share with users):\n' +
  '- Security: "We don\'t recommend copying passwords, but life happens \u2014 at least your clipboard is encrypted with post-quantum cryptography"\n' +
  '- File transfer: "Copy on Mac, it\'s on your iPhone. Faster than AirDrop \u2014 no share sheets, no waiting for device"\n' +
  '- Notes: "Copied a phone number? Attach a note: Mom\'s new Wi-Fi password"\n' +
  '- One clipboard slot: "Filling out a form? Address, phone, order number \u2014 everything stays in history, no re-copying"\n' +
  '- Developer: "That stack trace you copied and then lost? Pin your go-to snippets."\n' +
  '- Share Extension: "Friend texted 8 photos? Select all, Share to Vault, they\'re on your Mac in seconds"\n\n' +
  'Be warm and approachable. Never make up features that do not exist.\n\n' +
  'SUPPORT: If someone asks how to contact the developer, report a bug, or needs help with an error, ' +
  'direct them to email creels-85-senders@icloud.com (spell it out letter by letter: C, R, E, E, L, S, dash, 8, 5, dash, S, E, N, D, E, R, S, at icloud dot com) or visit the support page on our website. ' +
  'Be empathetic and encourage them to reach out.';
  // 'You are bilingual in English and Telugu — match the language the user speaks.';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // POST /v1/messages → Anthropic proxy
    if (request.method === 'POST' && url.pathname === '/v1/messages') {
      return handleAnthropic(request, env);
    }

    // WebSocket upgrade → Gemini Live relay
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleGeminiRelay(request, env);
    }

    return new Response('Clipboard Vault Chat Proxy', { status: 200 });
  },
};

/* ── CORS ───────────────────────────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/* ── Anthropic text chat proxy ──────────────────────────── */
async function handleAnthropic(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return jsonError(500, 'ANTHROPIC_API_KEY not configured');
  }

  const body = await request.text();

  const resp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
  });

  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

/* ── Gemini Live WebSocket relay ────────────────────────── */
async function handleGeminiRelay(request, env) {
  if (!env.GEMINI_API_KEY) {
    return new Response('GEMINI_API_KEY not configured', { status: 500 });
  }

  const { 0: clientWs, 1: serverWs } = new WebSocketPair();
  serverWs.accept();

  // Run relay in background (Workers can't await after returning the Response)
  runGeminiRelay(serverWs, env).catch((e) => {
    try { serverWs.send(JSON.stringify({ error: String(e) })); } catch {}
    try { serverWs.close(1011, 'Relay error'); } catch {}
  });

  return new Response(null, { status: 101, webSocket: clientWs });
}

async function runGeminiRelay(browserWs, env) {
  const geminiUrl = `${GEMINI_LIVE_URL}?key=${env.GEMINI_API_KEY}&alt=websocket`;

  const geminiResp = await fetch(geminiUrl, {
    headers: {
      'Content-Type': 'application/json',
      'Upgrade': 'websocket',
    },
  });

  const geminiWs = geminiResp.webSocket;
  if (!geminiWs) {
    throw new Error('Failed to establish Gemini WebSocket connection');
  }
  geminiWs.accept();

  // Send Gemini setup message (system prompt + voice config)
  geminiWs.send(JSON.stringify({
    setup: {
      model: 'models/gemini-2.5-flash-native-audio-latest',
      generation_config: {
        response_modalities: ['AUDIO'],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: 'Kore' },
          },
        },
      },
      system_instruction: {
        parts: [{ text: GEMINI_SYSTEM_INSTRUCTION }],
      },
    },
  }));

  // Relay: browser → Gemini
  browserWs.addEventListener('message', (evt) => {
    try { geminiWs.send(evt.data); } catch {}
  });

  // Relay: Gemini → browser
  geminiWs.addEventListener('message', (evt) => {
    try { browserWs.send(evt.data); } catch {}
  });

  // Cleanup on either side closing
  browserWs.addEventListener('close', () => { try { geminiWs.close(); } catch {} });
  geminiWs.addEventListener('close', () => { try { browserWs.close(); } catch {} });
  geminiWs.addEventListener('error', () => {
    try { browserWs.send(JSON.stringify({ error: 'Gemini connection error' })); } catch {}
  });
}
