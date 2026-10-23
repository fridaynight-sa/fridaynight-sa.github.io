/* ارسم وخمّن — drawing board shared by the game page and the TV screen.
   Strokes use a fixed 1000×750 space so every screen draws the same picture:
   {c: color, w: width, p: [x0, y0, x1, y1, …]} (ints).
   A fill (🪣) is {f: 1, c: color, p: [x, y]}: it paints the area around that point, like a paint bucket. */
(function () {
  "use strict";
  const W = 1000, H = 750;
  function Board(canvas, fixedW) {   // fixedW: a picture of that many pixels wide, not tied to the screen
    const ctx = canvas.getContext("2d", { willReadFrequently: true }), ctxMain = ctx;
    let strokes = [], live = null, ratio = 1;
    // everything but the last stroke is kept painted on a spare canvas, so a stroke that is still
    // being drawn (or a fill) doesn't make every earlier fill run again
    const base = document.createElement("canvas"), bctx = base.getContext("2d", { willReadFrequently: true });
    let baseSig = null;
    function fit() {
      if (fixedW) { canvas.width = fixedW; canvas.height = Math.round(fixedW * H / W); ratio = fixedW / W; paint(); return; }
      const r = canvas.getBoundingClientRect(), dpr = Math.min(2, self.devicePixelRatio || 1);
      if (!r.width) return;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.width * H / W * dpr);
      ratio = canvas.width / W; paint();
    }
    // paint bucket: the touching area of the same colour (with some tolerance for soft line edges)
    function fill(c, s) {
      const p = s.p || []; if (p.length < 2) return;
      const w = c.canvas.width, h = c.canvas.height, x0 = Math.round(p[0] * ratio), y0 = Math.round(p[1] * ratio);
      if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;
      const img = c.getImageData(0, 0, w, h), d = img.data, i0 = (y0 * w + x0) * 4;
      const r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
      const hex = /^#[0-9a-f]{6}$/i.test(s.c || "") ? s.c : "#2b1745";
      const R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16);
      if (Math.abs(R - r0) + Math.abs(G - g0) + Math.abs(B - b0) < 6) return;
      const near = i => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 150;
      const done = new Uint8Array(w * h), stack = [x0, y0];
      while (stack.length) {
        const y = stack.pop(); let x = stack.pop();
        while (x > 0 && !done[y * w + x - 1] && near((y * w + x - 1) * 4)) x--;
        let up = false, dn = false;
        for (; x < w; x++) {
          const k = y * w + x; if (done[k] || !near(k * 4)) break;
          done[k] = 1; d[k * 4] = R; d[k * 4 + 1] = G; d[k * 4 + 2] = B; d[k * 4 + 3] = 255;
          if (y > 0) { const u = !done[k - w] && near((k - w) * 4); if (u && !up) stack.push(x, y - 1); up = u; }
          if (y < h - 1) { const v = !done[k + w] && near((k + w) * 4); if (v && !dn) stack.push(x, y + 1); dn = v; }
        }
      }
      c.putImageData(img, 0, 0);
    }
    function line(s, c) {
      const ctx = c || ctxMain;
      if (s.f) return fill(ctx, s);
      const p = s.p || []; if (p.length < 2) return;
      ctx.strokeStyle = s.c || "#2b1745"; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = (s.w || 6) * ratio;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] * ratio, p[1] * ratio, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(p[0] * ratio, p[1] * ratio);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * ratio, p[i + 1] * ratio);
      ctx.stroke();
    }
    function paint() {
      const n = Math.max(0, strokes.length - 1), sig = canvas.width + "x" + canvas.height + ":" + n + ":" + (n ? JSON.stringify(strokes[n - 1]) : "");   // strokes only change at the end (new, undo, clear)
      if (sig !== baseSig) {
        base.width = canvas.width; base.height = canvas.height;
        bctx.fillStyle = "#ffffff"; bctx.fillRect(0, 0, base.width, base.height);
        strokes.slice(0, n).forEach(s => line(s, bctx)); baseSig = sig;
      }
      ctx.drawImage(base, 0, 0);
      if (strokes.length) line(strokes[strokes.length - 1]);
      if (live) line(live);
    }
    // turn a pointer event into board coordinates
    function at(e) {
      const r = canvas.getBoundingClientRect();
      return [Math.max(0, Math.min(W, Math.round((e.clientX - r.left) / r.width * W))), Math.max(0, Math.min(H, Math.round((e.clientY - r.top) / r.height * H)))];
    }
    if (fixedW) {} else if (self.ResizeObserver) new ResizeObserver(fit).observe(canvas); else addEventListener("resize", fit);
    fit();
    return {
      set(list) { strokes = list || []; paint(); },
      live(s) { live = s; paint(); },
      at, fit,
      get strokes() { return strokes; }
    };
  }
  // {s0001: {j}, …} -> [stroke, …] in drawing order
  function parse(v, dec) { return Object.keys(v || {}).sort().map(k => dec(v[k])).filter(s => s && Array.isArray(s.p)); }
  // the finished drawing as a small JPEG (for the gallery at the end)
  function snapshot(list, w, q) { const c = document.createElement("canvas"), b = Board(c, w || 480); b.set(list); return c.toDataURL("image/jpeg", q || 0.75); }
  self.DrawBoard = { Board, parse, snapshot, W, H };
})();
