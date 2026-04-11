/* ── Particle Sphere Orb ─────────────────────────────────────
   Canvas-based 3D dot sphere. Driven by:
     orbSetState(state)   — 'idle'|'connecting'|'listening'|'speaking'|'thinking'|'error'
     orbSetVoice(0..1)    — speech probability from VAD
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var canvas, ctx, dpr, cx, cy, baseRadius;
  var rotY = 0, rotX = 0.38;
  var time = 0;

  // All voice-reactive values smoothed independently
  var voiceLevel = 0, targetVoice = 0;  // 0..1 from VAD
  var smoothScale = 1, targetScale = 1;
  var smoothWave = 0.04, targetWave = 0.04;
  var smoothSpeed = 1.0, targetSpeed = 1.0;

  var orbState = 'idle';
  var raf = null;

  var N = 6000;
  var pts = [];

  function init() {
    canvas = document.getElementById('voice-orb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Fibonacci sphere — uniform dot distribution on unit sphere
    var gr = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < N; i++) {
      var theta = Math.acos(1 - 2 * (i + 0.5) / N);
      var phi = 2 * Math.PI * i / gr;
      pts.push({
        nx: Math.sin(theta) * Math.cos(phi),
        ny: Math.sin(theta) * Math.sin(phi),
        nz: Math.cos(theta),
        theta: theta,
        phi: phi
      });
    }

    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    dpr = window.devicePixelRatio || 1;
    var wrap = canvas.parentElement;
    var w = wrap.offsetWidth;
    var h = wrap.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    cx = canvas.width / 2;
    cy = canvas.height / 2;
    // Leave room so even at max voice scale dots never leave the canvas
    baseRadius = Math.min(w, h) * 0.34 * dpr;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    raf = requestAnimationFrame(tick);
    time += 0.016;

    // Smooth all target values — very slow easing for fluid organic feel
    voiceLevel  = lerp(voiceLevel,  targetVoice, 0.035);
    smoothScale = lerp(smoothScale, targetScale, 0.022);
    smoothWave  = lerp(smoothWave,  targetWave,  0.028);
    smoothSpeed = lerp(smoothSpeed, targetSpeed, 0.028);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── State parameters → set targets, not values ─────────
    var rotSpd = 0.004;
    var wFreq  = 3.0;
    var r = 255, g = 255, b = 255;

    switch (orbState) {
      case 'connecting':
        targetScale = 0.82 + 0.12 * (0.5 + 0.5 * Math.sin(time * 2.0));
        targetWave  = 0.04;
        targetSpeed = 0.6;
        rotSpd = 0.003;
        break;

      case 'listening':
        // sqrt curve: quiet speech gives gentle expansion, loud gives full
        var v = Math.sqrt(voiceLevel);
        targetScale = 1.0 + v * 0.42;
        targetWave  = 0.025 + v * 0.13;
        targetSpeed = 0.8 + v * 1.6;
        rotSpd = 0.003; // constant slow rotation — independent of voice
        break;

      case 'speaking':
        targetScale = 1.12 + 0.05 * Math.sin(time * 4.0);
        targetWave  = 0.14;
        targetSpeed = 2.8;
        rotSpd = 0.007;
        break;

      case 'thinking':
        targetScale = 0.92 + 0.05 * Math.sin(time * 1.2);
        targetWave  = 0.04;
        targetSpeed = 0.7;
        rotSpd = 0.002;
        r = 100; g = 90; b = 220;
        break;

      case 'error':
        targetScale = 0.88;
        targetWave  = 0.03;
        targetSpeed = 0.5;
        rotSpd = 0.002;
        r = 255; g = 59; b = 48;
        break;
    }

    rotY += rotSpd;
    rotX = 0.35 + 0.06 * Math.sin(time * 0.3);

    var rad = baseRadius * smoothScale;
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    // ── Project points ────────────────────────────────────────
    var proj = new Array(N);
    for (var i = 0; i < N; i++) {
      var p = pts[i];

      // Layered wave displacement — multiple frequencies for organic flow
      var wave = smoothWave * (
        Math.sin(p.theta * wFreq       + time * smoothSpeed) *
        Math.cos(p.phi   * 2.2         + time * smoothSpeed * 0.5) +
        0.4 * Math.sin(p.theta * wFreq * 1.7 + time * smoothSpeed * 1.3 + p.phi * 0.8)
      );
      var rr = 1 + wave;

      var nx = p.nx * rr, ny = p.ny * rr, nz = p.nz * rr;

      // Rotate Y axis
      var x1 = nx * cosY + nz * sinY;
      var z1 = -nx * sinY + nz * cosY;

      // Rotate X axis (slight tilt)
      var y2 = ny * cosX - z1 * sinX;
      var z2 = ny * sinX + z1 * cosX;

      proj[i] = { sx: cx + x1 * rad, sy: cy + y2 * rad, z: z2 };
    }

    // Sort back-to-front for correct depth layering
    proj.sort(function (a, b) { return a.z - b.z; });

    // ── Clip to circle so dots never escape into a square ─────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 1.18, 0, Math.PI * 2);
    ctx.clip();

    // ── Central glow ──────────────────────────────────────────
    var glowR = rad * 0.7;
    var glowA = 0.06 + voiceLevel * 0.08;
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + glowA.toFixed(2) + ')');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // ── Draw dots — tiny for iOS fine-grain look ───────────────
    for (var j = 0; j < N; j++) {
      var pt = proj[j];
      var depth = (pt.z + 1.3) / 2.6;              // 0..1 front-to-back
      var edgeFade = 1 - Math.pow(Math.max(0, depth - 0.5) * 2, 1.5); // fade outer ring
      var dotSize = (0.15 + depth * 0.38) * dpr;   // very fine iOS-style dots
      var alpha = Math.max(0, (0.06 + depth * 0.88) * (0.4 + edgeFade * 0.6));

      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(2) + ')';
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────
  window.orbSetState = function (state) {
    orbState = state;
    if (state === 'idle') {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      // Re-measure now that the overlay is visible (was display:none at init)
      resize();
      if (!raf) tick();
    }
  };

  window.orbSetVoice = function (p) {
    targetVoice = Math.max(0, Math.min(1, p));
  };

  // Init after DOM is ready (script loads after body)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
