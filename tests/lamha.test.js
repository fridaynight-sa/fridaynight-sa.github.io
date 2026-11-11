// لمحة: full sessions as a simulated player, results, backup + restore, layouts
const H = require('./h.js');
const OUT = __dirname + '/';
(async () => {
  const b = await H.launch(); const errs = [];
  const pg = await H.player(b, errs, 'p1');
  await pg.goto(H.BASE + 'mind/lamha/'); await pg.waitForSelector('[data-act=start]');
  await pg.screenshot({ path: OUT + 'lm-intro.png', fullPage: true });
  const ov = async (p, tag) => { const o = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (o[0] > o[1]) errs.push(tag + ' overflow ' + o); };
  await ov(pg, 'intro');
  console.log('frameMs', await pg.evaluate(() => LAMHA.frameMs));

  // a player whose real threshold is TH ms: right with high chance above it, low below
  async function playSession(p, TH, shots) {
    await p.click('[data-act=start]');
    await p.waitForSelector('[data-act=go]');
    const pairNow = await p.evaluate(() => LAMHA.session.pair.join('+'));
    console.log('pair screen', pairNow, (await p.textContent('.pairs')).replace(/\s+/g, ' ').slice(0, 120));
    if (shots) await p.screenshot({ path: OUT + 'lm-pair.png', fullPage: true });
    await p.click('[data-act=go]');
    const msSeen = [];
    for (let k = 0; k < 40; k++) {
      const done = await p.evaluate(() => !LAMHA.session);
      if (done) break;
      await p.waitForSelector('.go');
      const ms = await p.evaluate(() => LAMHA.session.frames * LAMHA.frameMs);
      msSeen.push(Math.round(ms));
      await p.click('.go');
      if (shots && k === 0) { await H.wait(470); await p.screenshot({ path: OUT + 'lm-look.png' }); }
      await p.waitForSelector('[data-car]', { timeout: 8000 });
      if (shots && k === 0) {
        await p.evaluate(() => { const c = document.getElementById('cv').getContext('2d'), s = LAMHA.session.tr, S = parseFloat(document.getElementById('cv').style.width); c.drawImage(s.stim, 0, 0, S, S); });
        await p.screenshot({ path: OUT + 'lm-stim.png' });
        await p.evaluate(() => { const c = document.getElementById('cv').getContext('2d'), s = LAMHA.session.tr, S = parseFloat(document.getElementById('cv').style.width); c.drawImage(s.bgCv, 0, 0, S, S); });
        await p.screenshot({ path: OUT + 'lm-askcar.png' });
      }
      const pc = 1 / (1 + Math.exp(-(ms - TH) / (TH * 0.15)));   // chance to catch both
      const ok = Math.random() < (0.12 + 0.86 * pc);
      const tr = await p.evaluate(() => { const t = LAMHA.session.tr; return { shown: t.shown, opts: t.opts, dir: t.dir }; });
      if (!pairNow.split('+').includes(tr.shown) || tr.opts.slice().sort().join('+') !== pairNow.split('+').sort().join('+')) errs.push('trial car not from pair ' + JSON.stringify(tr) + ' ' + pairNow);
      const carI = tr.opts.indexOf(tr.shown);
      const wrongCar = ok ? false : Math.random() < 0.5;
      await p.click(`[data-car="${wrongCar ? 1 - carI : carI}"]`);
      await p.waitForSelector('.dir');
      if (shots && k === 0) await p.screenshot({ path: OUT + 'lm-askstar.png' });
      const d = (ok || wrongCar) ? tr.dir : (tr.dir + 1 + Math.floor(Math.random() * 7)) % 8;
      await p.click(`.dir[data-dir="${d}"]`);
      if (shots && k === 0) { await H.wait(100); await p.screenshot({ path: OUT + 'lm-fb.png' }); }
      await p.waitForFunction(() => !document.querySelector('.dir'), null, { timeout: 4000 });
    }
    await p.waitForSelector('.big .n');
    return msSeen;
  }
  let t0 = Date.now();
  const s1 = await playSession(pg, 90, true);
  console.log('session1 trials', s1.length, 'secs', ((Date.now() - t0) / 1000).toFixed(0));
  console.log('ms path', s1.join(' '));
  const g1 = await pg.evaluate(() => JSON.parse(JSON.stringify(LAMHA.G)));
  g1.code = await pg.evaluate(() => MindSync.code()); console.log('result1', g1.best, g1.sessions, Object.values(g1.days), g1.code);
  await H.wait(600);
  await pg.screenshot({ path: OUT + 'lm-res1.png', fullPage: true });
  await ov(pg, 'res1');
  console.log('msg1', await pg.textContent('.msg'));

  t0 = Date.now();
  const s2 = await playSession(pg, 70, false);
  console.log('session2 start', s2[0], 'path', s2.join(' '));
  const g2 = await pg.evaluate(() => JSON.parse(JSON.stringify(LAMHA.G)));
  console.log('result2', g2.best, g2.sessions.map(s => s.ms + '/' + s.acc + '%/p' + s.p));
  console.log('msg2', await pg.textContent('.msg'));
  await H.wait(600);
  await pg.screenshot({ path: OUT + 'lm-res2.png', fullPage: true });

  // backup in the database?
  const dump = await H.dump();
  g2.code = await pg.evaluate(() => MindSync.code());
  const m = dump.mind && dump.mind[g2.code];
  console.log('backup', !!m, m && JSON.parse(m.j).sessions.length);

  // intro after sessions
  await pg.goto('about:blank'); await pg.goto(H.BASE + 'mind/lamha/'); await pg.waitForSelector('[data-act=start]');
  await pg.screenshot({ path: OUT + 'lm-intro2.png', fullPage: true });
  console.log('intro record', await pg.textContent('.record'));

  // hub page reads the best
  await pg.goto(H.BASE + 'mind/'); await pg.waitForSelector('.mg');
  console.log('hub', await pg.textContent('#lamhaBest'));
  await pg.screenshot({ path: OUT + 'lm-hub.png', fullPage: true });
  await ov(pg, 'hub');

  // a new phone: restore by code (wrong code, then right one)
  const p2 = await H.player(b, errs, 'p2');
  await p2.goto(H.BASE + 'mind/lamha/'); await p2.waitForSelector('#msrc');
  await p2.fill('#msrc', 'ABCD-EFGH'); await p2.click('[data-ms=restore]'); await H.wait(600);
  console.log('wrong code msg', await p2.textContent('#msmsg'));
  await p2.fill('#msrc', g2.code.slice(0, 4).toLowerCase() + '-' + g2.code.slice(4)); await p2.click('[data-ms=restore]'); await H.wait(800);
  console.log('restore msg', await p2.textContent('#msmsg'));
  const g3 = await p2.evaluate(() => JSON.parse(JSON.stringify(LAMHA.G)));
  console.log('restored', g3.best === g2.best, g3.sessions.length, (await p2.evaluate(() => MindSync.code())) === g2.code);
  await p2.screenshot({ path: OUT + 'lm-restored.png', fullPage: true });

  // quit mid-session does not count
  // the pairs rotate: 12 starts → each of the 6 pairs twice, never the same twice in a row, all 6 before a repeat
  const ps = [];
  for (let k = 0; k < 12; k++) { await p2.click('[data-act=start]'); await p2.waitForSelector('[data-act=back]'); ps.push(await p2.evaluate(() => LAMHA.session.p)); await p2.click('[data-act=back]'); await p2.waitForSelector('[data-act=start]'); }
  console.log('pair order', ps.join(' '), 'first6 unique', new Set(ps.slice(0, 6)).size === 6 || new Set(ps.slice(0,6)).size, 'counts', JSON.stringify(ps.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {})));
  await p2.click('[data-act=start]'); await p2.waitForSelector('[data-act=go]'); await p2.click('[data-act=go]'); await p2.waitForSelector('.go');
  p2.removeAllListeners('dialog'); p2.once('dialog', d => d.accept());
  await p2.click('[data-act=quit]'); await H.wait(300);
  console.log('after quit view', await p2.evaluate(() => !!document.querySelector('[data-act=start]')), (await p2.evaluate(() => LAMHA.G.sessions.length)));

  // layouts: TV and small phone
  for (const [w, h, tag] of [[1920, 1080, 'tv'], [1280, 720, 'tv720'], [360, 640, 'small']]) {
    const c = await b.newContext({ viewport: { width: w, height: h } });
    await c.route('**/*', r => { const u = r.request().url(); if (/firebase-(app|database)-compat/.test(u)) return r.fulfill({ body: '', contentType: 'application/javascript' }); if (u.startsWith('http://127.0.0.1')) return r.continue(); return r.abort(); });
    const q = await c.newPage(); q.on('pageerror', e => errs.push(tag + ': ' + e.message));
    await q.goto(H.BASE + 'mind/lamha/'); await q.waitForSelector('[data-act=start]');
    await q.screenshot({ path: OUT + 'lm-' + tag + '-intro.png' });
    await q.click('[data-act=start]'); await q.waitForSelector('[data-act=go]'); await q.screenshot({ path: OUT + 'lm-' + tag + '-pair.png' }); await q.click('[data-act=go]'); await q.waitForSelector('.go'); await q.click('.go'); await q.waitForSelector('[data-car]', { timeout: 8000 });
    const fc = await q.evaluate(() => { const a = document.getElementById('ask').getBoundingClientRect(); return Math.round(a.bottom) + '/' + innerHeight; }); console.log(tag, 'car phase ask bottom', fc); await q.screenshot({ path: OUT + 'lm-' + tag + '-car.png' });
    await q.click('[data-car="0"]'); await q.waitForSelector('.dir');
    const fit = await q.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(), a = document.getElementById('ask').getBoundingClientRect(); return { stage: [Math.round(r.top), Math.round(r.bottom)], ask: Math.round(a.bottom), vh: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    console.log(tag, JSON.stringify(fit));
    await q.screenshot({ path: OUT + 'lm-' + tag + '-play.png' });
    await c.close();
  }
  console.log('ERRS', errs.length ? errs : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
