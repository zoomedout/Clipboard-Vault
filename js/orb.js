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
  var smoothMicro = 0.01, targetMicro = 0.01;
  var smoothBreathe = 0.04, targetBreathe = 0.04;

  var orbState = 'idle';
  var raf = null;

  // ── Neural activation regions ─────────────────────────────
  // Each region drifts slowly to a new target; weight fades in/out
  var MAX_REGIONS = 3;
  var regions = [];
  var nextRegionSwap = 0;
  var REGION_LERP = 0.012;   // position lerp — slow wavy drift toward target
  var REGION_FADE = 0.015;   // weight lerp — gentle fade in/out

  function randomSpherePoint() {
    var u = Math.random() * 2 - 1;
    var phi = Math.random() * Math.PI * 2;
    var r = Math.sqrt(1 - u * u);
    return { nx: r * Math.cos(phi), ny: r * Math.sin(phi), nz: u };
  }

  function initRegions() {
    regions = [];
    for (var i = 0; i < MAX_REGIONS; i++) {
      var pt = randomSpherePoint();
      regions.push({
        nx: pt.nx, ny: pt.ny, nz: pt.nz,
        tnx: pt.nx, tny: pt.ny, tnz: pt.nz,
        weight: 0, targetWeight: 0
      });
    }
  }

  function snapRegions() {
    var count = 2 + (Math.random() < 0.35 ? 1 : 0); // 2 or occasionally 3
    for (var i = 0; i < MAX_REGIONS; i++) {
      if (i < count) {
        var pt = randomSpherePoint();
        regions[i].tnx = pt.nx;
        regions[i].tny = pt.ny;
        regions[i].tnz = pt.nz;
        regions[i].targetWeight = 1;
      } else {
        regions[i].targetWeight = 0;
      }
    }
    nextRegionSwap = time + 2.0 + Math.random(); // 2–3 s
  }

  function fadeOutRegions() {
    for (var i = 0; i < regions.length; i++) regions[i].targetWeight = 0;
  }

  var N = 2500;
  var pts = [];

  function init() {
    canvas = document.getElementById('voice-orb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    initRegions();

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

    // Asymmetric easing: fast attack AND fast decay → rhythmic pulse per syllable
    var voiceAttack = targetVoice > voiceLevel ? 0.18 : 0.14;
    var expandAttack = targetExpand > smoothExpand ? 0.16 : 0.13;
    voiceLevel = lerp(voiceLevel, targetVoice, voiceAttack);
    smoothExpand = lerp(smoothExpand, targetExpand, expandAttack);
    smoothMicro = lerp(smoothMicro, targetMicro, 0.025); // slow — organic feel
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.018); // slow — organic feel

    // ── Update region positions and weights (every frame) ────
    for (var ri = 0; ri < regions.length; ri++) {
      var reg = regions[ri];
      reg.nx = lerp(reg.nx, reg.tnx, REGION_LERP);
      reg.ny = lerp(reg.ny, reg.tny, REGION_LERP);
      reg.nz = lerp(reg.nz, reg.tnz, REGION_LERP);
      // Normalize to stay on unit sphere after lerp
      var rlen = Math.sqrt(reg.nx * reg.nx + reg.ny * reg.ny + reg.nz * reg.nz);
      if (rlen > 0.001) { reg.nx /= rlen; reg.ny /= rlen; reg.nz /= rlen; }
      reg.weight = lerp(reg.weight, reg.targetWeight, REGION_FADE);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── State parameters ──────────────────────────────────────
    var r = 255, g = 255, b = 255;

    switch (orbState) {
      case 'connecting':
        targetExpand = 0;
        targetMicro = 0.25;
        targetBreathe = 0.055;
        break;

      case 'listening':
        var v = Math.sqrt(voiceLevel);
        targetExpand = v * 0.55;
        targetMicro = 0.55 + v * 0.20;
        targetBreathe = 0.040;
        break;

      case 'speaking':
        targetExpand = 0.30;
        targetMicro = 0.70;
        targetBreathe = 0.065;
        break;

      case 'thinking':
        targetExpand = 0;
        targetMicro = 0.175;
        targetBreathe = 0.030;
        r = 110; g = 100; b = 230;
        break;

      case 'error':
        targetExpand = 0;
        targetMicro = 0.10;
        targetBreathe = 0.020;
        r = 255; g = 59; b = 48;
        break;
    }

    // Global breath — slow sine, all particles share this (collective mind)
    var breathOffset = smoothBreathe * Math.sin(time * 0.45);
    var rad = baseRadius * (1 + smoothExpand + breathOffset);

    // ── Neural region swap — fires on any speech, VAD-gated upstream ──
    var isSpeaking = voiceLevel > 0.05;
    if (isSpeaking) {
      if (time > nextRegionSwap) snapRegions();
    } else {
      fadeOutRegions();
    }

    // ── Project points ────────────────────────────────────────
    var proj = new Array(N);
    for (var i = 0; i < N; i++) {
      var p = pts[i];

      var d = smoothMicro * rad;
      var ox = d * (0.62 * Math.sin(time * 0.53 * p.s1 + p.p1) + 0.38 * Math.cos(time * 1.17 * p.s2 + p.p2));
      var oy = d * (0.62 * Math.sin(time * 0.71 * p.s2 + p.p2) + 0.38 * Math.cos(time * 0.89 * p.s1 + p.p3));
      var oz = d * (0.62 * Math.sin(time * 0.61 * p.s1 + p.p3) + 0.38 * Math.cos(time * 1.33 * p.s2 + p.p1));

      // ── Region attraction — gentle pull into active "continents" ──
      for (var ri = 0; ri < regions.length; ri++) {
        var reg = regions[ri];
        if (reg.weight < 0.01) continue;
        var dot = p.nx * reg.nx + p.ny * reg.ny + p.nz * reg.nz;

        if (dot > 0.3) {
          // Inside the region — smoothly pull toward region centre
          var pull = ((dot - 0.3) / 0.7) * 0.35 * rad * reg.weight;
          ox += (reg.nx - p.nx) * pull;
          oy += (reg.ny - p.ny) * pull;
          oz += (reg.nz - p.nz) * pull;
        }
      }

      proj[i] = {
        sx: cx + p.nx * rad + ox,
        sy: cy + p.ny * rad + oy,
        z: p.nz + oz / rad,
      };
    }

    // Sort back-to-front
    proj.sort(function (a, b) { return a.z - b.z; });

    // ── Layer 1: Outer atmosphere — clipped to circle, expands with rad ──
    var atmR = rad * 1.55;
    var atmA = 0.22 + breathOffset * 0.4 + voiceLevel * 0.10;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, atmR, 0, Math.PI * 2);
    ctx.clip();
    var atm = ctx.createRadialGradient(cx, cy, 0, cx, cy, atmR);
    atm.addColorStop(0, 'rgba(60,100,255,' + Math.min(0.30, atmA).toFixed(2) + ')');
    atm.addColorStop(0.4, 'rgba(40,70,220,0.10)');
    atm.addColorStop(0.75, 'rgba(30,55,200,0.04)');
    atm.addColorStop(1, 'rgba(20,40,180,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, atmR, 0, Math.PI * 2);
    ctx.fillStyle = atm;
    ctx.fill();
    ctx.restore();

    // ── Clip to circle — particles stay spherical ─────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 1.15, 0, Math.PI * 2);
    ctx.clip();

    // ── Layer 2: Core glow — blue, voice-reactive ─────────────
    var coreA = 0.08 + voiceLevel * 0.38;
    var coreR = rad * (0.45 + voiceLevel * 0.25);
    var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, 'rgba(80,140,255,' + Math.min(0.55, coreA).toFixed(2) + ')');
    core.addColorStop(0.4, 'rgba(50,100,240,' + (coreA * 0.4).toFixed(2) + ')');
    core.addColorStop(1, 'rgba(30,60,200,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    // ── Layer 2b: Neural region glows — country-sized diffuse patches ──
    for (var ri = 0; ri < regions.length; ri++) {
      var reg = regions[ri];
      var w = reg.weight;
      if (w < 0.01) continue;

      var rsx = cx + reg.nx * rad;
      var rsy = cy + reg.ny * rad;

      // Subtle diffuse trail from core toward region
      var trailAngleX = (rsx - cx) / rad;
      var trailAngleY = (rsy - cy) / rad;
      var trail = ctx.createRadialGradient(
        cx + trailAngleX * rad * 0.2, cy + trailAngleY * rad * 0.2, 0,
        cx, cy, rad
      );
      trail.addColorStop(0,   'rgba(80,140,255,' + (0.10 * w).toFixed(2) + ')');
      trail.addColorStop(0.6, 'rgba(60,110,240,' + (0.03 * w).toFixed(2) + ')');
      trail.addColorStop(1,   'rgba(40,80,220,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = trail;
      ctx.fill();

      // Large diffuse glow at region surface — continent-sized, soft falloff
      var spotR = rad * 0.65;
      var spot = ctx.createRadialGradient(rsx, rsy, 0, rsx, rsy, spotR);
      spot.addColorStop(0,   'rgba(160,220,255,' + (0.30 * w).toFixed(2) + ')');
      spot.addColorStop(0.3, 'rgba(100,170,255,' + (0.15 * w).toFixed(2) + ')');
      spot.addColorStop(0.6, 'rgba(60,120,240,' + (0.06 * w).toFixed(2) + ')');
      spot.addColorStop(1,   'rgba(40,80,220,0)');
      ctx.beginPath();
      ctx.arc(rsx, rsy, spotR, 0, Math.PI * 2);
      ctx.fillStyle = spot;
      ctx.fill();
    }

    // ── Layer 3: Particles — white (or state color) ───────────
    for (var j = 0; j < N; j++) {
      var pt = proj[j];
      var depth = (pt.z + 1.3) / 2.6;                     // 0..1
      var dotSize = (0.15 + depth * 0.38) * dpr;
      var alpha = Math.max(0, 0.05 + depth * 0.88);
      var color = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(2) + ')';

      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
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
