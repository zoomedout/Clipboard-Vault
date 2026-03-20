/* ── Universe Background — Photo-realistic starfield with Milky Way ── */
(() => {
  const canvas = document.getElementById('universe');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  const resize = () => {
    W = canvas.width = innerWidth;
    H = canvas.height = innerHeight;
    renderStaticLayer();
  };

  // --- Static starfield (pre-rendered once) ---
  let staticCanvas = document.createElement('canvas');
  let staticCtx = staticCanvas.getContext('2d');

  // Milky Way band parameters (horizontal, slightly tilted)
  const MW_ANGLE = -0.12; // slight tilt in radians
  const MW_CENTER_Y = 0.42; // vertical center as fraction of height
  const MW_WIDTH = 0.22; // width as fraction of height

  // Check if point is inside milky way band (returns 0-1 density)
  function milkyWayDensity(x, y) {
    // Rotate point to align with band
    const cx = W / 2, cy = H * MW_CENTER_Y;
    const dx = x - cx, dy = y - cy;
    const rotY = -dx * Math.sin(MW_ANGLE) + dy * Math.cos(MW_ANGLE);
    const bandHalf = H * MW_WIDTH / 2;
    const dist = Math.abs(rotY) / bandHalf;
    if (dist > 1.5) return 0;
    // Gaussian-like falloff
    return Math.exp(-dist * dist * 2.5);
  }

  function renderStaticLayer() {
    staticCanvas.width = W;
    staticCanvas.height = H;

    // Pure black background
    staticCtx.fillStyle = '#000000';
    staticCtx.fillRect(0, 0, W, H);

    // --- Layer 1: Milky Way diffuse glow ---
    // Multiple overlapping soft blobs to create the cloudy band
    const mwBlobs = 60;
    for (let i = 0; i < mwBlobs; i++) {
      const bx = Math.random() * W;
      const by = H * MW_CENTER_Y + (Math.random() - 0.5) * H * MW_WIDTH * 0.8;
      // Rotate position with band angle
      const rx = bx + (by - H * MW_CENTER_Y) * Math.sin(MW_ANGLE) * 0.5;
      const ry = by;
      const radius = 60 + Math.random() * 180;
      const alpha = 0.008 + Math.random() * 0.015;
      const g = staticCtx.createRadialGradient(rx, ry, 0, rx, ry, radius);
      // Slightly warm white
      g.addColorStop(0, `rgba(220, 215, 210, ${alpha})`);
      g.addColorStop(0.5, `rgba(200, 198, 195, ${alpha * 0.4})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      staticCtx.fillStyle = g;
      staticCtx.beginPath();
      staticCtx.arc(rx, ry, radius, 0, Math.PI * 2);
      staticCtx.fill();
    }

    // --- Layer 2: Dark dust lanes within Milky Way ---
    const dustLanes = 25;
    for (let i = 0; i < dustLanes; i++) {
      const dx = Math.random() * W;
      const dy = H * MW_CENTER_Y + (Math.random() - 0.5) * H * MW_WIDTH * 0.5;
      const radius = 30 + Math.random() * 100;
      const alpha = 0.03 + Math.random() * 0.06;
      const g = staticCtx.createRadialGradient(dx, dy, 0, dx, dy, radius);
      g.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      staticCtx.fillStyle = g;
      staticCtx.beginPath();
      staticCtx.arc(dx, dy, radius, 0, Math.PI * 2);
      staticCtx.fill();
    }

    // --- Layer 3: Stars ---
    // Distribution: 80% faint, 15% medium, 5% bright
    const TOTAL_STARS = 12000;
    stars.length = 0;

    for (let i = 0; i < TOTAL_STARS; i++) {
      let x = Math.random() * W;
      let y = Math.random() * H;

      // Density weighting — stars cluster in Milky Way
      const mwD = milkyWayDensity(x, y);
      // 40% chance to redistribute into MW band
      if (Math.random() > 0.4 + mwD * 0.5) {
        // Re-roll closer to Milky Way
        y = H * MW_CENTER_Y + (Math.random() - 0.5) * H * MW_WIDTH * 1.2;
        x = Math.random() * W;
      }

      const roll = Math.random();
      let radius, alpha;
      const colorRoll = Math.random();
      let r, g, b;

      // Color: mostly white, some warm, rare blue
      if (colorRoll < 0.65) {
        r = 255; g = 255; b = 255; // pure white
      } else if (colorRoll < 0.85) {
        r = 255; g = 245; b = 220; // warm
      } else if (colorRoll < 0.95) {
        r = 220; g = 230; b = 255; // cool blue
      } else {
        r = 255; g = 220; b = 200; // orange-ish
      }

      if (roll < 0.80) {
        // Faint — tiny sharp dots
        radius = 0.3 + Math.random() * 0.4;
        alpha = 0.15 + Math.random() * 0.35;
      } else if (roll < 0.95) {
        // Medium
        radius = 0.5 + Math.random() * 0.6;
        alpha = 0.5 + Math.random() * 0.3;
      } else {
        // Bright — still small but fully opaque
        radius = 0.7 + Math.random() * 0.8;
        alpha = 0.8 + Math.random() * 0.2;
      }

      // Boost brightness inside Milky Way
      alpha = Math.min(1, alpha + mwD * 0.15);

      // Draw sharp dot (no gradient for most)
      staticCtx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      staticCtx.fillRect(x - radius / 2, y - radius / 2, radius, radius);

      // Bright stars get a tiny cross spike (not a glow)
      if (roll > 0.97 && radius > 0.8) {
        const spikeLen = radius * 3 + Math.random() * 2;
        const spikeAlpha = alpha * 0.3;
        staticCtx.strokeStyle = `rgba(${r},${g},${b},${spikeAlpha})`;
        staticCtx.lineWidth = 0.5;
        // Horizontal spike
        staticCtx.beginPath();
        staticCtx.moveTo(x - spikeLen, y);
        staticCtx.lineTo(x + spikeLen, y);
        staticCtx.stroke();
        // Vertical spike
        staticCtx.beginPath();
        staticCtx.moveTo(x, y - spikeLen);
        staticCtx.lineTo(x, y + spikeLen);
        staticCtx.stroke();
      }

      // Store for mouse interaction (only brighter stars to save perf)
      if (alpha > 0.15) {
        stars.push({ x, y, radius: Math.max(radius, 0.5), brightness: alpha });
      }
    }
  }

  // Stars array for mouse interaction
  const stars = [];

  // --- Mouse interaction ---
  const mouse = { x: -1000, y: -1000, active: false };
  const CONNECT_RADIUS = 180;
  const MAX_CONNECTIONS = 10;

  addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });
  addEventListener('mouseleave', () => { mouse.active = false; });
  addEventListener('touchmove', e => {
    const t = e.touches[0];
    mouse.x = t.clientX;
    mouse.y = t.clientY;
    mouse.active = true;
  });
  addEventListener('touchend', () => { mouse.active = false; });

  function drawConnections() {
    if (!mouse.active) return;

    const nearby = [];
    for (const s of stars) {
      const dx = s.x - mouse.x;
      const dy = s.y - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECT_RADIUS) {
        nearby.push({ star: s, dist });
      }
    }
    nearby.sort((a, b) => a.dist - b.dist);
    const connected = nearby.slice(0, MAX_CONNECTIONS);

    for (const { star, dist } of connected) {
      const alpha = (1 - dist / CONNECT_RADIUS) * 0.4;
      ctx.strokeStyle = `rgba(180, 200, 255, ${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(mouse.x, mouse.y);
      ctx.lineTo(star.x, star.y);
      ctx.stroke();

      // Subtle brightening of connected star
      const glowR = star.radius * 4;
      const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowR);
      grad.addColorStop(0, `rgba(200, 210, 255, ${alpha * 0.4})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(star.x, star.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (connected.length >= 2) {
      for (let i = 0; i < connected.length - 1; i++) {
        for (let j = i + 1; j < connected.length; j++) {
          const a = connected[i].star;
          const b = connected[j].star;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECT_RADIUS * 1.2) {
            const alpha = (1 - d / (CONNECT_RADIUS * 1.2)) * 0.15;
            ctx.strokeStyle = `rgba(160, 180, 255, ${alpha})`;
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
    }

    // Subtle cursor glow
    const cg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, CONNECT_RADIUS * 0.6);
    cg.addColorStop(0, 'rgba(100, 140, 255, 0.03)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, CONNECT_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Shooting stars ---
  const shootingStars = [];
  function maybeSpawnShootingStar() {
    if (Math.random() < 0.012 && shootingStars.length < 3) {
      const angle = -Math.PI / 6 + Math.random() * -Math.PI / 4;
      shootingStars.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.5,
        vx: Math.cos(angle) * (5 + Math.random() * 4),
        vy: -Math.sin(angle) * (5 + Math.random() * 4),
        life: 1,
        decay: 0.018 + Math.random() * 0.012,
        len: 30 + Math.random() * 50,
      });
    }
  }
  function updateShootingStars() {
    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.x += s.vx;
      s.y += s.vy;
      s.life -= s.decay;
      if (s.life <= 0) { shootingStars.splice(i, 1); continue; }
      const alpha = s.life * 0.7;
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const tailX = s.x - s.vx * (s.len / speed) * s.life;
      const tailY = s.y - s.vy * (s.len / speed) * s.life;
      const grad = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }
  }

  // --- Main loop ---
  // Only redraws dynamic elements (mouse, shooting stars) over static bg
  let needsDynamic = false;

  function frame() {
    // Draw static starfield
    ctx.drawImage(staticCanvas, 0, 0);

    // Dynamic overlays
    maybeSpawnShootingStar();
    updateShootingStars();
    drawConnections();

    requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
