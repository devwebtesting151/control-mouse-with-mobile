const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');
const busboy = require('busboy');
const robot = require('@jitsi/robotjs');

const PIN = process.env.PIN || '4321'; // change this, or run: PIN=9876 node server.js
const PORT = 8080;
const DROP_DIR = path.join(os.homedir(), 'Downloads', 'PhoneDrops');
fs.mkdirSync(DROP_DIR, { recursive: true });

const PLATFORM = process.platform;
const MOD = PLATFORM === 'darwin' ? 'command' : 'control';
const VALID_MODS = ['control', 'alt', 'shift', 'command'];
const mapMods = (mods = []) =>
  mods.map((m) => (m === 'mod' ? MOD : m)).filter((m) => VALID_MODS.includes(m));

const SCROLL_SIGN = 1;

const ACTION_MAP = {
  win32: {
    taskview: ['tab', ['command']],
    desktop: ['d', ['command']],
    lock: ['l', ['command']],
    screenshot: ['s', ['command', 'shift']],
    switchapp: ['tab', ['alt']],
    closewin: ['f4', ['alt']],
  },
  darwin: {
    taskview: ['up', ['control']],
    desktop: ['f3', []],
    lock: ['q', ['control', 'command']],
    screenshot: ['4', ['command', 'shift']],
    switchapp: ['tab', ['command']],
    closewin: ['w', ['command']],
  },
  linux: {
    taskview: ['command', []],
    desktop: ['d', ['command']],
    lock: ['l', ['command']],
    screenshot: ['printscreen', []],
    switchapp: ['tab', ['alt']],
    closewin: ['f4', ['alt']],
  },
};
const ACTIONS = ACTION_MAP[PLATFORM] || ACTION_MAP.linux;

const MEDIA = {
  vol_up: 'audio_vol_up',
  vol_down: 'audio_vol_down',
  mute: 'audio_mute',
  play: 'audio_play',
  next: 'audio_next',
  prev: 'audio_prev',
};

// ---------- Power commands ----------
const POWER_DELAY = 10; // seconds before shutdown / restart runs (cancel window)
const POWER_CMDS = {
  win32: {
    shutdown: 'shutdown /s /t 0',
    restart: 'shutdown /r /t 0',
    sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    hibernate: 'shutdown /h',
    logoff: 'shutdown /l',
  },
  darwin: {
    shutdown: `osascript -e 'tell app "System Events" to shut down'`,
    restart: `osascript -e 'tell app "System Events" to restart'`,
    sleep: 'pmset sleepnow',
    hibernate: 'pmset sleepnow',
    logoff: `osascript -e 'tell app "System Events" to log out'`,
  },
  linux: {
    shutdown: 'systemctl poweroff',
    restart: 'systemctl reboot',
    sleep: 'systemctl suspend',
    hibernate: 'systemctl hibernate',
    logoff: 'loginctl terminate-user "$USER"',
  },
};
const POWER = POWER_CMDS[PLATFORM] || POWER_CMDS.linux;
const DELAYED = ['shutdown', 'restart'];

let pendingPower = null; // { name, timer }

function broadcast(wss, obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => c.readyState === 1 && c.send(msg));
}

function runPower(wss, name) {
  const cmd = POWER[name];
  if (!cmd) return;
  console.log(`[power] ${name}`);
  exec(cmd, (err) => err && console.error('Power command failed:', err.message));
}

function requestPower(wss, name) {
  if (!POWER[name]) return;
  if (pendingPower) return; // one action at a time
  if (DELAYED.includes(name)) {
    pendingPower = {
      name,
      timer: setTimeout(() => {
        pendingPower = null;
        runPower(wss, name);
      }, POWER_DELAY * 1000),
    };
    console.log(`[power] ${name} in ${POWER_DELAY}s (cancel from the app)`);
    broadcast(wss, { t: 'power', state: 'pending', name, seconds: POWER_DELAY });
  } else {
    runPower(wss, name);
  }
}

function cancelPower(wss) {
  if (!pendingPower) return;
  clearTimeout(pendingPower.timer);
  console.log(`[power] ${pendingPower.name} cancelled`);
  pendingPower = null;
  broadcast(wss, { t: 'power', state: 'cancelled' });
}

robot.setMouseDelay(0);
robot.setKeyboardDelay(0);
const screen = robot.getScreenSize();

// ---------- HTTP (file upload) + WebSocket on the same port ----------
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let target = path.join(dir, name);
  let i = 1;
  while (fs.existsSync(target)) target = path.join(dir, `${base} (${i++})${ext}`);
  return target;
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/upload') {
    if (req.headers['x-pin'] !== PIN) {
      res.writeHead(401);
      return res.end('Bad PIN');
    }
    const saved = [];
    const bb = busboy({ headers: req.headers, defParamCharset: 'utf8' });
    bb.on('file', (_field, file, info) => {
      const safe = path.basename(info.filename || 'file');
      const target = uniquePath(DROP_DIR, safe);
      saved.push(path.basename(target));
      file.pipe(fs.createWriteStream(target));
      console.log('Received file:', target);
    });
    bb.on('close', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, saved }));
    });
    bb.on('error', () => {
      res.writeHead(500);
      res.end('Upload failed');
    });
    req.pipe(bb);
  } else {
    res.writeHead(200);
    res.end('AirPad server is running');
  }
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  let authed = false;
  let fails = 0;
  let leftDown = false;

  ws.on('close', () => {
    if (leftDown) robot.mouseToggle('up', 'left');
  });

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    try {
      if (m.t === 'auth') {
        authed = m.pin === PIN;
        if (!authed && ++fails >= 3) return ws.close();
        ws.send(
          JSON.stringify({ t: 'auth', ok: authed, host: os.hostname(), platform: PLATFORM, screen })
        );
        // tell a freshly connected phone if a shutdown/restart is already counting down
        if (authed && pendingPower) {
          ws.send(JSON.stringify({ t: 'power', state: 'pending', name: pendingPower.name, seconds: POWER_DELAY }));
        }
        return;
      }
      if (!authed) return;

      switch (m.t) {
        case 'ping':
          ws.send(JSON.stringify({ t: 'pong', ts: m.ts }));
          break;

        case 'move': {
          const p = robot.getMousePos();
          const x = Math.max(0, Math.min(screen.width - 1, Math.round(p.x + m.dx)));
          const y = Math.max(0, Math.min(screen.height - 1, Math.round(p.y + m.dy)));
          leftDown ? robot.dragMouse(x, y) : robot.moveMouse(x, y);
          break;
        }

        case 'abs': {
          const x = Math.max(0, Math.min(screen.width - 1, Math.round(m.x * screen.width)));
          const y = Math.max(0, Math.min(screen.height - 1, Math.round(m.y * screen.height)));
          leftDown ? robot.dragMouse(x, y) : robot.moveMouse(x, y);
          break;
        }

        case 'click':
          robot.mouseClick(m.button || 'left', !!m.double);
          break;

        case 'down':
          leftDown = true;
          robot.mouseToggle('down', 'left');
          break;

        case 'up':
          leftDown = false;
          robot.mouseToggle('up', 'left');
          break;

        case 'scroll':
          robot.scrollMouse(0, Math.round(m.dy * SCROLL_SIGN));
          break;

        case 'zoom': {
          robot.keyToggle(MOD, 'down');
          robot.scrollMouse(0, Math.round(-m.steps * SCROLL_SIGN));
          robot.keyToggle(MOD, 'up');
          break;
        }

        case 'type':
          robot.typeString(String(m.text).slice(0, 500));
          break;

        case 'key':
          robot.keyTap(m.key, mapMods(m.mods));
          break;

        case 'action': {
          if (MEDIA[m.name]) return robot.keyTap(MEDIA[m.name]);
          const a = ACTIONS[m.name];
          if (a) robot.keyTap(a[0], a[1]);
          break;
        }

        case 'power':
          if (m.name === 'cancel') cancelPower(wss);
          else requestPower(wss, m.name);
          break;

        case 'openDrops': {
          const cmd =
            PLATFORM === 'win32' ? `start "" "${DROP_DIR}"`
            : PLATFORM === 'darwin' ? `open "${DROP_DIR}"`
            : `xdg-open "${DROP_DIR}"`;
          exec(cmd);
          break;
        }
      }
    } catch (err) {
      console.error('Command error:', err.message);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nAirPad server running on port ${PORT}`);
  console.log(`PIN: ${PIN}`);
  console.log(`Files from your phone are saved to: ${DROP_DIR}`);
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log('Enter one of these IPs in the app:', ips.join(', '), '\n');
});