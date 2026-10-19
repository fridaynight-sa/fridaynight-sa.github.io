/* Friday Night — "install as an app" banner on the homepage.
   Android / Chrome: the browser's own install prompt behind our button.
   iPhone / iPad: a short sheet with the "Share → Add to Home Screen" steps.
   Hidden when already opened as the app, and for 30 days after it is closed. */
(function () {
  "use strict";
  const KEY = "fn-install-v1", WAIT = 30 * 864e5;
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone) return;
  let closed = 0; try { closed = +localStorage.getItem(KEY) || 0; } catch (e) {}
  if (Date.now() - closed < WAIT) return;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|Instagram|Snapchat|Line\/|TikTok|Twitter/i.test(ua);   // in-app browsers can't add to home screen
  let deferred = null, shown = null;
  const hide = () => { if (shown) shown.remove(); shown = null; document.body.classList.remove("has-inst"); };
  const close = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} hide(); };
  function steps() {
    const o = document.createElement("div"); o.className = "isheet";
    o.innerHTML = `<div role="dialog" aria-label="حطه على الشاشة الرئيسية"><h3>📲 حط Friday Night على الشاشة الرئيسية</h3>
      <ol><li>اضغط زر المشاركة <span class="k">⬆️</span> ${/iPad/.test(ua) ? "فوق" : "تحت"} في Safari</li><li>انزل واختار <span class="k">إضافة إلى الشاشة الرئيسية ⊞</span></li><li>اضغط <span class="k">إضافة</span></li></ol>
      <button type="button">فهمت</button></div>`;
    o.onclick = e => { if (e.target === o || e.target.tagName === "BUTTON") o.remove(); };
    document.body.appendChild(o);
  }
  function banner() {
    if (shown) return;
    const b = document.createElement("div"); b.className = "inst";
    b.innerHTML = `<img src="icon-192.png" alt=""><b>حمّل Friday Night على جوالك<small>مجاني · بدون متجر · يفتح مثل التطبيق</small></b><button type="button" class="ok">📲 حمّل</button><button type="button" class="x" aria-label="سكّر">✕</button>`;
    b.querySelector(".x").onclick = close;
    b.querySelector(".ok").onclick = async () => {
      if (deferred) {
        deferred.prompt();
        try { const r = await deferred.userChoice; if (r && r.outcome === "accepted") close(); } catch (e) {}
        deferred = null; if (!ios) hide();
      } else if (ios) steps();
      else hide();
    };
    document.body.appendChild(b); shown = b; document.body.classList.add("has-inst");
  }
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; setTimeout(banner, 1500); });
  addEventListener("appinstalled", close);
  if (ios && !inApp) setTimeout(banner, 2500);
  self.FNI = { banner, steps };
})();
