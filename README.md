# AudioGrabber Ext

A Chrome extension that saves the audio of a YouTube Music song or YouTube video as MP3, M4A or Opus with one click. Downloads run in the background with live progress, and everything is configured from the popup.

## How it works

Browser extensions can't run programs, so this has two parts:

- **`extension/`** is the Chrome extension (popup, background worker).
- **`host/host.py`** is a small helper that Chrome starts on demand through Native Messaging. It runs [yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg.

## Install (Windows, once)

1. Download or clone this repo and keep the folder somewhere permanent.
2. Double-click **`install.bat`**. It installs yt-dlp, ffmpeg and tag support, and registers the helper with Chrome, Edge and Brave. Python 3 is required.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `extension` folder.

Moved the folder? Run `install.bat` again. To remove the helper, run `install.bat --uninstall` from a terminal, then remove the extension.

macOS and Linux: run `python3 install.py` instead of `install.bat`.

## Use

Open a song on YouTube Music (or a video on youtube.com), click the extension, and press **Download**. Open **Settings** in the popup to change the format, MP3 quality, cover art, save folder, or to update yt-dlp.

Only single songs and videos are supported. Playlist links download just the current item.

## Troubleshooting

| Popup message | Fix |
|---|---|
| One-time setup needed | Run `install.bat`, then press Check again |
| Helper doesn't recognise this extension | Run `install.bat` again |
| yt-dlp or ffmpeg is missing | Press Install now |
| Download fails after working before | Settings > Update tools (YouTube changes often) |

## Legal

Downloading from YouTube may violate YouTube's Terms of Service and copyright law in your country. This project is provided for personal use with content you have the right to save, such as your own uploads, Creative Commons videos, or music you've licensed. You are responsible for how you use it. It does not and will not support DRM-protected services such as Spotify.

This project isn't affiliated with or endorsed by YouTube or Google.