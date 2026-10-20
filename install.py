"""One-time setup for YT Music Audio Grabber. Safe to run again."""
import json, os, stat, subprocess, sys

HOST_NAME = "com.example.audiograbber"
EXT_ID = "bgnmmfkgmjkagndbngaophnhcafkkfmh"  # fixed by the "key" in extension/manifest.json
ROOT = os.path.dirname(os.path.abspath(__file__))
HOST_DIR = os.path.join(ROOT, "host")
JSON_PATH = os.path.join(HOST_DIR, HOST_NAME + ".json")

WIN_KEYS = [r"Software\Google\Chrome", r"Software\Microsoft\Edge",
            r"Software\BraveSoftware\Brave-Browser", r"Software\Chromium"]
HOME = os.path.expanduser("~")
if sys.platform == "darwin":
    base = os.path.join(HOME, "Library", "Application Support")
    POSIX_DIRS = [os.path.join(base, p) for p in
                  ("Google/Chrome", "Chromium", "BraveSoftware/Brave-Browser", "Microsoft Edge")]
else:
    base = os.path.join(HOME, ".config")
    POSIX_DIRS = [os.path.join(base, p) for p in
                  ("google-chrome", "chromium", "BraveSoftware/Brave-Browser", "microsoft-edge")]


def install():
    print("Step 1 of 3: installing yt-dlp, ffmpeg and tag support...")
    code = subprocess.call([sys.executable, "-m", "pip", "install", "-U", "--disable-pip-version-check",
                            "yt-dlp", "imageio-ffmpeg", "mutagen"])
    if code != 0:
        sys.exit("\nCouldn't install the tools. Check your internet connection and try again.")

    print("\nStep 2 of 3: writing helper files...")
    host_py = os.path.join(HOST_DIR, "host.py")
    if os.name == "nt":
        launcher = os.path.join(HOST_DIR, "host.bat")
        with open(launcher, "w", newline="") as f:
            f.write('@echo off\r\n"%s" "%s"\r\n' % (sys.executable, host_py))
    else:
        launcher = os.path.join(HOST_DIR, "host.sh")
        with open(launcher, "w") as f:
            f.write('#!/bin/sh\nexec "%s" "%s"\n' % (sys.executable, host_py))
        os.chmod(launcher, os.stat(launcher).st_mode | stat.S_IXUSR)
    manifest = {"name": HOST_NAME, "description": "YT Music Audio Grabber helper",
                "path": launcher, "type": "stdio",
                "allowed_origins": ["chrome-extension://%s/" % EXT_ID]}
    with open(JSON_PATH, "w") as f:
        json.dump(manifest, f, indent=2)

    print("Step 3 of 3: telling your browser about the helper...")
    if os.name == "nt":
        import winreg
        for key in WIN_KEYS:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"%s\NativeMessagingHosts\%s" % (key, HOST_NAME)) as k:
                winreg.SetValue(k, "", winreg.REG_SZ, JSON_PATH)
    else:
        for d in POSIX_DIRS:
            if os.path.isdir(d):
                target = os.path.join(d, "NativeMessagingHosts")
                os.makedirs(target, exist_ok=True)
                with open(os.path.join(target, HOST_NAME + ".json"), "w") as f:
                    json.dump(manifest, f, indent=2)

    print("\nAll set. Last step:")
    print("  chrome://extensions > turn on Developer mode > Load unpacked > pick the 'extension' folder")
    print("  (already loaded? press its reload button instead)")
    print("Don't move this folder afterwards. If you do, run install again.")


def uninstall():
    if os.name == "nt":
        import winreg
        for key in WIN_KEYS:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, r"%s\NativeMessagingHosts\%s" % (key, HOST_NAME))
            except OSError:
                pass
    else:
        for d in POSIX_DIRS:
            p = os.path.join(d, "NativeMessagingHosts", HOST_NAME + ".json")
            if os.path.exists(p):
                os.remove(p)
    print("Helper unregistered. You can remove the extension in chrome://extensions and delete this folder.")


if __name__ == "__main__":
    uninstall() if "--uninstall" in sys.argv else install()
