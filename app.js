(() => {
  "use strict";
  const D = window.ANYPS5;
  const NS = "http://www.w3.org/2000/svg";
  const N = D.days.length;
  const LAST = N - 1;

  const CAT = {
    claude: { label: "Claude only", color: "var(--c-claude)" },
    both: { label: "Claude + GPT", color: "var(--c-both)" },
    gpt: { label: "GPT / Codex only", color: "var(--c-gpt)" },
    unknown: { label: "Unknown AI", color: "var(--c-unknown)" },
    human: { label: "No AI", color: "var(--c-human)" },
    undeclared: { label: "Undeclared", color: "var(--c-undeclared)" },
  };
  const AI_CATS = ["claude", "both", "gpt", "unknown"];
  const TYPE_SLOTS = ["feat", "fix", "test", "perf", "refactor", "docs"];
  const SLOT = ["var(--s1)", "var(--s2)", "var(--c-gpt)", "var(--c-unknown)", "var(--t5)", "var(--t6)", "var(--t7)"];
  const DISCLOSURE_LABEL = { yes: "Says yes", no: "Says no", blank: "Left blank", missing: "No field" };
  const TABS = [["overview", "Overview"], ["prs", "Pull requests"], ["ai", "AI tools"], ["games", "Games"], ["progress", "Progress"], ["contributors", "Contributors"], ["community", "Community"]];
  const RANGES = [["7", "7d"], ["30", "30d"], ["90", "90d"], ["all", "All"]];
  const EVIDENCE = [["any", "Any mention"], ["strong", "Strong only"]];
  const query = new URLSearchParams(location.search);

  const state = {
    tab: TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "overview",
    range: query.get("range") || localStorage.getItem("anyps5.range") || "all",
    evidence: query.get("evidence") || localStorage.getItem("anyps5.evidence") || "any",
    mode: "count",
    theme: new URLSearchParams(location.search).get("theme") || localStorage.getItem("anyps5.theme") || "dark",
  };

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return e;
  }
  function s(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  }

  const nf = new Intl.NumberFormat("en-US");
  const int = (v) => nf.format(Math.round(v));
  const compact = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
    return int(v);
  };
  const pct = (a, b, d = 1) => (b ? ((100 * a) / b).toFixed(d) + "%" : "–");
  const signed = (v, f = int) => (v > 0 ? "+" : v < 0 ? "−" : "±") + f(Math.abs(v));
  const hours = (v) => (v == null ? "–" : v < 48 ? v.toFixed(v < 10 ? 1 : 0) + " h" : (v / 24).toFixed(1) + " d");
  const dayDate = (i) => new Date(D.days[i] + "T00:00:00Z");
  const dayLabel = (i) => dayDate(i).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const median = (arr) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const zeros = () => new Array(N).fill(0);
  const sum = (arr, r) => { let t = 0; for (let d = r.lo; d <= r.hi; d++) t += arr[d]; return t; };

  const P = D.prs;
  const unpack = (str) => Array.from(str, (ch) => parseInt(ch, 16));
  const unrle = (runs) => { const out = []; for (let i = 0; i < runs.length; i += 2) for (let j = 0; j < runs[i + 1]; j++) out.push(runs[i]); return out; };
  for (const key of ["k", "ks", "t", "d", "dr"]) P[key] = unpack(P[key] || P.k);
  P.kAny = P.k;
  P.m = P.m.map((v, i) => (v < 0 ? -1 : P.c[i] + v));
  P.x = P.x.map((v, i) => (v < 0 ? -1 : P.c[i] + v));
  const otherBits = P.o;
  P.o = new Array(P.c.length).fill(0);
  for (const [i, v] of Object.entries(otherBits)) P.o[Number(i)] = v;
  const unblockMap = P.u || {};
  P.u = new Array(P.c.length).fill(null);
  for (const [i, v] of Object.entries(unblockMap)) P.u[Number(i)] = v;
  const TITLES = (D.titles || []).map(([id, name, discussion]) => ({ id, name, discussion }));
  for (const group of [D.progress.libs, D.progress.enc]) for (const name in group) group[name] = group[name].map(unrle);
  const ROWS = P.c.map((_, i) => i);
  const catIndex = Object.fromEntries(D.cats.map((c, i) => [c, i]));

  let openedByCat = [];
  function categorize() {
    P.k = state.evidence === "strong" ? P.ks : P.kAny;
    openedByCat = D.cats.map(zeros);
    for (const i of ROWS) openedByCat[P.k[i]][P.c[i]]++;
  }
  categorize();
  const openedByType = D.types.map(zeros);
  const disclosureByDay = D.disclosure.map(zeros);
  const opened = zeros(), merged = zeros(), closedUnmerged = zeros(), added = zeros(), deleted = zeros();
  const mergeHours = Array.from({ length: N }, () => []);
  const backlogDelta = zeros();
  const activeByDay = Array.from({ length: N }, () => new Set());
  const firstDay = new Map();
  for (const i of ROWS) {
    const c = P.c[i];
    opened[c]++;
    openedByType[P.t[i]][c]++;
    disclosureByDay[P.d[i]][c]++;
    activeByDay[c].add(P.a[i]);
    if (!firstDay.has(P.a[i]) || c < firstDay.get(P.a[i])) firstDay.set(P.a[i], c);
    backlogDelta[c]++;
    if (P.m[i] >= 0) {
      merged[P.m[i]]++;
      added[P.m[i]] += P.ad[i];
      deleted[P.m[i]] += P.de[i];
      mergeHours[P.m[i]].push(P.h[i]);
      backlogDelta[P.m[i]]--;
    } else if (P.x[i] >= 0) {
      closedUnmerged[P.x[i]]++;
      backlogDelta[P.x[i]]--;
    }
  }
  const backlog = [];
  backlogDelta.reduce((run, v) => (backlog.push(run + v), run + v), 0);
  const starsGained = D.community.stars.map((v, d) => {
    if (v == null) return null;
    for (let p = d - 1; p >= 0; p--) if (D.community.stars[p] != null) return v - D.community.stars[p];
    return null;
  });

  function range() {
    const lo = state.range === "all" ? 0 : Math.max(0, LAST - Number(state.range) + 1);
    return { lo, hi: LAST, len: LAST - lo + 1 };
  }
  function previous(r) {
    const hi = r.lo - 1, lo = hi - r.len + 1;
    return lo >= 0 ? { lo, hi, len: r.len } : null;
  }
  function buckets(r) {
    const size = r.len > 120 ? 7 : 1;
    const out = [];
    for (let d = r.lo; d <= r.hi; d += size) out.push({ lo: d, hi: Math.min(r.hi, d + size - 1) });
    return out;
  }
  function bucketTitle(b) {
    const base = b.lo === b.hi ? dayLabel(b.lo) : `${dayLabel(b.lo)} – ${dayLabel(b.hi)}`;
    return b.hi === LAST ? `${base} · today so far` : base;
  }
  const inRange = (i, r) => P.c[i] >= r.lo && P.c[i] <= r.hi;

  const tip = document.getElementById("tip");
  function showTip(pos, title, rows, total) {
    tip.replaceChildren(
      h("div", { class: "tip-title" }, title),
      ...rows.map((row) => h("div", { class: "tip-row" }, h("i", { style: row.color ? `background:${row.color}` : "" }), h("strong", {}, row.value), h("span", {}, row.label))),
    );
    if (total) tip.append(h("div", { class: "tip-row tip-total" }, h("i", {}), h("strong", {}, total.value), h("span", {}, total.label)));
    tip.hidden = false;
    const pad = 14, w = tip.offsetWidth, ht = tip.offsetHeight;
    let x = pos.clientX + pad, y = pos.clientY + pad;
    if (x + w > innerWidth - 8) x = pos.clientX - w - pad;
    if (y + ht > innerHeight - 8) y = pos.clientY - ht - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  const hideTip = () => { tip.hidden = true; };
  const centerOf = (node) => { const b = node.getBoundingClientRect(); return { clientX: b.left + b.width / 2, clientY: b.top + b.height / 3 }; };

  function niceScale(max, integer) {
    if (!(max > 0)) max = 1;
    const raw = max / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    let step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw);
    if (integer) step = Math.max(1, Math.round(step));
    const top = step * Math.ceil(max / step - 1e-9);
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    return { top, ticks };
  }

  function frame(container, { height, n, yMax, yFormat, integer, right, xLabel }) {
    const width = Math.max(260, container.clientWidth || 600);
    const m = { t: 10, r: right, b: 22, l: 42 };
    const W = width - m.l - m.r, H = height - m.t - m.b;
    const sc = niceScale(yMax, integer);
    const svg = s("svg", { viewBox: `0 0 ${width} ${height}`, height, role: "img" });
    const g = s("g", { transform: `translate(${m.l},${m.t})` });
    svg.append(g);
    const y = (v) => H - (v / sc.top) * H;
    for (const t of sc.ticks) {
      if (t > 0) g.append(s("line", { class: "pop-gridline", x1: 0, x2: W, y1: y(t), y2: y(t) }));
      g.append(s("text", { x: -10, y: y(t) + 3.5, "text-anchor": "end" }, yFormat(t)));
    }
    g.append(s("line", { class: "pop-baseline", x1: 0, x2: W, y1: H, y2: H }));
    const step = W / n;
    const xc = (i) => step * (i + 0.5);
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 78))));
    for (let i = 0; i < n; i += every) g.append(s("text", { x: xc(i), y: H + 16, "text-anchor": i === 0 && step < 30 ? "start" : "middle" }, xLabel(i)));
    container.append(svg);
    return { svg, g, W, H, y, step, xc, m, width };
  }

  function pointerIndex(f, evt, n) {
    const box = f.svg.getBoundingClientRect();
    const x = ((evt.clientX - box.left) * f.width) / box.width - f.m.l;
    return Math.max(0, Math.min(n - 1, Math.floor(x / f.step)));
  }

  const roundedTop = (x, y, w, hgt, r) =>
    r <= 0 ? `M${x},${y}h${w}v${hgt}h${-w}Z`
      : `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;

  function legend(series, kind = "box") {
    if (series.length < 2) return null;
    return h("div", { class: "legend" }, series.map((se) => h("span", {}, h("i", { class: kind === "line" ? "line" : "", style: `background:${se.color}` }), se.label)));
  }

  function bars(container, { bks, series, percent = false, height = 240, yFormat = compact, totalLabel = "Total", valueFormat = int }) {
    container.replaceChildren();
    const n = bks.length;
    const vals = series.map((se) => bks.map((b) => Math.max(0, se.get(b))));
    const totals = bks.map((_, j) => vals.reduce((a, v) => a + v[j], 0));
    const f = frame(container, {
      height, n, integer: !percent, right: 10,
      yMax: percent ? 100 : Math.max(1, ...totals),
      yFormat: percent ? (v) => `${v}%` : yFormat,
      xLabel: (j) => dayLabel(bks[j].lo),
    });
    const hover = s("rect", { class: "hover-col", y: 0, height: f.H, width: f.step, opacity: 0 });
    f.g.append(hover);
    const bw = Math.max(1, Math.min(f.step - Math.max(1, Math.min(4, f.step * 0.22)), 34));
    for (let j = 0; j < n; j++) {
      const tot = totals[j];
      if (!tot) continue;
      let top = -1;
      for (let k = series.length - 1; k >= 0; k--) if (vals[k][j] > 0) { top = k; break; }
      let acc = 0;
      const x = f.xc(j) - bw / 2;
      for (let k = 0; k < series.length; k++) {
        const v = vals[k][j];
        if (!v) continue;
        const val = percent ? (100 * v) / tot : v;
        const y1 = f.y(acc + val), y0 = f.y(acc);
        acc += val;
        let yy = y1, hh = y0 - y1;
        if (k !== top && hh > 3) { yy += 2; hh -= 2; }
        const r = k === top ? Math.min(3, bw / 2, hh) : 0;
        f.g.append(s("path", { d: roundedTop(x, yy, bw, Math.max(hh, 0.5), r), style: `fill:${series[k].color}` }));
      }
    }
    const show = (j, pos) => {
      hover.setAttribute("x", j * f.step);
      hover.setAttribute("opacity", 1);
      const tot = totals[j];
      const rows = series.map((se, k) => ({ color: se.color, value: valueFormat(vals[k][j]), label: series.length > 1 && tot ? `${se.label} · ${pct(vals[k][j], tot, 0)}` : se.label })).reverse();
      showTip(pos, bucketTitle(bks[j]), rows, series.length > 1 ? { value: valueFormat(tot), label: totalLabel } : null);
    };
    for (let j = 0; j < n; j++) {
      const hit = s("rect", { class: "hit", x: j * f.step, y: 0, width: f.step, height: f.H + 4, tabindex: n <= 120 ? 0 : null });
      hit.addEventListener("pointermove", (e) => show(j, e));
      hit.addEventListener("focus", () => show(j, centerOf(hit)));
      hit.addEventListener("pointerleave", () => { hover.setAttribute("opacity", 0); hideTip(); });
      hit.addEventListener("blur", () => { hover.setAttribute("opacity", 0); hideTip(); });
      f.g.append(hit);
    }
  }

  function lines(container, { bks, series, height = 240, yFormat = compact, integer = true, yMax, endLabels = true, valueFormat = int }) {
    container.replaceChildren();
    const n = bks.length;
    const vals = series.map((se) => bks.map((b) => se.get(b)));
    const finite = vals.flat().filter((v) => v != null && Number.isFinite(v));
    const labelled = endLabels && series.length <= 4;
    const f = frame(container, {
      height, n, integer, right: labelled ? 104 : 12,
      yMax: yMax ?? Math.max(1, ...finite), yFormat,
      xLabel: (j) => dayLabel(bks[j].lo),
    });
    const ends = [];
    series.forEach((se, k) => {
      let d = "", pen = false, last = null;
      vals[k].forEach((v, j) => {
        if (v == null || !Number.isFinite(v)) { pen = false; return; }
        d += `${pen ? "L" : "M"}${f.xc(j).toFixed(1)},${f.y(v).toFixed(1)}`;
        pen = true;
        last = j;
      });
      if (se.area && d) {
        const first = vals[k].findIndex((v) => v != null);
        f.g.append(s("path", { d: `${d}L${f.xc(last)},${f.H}L${f.xc(first)},${f.H}Z`, style: `fill:${se.color}`, opacity: 0.12 }));
      }
      f.g.append(s("path", { d, fill: "none", style: `stroke:${se.color}`, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": se.dash || null }));
      vals[k].forEach((v, j) => {
        if (v != null && vals[k][j - 1] == null && vals[k][j + 1] == null) f.g.append(s("circle", { cx: f.xc(j), cy: f.y(v), r: 3.5, style: `fill:${se.color}` }));
      });
      if (last != null) ends.push({ k, y: f.y(vals[k][last]), x: f.xc(last) });
    });
    if (labelled) {
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
      for (const e of ends) {
        f.g.append(s("circle", { cx: e.x, cy: f.y(vals[e.k][Math.round((e.x / f.step) - 0.5)]), r: 3, style: `fill:${series[e.k].color}` }));
        f.g.append(s("text", { class: "end-label", x: f.W + 10, y: e.y + 3.5 }, series[e.k].short || series[e.k].label));
      }
    }
    const cross = s("line", { class: "crosshair", y1: 0, y2: f.H, opacity: 0 });
    const dots = series.map((se) => s("circle", { r: 4, style: `fill:${se.color};stroke:var(--bg);stroke-width:2`, opacity: 0 }));
    f.g.append(cross, ...dots);
    const overlay = s("rect", { class: "hit", x: 0, y: 0, width: f.W, height: f.H + 4, tabindex: 0 });
    let current = LAST;
    const show = (j, pos) => {
      current = j;
      const x = f.xc(j);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("opacity", 1);
      dots.forEach((dot, k) => {
        const v = vals[k][j];
        if (v == null) { dot.setAttribute("opacity", 0); return; }
        dot.setAttribute("cx", x); dot.setAttribute("cy", f.y(v)); dot.setAttribute("opacity", 1);
      });
      const rows = series.map((se, k) => ({ color: se.color, value: vals[k][j] == null ? "–" : valueFormat(vals[k][j]), label: se.label }));
      showTip(pos, bucketTitle(bks[j]), rows);
    };
    const clear = () => { cross.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); hideTip(); };
    overlay.addEventListener("pointermove", (e) => show(pointerIndex(f, e, n), e));
    overlay.addEventListener("pointerleave", clear);
    overlay.addEventListener("blur", clear);
    overlay.addEventListener("focus", () => show(n - 1, centerOf(overlay)));
    overlay.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const j = Math.max(0, Math.min(n - 1, current + (e.key === "ArrowRight" ? 1 : -1)));
      const box = overlay.getBoundingClientRect();
      show(j, { clientX: box.left + (box.width * (j + 0.5)) / n, clientY: box.top + box.height / 3 });
    });
    f.g.append(overlay);
  }

  function rankPanel(rows, { valueHead = "PRs", shareHead = "Share" } = {}) {
    const maxShare = Math.max(0.0001, ...rows.map((r) => r.bar ?? r.share ?? 0));
    return h("div", { class: "pop-ranking-panel" },
      h("div", { class: "pop-ranking-heading" }, h("span", {}, ""), h("span", {}, valueHead), h("span", {}, shareHead)),
      rows.length ? rows.map((r, i) => h("div", { class: "pop-rank", title: r.title || null },
        h("span", { class: "pop-rank-number" }, i + 1),
        h("span", { class: "pop-rank-name" },
          r.color ? h("i", { class: "swatch", style: `background:${r.color}` }) : null,
          h("span", {}, r.name),
          h("i", { class: "pop-rank-bar", style: `width:${(100 * (r.bar ?? r.share ?? 0)) / maxShare}%;background:${r.color || "var(--accent)"}` })),
        h("span", { class: "pop-rank-value" }, r.value),
        h("span", { class: "pop-rank-share" }, r.shareText ?? (r.share != null ? `${(100 * r.share).toFixed(1)}%` : "")),
      )) : h("div", { class: "empty" }, "Nothing in this range"));
  }

  function stats(items, cls = "") {
    return h("div", { class: `pop-stats ${cls}` }, items.map((it) =>
      h("div", {}, h("span", {}, it.label), h("strong", {}, it.value), h("em", { class: it.trend || "" }, it.note || " "))));
  }
  function change(cur, prev, r, { points = false, invert = false, since = null } = {}) {
    if (prev == null) return { note: r.lo === 0 ? "since the first PR" : "" };
    const diff = points ? cur - prev : prev ? ((cur - prev) / prev) * 100 : null;
    if (diff == null) return { note: "" };
    const good = invert ? diff < 0 : diff > 0;
    const text = points ? `${signed(diff, (v) => v.toFixed(1))} pts` : `${signed(diff, (v) => v.toFixed(0))}%`;
    return { note: since ? `${text} since ${since}` : `${text} vs previous ${r.len}d`, trend: Math.abs(diff) < 0.05 ? "" : good ? "up" : "down" };
  }

  function section(title, sub, ...body) {
    return h("section", { class: "section" }, h("h2", {}, h("span", {}, title), sub ? h("span", { class: "sub" }, sub) : null), body);
  }
  function chartCard(title, caption, draws, draw, legendNode) {
    const box = h("div", { class: "pop-chart" });
    draws.push(() => draw(box));
    return h("div", { class: "chart-card" }, title ? h("h3", {}, title) : null, caption ? h("p", { class: "caption" }, caption) : null, legendNode, box);
  }
  function switcher(options, value, onPick) {
    return h("div", { class: "pop-switch", role: "group" }, options.map(([k, label]) =>
      h("button", { type: "button", class: k === value ? "active" : "", "aria-pressed": k === value ? "true" : "false", onclick: () => onPick(k) }, label)));
  }

  function sparkline(values) {
    const w = 84, ht = 18;
    const valid = values.filter((v) => v != null);
    const svg = s("svg", { class: "spark", width: w, height: ht, viewBox: `0 0 ${w} ${ht}` });
    if (valid.length < 2) return svg;
    const lo = Math.min(...valid), hi = Math.max(...valid);
    const y = (v) => (hi === lo ? ht / 2 : ht - 2 - ((v - lo) / (hi - lo)) * (ht - 4));
    const pts = values.map((v, i) => (v == null ? null : `${((i / (values.length - 1)) * (w - 2) + 1).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
    svg.append(s("polyline", { points: pts.join(" "), fill: "none", style: "stroke:var(--accent)", "stroke-width": 1.5, "stroke-linejoin": "round" }));
    return svg;
  }

  function dataTable({ columns, rows, sortKey, limit = 40, search }) {
    let key = sortKey, dir = -1, all = false, query = "";
    const wrap = h("div");
    const draw = () => {
      const col = columns.find((c) => c.key === key);
      let list = rows.filter((r) => !query || search(r).toLowerCase().includes(query));
      list.sort((a, b) => {
        const va = col.sort(a), vb = col.sort(b);
        return (typeof va === "string" ? va.localeCompare(vb) : va - vb) * dir;
      });
      const shown = all ? list : list.slice(0, limit);
      const table = h("table", { class: "data" },
        h("thead", {}, h("tr", {}, columns.map((c) => h("th", {
          class: c.key === key ? "sorted" : "", scope: "col",
          onclick: () => { if (key === c.key) dir = -dir; else { key = c.key; dir = c.asc ? 1 : -1; } draw(); },
        }, c.label, c.key === key ? (dir < 0 ? " ↓" : " ↑") : "")))),
        h("tbody", {}, shown.map((r) => h("tr", {}, columns.map((c) => {
          const cls = c.cls ? (typeof c.cls === "function" ? c.cls(r) : c.cls) : "";
          const td = h("td", { class: cls });
          const out = c.render(r);
          const nodes = (Array.isArray(out) ? out : [out]).filter((o) => o != null).map((o) => (o instanceof Node ? o : document.createTextNode(String(o))));
          if (cls === "name") td.append(h("span", { class: "cell-name" }, nodes));
          else td.append(...nodes);
          return td;
        })))));
      const tools = h("div", { class: "table-tools" },
        search ? h("input", { type: "search", placeholder: "Filter…", value: query, "aria-label": "Filter rows",
          oninput: (e) => { query = e.target.value.toLowerCase(); draw(); wrap.querySelector("input").focus(); } }) : null,
        list.length > limit ? h("button", { type: "button", onclick: () => { all = !all; draw(); } }, all ? "Show fewer" : `Show all ${list.length}`) : null,
        h("span", { class: "pop-note" }, `${list.length} rows`));
      const pos = wrap.querySelector("input")?.selectionStart;
      wrap.replaceChildren(tools, h("div", { class: "table-wrap" }, table));
      const input = wrap.querySelector("input");
      if (input && pos != null) input.setSelectionRange(pos, pos);
    };
    draw();
    return wrap;
  }

  const catSeries = (arrays, cats = D.cats) => cats.map((c) => ({ key: c, label: CAT[c].label, color: CAT[c].color, get: (b) => sum(arrays[catIndex[c]], b) }));
  const progressAt = (arr, d) => { for (let i = d; i >= 0; i--) if (arr[i]) return arr[i]; return null; };
  const progressBase = (arr, r) => {
    if (r.lo > 0 && progressAt(arr, r.lo - 1)) return progressAt(arr, r.lo - 1);
    for (let d = r.lo; d <= r.hi; d++) if (arr[d]) return arr[d];
    return null;
  };

  function prsInRange(r) { return ROWS.filter((i) => inRange(i, r)); }
  function countCats(list) {
    const counts = new Array(D.cats.length).fill(0);
    for (const i of list) counts[P.k[i]]++;
    return counts;
  }
  const aiShare = (counts) => { const tot = counts.reduce((a, b) => a + b, 0); return tot ? AI_CATS.reduce((a, c) => a + counts[catIndex[c]], 0) / tot : 0; };

  function viewOverview(r, draws) {
    const pr = previous(r);
    const cur = prsInRange(r), prev = pr ? prsInRange(pr) : null;
    const cc = countCats(cur), pc = prev ? countCats(prev) : null;
    const total = cur.length;
    const mergedCount = sum(merged, r);
    const mergedOfOpened = cur.filter((i) => P.m[i] >= 0).length;
    const withCount = (o, n) => (o.trend !== undefined ? o : { note: `${int(n)} PRs, incl. Claude + GPT` });
    const claudeTouched = (c) => c[catIndex.claude] + c[catIndex.both];
    const gptTouched = (c) => c[catIndex.gpt] + c[catIndex.both];
    const share = (v, c) => (100 * v) / Math.max(1, c.reduce((a, b) => a + b, 0));
    const lib = progressAt(D.progress.lib, r.hi), libBase = progressBase(D.progress.lib, r);
    const shd = progressAt(D.progress.shd, r.hi), shdBase = progressBase(D.progress.shd, r);
    const libGain = lib && libBase ? lib[0] - libBase[0] : 0;
    const shdGain = shd && shdBase ? shd[0] - shdBase[0] : 0;

    const head = stats([
      { label: "PRs opened", value: int(total), ...change(total, prev?.length, r) },
      { label: "PRs merged", value: int(mergedCount), ...change(mergedCount, pr ? sum(merged, pr) : null, r) },
      { label: "Merged so far", value: pct(mergedOfOpened, total, 0), note: "of PRs opened in range" },
      { label: "AI-assisted", value: `${(100 * aiShare(cc)).toFixed(1)}%`, ...change(100 * aiShare(cc), pc ? 100 * aiShare(pc) : null, r, { points: true }) },
      { label: "Claude-assisted", value: `${share(claudeTouched(cc), cc).toFixed(1)}%`, ...withCount(change(share(claudeTouched(cc), cc), pc ? share(claudeTouched(pc), pc) : null, r, { points: true }), claudeTouched(cc)) },
      { label: "GPT / Codex-assisted", value: `${share(gptTouched(cc), cc).toFixed(1)}%`, ...withCount(change(share(gptTouched(cc), cc), pc ? share(gptTouched(pc), pc) : null, r, { points: true }), gptTouched(cc)) },
      { label: "System library functions", value: lib ? pct(lib[0], lib[1]) : "–", note: lib ? `${int(lib[0])} / ${int(lib[1])} · ${signed(libGain)}` : "" },
      { label: "GPU shader instructions", value: shd ? pct(shd[0], shd[1]) : "–", note: shd ? `${int(shd[0])} / ${int(shd[1])} · ${signed(shdGain)}` : "" },
    ]);

    const bks = buckets(r);
    const series = catSeries(openedByCat);
    const chartBox = h("div", { class: "pop-chart" });
    const drawMain = () => bars(chartBox, { bks, series, percent: state.mode === "share", totalLabel: "PRs opened" });
    draws.push(drawMain);
    const modeSwitch = switcher([["count", "Count"], ["share", "Share"]], state.mode, (k) => {
      state.mode = k;
      modeSwitch.querySelectorAll("button").forEach((b, i) => { const on = ["count", "share"][i] === k; b.className = on ? "active" : ""; b.setAttribute("aria-pressed", on); });
      drawMain();
    });
    const ranking = rankPanel(D.cats.map((c) => ({ name: CAT[c].label, color: CAT[c].color, value: int(cc[catIndex[c]]), share: total ? cc[catIndex[c]] / total : 0 })).sort((a, b) => b.share - a.share));

    const libGains = Object.entries(D.progress.libs).map(([name, [done, tot]]) => {
      const base = done[Math.max(0, r.lo - 1)];
      return { name, gain: done[r.hi] - base, done: done[r.hi], total: tot[r.hi] };
    }).filter((x) => x.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 8);
    const gainTotal = Math.max(1, libGains.reduce((a, x) => a + Math.max(0, x.gain), 0));

    return h("div", {}, head,
      section("Pull requests by AI tool", "who wrote the code, by the PR's own disclosure and commit trailers",
        h("div", { class: "section-head" }, legend(series), modeSwitch),
        h("div", { class: "pop-panel-body" }, chartBox, ranking)),
      section("Implementation progress", "tools/progress.py replayed on main, day by day",
        h("div", { class: "pop-panel-body" },
          h("div", { class: "duo" },
            chartCard("System library functions", "implemented vs exported, all libraries", draws, (box) => lines(box, {
              bks, height: 220,
              series: [
                { label: "Implemented", short: "Implemented", color: "var(--s1)", area: true, get: (b) => progressAt(D.progress.lib, b.hi)?.[0] ?? null },
                { label: "Exported", short: "Exported", color: "var(--fg-3)", dash: "4 4", get: (b) => progressAt(D.progress.lib, b.hi)?.[1] ?? null },
              ] })),
            chartCard("GPU shader instructions", "decoded vs the RDNA 1 + 2 ISA", draws, (box) => lines(box, {
              bks, height: 220,
              series: [
                { label: "Implemented", short: "Implemented", color: "var(--s2)", area: true, get: (b) => progressAt(D.progress.shd, b.hi)?.[0] ?? null },
                { label: "ISA total", short: "ISA total", color: "var(--fg-3)", dash: "4 4", get: (b) => progressAt(D.progress.shd, b.hi)?.[1] ?? null },
              ] }))),
          rankPanel(libGains.map((x) => ({ name: x.name, value: signed(x.gain), share: x.gain / gainTotal, shareText: pct(x.done, x.total, 0), title: `${x.done} / ${x.total} implemented` })), { valueHead: "Gained", shareHead: "Done" }))));
  }

  function viewPrs(r, draws) {
    const bks = buckets(r);
    const cur = prsInRange(r);
    const hoursInRange = [];
    for (let d = r.lo; d <= r.hi; d++) hoursInRange.push(...mergeHours[d]);
    const openNow = ROWS.filter((i) => P.m[i] < 0 && P.x[i] < 0);
    const typeCounts = D.types.map((t, k) => ({ t, n: cur.filter((i) => P.t[i] === k).length }));
    const folded = D.types.filter((t) => !TYPE_SLOTS.includes(t));
    const typeSeries = [
      ...TYPE_SLOTS.map((t, k) => ({ label: t, color: SLOT[k], get: (b) => sum(openedByType[D.types.indexOf(t)], b) })),
      { label: "other", color: SLOT[6], get: (b) => folded.reduce((a, t) => a + sum(openedByType[D.types.indexOf(t)], b), 0) },
    ];
    const typeColor = (t) => SLOT[TYPE_SLOTS.includes(t) ? TYPE_SLOTS.indexOf(t) : 6];
    return h("div", {},
      stats([
        { label: "Opened", value: int(cur.length), note: `${(cur.length / r.len).toFixed(0)} per day` },
        { label: "Merged", value: int(sum(merged, r)), note: `${(sum(merged, r) / r.len).toFixed(0)} per day` },
        { label: "Closed unmerged", value: int(sum(closedUnmerged, r)), note: pct(sum(closedUnmerged, r), sum(closedUnmerged, r) + sum(merged, r), 0) + " of closures" },
        { label: "Open now", value: int(openNow.length), note: `${int(openNow.filter((i) => P.dr[i]).length)} drafts` },
        { label: "Median time to merge", value: hours(median(hoursInRange)), note: `p90 ${hours(hoursInRange.length ? [...hoursInRange].sort((a, b) => a - b)[Math.floor(hoursInRange.length * 0.9)] : null)}` },
        { label: "Lines merged", value: compact(sum(added, r) + sum(deleted, r)), note: `+${compact(sum(added, r))} / −${compact(sum(deleted, r))}` },
      ], "six"),
      section("Opened vs merged", "per day, PRs by bots excluded",
        h("div", { class: "pop-panel-body solo" }, chartCard(null, null, draws, (box) => lines(box, {
          bks, height: 250, series: [
            { label: "Opened", color: "var(--s1)", get: (b) => sum(opened, b) },
            { label: "Merged", color: "var(--s2)", get: (b) => sum(merged, b) },
            { label: "Closed unmerged", short: "Closed", color: "var(--fg-3)", dash: "3 4", get: (b) => sum(closedUnmerged, b) },
          ] })))),
      section("Queue health", null,
        h("div", { class: "pop-panel-body solo" }, h("div", { class: "duo" },
          chartCard("Open PR backlog", "open at the end of each day", draws, (box) => lines(box, { bks, height: 210, endLabels: false, series: [{ label: "Open PRs", color: "var(--s1)", area: true, get: (b) => backlog[b.hi] }] })),
          chartCard("Median time to merge", "of PRs merged that day", draws, (box) => lines(box, { bks, height: 210, endLabels: false, integer: false, yFormat: (v) => `${v}h`, valueFormat: hours, series: [{ label: "Median", color: "var(--s2)", get: (b) => { const a = []; for (let d = b.lo; d <= b.hi; d++) a.push(...mergeHours[d]); return median(a); } }] }))))),
      section("What kind of change", "Conventional Commit type of the PR title",
        h("div", { class: "section-head" }, legend(typeSeries)),
        h("div", { class: "pop-panel-body" },
          chartCard(null, null, draws, (box) => bars(box, { bks, series: typeSeries, totalLabel: "PRs opened" })),
          rankPanel(typeCounts.filter((x) => x.n).sort((a, b) => b.n - a.n).map((x) => ({ name: x.t, color: typeColor(x.t), value: int(x.n), share: x.n / Math.max(1, cur.length) }))))),
      section("Code churn", "lines added and deleted by merged PRs",
        h("div", { class: "pop-panel-body solo" }, chartCard(null, null, draws, (box) => lines(box, {
          bks, height: 220, series: [
            { label: "Added", color: "var(--s1)", get: (b) => sum(added, b) },
            { label: "Deleted", color: "var(--s2)", get: (b) => sum(deleted, b) },
          ] })))));
  }

  function viewAi(r, draws) {
    const bks = buckets(r);
    const cur = prsInRange(r);
    const cc = countCats(cur);
    const total = Math.max(1, cur.length);
    const disclosure = D.disclosure.map((k, j) => ({ k, n: cur.filter((i) => P.d[i] === j).length }));
    const filled = disclosure.filter((x) => x.k === "yes" || x.k === "no").reduce((a, x) => a + x.n, 0);
    const saidNo = cur.filter((i) => D.disclosure[P.d[i]] === "no" && ["claude", "gpt", "both"].includes(D.cats[P.k[i]])).length;
    const others = D.others.map((name, bit) => ({ name, n: cur.filter((i) => P.o[i] & (1 << bit)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    const rolling = (cats) => (b) => {
      let num = 0, den = 0;
      for (let d = Math.max(0, b.hi - 6); d <= b.hi; d++) {
        den += opened[d];
        for (const c of cats) num += openedByCat[catIndex[c]][d];
      }
      return den ? (100 * num) / den : null;
    };
    const kindOf = (i) => (TYPE_SLOTS.includes(D.types[P.t[i]]) ? D.types[P.t[i]] : "other");
    const sizeOf = (i) => { const n = P.ad[i] + P.de[i]; return n < 50 ? "S" : n <= 500 ? "M" : "L"; };
    const stratumOf = (i) => `${kindOf(i)}|${sizeOf(i)}`;
    const done = (i) => P.m[i] >= 0 || P.x[i] >= 0;
    const weights = new Map();
    for (const i of cur) if (done(i)) weights.set(stratumOf(i), (weights.get(stratumOf(i)) || 0) + 1);
    const outcome = (list) => { let m = 0, n = 0; for (const i of list) if (done(i)) { n++; if (P.m[i] >= 0) m++; } return { m, n, rate: n ? m / n : null }; };
    const adjusted = (list) => {
      const cells = new Map();
      for (const i of list) if (done(i)) { const s = stratumOf(i), c = cells.get(s) || { m: 0, n: 0 }; c.n++; if (P.m[i] >= 0) c.m++; cells.set(s, c); }
      let num = 0, den = 0;
      for (const [s, c] of cells) if (c.n >= 3) { num += weights.get(s) * (c.m / c.n); den += weights.get(s); }
      return den ? num / den : null;
    };
    const fare = D.cats.map((c) => {
      const list = cur.filter((i) => D.cats[P.k[i]] === c);
      const m = list.filter((i) => P.m[i] >= 0);
      const closed = list.filter((i) => P.x[i] >= 0);
      return {
        c, list, n: list.length, merged: m.length, closed: closed.length,
        rate: m.length + closed.length ? m.length / (m.length + closed.length) : null,
        adjusted: adjusted(list),
        hours: median(m.map((i) => P.h[i])),
        size: median(list.map((i) => P.ad[i] + P.de[i])),
        authors: new Set(list.map((i) => P.a[i])).size,
      };
    });
    const rateBar = (rate) => [rate == null ? "–" : `${(100 * rate).toFixed(0)}%`, h("span", { class: "pct-bar" }, h("b", { style: `width:${100 * (rate || 0)}%` }))];
    const breakdown = [
      ...[...TYPE_SLOTS, "other"].map((k) => ({ key: `t-${k}`, label: k, test: (i) => kindOf(i) === k })),
      { key: "s-S", label: "< 50 lines", test: (i) => sizeOf(i) === "S" },
      { key: "s-M", label: "50–500", test: (i) => sizeOf(i) === "M" },
      { key: "s-L", label: "> 500", test: (i) => sizeOf(i) === "L" },
    ];
    const matrixRows = fare.filter((x) => x.n).map((x) => ({ ...x, cells: Object.fromEntries(breakdown.map((b) => [b.key, outcome(x.list.filter(b.test))])) }));
    return h("div", {},
      stats([
        { label: "AI-assisted", value: pct(AI_CATS.reduce((a, c) => a + cc[catIndex[c]], 0), total), note: "Claude, GPT, both or unknown" },
        { label: "Claude only", value: pct(cc[catIndex.claude], total), note: `${int(cc[catIndex.claude])} PRs` },
        { label: "GPT / Codex only", value: pct(cc[catIndex.gpt], total), note: `${int(cc[catIndex.gpt])} PRs` },
        { label: "Both", value: pct(cc[catIndex.both], total), note: `${int(cc[catIndex.both])} PRs` },
        { label: "Unknown AI", value: pct(cc[catIndex.unknown], total), note: "says yes, names no tool" },
        { label: "Template filled", value: pct(filled, total), note: `${int(saidNo)} said no but name Claude or GPT` },
      ], "six"),
      section("Share of new PRs", "7-day rolling, % of PRs opened",
        h("div", { class: "pop-panel-body solo" }, chartCard(null, null, draws, (box) => lines(box, {
          bks, height: 250, yMax: 100, yFormat: (v) => `${v}%`, valueFormat: (v) => `${v.toFixed(1)}%`, series: [
            { label: "Claude (incl. both)", short: "Claude", color: CAT.claude.color, get: rolling(["claude", "both"]) },
            { label: "GPT / Codex (incl. both)", short: "GPT / Codex", color: CAT.gpt.color, get: rolling(["gpt", "both"]) },
            { label: "Unknown AI", short: "Unknown AI", color: CAT.unknown.color, get: rolling(["unknown"]) },
            { label: "No AI", short: "No AI", color: CAT.human.color, get: rolling(["human"]) },
          ] })))),
      section("How each group fares", "PRs opened in range; merge rates count closed PRs only",
        dataTable({
          rows: fare, sortKey: "n", limit: 10,
          columns: [
            { key: "c", label: "Group", asc: true, sort: (x) => D.cats.indexOf(x.c), cls: "name", render: (x) => [h("i", { class: "swatch", style: `background:${CAT[x.c].color}` }), CAT[x.c].label] },
            { key: "n", label: "PRs", sort: (x) => x.n, render: (x) => int(x.n) },
            { key: "share", label: "Share", sort: (x) => x.n, render: (x) => pct(x.n, total) },
            { key: "merged", label: "Merged", sort: (x) => x.merged, render: (x) => int(x.merged) },
            { key: "rate", label: "Merge rate", sort: (x) => x.rate ?? -1, render: (x) => rateBar(x.rate) },
            { key: "adjusted", label: "Type-adjusted", sort: (x) => x.adjusted ?? -1, render: (x) => rateBar(x.adjusted) },
            { key: "hours", label: "Median to merge", sort: (x) => x.hours ?? 1e9, render: (x) => hours(x.hours) },
            { key: "size", label: "Median lines", sort: (x) => x.size ?? 0, render: (x) => (x.size == null ? "–" : int(x.size)) },
            { key: "authors", label: "Authors", sort: (x) => x.authors, render: (x) => int(x.authors) },
          ],
        })),
      section("Merge rate by kind of change", "merged ÷ closed, per group; faded cells have fewer than 10 closed PRs",
        dataTable({
          rows: matrixRows, sortKey: "n", limit: 10,
          columns: [
            { key: "c", label: "Group", asc: true, sort: (x) => D.cats.indexOf(x.c), cls: "name", render: (x) => [h("i", { class: "swatch", style: `background:${CAT[x.c].color}` }), CAT[x.c].label] },
            { key: "n", label: "PRs", sort: (x) => x.n, cls: "muted", render: (x) => int(x.n) },
            ...breakdown.map((b) => ({
              key: b.key, label: b.label, sort: (x) => x.cells[b.key].rate ?? -1,
              cls: (x) => (x.cells[b.key].n < 10 ? "muted" : ""),
              render: (x) => { const c = x.cells[b.key]; return c.n ? h("span", { title: `${c.m} merged of ${c.n} closed` }, `${(100 * c.rate).toFixed(0)}%`) : "–"; },
            })),
          ],
        })),
      section("Disclosure", null,
        h("div", { class: "pop-panel-body solo" }, h("div", { class: "duo" },
          h("div", { class: "chart-card" }, h("h3", {}, "The AI-assisted field"), h("p", { class: "caption" }, "what the PR template line says"),
            rankPanel(disclosure.map((x) => ({ name: DISCLOSURE_LABEL[x.k], value: int(x.n), share: x.n / total })).sort((a, b) => b.share - a.share))),
          h("div", { class: "chart-card" }, h("h3", {}, "Other tools named"), h("p", { class: "caption" }, "inside Unknown AI: other labs mentioned in the PR or its commits"),
            rankPanel(others.map((x) => ({ name: x.name, value: int(x.n), share: x.n / total }))))))));
  }

  function progressTable(group, r, unit) {
    const rows = Object.entries(group).map(([name, [done, tot]]) => {
      const base = done[Math.max(0, r.lo - 1)];
      return { name, done: done[r.hi], total: tot[r.hi], gain: done[r.hi] - base, spark: done.slice(r.lo, r.hi + 1) };
    }).filter((x) => x.total > 0 || x.done > 0);
    return dataTable({
      rows, sortKey: "gain", limit: 25, search: (x) => x.name,
      columns: [
        { key: "name", label: unit, asc: true, sort: (x) => x.name, cls: "name", render: (x) => x.name },
        { key: "done", label: "Implemented", sort: (x) => x.done, render: (x) => int(x.done) },
        { key: "total", label: "Total", sort: (x) => x.total, cls: "muted", render: (x) => int(x.total) },
        { key: "pct", label: "Coverage", sort: (x) => (x.total ? x.done / x.total : 0), render: (x) => [pct(x.done, x.total, 0), h("span", { class: "pct-bar" }, h("b", { style: `width:${x.total ? (100 * x.done) / x.total : 0}%` }))] },
        { key: "gain", label: "Gained", sort: (x) => x.gain, cls: (x) => (x.gain > 0 ? "pos" : "muted"), render: (x) => signed(x.gain) },
        { key: "spark", label: "Trend", sort: (x) => x.gain, render: (x) => sparkline(x.spark) },
      ],
    });
  }

  function viewProgress(r, draws) {
    const bks = buckets(r);
    const lib = progressAt(D.progress.lib, r.hi), shd = progressAt(D.progress.shd, r.hi);
    const libBase = progressBase(D.progress.lib, r), shdBase = progressBase(D.progress.shd, r);
    const libs = Object.values(D.progress.libs).map(([d, t]) => [d[r.hi], t[r.hi]]).filter(([, t]) => t > 0);
    const daily = (arr, k) => (b) => {
      const end = progressAt(arr, b.hi), start = b.lo > 0 ? progressAt(arr, b.lo - 1) : null;
      return end && start ? end[k] - start[k] : 0;
    };
    return h("div", {},
      stats([
        { label: "Library functions", value: lib ? int(lib[0]) : "–", note: lib ? `of ${int(lib[1])} exported` : "" },
        { label: "Library coverage", value: lib ? pct(lib[0], lib[1]) : "–", ...(lib && libBase ? change(100 * lib[0] / lib[1], 100 * libBase[0] / libBase[1], r, { points: true, since: dayLabel(Math.max(0, r.lo - 1)) }) : {}) },
        { label: "Libraries complete", value: int(libs.filter(([d, t]) => d >= t).length), note: `of ${libs.length} with exports · ${libs.filter(([d]) => d === 0).length} untouched` },
        { label: "Shader instructions", value: shd ? int(shd[0]) : "–", note: shd ? `of ${int(shd[1])} in the ISA` : "" },
        { label: "Shader coverage", value: shd ? pct(shd[0], shd[1]) : "–", ...(shd && shdBase ? change(100 * shd[0] / shd[1], 100 * shdBase[0] / shdBase[1], r, { points: true, since: dayLabel(Math.max(0, r.lo - 1)) }) : {}) },
        { label: "Functions per day", value: lib ? ((lib[0] - (libBase ? libBase[0] : 0)) / r.len).toFixed(1) : "–", note: `shaders ${shd ? ((shd[0] - (shdBase ? shdBase[0] : 0)) / r.len).toFixed(1) : "–"} per day` },
      ], "six"),
      section("Coverage over time", "share implemented on the last main commit of each UTC day; library coverage dips when newly stubbed libraries add exports",
        h("div", { class: "pop-panel-body solo" }, chartCard(null, null, draws, (box) => lines(box, {
          bks, height: 260, yMax: 100, yFormat: (v) => `${v}%`, valueFormat: (v) => `${v.toFixed(2)}%`, series: [
            { label: "System library functions", short: "Libraries", color: "var(--s1)", get: (b) => { const v = progressAt(D.progress.lib, b.hi); return v && v[1] ? (100 * v[0]) / v[1] : null; } },
            { label: "GPU shader instructions", short: "Shaders", color: "var(--s2)", get: (b) => { const v = progressAt(D.progress.shd, b.hi); return v && v[1] ? (100 * v[0]) / v[1] : null; } },
          ] })))),
      section("Daily gains", "net change in implemented count",
        h("div", { class: "pop-panel-body solo" }, h("div", { class: "duo" },
          chartCard("Library functions", null, draws, (box) => bars(box, { bks, series: [{ label: "Functions implemented", color: "var(--s1)", get: daily(D.progress.lib, 0) }] })),
          chartCard("Shader instructions", null, draws, (box) => bars(box, { bks, series: [{ label: "Instructions decoded", color: "var(--s2)", get: daily(D.progress.shd, 0) }] }))))),
      section("System libraries", "sorted by functions gained in range", progressTable(D.progress.libs, r, "Library")),
      section("Shader encodings", "RDNA instruction encodings", progressTable(D.progress.enc, r, "Encoding")));
  }

  function viewContributors(r, draws) {
    const bks = buckets(r);
    const cur = prsInRange(r);
    const people = new Map();
    for (const i of cur) {
      const a = P.a[i];
      if (!people.has(a)) people.set(a, { a, n: 0, merged: 0, closed: 0, ad: 0, de: 0, cats: new Array(D.cats.length).fill(0), first: firstDay.get(a) });
      const p = people.get(a);
      p.n++;
      p.cats[P.k[i]]++;
      p.ad += P.ad[i];
      p.de += P.de[i];
      if (P.m[i] >= 0) p.merged++;
      else if (P.x[i] >= 0) p.closed++;
    }
    const list = [...people.values()];
    const newcomers = list.filter((p) => p.first >= r.lo).length;
    const allTime = [...firstDay.values()].filter((d) => d <= r.hi).length;
    const top = list.reduce((best, p) => (p.n > (best?.n || 0) ? p : best), null);
    const usesClaude = list.filter((p) => p.cats[catIndex.claude] + p.cats[catIndex.both] > 0).length;
    const usesGpt = list.filter((p) => p.cats[catIndex.gpt] + p.cats[catIndex.both] > 0).length;
    const contributorSeries = [
      { label: "Returning", color: "var(--s1)", get: (b) => { const seen = new Set(); for (let d = b.lo; d <= b.hi; d++) for (const a of activeByDay[d]) if (firstDay.get(a) < b.lo) seen.add(a); return seen.size; } },
      { label: "First PR", color: "var(--s2)", get: (b) => { let n = 0; for (const d of firstDay.values()) if (d >= b.lo && d <= b.hi) n++; return n; } },
    ];
    const mainTool = (p) => {
      const k = p.cats.indexOf(Math.max(...p.cats));
      return D.cats[k];
    };
    return h("div", {},
      stats([
        { label: "Active contributors", value: int(list.length), note: `${(cur.length / Math.max(1, list.length)).toFixed(1)} PRs each` },
        { label: "First-time contributors", value: int(newcomers), note: pct(newcomers, list.length, 0) + " of active" },
        { label: "All-time contributors", value: int(allTime), note: "opened at least one PR" },
        { label: "Top contributor", value: top ? D.authors[top.a] : "–", note: top ? `${int(top.n)} PRs · ${pct(top.n, cur.length, 1)}` : "" },
        { label: "Used Claude", value: pct(usesClaude, list.length, 0), note: `${int(usesClaude)} people` },
        { label: "Used GPT / Codex", value: pct(usesGpt, list.length, 0), note: `${int(usesGpt)} people` },
      ], "six"),
      section("Contributors per day", "people who opened a PR",
        h("div", { class: "section-head" }, legend(contributorSeries)),
        h("div", { class: "pop-panel-body solo" }, chartCard(null, null, draws, (box) => bars(box, { bks, series: contributorSeries, totalLabel: "Active" })))),
      section("Leaderboard", "PRs opened in range",
        dataTable({
          rows: list, sortKey: "n", limit: 30, search: (p) => D.authors[p.a],
          columns: [
            { key: "a", label: "Contributor", asc: true, sort: (p) => D.authors[p.a].toLowerCase(), cls: "name", render: (p) => [
              h("img", { class: "avatar", src: `https://github.com/${encodeURIComponent(D.authors[p.a])}.png?size=40`, alt: "", loading: "lazy" }),
              h("a", { href: `https://github.com/${D.repo}/pulls?q=is%3Apr+author%3A${encodeURIComponent(D.authors[p.a])}`, target: "_blank", rel: "noopener" }, D.authors[p.a])] },
            { key: "n", label: "PRs", sort: (p) => p.n, render: (p) => int(p.n) },
            { key: "merged", label: "Merged", sort: (p) => p.merged, render: (p) => int(p.merged) },
            { key: "rate", label: "Merge rate", sort: (p) => (p.merged + p.closed ? p.merged / (p.merged + p.closed) : -1), render: (p) => (p.merged + p.closed ? pct(p.merged, p.merged + p.closed, 0) : "–") },
            { key: "lines", label: "Lines", sort: (p) => p.ad + p.de, cls: "muted", render: (p) => `+${compact(p.ad)} / −${compact(p.de)}` },
            { key: "tool", label: "Mostly", asc: true, sort: (p) => D.cats.indexOf(mainTool(p)), render: (p) => CAT[mainTool(p)].label },
            { key: "mix", label: "Tool mix", sort: (p) => (p.cats[catIndex.claude] + p.cats[catIndex.both]) / p.n, render: (p) => h("span", { class: "mix", title: D.cats.map((c, k) => `${CAT[c].label}: ${p.cats[k]}`).join("\n") }, D.cats.map((c, k) => (p.cats[k] ? h("b", { style: `width:${(100 * p.cats[k]) / p.n}%;background:${CAT[c].color}` }) : null))) },
          ],
        })));
  }

  function viewCommunity(r, draws) {
    const bks = buckets(r);
    const C = D.community;
    const forks = sum(C.forks, r), io = sum(C.issuesOpened, r), ic = sum(C.issuesClosed, r);
    const pr = previous(r);
    const latest = (arr) => { for (let d = r.hi; d >= 0; d--) if (arr[d] != null) return arr[d]; return null; };
    const gainedIn = (b) => { let t = null; for (let d = b.lo; d <= b.hi; d++) if (starsGained[d] != null) t = (t || 0) + starsGained[d]; return t; };
    const since = C.trackedSince ? dayLabel(D.days.indexOf(C.trackedSince)) : "–";
    const gained = gainedIn(r);
    return h("div", {},
      stats([
        { label: "Stars", value: latest(C.stars) == null ? "–" : int(latest(C.stars)), note: `${int(latest(C.watchers) || 0)} watching` },
        { label: "Stars gained", value: gained == null ? "–" : signed(gained), note: `tracked since ${since}` },
        { label: "Forks created", value: int(forks), ...change(forks, pr ? sum(C.forks, pr) : null, r) },
        { label: "Issues opened", value: int(io), ...change(io, pr ? sum(C.issuesOpened, pr) : null, r) },
        { label: "Issues closed", value: int(ic), note: `net ${signed(io - ic)} open` },
        { label: "Open issues", value: latest(C.openIssues) == null ? "–" : int(latest(C.openIssues)), note: "right now" },
      ], "six"),
      section("Stars", `GitHub hides this repository's stargazer list, so stars are snapshotted once a day since ${since}`,
        h("div", { class: "pop-panel-body solo" }, h("div", { class: "duo" },
          chartCard("Stars gained per day", null, draws, (box) => bars(box, { bks, series: [{ label: "Stars gained", color: "var(--accent)", get: (b) => gainedIn(b) || 0 }] })),
          chartCard("Total stars", null, draws, (box) => lines(box, { bks, endLabels: false, series: [{ label: "Stars", color: "var(--accent)", area: true, get: (b) => { for (let d = b.hi; d >= b.lo; d--) if (C.stars[d] != null) return C.stars[d]; return null; } }] }))))),
      section("Forks and issues", null,
        h("div", { class: "pop-panel-body solo" }, h("div", { class: "duo" },
          chartCard("Forks per day", null, draws, (box) => bars(box, { bks, series: [{ label: "Forks", color: "var(--s1)", get: (b) => sum(C.forks, b) }] })),
          chartCard("Issues", "opened vs closed per day", draws, (box) => lines(box, { bks, series: [
            { label: "Opened", color: "var(--s1)", get: (b) => sum(C.issuesOpened, b) },
            { label: "Closed", color: "var(--s2)", get: (b) => sum(C.issuesClosed, b) },
          ] }))))));
  }

  function viewGames(r, draws) {
    const bks = buckets(r);
    const rows = ROWS.filter((i) => P.u[i] && P.u[i].length);
    const mergedIn = (i, b) => P.m[i] >= b.lo && P.m[i] <= b.hi;
    const mergedR = rows.filter((i) => mergedIn(i, r));
    const openNow = rows.filter((i) => P.m[i] < 0 && P.x[i] < 0);
    const firstMerge = new Map(), firstNamed = new Map();
    for (const i of rows) for (const t of P.u[i]) {
      if (!firstNamed.has(t) || P.c[i] < firstNamed.get(t)) firstNamed.set(t, P.c[i]);
      if (P.m[i] >= 0 && (!firstMerge.has(t) || P.m[i] < firstMerge.get(t))) firstMerge.set(t, P.m[i]);
    }
    const reachedIn = new Set();
    for (const i of mergedR) for (const t of P.u[i]) reachedIn.add(t);
    const newGames = [...firstMerge.values()].filter((d) => d >= r.lo && d <= r.hi).length;
    const cc = countCats(mergedR);
    const mergedAll = sum(merged, r);
    const byCat = D.cats.map(zeros);
    for (const i of rows) if (P.m[i] >= 0) byCat[P.k[i]][P.m[i]]++;
    const series = D.cats.map((c) => ({ label: CAT[c].label, color: CAT[c].color, get: (b) => sum(byCat[catIndex[c]], b) }));
    const cumulative = (map) => { const per = zeros(); for (const d of map.values()) per[d]++; const out = []; per.reduce((run, v) => (out.push(run + v), run + v), 0); return out; };
    const reached = cumulative(firstMerge), named = cumulative(firstNamed);
    const games = new Map();
    for (const i of rows) for (const t of P.u[i]) {
      if (!games.has(t)) games.set(t, { t, inRange: 0, all: 0, open: 0, last: -1, cats: new Array(D.cats.length).fill(0), people: new Set() });
      const g = games.get(t);
      if (P.m[i] >= 0) {
        g.all++;
        g.cats[P.k[i]]++;
        g.last = Math.max(g.last, P.m[i]);
        if (mergedIn(i, r)) g.inRange++;
      } else if (P.x[i] < 0) g.open++;
      g.people.add(P.a[i]);
    }
    const share = (cats) => pct(cats.reduce((a, c) => a + cc[catIndex[c]], 0), mergedR.length);
    const gameName = (t) => TITLES[t].name || TITLES[t].id;
    return h("div", {},
      stats([
        { label: "Games unblocked", value: int(reachedIn.size), note: "had an unblocking PR merged" },
        { label: "First-time unblocks", value: int(newGames), note: `${int(firstMerge.size)} games all time` },
        { label: "Unblocking PRs merged", value: int(mergedR.length), note: `${pct(mergedR.length, mergedAll)} of merged PRs` },
        { label: "By Claude", value: share(["claude", "both"]), note: "of unblocking PRs, incl. both" },
        { label: "By GPT / Codex", value: share(["gpt", "both"]), note: "of unblocking PRs, incl. both" },
        { label: "Waiting", value: int(openNow.length), note: "open PRs that name a game" },
      ], "six"),
      section("Game-unblocking PRs merged", `PRs whose Unblocks field names a title ID, by merge day; first used ${rows.length ? dayLabel(Math.min(...rows.map((i) => P.c[i]))) : "–"}`,
        h("div", { class: "section-head" }, legend(series)),
        h("div", { class: "pop-panel-body" },
          chartCard(null, null, draws, (box) => bars(box, { bks, series, totalLabel: "Unblocking PRs" })),
          rankPanel(D.cats.map((c) => ({ name: CAT[c].label, color: CAT[c].color, value: int(cc[catIndex[c]]), share: mergedR.length ? cc[catIndex[c]] / mergedR.length : 0 })).filter((x) => x.share > 0).sort((a, b) => b.share - a.share)))),
      section("Games reached", "distinct titles over time",
        h("div", { class: "pop-panel-body solo" }, chartCard(null, null, draws, (box) => lines(box, {
          bks, height: 240, series: [
            { label: "Named in any PR", short: "Named", color: "var(--fg-3)", dash: "4 4", get: (b) => named[b.hi] },
            { label: "Unblocked by a merged PR", short: "Unblocked", color: "var(--accent)", area: true, get: (b) => reached[b.hi] },
          ] })))),
      section("Games", "every title named in an Unblocks field; links go to its bring-up discussion",
        dataTable({
          rows: [...games.values()], sortKey: "inRange", limit: 30, search: (g) => `${TITLES[g.t].id} ${gameName(g.t)}`,
          columns: [
            { key: "name", label: "Game", asc: true, sort: (g) => gameName(g.t).toLowerCase(), cls: "name", render: (g) => [
              TITLES[g.t].discussion ? h("a", { href: `https://github.com/${D.repo}/discussions/${TITLES[g.t].discussion}`, target: "_blank", rel: "noopener" }, gameName(g.t)) : gameName(g.t),
              TITLES[g.t].name ? h("span", { class: "muted-id" }, TITLES[g.t].id) : null] },
            { key: "inRange", label: "Merged in range", sort: (g) => g.inRange, cls: (g) => (g.inRange ? "" : "muted"), render: (g) => int(g.inRange) },
            { key: "all", label: "Merged all time", sort: (g) => g.all, render: (g) => int(g.all) },
            { key: "open", label: "Open", sort: (g) => g.open, cls: "muted", render: (g) => int(g.open) },
            { key: "people", label: "Contributors", sort: (g) => g.people.size, render: (g) => int(g.people.size) },
            { key: "last", label: "Last merged", sort: (g) => g.last, cls: "muted", render: (g) => (g.last < 0 ? "–" : dayLabel(g.last)) },
            { key: "mix", label: "Tool mix", sort: (g) => (g.all ? (g.cats[catIndex.claude] + g.cats[catIndex.both]) / g.all : -1), render: (g) => h("span", { class: "mix", title: D.cats.map((c, k) => `${CAT[c].label}: ${g.cats[k]}`).join("\n") }, D.cats.map((c, k) => (g.cats[k] ? h("b", { style: `width:${(100 * g.cats[k]) / g.all}%;background:${CAT[c].color}` }) : null))) },
          ],
        })));
  }

  const VIEWS = { overview: viewOverview, prs: viewPrs, ai: viewAi, games: viewGames, progress: viewProgress, contributors: viewContributors, community: viewCommunity };

  function chrome() {
    document.documentElement.dataset.theme = state.theme;
    document.getElementById("theme").textContent = state.theme === "dark" ? "☀" : "☾";
    document.getElementById("tabs").replaceChildren(...TABS.map(([k, label]) =>
      h("button", { type: "button", class: k === state.tab ? "active" : "", "aria-current": k === state.tab ? "page" : null, onclick: () => { state.tab = k; history.replaceState(null, "", `#${k}`); render(); } }, label)));
    document.getElementById("range").replaceChildren(...RANGES.map(([k, label]) =>
      h("button", { type: "button", class: k === state.range ? "active" : "", "aria-pressed": k === state.range ? "true" : "false", onclick: () => { state.range = k; localStorage.setItem("anyps5.range", k); render(); } }, label)));
    document.getElementById("evidence").replaceChildren(h("span", { class: "switch-label" }, "Evidence"), ...EVIDENCE.map(([k, label]) =>
      h("button", { type: "button", class: k === state.evidence ? "active" : "", "aria-pressed": k === state.evidence ? "true" : "false",
        title: k === "strong" ? "Count Claude or GPT only from Co-Authored-By trailers, tool footers, commit authors, codex/ or claude/ branches, or the author's own AI-assisted answer" : "Also count Claude or GPT when the PR text merely mentions them",
        onclick: () => { state.evidence = k; localStorage.setItem("anyps5.evidence", k); categorize(); render(); } }, label)));
    const r = range();
    const year = dayDate(r.hi).getUTCFullYear();
    let moved = 0;
    if (state.evidence === "strong") for (const i of ROWS) if (P.c[i] >= r.lo && P.c[i] <= r.hi && P.ks[i] !== P.kAny[i]) moved++;
    document.getElementById("range-context").textContent = `${state.evidence === "strong" ? `Strong only moved ${int(moved)} PRs · ` : ""}${dayLabel(r.lo)} – ${dayLabel(r.hi)} ${year} · ${r.len > 120 ? "weekly" : "daily"} · UTC`;
    const updated = new Date(D.generated);
    document.getElementById("updated").textContent = `Updated ${updated.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;
    document.getElementById("footnote").replaceChildren(
      h("p", {}, "Source: ", h("a", { href: `https://github.com/${D.repo}`, target: "_blank", rel: "noopener" }, D.repo), " pull requests via the GitHub API, and ", h("a", { href: "https://boykopovar.github.io/AnyPS5/progress.html", target: "_blank", rel: "noopener" }, "tools/progress.py"), " replayed on the last main commit of every UTC day with today's rules."),
      h("p", {}, "Claude and GPT / Codex come from the PR body, branch name (claude/…, codex/…) and commit messages or authors (Co-Authored-By trailers, Claude Code and Codex footers). Strong only ignores PRs that merely mention a tool in their text and keeps trailers, footers, commit authors, branches and the author's own AI-assisted answer. Unknown AI says AI-assisted: yes but names neither, or names another lab. No AI says AI-assisted: no with no trace; Undeclared has no answer. Bot PRs are excluded."),
      h("p", {}, "A tool appearing on a PR shows it was used, not how much of the code it wrote. Merge rate reflects review outcomes, not code quality; the type-adjusted rate compares groups on the same mix of change types and sizes. Games come from the template's Unblocks field and the Game bring-up discussion titles."));
  }

  function render() {
    chrome();
    const draws = [];
    const node = VIEWS[state.tab](range(), draws);
    document.getElementById("view").replaceChildren(node);
    draws.forEach((fn) => fn());
  }

  document.getElementById("theme").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("anyps5.theme", state.theme);
    chrome();
  });
  window.addEventListener("hashchange", () => {
    const k = location.hash.slice(1);
    if (VIEWS[k] && k !== state.tab) { state.tab = k; render(); }
  });
  let resizeTimer = 0, lastWidth = innerWidth;
  window.addEventListener("resize", () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });
  window.addEventListener("scroll", hideTip, { passive: true });
  render();
})();
