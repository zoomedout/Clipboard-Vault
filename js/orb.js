/* ── Particle Sphere Orb ─────────────────────────────────────
   No rotation. Each particle oscillates independently — organic,
   living feel. Voice drives radial expansion from the inside out.

     orbSetState(state)   — 'idle'|'connecting'|'listening'|'speaking'|'thinking'|'error'
     orbSetVoice(0..1)    — speech probability from VAD
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var canvas, ctx, dpr, cx, cy, baseRadius;
  var time = 0;

  var voiceLevel = 0, targetVoice = 0;
  var smoothExpand = 0, targetExpand = 0;
  var smoothMicro = 0.02, targetMicro = 0.02;
  var smoothBreathe = 0.04, targetBreathe = 0.04;

  var orbState = 'idle';
  var raf = null;

  var N = 1500;
  var pts = [];

  function init() {
    canvas = document.getElementById('voice-orb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Fibonacci sphere + unique random phase per particle for independent motion
    var gr = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < N; i++) {
      var theta = Math.acos(1 - 2 * (i + 0.5) / N);
      var phi = 2 * Math.PI * i / gr;
      pts.push({
        nx: Math.sin(theta) * Math.cos(phi),
        ny: Math.sin(theta) * Math.sin(phi),
        nz: Math.cos(theta),
        // Three independent oscillation phases — makes each particle unique
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        p3: Math.random() * Math.PI * 2,
        // Oscillation speed multipliers — slight variation so motion isn't uniform
        s1: 0.85 + Math.random() * 0.3,
        s2: 0.85 + Math.random() * 0.3,
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
    baseRadius = Math.min(w, h) * 0.34 * dpr;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    raf = requestAnimationFrame(tick);
    time += 0.016;

    // Very slow easing — everything feels unhurried
    voiceLevel    = lerp(voiceLevel,    targetVoice,   0.032);
    smoothExpand  = lerp(smoothExpand,  targetExpand,  0.020);
    smoothMicro   = lerp(smoothMicro,   targetMicro,   0.025);
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.018);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── State parameters ──────────────────────────────────────
    var r = 255, g = 255, b = 255;

    switch (orbState) {
      case 'connecting':
        targetExpand  = 0;
        targetMicro   = 0.055;   // visible wander at rest
        targetBreathe = 0.055;
        break;

      case 'listening':
        var v = Math.sqrt(voiceLevel);
        targetExpand  = v * 0.40;
        targetMicro   = 0.065 + v * 0.025; // more alive when hearing voice
        targetBreathe = 0.040;
        break;

      case 'speaking':
        targetExpand  = 0.30;
        targetMicro   = 0.080;   // most active
        targetBreathe = 0.065;
        break;

      case 'thinking':
        targetExpand  = 0;
        targetMicro   = 0.035;   // calm but still alive
        targetBreathe = 0.030;
        r = 110; g = 100; b = 230;
        break;

      case 'error':
        targetExpand  = 0;
        targetMicro   = 0.020;
        targetBreathe = 0.020;
        r = 255; g = 59; b = 48;
        break;
    }

    // Global breath — slow sine, all particles share this (collective mind)
    var breathOffset = smoothBreathe * Math.sin(time * 0.45);
    var rad = baseRadius * (1 + smoothExpand + breathOffset);

    // ── Project points ────────────────────────────────────────
    var proj = new Array(N);
    for (var i = 0; i < N; i++) {
      var p = pts[i];

      // Individual mind: each particle wanders freely in world-space x/y/z
      // Two overlapping sine waves at irrational ratio per axis → smooth,
      // never-repeating, unique path for every particle
      var d = smoothMicro * rad;
      var ox = d * (0.62 * Math.sin(time * 0.53 * p.s1 + p.p1) + 0.38 * Math.cos(time * 1.17 * p.s2 + p.p2));
      var oy = d * (0.62 * Math.sin(time * 0.71 * p.s2 + p.p2) + 0.38 * Math.cos(time * 0.89 * p.s1 + p.p3));
      var oz = d * (0.62 * Math.sin(time * 0.61 * p.s1 + p.p3) + 0.38 * Math.cos(time * 1.33 * p.s2 + p.p1));

      proj[i] = {
        sx: cx + p.nx * rad + ox,
        sy: cy + p.ny * rad + oy,
        z:       p.nz * rad + oz   // depth for size/opacity
      };
    }

    // Sort back-to-front
    proj.sort(function (a, b) { return a.z - b.z; });

    // ── Clip to circle — no square escape ─────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 1.15, 0, Math.PI * 2);
    ctx.clip();

    // ── Central glow ──────────────────────────────────────────
    var glowA = 0.05 + voiceLevel * 0.07;
    var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 0.75);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',' + glowA.toFixed(2) + ')');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // ── Draw dots ─────────────────────────────────────────────
    for (var j = 0; j < N; j++) {
      var pt = proj[j];
      var depth = (pt.z + 1.3) / 2.6;                     // 0..1
      var dotSize = (0.15 + depth * 0.38) * dpr;
      var alpha = Math.max(0, 0.05 + depth * 0.88);

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
      resize();
      if (!raf) tick();
    }
  };

  window.orbSetVoice = function (p) {
    targetVoice = Math.max(0, Math.min(1, p));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
