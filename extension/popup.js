const $ = (id) => document.getElementById(id);
const DEFAULTS = { format: "mp3", quality: "192", embed: true, dir: "" };
const LABELS = { mp3: "MP3", m4a: "M4A", opus: "Opus" };

let tab = null;
let state = { settings: DEFAULTS, jobs: {}, host: null };

const SITES = new Set(["https://music.youtube.com", "https://www.youtube.com"]);
const songId = (url) => {
  try {
    const u = new URL(url);
    return SITES.has(u.origin) && u.pathname === "/watch" ? u.searchParams.get("v") : null;
  } catch { return null; }
};

async function load() {
  const { settings = {}, jobs = {}, host = null } = await chrome.storage.local.get(["settings", "jobs", "host"]);
  state = { settings: { ...DEFAULTS, ...settings }, jobs, host };
}

function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  chrome.storage.local.set({ settings: state.settings });
}

// ---------- rendering ----------

function toolsReady(h) { return !h || (h.ok && h.ytdlp && h.ffmpeg); }

function render() {
  const { settings: s, jobs, host: h } = state;
  const id = songId(tab?.url);

  // settings fields (don't overwrite what the person is typing)
  $("format").value = s.format;
  $("quality").value = s.quality;
  $("qualityRow").hidden = s.format !== "mp3";
  $("embed").checked = s.embed;
  if (document.activeElement !== $("dir")) $("dir").value = s.dir;
  $("dir").placeholder = h?.dir || "Default folder";
  $("tools").textContent = h?.ok ? `yt-dlp ${h.ytdlp || "missing"}, ffmpeg ${h.ffmpeg ? "ready" : "missing"}` : "Helper not connected";
  $("update").disabled = !!h?.busy;

  // now playing
  const running = Object.values(jobs).some((j) => j.state === "running" && j.vid === id);
  $("vinyl").classList.toggle("spin", running);
  if (id) {
    $("thumb").src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    $("nowTitle").textContent = (tab.title || "").replace(/\s*[-•]\s*YouTube( Music)?\s*$/i, "") || "Current video";
    $("nowHint").textContent = "Ready to save";
  } else {
    $("thumb").removeAttribute("src");
    $("nowTitle").textContent = "Nothing to download";
    $("nowHint").textContent = "Open a song or video on YouTube Music or YouTube.";
  }
  $("dl").textContent = running ? "Downloading…" : `Download as ${LABELS[s.format]}`;
  $("dl").disabled = !id || running || !toolsReady(h) || !!h?.busy;

  renderBanner(h);
  renderList(jobs);
}

function renderBanner(h) {
  const b = { title: "", text: "", btn: null };
  if (!h) { $("banner").hidden = true; return; }
  if (h.busy) {
    Object.assign(b, { title: h.busy, text: h.log || "" });
  } else if (!h.ok) {
    const err = h.error || "";
    if (/not found/i.test(err)) {
      Object.assign(b, { title: "One-time setup needed",
        text: "Double-click install.bat in the Audio Grabber folder, then check again.", btn: ["Check again", "check"] });
    } else if (/forbidden/i.test(err)) {
      Object.assign(b, { title: "Helper doesn't recognise this extension",
        text: "Run install.bat again, then check again.", btn: ["Check again", "check"] });
    } else {
      Object.assign(b, { title: "Can't reach the helper", text: err, btn: ["Check again", "check"] });
    }
  } else if (!h.ytdlp || !h.ffmpeg) {
    Object.assign(b, { title: `${h.ytdlp ? "ffmpeg" : "yt-dlp"} is missing`,
      text: h.error || "Download and install the missing tools.", btn: ["Install now", "setup"] });
  } else if (h.error) {
    Object.assign(b, { title: "Update failed", text: h.error, btn: ["Try again", "setup"] });
  } else { $("banner").hidden = true; return; }

  $("banner").hidden = false;
  $("bannerTitle").textContent = b.title;
  $("bannerText").textContent = b.text;
  $("bannerBtn").hidden = !b.btn;
  if (b.btn) { $("bannerBtn").textContent = b.btn[0]; $("bannerBtn").dataset.type = b.btn[1]; }
}

function fmtStatus(j) {
  if (j.state === "done") return ["Saved", "done"];
  if (j.state === "error") return [j.error || "Failed", "error"];
  if (j.stage) return [`${j.stage}…`, ""];
  let t = `${Math.round(j.pct || 0)}%`;
  if (j.speed) t += ` at ${(j.speed / 1048576).toFixed(1)} MB/s`;
  if (j.eta != null) t += `, ${Math.round(j.eta)}s left`;
  return [t, ""];
}

function renderList(jobs) {
  const items = Object.values(jobs).sort((a, b) => b.started - a.started);
  $("empty").hidden = items.length > 0;
  $("list").replaceChildren(...items.map((j) => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.alt = "";
    if (j.vid) img.src = `https://i.ytimg.com/vi/${j.vid}/default.jpg`;
    const body = document.createElement("div");
    body.className = "jobBody";
    const title = document.createElement("div");
    title.className = "jobTitle"; title.textContent = j.title; title.title = j.title;
    const [text, cls] = fmtStatus(j);
    const status = document.createElement("div");
    status.className = `jobStatus ${cls}`; status.textContent = text;
    body.append(title, status);
    if (j.state === "running") {
      const bar = document.createElement("div"); bar.className = "bar";
      const fill = document.createElement("i"); fill.style.width = `${j.pct || 0}%`;
      bar.append(fill); body.append(bar);
    }
    li.append(img, body);
    return li;
  }));
}

// ---------- actions ----------

$("dl").onclick = () => {
  const title = $("nowTitle").textContent;
  chrome.runtime.sendMessage({ type: "download", url: tab.url, title });
};
$("gear").onclick = () => {
  const open = $("settings").hidden;
  $("settings").hidden = !open;
  $("gear").setAttribute("aria-expanded", String(open));
};
$("format").onchange = (e) => saveSettings({ format: e.target.value });
$("quality").onchange = (e) => saveSettings({ quality: e.target.value });
$("embed").onchange = (e) => saveSettings({ embed: e.target.checked });
$("dir").onchange = (e) => saveSettings({ dir: e.target.value.trim() });
$("update").onclick = () => chrome.runtime.sendMessage({ type: "setup" });
$("bannerBtn").onclick = (e) => chrome.runtime.sendMessage({ type: e.target.dataset.type });
$("openDir").onclick = () => chrome.runtime.sendMessage({ type: "open", dir: state.settings.dir });
$("clear").onclick = () => chrome.runtime.sendMessage({ type: "clear" });

chrome.storage.onChanged.addListener(async () => { await load(); render(); });

(async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await load();
  render();
  const h = state.host;
  if (!h || !h.ok || Date.now() - (h.checked || 0) > 5 * 60 * 1000) {
    chrome.runtime.sendMessage({ type: "check" });
  }
})();
