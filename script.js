// ===== 日本語 / English 切替（選択はブラウザに記憶） =====
(function () {
  const root = document.documentElement;
  const button = document.querySelector(".lang-toggle");

  // save = true のとき（ボタンで切り替えたとき）だけ選択を記憶する
  function setLang(lang, save) {
    root.lang = lang;
    button.textContent = lang === "ja" ? "EN" : "JA";
    if (save) { try { localStorage.setItem("lang", lang); } catch (e) {} }
  }

  // 初期言語は <head> 内のスクリプトで決めてある（保存された選択 → ブラウザの言語）
  setLang(root.lang === "en" ? "en" : "ja", false);

  button.addEventListener("click", function () {
    setLang(root.lang === "ja" ? "en" : "ja", true);
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();

// ===== スマホ用メニュー =====
(function () {
  const button = document.querySelector(".menu-toggle");
  if (!button) return;
  button.addEventListener("click", function () {
    const open = document.documentElement.classList.toggle("nav-open");
    button.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();

// ===== スクロール時のヘッダー・フェードイン =====
(function () {
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 24);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("visible"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
})();

// ===== 背景：スキルミオン格子（3D） =====
// 三角格子上に並んだスキルミオンのスピンを、斜め上から見た 3D の円錐矢印として描画する。
// 陰影は左上からの平行光源で計算する。ヘリシティはブロッホ型（π/2）に固定し、格子全体をスライドさせる。
(function () {
  const canvas = document.querySelector(".hero-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPageHead = !!canvas.closest(".page-head");

  const SPACING = 30;            // 格子点の間隔（ワールド座標）
  const R = 140;                 // スキルミオン半径
  const A = 2.05 * R;            // スキルミオン格子の格子定数
  const SLIDE_SPEED = 30;        // 格子が滑る速さ（ワールド座標 px/秒）
  const SKX_HALL = 45 * Math.PI / 180; // スキルミオンホール角（駆動方向からのずれ）
  const ROW_H = A * Math.sqrt(3) / 2;
  const L_TOTAL = SPACING * 0.92; // 矢印の全長
  const L_CONE = L_TOTAL * 0.58;  // 円錐部分の長さ
  const R_CONE = SPACING * 0.2;   // 円錐の底面半径
  const TILT = 52 * Math.PI / 180; // 面の傾き（0 で真上から）
  const COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);
  const LIGHT = normalize([-0.45, -0.75, 0.5]); // 光源の向き（カメラ座標：x 右, y 下, z 手前）
  const HALF = normalize([LIGHT[0], LIGHT[1], LIGHT[2] + 1]); // ハイライト用

  let width = 0, height = 0, dpr = 1, D = 1500;
  let up = [43, 76, 155], mid = [150, 150, 185], down = [194, 85, 61];
  let running = true;

  function normalize(v) {
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const parse = (v) => v.split(",").map((x) => parseFloat(x));
    up = parse(s.getPropertyValue("--spin-up"));
    mid = parse(s.getPropertyValue("--spin-mid"));
    down = parse(s.getPropertyValue("--spin-down"));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D = Math.max(1100, Math.max(width, height) * 1.4);
  }

  // m_z に応じた基本色（上向き → 横向き → 下向き）
  function baseColor(mz) {
    const a = mz >= 0 ? mid : mid, b = mz >= 0 ? up : down, w = Math.abs(mz);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  }

  // 法線 n の面の色（ランバート＋ハイライト）
  function shade(c, n) {
    const diff = Math.max(0, dot(n, LIGHT));
    const k = 0.42 + 0.68 * diff;
    const spec = Math.pow(Math.max(0, dot(n, HALF)), 24) * 0.55;
    const f = (v) => Math.min(255, Math.round(v * k + (255 - v * k) * spec));
    return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
  }

  // 最寄りのスキルミオン中心からの相対位置（三角格子）
  function nearestCenter(x, y) {
    const j = Math.round(y / ROW_H);
    let bx = 0, by = 0, bestD = Infinity;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj;
      const shift = (jj & 1) ? A / 2 : 0;
      const i = Math.round((x - shift) / A);
      for (let di = -1; di <= 1; di++) {
        const cx = shift + (i + di) * A, cy = jj * ROW_H;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestD) { bestD = d; bx = x - cx; by = y - cy; }
      }
    }
    return [bx, by];
  }

  // ワールド座標のベクトル（面内 x, y と面法線 z）をカメラ座標へ
  const toCam = (x, y, z) => [x, y * COS_T - z * SIN_T, y * SIN_T + z * COS_T];

  function drawArrow(px, py, s, m, alpha) {
    const c = baseColor(m.mz);
    const v = toCam(m.mx, m.my, m.mz);           // 矢印の向き（カメラ座標）
    let ux = v[1], uy = -v[0];                   // 画面上で軸に垂直な方向
    const ul = Math.hypot(ux, uy);
    if (ul < 1e-4) { ux = 1; uy = 0; } else { ux /= ul; uy /= ul; }
    const u3 = [ux, uy, 0];
    const w3 = normalize([-v[0] * v[2], -v[1] * v[2], 1 - v[2] * v[2] + 1e-6]); // 手前向きの側面方向

    const tipX = px + v[0] * L_TOTAL / 2 * s, tipY = py + v[1] * L_TOTAL / 2 * s;
    const baseX = tipX - v[0] * L_CONE * s, baseY = tipY - v[1] * L_CONE * s;
    const tailX = px - v[0] * L_TOTAL / 2 * s, tailY = py - v[1] * L_TOTAL / 2 * s;
    const rr = R_CONE * s;
    const e1x = baseX + ux * rr, e1y = baseY + uy * rr;
    const e2x = baseX - ux * rr, e2y = baseY - uy * rr;
    const rot = Math.atan2(uy, ux);
    const minor = Math.max(0.01, rr * Math.abs(v[2]));

    const nA = normalize([u3[0] * 0.75 + w3[0] * 0.55 + v[0] * 0.35, u3[1] * 0.75 + w3[1] * 0.55 + v[1] * 0.35, w3[2] * 0.55 + v[2] * 0.35]);
    const nB = normalize([-u3[0] * 0.75 + w3[0] * 0.55 + v[0] * 0.35, -u3[1] * 0.75 + w3[1] * 0.55 + v[1] * 0.35, w3[2] * 0.55 + v[2] * 0.35]);
    const nF = normalize([w3[0] + v[0] * 0.35, w3[1] + v[1] * 0.35, w3[2] + v[2] * 0.35]);
    const colA = shade(c, nA), colB = shade(c, nB), colF = shade(c, nF);
    const colBase = shade([c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], [-v[0], -v[1], -v[2]]);

    ctx.globalAlpha = alpha;

    const shaft = () => {
      ctx.strokeStyle = colB;
      ctx.lineWidth = rr * 0.75;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(baseX, baseY); ctx.stroke();
    };
    const sides = () => {
      ctx.fillStyle = colA;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(e1x, e1y); ctx.lineTo(baseX, baseY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = colB;
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(e2x, e2y); ctx.lineTo(baseX, baseY); ctx.closePath(); ctx.fill();
    };
    const base = (col) => {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(baseX, baseY, rr, minor, rot, 0, Math.PI * 2); ctx.fill();
    };

    if (v[2] >= 0) {
      // 先端が手前向き：軸 → 底面（側面の色）→ 側面
      shaft(); base(colF); sides();
    } else {
      // 先端が奥向き：側面 → 底面 → 軸（手前に出る）
      sides(); base(colBase); shaft();
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    const helicity = Math.PI / 2;  // ブロッホ型に固定
    const narrow = width < 720;
    const cx = width * (narrow ? 0.5 : 0.66), cy = height * 0.5;
    const skipX = narrow ? -Infinity : width * (isPageHead ? 0.4 : 0.2); // マスクで隠れる左側は描かない
    const f = D;

    // 画面の上端・下端に対応するワールド y
    const worldY = (ys) => (ys - cy) * D / (COS_T * f + (ys - cy) * SIN_T);
    const y0 = Math.floor(worldY(-30) / SPACING) * SPACING;
    const y1 = Math.ceil(worldY(height + 30) / SPACING) * SPACING;
    // スライディング：電流で駆動されたように格子全体を一定速度で動かす（ホール角だけ斜めにずれる）
    const travel = reduceMotion ? 0 : SLIDE_SPEED * t / 1000;
    const shiftX = width * 0.04 - travel * Math.cos(SKX_HALL);
    const shiftY = -travel * Math.sin(SKX_HALL);

    for (let Y = y0; Y <= y1; Y += SPACING) {           // 奥の列から手前へ
      const zc = Y * SIN_T, yc = Y * COS_T;
      const s = f / (D - zc);
      const py = cy + yc * s;
      const xMin = Math.floor(((skipX - 30 - cx) / s) / SPACING) * SPACING;
      const xMax = Math.ceil(((width + 30 - cx) / s) / SPACING) * SPACING;
      const alpha = Math.min(1, Math.max(0.12, (s - 0.5) * 1.5))   // 遠くほど薄く
                  * Math.min(1, Math.max(0, py / 140));            // 上端もフェード
      for (let X = Math.max(xMin, -6000); X <= xMax; X += SPACING) {
        const px = cx + X * s;
        const [dx, dy] = nearestCenter(X + shiftX, Y + shiftY);
        const r = Math.hypot(dx, dy);
        const theta = r < R ? Math.PI * (1 - r / R) : 0;  // 中心で下向き、外側で上向き
        const mxy = Math.sin(theta);
        const phi = Math.atan2(dy, dx) + helicity;
        drawArrow(px, py, s, { mx: mxy * Math.cos(phi), my: mxy * Math.sin(phi), mz: Math.cos(theta) }, alpha);
      }
    }
    ctx.globalAlpha = 1;
  }

  let last = 0;
  function loop(t) {
    if (running && t - last > 40) { draw(t); last = t; }  // 約 25fps
    requestAnimationFrame(loop);
  }

  readColors();
  resize();
  draw(0);
  window.addEventListener("resize", () => { resize(); draw(last); });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); draw(last); });

  if (!reduceMotion) {
    new IntersectionObserver(([e]) => { running = e.isIntersecting; }).observe(canvas);
    requestAnimationFrame(loop);
  }
})();

// ===== ニュース（news-data.js の内容を表示） =====
// 日付を見て「これからの予定」（終了日が今日以降）と「これまで」に自動で分ける。
// 過ぎた予定は、jaPast / enPast があればその文（過去形）に自動で切り替わる。
(function () {
  const all = window.NEWS || [];
  if (!document.querySelector("[data-news-home], [data-news-years]")) return;

  // ニュースの種類ラベル（news-data.js の type に対応）
  const TYPES = {
    talk:    { ja: "発表",     en: "Talk" },
    invited: { ja: "招待講演", en: "Invited" },
    seminar: { ja: "セミナー", en: "Seminar" },
    visit:   { ja: "滞在",     en: "Visit" },
    award:   { ja: "受賞",     en: "Award" },
    info:    { ja: "お知らせ", en: "News" }
  };

  // "2026.11.09–13" / "2026.11.30–12.02" / "2026.11.11" → 終了日を YYYYMMDD の数値で返す
  function endKey(date) {
    const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s*[–\-~〜]\s*([\d.]+))?/.exec(date);
    if (!m) return 0;
    let y = +m[1], mo = +m[2], d = +m[3];
    if (m[4]) {
      const parts = m[4].split(".").map(Number);
      if (parts.length === 1) d = parts[0];
      else if (parts.length === 2) { mo = parts[0]; d = parts[1]; }
      else { y = parts[0]; mo = parts[1]; d = parts[2]; }
    }
    return y * 10000 + mo * 100 + d;
  }
  const now = new Date();
  const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const isUpcoming = function (item) { return item.type !== "info" && endKey(item.date) >= today; };
  const byDate = function (dir) {
    return function (a, b) { return a.date < b.date ? -dir : a.date > b.date ? dir : 0; };
  };
  const upcoming = all.filter(isUpcoming).sort(byDate(1));          // 近い順
  const past = all.filter(function (n) { return !isUpcoming(n); }).sort(byDate(-1)); // 新しい順

  const row = function (item) {
    const t = TYPES[item.type] || TYPES.info;
    const key = TYPES[item.type] ? item.type : "info";
    const done = !isUpcoming(item);
    const ja = done && item.jaPast ? item.jaPast : item.ja;
    const en = done && item.enPast ? item.enPast : (item.en || item.ja);
    return '<li><time class="news-date">' + item.date + '</time>' +
      '<span class="news-tag news-tag-' + key + '"><span data-ja>' + t.ja + '</span><span data-en>' + t.en + '</span></span>' +
      '<p class="news-text"><span data-ja>' + ja + '</span><span data-en>' + en + '</span></p></li>';
  };
  const list = function (items) { return '<ol class="news-list">' + items.map(row).join("") + '</ol>'; };
  const heading = function (ja, en, extra) {
    return '<h3 class="sub-title news-sub' + (extra || "") + '"><span data-ja>' + ja + '</span><span data-en>' + en + '</span></h3>';
  };
  const upcomingBlock = function (items) {
    return items.length ? heading("これからの予定", "Upcoming", " news-sub-upcoming") + list(items) : "";
  };

  // ホーム：これからの予定（近い順）と、これまで（新しい順）を数件ずつ
  document.querySelectorAll("[data-news-home]").forEach(function (box) {
    const nUp = parseInt(box.getAttribute("data-upcoming"), 10) || 3;
    const nPast = parseInt(box.getAttribute("data-past"), 10) || 3;
    const up = upcoming.slice(0, nUp);
    box.innerHTML = upcomingBlock(up) +
      heading("これまで", "Recent", up.length ? " sub-title-gap" : "") + list(past.slice(0, nPast));
  });

  // ニュースページ：これからの予定 ＋ これまで（年ごとに折りたたみ）
  document.querySelectorAll("[data-news-years]").forEach(function (box) {
    const years = [];
    const byYear = {};
    past.forEach(function (item) {
      const y = item.date.slice(0, 4);
      if (!byYear[y]) { byYear[y] = []; years.push(y); }
      byYear[y].push(item);
    });
    const jump = years.length > 1
      ? '<ul class="page-jump news-jump">' + years.map(function (y) {
          return '<li><a href="#news-' + y + '">' + y + '<span class="count">' + byYear[y].length + '</span></a></li>';
        }).join("") + '</ul>'
      : "";
    const section = function (ja, en, body, first) {
      return '<section class="section' + (first ? '' : ' section-compact') + '">' +
        '<h2 class="section-title"><span data-ja>' + ja + '</span><span data-en>' + en + '</span></h2>' + body + '</section>';
    };
    const wrap = document.createElement("div");
    wrap.innerHTML =
      (upcoming.length ? section("これからの予定", "Upcoming", list(upcoming), true) : "") +
      section("これまで", "Past", jump +
        years.map(function (y, i) {
          return '<details class="pres-group news-year" id="news-' + y + '"' + (i === 0 ? ' open' : '') + '>' +
            '<summary><span class="news-year-title">' + y + '</span><span class="count">' + byYear[y].length + '</span></summary>' +
            list(byYear[y]) + '</details>';
        }).join(""), !upcoming.length);
    const made = Array.prototype.slice.call(wrap.children);
    made.forEach(function (el) { box.parentNode.insertBefore(el, box); });
    box.remove();
    // 年ボタンで移動したときは、その年を開く
    document.querySelectorAll(".news-jump a").forEach(function (a) {
      a.addEventListener("click", function () {
        const target = document.querySelector(a.getAttribute("href"));
        if (target) target.open = true;
      });
    });
  });
})();

// ===== メールアドレス（迷惑メール対策） =====
// HTML にはアドレスを書かず、逆順＋Base64 にした文字列だけを置く。クリックされたときに復元して表示する。
(function () {
  document.querySelectorAll(".email-protected").forEach(function (el) {
    const button = el.querySelector(".email-reveal");
    if (!button) return;
    button.addEventListener("click", function () {
      const addr = atob(el.getAttribute("data-e")).split("").reverse().join("");
      const a = document.createElement("a");
      a.href = "mailto:" + addr;
      a.textContent = addr;
      el.replaceChildren(a);
    });
  });
})();

// ===== 論文：アブストラクトの開閉と BibTeX のコピー =====
(function () {
  document.querySelectorAll("[data-abstract-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const box = btn.closest(".pub-body").querySelector(".pub-abstract");
      const open = box.hidden;
      box.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("is-on", open);
    });
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return copyFallback(text); });
    }
    return copyFallback(text);
  }
  function copyFallback(text) {
    return new Promise(function (resolve, reject) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); } catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  document.querySelectorAll("[data-bibtex-copy]").forEach(function (btn) {
    const label = btn.innerHTML;
    btn.addEventListener("click", function () {
      const pre = btn.closest(".pub-body").querySelector(".pub-bibtex");
      copyText(pre.textContent).then(function () {
        btn.innerHTML = '<span data-ja>コピーしました ✓</span><span data-en>Copied ✓</span>';
        btn.classList.add("is-on");
        setTimeout(function () { btn.innerHTML = label; btn.classList.remove("is-on"); }, 1800);
      }, function () {
        pre.hidden = false;   // コピーできない環境では BibTeX を表示する
      });
    });
  });
})();

// ===== 追従する目次（今見ている場所に印）と、先頭へ戻るボタン =====
(function () {
  const toc = document.querySelector(".side-toc");
  const links = toc ? Array.prototype.slice.call(toc.querySelectorAll("a")) : [];
  const targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  const head = document.querySelector(".page-head, .hero");

  const top = document.createElement("button");
  top.type = "button";
  top.className = "to-top no-print";
  top.setAttribute("aria-label", "ページの先頭へ / Back to top");
  top.innerHTML = '<span aria-hidden="true"></span>';
  top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.body.appendChild(top);

  function update() {
    const y = window.scrollY;
    top.classList.toggle("is-visible", y > 600);
    if (!toc) return;
    toc.classList.toggle("is-visible", y > (head ? head.offsetHeight - 160 : 200));
    const line = window.innerHeight * 0.35;
    let active = -1;
    targets.forEach(function (el, i) {
      if (el && el.getBoundingClientRect().top <= line) active = i;
    });
    links.forEach(function (a, i) {
      a.classList.toggle("is-active", i === active);
    });
  }
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
})();
