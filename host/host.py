"""Native messaging helper for YT Music Audio Grabber.

Chrome starts this once per request, sends one JSON message (4-byte length
prefix + JSON), and reads back events until the final {"event": "result"}.
NOTHING else may be written to stdout, so every child process is piped.
"""
import json, os, re, shutil, struct, subprocess, sys, time

VERSION = "2.0"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
SONG_URL = re.compile(r"^https://(music|www)\.youtube\.com/watch\?")
FORMATS = {"mp3", "m4a", "opus"}
QUALITIES = {"128", "192", "320"}
STAGES = {"ExtractAudio": "Converting audio", "FFmpegMetadata": "Writing song info",
          "EmbedThumbnail": "Adding cover art"}

if os.name == "nt":  # make sure the pipes are binary
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    return json.loads(sys.stdin.buffer.read(struct.unpack("<I", raw)[0]))


def send(obj):
    data = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def fail(msg):
    return {"event": "result", "ok": False, "error": msg}


def default_dir():
    return os.path.join(os.path.expanduser("~"), "Music", "YT")


def py(*args, timeout=60):
    return subprocess.run([sys.executable, *args], capture_output=True, text=True,
                          stdin=subprocess.DEVNULL, creationflags=NO_WINDOW, timeout=timeout)


def ytdlp_version():
    try:
        r = py("-m", "yt_dlp", "--version")
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def ffmpeg_location():
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:  # ffmpeg bundled by the imageio-ffmpeg package
        r = py("-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
        path = r.stdout.strip()
        return path if r.returncode == 0 and os.path.isfile(path) else None
    except Exception:
        return None


def status(_msg):
    return {"event": "result", "ok": True, "version": VERSION, "ytdlp": ytdlp_version(),
            "ffmpeg": bool(ffmpeg_location()), "dir": default_dir()}


def setup(_msg):
    cmd = [sys.executable, "-m", "pip", "install", "-U", "--disable-pip-version-check",
           "yt-dlp", "imageio-ffmpeg", "mutagen"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, text=True, creationflags=NO_WINDOW)
    for line in p.stdout:
        line = line.strip()
        if line:
            send({"event": "log", "line": line[:100]})
    p.wait()
    return {"event": "result", "ok": p.returncode == 0,
            "error": None if p.returncode == 0 else "pip couldn't install the tools."}


def num(s):
    try:
        return float(s)
    except ValueError:
        return None  # yt-dlp prints "NA" when it doesn't know


def download(msg):
    url = msg.get("url", "")
    if not SONG_URL.match(url):
        return fail("That isn't a YouTube or YouTube Music link.")
    fmt = msg.get("format") if msg.get("format") in FORMATS else "mp3"
    quality = msg.get("quality") if msg.get("quality") in QUALITIES else "192"
    out_dir = os.path.expanduser((msg.get("dir") or "").strip()) or default_dir()
    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError as e:
        return fail(f"Can't use that folder: {e.strerror or e}")
    ffmpeg = ffmpeg_location()
    if not ffmpeg:
        return fail("ffmpeg is missing. Open Settings and press Update tools.")

    cmd = [sys.executable, "-m", "yt_dlp", "--no-playlist", "--quiet", "--progress", "--newline",
           "--progress-template",
           "download:PROG|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|"
           "%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s",
           "--progress-template", "postprocess:PP|%(progress.status)s|%(progress.postprocessor)s",
           "--print", "after_move:FILE|%(filepath)s",
           "--ffmpeg-location", ffmpeg,
           "-f", "bestaudio[ext=m4a]/bestaudio" if fmt == "m4a" else "bestaudio",
           "-x", "--audio-format", fmt,
           "-o", os.path.join(out_dir, "%(title)s.%(ext)s")]
    if fmt == "mp3":
        cmd += ["--audio-quality", quality + "K"]
    if msg.get("embed", True):
        cmd += ["--embed-metadata", "--embed-thumbnail", "--convert-thumbnails", "jpg"]
    cmd.append(url)

    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         stdin=subprocess.DEVNULL, text=True, encoding="utf-8",
                         errors="replace", creationflags=NO_WINDOW)
    path = error = None
    last = 0.0
    for line in p.stdout:
        line = line.strip()
        if line.startswith("PROG|"):
            _, done, total, est, speed, eta = (line.split("|") + [""] * 6)[:6]
            d, t = num(done), num(total) or num(est)
            if d is not None and t and time.time() - last > 0.25:
                last = time.time()
                send({"event": "progress", "pct": min(100.0, round(d * 100 / t, 1)),
                      "speed": num(speed), "eta": num(eta)})
        elif line.startswith("PP|"):
            parts = line.split("|")
            if len(parts) >= 3 and parts[1] == "started" and parts[2] in STAGES:
                send({"event": "stage", "stage": STAGES[parts[2]]})
        elif line.startswith("FILE|"):
            path = line[5:]
        elif line.startswith("ERROR:"):
            error = line[6:].strip()[:300]
    p.wait()
    if p.returncode == 0 and path:
        return {"event": "result", "ok": True, "file": path}
    return fail(error or f"The download stopped (code {p.returncode}).")


def open_dir(msg):
    d = os.path.expanduser((msg.get("dir") or "").strip()) or default_dir()
    os.makedirs(d, exist_ok=True)
    if os.name == "nt":
        os.startfile(d)
    else:
        subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", d],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"event": "result", "ok": True}


HANDLERS = {"status": status, "setup": setup, "download": download, "open": open_dir}


def main():
    msg = read_message()
    if not msg:
        return
    handler = HANDLERS.get(msg.get("cmd"))
    try:
        send(handler(msg) if handler else fail("Unknown command."))
    except Exception as e:  # always answer, so the popup never hangs
        send(fail(str(e)))


if __name__ == "__main__":
    main()
