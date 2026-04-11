/* ── Ethereal AI Cloud ──────────────────────────────────────
   Siri-style dense particle cloud. Three density layers —
   glowing core, main shell, wispy outer halo — animated with
   per-particle wobble and rendered with additive blending so
   dense regions sum to bright and sparse regions fade soft.

     orbSetState(state)   — 'idle'|'connecting'|'listening'|'speaking'|'thinking'|'error'
     orbSetVoice(0..1)    — speech amplitude from VAD
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var canvas, ctx, dpr, cx, cy, baseRadius;
  var time = 0, lastT = 0;

  var voiceLevel = 0, targetVoice = 0;
  var smoothExpand = 0, targetExpand = 0;
  var smoothTurb = 0.10, targetTurb = 0.10;
  var smoothBreathe = 0.020, targetBreathe = 0.020;
  var smoothEnergy = 0.35, targetEnergy = 0.35;

  var orbState = 'idle';
  var raf = null;

  var rotY = 0;
  var ROT_SPEED = 0.11;   // base rad/s — slow drift

  var N = 1900;
  var pts = [];

  // Pale cyan-blue base; thinking drifts violet, error drifts red
  var R = 170, G = 218, B = 255;
  var curR = R, curG = G, curB = B;

  // ── Helpers ──────────────────────────────────────────────
  function gauss() {
    // Box-Muller
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function randDir() {
    var u = Math.random() * 2 - 1;
    var phi = Math.random() * Math.PI * 2;
    var r = Math.sqrt(1 - u * u);
    return { nx: r * Math.cos(phi), ny: r * Math.sin(phi), nz: u };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('voice-orb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    for (var i = 0; i < N; i++) {
      var d = randDir();
      var rOff;
      var layer;
      var frac = i / N;

      if (frac < 0.15) {
        // Inner core — clustered near center, gives hot ember
        rOff = Math.abs(gauss()) * 0.32;
        layer = 0;
      } else if (frac < 0.78) {
        // Main shell — thick gaussian around r=1
        rOff = 1 + gauss() * 0.13;
        layer = 1;
      } else {
        // Outer halo — wispy, sparse, drives fuzzy edge
        rOff = 1.05 + Math.abs(gauss()) * 0.35;
        layer = 2;
      }
      if (rOff < 0.05) rOff = 0.05;
      if (rOff > 1.85) rOff = 1.85;

      pts.push({
        nx: d.nx, ny: d.ny, nz: d.nz,
        r0: rOff,
        layer: layer,
        ph1: Math.random() * Math.PI * 2,
        ph2: Math.random() * Math.PI * 2,
        ph3: Math.random() * Math.PI * 2,
        sp1: 0.65 + Math.random() * 0.7,
        sp2: 0.65 + Math.random() * 0.7,
        br: 0.55 + Math.random() * 0.5,     // brightness variance
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
    baseRadius = Math.min(w, h) * 0.30 * dpr;
  }

  // ── Main tick ────────────────────────────────────────────
  function tick(tMs) {
    raf = requestAnimationFrame(tick);
    if (!lastT) lastT = tMs;
    var dt = Math.min(0.05, (tMs - lastT) / 1000);
    lastT = tMs;
    time += dt;

    // ── State-driven targets ────────────────────────────────
    var tR = R, tG = G, tB = B;
    switch (orbState) {
      case 'connecting':
        targetExpand = 0;
        targetTurb = 0.14;
        targetBreathe = 0.025;
        targetEnergy = 0.35;
        break;
      case 'listening':
        var v = Math.sqrt(voiceLevel);
        targetExpand = v * 0.18;
        targetTurb = 0.11 + v * 0.38;
        targetBreathe = 0.020 + v * 0.018;
        targetEnergy = 0.38 + v * 0.55;
        break;
      case 'speaking':
        targetExpand = 0.12;
        targetTurb = 0.34;
        targetBreathe = 0.035;
        targetEnergy = 0.92;
        break;
      case 'thinking':
        targetExpand = 0.03;
        targetTurb = 0.17;
        targetBreathe = 0.022;
        targetEnergy = 0.48;
        tR = 150; tG = 175; tB = 255;
        break;
      case 'error':
        targetExpand = -0.05;
        targetTurb = 0.06;
        targetBreathe = 0.012;
        targetEnergy = 0.42;
        tR = 255; tG = 95; tB = 85;
        break;
    }

    // ── Ease all parameters ────────────────────────────────
    voiceLevel = lerp(voiceLevel, targetVoice, 0.18);
    smoothExpand = lerp(smoothExpand, targetExpand, 0.09);
    smoothTurb = lerp(smoothTurb, targetTurb, 0.06);
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.04);
    smoothEnergy = lerp(smoothEnergy, targetEnergy, 0.07);
    curR = lerp(curR, tR, 0.05);
    curG = lerp(curG, tG, 0.05);
    curB = lerp(curB, tB, 0.05);
    var ri = curR | 0, gi = curG | 0, bi = curB | 0;
    var rgbStr = ri + ',' + gi + ',' + bi;

    // ── Rotation ────────────────────────────────────────────
    rotY += ROT_SPEED * dt * (1 + smoothTurb * 0.6);
    var cY = Math.cos(rotY), sY = Math.sin(rotY);

    // ── Breathing radius ───────────────────────────────────
    var breath = Math.sin(time * 0.95) * smoothBreathe;
    var rad = baseRadius * (1 + smoothExpand + breath);

    var turb = 0.055 + smoothTurb;
    var brightness = 0.42 + smoothEnergy * 0.62;

    // ── Render ──────────────────────────────────────────────
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Soft halo — normal blend, under everything
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.85);
    var haloA = 0.06 + smoothEnergy * 0.14;
    halo.addColorStop(0,    'rgba(' + rgbStr + ',' + haloA.toFixed(3) + ')');
    halo.addColorStop(0.35, 'rgba(' + rgbStr + ',' + (haloA * 0.45).toFixed(3) + ')');
    halo.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Particle cloud — additive so dense regions sum to bright
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < N; i++) {
      var p = pts[i];

      // Per-particle directional wobble (organic drift)
      var dx = Math.sin(time * 0.55 * p.sp1 + p.ph1) * turb;
      var dy = Math.sin(time * 0.67 * p.sp2 + p.ph2) * turb;
      var dz = Math.sin(time * 0.49 * p.sp1 + p.ph3) * turb;

      var nx = p.nx + dx;
      var ny = p.ny + dy;
      var nz = p.nz + dz;
      var L = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (L < 0.01) continue;
      nx /= L; ny /= L; nz /= L;

      // Per-particle radial pulse
      var rLocal = p.r0 + Math.sin(time * 1.15 * p.sp2 + p.ph1) * 0.055 * (1 + smoothTurb);

      // Rotate around Y axis
      var x1 = nx * cY + nz * sY;
      var z1 = -nx * sY + nz * cY;
      var y1 = ny;

      var sx = cx + x1 * rLocal * rad;
      var sy = cy + y1 * rLocal * rad;
      var depth = (z1 + 1) * 0.5;   // 0 back, 1 front

      // Layer-specific brightness weighting
      var layerMul;
      if (p.layer === 0)      layerMul = 1.25;  // core hot
      else if (p.layer === 1) layerMul = 0.95;  // shell
      else                    layerMul = 0.60;  // wispy outer

      var alpha = (0.12 + depth * 0.55) * p.br * brightness * layerMul;
      if (alpha < 0.018) continue;
      if (alpha > 0.98) alpha = 0.98;

      var size = (0.55 + depth * 0.90) * dpr;
      // Core particles slightly bigger so center reads as a glow
      if (p.layer === 0) size *= 1.15;

      ctx.fillStyle = 'rgba(' + rgbStr + ',' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── Public API ────────────────────────────────────────────
  window.orbSetState = function (state) {
    orbState = state;
    if (state === 'idle') {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      lastT = 0;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      resize();
      if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
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
