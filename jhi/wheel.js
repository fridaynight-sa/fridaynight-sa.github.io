/* جماد حيوان إنسان — the letter wheel (shared by the game and the TV screen).
   The golden frame and its bulbs are the owner's picture (frame.png); the coloured slices and the letters are drawn
   here so they turn and stay exact. Every phone turns the same way: the host sends {idx, turns, off, dur} and the
   wheel lands with slice idx under the pointer, off (−0.38…0.38 of a slice) away from its middle.
   JHW.html(letters, base) → markup · JHW.set(el, angle, sel) · JHW.spin(el, spin, onTick) → Promise */
(function () {
  "use strict";
  const PAL = ["#ff6b6b", "#ff922b", "#fcc419", "#51cf66", "#22b8cf", "#339af0", "#845ef7", "#f06595"];
  const C = 320, R = 258, RT = 186;
  const WIDE = "سشصضطظ";
  const pt = (r, a) => (C + r * Math.sin(a)).toFixed(2) + " " + (C - r * Math.cos(a)).toFixed(2);
  const show = l => l === "ا" ? "أ" : l;
  function html(letters, base) {
    const n = letters.length, seg = 2 * Math.PI / n;
    let s = "";
    letters.forEach((l, i) => {
      const a0 = (i - .5) * seg, a1 = (i + .5) * seg;
      s += `<path class="sl" data-i="${i}" d="M${C} ${C}L${pt(R, a0)}A${R} ${R} 0 0 1 ${pt(R, a1)}Z" fill="${PAL[i % PAL.length]}"/>`;
    });
    letters.forEach((l, i) => { s += `<text class="lt${WIDE.includes(l) ? " w" : ""}" data-i="${i}" transform="rotate(${(i * 360 / n).toFixed(3)} ${C} ${C})" x="${C}" y="${C - RT}">${show(l)}</text>`; });
    return `<svg class="jhw" viewBox="0 0 640 640" role="img" aria-label="عجلة الحروف"><defs>
      <radialGradient id="jhwsh" cx="50%" cy="50%" r="50%"><stop offset=".22" stop-color="#fff" stop-opacity=".30"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
      <filter id="jhwgl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <circle cx="${C}" cy="${C}" r="${R + 4}" fill="#2b1745"/>
      <g class="rot" style="transform-origin:${C}px ${C}px">${s}<circle cx="${C}" cy="${C}" r="${R}" fill="url(#jhwsh)" pointer-events="none"/></g>
      <image class="frm" href="${base || ""}frame.png" x="0" y="0" width="640" height="640"/>
      <text class="hub" x="${C}" y="${C + 2}">؟</text></svg>`;
  }
  const rot = el => el.querySelector(".rot");
  function set(el, angle, sel) {
    const g = rot(el); if (!g) return;
    g.style.transform = `rotate(${angle}deg)`; el._a = angle;
    el.querySelectorAll(".sl.on,.lt.on").forEach(x => x.classList.remove("on"));
    const hub = el.querySelector(".hub");
    if (sel != null && sel >= 0) {
      el.querySelectorAll(`[data-i="${sel}"]`).forEach(x => x.classList.add("on"));
      const t = el.querySelector(`.lt[data-i="${sel}"]`); if (hub && t) hub.textContent = t.textContent;
    } else if (hub) hub.textContent = "؟";
  }
  // where the wheel ends: the chosen slice under the pointer (top), a few whole turns on
  const finalAngle = (n, sp) => 360 * sp.turns - (sp.idx + sp.off) * 360 / n;
  // spin from where it stands now; ease out like a real wheel; onTick on every slice that passes the pointer
  function spin(el, sp, n, onTick, elapsed) {
    return new Promise(res => {
      const g = rot(el); if (!g) { res(); return; }
      const end = finalAngle(n, sp), dur = sp.dur, seg = 360 / n;
      let from = ((el._a || 0) % 360 + 360) % 360;
      if (from > end) from -= 360 * Math.ceil((from - end) / 360);
      const t0 = performance.now() - (elapsed || 0);
      if ((elapsed || 0) >= dur) { set(el, end, sp.idx); res(); return; }
      el.classList.add("spinning"); set(el, from, -1);
      let last = Math.floor((from + seg / 2) / seg);
      const ease = t => 1 - Math.pow(1 - t, 4);
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), a = from + (end - from) * ease(t);
        g.style.transform = `rotate(${a}deg)`; el._a = a;
        const k = Math.floor((a + seg / 2) / seg); if (k !== last) { last = k; if (onTick) onTick(); }
        if (t < 1) requestAnimationFrame(step);
        else { el.classList.remove("spinning"); set(el, end, sp.idx); res(); }
      };
      requestAnimationFrame(step);
    });
  }
  self.JHW = { html, set, spin, finalAngle, show };
})();
