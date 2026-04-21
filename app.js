/* Lightweight client — loads manifest.json, renders cards, handles
   dataset-tag + prompt-substring filtering, dark/light toggle. */

const DS_KEYS = ["egodex", "hdepic", "stereo4d", "yt-vis", "davis"];
const DS_CSS = { "yt-vis": "ytvis" }; // CSS class-name safe
const DS_LABEL = { egodex: "egodex", hdepic: "hd-epic", stereo4d: "stereo4d", "yt-vis": "yt-vis", davis: "davis" };

let MANIFEST = null;
let STATE = { dataset: "all", query: "" };

const $ = s => document.querySelector(s);

async function boot() {
  const res = await fetch("manifest.json");
  MANIFEST = await res.json();
  initTheme();
  initControls();
  render();
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
    return `
      <article class="card">
        <div class="card-header">
          <span class="ds ${dsCssClass}">${DS_LABEL[e.dataset]}</span>
          <span class="vid">${escapeHTML(e.vid)}</span>
          <span class="tracks-type">${e.tracks_type}</span>
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
