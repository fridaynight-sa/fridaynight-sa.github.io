/* لمحة — everything on the screen is drawn here (no picture files):
   cars (pairs that look more or less alike), the yellow star, shapes that look like it,
   the backgrounds (plain, desert road, city, countryside) and the noise that covers it all. */
(function () {
  "use strict";
  const R = Math.random;

  /* ---------- cars (side view, front to the right) ----------
     every car is the same body and wheels; the cabin shape is what tells them apart.
     Points are in car widths (x: -0.5…0.5, y: up is negative). */
  const CABIN = {
    sedan:  { cab: [[-0.30, -0.02], [-0.19, -0.17], [0.11, -0.17], [0.24, -0.02]], pillars: [-0.04] },
    coupe:  { cab: [[-0.24, -0.02], [-0.10, -0.15], [0.06, -0.15], [0.27, -0.02]], pillars: [] },
    hatch:  { cab: [[-0.40, -0.02], [-0.37, -0.17], [0.10, -0.17], [0.24, -0.02]], pillars: [-0.10] },
    suv:    { cab: [[-0.45, -0.02], [-0.44, -0.23], [0.13, -0.23], [0.27, -0.02]], pillars: [-0.25, -0.05], tall: true },
    van:    { cab: [[-0.47, -0.02], [-0.47, -0.27], [0.22, -0.27], [0.40, -0.02]], pillars: [-0.26, -0.03, 0.18], tall: true },
    pickup: { cab: [[-0.04, -0.02], [-0.04, -0.19], [0.13, -0.19], [0.27, -0.02]], pillars: [], bed: true },
  };
  const NAMES = Object.keys(CABIN);
  // pairs from very alike to clearly different, mixed at random in every session
  const PAIRS = [["sedan", "coupe"], ["coupe", "hatch"], ["suv", "van"], ["hatch", "suv"], ["sedan", "pickup"], ["van", "pickup"]];
  const CAR_COLORS = ["#e03131", "#1971c2", "#2b8a3e", "#e8590c", "#9c36b5", "#868e96", "#f1f3f5"];

  function poly(ctx, pts, cx, cy, W) { ctx.beginPath(); pts.forEach(([x, y], i) => { const X = cx + x * W, Y = cy + y * W; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); }
  function inset(pts, d) { // shrink a cabin outline toward its middle (for the glass)
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return pts.map(([x, y]) => [x + Math.sign(mx - x) * d * 1.3, y + Math.sign(my - y) * d]);
  }
  function drawCar(ctx, type, color, cx, cy, W) {
    const c = CABIN[type], dark = "#1a1d29", lw = Math.max(1.5, W * 0.018);
    ctx.save(); ctx.lineJoin = "round"; ctx.lineWidth = lw; ctx.strokeStyle = dark;
    // shadow on the ground
    ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(cx, cy + W * 0.235, W * 0.5, W * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    // cabin
    ctx.fillStyle = color; poly(ctx, c.cab, cx, cy, W); ctx.fill(); ctx.stroke();
    // glass + pillars
    ctx.fillStyle = "#a5d8ff"; poly(ctx, inset(c.cab, 0.022), cx, cy, W); ctx.fill();
    ctx.save(); poly(ctx, c.cab, cx, cy, W); ctx.clip();   // posts stay inside the cabin
    ctx.fillStyle = color; c.pillars.forEach(px => ctx.fillRect(cx + px * W - W * 0.012, cy - W * 0.3, W * 0.024, W * 0.29));
    ctx.restore();
    // body
    const top = c.tall ? -0.03 : -0.02, bot = 0.15;
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(cx - W * 0.49, cy + top * W, W * 0.98, (bot - top) * W, W * 0.05); ctx.fill(); ctx.stroke();
    if (c.bed) { ctx.strokeStyle = dark; ctx.beginPath(); ctx.moveTo(cx - W * 0.47, cy - W * 0.07); ctx.lineTo(cx - W * 0.06, cy - W * 0.07); ctx.lineTo(cx - W * 0.06, cy - W * 0.02); ctx.moveTo(cx - W * 0.47, cy - W * 0.07); ctx.lineTo(cx - W * 0.47, cy - W * 0.02); ctx.stroke(); }
    // lights + door line
    ctx.fillStyle = "#ffe8a3"; ctx.fillRect(cx + W * 0.44, cy + W * 0.0, W * 0.045, W * 0.04);
    ctx.fillStyle = "#c92a2a"; ctx.fillRect(cx - W * 0.485, cy + W * 0.0, W * 0.035, W * 0.045);
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(cx - W * 0.02, cy + W * 0.0); ctx.lineTo(cx - W * 0.02, cy + W * 0.12); ctx.stroke();
    // wheels
    [-0.3, 0.3].forEach(wx => {
      ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(cx + wx * W, cy + W * 0.15, W * 0.085, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#adb5bd"; ctx.beginPath(); ctx.arc(cx + wx * W, cy + W * 0.15, W * 0.038, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }
  // a car on its own little picture (for the answer buttons)
  function carImage(type, color, w) {
    const cv = document.createElement("canvas"), dpr = Math.min(2, self.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * 0.62 * dpr);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    drawCar(ctx, type, color, w / 2, w * 0.36, w * 0.9);
    return cv.toDataURL();
  }

  /* ---------- the star and the shapes that look like it ---------- */
  function starPath(ctx, x, y, r, n, inner) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  function ngon(ctx, x, y, r, n, rot) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * 2 * Math.PI / n; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); }
  function drawShape(ctx, kind, x, y, r) {
    ctx.save(); ctx.lineJoin = "round"; ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = "#3b2a00";
    const fills = { star: "#ffd43b", star4: "#ffd43b", star6: "#fcc419", tri: "#ffe066", penta: "#fab005", dot: "#ffe066", wstar: "#f8f9fa" };
    ctx.fillStyle = fills[kind] || "#ffd43b";
    if (kind === "star") starPath(ctx, x, y, r, 5, 0.45);
    else if (kind === "wstar") starPath(ctx, x, y, r, 5, 0.45);
    else if (kind === "star4") starPath(ctx, x, y, r, 4, 0.42);
    else if (kind === "star6") starPath(ctx, x, y, r, 6, 0.55);
    else if (kind === "tri") ngon(ctx, x, y, r * 0.95, 3, -Math.PI / 2);
    else if (kind === "penta") ngon(ctx, x, y, r * 0.85, 5, -Math.PI / 2);
    else { ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, Math.PI * 2); }
    ctx.fill(); ctx.stroke(); ctx.restore();
  }
  const DISTRACTORS = ["star4", "tri", "penta", "dot", "wstar"];   // look-alikes, each one clearly not the yellow 5-point star

  /* ---------- backgrounds ---------- */
  const BGS = ["plain", "desert", "city", "country"];
  function drawBg(ctx, kind, S) {
    const g = (y0, y1, a, b) => { const l = ctx.createLinearGradient(0, y0, 0, y1); l.addColorStop(0, a); l.addColorStop(1, b); return l; };
    if (kind === "desert") {
      ctx.fillStyle = g(0, S * 0.45, "#e9b872", "#f3d19c"); ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = "#d39a5c"; ctx.beginPath(); ctx.moveTo(0, S * 0.42);
      for (let x = 0; x <= S; x += S / 8) ctx.quadraticCurveTo(x + S / 16, S * (0.36 + R() * 0.05), x + S / 8, S * 0.42);
      ctx.lineTo(S, S); ctx.lineTo(0, S); ctx.fill();
      ctx.fillStyle = "#c98b4f"; ctx.fillRect(0, S * 0.55, S, S * 0.45);
      ctx.fillStyle = "#5c5f66"; ctx.beginPath(); ctx.moveTo(S * 0.47, S * 0.42); ctx.lineTo(S * 0.53, S * 0.42); ctx.lineTo(S * 0.8, S); ctx.lineTo(S * 0.2, S); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.75)"; for (let y = S * 0.46; y < S; y += S * 0.09) { const k = (y - S * 0.42) / (S * 0.58); ctx.fillRect(S / 2 - S * 0.004 * (1 + k * 3), y, S * 0.008 * (1 + k * 3), S * 0.035 * (0.5 + k)); }
    } else if (kind === "city") {
      ctx.fillStyle = g(0, S, "#141a3a", "#2a2f5a"); ctx.fillRect(0, 0, S, S);
      for (let layer = 0; layer < 2; layer++) {
        let x = -10; while (x < S) {
          const w = S * (0.06 + R() * 0.08), h = S * (layer ? 0.25 + R() * 0.3 : 0.4 + R() * 0.35);
          ctx.fillStyle = layer ? "#2e3566" : "#20264d"; ctx.fillRect(x, S - h, w, h);
          ctx.fillStyle = "rgba(255,224,102,.28)";
          for (let wy = S - h + 8; wy < S - 8; wy += S * 0.035) for (let wx = x + 5; wx < x + w - 6; wx += S * 0.025) if (R() < 0.45) ctx.fillRect(wx, wy, S * 0.01, S * 0.014);
          x += w + S * 0.01;
        }
      }
    } else if (kind === "country") {
      ctx.fillStyle = g(0, S * 0.5, "#8ecae6", "#cfe9f5"); ctx.fillRect(0, 0, S, S);
      const hill = (y, col, amp) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, S * y); for (let x = 0; x <= S; x += S / 6) ctx.quadraticCurveTo(x + S / 12, S * (y - amp * R()), x + S / 6, S * y); ctx.lineTo(S, S); ctx.lineTo(0, S); ctx.fill(); };
      hill(0.42, "#7cb87c", 0.08); hill(0.55, "#5fa35f", 0.06); hill(0.72, "#4c8f4c", 0.05);
      ctx.strokeStyle = "rgba(90,60,30,.55)"; ctx.lineWidth = 2;
      for (let x = S * 0.03; x < S; x += S * 0.07) { ctx.beginPath(); ctx.moveTo(x, S * 0.86); ctx.lineTo(x, S * 0.93); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, S * 0.88); ctx.lineTo(S, S * 0.88); ctx.stroke();
    } else {
      const r = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.75); r.addColorStop(0, "#28306a"); r.addColorStop(1, "#0d1230");
      ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
    }
  }

  /* ---------- the noise that covers the picture right after it shows ---------- */
  function makeMask(S, dpr) {
    const cv = document.createElement("canvas"); cv.width = Math.round(S * dpr); cv.height = Math.round(S * dpr);
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    const cell = Math.max(6, Math.round(S / 45)), cols = ["#111", "#333", "#666", "#999", "#ccc", "#fff", "#ffd43b", "#fab005", "#1971c2", "#e03131", "#2b8a3e"];
    for (let y = 0; y < S; y += cell) for (let x = 0; x < S; x += cell) { ctx.fillStyle = cols[(R() * cols.length) | 0]; ctx.fillRect(x, y, cell, cell); }
    for (let i = 0; i < 26; i++) drawShape(ctx, ["star", "star4", "star6", "tri", "penta"][(R() * 5) | 0], R() * S, R() * S, S * (0.02 + R() * 0.03));
    return cv;
  }

  self.LamhaDraw = { NAMES, PAIRS, CAR_COLORS, DISTRACTORS, BGS, drawCar, carImage, drawShape, drawBg, makeMask };
})();
