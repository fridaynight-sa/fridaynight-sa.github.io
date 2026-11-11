// تذكّر المربعات: perfect / forgetful players, both modes, hearts, pause, keys, results, backup, old link, layouts
const H = require('./h.js'); const OUT = __dirname + '/';
const ok = (c, m, errs) => { if (!c) errs.push('FAIL ' + m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
(async () => {
  const b = await H.launch(); const errs = [];
  const pg = await H.player(b, errs, 'p1');
  await pg.addInitScript(() => { self.SQ_TEST = { on: 40, gap: 10, wait: 60 }; });
  await pg.goto(H.BASE + 'mind/nback/'); await pg.waitForURL(/\/mind\/squares\/$/, { timeout: 5000 }).catch(() => {});
  ok(/\/mind\/squares\/$/.test(pg.url()), 'old link mind/nback/ opens the new game', errs);
  await pg.waitForSelector('[data-act=start]');
  await pg.screenshot({ path: OUT + 'sqt-intro.png', fullPage: true });
  const ov = async (tag) => { const o = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); ok(o[0] <= o[1], tag + ' no sideways overflow', errs); };
  await ov('intro');
  // a player who remembers up to `cap` squares, then taps one wrong
  async function play(cap, keys) {
    await pg.click('[data-act=start]'); await pg.waitForSelector('#sq');
    for (let n = 0; n < 40; n++) {
      const st = await pg.waitForFunction(() => !SQUARES.S || SQUARES.S.phase === 'input', null, { timeout: 15000 }).then(() => pg.evaluate(() => SQUARES.S && { seq: SQUARES.S.seq, back: SQUARES.S.back }));
      if (!st) break;
      const order = st.back ? st.seq.slice().reverse() : st.seq;
      for (let i = 0; i < order.length; i++) {
        let p = order[i];
        if (st.seq.length > cap && i === order.length - 1) p = [0, 1, 2, 3, 4, 5, 6, 7, 8].find(x => !st.seq.includes(x));   // forgets the last one
        if (keys) { const rtl = true, r = Math.floor(p / 3), dom = p % 3, cl = rtl ? 2 - dom : dom; const key = { '0,0': 7, '0,1': 8, '0,2': 9, '1,0': 4, '1,1': 5, '1,2': 6, '2,0': 1, '2,1': 2, '2,2': 3 }[r + ',' + cl]; await pg.keyboard.press(String(key)); }
        else { const el = await pg.$(`[data-sq="${p}"]`); const bx = await el.boundingBox(); await pg.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await pg.mouse.down(); await pg.mouse.up(); }
      }
      await pg.waitForFunction(() => !SQUARES.S || SQUARES.S.phase !== 'input', null, { timeout: 5000 });
    }
    await pg.waitForSelector('.big .v', { timeout: 15000 });
    return pg.evaluate(() => JSON.parse(JSON.stringify(SQUARES.G)));
  }
  let G = await play(5);
  let s = G.sessions.at(-1);
  ok(s.score === 5 && s.trials === '+3 +4 +5 -6 -6 -6' && G.best.one === 5 && G.last.one === 5, 'remembers 5: 3→4→5 right, then 3 hearts lost at 6 → number 5 · ' + s.trials, errs);
  await H.wait(400); await pg.screenshot({ path: OUT + 'sqt-result.png', fullPage: true }); await ov('result');
  G = await play(9, true);   // perfect, with the number keys; starts at 4 (one below the last number)
  s = G.sessions.at(-1);
  ok(s.trials === '+4 +5 +6 +7 +8 +9' && s.score === 9 && G.best.one === 9, 'perfect with keys: starts at 4 and reaches the top (9) · ' + s.trials, errs);
  console.log('top message:', (await pg.textContent('.msg')).slice(0, 60));
  await pg.goto(H.BASE + 'mind/squares/'); await pg.waitForSelector('[data-mode=back]'); await pg.click('[data-mode=back]');
  G = await play(4);
  s = G.sessions.at(-1);
  ok(s.mode === 'back' && s.score === 4 && G.best.back === 4 && G.best.one === 9, 'بالعكس (taps last to first): own record, separate from the normal one · ' + s.trials, errs);
  // a screen mid-play: the order showing, then a wrong tap with the right order shown
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await c2.route('**/*', r => { const u = r.request().url(); if (/gstatic/.test(u)) return r.fulfill({ body: '', contentType: 'application/javascript' }); if (u.startsWith('http://127.0.0.1')) return r.continue(); return r.abort(); });
  await c2.addInitScript(() => { self.SQ_TEST = { on: 1400, gap: 300, wait: 2500, fast: 230 }; });
  const q = await c2.newPage(); q.on('pageerror', e => errs.push('q: ' + e.message));
  await q.goto(H.BASE + 'mind/squares/'); await q.evaluate(() => localStorage.setItem('squares-v1', JSON.stringify({ v: 1, last: { one: 5, back: 0 } })));
  await q.reload(); await q.waitForSelector('[data-act=start]'); await q.click('[data-act=start]');
  await q.waitForFunction(() => document.querySelectorAll('#sq button.on').length === 1 && SQUARES.S.seq.indexOf(+document.querySelector('#sq button.on').dataset.sq) === 2, null, { timeout: 15000 });
  await q.screenshot({ path: OUT + 'sqt-show.png' });
  await q.waitForFunction(() => SQUARES.S.phase === 'input', null, { timeout: 15000 });
  const sq = await q.evaluate(() => SQUARES.S.seq);
  for (const p of sq.slice(0, 2)) await q.click(`[data-sq="${p}"]`);
  await q.screenshot({ path: OUT + 'sqt-input.png' });
  await q.click(`[data-sq="${[0, 1, 2, 3, 4, 5, 6, 7, 8].find(x => !sq.includes(x))}"]`);
  // the right order shows one by one in green: first none of them green, then 1, 2, … all
  const steps = [];
  for (let i = 0; i < 40 && (steps.at(-1) || 0) < sq.length; i++) { steps.push(await q.evaluate(() => document.querySelectorAll('#sq .ok').length)); await H.wait(60); }
  const grew = steps.filter((x, i) => i && x > steps[i - 1]).length;
  ok(grew >= sq.length - 1, 'after a mistake the green comes one square at a time ' + JSON.stringify([...new Set(steps)]), errs);
  const firstGreen = await q.evaluate(() => 0);
  await q.waitForFunction(n => document.querySelectorAll('#sq .ok').length === n, sq.length, { timeout: 4000 }).catch(() => {});
  const h = await q.evaluate(n => ({ hearts: document.getElementById('hearts').textContent, green: document.querySelectorAll('#sq .ok').length, red: document.querySelectorAll('#sq .bad').length, lit: document.querySelectorAll('#sq .on').length, nums: [...document.querySelectorAll('#sq button')].filter(b => /\d/.test(b.textContent)).length }), sq.length);
  ok(h.hearts === '❤️❤️🤍' && h.green === sq.length && h.red === 1 && h.lit === 0 && h.nums === 0, 'wrong tap: one heart gone, in the end all right squares green, the wrong one red · ' + JSON.stringify(h), errs);
  await H.wait(300); await q.screenshot({ path: OUT + 'sqt-wrong.png' });
  const lock = await q.evaluate(() => { scrollTo(0, 300); return scrollY === 0 && getComputedStyle(document.body).position === 'fixed'; });
  ok(lock, 'screen does not move while playing', errs);
  await q.waitForFunction(() => SQUARES.S && SQUARES.S.phase === 'show', null, { timeout: 15000 });
  await q.click('[data-act=pause]'); await q.waitForSelector('#ov');
  const ph = await q.evaluate(() => [SQUARES.S.phase, document.querySelectorAll('#sq .on').length]); await H.wait(1800);
  ok((await q.evaluate(() => document.querySelectorAll('#sq .on').length)) === 0, 'paused: nothing lights up', errs);
  await q.screenshot({ path: OUT + 'sqt-pause.png' });
  await q.click('#ov [data-act=resume]'); await H.wait(200);
  ok((await q.evaluate(() => SQUARES.S.phase)) === 'show', 'resume: a new row of the same length', errs);
  q.once('dialog', d => d.accept());
  await q.click('[data-act=pause]'); await q.click('#ov [data-act=quit]'); await H.wait(300);
  ok(!!(await q.$('[data-act=start]')) && (await q.evaluate(() => SQUARES.G.sessions.length)) === 0, 'quit: back to the start, not counted', errs);
  await c2.close();
  // backup and the section page
  await H.wait(600);
  const code = await pg.evaluate(() => MindSync.code()), dump = await H.dump();
  ok(!!(dump.mind && dump.mind[code] && JSON.parse(dump.mind[code].squares).sessions.length === 3), 'backup online under the shared code (mind/<code>/squares)', errs);
  await pg.goto(H.BASE + 'mind/'); await pg.waitForSelector('#sqBest');
  console.log('hub:', (await pg.textContent('#sqBest')).trim());
  await pg.screenshot({ path: OUT + 'sqt-hub.png', fullPage: true });
  // layouts
  for (const [w, hh, tag] of [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [1280, 720, 'tv720'], [1920, 1080, 'tv']]) {
    const c = await b.newContext({ viewport: { width: w, height: hh }, serviceWorkers: 'block' });
    await c.route('**/*', r => { const u = r.request().url(); if (/gstatic/.test(u)) return r.fulfill({ body: '', contentType: 'application/javascript' }); if (u.startsWith('http://127.0.0.1')) return r.continue(); return r.abort(); });
    await c.addInitScript(() => { self.SQ_TEST = { on: 4000, gap: 300, wait: 900 }; });
    const x = await c.newPage(); x.on('pageerror', e => errs.push(tag + ': ' + e.message));
    await x.goto(H.BASE + 'mind/squares/'); await x.waitForSelector('[data-act=start]'); await x.click('[data-act=start]');
    await x.waitForFunction(() => document.querySelector('#sq button.on'), null, { timeout: 5000 });
    const m = await x.evaluate(() => { const g = document.getElementById('sq').getBoundingClientRect(), s = document.getElementById('say').getBoundingClientRect(); return { g: [Math.round(g.top), Math.round(g.bottom), Math.round(g.width)], say: Math.round(s.bottom), vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
    ok(m.g[0] >= 0 && m.g[1] <= m.vh && m.sw <= m.vw && m.g[2] >= 200, `${tag} ${w}x${hh}: board ${m.g[2]}px, all on screen`, errs);
    await x.screenshot({ path: OUT + 'sqt-' + tag + '.png' });
    await c.close();
  }
  console.log('ERRS', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
