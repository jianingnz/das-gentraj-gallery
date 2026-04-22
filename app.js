/* Lightweight client — loads manifest.json, renders cards, handles
   dataset-tag + prompt-substring filtering, dark/light toggle. */

const DS_KEYS = ["egodex", "hdepic", "stereo4d", "yt-vis", "davis", "experiment"];
const DS_CSS = { "yt-vis": "ytvis" }; // CSS class-name safe
const DS_LABEL = { egodex: "egodex", hdepic: "hd-epic", stereo4d: "stereo4d", "yt-vis": "yt-vis", davis: "davis", experiment: "experiment" };

let MANIFEST = null;
let STATE = { dataset: "all", query: "" };

const $ = s => document.querySelector(s);

async function boot() {
  const [manifestRes, benchRes] = await Promise.all([
    fetch("manifest.json"),
    fetch("benchmark_summary.json"),
  ]);
  MANIFEST = await manifestRes.json();
  const bench = await benchRes.json();
  initTheme();
  initControls();
  renderBenchmarks(bench);
  render();
}

// Per-metric metadata: display name, direction ("up" = higher better), formatter
const METRICS = [
  { key: "clip_t",              label: "CLIP-T",             dir: "up",   fmt: x => x.toFixed(4) },
  { key: "tem_con",             label: "Tem-Con",            dir: "up",   fmt: x => x.toFixed(4) },
  { key: "subject_consistency", label: "Subject-Cons.",      dir: "up",   fmt: x => x.toFixed(4) },
  { key: "fvd",                 label: "FVD",                dir: "down", fmt: x => x.toFixed(1) },
];

const TAG_LABEL = {
  das_p2:   "DaS P2 (ours)",
  wan22_5b: "Wan 2.2 TI2V-5B",
};

function renderBenchmarks(bench) {
  const tags = Object.keys(bench.tags);
  // Winners per metric
  const winners = {};
  METRICS.forEach(m => {
    let best = null, bestTag = null;
    tags.forEach(t => {
      const v = bench.tags[t][m.key];
      const better = best === null
        ? true
        : (m.dir === "up" ? v > best : v < best);
      if (better) { best = v; bestTag = t; }
    });
    winners[m.key] = bestTag;
  });

  const headerRow = `
    <thead>
      <tr>
        <th></th>
        ${METRICS.map(m => `<th>${m.label} ${m.dir === "up" ? "↑" : "↓"}</th>`).join("")}
      </tr>
    </thead>`;
  const bodyRows = tags.map(tag => {
    const s = bench.tags[tag];
    const cells = METRICS.map(m => {
      const val = s[m.key];
      const wins = winners[m.key] === tag;
      return `<td${wins ? ` class="win"` : ""}>${m.fmt(val)}</td>`;
    }).join("");
    return `<tr><th scope="row">${escapeHTML(TAG_LABEL[tag] || tag)}</th>${cells}</tr>`;
  }).join("");

  $("#bench-table").innerHTML = `<table class="bench">${headerRow}<tbody>${bodyRows}</tbody></table>`;

  // Per-clip breakdown
  const clips = bench.tags[tags[0]].per_clip.map(c => c.vid);
  const perHeader = `
    <thead>
      <tr>
        <th>model</th>
        <th>clip</th>
        <th>prompt</th>
        ${METRICS.filter(m => m.key !== "fvd").map(m => `<th>${m.label} ${m.dir === "up" ? "↑" : "↓"}</th>`).join("")}
      </tr>
    </thead>`;
  const perBody = tags.map(tag => {
    return bench.tags[tag].per_clip.map((row, i) => {
      const cells = METRICS.filter(m => m.key !== "fvd")
        .map(m => `<td>${m.fmt(row[m.key])}</td>`).join("");
      const firstCell = i === 0
        ? `<th scope="row" rowspan="${clips.length}">${escapeHTML(TAG_LABEL[tag] || tag)}</th>`
        : "";
      return `<tr>${firstCell}<td><code>${escapeHTML(row.vid)}</code></td><td class="p-prompt">“${escapeHTML(row.prompt)}”</td>${cells}</tr>`;
    }).join("");
  }).join("");
  $("#bench-per-clip").innerHTML = `<table class="bench per-clip">${perHeader}<tbody>${perBody}</tbody></table>
    <p class="note">FVD is a set-level score (distribution distance), so it has no per-clip row.</p>`;
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
      STATE.dataset = btn.dataset.ds;
      render();
    });
  });

  let timer;
  $("#search").addEventListener("input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => { STATE.query = e.target.value.toLowerCase().trim(); render(); }, 120);
  });
}

function filtered() {
  return MANIFEST.items.filter(e => {
    if (STATE.dataset !== "all" && e.dataset !== STATE.dataset) return false;
    if (STATE.query && !(e.prompt || "").toLowerCase().includes(STATE.query)
        && !(e.vid || "").toLowerCase().includes(STATE.query)) return false;
    return true;
  });
}

function countsLine() {
  const visible = filtered();
  const parts = [`${visible.length} / ${MANIFEST.n_with_triptych} shown`];
  const counts = {};
  visible.forEach(e => { counts[e.dataset] = (counts[e.dataset] || 0) + 1; });
  DS_KEYS.forEach(k => {
    if (counts[k]) parts.push(`${DS_LABEL[k]} ${counts[k]}`);
  });
  return parts.join(" · ");
}

function render() {
  const items = filtered();
  $("#counts").textContent = countsLine();

  const html = items.map(e => {
    const dsCssClass = DS_CSS[e.dataset] || e.dataset;
    const promptHtml = e.prompt
      ? `<div class="card-prompt">“${escapeHTML(e.prompt)}”</div>`
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

  $("#gallery").innerHTML = html || `<p style="text-align:center; color:var(--text-secondary); padding:3rem;">no matches</p>`;

  // Start playback when video scrolls into view (lazy autoplay)
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      const v = en.target;
      if (en.isIntersecting) { v.play().catch(() => {}); }
      else { v.pause(); }
    });
  }, { rootMargin: "0px", threshold: 0.25 });
  document.querySelectorAll(".card-video video").forEach(v => io.observe(v));
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

boot();
