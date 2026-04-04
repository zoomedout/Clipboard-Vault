/* ── Scroll fade-in observer ── */
var observer = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (e.isIntersecting) e.target.classList.add('visible');
  });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in').forEach(function (el) { observer.observe(el); });

/* ── Language ──────────────────────────────────────────── */
function setLang(lang) {
  document.body.className = lang === 'te' ? 'te' : '';
  var picker = document.getElementById('lang-picker');
  if (picker) picker.value = lang;
  try { localStorage.setItem('ch-lang', lang); } catch (e) { }
}
try {
  var _sl = localStorage.getItem('ch-lang');
  if (_sl === 'te') setLang('te');
} catch (e) { }

/* ── Dev Mode ─────────────────────────────────────────── */
var isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
var devMode = false;

if (isLocal) {
  var devbar = document.getElementById('chat-devbar');
  if (devbar) devbar.style.display = 'flex';
  try { if (localStorage.getItem('ch-dev-mode') === '1') toggleDevMode(true); } catch (e) { }
}

function toggleDevMode(on) {
  devMode = on;
  document.body.classList.toggle('dev-mode', on);
  var cb = document.getElementById('dev-mode-toggle');
  if (cb) cb.checked = on;
  try { localStorage.setItem('ch-dev-mode', on ? '1' : '0'); } catch (e) { }
  if (on) devLog('ok', 'Dev mode enabled. API errors will show full details here.');
}

function devLog(level, msg) {
  // Always log to browser console for debugging
  if (level === 'err') console.error('[CV]', msg);
  else if (level === 'ok') console.info('[CV]', msg);
  else console.log('[CV]', msg);

  if (!devMode) return;
  var log = document.getElementById('chat-devlog');
  if (!log) return;
  var entry = document.createElement('div');
  entry.className = 'devlog-entry' + (level === 'err' ? ' err' : level === 'ok' ? ' ok' : '');
  var ts = document.createElement('span');
  ts.className = 'devlog-ts';
  ts.textContent = new Date().toLocaleTimeString();
  entry.appendChild(ts);
  entry.appendChild(document.createTextNode(msg));
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

/* ── Chat ──────────────────────────────────────────────── */
var WORKER_URL = 'https://clipboard-vault-chat.argyu.workers.dev';
var PROXY_URL = WORKER_URL + '/v1/messages';

var SYSTEM_PROMPT = 'You are a friendly help assistant embedded in the Clipboard Vault user guide '
  + '\u2014 a clipboard manager app for Mac, iPhone, and iPad built by Arjun Donthala. Priced at $9.99 one-time purchase (no subscription).\n\n'
  + 'Your job is to answer questions about this app in a warm, clear, non-technical way. You know everything about:\n\n'
  + 'FEATURES:\n'
  + '- Menu bar icon (Mac), global hotkey Cmd+Shift+V (Mac), search, pinning, notes on clips, iCloud Sync\n'
  + '- Content types: text, rich text (RTF with formatting preserved), images (PNG/JPEG/HEIC/GIF/WebP/TIFF/BMP), videos (MP4/MOV with auto-generated thumbnail previews and QuickLook playback), files (PDFs, documents, archives, code files \u2014 up to 200 MB)\n'
  + '- Multi-file capture: copy multiple files at once on macOS (Finder), multi-select up to 10 items in iOS Share Extension\n'
  + '- Share Extension on iOS: save photos, videos, files, links, text from any app directly to Clipboard Vault\n'
  + '- Stream encryption: large files encrypted/decrypted in 1 MB chunks \u2014 constant memory usage regardless of file size\n'
  + '- Link detection: URLs are highlighted and clickable in the detail view\n'
  + '- Unlimited clipboard history with configurable auto-delete retention (1 hour to forever)\n'
  + '- Retention setting syncs across all devices via iCloud Key-Value Store\n'
  + '- Clear history by time range: Last Hour, Last 24 Hours, Last 7 Days, Last 30 Days, or All Time\n'
  + '- Pinned items are never auto-deleted\n\n'
  + 'SECURITY:\n'
  + '- Two-key encryption architecture:\n'
  + '  - Local storage: hybrid post-quantum encryption with X25519 + ML-KEM-768 (NIST FIPS 203) + HKDF-SHA256 \u2192 AES-256-GCM. Per-device key pairs that never leave the device.\n'
  + '  - iCloud sync: AES-256-GCM symmetric sync key shared via iCloud Keychain. Data re-encrypted on push (local key \u2192 sync key) and pull (sync key \u2192 local key).\n'
  + '- Touch ID (Mac) + Face ID (iPhone/iPad) biometric lock with configurable lock delay\n'
  + '- All content fully encrypted on disk \u2014 zero plaintext stored. Even the search index is encrypted.\n'
  + '- Sync pushes work even while locked (keys temporarily loaded from Keychain, zeroed after push)\n'
  + '- Private keys stored in device Keychain, protected by Secure Enclave where available\n'
  + '- Files over 200 MB are not tracked (CloudKit CKAsset limit)\n\n'
  + 'PRIVACY:\n'
  + '- Zero servers we control \u2014 no analytics, no Mixpanel, no Sentry, no tracking, no telemetry\n'
  + '- No account required. Sync uses your own iCloud account.\n'
  + '- No remote metadata fetches for link previews \u2014 generated entirely from the URL itself\n'
  + '- We literally cannot see your data even if we wanted to\n\n'
  + 'DATA STORAGE:\n'
  + '- Mac: ~/Library/Application Support/ClipboardVault/\n'
  + '- iOS: app sandbox (private container, not accessible by other apps)\n'
  + '- Encrypted images/files stored as .enc files, thumbnails as .thumb files\n'
  + '- Database: SQLite via GRDB (WAL mode, concurrent reads)\n\n'
  + 'SETUP:\n'
  + '- macOS 13 (Ventura)+, iOS 16+\n'
  + '- Mac needs Accessibility permission for global hotkey (optional)\n'
  + '- Keyboard shortcuts (Mac): Cmd+Shift+V (toggle), Cmd+F (search), arrows (navigate), Return (paste), Escape (close)\n\n'
  + 'ICLOUD SYNC:\n'
  + '- First device generates sync key, joining devices pull it from iCloud Keychain\n'
  + '- All clips re-encrypted for transport \u2014 text, images, files, videos, pins, notes, deletions all sync\n'
  + '- End-to-end encrypted: iCloud only sees transport-encrypted data\n'
  + '- Settings (retention) sync via iCloud Key-Value Store\n'
  + '- Sync works in background on macOS (5s poll on timer). iOS syncs on foreground (10s poll) + CloudKit push notifications.\n\n'
  + 'COMPETITOR COMPARISON (be factual, never disparage):\n'
  + '- Paste ($2.49/mo subscription): no encryption at rest, no biometric lock, uses Mixpanel analytics, requires account. Has pinboards.\n'
  + '- Maccy (free/open-source, Mac only): no encryption, no iOS, no sync, no notes. Great for simple Mac-only use.\n'
  + '- PastePal ($9.99, Mac+iOS): explicitly states "does NOT encrypt data." Has iCloud sync and collections.\n'
  + '- CopyClip 2 ($7.99, Mac only): text only \u2014 no images, no files, no encryption, no sync.\n'
  + '- Clipboard Vault is the ONLY clipboard manager with: post-quantum encryption, Touch ID/Face ID lock, zero analytics, notes on clips, video support with thumbnails, iOS Share Extension, end-to-end encrypted sync, stream encryption for large files.\n'
  + '- Point users to the Compare page for the full comparison table.\n\n'
  + 'USE CASES (real-world examples):\n'
  + '- Security: "We don\'t recommend copying passwords, but life happens \u2014 at least your clipboard is encrypted with post-quantum cryptography"\n'
  + '- File transfer: "Copy on Mac, it\'s on your iPhone. Faster than AirDrop \u2014 no share sheets, no waiting for device"\n'
  + '- Notes: "Copied a phone number? Attach a note: Mom\'s new Wi-Fi password"\n'
  + '- One clipboard slot: "Filling out a form? Address, phone, order number \u2014 everything stays in history, no re-copying"\n'
  + '- Developer: "That stack trace you copied and then lost? Pin your go-to snippets."\n'
  + '- Share Extension: "Friend texted 8 photos? Select all, Share to Vault, they\'re on your Mac in seconds"\n\n'
  + 'Response format:\n'
  + 'Always structure your response in exactly this format:\n'
  + '---\n'
  + 'First, give a clear standard explanation. Use **bold** for key terms. Use bullet points (- ) for lists. Use `backticks` for code or technical terms.\n'
  + '\n'
  + 'ELI5:\n'
  + 'Then give an "Explain Like I am 5" version using a real-world physical analogy.\n'
  + '---\n\n'
  + 'ELI5 rules (CRITICAL):\n'
  + '- NEVER use the word being explained in the ELI5. If someone asks "what is a clipboard", do NOT say "a clipboard is..." in the ELI5.\n'
  + '- Always use a physical, tangible, real-world analogy a child would understand. Compare to things like: a notebook, a sticky note, a drawer, a box, a pocket, a jar, a shelf, a photo album, a diary, a whiteboard.\n'
  + '- Keep ELI5 to 2-3 sentences max. Make it vivid and specific.\n\n'
  + 'Other rules:\n'
  + '1. Only answer questions related to Clipboard Vault, clipboard managers, macOS privacy/security, or general computing concepts that help users understand the app.\n'
  + '2. If someone asks something completely unrelated, politely redirect (no ELI5 needed for redirects).\n'
  + '3. Keep the standard explanation to 2-4 sentences.\n'
  + '4. Be warm and approachable. Never make up features that do not exist.\n'
  + '5. If someone asks how to contact the developer, report a bug, or needs help with an error, direct them to email creels-85-senders@icloud.com or visit the support page at support.html. Be empathetic and encourage them to reach out.';

var chatHistory = [];

function toggleChat() {
  var panel = document.getElementById('chat-panel');
  var fab = document.getElementById('chat-fab');
  var isOpen = panel.classList.toggle('visible');
  fab.classList.toggle('open', isOpen);
  document.getElementById('fab-icon').textContent = isOpen ? '\u2715' : '\uD83D\uDCAC';
  if (isOpen) {
    var ci = document.getElementById('chat-input');
    if (ci && ci.offsetParent) ci.focus();
  }
}

function updateActionButtons() {
  var hasText = document.getElementById('chat-input').value.trim().length > 0;
  document.getElementById('chat-send').style.display = hasText ? 'flex' : 'none';
  document.getElementById('chat-live').style.display = hasText ? 'none' : 'flex';
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  var t = e.target;
  setTimeout(function () {
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 80) + 'px';
    updateActionButtons();
  }, 0);
}

function addMessage(role, text) {
  var msgs = document.getElementById('chat-messages');
  var indicator = document.getElementById('typing-indicator');
  var div = document.createElement('div');
  div.className = 'chat-msg ' + role;

  if (role === 'assistant') {
    renderFormatted(div, text);
  } else {
    div.textContent = text;
  }

  msgs.insertBefore(div, indicator);
  msgs.scrollTop = msgs.scrollHeight;
}

function renderFormatted(container, text) {
  text = text.replace(/^-{3,}\s*$/gm, '');
  var eli5Match = text.match(/\n\s*(ELI5|\u0C38\u0C30\u0C33\u0C02\u0C17\u0C3E)\s*:\s*\n?/i);
  var mainText, eli5Text;

  if (eli5Match) {
    mainText = text.substring(0, eli5Match.index).trim();
    eli5Text = text.substring(eli5Match.index + eli5Match[0].length).trim();
  } else {
    mainText = text.trim();
    eli5Text = null;
  }

  var mainSection = document.createElement('div');
  mainSection.className = 'msg-section';
  var mainBody = document.createElement('div');
  mainBody.className = 'msg-body';
  renderMarkdownLines(mainBody, mainText);
  mainSection.appendChild(mainBody);
  container.appendChild(mainSection);

  if (eli5Text) {
    var eli5Section = document.createElement('div');
    eli5Section.className = 'msg-section msg-eli5';
    var eli5Heading = document.createElement('div');
    eli5Heading.className = 'msg-heading';
    eli5Heading.textContent = /[\u0C00-\u0C7F]/.test(eli5Text) ? '\u0C38\u0C30\u0C33\u0C02\u0C17\u0C3E \u0C1A\u0C46\u0C2A\u0C4D\u0C2A\u0C3E\u0C32\u0C02\u0C1F\u0C47' : 'In simple terms';
    eli5Section.appendChild(eli5Heading);
    var eli5Body = document.createElement('div');
    eli5Body.className = 'msg-body';
    renderMarkdownLines(eli5Body, eli5Text);
    eli5Section.appendChild(eli5Body);
    container.appendChild(eli5Section);
  }
}

function renderMarkdownLines(container, text) {
  var lines = text.split('\n');
  var currentUl = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (/^\s*[-\u2022]\s+/.test(line)) {
      if (!currentUl) {
        currentUl = document.createElement('ul');
        container.appendChild(currentUl);
      }
      var li = document.createElement('li');
      renderInline(li, line.replace(/^\s*[-\u2022]\s+/, ''));
      currentUl.appendChild(li);
      continue;
    }

    currentUl = null;

    if (line.trim() === '') continue;

    var p = document.createElement('p');
    p.style.margin = '0 0 4px';
    renderInline(p, line);
    container.appendChild(p);
  }
}

function renderInline(el, text) {
  var parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      var strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      el.appendChild(strong);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      var code = document.createElement('code');
      code.textContent = part.slice(1, -1);
      el.appendChild(code);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  }
}

function showTyping(show) {
  var el = document.getElementById('typing-indicator');
  if (el) el.classList.toggle('visible', show);
  if (show) {
    var msgs = document.getElementById('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
  }
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  updateActionButtons();
  addMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  var sendBtn = document.getElementById('chat-send');
  input.disabled = true;
  sendBtn.disabled = true;
  showTyping(true);

  var payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: chatHistory.slice(-10)
  };

  devLog('', 'POST ' + PROXY_URL);
  devLog('', 'model=' + payload.model + ' msgs=' + payload.messages.length);

  try {
    var resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      var errBody = '';
      try { errBody = await resp.text(); } catch (e2) { }
      devLog('err', resp.status + ' ' + resp.statusText);
      devLog('err', errBody);

      var userMsg = 'Something went wrong. Please try again.';
      if (devMode) {
        try {
          var errJson = JSON.parse(errBody);
          var detail = (errJson.error && errJson.error.message) || errBody;
          userMsg = resp.status + ': ' + detail;
        } catch (e3) {
          userMsg = resp.status + ': ' + (errBody || resp.statusText);
        }
      }
      addMessage('error', userMsg);
      chatHistory.pop();
      return;
    }

    var data = await resp.json();
    devLog('ok', 'Response: ' + resp.status + ' ' + (data.usage ? 'in=' + data.usage.input_tokens + ' out=' + data.usage.output_tokens : ''));
    var reply = (data.content && data.content[0] && data.content[0].text) || 'Sorry, I could not generate a response.';
    addMessage('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

  } catch (e) {
    devLog('err', 'Fetch failed: ' + e.message);
    addMessage('error', devMode ? 'Fetch failed: ' + e.message : 'Cannot connect. Is the proxy running?');
    chatHistory.pop();
  } finally {
    showTyping(false);
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ── Mic Input (speech-to-text for text mode) ─────────── */
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var micRecognition = null;
var micActive = false;

function toggleMicInput() {
  if (micActive) {
    stopMicInput();
  } else {
    startMicInput();
  }
}

function startMicInput() {
  if (!SpeechRecognition) {
    devLog('err', 'SpeechRecognition not supported in this browser');
    return;
  }
  if (!micRecognition) {
    micRecognition = new SpeechRecognition();
    micRecognition.continuous = false;
    micRecognition.interimResults = true;
  }
  micRecognition.lang = document.body.classList.contains('te') ? 'te-IN' : 'en-US';
  micActive = true;
  var micBtn = document.getElementById('chat-mic');
  micBtn.style.color = '#ff3b30';

  var finalTranscript = '';

  micRecognition.onresult = function (e) {
    var interim = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript;
      } else {
        interim += e.results[i][0].transcript;
      }
    }
    document.getElementById('chat-input').value = (finalTranscript + interim).trim();
  };

  micRecognition.onend = function () {
    micActive = false;
    micBtn.style.color = '';
    var text = finalTranscript.trim();
    if (text) {
      document.getElementById('chat-input').value = text;
      sendMessage();
    }
  };

  micRecognition.onerror = function (e) {
    micActive = false;
    micBtn.style.color = '';
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      devLog('err', 'Mic error: ' + e.error);
    }
  };

  micRecognition.start();
}

function stopMicInput() {
  if (micRecognition && micActive) {
    micRecognition.stop();
  }
}

/* ── Voice Mode (Gemini Live) ─────────────────────────── */
var LIVE_WS_URL = WORKER_URL.replace('https://', 'wss://');
var liveWs = null;
var liveMicStream = null;
var liveAudioCtx = null;
var liveWorklet = null;
var livePlaybackCtx = null;
var liveNextPlayTime = 0;
var liveInterrupted = false;
var liveEnding = false;
var liveConnected = false;
var livePlaybackSources = [];    // active BufferSource nodes for granular stop
var liveVad = null;              // Silero VAD instance for speech detection
var liveSpeaking = false;        // true when VAD detects user is speaking

function setVoiceState(state) {
  var overlay = document.getElementById('voice-overlay');
  var status = document.getElementById('voice-status');
  // Reset inline orb styles so CSS animations can take over
  var orb = document.querySelector('.voice-orb');
  if (orb) { orb.style.transform = ''; orb.style.boxShadow = ''; }
  overlay.setAttribute('data-state', state);
  if (state === 'connecting') status.textContent = 'Connecting...';
  else if (state === 'listening') status.textContent = 'Listening...';
  else if (state === 'speaking') status.textContent = 'Speaking...';
  else if (state === 'error') status.textContent = 'Connection failed. Tap End to close.';
  else status.textContent = '';
}

function toggleVoice() {
  var overlay = document.getElementById('voice-overlay');
  if (overlay.classList.contains('active')) {
    endLiveSession();
  } else {
    startLiveSession();
  }
}

async function startLiveSession() {
  liveEnding = false;
  liveConnected = false;
  var overlay = document.getElementById('voice-overlay');
  overlay.classList.add('active');
  setVoiceState('connecting');
  devLog('', 'Voice: starting Gemini Live session, URL=' + LIVE_WS_URL);

  try {
    liveWs = new WebSocket(LIVE_WS_URL);
    liveWs.binaryType = 'blob';

    liveWs.onopen = function () {
      devLog('ok', 'Voice: WebSocket connected to proxy');
    };

    liveWs.onmessage = async function (evt) {
      try {
        var text = typeof evt.data === 'string' ? evt.data : await evt.data.text();
        var msg = JSON.parse(text);

        if (msg.error) {
          devLog('err', 'Voice: Gemini error: ' + msg.error);
          setVoiceState('error');
          cleanupLiveResources();
          return;
        }

        if (msg.setupComplete) {
          liveConnected = true;
          devLog('ok', 'Voice: Gemini setup complete');
          startMicCapture();
          return;
        }

        if (msg.serverContent) {
          var sc = msg.serverContent;

          if (sc.turnComplete) {
            devLog('', 'Voice: turn complete');
            liveInterrupted = false;
            setVoiceState('listening');
            return;
          }

          if (sc.modelTurn && sc.modelTurn.parts && !liveInterrupted) {
            for (var i = 0; i < sc.modelTurn.parts.length; i++) {
              var part = sc.modelTurn.parts[i];
              if (part.inlineData && part.inlineData.data) {
                setVoiceState('speaking');
                queueAudioChunk(part.inlineData.data);
              }
            }
          }
        }
      } catch (e) {
        devLog('err', 'Voice: parse error: ' + e.message);
      }
    };

    liveWs.onerror = function (e) {
      devLog('err', 'Voice: WebSocket error: ' + JSON.stringify({ type: e.type, message: e.message || 'unknown' }));
    };

    liveWs.onclose = function (e) {
      devLog('err', 'Voice: WebSocket closed (code=' + e.code + ', wasClean=' + e.wasClean + ', reason=' + (e.reason || 'none') + ')');
      if (!liveEnding) {
        setVoiceState('error');
        cleanupLiveResources();
      }
    };

  } catch (e) {
    devLog('err', 'Voice: failed to connect: ' + e.message);
    setVoiceState('error');
  }
}

function sendPcmToWs(pcmBuffer) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) return;

  // Don't send mic data while Gemini is speaking — browser AEC can't
  // fully remove TTS, so sending it would feed Gemini its own voice.
  // Silero VAD handles interrupt detection separately via its own mic stream.
  var overlay = document.getElementById('voice-overlay');
  if (overlay.getAttribute('data-state') === 'speaking') return;

  // Send mic data to Gemini only when not playing back TTS
  var bytes = new Uint8Array(pcmBuffer);
  var b64 = btoa(String.fromCharCode.apply(null, bytes));

  liveWs.send(JSON.stringify({
    realtimeInput: {
      mediaChunks: [{
        mimeType: 'audio/pcm;rate=16000',
        data: b64
      }]
    }
  }));
}

async function startMicCapture() {
  setVoiceState('listening');

  try {
    liveMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    liveAudioCtx = new AudioContext({ sampleRate: 16000 });
    var source = liveAudioCtx.createMediaStreamSource(liveMicStream);

    if (liveAudioCtx.audioWorklet) {
      // Modern path: AudioWorkletNode (off main thread)
      await liveAudioCtx.audioWorklet.addModule('mic-processor.js');
      var workletNode = new AudioWorkletNode(liveAudioCtx, 'mic-processor');
      workletNode.port.onmessage = function (e) {
        sendPcmToWs(e.data);
      };
      source.connect(workletNode);
      workletNode.connect(liveAudioCtx.destination);
      liveWorklet = workletNode;
      devLog('ok', 'Voice: mic capture started via AudioWorklet (16kHz PCM)');
    } else {
      // Fallback: ScriptProcessorNode (main thread, deprecated)
      devLog('', 'Voice: AudioWorklet not supported, falling back to ScriptProcessor');
      var processor = liveAudioCtx.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = function (e) {
        var input = e.inputBuffer.getChannelData(0);
        var pcm16 = new Int16Array(input.length);
        for (var i = 0; i < input.length; i++) {
          var s = Math.max(-1, Math.min(1, input[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        sendPcmToWs(pcm16.buffer);
      };
      var silentGain = liveAudioCtx.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(liveAudioCtx.destination);
      source.connect(processor);
      processor.connect(silentGain);
      liveWorklet = processor;
      devLog('ok', 'Voice: mic capture started via ScriptProcessor (16kHz PCM)');
    }

    // Start Silero VAD for speech detection (used for auto-interruption)
    await startVad();

  } catch (e) {
    devLog('err', 'Voice: mic access failed: ' + e.message);
    document.getElementById('voice-status').textContent = 'Mic access denied. Tap End to close.';
    setVoiceState('error');
  }
}

async function startVad() {
  if (typeof vad === 'undefined' || !vad.MicVAD) {
    devLog('', 'Voice: Silero VAD not available, auto-interruption disabled');
    return;
  }
  try {
    liveVad = await vad.MicVAD.new({
      baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.22/dist/',
      onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/',
      additionalAudioConstraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      onSpeechStart: function () {
        liveSpeaking = true;
        devLog('', 'Voice: VAD speech start');
        var overlay = document.getElementById('voice-overlay');
        if (overlay.getAttribute('data-state') === 'speaking') {
          devLog('', 'Voice: user speaking during playback, auto-interrupting');
          interruptLive();
        }
      },
      onSpeechEnd: function () {
        liveSpeaking = false;
        devLog('', 'Voice: VAD speech end');
      },
      onFrameProcessed: function (probs) {
        // Drive orb reactivity from speech probability when listening
        var overlay = document.getElementById('voice-overlay');
        if (overlay.getAttribute('data-state') !== 'listening') return;
        var orb = document.querySelector('.voice-orb');
        if (!orb) return;
        var p = probs.isSpeech;
        var scale = 1 + p * 0.35;
        var glow = p * 50;
        orb.style.transform = 'scale(' + scale.toFixed(3) + ')';
        orb.style.boxShadow = '0 0 ' + glow.toFixed(0) + 'px rgba(0, 113, 227, ' + (0.3 + p * 0.5).toFixed(2) + ')';
      }
    });
    liveVad.start();
    devLog('ok', 'Voice: Silero VAD started');
  } catch (e) {
    devLog('err', 'Voice: VAD init failed: ' + e.message);
    liveVad = null;
  }
}

function queueAudioChunk(b64Data) {
  if (liveInterrupted) return;
  var raw = atob(b64Data);
  var bytes = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  var int16 = new Int16Array(bytes.buffer);
  var float32 = new Float32Array(int16.length);
  for (var i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }

  if (!livePlaybackCtx) {
    livePlaybackCtx = new AudioContext({ sampleRate: 24000 });
    liveNextPlayTime = 0;
  }

  var ctx = livePlaybackCtx;
  var buffer = ctx.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);

  var source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  var startAt = Math.max(liveNextPlayTime, ctx.currentTime);
  source.start(startAt);
  liveNextPlayTime = startAt + buffer.duration;

  livePlaybackSources.push(source);
  source.onended = function () {
    var idx = livePlaybackSources.indexOf(source);
    if (idx !== -1) livePlaybackSources.splice(idx, 1);
  };
}

function cleanupLiveResources() {
  if (liveVad) {
    liveVad.pause();
    liveVad = null;
    liveSpeaking = false;
  }
  if (liveMicStream) {
    liveMicStream.getTracks().forEach(function (t) { t.stop(); });
    liveMicStream = null;
  }
  if (liveWorklet) {
    liveWorklet.disconnect();
    liveWorklet = null;
  }
  if (liveAudioCtx) {
    liveAudioCtx.close().catch(function () { });
    liveAudioCtx = null;
  }

  liveNextPlayTime = 0;
  for (var i = 0; i < livePlaybackSources.length; i++) {
    try { livePlaybackSources[i].stop(); } catch (e) { }
  }
  livePlaybackSources = [];
  if (livePlaybackCtx) {
    livePlaybackCtx.close().catch(function () { });
    livePlaybackCtx = null;
  }
}

function interruptLive() {
  devLog('', 'Voice: interrupting playback');
  liveInterrupted = true;

  // Stop all queued audio sources without destroying the context
  for (var i = 0; i < livePlaybackSources.length; i++) {
    try { livePlaybackSources[i].stop(); } catch (e) { }
  }
  livePlaybackSources = [];
  liveNextPlayTime = 0;

  // Don't send any control message to Gemini — its native audio model
  // detects barge-in automatically from the incoming mic audio stream.
  // Sending clientContent.turnComplete crashes the WebSocket connection.

  setVoiceState('listening');
}

function endLiveSession() {
  liveEnding = true;
  devLog('', 'Voice: ending session');

  if (liveWs) {
    liveWs.onclose = null;
    liveWs.onerror = null;
    liveWs.close();
    liveWs = null;
  }

  cleanupLiveResources();

  var overlay = document.getElementById('voice-overlay');
  overlay.classList.remove('active');
  setVoiceState('idle');
  liveConnected = false;
}
