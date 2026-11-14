<div align="center">

# AIRPAD

**Turn your phone into a precision trackpad, keyboard and file-transfer tool for your PC.**

![Platform](https://img.shields.io/badge/PC-Windows%20%7C%20macOS%20%7C%20Linux-000000?style=flat-square)
![Mobile](https://img.shields.io/badge/Mobile-iOS%20%7C%20Android-000000?style=flat-square)
![Expo](https://img.shields.io/badge/Expo-React%20Native-000000?style=flat-square&logo=expo)
![TypeScript](https://img.shields.io/badge/TypeScript-5-000000?style=flat-square&logo=typescript)
![Node](https://img.shields.io/badge/Node.js-18%2B-000000?style=flat-square&logo=node.js)

</div>

---

## Overview

AirPad has two parts that live in the same repository and talk over your local Wi-Fi:

| Part | What it is | Where |
| --- | --- | --- |
| **Mobile app** | Touchpad, keyboard, shortcuts and file sender (Expo, React Native, TypeScript) | `src/` |
| **PC server** | Receives commands and controls the mouse and keyboard (Node.js) | `server.js` |

No cloud, no account, no internet needed. Your phone connects directly to your PC.

## Features

- **Multi-touch trackpad**
  - 1 finger: move, tap to click, long-press to drag
  - 2 fingers: scroll, pinch to zoom, tap to right-click
  - 3 fingers: swipe up for Task View, swipe down for Desktop, swipe sideways to switch apps, tap for middle click
- **Relative and Absolute modes**, with pointer acceleration and adjustable speed
- **Drag lock** and **natural scroll**
- **Live keyboard**: type on your phone and it appears on the PC instantly
- **Modifier keys** (Ctrl, Alt, Shift, Win/Cmd), special keys and F1 to F12
- **One-tap shortcuts**: editing, browser, window management, media and volume
- **Power controls**: sleep, hibernate, sign out, restart and shut down. Restart and shut down have a 10-second cancel window.
- **File transfer**: send photos, videos, PDFs and anything else to `Downloads/PhoneDrops` on your PC, with live progress
- **Live latency indicator** in the header
- **PIN protection**: three wrong attempts disconnect the client

## Project structure

```
remote-mouse-app/
├── assets/            # App icons and images
├── scripts/           # Helper scripts
├── src/               # Mobile app source (TypeScript)
├── app.json           # Expo configuration
├── expo-env.d.ts      # Expo TypeScript types
├── package.json       # Dependencies for both the app and the server
├── server.js          # PC server (WebSocket + HTTP upload)
├── tsconfig.json      # TypeScript configuration
├── LICENSE
└── README.md
```

The app and the server share one `package.json`, so a single `npm install` sets up both.

## Requirements

**On your PC**

- Node.js 18 or newer
- Build tools for native modules, only if `@jitsi/robotjs` has no prebuilt binary for your system:
  - Windows: Visual Studio Build Tools (C++ workload)
  - macOS: `xcode-select --install`
  - Linux: `build-essential libxtst-dev libpng-dev`

**On your phone**

- iOS or Android with the **Expo Go** app installed, or a development build

Your phone and PC must be on the **same Wi-Fi network**.

## Quick start

### 1. Install dependencies

```bash
git clone <your-repo-url>
cd remote-mouse-app
npm install
```

If the server packages are not already listed in `package.json`, add them:

```bash
npm install ws busboy @jitsi/robotjs
```

### 2. Start the PC server

```bash
node server.js
```

Set your own PIN (recommended):

```bash
# macOS / Linux
PIN=9876 node server.js

# Windows (PowerShell)
$env:PIN="9876"; node server.js

# Windows (cmd)
set PIN=9876 && node server.js
```

On startup the server prints your PIN, the upload folder and your PC's local IP addresses:

```
AirPad server running on port 8080
PIN: 9876
Files from your phone are saved to: C:\Users\you\Downloads\PhoneDrops
Enter one of these IPs in the app: 192.168.1.5
```

### 3. Start the mobile app

In a second terminal:

```bash
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the **Camera app** (iOS).

### 4. Connect

1. Enter the **PC IP address** printed by the server.
2. Enter the **PIN**.
3. Tap **Connect**.

The default values in the app are `192.168.1.5` and `4321`. Change them in the app source, or type yours on the connect screen.

### Optional: npm scripts

Add these to the `scripts` section of `package.json` so you can run everything with short commands:

```json
{
  "scripts": {
    "server": "node server.js",
    "app": "expo start"
  }
}
```

```bash
npm run server
npm run app
```

## Using AirPad

### Touchpad gestures

| Gesture | Action |
| --- | --- |
| 1 finger drag | Move cursor |
| 1 finger tap | Left click |
| 1 finger long-press | Start dragging |
| 2 finger drag | Scroll |
| 2 finger pinch | Zoom (Ctrl/Cmd + scroll) |
| 2 finger tap | Right click |
| 3 finger tap | Middle click |
| 3 finger swipe up | Task View / Mission Control |
| 3 finger swipe down | Show desktop |
| 3 finger swipe sideways | Switch app |

### Tabs

- **Touchpad**: the trackpad, mouse buttons, mode switch, drag lock, natural scroll and speed
- **Keyboard**: live typing, modifiers, special keys and F-keys
- **Shortcuts**: editing, browser, system, media and power groups
- **Files**: send files to the PC and open the drop folder

## Configuration

| Setting | Where | Default |
| --- | --- | --- |
| PIN | `PIN` environment variable on the server | `4321` |
| Port | `PORT` in `server.js` and in the app source (keep both the same) | `8080` |
| Upload folder | `DROP_DIR` in `server.js` | `~/Downloads/PhoneDrops` |
| Shutdown/restart delay | `POWER_DELAY` in `server.js` | `10` seconds |
| Scroll direction | `SCROLL_SIGN` in `server.js` (set to `-1` to flip) | `1` |

## Protocol reference

Messages are JSON over WebSocket (`ws://<ip>:8080`). The first message must be `auth`.

| Message | Direction | Purpose |
| --- | --- | --- |
| `{ t: 'auth', pin }` | phone to PC | Authenticate |
| `{ t: 'auth', ok, host, platform, screen }` | PC to phone | Auth result and PC info |
| `{ t: 'ping', ts }` / `{ t: 'pong', ts }` | both | Latency measurement |
| `{ t: 'move', dx, dy }` | phone to PC | Relative cursor movement |
| `{ t: 'abs', x, y }` | phone to PC | Absolute position (0 to 1) |
| `{ t: 'click', button }` | phone to PC | `left`, `middle` or `right` |
| `{ t: 'down' }` / `{ t: 'up' }` | phone to PC | Hold or release left button |
| `{ t: 'scroll', dy }` | phone to PC | Scroll |
| `{ t: 'zoom', steps }` | phone to PC | Pinch zoom |
| `{ t: 'type', text }` | phone to PC | Type text |
| `{ t: 'key', key, mods }` | phone to PC | Key press with modifiers |
| `{ t: 'action', name }` | phone to PC | System or media action |
| `{ t: 'power', name }` | phone to PC | Power command, or `cancel` |
| `{ t: 'power', state, name, seconds }` | PC to phone | Pending shutdown or restart status |
| `{ t: 'openDrops' }` | phone to PC | Open the drop folder |

File upload uses `POST /upload` (multipart form) with an `x-pin` header.

## Troubleshooting

**"Cannot reach PC" or "Timed out"**
- Confirm the server is running and both devices are on the same Wi-Fi.
- Use the IP address printed by the server. Avoid VPN or virtual adapter addresses.
- **Windows:** allow Node.js through the firewall, or add a rule for port 8080:
  ```powershell
  netsh advfirewall firewall add rule name="AirPad" dir=in action=allow protocol=TCP localport=8080
  ```
- Some guest or public Wi-Fi networks block device-to-device traffic. Try a different network or a phone hotspot.

**"Wrong PIN"**
- The PIN in the app must match the server's `PIN` value. Three failed attempts close the connection.

**Mouse or keyboard does nothing on macOS**
- Go to System Settings, Privacy & Security, Accessibility, and enable your terminal app.

**Linux**
- `robotjs` works on X11 only. Wayland sessions are not supported, so log in with an X11 session.
- Task View and screenshot shortcuts depend on your desktop environment.

**`@jitsi/robotjs` fails to install**
- Install the build tools listed under Requirements, then run `npm install` again.

**File uploads fail**
- Check that the PIN matches and the server can write to the drop folder.
- Android release builds block plain HTTP and WS by default. Expo Go works as is. For a standalone build, allow cleartext traffic for local addresses.

## Security notes

- AirPad is designed for **trusted local networks only**. Traffic is not encrypted (`ws://`, `http://`).
- **Change the default PIN** before using it on any shared network.
- Do **not** expose port 8080 to the internet or forward it on your router. Anyone with the PIN could control your PC.
- Stop the server when you are not using it.

## Scripts cheat sheet

```bash
npm install                 # install everything
node server.js              # start the server (default PIN)
PIN=9876 node server.js     # start the server (custom PIN)
npx expo start              # start the app
npx expo start --clear      # start the app with a cleared cache
npx tsc --noEmit            # type-check the app
```

## License

Released under the terms of the [LICENSE](./LICENSE) file in this repository.

<div align="center">

**Built for people who would rather not get up to change the song.**

</div>