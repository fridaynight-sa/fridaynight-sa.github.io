// Runs the site's browser tests (tests/*.test.js) against tests/server.js; exits 1 if any fails.
// A test fails when it exits with an error, prints a line starting with FAIL, or reports page errors (errors [ … ]).
process.env.PW = process.env.PW || "playwright";
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), PORT = 8770;
const only = process.argv.slice(2);
const tests = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js") && (!only.length || only.some(o => f.startsWith(o)))).sort();
const srv = spawn(process.execPath, [path.join(__dirname, "server.js"), ROOT, String(PORT)], { stdio: "ignore" });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch (e) { await wait(200); } }
  let failed = [];
  for (const t of tests) {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, t)], { encoding: "utf8", timeout: 6 * 60e3, env: Object.assign({}, process.env, { PORT: String(PORT) }) });
    const out = (r.stdout || "") + (r.stderr || "");
    const bad = r.status !== 0 || /^FAIL /m.test(out) || /errors \[\s*['"]/.test(out);
    console.log(`${bad ? "✗" : "✓"} ${t} (${Math.round((Date.now() - t0) / 1000)}s)`);
    if (bad) { failed.push(t); console.log(out.split("\n").filter(l => /FAIL|Error|errors|at .*test\.js/.test(l)).slice(0, 15).join("\n")); }
  }
  srv.kill();
  console.log(failed.length ? `\n${failed.length} failed: ${failed.join(", ")}` : `\nall ${tests.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
