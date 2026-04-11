/* ── J.A.R.V.I.S. Neural Sphere ───────────────────────────────
   A rigid geodesic mesh: nodes locked to a sphere surface,
   connected by triangulated edges. Slowly auto-rotates on Y.
   Voice drives activation pulses that propagate across the mesh.

     orbSetState(state)   — 'idle'|'connecting'|'listening'|'speaking'|'thinking'|'error'
     orbSetVoice(0..1)    — speech probability from VAD
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var canvas, ctx, dpr, cx, cy, baseRadius;
  var time = 0, lastT = 0;

  var voiceLevel = 0, targetVoice = 0;
  var smoothExpand = 0, targetExpand = 0;
  var smoothBreathe = 0.015, targetBreathe = 0.015;

  var orbState = 'idle';
  var raf = null;

  // Auto-rotation — slow, sci-fi sphere rotation
  var rotY = 0, rotX = -0.22;
  var rotYSpeed = 0.14;  // rad/s, gentle

  // ── Sphere topology ───────────────────────────────────────
  var N = 140;                 // node count — clean not crowded
  var pts = [];                // fixed sphere nodes
  var adj = [];                // adjacency: adj[i] = [j, k, ...]
  var edges = [];              // {i, j}
  var CONNECTION_DOT = 0.865;  // cos(~30°) — triangulated neighbors
  var MAX_EDGES_PER = 6;

  // Color palette — J.A.R.V.I.S. pale cyan-white
  var NODE_R = 190, NODE_G = 230, NODE_B = 255;

  // ── Activation pulses ─────────────────────────────────────
  // Each node has an "activation" level that decays over time.
  // When speaking, random seeds fire, then activation spreads to
  // neighbors on each tick (neural network signal propagation).
  var activation = null;       // Float32Array(N)
  var nextSeedTime = 0;

  function init() {
    canvas = document.getElementById('voice-orb-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Fibonacci sphere — even distribution
    var gr = (1 + Math.sqrt(5)) / 2;
    for (var i = 0; i < N; i++) {
      var theta = Math.acos(1 - 2 * (i + 0.5) / N);
      var phi = 2 * Math.PI * i / gr;
      pts.push({
        nx: Math.sin(theta) * Math.cos(phi),
        ny: Math.sin(theta) * Math.sin(phi),
        nz: Math.cos(theta),
        ec: 0,
      });
      adj.push([]);
    }

    // Build edges from angular proximity
    for (var i = 0; i < N; i++) {
      for (var j = i + 1; j < N; j++) {
        if (pts[i].ec >= MAX_EDGES_PER || pts[j].ec >= MAX_EDGES_PER) continue;
        var dot = pts[i].nx * pts[j].nx + pts[i].ny * pts[j].ny + pts[i].nz * pts[j].nz;
        if (dot > CONNECTION_DOT) {
          edges.push({ i: i, j: j });
          adj[i].push(j);
          adj[j].push(i);
          pts[i].ec++;
          pts[j].ec++;
        }
      }
    }

    activation = new Float32Array(N);

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
    baseRadius = Math.min(w, h) * 0.38 * dpr;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function fireSeed() {
    // Pick a node and set its activation to full — will propagate on next ticks.
    var idx = (Math.random() * N) | 0;
    activation[idx] = 1;
    // Also light an immediate neighbor for a nice twin-flash
    var nb = adj[idx];
    if (nb.length) activation[nb[(Math.random() * nb.length) | 0]] = 0.9;
  }

  function propagateActivation(dt) {
    // Decay all nodes, then transfer a portion of each node's activation to
    // its neighbors (bounded). Classic threshold-graph propagation.
    var next = new Float32Array(N);
    var decay = Math.exp(-dt * 1.9);           // half-life ~0.36s
    var spread = 1 - Math.exp(-dt * 2.4);      // fraction flowing outward per step
    for (var i = 0; i < N; i++) {
      var a = activation[i] * decay;
      next[i] += a * (1 - spread * 0.55);
      var nb = adj[i];
      if (a > 0.05 && nb.length) {
        var share = (a * spread * 0.55) / nb.length;
        for (var k = 0; k < nb.length; k++) {
          next[nb[k]] += share;
        }
      }
    }
    // Clamp
    for (var i = 0; i < N; i++) {
      if (next[i] > 1) next[i] = 1;
      activation[i] = next[i];
    }
  }

  function tick(tMs) {
    raf = requestAnimationFrame(tick);
    if (!lastT) lastT = tMs;
    var dt = Math.min(0.05, (tMs - lastT) / 1000);
    lastT = tMs;
    time += dt;

    // Target parameters per state
    var rr = NODE_R, gg = NODE_G, bb = NODE_B;
    var speedMult = 1;
    var fireRate = 0;   // seeds per second

    switch (orbState) {
      case 'connecting':
        targetExpand = 0;
        targetBreathe = 0.025;
        fireRate = 0.8;
        speedMult = 0.8;
        break;
      case 'listening':
        var v = Math.sqrt(voiceLevel);
        targetExpand = v * 0.10;
        targetBreathe = 0.018 + v * 0.020;
        fireRate = 0.3 + v * 6;
        speedMult = 1 + v * 0.6;
        break;
      case 'speaking':
        targetExpand = 0.08;
        targetBreathe = 0.028;
        fireRate = 9;
        speedMult = 1.6;
        break;
      case 'thinking':
        targetExpand = 0.02;
        targetBreathe = 0.018;
        fireRate = 2.5;
        rr = 160; gg = 180; bb = 255;
        speedMult = 0.9;
        break;
      case 'error':
        targetExpand = 0;
        targetBreathe = 0.010;
        fireRate = 0.5;
        rr = 255; gg = 95; bb = 85;
        speedMult = 0.6;
        break;
    }

    // Ease voice, expand, breathe
    voiceLevel = lerp(voiceLevel, targetVoice, 0.15);
    smoothExpand = lerp(smoothExpand, targetExpand, 0.12);
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.04);

    // Rotation
    rotY += rotYSpeed * dt * speedMult;
    var cY = Math.cos(rotY), sY = Math.sin(rotY);
    var cX = Math.cos(rotX), sX = Math.sin(rotX);

    // Fire new activation seeds
    if (fireRate > 0 && time > nextSeedTime) {
      fireSeed();
      nextSeedTime = time + (1 / fireRate) * (0.5 + Math.random() * 0.9);
    }
    propagateActivation(dt);

    // Breathing radius (very subtle)
    var breath = smoothBreathe * Math.sin(time * 1.3);
    var rad = baseRadius * (1 + smoothExpand + breath);

    // ── Project all nodes ────────────────────────────────────
    // Apply Y then X rotation, record screen pos + depth
    var proj = new Array(N);
    for (var i = 0; i < N; i++) {
      var p = pts[i];
      // rotate around Y
      var x1 = p.nx * cY + p.nz * sY;
      var z1 = -p.nx * sY + p.nz * cY;
      var y1 = p.ny;
      // rotate around X
      var y2 = y1 * cX - z1 * sX;
      var z2 = y1 * sX + z1 * cX;
      var x2 = x1;
      proj[i] = {
        sx: cx + x2 * rad,
        sy: cy + y2 * rad,
        z: z2,           // -1 (back) .. +1 (front)
      };
    }

    // ── Render ───────────────────────────────────────────────
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Soft inner core glow — very subtle ember in center
    var coreA = 0.07 + voiceLevel * 0.18;
    var coreR = rad * 0.55;
    var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0,   'rgba(70,150,240,' + (coreA * 0.9).toFixed(3) + ')');
    core.addColorStop(0.45,'rgba(40,100,220,' + (coreA * 0.35).toFixed(3) + ')');
    core.addColorStop(1,   'rgba(10,40,140,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    // ── Edges — two depth passes (back/front) for cleanliness ──
    // Back hemisphere: dim. Front hemisphere: brighter.
    // Edge brightness is boosted by max activation of its endpoints.
    ctx.lineCap = 'round';

    // Back pass
    ctx.strokeStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',0.09)';
    ctx.lineWidth = 0.55 * dpr;
    ctx.beginPath();
    for (var e = 0; e < edges.length; e++) {
      var pa = proj[edges[e].i], pb = proj[edges[e].j];
      if ((pa.z + pb.z) * 0.5 < 0) {
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
      }
    }
    ctx.stroke();

    // Front pass — normal edges
    ctx.strokeStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',0.30)';
    ctx.lineWidth = 0.75 * dpr;
    ctx.beginPath();
    for (var e = 0; e < edges.length; e++) {
      var pa = proj[edges[e].i], pb = proj[edges[e].j];
      if ((pa.z + pb.z) * 0.5 >= 0) {
        var maxAct = Math.max(activation[edges[e].i], activation[edges[e].j]);
        if (maxAct > 0.08) continue;  // draw hot ones in the glow pass
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
      }
    }
    ctx.stroke();

    // Front pass — activated edges (glow)
    ctx.shadowBlur = 6 * dpr;
    ctx.shadowColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',0.95)';
    for (var e = 0; e < edges.length; e++) {
      var pa = proj[edges[e].i], pb = proj[edges[e].j];
      var avgZ = (pa.z + pb.z) * 0.5;
      if (avgZ < 0) continue;
      var maxAct = Math.max(activation[edges[e].i], activation[edges[e].j]);
      if (maxAct <= 0.08) continue;
      ctx.strokeStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.35 + maxAct * 0.55).toFixed(3) + ')';
      ctx.lineWidth = (0.85 + maxAct * 1.1) * dpr;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ── Nodes — depth-sorted, size & alpha depth-cued ─────────
    var order = new Array(N);
    for (var i = 0; i < N; i++) order[i] = i;
    order.sort(function (a, b) { return proj[a].z - proj[b].z; });

    for (var k = 0; k < N; k++) {
      var idx = order[k];
      var pt = proj[idx];
      var depth = (pt.z + 1) / 2;                    // 0..1 back→front
      var act = activation[idx];

      // Dim back hemisphere more aggressively — gives depth
      var baseA = 0.12 + depth * depth * 0.88;
      var alpha = Math.min(1, baseA + act * 0.6);
      var size = (0.7 + depth * 1.2 + act * 1.8) * dpr;

      // Activated nodes get an extra glow
      if (act > 0.12) {
        ctx.shadowBlur = (4 + act * 10) * dpr;
        ctx.shadowColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.7 + act * 0.3).toFixed(2) + ')';
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────
  window.orbSetState = function (state) {
    orbState = state;
    if (state === 'idle') {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      lastT = 0;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (activation) activation.fill(0);
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
