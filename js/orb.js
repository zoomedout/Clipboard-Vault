/* ── Particle Sphere Orb ─────────────────────────────────────
   Neural globe: particles connected by lines on a sphere surface.
   Voice drives expansion; regions light up on speech.

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
  var MAX_REGIONS = 3;
  var regions = [];
  var nextRegionSwap = 0;
  var REGION_LERP = 0.012;
  var REGION_FADE = 0.015;

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
    var count = 2 + (Math.random() < 0.35 ? 1 : 0);
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

  // ── Particles + edges ─────────────────────────────────────
  var N = 400;
  var pts = [];
  var edges = []; // precomputed from sphere topology — drawn as lines each frame

  var CONNECTION_DOT = 0.93;   // cos(~22°) — sphere surface neighbors
  var MAX_EDGES_PER = 7;       // cap so no single node dominates

  function init() {
    canvas = document.getElementById('voice-orb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    initRegions();

    // Fibonacci sphere — even surface distribution
    var gr = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < N; i++) {
      var theta = Math.acos(1 - 2 * (i + 0.5) / N);
      var phi = 2 * Math.PI * i / gr;
      pts.push({
        nx: Math.sin(theta) * Math.cos(phi),
        ny: Math.sin(theta) * Math.sin(phi),
        nz: Math.cos(theta),
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        p3: Math.random() * Math.PI * 2,
        s1: 0.85 + Math.random() * 0.3,
        s2: 0.85 + Math.random() * 0.3,
        ec: 0, // edge count
      });
    }

    // Build edge list once from sphere topology
    for (var i = 0; i < N; i++) {
      for (var j = i + 1; j < N; j++) {
        if (pts[i].ec >= MAX_EDGES_PER || pts[j].ec >= MAX_EDGES_PER) continue;
        var dot = pts[i].nx * pts[j].nx + pts[i].ny * pts[j].ny + pts[i].nz * pts[j].nz;
        if (dot > CONNECTION_DOT) {
          edges.push({ i: i, j: j });
          pts[i].ec++;
          pts[j].ec++;
        }
      }
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

    // Asymmetric easing — fast attack AND fast decay for voice pulse
    var voiceAttack = targetVoice > voiceLevel ? 0.18 : 0.14;
    var expandAttack = targetExpand > smoothExpand ? 0.16 : 0.13;
    voiceLevel = lerp(voiceLevel, targetVoice, voiceAttack);
    smoothExpand = lerp(smoothExpand, targetExpand, expandAttack);
    smoothMicro = lerp(smoothMicro, targetMicro, 0.025);
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.018);

    // Lerp region positions and weights every frame
    for (var ri = 0; ri < regions.length; ri++) {
      var reg = regions[ri];
      reg.nx = lerp(reg.nx, reg.tnx, REGION_LERP);
      reg.ny = lerp(reg.ny, reg.tny, REGION_LERP);
      reg.nz = lerp(reg.nz, reg.tnz, REGION_LERP);
      var rlen = Math.sqrt(reg.nx * reg.nx + reg.ny * reg.ny + reg.nz * reg.nz);
      if (rlen > 0.001) { reg.nx /= rlen; reg.ny /= rlen; reg.nz /= rlen; }
      reg.weight = lerp(reg.weight, reg.targetWeight, REGION_FADE);
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── State parameters ──────────────────────────────────────
    var rr = 160, gg = 220, bb = 255; // default: cyan-white

    switch (orbState) {
      case 'connecting':
        targetExpand = 0;
        targetMicro = 0.25;
        targetBreathe = 0.055;
        break;

      case 'listening':
        var v = Math.sqrt(voiceLevel);
        targetExpand = v * 0.55;
        targetMicro = 0.25 + v * 0.20;
        targetBreathe = 0.040;
        break;

      case 'speaking':
        targetExpand = 0.35;
        targetMicro = 0.40;
        targetBreathe = 0.065;
        break;

      case 'thinking':
        targetExpand = 0;
        targetMicro = 0.175;
        targetBreathe = 0.030;
        rr = 130; gg = 110; bb = 255;
        break;

      case 'error':
        targetExpand = 0;
        targetMicro = 0.10;
        targetBreathe = 0.020;
        rr = 255; gg = 80; bb = 60;
        break;
    }

    var breathOffset = smoothBreathe * Math.sin(time * 0.45);
    var rad = baseRadius * (1 + smoothExpand + breathOffset);

    // Neural region swap — VAD-gated
    var isSpeaking = voiceLevel > 0.05;
    if (isSpeaking) {
      if (time > nextRegionSwap) snapRegions();
    } else {
      fadeOutRegions();
    }

    // ── Project all particles ─────────────────────────────────
    var projByIdx = new Array(N);
    for (var i = 0; i < N; i++) {
      var p = pts[i];
      var d = smoothMicro * rad;
      var ox = d * (0.62 * Math.sin(time * 0.53 * p.s1 + p.p1) + 0.38 * Math.cos(time * 1.17 * p.s2 + p.p2));
      var oy = d * (0.62 * Math.sin(time * 0.71 * p.s2 + p.p2) + 0.38 * Math.cos(time * 0.89 * p.s1 + p.p3));
      var oz = d * (0.62 * Math.sin(time * 0.61 * p.s1 + p.p3) + 0.38 * Math.cos(time * 1.33 * p.s2 + p.p1));

      // Region attraction — gentle pull toward active continents
      for (var ri = 0; ri < regions.length; ri++) {
        var reg = regions[ri];
        if (reg.weight < 0.01) continue;
        var dot = p.nx * reg.nx + p.ny * reg.ny + p.nz * reg.nz;
        if (dot > 0.3) {
          var pull = ((dot - 0.3) / 0.7) * 0.30 * rad * reg.weight;
          ox += (reg.nx - p.nx) * pull;
          oy += (reg.ny - p.ny) * pull;
          oz += (reg.nz - p.nz) * pull;
        }
      }

      projByIdx[i] = {
        sx: cx + p.nx * rad + ox,
        sy: cy + p.ny * rad + oy,
        z: p.nz + oz / rad,
      };
    }

    // Depth-sorted copy for particle rendering
    var sorted = projByIdx.slice().sort(function (a, b) { return a.z - b.z; });

    // ── Everything inside sphere clip ─────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 1.12, 0, Math.PI * 2);
    ctx.clip();

    // ── Layer 1: Core glow — subtle blue ember ────────────────
    var coreA = 0.06 + voiceLevel * 0.30;
    var coreR = rad * (0.38 + voiceLevel * 0.22);
    var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, 'rgba(80,160,255,' + Math.min(0.50, coreA).toFixed(2) + ')');
    core.addColorStop(0.5, 'rgba(50,110,240,' + (coreA * 0.35).toFixed(2) + ')');
    core.addColorStop(1, 'rgba(20,70,210,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    // ── Layer 2: Region glows — continent highlights ──────────
    for (var ri = 0; ri < regions.length; ri++) {
      var reg = regions[ri];
      var w = reg.weight;
      if (w < 0.01) continue;
      var rsx = cx + reg.nx * rad;
      var rsy = cy + reg.ny * rad;
      var spotR = rad * 0.50;
      var spot = ctx.createRadialGradient(rsx, rsy, 0, rsx, rsy, spotR);
      spot.addColorStop(0,   'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.22 * w).toFixed(2) + ')');
      spot.addColorStop(0.4, 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.08 * w).toFixed(2) + ')');
      spot.addColorStop(1,   'rgba(' + rr + ',' + gg + ',' + bb + ',0)');
      ctx.beginPath();
      ctx.arc(rsx, rsy, spotR, 0, Math.PI * 2);
      ctx.fillStyle = spot;
      ctx.fill();
    }

    // ── Layer 3: Connection lines — 3 depth passes ────────────
    // Batch by depth bin: back (dim) → mid → front (bright)
    // 3 stroke() calls instead of one per edge for performance
    var lineBins = [
      { minZ: -2.0, maxZ: -0.15, alpha: 0.06, width: 0.35 },
      { minZ: -0.15, maxZ:  0.35, alpha: 0.16, width: 0.45 },
      { minZ:  0.35, maxZ:  2.0,  alpha: 0.38, width: 0.60 },
    ];
    var voiceMod = 0.7 + voiceLevel * 0.6;

    for (var bin = 0; bin < lineBins.length; bin++) {
      var lb = lineBins[bin];
      ctx.strokeStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (lb.alpha * voiceMod).toFixed(2) + ')';
      ctx.lineWidth = lb.width * dpr;
      ctx.beginPath();
      for (var e = 0; e < edges.length; e++) {
        var pa = projByIdx[edges[e].i];
        var pb = projByIdx[edges[e].j];
        var avgZ = (pa.z + pb.z) * 0.5;
        if (avgZ >= lb.minZ && avgZ < lb.maxZ) {
          ctx.moveTo(pa.sx, pa.sy);
          ctx.lineTo(pb.sx, pb.sy);
        }
      }
      ctx.stroke();
    }

    // ── Layer 4: Particles — depth-sorted, size varies ────────
    for (var j = 0; j < N; j++) {
      var pt = sorted[j];
      var depth = (pt.z + 1.3) / 2.6;              // 0..1
      var dotSize = (0.35 + depth * 1.4) * dpr;    // back=tiny, front=prominent
      var alpha = Math.max(0, 0.08 + depth * 0.90);
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, dotSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + alpha.toFixed(2) + ')';
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
