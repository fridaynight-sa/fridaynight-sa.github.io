// توصيل النقاط: levels check, solving by finger, cut/restart rules, hint, time up, pause, results, backup, layouts
const H = require('./h.js');
const OUT = __dirname + '/';
const ok = (c, m, errs) => { if (!c) errs.push('FAIL ' + m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
(async () => {
  const b = await H.launch(); const errs = [];
  const pg = await H.player(b, errs, 'p1');
  await pg.goto(H.BASE + 'mind/dots/'); await pg.waitForSelector('[data-act=start]');
  await pg.screenshot({ path: OUT + 'dt-intro.png', fullPage: true });
  const ov = async (p, tag) => { const o = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(o[0] <= o[1], tag + ' no sideways overflow ' + o, errs); };
  await ov(pg, 'intro');

  // 1) every level: the stored solution joins each pair and fills the board exactly once
  const lv = await pg.evaluate(() => {
    const bad = []; const sizes = {};
    for (let l = 1; l <= DOTS.TOTAL; l++) {
      const p = DOTS.parse(l), seen = new Set(); sizes[p.n] = (sizes[p.n] || 0) + 1;
      p.sol.forEach((s, c) => {
        if (!p.ends[c].includes(s[0]) || !p.ends[c].includes(s[s.length - 1]) || s[0] === s[s.length - 1]) bad.push(l + ' ends');
        s.forEach((x, i) => { if (seen.has(x)) bad.push(l + ' twice'); seen.add(x); if (i && !p.nb(s[i - 1]).includes(x)) bad.push(l + ' jump'); });
      });
      if (seen.size !== p.n * p.n) bad.push(l + ' not full');
      if (new Set(p.cols).size !== p.k) bad.push(l + ' colours');
    }
    return { bad: bad.slice(0, 5), n: bad.length, sizes };
  });
  ok(lv.n === 0, 'all 400 levels valid ' + JSON.stringify(lv.sizes) + ' ' + lv.bad.join(','), errs);

  // helpers: finger on a cell, drag through cells
  const cellXY = async (p, i) => p.evaluate(i => { const P = DOTS.P, cv = document.getElementById('cv'), r = cv.getBoundingClientRect(), cs = r.width / P.n; return [r.left + (i % P.n) * cs + cs / 2, r.top + Math.floor(i / P.n) * cs + cs / 2]; }, i);
  async function dragCells(p, cells) {
    let [x, y] = await cellXY(p, cells[0]); await p.mouse.move(x, y); await p.mouse.down();
    for (const c of cells.slice(1)) { [x, y] = await cellXY(p, c); await p.mouse.move(x, y, { steps: 3 }); }
    await p.mouse.up();
  }
  const state = p => p.evaluate(() => ({ paths: DOTS.P.paths.map(x => x.slice()), solved: DOTS.P.solved, lv: DOTS.P.lv, n: DOTS.P.n, score: DOTS.S && DOTS.S.score, level: DOTS.G.level, msg: document.getElementById('pm').textContent }));
  async function solveAll(p) { const sol = await p.evaluate(() => DOTS.P.sol); for (const s of sol) await dragCells(p, s); }

  // 2) start: screen locked, puzzle 1 solved by finger
  await pg.click('[data-act=start]'); await pg.waitForSelector('#cv');
  const lock = await pg.evaluate(() => { scrollTo(0, 400); return { y: scrollY, playing: document.body.classList.contains('playing'), pos: getComputedStyle(document.body).position, ta: getComputedStyle(document.getElementById('cv')).touchAction }; });
  ok(lock.y === 0 && lock.playing && lock.pos === 'fixed' && lock.ta === 'none', 'screen does not move while playing ' + JSON.stringify(lock), errs);
  await pg.screenshot({ path: OUT + 'dt-play1.png' });
  let s0 = await state(pg); ok(s0.lv === 1 && s0.n === 5, 'session starts at level 1 (5x5)', errs);
  await solveAll(pg);
  let s1 = await state(pg); ok(s1.solved && s1.level === 2 && s1.score > 0, 'level 1 solved by finger, level → 2, score ' + s1.score, errs);
  await pg.screenshot({ path: OUT + 'dt-solved.png' });
  await pg.waitForFunction(() => DOTS.P && DOTS.P.lv === 2 && !DOTS.P.solved, null, { timeout: 4000 });
  ok((await pg.textContent('#pi')) === '2 من 2', 'counter shows 2 من 2', errs);

  // 3) the touch rules on level 2
  const sol2 = await pg.evaluate(() => ({ sol: DOTS.P.sol, ends: DOTS.P.ends }));
  const long = sol2.sol.map((s, c) => [s.length, c]).sort((a, b) => b[0] - a[0])[0][1], L = sol2.sol[long];
  await dragCells(pg, L.slice(0, L.length - 1));                       // stop one short
  let s2 = await state(pg); ok(s2.paths[long].length === L.length - 1, 'line drawn and kept (' + s2.paths[long].length + ' cells)', errs);
  // touch the middle of the line: it is cut there
  const mid = L[2]; let [mx, my] = await cellXY(pg, mid); await pg.mouse.move(mx, my); await pg.mouse.down(); await pg.mouse.up();
  s2 = await state(pg); ok(s2.paths[long].length === 3 && s2.paths[long][2] === mid, 'touch middle of a line → cut there', errs);
  // touch its dot: the line starts again
  [mx, my] = await cellXY(pg, L[0]); await pg.mouse.move(mx, my); await pg.mouse.down(); await pg.mouse.up();
  s2 = await state(pg); ok(s2.paths[long].length === 1, 'touch the dot → line starts again', errs);
  // another colour's dot blocks; crossing a line cuts it, and it comes back when you go back
  const other = sol2.sol.findIndex((s, c) => c !== long && s.length >= 3);
  await dragCells(pg, sol2.sol[other]);
  const o = sol2.sol[other], cross = o[1];
  const nbs = await pg.evaluate(x => DOTS.P.nb(x), cross);
  const from = nbs.find(u => !o.includes(u) && !sol2.ends.flat().includes(u));
  if (from !== undefined) {
    // draw the long colour's dot? Use a fresh line from a dot next to... just test cut+restore with the long line if it can reach
    const r = await pg.evaluate(([o, cross, long]) => {
      // simulate a drag inside the page logic: long line goes onto `cross`
      return true; }, [o, cross, long]);
  }
  // simpler cut/restore check through the page: drag the long colour straight across the other line, then back
  for (const [c, sp] of sol2.sol.entries()) if (c !== long && c !== other) await dragCells(pg, sp);   // the board nearly full, so lines sit next to the dots
  const res = await pg.evaluate(() => {
    const P = DOTS.P;
    for (let c = 0; c < P.k; c++) for (const e of P.ends[c]) for (const a of P.nb(e)) {
      if (P.owner[a] >= 0) continue;
      const owner = P.paths.findIndex((p, k) => k !== c && p.includes(a));
      if (owner >= 0) return { c, e, a, owner };
    }
    return null;
  });
  if (res) {
    const before = (await state(pg)).paths[res.owner].length;
    let [x, y] = await cellXY(pg, res.e); await pg.mouse.move(x, y); await pg.mouse.down();
    [x, y] = await cellXY(pg, res.a); await pg.mouse.move(x, y, { steps: 3 });
    const mid2 = (await state(pg)).paths[res.owner].length;
    [x, y] = await cellXY(pg, res.e); await pg.mouse.move(x, y, { steps: 3 }); await pg.mouse.up();
    const after = (await state(pg)).paths[res.owner].length;
    ok(mid2 < before && after === before, `crossing a line cuts it (${before}→${mid2}) and it comes back when you go back (${after})`, errs);
  } else console.log('skip cut test (no spot found)');
  // 4) hint: one colour drawn right, then finish by finger
  const hBefore = await pg.evaluate(() => DOTS.S.hints);
  await pg.click('[data-act=hint]');
  const h = await pg.evaluate(() => ({ hints: DOTS.S.hints, msg: document.getElementById('pm').textContent }));
  ok(h.hints === hBefore + 1 && /رسمت/.test(h.msg), 'hint draws one line: ' + h.msg, errs);
  await solveAll(pg);
  await pg.waitForSelector('.big .n', { timeout: 5000 });
  const r1 = await pg.evaluate(() => ({ G: JSON.parse(JSON.stringify(DOTS.G)), text: document.querySelector('.msg').textContent, playing: document.body.classList.contains('playing') }));
  ok(r1.G.level === 3 && r1.G.sessions.length === 1 && r1.G.best > 0 && r1.G.top.length === 1 && !r1.playing, 'results: level 3, best ' + r1.G.best + ', hints ' + r1.G.sessions[0].hints + ' · ' + r1.text, errs);
  await H.wait(500); await pg.screenshot({ path: OUT + 'dt-result.png', fullPage: true }); await ov(pg, 'result');
  const dump = await H.dump(); const code = await pg.evaluate(() => MindSync.code());
  ok(!!(dump.mind && dump.mind[code] && JSON.parse(dump.mind[code].dots).level === 3), 'backup online under the shared code ' + code, errs);

  // 5) pause stops the clock; time up ends the session and keeps the level
  await pg.click('[data-act=start]'); await pg.waitForSelector('#cv');
  ok((await state(pg)).lv === 3, 'next session continues at level 3', errs);
  await pg.click('[data-act=pause]'); await pg.waitForSelector('#ov');
  const l1 = await pg.evaluate(() => DOTS.S.left); await H.wait(800); const l2 = await pg.evaluate(() => DOTS.S.left);
  ok(l1 === l2, 'paused: the clock stands still', errs);
  await pg.screenshot({ path: OUT + 'dt-pause.png' });
  await pg.click('[data-act=resume]'); await H.wait(300);
  ok((await pg.evaluate(() => DOTS.S.left)) < l2, 'resumed: the clock runs', errs);
  await pg.evaluate(() => { DOTS.S.left = 600; });
  await pg.waitForSelector('.big .n', { timeout: 5000 });
  const r2 = await pg.evaluate(() => ({ level: DOTS.G.level, msg: document.querySelector('.msg').textContent, n: DOTS.G.sessions.length }));
  ok(r2.level === 3 && r2.n === 2 && /خلص الوقت/.test(r2.msg), 'time up: session ends, level stays 3 · ' + r2.msg, errs);

  // 6) quit does not count
  await pg.click('[data-act=start]'); await pg.waitForSelector('#cv');
  pg.removeAllListeners('dialog'); pg.once('dialog', d => d.accept());
  await pg.click('[data-act=pause]'); await pg.click('#ov [data-act=quit]'); await H.wait(300);
  ok((await pg.evaluate(() => DOTS.G.sessions.length)) === 2 && !!(await pg.$('[data-act=start]')), 'quit: back to the start, not counted', errs);
  pg.on('dialog', d => { errs.push('dialog: ' + d.message()); d.dismiss(); });

  // 7) section page shows the new game and the save card
  await pg.goto(H.BASE + 'mind/'); await pg.waitForSelector('#dotsBest');
  console.log('hub:', (await pg.textContent('#dotsBest')).trim(), '|', (await pg.textContent('#lamhaBest')).trim(), '| code card', !!(await pg.$('#mindsync .code')));
  await pg.screenshot({ path: OUT + 'dt-hub.png', fullPage: true }); await ov(pg, 'hub');

  // 8) layouts with a 9x9 level
  for (const [w, hh, tag] of [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [1280, 720, 'tv720'], [1920, 1080, 'tv']]) {
    const c = await b.newContext({ viewport: { width: w, height: hh }, hasTouch: false });
    await c.route('**/*', r => { const u = r.request().url(); if (/firebase-(app|database)-compat/.test(u)) return r.fulfill({ body: '', contentType: 'application/javascript' }); if (u.startsWith('http://127.0.0.1')) return r.continue(); return r.abort(); });
    const q = await c.newPage(); q.on('pageerror', e => errs.push(tag + ': ' + e.message));
    await q.goto(H.BASE + 'mind/dots/'); await q.evaluate(() => localStorage.setItem('dots-v1', JSON.stringify({ v: 1, level: 330 })));
    await q.reload(); await q.waitForSelector('[data-act=start]'); await q.click('[data-act=start]'); await q.waitForSelector('#cv');
    await H.wait(200);
    const m = await q.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(), t = document.querySelector('.ptop').getBoundingClientRect(), msg = document.getElementById('pm').getBoundingClientRect(); return { n: DOTS.P.n, board: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.bottom)], cell: Math.round(r.width / DOTS.P.n), top: Math.round(t.top), msgBottom: Math.round(msg.bottom), vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
    ok(m.board[0] >= 0 && m.board[3] <= m.vh && m.msgBottom <= m.vh && m.sw <= m.vw, `${tag} ${w}x${hh}: ${m.n}x${m.n} board ${m.board[2]}px, cell ${m.cell}px, all on screen`, errs);
    // draw one line to show it
    const s = await q.evaluate(() => DOTS.P.sol[0]);
    const xy = async i => q.evaluate(i => { const P = DOTS.P, r = document.getElementById('cv').getBoundingClientRect(), cs = r.width / P.n; return [r.left + (i % P.n) * cs + cs / 2, r.top + Math.floor(i / P.n) * cs + cs / 2]; }, i);
    let [x, y] = await xy(s[0]); await q.mouse.move(x, y); await q.mouse.down(); for (const cc of s.slice(1, -1)) { [x, y] = await xy(cc); await q.mouse.move(x, y, { steps: 2 }); } await q.mouse.up();
    await q.screenshot({ path: OUT + 'dt-' + tag + '.png' });
    await c.close();
  }
  console.log('ERRS', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
