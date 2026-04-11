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
  var voiceLevel = 0, targetVoice = 0;
  var orbState = 'idle';
  var raf = null;

  var N = 1600;
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
    baseRadius = Math.min(w, h) * 0.36 * dpr;
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    time += 0.016;

    // Smooth voice reactivity
    voiceLevel += (targetVoice - voiceLevel) * 0.1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── State parameters ──────────────────────────────────────
    var scale = 1;
    var wAmp = 0.06, wFreq = 3.5, wSpeed = 1.2;
    var rotSpd = 0.004;
    var r = 91, g = 138, b = 255; // blue

    switch (orbState) {
      case 'connecting':
        scale = 0.80 + 0.14 * (0.5 + 0.5 * Math.sin(time * 2.2));
        wAmp = 0.06; wSpeed = 0.7; rotSpd = 0.003;
        break;

      case 'listening':
        scale = 1.0 + voiceLevel * 0.38;
        wAmp = 0.04 + voiceLevel * 0.32;
        wSpeed = 1.2 + voiceLevel * 3.5;
        wFreq = 3.5 + voiceLevel * 1.5;
        rotSpd = 0.005 + voiceLevel * 0.006;
        break;

      case 'speaking':
        scale = 1.14 + 0.07 * Math.sin(time * 5.5);
        wAmp = 0.24; wSpeed = 4.5; wFreq = 4.5;
        rotSpd = 0.010;
        break;

      case 'thinking':
        scale = 0.90 + 0.07 * Math.sin(time * 1.4);
        wAmp = 0.06; wSpeed = 0.8; rotSpd = 0.003;
        r = 100; g = 90; b = 220; // shift toward indigo
        break;

      case 'error':
        scale = 0.86 + 0.04 * Math.sin(time * 3);
        wAmp = 0.04; rotSpd = 0.002;
        r = 255; g = 59; b = 48;
        break;
    }

    rotY += rotSpd;
    rotX = 0.36 + 0.07 * Math.sin(time * 0.35);

    var rad = baseRadius * scale;
    var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    // ── Project points ────────────────────────────────────────
    var proj = new Array(N);
    for (var i = 0; i < N; i++) {
      var p = pts[i];

      // Three-wave surface displacement for organic texture
      var wave = wAmp * (
        Math.sin(p.theta * wFreq + time * wSpeed) *
        Math.cos(p.phi * 2.8 + time * wSpeed * 0.55) +
        0.3 * Math.sin(p.theta * wFreq * 2 + time * wSpeed * 1.7 + p.phi)
      );
      var rr = 1 + wave;

      var nx = p.nx * rr, ny = p.ny * rr, nz = p.nz * rr;

      // Rotate Y
      var x1 = nx * cosY + nz * sinY;
      var z1 = -nx * sinY + nz * cosY;

      // Rotate X
      var y2 = ny * cosX - z1 * sinX;
      var z2 = ny * sinX + z1 * cosX;

      proj[i] = { sx: cx + x1 * rad, sy: cy + y2 * rad, z: z2 };
    }

    // Sort back-to-front for correct depth
    proj.sort(function (a, b) { return a.z - b.z; });

    // ── Draw central glow (behind dots) ───────────────────────
    var glowSize = rad * 0.65;
    var glowAlpha = 0.07 + voiceLevel * 0.1;
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + glowAlpha.toFixed(2) + ')');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.beginPath();
    ctx.arc(cx, cy, glowSize, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // ── Draw dots ─────────────────────────────────────────────
    for (var j = 0; j < N; j++) {
      var pt = proj[j];
      var depth = (pt.z + 1.35) / 2.7;          // normalise to 0..1
      var dotSize = (0.45 + depth * 1.3) * dpr;
      var alpha = Math.max(0, 0.08 + depth * 0.92);

      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(2) + ')';
      ctx.fill();
    }
  }

  // ── Public API ────────────────────────────────────────────
  window.orbSetState = function (state) {
    orbState = state;
    if (state === 'idle') {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else if (!raf) {
      tick();
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
