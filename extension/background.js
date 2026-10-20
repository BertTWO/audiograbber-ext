// Runs downloads so they keep going after the popup closes.
// Talks to the native helper (host/host.py) and keeps state in chrome.storage.local.

const HOST = "com.example.audiograbber";
const DEFAULTS = { format: "mp3", quality: "192", embed: true, dir: "" };

let jobs = {};
const ready = chrome.storage.local.get("jobs").then(({ jobs: saved = {} }) => {
  for (const j of Object.values(saved)) {
    if (j.state === "running") { j.state = "error"; j.error = "Interrupted"; }
  }
  jobs = saved;
});

chrome.action.setBadgeBackgroundColor({ color: "#6f7bff" });

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

function saveJobs() {
  const ids = Object.keys(jobs).sort((a, b) => jobs[b].started - jobs[a].started);
  for (const id of ids.slice(15)) delete jobs[id];
  chrome.storage.local.set({ jobs });
  const running = Object.values(jobs).filter((j) => j.state === "running").length;
  chrome.action.setBadgeText({ text: running ? String(running) : "" });
}

// One short-lived native connection per request. The host answers with
// progress/log events, then one final "result" event, then exits.
function nativeCall(msg, onEvent) {
  return new Promise((resolve) => {
    let port, result = null;
    try {
      port = chrome.runtime.connectNative(HOST);
    } catch (e) {
      return resolve({ ok: false, hostError: e.message });
    }
    port.onMessage.addListener((m) => {
      if (m.event === "result") result = m;
      else onEvent?.(m);
    });
    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      if (result) resolve(result);
      else resolve({ ok: false, hostError: err || "The helper stopped unexpectedly." });
    });
    port.postMessage(msg);
  });
}

async function setHost(patch, replace = false) {
  const { host = {} } = await chrome.storage.local.get("host");
  await chrome.storage.local.set({ host: replace ? patch : { ...host, ...patch } });
}

async function checkHost() {
  const res = await nativeCall({ cmd: "status" });
  if (res.hostError) await setHost({ ok: false, error: res.hostError, checked: Date.now() }, true);
  else await setHost({ ok: true, ytdlp: res.ytdlp, ffmpeg: res.ffmpeg, dir: res.dir, busy: null, log: null, error: null, checked: Date.now() }, true);
}

async function runSetup() {
  await setHost({ busy: "Installing tools…", log: "" });
  const res = await nativeCall({ cmd: "setup" }, (m) => {
    if (m.event === "log") setHost({ log: m.line });
  });
  await checkHost();
  if (!res.ok) await setHost({ error: res.error || res.hostError || "Install failed." });
}

async function startDownload({ url, title }) {
  await ready;
  const settings = await getSettings();
  const id = String(Date.now());
  const vid = new URL(url).searchParams.get("v");
  jobs[id] = { id, url, vid, title: title || url, state: "running", pct: 0, started: Date.now() };
  saveJobs();

  let lastWrite = 0;
  const res = await nativeCall({ cmd: "download", url, ...settings }, (m) => {
    const j = jobs[id];
    if (m.event === "progress") { j.pct = m.pct; j.speed = m.speed; j.eta = m.eta; j.stage = null; }
    else if (m.event === "stage") { j.stage = m.stage; j.pct = 100; }
    if (Date.now() - lastWrite > 300 || m.event === "stage") { lastWrite = Date.now(); saveJobs(); }
  });

  const j = jobs[id];
  if (res.ok) {
    j.state = "done";
    j.file = res.file;
    j.title = res.file.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  } else {
    j.state = "error";
    j.error = res.error || res.hostError;
    if (res.hostError) await setHost({ ok: false, error: res.hostError }, true);
  }
  j.stage = null;
  saveJobs();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "download") startDownload(msg);
  else if (msg.type === "check") checkHost();
  else if (msg.type === "setup") runSetup();
  else if (msg.type === "open") nativeCall({ cmd: "open", dir: msg.dir });
  else if (msg.type === "clear") ready.then(() => {
    for (const [id, j] of Object.entries(jobs)) if (j.state !== "running") delete jobs[id];
    saveJobs();
  });
});
