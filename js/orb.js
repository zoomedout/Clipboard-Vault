/* ── Ethereal AI Cloud ──────────────────────────────────────
   Very fine particle mist in three density layers — glowing
   core, main shell, wispy outer halo. Additive blending sums
   dense regions to bright, sparse edges fade soft.

   Voice reactivity:
     - Dual envelope followers (fast + slow) on input signal
     - Flutter: stacked sines scaled by fast envelope — pulsing
       bigger/smaller/bigger along a natural voice curve
     - Activation regions: random "brain spots" light up,
       particles converge into dense clusters while the rest
       of the cloud disperses outward (equal action/reaction)

     orbSetState(state)   — 'idle'|'connecting'|'listening'|'speaking'|'thinking'|'error'
     orbSetVoice(0..1)    — continuous speech amplitude (RMS × VAD gate)
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var canvas, ctx, dpr, cx, cy, baseRadius;
  var time = 0, lastT = 0;

  // ── Voice envelope followers ──────────────────────────────
  var voiceIn = 0;               // raw input (0..1) from orbSetVoice
  var voiceFast = 0;             // fast envelope — attack 0.28, decay 0.09
  var voiceSlow = 0;             // slow envelope — follows utterance energy
  var voicePeak = 0;             // decaying peak — for expand max clamp

  var smoothExpand = 0, targetExpand = 0;
  var smoothTurb = 0.10, targetTurb = 0.10;
  var smoothBreathe = 0.020, targetBreathe = 0.020;
  var smoothEnergy = 0.35, targetEnergy = 0.35;

  var orbState = 'idle';
  var raf = null;

  var rotY = 0;
  var ROT_SPEED = 0.11;

  var N = 6000;
  var pts = [];

  // Pale lavender-purple base
  var R = 255, G = 255, B = 255;
  var curR = R, curG = G, curB = B;

  // ── Activation regions ────────────────────────────────────
  var MAX_REGIONS = 2;
  var regions = [];
  var lastRegionSpawn = 0;

  // ── Helpers ──────────────────────────────────────────────
  function gauss() {
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

  // Sample a direction within a cone around (dx,dy,dz). Uses a
  // center-biased distribution: particles cluster denser near the
  // cone axis, thinning toward the edge. minCos controls cone width
  // (minCos=0.80 ≈ ~37° half-angle).
  function sampleInCone(dx, dy, dz, minCos) {
    // Orthonormal basis around D
    var ax, ay, az;
    if (Math.abs(dx) < 0.9) { ax = 1; ay = 0; az = 0; }
    else { ax = 0; ay = 1; az = 0; }
    var e1x = dy * az - dz * ay;
    var e1y = dz * ax - dx * az;
    var e1z = dx * ay - dy * ax;
    var L1 = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
    e1x /= L1; e1y /= L1; e1z /= L1;
    var e2x = dy * e1z - dz * e1y;
    var e2y = dz * e1x - dx * e1z;
    var e2z = dx * e1y - dy * e1x;

    // Bias cosφ toward 1 (cluster near center) via power distribution
    var u = Math.random();
    var cosPhi = minCos + (1 - minCos) * Math.pow(u, 0.9);
    var sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
    var psi = Math.random() * Math.PI * 2;
    var cp = Math.cos(psi), sp = Math.sin(psi);
    return {
      nx: cosPhi * dx + sinPhi * (cp * e1x + sp * e2x),
      ny: cosPhi * dy + sinPhi * (cp * e1y + sp * e2y),
      nz: cosPhi * dz + sinPhi * (cp * e1z + sp * e2z),
    };
  }

  // ── Regions lifecycle ─────────────────────────────────────
  function spawnRegion() {
    if (regions.length >= MAX_REGIONS) return;
    var d = randDir();
    var region = {
      nx: d.nx, ny: d.ny, nz: d.nz,
      age: 0,
      weight: 0,
      fadeIn: 0.16 + Math.random() * 0.12,   // 0.16–0.28s (alpha fade)
      hold: 1.20 + Math.random() * 0.80,     // 1.20–2.00s
      fadeOut: 0.55 + Math.random() * 0.35,  // 0.55–0.90s
      expandDur: 0.45 + Math.random() * 0.20, // 0.45–0.65s  (core → shell travel)
      temps: [],
    };
    // Spawn temporary particles inside the activation cone. These
    // are rendered with IDENTICAL per-particle appearance to main
    // shell particles — same size, same brightness, same color.
    // The "lit up" look comes purely from pooled density in the
    // cone, summed by additive blending. More temps = brighter spot.
    var tempCount = 1500;
    for (var i = 0; i < tempCount; i++) {
      var pos = sampleInCone(d.nx, d.ny, d.nz, 0.9);
      region.temps.push({
        nx: pos.nx, ny: pos.ny, nz: pos.nz,
        r0: 1.06 + Math.random() * 0.14,     // 1.06–1.20 — lands outside the main shell
        ph: Math.random() * Math.PI * 2,
        sp: 0.70 + Math.random() * 0.50,
        br: 0.55 + Math.random() * 0.50,     // matches main-particle br range
        stagger: Math.random() * 0.15,       // 0–0.15s delay — some particles lag
      });
    }
    regions.push(region);
  }

  function updateRegions(dt) {
    for (var i = regions.length - 1; i >= 0; i--) {
      var r = regions[i];
      r.age += dt;
      var total = r.fadeIn + r.hold + r.fadeOut;
      if (r.age < r.fadeIn) {
        var t = r.age / r.fadeIn;
        r.weight = t * t * (3 - 2 * t);      // smoothstep in
      } else if (r.age < r.fadeIn + r.hold) {
        r.weight = 1;
      } else if (r.age < total) {
        var t2 = 1 - (r.age - r.fadeIn - r.hold) / r.fadeOut;
        r.weight = t2 * t2 * (3 - 2 * t2);   // smoothstep out
      } else {
        regions.splice(i, 1);
      }
    }
  }

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

      if (frac < 0.12) {
        // Inner core — clustered near center
        rOff = Math.abs(gauss()) * 0.32;
        layer = 0;
      } else if (frac < 0.87) {
        // Main shell — bulk of the cloud, tighter distribution
        rOff = 1 + gauss() * 0.10;
        layer = 1;
      } else {
        // Wispy outer halo — closer to shell so it doesn't fly off
        rOff = 1.02 + Math.abs(gauss()) * 0.20;
        layer = 2;
      }
      if (rOff < 0.05) rOff = 0.05;
      if (rOff > 1.60) rOff = 1.60;

      pts.push({
        nx: d.nx, ny: d.ny, nz: d.nz,
        r0: rOff,
        layer: layer,
        ph1: Math.random() * Math.PI * 2,
        ph2: Math.random() * Math.PI * 2,
        ph3: Math.random() * Math.PI * 2,
        sp1: 0.65 + Math.random() * 0.7,
        sp2: 0.65 + Math.random() * 0.7,
        br: 0.55 + Math.random() * 0.5,
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
    // Smaller resting radius (was 0.30, now 0.22) — more room to grow.
    baseRadius = Math.min(w, h) * 0.22 * dpr;
  }

  // ── Main tick ────────────────────────────────────────────
  function tick(tMs) {
    raf = requestAnimationFrame(tick);
    if (!lastT) lastT = tMs;
    var dt = Math.min(0.05, (tMs - lastT) / 1000);
    lastT = tMs;
    time += dt;

    // ── Voice envelope followers ───────────────────────────
    // Fast envelope: quick attack, slower release. Captures individual
    // syllables and syllable-rate dynamics.
    var fastAttack = voiceIn > voiceFast ? 0.28 : 0.09;
    voiceFast = lerp(voiceFast, voiceIn, fastAttack);
    // Slow envelope: tracks overall utterance energy, drives base expand.
    voiceSlow = lerp(voiceSlow, voiceIn, 0.07);
    // Peak follower — decays slowly.
    if (voiceIn > voicePeak) voicePeak = voiceIn;
    else voicePeak *= 0.985;

    // ── Flutter oscillator ─────────────────────────────────
    // Stacked incommensurate sines give natural bigger/smaller/bigger
    // pulsing. Amplitude is proportional to voiceFast so rest is calm
    // and speech drives visible flutter.
    var flutter =
      Math.sin(time * 3.1 + 0.2) * 0.55
      + Math.sin(time * 5.7 + 1.1) * 0.35
      + Math.sin(time * 8.3 + 2.8) * 0.22
      + Math.sin(time * 11.6 + 3.5) * 0.15;
    // flutter ∈ roughly [-1.27, +1.27]

    // ── State-driven targets ───────────────────────────────
    var tR = R, tG = G, tB = B;
    switch (orbState) {
      case 'connecting':
        targetExpand = 0;
        targetTurb = 0.14;
        targetBreathe = 0.025;
        targetEnergy = 0.35;
        break;

      case 'listening':
        // Base expansion from slow envelope (0 → 0.38)
        // Flutter overlay scales with fast envelope (±0.22 × flutter)
        var baseE = voiceSlow * 0.38;
        var flut = voiceFast * 0.22 * flutter;
        targetExpand = baseE + flut;
        targetTurb = 0.11 + voiceFast * 0.42;
        targetBreathe = 0.020 + voiceFast * 0.018;
        targetEnergy = 0.38 + voiceFast * 0.60;
        break;

      case 'speaking':
        // Gemini talking back — big, with subtle rhythmic wiggle
        targetExpand = 0.52 + 0.08 * Math.sin(time * 4.2) + 0.05 * Math.sin(time * 7.1);
        targetTurb = 0.35;
        targetBreathe = 0.035;
        targetEnergy = 0.92;
        break;

      case 'thinking':
        targetExpand = 0.05 + 0.03 * Math.sin(time * 1.8);
        targetTurb = 0.17;
        targetBreathe = 0.022;
        targetEnergy = 0.48;
        tR = 160; tG = 120; tB = 255;
        break;

      case 'error':
        targetExpand = -0.05;
        targetTurb = 0.06;
        targetBreathe = 0.012;
        targetEnergy = 0.42;
        tR = 255; tG = 95; tB = 85;
        break;
    }

    // ── Ease parameters ────────────────────────────────────
    // Asymmetric expand easing: faster when growing, slower when shrinking
    // → punchy bloom, graceful settle.
    var expandAttack = targetExpand > smoothExpand ? 0.14 : 0.08;
    smoothExpand = lerp(smoothExpand, targetExpand, expandAttack);
    smoothTurb = lerp(smoothTurb, targetTurb, 0.06);
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.04);
    smoothEnergy = lerp(smoothEnergy, targetEnergy, 0.07);
    curR = lerp(curR, tR, 0.05);
    curG = lerp(curG, tG, 0.05);
    curB = lerp(curB, tB, 0.05);
    var ri = curR | 0, gi = curG | 0, bi = curB | 0;
    var rgbStr = ri + ',' + gi + ',' + bi;

    // ── Region spawn / update ──────────────────────────────
    updateRegions(dt);
    var spawnInterval = 9999;
    var spawnCap = MAX_REGIONS;
    switch (orbState) {
      case 'speaking':
        spawnInterval = 0.5;
        spawnCap = 2;
        break;
      case 'listening':
        if (voiceFast > 0.10) {
          spawnInterval = 0.5;
          spawnCap = 2;
        }
        break;
      case 'thinking':
        spawnInterval = 0.5;
        spawnCap = 1;
        break;
    }
    if (time - lastRegionSpawn > spawnInterval && regions.length < spawnCap) {
      spawnRegion();
      lastRegionSpawn = time;
    }

    // Pre-compute total region weight for disperse-reaction
    var totalRegW = 0;
    for (var rr = 0; rr < regions.length; rr++) totalRegW += regions[rr].weight;

    // ── Rotation ────────────────────────────────────────────
    rotY += ROT_SPEED * dt * (1 + smoothTurb * 0.6);
    var cY = Math.cos(rotY), sY = Math.sin(rotY);

    // ── Breathing radius ───────────────────────────────────
    var breath = Math.sin(time * 0.95) * smoothBreathe;
    var rad = baseRadius * (1 + smoothExpand + breath);

    var turb = 0.055 + smoothTurb;
    var brightness = 0.42 + smoothEnergy * 0.58;

    // ── Render ──────────────────────────────────────────────
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Soft halo behind particles
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.85);
    var haloA = 0.06 + smoothEnergy * 0.14;
    halo.addColorStop(0, 'rgba(' + rgbStr + ',' + haloA.toFixed(3) + ')');
    halo.addColorStop(0.35, 'rgba(' + rgbStr + ',' + (haloA * 0.45).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Particle cloud — additive
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < N; i++) {
      var p = pts[i];

      // Main sphere particles get ZERO region influence — no pull, no
      // brightness boost, no size boost. Regions are expressed entirely
      // via the temp-particle pass below, which spawns fresh nodes inside
      // the activation cone. Only the collective totalRegW drives a
      // gentle outward dispersal here as the equal-reaction balance.
      var dx = Math.sin(time * 0.55 * p.sp1 + p.ph1) * turb;
      var dy = Math.sin(time * 0.67 * p.sp2 + p.ph2) * turb;
      var dz = Math.sin(time * 0.49 * p.sp1 + p.ph3) * turb;

      var nx = p.nx + dx;
      var ny = p.ny + dy;
      var nz = p.nz + dz;
      var L = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (L < 0.01) continue;
      nx /= L; ny /= L; nz /= L;

      // Radial pulse + subtle dispersal proportional to total region weight
      var radialPulse = Math.sin(time * 1.15 * p.sp2 + p.ph1) * 0.055 * (1 + smoothTurb);
      var radialMod = totalRegW > 0.1 ? Math.min(totalRegW, 2) * 0.025 : 0;
      var rLocal = p.r0 + radialPulse + radialMod;

      // ── Project (rotate Y, drop Z for depth) ────────────
      var x1 = nx * cY + nz * sY;
      var z1 = -nx * sY + nz * cY;
      var y1 = ny;

      var sx = cx + x1 * rLocal * rad;
      var sy = cy + y1 * rLocal * rad;
      var depth = (z1 + 1) * 0.5;

      // ── Layer-specific size/alpha base ──────────────────
      var sizeBase;
      var layerMul;
      if (p.layer === 0) { sizeBase = 0.50; layerMul = 1.25; }  // core
      else if (p.layer === 1) { sizeBase = 0.30; layerMul = 0.92; }  // shell
      else { sizeBase = 0.27; layerMul = 0.58; }  // wispy

      var alpha = (0.08 + depth * 0.42) * p.br * brightness * layerMul;
      if (alpha < 0.018) continue;
      if (alpha > 0.98) alpha = 0.98;

      var size = (sizeBase + depth * 0.42) * dpr;

      ctx.fillStyle = 'rgba(' + rgbStr + ',' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Temporary activation particles ───────────────────────
    // Rendered with IDENTICAL per-particle appearance to main shell
    // particles — same sizeBase, same layerMul, same alpha formula.
    // The "lit up" effect comes entirely from additive pooling: 360–520
    // temps packed into a ~30° cone naturally sum to a bright hotspot
    // while each individual temp is visually indistinguishable from a
    // sphere particle. Alpha is gated by region.weight so they fade in
    // with the region, hold, and fade out.
    var TEMP_SIZE_BASE = 0.30;
    var TEMP_LAYER_MUL = 0.92;
    for (var r = 0; r < regions.length; r++) {
      var reg = regions[r];
      var rw = reg.weight;
      if (rw < 0.01) continue;
      var temps = reg.temps;
      for (var ti = 0; ti < temps.length; ti++) {
        var tp = temps[ti];

        // Same wobble profile as main particles
        var twx = Math.sin(time * 0.55 * tp.sp + tp.ph) * turb;
        var twy = Math.sin(time * 0.67 * tp.sp + tp.ph + 1.1) * turb;
        var twz = Math.sin(time * 0.49 * tp.sp + tp.ph + 2.3) * turb;

        var tnx = tp.nx + twx;
        var tny = tp.ny + twy;
        var tnz = tp.nz + twz;
        var tL = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz);
        if (tL < 0.01) continue;
        tnx /= tL; tny /= tL; tnz /= tL;

        // Core → shell expansion travel. Particles start near center
        // (CORE_START_R) and travel outward to their destination during
        // reg.expandDur, with a per-temp stagger so they don't all arrive
        // at once. Cubic ease-out makes them burst fast then settle.
        var CORE_START_R = 0.08;
        var localAge = reg.age - tp.stagger;
        var travel;
        if (localAge <= 0) {
          travel = 0;
        } else if (localAge >= reg.expandDur) {
          travel = 1;
        } else {
          var t = localAge / reg.expandDur;
          travel = 1 - Math.pow(1 - t, 3);    // ease-out cubic
        }

        var destR = tp.r0 + Math.sin(time * 1.15 * tp.sp + tp.ph) * 0.055 * (1 + smoothTurb);
        var trLocal = CORE_START_R + (destR - CORE_START_R) * travel;

        var tx1 = tnx * cY + tnz * sY;
        var tz1 = -tnx * sY + tnz * cY;
        var ty1 = tny;

        var tsx = cx + tx1 * trLocal * rad;
        var tsy = cy + ty1 * trLocal * rad;
        var tdepth = (tz1 + 1) * 0.5;

        // IDENTICAL to main-particle shell-layer formula, gated by rw
        var talpha = (0.08 + tdepth * 0.42) * tp.br * brightness * TEMP_LAYER_MUL * rw;
        if (talpha < 0.018) continue;
        if (talpha > 0.98) talpha = 0.98;

        var tsize = (TEMP_SIZE_BASE + tdepth * 0.42) * dpr;

        ctx.fillStyle = 'rgba(' + rgbStr + ',' + talpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(tsx, tsy, tsize, 0, Math.PI * 2);
        ctx.fill();
      }
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
      regions.length = 0;
    } else {
      resize();
      if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
    }
  };

  window.orbSetVoice = function (p) {
    voiceIn = Math.max(0, Math.min(1, p));
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
