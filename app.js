/* Two-view gallery:
   - "bench" view: 6 sub-tabs (5 datasets + overall). Each shows a metric
     summary table + per-metric delta-ranking leaderboards + 30 DaS-good
     Wan-bad triptychs.
   - "qual"  view: legacy 451 qualitative cards, dataset-filtered.
*/

const DS_KEYS = ["egodex", "hdepic", "stereo4d", "yt-vis", "davis", "experiment"];
const DS_CSS   = { "yt-vis": "ytvis" };
const DS_LABEL = { egodex: "egodex", hdepic: "hd-epic", stereo4d: "stereo4d",
                   "yt-vis": "yt-vis", davis: "davis", hot3d: "hot3d-aria",
                   experiment: "experiment" };

const TAG_LABEL = {
  das_p2:   "DaS (ours)",
  wan22_5b: "Wan 2.2-TI2V-5B",
};

/* bench tabs route through data-ds; "overall" is a synthetic scope. */
const BENCH_TAGS   = ["das_p2", "wan22_5b"];

/* CLIP-T intentionally omitted — text-alignment prompt-similarity is
   confounded by the noobj suffix and not informative for our motion
   comparison. */
const METRICS = [
  { key: "tem_con",             label: "Tem-Con",      dir: "up",   fmt: x => x.toFixed(3), errFmt: x => x.toFixed(3) },
  { key: "subject_consistency", label: "Subject-Cons.",dir: "up",   fmt: x => x.toFixed(3), errFmt: x => x.toFixed(3) },
  { key: "fvd",                 label: "FVD",          dir: "down", fmt: x => x.toFixed(1), errFmt: x => x.toFixed(1) },
];
const PER_CLIP_METRICS = METRICS.filter(m => m.key !== "fvd");

function fmtCell(s, m) {
  const v = s[m.key];
  if (v == null) return "–";
  const err = s[`${m.key}_stderr`];
  if (err == null) return m.fmt(v);
  return `${m.fmt(v)} <span class="stderr">± ${m.errFmt(err)}</span>`;
}

let BENCH       = null; // bench_manifest.json (orig 730-bench)
let BENCH_NOOBJ = null; // bench_noobj_manifest.json (6-ds, "no new objects" prompt suffix)
let QUAL        = null; // legacy manifest.json
let STATE = {
  view: "bench",        // "bench" | "bench_noobj" | "qual"
  benchScope: "davis",
  noobjScope: "davis",
  qualDataset: "all",
  query: "",
};

const $ = s => document.querySelector(s);

async function boot() {
  const [benchRes, qualRes, noobjRes] = await Promise.all([
    fetch("bench_manifest.json"),
    fetch("manifest.json"),
    fetch("bench_noobj_manifest.json").catch(() => null),
  ]);
  BENCH = await benchRes.json();
  QUAL  = await qualRes.json();
  if (noobjRes && noobjRes.ok) {
    BENCH_NOOBJ = await noobjRes.json();
  } else {
    // Hide the noobj tab row entirely if the manifest isn't available yet.
    const row = document.getElementById("tag-row-bench-noobj");
    if (row) row.style.display = "none";
  }
  initTheme();
  initControls();
  render();
}

/* Which manifest a "bench-style" view should use. */
function manifestForView(view) {
  if (view === "bench_noobj") return BENCH_NOOBJ;
  return BENCH;
}
function scopeForView(view) {
  if (view === "bench_noobj") return STATE.noobjScope;
  return STATE.benchScope;
}

function initTheme() {
  const saved = localStorage.getItem("das-theme");
  if (saved === "light") document.documentElement.setAttribute("data-theme", "light");
  $("#theme-toggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("das-theme", next);
  });
}

function initControls() {
  document.querySelectorAll(".tag-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tag-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      const ds   = btn.dataset.ds;
      STATE.view = view;
      if      (view === "bench")        STATE.benchScope   = ds;
      else if (view === "bench_noobj")  STATE.noobjScope   = ds;
      else                              STATE.qualDataset  = ds;
      render();
    });
  });
  let timer;
  $("#search").addEventListener("input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => { STATE.query = e.target.value.toLowerCase().trim(); render(); }, 120);
  });
}

/* ---------------- render ---------------- */
function render() {
  if (STATE.view === "bench" || STATE.view === "bench_noobj") {
    $("#bench-view").style.display = "";
    $("#gallery").style.display    = "none";
    renderBench(scopeForView(STATE.view), manifestForView(STATE.view));
  } else {
    $("#bench-view").style.display = "none";
    $("#gallery").style.display    = "";
    renderQualGallery();
  }
}

/* ============== BENCH VIEW ============== */

function summaryForScope(bench, scope) {
  if (scope === "overall") return bench.overall_summary;
  return bench.per_dataset_summary[scope];
}

function renderBench(scope, bench) {
  renderBenchSummary(scope, bench);
  renderPerMetricLeaderboards(scope, bench);
  renderBenchGallery(scope, bench);
  $("#counts").textContent = benchCountsLine(scope, bench);
}

function benchCountsLine(scope, bench) {
  const summary = summaryForScope(bench, scope);
  const n = summary.das_p2.n_clips;
  const tag = STATE.view === "bench_noobj" ? "noobj · " : "";
  if (scope === "overall") {
    return `${tag}overall · ${n} clips across ${bench.scopes.length - 1} datasets · showing top-30 by Δ (DaS − Wan)`;
  }
  return `${tag}${scope} · ${n} clips · showing top-30 by Δ (DaS − Wan)`;
}

function renderBenchSummary(scope, bench) {
  if (scope !== "overall") {
    const sum = summaryForScope(bench, scope);
    // Winners
    const winners = {};
    METRICS.forEach(m => {
      let best = null, bestTag = null;
      BENCH_TAGS.forEach(t => {
        const v = sum[t][m.key];
        if (v == null) return;
        const better = best === null ? true : (m.dir === "up" ? v > best : v < best);
        if (better) { best = v; bestTag = t; }
      });
      winners[m.key] = bestTag;
    });
    const header = `<thead><tr><th>model</th>${
      METRICS.map(m => `<th>${m.label} ${m.dir === "up" ? "↑" : "↓"}</th>`).join("")
    }</tr></thead>`;
    const body = BENCH_TAGS.map(tag => {
      const s = sum[tag];
      const cells = METRICS.map(m => {
        const wins = winners[m.key] === tag;
        return `<td${wins ? ` class="win"` : ""}>${fmtCell(s, m)}</td>`;
      }).join("");
      return `<tr><th scope="row">${escapeHTML(TAG_LABEL[tag])}</th>${cells}</tr>`;
    }).join("");
    const variantBlurb = STATE.view === "bench_noobj"
      ? ` Prompts have <code>". no new objects, people, or artifacts should be added to the scene"</code> appended to suppress object hallucination.`
      : "";
    $("#bench-summary").innerHTML = `
      <div class="section-eyebrow">${STATE.view === "bench_noobj" ? "Noobj prompt benchmark" : "Dataset benchmark"} · ${escapeHTML(scope)}</div>
      <h2 class="bench-scope-title">DaS vs Wan 2.2-TI2V-5B on <code>${escapeHTML(scope)}</code> (n=${sum.das_p2.n_clips})</h2>
      <p class="section-blurb">
        Per-clip Tem-Con / Subject-Consistency reported as mean ± stderr over
        the clip intersection. FVD is set-level (I3D via cd-fvd), computed
        between generated clips and the corresponding GT source mp4s.${variantBlurb}
      </p>
      <div class="bench-table-wrap"><table class="bench">${header}<tbody>${body}</tbody></table></div>
    `;
  } else {
    // overall: ONE flat table -- per-dataset rows + a pooled "all" row per
    // model. No rowspan grouping. Per-clip metrics shown as mean ± stderr;
    // FVD is per-dataset (distribution-level) and the "all" row averages the
    // per-dataset FVDs (± stderr across datasets).
    const per = bench.per_dataset_summary;
    const scopes = bench.scopes.filter(s => s !== "overall");
    const rows = [];
    rows.push(`<thead><tr><th>dataset</th><th>model</th>${
      METRICS.map(m => `<th>${m.label} ${m.dir === "up" ? "↑" : "↓"}</th>`).join("")
    }</tr></thead>`);
    const body = [];
    for (const ds of scopes) {
      // Per-dataset winners (highlight the better of the two cells per metric)
      const dsWinners = {};
      METRICS.forEach(m => {
        let best = null, bestTag = null;
        BENCH_TAGS.forEach(t => {
          const v = per[ds][t][m.key];
          if (v == null) return;
          const better = best === null ? true : (m.dir === "up" ? v > best : v < best);
          if (better) { best = v; bestTag = t; }
        });
        dsWinners[m.key] = bestTag;
      });
      BENCH_TAGS.forEach(tag => {
        const s = per[ds][tag];
        const cells = METRICS.map(m => {
          const wins = dsWinners[m.key] === tag;
          return `<td${wins ? ` class="win"` : ""}>${fmtCell(s, m)}</td>`;
        }).join("");
        body.push(`<tr><td><code>${escapeHTML(ds)}</code></td><td>${escapeHTML(TAG_LABEL[tag])}</td>${cells}</tr>`);
      });
    }
    // Pooled "all" rows
    const ov = bench.overall_summary;
    const ovWinners = {};
    METRICS.forEach(m => {
      let best = null, bestTag = null;
      BENCH_TAGS.forEach(t => {
        const v = ov[t][m.key];
        if (v == null) return;
        const better = best === null ? true : (m.dir === "up" ? v > best : v < best);
        if (better) { best = v; bestTag = t; }
      });
      ovWinners[m.key] = bestTag;
    });
    BENCH_TAGS.forEach(tag => {
      const s = ov[tag];
      const cells = METRICS.map(m => {
        const wins = ovWinners[m.key] === tag;
        return `<td${wins ? ` class="win"` : ""}>${fmtCell(s, m)}</td>`;
      }).join("");
      body.push(`<tr class="overall-row-tr"><td><strong>all</strong></td><td>${escapeHTML(TAG_LABEL[tag])}</td>${cells}</tr>`);
    });

    const variant = STATE.view === "bench_noobj" ? "noobj prompt suffix · " : "";
    const variantBlurb = STATE.view === "bench_noobj"
      ? ` Prompts have <code>". no new objects, people, or artifacts should be added to the scene"</code> appended; HOT3D-Aria adds a 6th dataset.`
      : "";
    $("#bench-summary").innerHTML = `
      <div class="section-eyebrow">${variant}Overall benchmark — ${scopes.length} datasets</div>
      <h2 class="bench-scope-title">DaS vs Wan 2.2-TI2V-5B</h2>
      <p class="section-blurb">
        Per-dataset rows for each model, plus a pooled <em>all</em> row at the
        bottom. Per-clip Tem-Con / Subject-Consistency are mean ± stderr; the
        <em>all</em> row pools per-clip values across the ${scopes.length}
        datasets. FVD is set-level per dataset (I3D via cd-fvd) — the
        <em>all</em> row averages the ${scopes.length} per-dataset FVDs
        (± stderr across datasets).${variantBlurb}
      </p>
      <div class="bench-table-wrap"><table class="bench overall-bench">${rows.join("")}<tbody>${body.join("")}</tbody></table></div>
    `;
  }
}

function renderPerMetricLeaderboards(scope, bench) {
  // The per-dataset per-metric "DaS good, Wan bad" leaderboards live only
  // for non-overall scopes. For overall we hide this section.
  if (scope === "overall" || !bench.per_metric_top || !bench.per_metric_top[scope]) {
    $("#bench-per-metric").innerHTML = "";
    return;
  }
  const top = bench.per_metric_top[scope];
  const blocks = PER_CLIP_METRICS.map(m => {
    const rows = top[m.key].slice(0, 10).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><code>${escapeHTML(r.vid)}</code></td>
        <td class="p-prompt">"${escapeHTML(r.prompt)}"</td>
        <td>${m.fmt(r.das)}</td>
        <td>${m.fmt(r.wan)}</td>
        <td class="${r.delta >= 0 ? "delta-pos" : "delta-neg"}">${r.delta >= 0 ? "+" : ""}${m.fmt(r.delta)}</td>
      </tr>
    `).join("");
    return `
      <details class="per-clip-details">
        <summary>${m.label} leaderboard (top 10 by Δ)</summary>
        <table class="bench per-clip">
          <thead><tr>
            <th>#</th><th>clip</th><th>prompt</th>
            <th>DaS ${m.dir === "up" ? "↑" : "↓"}</th>
            <th>Wan ${m.dir === "up" ? "↑" : "↓"}</th>
            <th>Δ (DaS − Wan)</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    `;
  }).join("");
  $("#bench-per-metric").innerHTML = `
    <div class="section-eyebrow per-metric-head">Per-metric leaderboards</div>
    ${blocks}
  `;
}

function renderBenchGallery(scope, bench) {
  const items = (bench.items || []).filter(it => it.scope === scope);
  const q = STATE.query;
  const filtered = q
    ? items.filter(it => (it.prompt || "").toLowerCase().includes(q)
                      || (it.vid    || "").toLowerCase().includes(q))
    : items;
  const title = scope === "overall"
    ? `Top 30 overall — DaS clearly better than Wan`
    : `Top 30 in ${DS_LABEL[scope] || scope} — DaS clearly better than Wan`;
  $("#bench-gallery-title").textContent = title;
  $("#bench-gallery").innerHTML = filtered.map(renderBenchCard).join("") ||
    `<p class="empty-msg">no matching clips</p>`;
  observeVideos("#bench-gallery video");
}

function renderBenchCard(it) {
  const dsCss = DS_CSS[it.dataset] || it.dataset;
  const dsLabel = DS_LABEL[it.dataset] || it.dataset;
  const scores = PER_CLIP_METRICS.map(m =>
    `<span class="chip-score">${m.label}: <em>${m.fmt(it.das[m.key])}</em> / <span>${m.fmt(it.wan[m.key])}</span></span>`
  ).join(" ");
  return `
    <article class="card bench-card">
      <div class="card-header">
        <span class="rank">#${it.rank}</span>
        <span class="ds ${dsCss}">${dsLabel}</span>
        <span class="vid">${escapeHTML(it.vid)}</span>
        <span class="delta ${it.delta >= 0 ? "delta-pos" : "delta-neg"}">Δ ${it.delta >= 0 ? "+" : ""}${it.delta.toFixed(3)}</span>
      </div>
      <div class="card-prompt">"${escapeHTML(it.prompt)}"</div>
      <div class="card-scores">${scores}<span class="chip-legend">(DaS / Wan)</span></div>
      <div class="card-video">
        <video src="${it.triptych}" controls muted loop preload="none" playsinline></video>
      </div>
    </article>
  `;
}

/* ============== QUAL VIEW (legacy) ============== */

function renderQualGallery() {
  const items = QUAL.items.filter(e => {
    if (STATE.qualDataset !== "all" && e.dataset !== STATE.qualDataset) return false;
    if (STATE.query && !(e.prompt || "").toLowerCase().includes(STATE.query)
        && !(e.vid || "").toLowerCase().includes(STATE.query)) return false;
    return true;
  });
  const counts = {};
  items.forEach(e => { counts[e.dataset] = (counts[e.dataset] || 0) + 1; });
  const parts = [`${items.length} / ${QUAL.n_with_triptych} shown`];
  DS_KEYS.forEach(k => { if (counts[k]) parts.push(`${DS_LABEL[k]} ${counts[k]}`); });
  $("#counts").textContent = parts.join(" · ");

  const html = items.map(e => {
    const dsCssClass = DS_CSS[e.dataset] || e.dataset;
    const promptHtml = e.prompt
      ? `<div class="card-prompt">"${escapeHTML(e.prompt)}"</div>`
      : `<div class="card-prompt empty">(empty prompt — text conditioning disabled)</div>`;
    const expNote = e.experiment_note
      ? `<span class="exp-note">${escapeHTML(e.experiment_note)}</span>` : "";
    return `
      <article class="card">
        <div class="card-header">
          <span class="ds ${dsCssClass}">${DS_LABEL[e.dataset]}</span>
          <span class="vid">${escapeHTML(e.vid)}</span>
          <span class="tracks-type">${e.tracks_type}</span>
          ${expNote}
        </div>
        ${promptHtml}
        <div class="card-video">
          <video src="${e.triptych}" controls muted loop preload="none" playsinline></video>
        </div>
      </article>`;
  }).join("");

  $("#gallery").innerHTML = html || `<p class="empty-msg">no matches</p>`;
  observeVideos("#gallery video");
}

/* ============== helpers ============== */

function observeVideos(selector) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      const v = en.target;
      if (en.isIntersecting) { v.play().catch(() => {}); }
      else { v.pause(); }
    });
  }, { rootMargin: "0px", threshold: 0.25 });
  document.querySelectorAll(selector).forEach(v => io.observe(v));
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

boot();
