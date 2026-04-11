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

  // ── Eye state ─────────────────────────────────────────────
  var eyeX = 0, eyeY = 0;           // current pupil offset (normalised -1..1)
  var eyeTX = 0, eyeTY = 0;         // target gaze
  var blinkPhase = 0;                // 0 = open, 1 = fully closed
  var blinkState = 'open';           // 'open' | 'closing' | 'opening'
  var blinkStart = 0;
  var nextBlinkTime = 5;
  var nextGazeTime  = 3;

  var N = 2500;
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

    // Asymmetric easing: fast attack AND fast decay → rhythmic pulse per syllable
    var voiceAttack = targetVoice > voiceLevel ? 0.18 : 0.14;
    var expandAttack = targetExpand > smoothExpand ? 0.16 : 0.13;
    voiceLevel   = lerp(voiceLevel,   targetVoice,  voiceAttack);
    smoothExpand = lerp(smoothExpand, targetExpand, expandAttack);
    smoothMicro   = lerp(smoothMicro,   targetMicro,   0.025); // slow — organic feel
    smoothBreathe = lerp(smoothBreathe, targetBreathe, 0.018); // slow — organic feel

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── State parameters ──────────────────────────────────────
    var r = 255, g = 255, b = 255;

    switch (orbState) {
      case 'connecting':
        targetExpand  = 0;
        targetMicro   = 0.50;
        targetBreathe = 0.055;
        break;

      case 'listening':
        var v = Math.sqrt(voiceLevel);
        targetExpand  = v * 0.55;
        targetMicro   = 0.55 + v * 0.20;
        targetBreathe = 0.040;
        break;

      case 'speaking':
        targetExpand  = 0.30;
        targetMicro   = 0.70;
        targetBreathe = 0.065;
        break;

      case 'thinking':
        targetExpand  = 0;
        targetMicro   = 0.35;
        targetBreathe = 0.030;
        r = 110; g = 100; b = 230;
        break;

      case 'error':
        targetExpand  = 0;
        targetMicro   = 0.20;
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
        z:       p.nz + oz / rad   // normalised depth (-1..1) for size/opacity
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
    atm.addColorStop(0,   'rgba(60,100,255,' + Math.min(0.30, atmA).toFixed(2) + ')');
    atm.addColorStop(0.4, 'rgba(40,70,220,0.10)');
    atm.addColorStop(0.75,'rgba(30,55,200,0.04)');
    atm.addColorStop(1,   'rgba(20,40,180,0)');
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
    // Dim blue ember at rest, blazes when speaking
    var coreA  = 0.08 + voiceLevel * 0.38;
    var coreR  = rad * (0.45 + voiceLevel * 0.25);
    var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0,   'rgba(80,140,255,' + Math.min(0.55, coreA).toFixed(2) + ')');
    core.addColorStop(0.4, 'rgba(50,100,240,' + (coreA * 0.4).toFixed(2) + ')');
    core.addColorStop(1,   'rgba(30,60,200,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();

    // ── Layer 3: Particles (white dots) ───────────────────────
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

    // ── Layer 4: Eye — drawn on top of particles ───────────────
    drawEye();
  }

  function drawEye() {
    var isSpeaking = orbState === 'speaking' || orbState === 'listening';

    // ── Gaze wandering ───────────────────────────────────────
    if (time > nextGazeTime) {
      if (isSpeaking) {
        eyeTX = 0; eyeTY = 0; // snap to centre when speaking
      } else {
        eyeTX = (Math.random() - 0.5) * 1.5;
        eyeTY = (Math.random() - 0.5) * 0.9;
      }
      nextGazeTime = time + 1.8 + Math.random() * 4;
    }
    eyeX = lerp(eyeX, eyeTX, isSpeaking ? 0.08 : 0.025);
    eyeY = lerp(eyeY, eyeTY, isSpeaking ? 0.08 : 0.025);

    // ── Blink state machine ───────────────────────────────────
    if (blinkState === 'open' && time > nextBlinkTime && !isSpeaking) {
      blinkState = 'closing'; blinkStart = time;
    }
    if (blinkState === 'closing') {
      blinkPhase = Math.min(1, (time - blinkStart) / 0.07);
      if (blinkPhase >= 1) { blinkState = 'opening'; blinkStart = time; }
    }
    if (blinkState === 'opening') {
      blinkPhase = 1 - Math.min(1, (time - blinkStart) / 0.11);
      if (blinkPhase <= 0) {
        blinkPhase = 0; blinkState = 'open';
        nextBlinkTime = time + 4 + Math.random() * 5;
      }
    }

    // ── Eye geometry ──────────────────────────────────────────
    var eyeW  = baseRadius * 0.52;
    var openH = eyeW * 0.40;
    var eyeH  = openH * (1 - blinkPhase);   // collapses on blink

    if (eyeH < 0.5) return;                  // fully closed — skip draw

    var irisR  = Math.min(eyeH * 0.88, eyeW * 0.30);
    var pupilR = irisR * 0.46;
    var maxOff = Math.max(0, irisR - pupilR - 1 * dpr);
    var px     = cx + eyeX * maxOff;
    var py     = cy + eyeY * maxOff;

    // Almond clip path
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - eyeW / 2, cy);
    ctx.quadraticCurveTo(cx, cy - eyeH * 1.1, cx + eyeW / 2, cy);
    ctx.quadraticCurveTo(cx, cy + eyeH * 0.9,  cx - eyeW / 2, cy);
    ctx.closePath();
    ctx.clip();

    // Iris
    var irisGrd = ctx.createRadialGradient(px, py, 0, px, py, irisR);
    irisGrd.addColorStop(0,   'rgba(120,190,255,0.95)');
    irisGrd.addColorStop(0.5, 'rgba(60,120,240,0.90)');
    irisGrd.addColorStop(1,   'rgba(20,60,200,0.80)');
    ctx.beginPath();
    ctx.arc(px, py, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisGrd;
    ctx.fill();

    // Pupil — dilates with voice
    var dilate = 1 + voiceLevel * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, pupilR * dilate, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,5,20,0.96)';
    ctx.fill();

    // Specular highlight
    ctx.beginPath();
    ctx.arc(px - pupilR * 0.28, py - pupilR * 0.32, pupilR * 0.20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();

    ctx.restore();

    // Eye outline glow (drawn outside clip)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - eyeW / 2, cy);
    ctx.quadraticCurveTo(cx, cy - eyeH * 1.1, cx + eyeW / 2, cy);
    ctx.quadraticCurveTo(cx, cy + eyeH * 0.9,  cx - eyeW / 2, cy);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(120,180,255,' + (0.25 + voiceLevel * 0.3).toFixed(2) + ')';
    ctx.lineWidth = 0.8 * dpr;
    ctx.stroke();
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
