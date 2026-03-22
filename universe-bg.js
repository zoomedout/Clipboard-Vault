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

  function renderStaticLayer() {
    staticCanvas.width = W;
    staticCanvas.height = H;

    // Pure black background
    staticCtx.fillStyle = '#000000';
    staticCtx.fillRect(0, 0, W, H);

    // --- Stars ---
    const TOTAL_STARS = 2000;
    stars.length = 0;

    for (let i = 0; i < TOTAL_STARS; i++) {
      let x = Math.random() * W;
      let y = Math.random() * H;

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

      const sizeScale = isMobile ? 1.4 : 1;
      if (roll < 0.65) {
        // Faint — tiny sharp dots
        radius = (0.4 + Math.random() * 0.5) * sizeScale;
        alpha = 0.3 + Math.random() * 0.4;
      } else if (roll < 0.90) {
        // Medium
        radius = (0.6 + Math.random() * 0.7) * sizeScale;
        alpha = 0.6 + Math.random() * 0.3;
      } else {
        // Bright
        radius = (0.9 + Math.random() * 0.9) * sizeScale;
        alpha = 0.85 + Math.random() * 0.15;
      }


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
  const isMobile = window.innerWidth < 768;
  const CONNECT_RADIUS = isMobile ? 300 : 180;
  const MAX_CONNECTIONS = isMobile ? 20 : 10;

  addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });
  addEventListener('mouseleave', () => { mouse.active = false; });
  addEventListener('touchstart', e => {
    const t = e.touches[0];
    mouse.x = t.clientX;
    mouse.y = t.clientY;
    mouse.active = true;
  });
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
      const alpha = (1 - dist / CONNECT_RADIUS) * 0.8;
      ctx.strokeStyle = `rgba(180, 200, 255, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mouse.x, mouse.y);
      ctx.lineTo(star.x, star.y);
      ctx.stroke();

      // Brightening of connected star
      const glowR = star.radius * 6;
      const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowR);
      grad.addColorStop(0, `rgba(200, 210, 255, ${alpha * 0.6})`);
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
            const alpha = (1 - d / (CONNECT_RADIUS * 1.2)) * 0.4;
            ctx.strokeStyle = `rgba(160, 180, 255, ${alpha})`;
            ctx.lineWidth = 0.7;
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
    cg.addColorStop(0, 'rgba(100, 140, 255, 0.08)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, CONNECT_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Shooting stars (continuous, slow, staggered) ---
  const shootingStars = [];
  let lastSpawnTime = 0;
  const SPAWN_INTERVAL = 2500; // ms between spawns

  function maybeSpawnShootingStar(now) {
    if (now - lastSpawnTime > SPAWN_INTERVAL && shootingStars.length < 2) {
      lastSpawnTime = now;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.7 + Math.random() * 0.8;
      shootingStars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.004 + Math.random() * 0.004,
        len: 50 + Math.random() * 70,
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

  function frame(ts) {
    // Draw static starfield
    ctx.drawImage(staticCanvas, 0, 0);

    // Dynamic overlays
    maybeSpawnShootingStar(ts || 0);
    updateShootingStars();
    drawConnections();

    requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
