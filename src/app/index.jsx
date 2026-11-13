import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';

const PORT = 8080;

// ---------- Monochrome design tokens ----------
const C = {
  bg: '#000000',
  card: '#0C0C0D',
  card2: '#151517',
  line: '#232326',
  line2: '#343438',
  text: '#FFFFFF',
  sub: '#8E8E93',
  dim: '#5A5A60',
  accent: '#FFFFFF',
  onAccent: '#000000',
  ok: '#34D399',
  warn: '#FBBF24',
  danger: '#F87171',
};

const haptic = () => {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
};

const fmtSize = (b = 0) =>
  b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

// ---------- Reusable components ----------
const Tile = ({ icon, label, onPress, color }) => (
  <TouchableOpacity
    activeOpacity={0.6}
    onPress={() => { haptic(); onPress && onPress(); }}
    style={st.tile}
  >
    <View style={st.tileIcon}>
      <Ionicons name={icon} size={20} color={color || C.text} />
    </View>
    <Text style={st.tileTxt} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const ModChip = ({ label, active, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={() => { haptic(); onPress(); }}
    style={[st.modChip, active && st.modChipOn]}
  >
    <Text style={[st.modChipTxt, active && { color: C.onAccent }]}>{label}</Text>
  </TouchableOpacity>
);

const Section = ({ title, children }) => (
  <View style={{ marginBottom: 24 }}>
    <Text style={st.sectionTitle}>{title}</Text>
    <View style={st.grid}>{children}</View>
  </View>
);

const Segmented = ({ options, value, onChange }) => (
  <View style={st.seg}>
    {options.map((o) => {
      const on = o.value === value;
      return (
        <TouchableOpacity
          key={o.value}
          activeOpacity={0.8}
          onPress={() => { haptic(); onChange(o.value); }}
          style={[st.segItem, on && st.segItemOn]}
        >
          <Ionicons name={o.icon} size={15} color={on ? C.onAccent : C.sub} />
          <Text style={[st.segTxt, on && { color: C.onAccent }]}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const ToggleCard = ({ icon, title, sub, value, onChange }) => (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => { haptic(); onChange(!value); }}
    style={[st.toggleCard, value && st.toggleCardOn]}
  >
    <View style={st.toggleTop}>
      <View style={[st.toggleIcon, value && { backgroundColor: C.accent }]}>
        <Ionicons name={icon} size={16} color={value ? C.onAccent : C.sub} />
      </View>
      <Switch
        value={value}
        onValueChange={(v) => { haptic(); onChange(v); }}
        trackColor={{ false: C.line2, true: '#FFFFFF' }}
        thumbColor={value ? '#000000' : '#8E8E93'}
        ios_backgroundColor={C.line2}
        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
      />
    </View>
    <Text style={st.toggleTitle}>{title}</Text>
    <Text style={st.toggleSub}>{sub}</Text>
  </TouchableOpacity>
);

// ---------- Shortcut definitions ----------
const EDIT = [
  { icon: 'copy-outline', label: 'Copy', key: 'c', mods: ['mod'] },
  { icon: 'clipboard-outline', label: 'Paste', key: 'v', mods: ['mod'] },
  { icon: 'cut-outline', label: 'Cut', key: 'x', mods: ['mod'] },
  { icon: 'arrow-undo-outline', label: 'Undo', key: 'z', mods: ['mod'] },
  { icon: 'arrow-redo-outline', label: 'Redo', key: 'y', mods: ['mod'] },
  { icon: 'scan-outline', label: 'Select all', key: 'a', mods: ['mod'] },
  { icon: 'save-outline', label: 'Save', key: 's', mods: ['mod'] },
  { icon: 'search-outline', label: 'Find', key: 'f', mods: ['mod'] },
  { icon: 'refresh-outline', label: 'Refresh', key: 'f5', mods: [] },
];
const BROWSER = [
  { icon: 'add-circle-outline', label: 'New tab', key: 't', mods: ['mod'] },
  { icon: 'close-circle-outline', label: 'Close tab', key: 'w', mods: ['mod'] },
  { icon: 'return-up-back-outline', label: 'Reopen tab', key: 't', mods: ['mod', 'shift'] },
  { icon: 'expand-outline', label: 'Fullscreen', key: 'f11', mods: [] },
  { icon: 'chevron-back-outline', label: 'Back', key: 'left', mods: ['alt'] },
  { icon: 'chevron-forward-outline', label: 'Forward', key: 'right', mods: ['alt'] },
];
const SYSTEM = [
  { icon: 'swap-horizontal-outline', label: 'Switch app', action: 'switchapp' },
  { icon: 'apps-outline', label: 'Task view', action: 'taskview' },
  { icon: 'desktop-outline', label: 'Desktop', action: 'desktop' },
  { icon: 'close-outline', label: 'Close window', action: 'closewin', color: C.danger },
  { icon: 'camera-outline', label: 'Screenshot', action: 'screenshot' },
  { icon: 'lock-closed-outline', label: 'Lock PC', action: 'lock', color: C.warn },
];
const MEDIA = [
  { icon: 'volume-low-outline', label: 'Vol -', action: 'vol_down' },
  { icon: 'volume-mute-outline', label: 'Mute', action: 'mute' },
  { icon: 'volume-high-outline', label: 'Vol +', action: 'vol_up' },
  { icon: 'play-skip-back-outline', label: 'Previous', action: 'prev' },
  { icon: 'play-outline', label: 'Play/Pause', action: 'play' },
  { icon: 'play-skip-forward-outline', label: 'Next', action: 'next' },
];
const POWER = [
  { icon: 'moon-outline', label: 'Sleep', name: 'sleep', note: 'Put the PC to sleep. The phone will disconnect.' },
  { icon: 'snow-outline', label: 'Hibernate', name: 'hibernate', note: 'Save the session to disk and power off.' },
  { icon: 'log-out-outline', label: 'Sign out', name: 'logoff', color: C.warn, note: 'Sign out of the current user. Unsaved work may be lost.' },
  { icon: 'refresh-circle-outline', label: 'Restart', name: 'restart', color: C.warn, note: 'Restart starts in 10 seconds. You can cancel.' },
  { icon: 'power-outline', label: 'Shut down', name: 'shutdown', color: C.danger, note: 'Shutdown starts in 10 seconds. You can cancel.' },
];
const NAV_KEYS = [
  ['Esc', 'escape'], ['Tab', 'tab'], ['Del', 'delete'], ['Home', 'home'], ['End', 'end'],
  ['PgUp', 'pageup'], ['PgDn', 'pagedown'], ['↑', 'up'], ['↓', 'down'], ['←', 'left'], ['→', 'right'],
  ['Space', 'space'],
];
const F_KEYS = Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `f${i + 1}`]);

const SPEED_MIN = 0.6;
const SPEED_MAX = 5;
const SPEED_STEP = 0.4;
const SPEED_SEGMENTS = 12;

export default function App() {
  // ----- connection state -----
  const [ip, setIp] = useState('192.168.1.5');
  const [pin, setPin] = useState('4321');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState({});
  const [latency, setLatency] = useState(null);
  const ws = useRef(null);
  const connTimer = useRef(null);

  // ----- ui state -----
  const [tab, setTab] = useState('pad');
  const [dragUi, setDragUi] = useState(false);
  const [text, setText] = useState('');
  const prevText = useRef('');
  const [mods, setMods] = useState({ control: false, alt: false, shift: false, command: false });
  const [files, setFiles] = useState([]);
  const [pending, setPending] = useState(null); // { name, left }

  // ----- settings (ref for gesture handlers + state for UI) -----
  const defaults = { speed: 1.8, mode: 'rel', dragLock: false, natural: false };
  const cfg = useRef({ ...defaults }).current;
  const [ui, setUi] = useState(defaults);
  const setCfg = (k, v) => {
    cfg[k] = v;
    setUi((p) => ({ ...p, [k]: v }));
  };

  // ----- gesture + batching refs -----
  const g = useRef({
    lx: 0, ly: 0, moved: 0, start: 0, max: 0, lastN: 0, lastDist: 0,
    timer: null, holdDrag: false, down: false, ox: 0, oy: 0, w: 1, h: 1,
  }).current;
  const acc = useRef({ dx: 0, dy: 0, sy: 0, zoom: 0, abs: null }).current;
  const padRef = useRef(null);
  const glow = useRef(new Animated.ValueXY()).current;
  const glowOp = useRef(new Animated.Value(0)).current;

  const send = useCallback((o) => {
    const w = ws.current;
    if (w && w.readyState === 1) w.send(JSON.stringify(o));
  }, []);

  const mouseDown = () => {
    if (!g.down) { g.down = true; send({ t: 'down' }); setDragUi(true); }
  };
  const mouseUp = () => {
    if (g.down) { g.down = false; send({ t: 'up' }); setDragUi(false); }
  };

  // ---------- connect / disconnect ----------
  const connect = () => {
    if (connecting) return;
    setError('');
    setConnecting(true);
    let w;
    try {
      w = new WebSocket(`ws://${ip.trim()}:${PORT}`);
    } catch (e) {
      setConnecting(false);
      return setError('Invalid IP address');
    }
    ws.current = w;
    connTimer.current = setTimeout(() => {
      if (w.readyState !== 1) { w.close(); setConnecting(false); setError('Timed out. Check IP and Wi-Fi.'); }
    }, 5000);
    w.onopen = () => {
      clearTimeout(connTimer.current);
      w.send(JSON.stringify({ t: 'auth', pin }));
    };
    w.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'auth') {
        setConnecting(false);
        if (m.ok) { setHost(m); setConnected(true); }
        else { setError('Wrong PIN'); w.close(); }
      } else if (m.t === 'pong') {
        setLatency(Date.now() - m.ts);
      } else if (m.t === 'power') {
        if (m.state === 'pending') setPending({ name: m.name, left: m.seconds });
        else setPending(null);
      }
    };
    w.onerror = () => {
      clearTimeout(connTimer.current);
      setConnecting(false);
      setError('Cannot reach PC. Is the server running and on the same Wi-Fi?');
    };
    w.onclose = () => {
      clearTimeout(connTimer.current);
      setConnected(false);
      setConnecting(false);
      setPending(null);
      g.down = false;
      setDragUi(false);
    };
  };

  const disconnect = () => {
    if (g.down) mouseUp();
    ws.current && ws.current.close();
  };

  // countdown for a pending shutdown / restart
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(
      () => setPending((p) => (p ? (p.left <= 0 ? null : { ...p, left: p.left - 1 }) : p)),
      pending.left <= 0 ? 1500 : 1000
    );
    return () => clearTimeout(t);
  }, [pending]);

  const runPower = (p) => {
    haptic();
    Alert.alert(`${p.label}?`, p.note, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: p.label,
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          send({ t: 'power', name: p.name });
        },
      },
    ]);
  };

  // ---------- batching loop + ping ----------
  useEffect(() => {
    if (!connected) return;
    const flush = setInterval(() => {
      if (acc.abs) { send({ t: 'abs', x: acc.abs.x, y: acc.abs.y }); acc.abs = null; }
      if (acc.dx || acc.dy) { send({ t: 'move', dx: acc.dx, dy: acc.dy }); acc.dx = 0; acc.dy = 0; }
      const sy = Math.trunc(acc.sy);
      if (sy) { send({ t: 'scroll', dy: sy }); acc.sy -= sy; }
      const z = Math.trunc(acc.zoom);
      if (z) { send({ t: 'zoom', steps: z }); acc.zoom -= z; }
    }, 16);
    const ping = setInterval(() => send({ t: 'ping', ts: Date.now() }), 3000);
    send({ t: 'ping', ts: Date.now() });
    return () => { clearInterval(flush); clearInterval(ping); };
  }, [connected]);

  // ---------- touchpad gesture engine ----------
  const finish = (s, cancelled) => {
    clearTimeout(g.timer);
    Animated.timing(glowOp, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    if (g.holdDrag) {
      g.holdDrag = false;
      if (!cfg.dragLock) mouseUp();
      return;
    }
    if (cancelled) return;

    if (g.max >= 3) {
      if (g.moved > 40) {
        if (Math.abs(s.dy) > Math.abs(s.dx)) send({ t: 'action', name: s.dy < 0 ? 'taskview' : 'desktop' });
        else send({ t: 'action', name: 'switchapp' });
      } else {
        send({ t: 'click', button: 'middle' });
      }
      return;
    }
    if (cfg.dragLock) return;
    const quick = Date.now() - g.start < 250 && g.moved < 8;
    if (!quick) return;
    if (g.max === 2) send({ t: 'click', button: 'right' });
    else send({ t: 'click', button: 'left' }); // two quick taps = OS double-click
  };

  const pad = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches;
        g.lx = 0; g.ly = 0; g.moved = 0; g.start = Date.now();
        g.max = t.length; g.lastN = t.length; g.lastDist = 0; g.holdDrag = false;
        glow.setValue({ x: t[0].pageX - g.ox, y: t[0].pageY - g.oy });
        glowOp.setValue(1);
        if (cfg.mode === 'abs') {
          acc.abs = {
            x: Math.max(0, Math.min(1, (t[0].pageX - g.ox) / g.w)),
            y: Math.max(0, Math.min(1, (t[0].pageY - g.oy) / g.h)),
          };
        }
        clearTimeout(g.timer);
        // long-press (without moving) = start dragging
        g.timer = setTimeout(() => {
          if (g.max === 1 && g.moved < 6 && !g.down) {
            g.holdDrag = true;
            mouseDown();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        }, 380);
      },

      onPanResponderMove: (e, s) => {
        const t = e.nativeEvent.touches;
        const n = t.length;
        g.max = Math.max(g.max, n);
        glow.setValue({ x: t[0].pageX - g.ox, y: t[0].pageY - g.oy });

        if (n !== g.lastN) { // finger count changed: re-baseline to avoid jumps
          g.lastN = n; g.lx = s.dx; g.ly = s.dy; g.lastDist = 0;
          return;
        }
        const dx = s.dx - g.lx;
        const dy = s.dy - g.ly;
        g.lx = s.dx; g.ly = s.dy;
        g.moved += Math.abs(dx) + Math.abs(dy);

        if (n === 1) {
          if (cfg.mode === 'abs') {
            acc.abs = {
              x: Math.max(0, Math.min(1, (t[0].pageX - g.ox) / g.w)),
              y: Math.max(0, Math.min(1, (t[0].pageY - g.oy) / g.h)),
            };
          } else {
            const sp = Math.hypot(dx, dy);
            const k = cfg.speed * (1 + Math.min(sp / 25, 1.5)); // pointer acceleration
            acc.dx += dx * k;
            acc.dy += dy * k;
          }
        } else if (n === 2) {
          const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          const dd = g.lastDist ? d - g.lastDist : 0;
          g.lastDist = d;
          if (Math.abs(dd) > 1 && Math.abs(dd) > Math.abs(dy) * 1.5) acc.zoom += dd / 14; // pinch
          else acc.sy += (cfg.natural ? dy : -dy) * 0.6; // scroll
        }
      },

      onPanResponderRelease: (e, s) => finish(s, false),
      onPanResponderTerminate: (e, s) => finish(s, true),
    })
  ).current;

  const onPadLayout = () => {
    setTimeout(() => {
      padRef.current && padRef.current.measureInWindow((x, y, w, h) => {
        g.ox = x; g.oy = y; g.w = w || 1; g.h = h || 1;
      });
    }, 50);
  };

  const setDragLock = (on) => {
    setCfg('dragLock', on);
    on ? mouseDown() : mouseUp();
  };

  const changeSpeed = (dir) => {
    const v = +(ui.speed + dir * SPEED_STEP).toFixed(1);
    setCfg('speed', Math.max(SPEED_MIN, Math.min(SPEED_MAX, v)));
  };

  // ---------- keyboard ----------
  const activeMods = () => Object.keys(mods).filter((k) => mods[k]);
  const clearMods = () => setMods({ control: false, alt: false, shift: false, command: false });

  const sendKey = (key) => {
    send({ t: 'key', key, mods: activeMods() });
    clearMods();
  };

  const onType = (t) => {
    const prev = prevText.current;
    if (t.length > prev.length && t.startsWith(prev)) {
      const add = t.slice(prev.length);
      const am = activeMods();
      if (am.length && add.length === 1) { send({ t: 'key', key: add.toLowerCase(), mods: am }); clearMods(); }
      else send({ t: 'type', text: add });
    } else if (t.length < prev.length) {
      const n = Math.min(prev.length - t.length, 50);
      for (let i = 0; i < n; i++) send({ t: 'key', key: 'backspace', mods: [] });
    }
    if (t.length > 30) { setText(''); prevText.current = ''; }
    else { setText(t); prevText.current = t; }
  };

  // ---------- file upload ----------
  const uploadFile = (file, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `http://${ip.trim()}:${PORT}/upload`);
      xhr.setRequestHeader('x-pin', pin);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status === 200 ? resolve() : reject(new Error('HTTP ' + xhr.status)));
      xhr.onerror = () => reject(new Error('Network error'));
      const form = new FormData();
      form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' });
      xhr.send(form);
    });

  const pickFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
    if (r.canceled) return;
    r.assets.forEach(async (f, i) => {
      const id = Date.now() + '-' + i;
      setFiles((p) => [{ id, name: f.name, size: f.size, progress: 0, status: 'uploading' }, ...p]);
      const upd = (patch) => setFiles((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      try {
        await uploadFile(f, (pr) => upd({ progress: pr }));
        upd({ progress: 1, status: 'done' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch (e) {
        upd({ status: 'error' });
      }
    });
  };

  // =====================================================================
  //                              CONNECT SCREEN
  // =====================================================================
  if (!connected) {
    return (
      <SafeAreaView style={st.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.center}>
          <View style={st.logo}>
            <Ionicons name="hand-left-outline" size={34} color={C.onAccent} />
          </View>
          <Text style={st.brand}>AIRPAD</Text>
          <Text style={st.tag}>Your phone as a precision trackpad, keyboard and file transfer for your PC.</Text>

          <View style={st.card}>
            <Text style={st.label}>PC IP ADDRESS</Text>
            <View style={st.inputRow}>
              <Ionicons name="wifi" size={18} color={C.sub} />
              <TextInput
                style={st.input} value={ip} onChangeText={setIp} placeholder="192.168.1.5"
                placeholderTextColor={C.dim} keyboardType="numbers-and-punctuation" autoCapitalize="none"
                selectionColor={C.text}
              />
            </View>
            <Text style={[st.label, { marginTop: 16 }]}>PIN</Text>
            <View style={st.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={C.sub} />
              <TextInput
                style={st.input} value={pin} onChangeText={setPin} placeholder="PIN"
                placeholderTextColor={C.dim} secureTextEntry keyboardType="number-pad"
                selectionColor={C.text}
              />
            </View>
            {!!error && (
              <View style={st.errRow}>
                <Ionicons name="alert-circle" size={16} color={C.danger} />
                <Text style={st.errTxt}>{error}</Text>
              </View>
            )}
            <TouchableOpacity style={st.cta} onPress={connect} activeOpacity={0.85}>
              {connecting ? <ActivityIndicator color={C.onAccent} /> : (
                <>
                  <Ionicons name="link-outline" size={20} color={C.onAccent} />
                  <Text style={st.ctaTxt}>Connect</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={st.foot}>Run "node server.js" on your PC and keep both devices on the same Wi-Fi.</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // =====================================================================
  //                                MAIN SCREEN
  // =====================================================================
  const latColor = latency == null ? C.sub : latency < 40 ? C.ok : latency < 120 ? C.warn : C.danger;
  const winLabel = host.platform === 'darwin' ? 'Cmd' : 'Win';
  const tabs = [
    { k: 'pad', icon: 'hand-left-outline', l: 'Touchpad' },
    { k: 'keys', icon: 'keypad-outline', l: 'Keyboard' },
    { k: 'fast', icon: 'flash-outline', l: 'Shortcuts' },
    { k: 'files', icon: 'folder-open-outline', l: 'Files' },
  ];
  const speedFilled = Math.round((ui.speed - SPEED_MIN) / SPEED_STEP) + 1;

  const runShortcut = (s) =>
    s.action ? send({ t: 'action', name: s.action }) : send({ t: 'key', key: s.key, mods: s.mods });

  return (
    <SafeAreaView style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={st.header}>
        <View style={st.hostIcon}>
          <Ionicons name="desktop-outline" size={18} color={C.text} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.hTitle} numberOfLines={1}>{host.host || 'PC'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <View style={st.liveDot} />
            <Text style={st.hSub}>
              CONNECTED · {host.screen ? `${host.screen.width}×${host.screen.height}` : ''}
            </Text>
          </View>
        </View>
        <View style={st.pill}>
          <View style={[st.pillDot, { backgroundColor: latColor }]} />
          <Text style={st.pillTxt}>{latency == null ? '--' : latency + ' ms'}</Text>
        </View>
        <TouchableOpacity onPress={disconnect} style={st.power} activeOpacity={0.6}>
          <Ionicons name="power" size={16} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Power countdown banner */}
      {pending && (
        <View style={st.banner}>
          <Ionicons name="warning-outline" size={18} color={C.onAccent} />
          <Text style={st.bannerTxt}>
            {pending.left > 0
              ? `${pending.name === 'restart' ? 'Restarting' : 'Shutting down'} in ${pending.left}s`
              : `${pending.name === 'restart' ? 'Restarting' : 'Shutting down'} now`}
          </Text>
          {pending.left > 0 && (
            <TouchableOpacity style={st.bannerBtn} activeOpacity={0.8} onPress={() => { haptic(); send({ t: 'power', name: 'cancel' }); }}>
              <Text style={st.bannerBtnTxt}>CANCEL</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ---------------- TOUCHPAD TAB ---------------- */}
      {tab === 'pad' && (
        <View style={st.body}>
          <View ref={padRef} onLayout={onPadLayout} style={[st.pad, dragUi && st.padDrag]} {...pad.panHandlers}>
            {/* corner marks */}
            <View pointerEvents="none" style={[st.corner, { top: 14, left: 14, borderTopWidth: 1.5, borderLeftWidth: 1.5 }]} />
            <View pointerEvents="none" style={[st.corner, { top: 14, right: 14, borderTopWidth: 1.5, borderRightWidth: 1.5 }]} />
            <View pointerEvents="none" style={[st.corner, { bottom: 14, left: 14, borderBottomWidth: 1.5, borderLeftWidth: 1.5 }]} />
            <View pointerEvents="none" style={[st.corner, { bottom: 14, right: 14, borderBottomWidth: 1.5, borderRightWidth: 1.5 }]} />

            <Animated.View
              pointerEvents="none"
              style={[st.glow, { opacity: glowOp, transform: glow.getTranslateTransform() }]}
            />
            <View pointerEvents="none" style={st.padCenter}>
              <Ionicons name={ui.mode === 'abs' ? 'locate-outline' : 'hand-left-outline'} size={38} color={C.line2} />
              <Text style={st.padHint}>{ui.mode === 'abs' ? 'ABSOLUTE MODE' : 'TOUCHPAD'}</Text>
              <View style={st.legend}>
                <View style={st.legendRow}>
                  <Text style={st.legendKey}>1 FINGER</Text>
                  <Text style={st.legendVal}>Move · tap · hold to drag</Text>
                </View>
                <View style={st.legendRow}>
                  <Text style={st.legendKey}>2 FINGERS</Text>
                  <Text style={st.legendVal}>Scroll · pinch · tap right-click</Text>
                </View>
                <View style={st.legendRow}>
                  <Text style={st.legendKey}>3 FINGERS</Text>
                  <Text style={st.legendVal}>Swipe tasks · desktop · switch</Text>
                </View>
              </View>
            </View>
            {dragUi && (
              <View style={st.dragBadge} pointerEvents="none">
                <Ionicons name="move-outline" size={13} color={C.onAccent} />
                <Text style={st.dragTxt}>DRAGGING</Text>
              </View>
            )}
          </View>

          {/* Mouse buttons */}
          <View style={st.btnRow}>
            <TouchableOpacity
              activeOpacity={0.7} style={[st.mBtn, st.mBtnPrimary, { flex: 2 }]}
              onPressIn={() => { haptic(); mouseDown(); }}
              onPressOut={() => { if (!cfg.dragLock) mouseUp(); }}
            >
              <Ionicons name="finger-print-outline" size={18} color={C.onAccent} />
              <Text style={[st.mBtnTxt, { color: C.onAccent }]}>Left · hold to drag</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} style={st.mBtn} onPress={() => { haptic(); send({ t: 'click', button: 'middle' }); }}>
              <Text style={st.mBtnTxt}>Mid</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} style={st.mBtn} onPress={() => { haptic(); send({ t: 'click', button: 'right' }); }}>
              <Text style={st.mBtnTxt}>Right</Text>
            </TouchableOpacity>
          </View>

          {/* Control panel */}
          <View style={st.panel}>
            <Segmented
              value={ui.mode}
              onChange={(v) => setCfg('mode', v)}
              options={[
                { value: 'rel', label: 'Relative', icon: 'hand-left-outline' },
                { value: 'abs', label: 'Absolute', icon: 'locate-outline' },
              ]}
            />

            <View style={st.toggleRow}>
              <ToggleCard
                icon="lock-closed-outline" title="Drag lock" sub="Keep button held"
                value={ui.dragLock} onChange={setDragLock}
              />
              <ToggleCard
                icon="swap-vertical-outline" title="Natural scroll" sub="Reverse direction"
                value={ui.natural} onChange={(v) => setCfg('natural', v)}
              />
            </View>

            <View style={st.speedRow}>
              <TouchableOpacity onPress={() => { haptic(); changeSpeed(-1); }} style={st.speedBtn} activeOpacity={0.6}>
                <Ionicons name="remove" size={18} color={C.text} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <View style={st.speedHead}>
                  <Text style={st.speedLabel}>POINTER SPEED</Text>
                  <Text style={st.speedVal}>{ui.speed.toFixed(1)}×</Text>
                </View>
                <View style={st.speedBars}>
                  {Array.from({ length: SPEED_SEGMENTS }, (_, i) => (
                    <View key={i} style={[st.speedSeg, i < speedFilled && st.speedSegOn]} />
                  ))}
                </View>
              </View>
              <TouchableOpacity onPress={() => { haptic(); changeSpeed(1); }} style={st.speedBtn} activeOpacity={0.6}>
                <Ionicons name="add" size={18} color={C.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ---------------- KEYBOARD TAB ---------------- */}
      {tab === 'keys' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView style={st.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={st.sectionTitle}>LIVE TYPING</Text>
            <View style={[st.inputRow, { marginBottom: 24 }]}>
              <Ionicons name="create-outline" size={18} color={C.sub} />
              <TextInput
                style={st.input} value={text} onChangeText={onType}
                placeholder="Type here, it goes straight to the PC"
                placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false}
                selectionColor={C.text}
                blurOnSubmit={false} onSubmitEditing={() => send({ t: 'key', key: 'enter', mods: [] })}
              />
              <TouchableOpacity onPress={() => send({ t: 'key', key: 'enter', mods: [] })} style={st.enterBtn}>
                <Ionicons name="return-down-back-outline" size={18} color={C.onAccent} />
              </TouchableOpacity>
            </View>

            <Text style={st.sectionTitle}>MODIFIERS · TAP, THEN PRESS A KEY</Text>
            <View style={[st.grid, { marginBottom: 24 }]}>
              {[['control', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift'], ['command', winLabel]].map(([k, l]) => (
                <ModChip key={k} label={l} active={mods[k]} onPress={() => setMods((p) => ({ ...p, [k]: !p[k] }))} />
              ))}
            </View>

            <Section title="SPECIAL KEYS">
              {NAV_KEYS.map(([l, k]) => (
                <TouchableOpacity key={k} style={st.keyBtn} activeOpacity={0.6} onPress={() => { haptic(); sendKey(k); }}>
                  <Text style={st.keyTxt}>{l}</Text>
                </TouchableOpacity>
              ))}
            </Section>

            <Section title="FUNCTION KEYS">
              {F_KEYS.map(([l, k]) => (
                <TouchableOpacity key={k} style={st.keyBtn} activeOpacity={0.6} onPress={() => { haptic(); sendKey(k); }}>
                  <Text style={st.keyTxt}>{l}</Text>
                </TouchableOpacity>
              ))}
            </Section>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ---------------- SHORTCUTS TAB ---------------- */}
      {tab === 'fast' && (
        <ScrollView style={st.body} showsVerticalScrollIndicator={false}>
          <Section title="EDITING">
            {EDIT.map((s) => <Tile key={s.label} icon={s.icon} label={s.label} onPress={() => runShortcut(s)} />)}
          </Section>
          <Section title="BROWSER">
            {BROWSER.map((s) => <Tile key={s.label} icon={s.icon} label={s.label} onPress={() => runShortcut(s)} />)}
          </Section>
          <Section title="WINDOWS & SYSTEM">
            {SYSTEM.map((s) => <Tile key={s.label} icon={s.icon} label={s.label} color={s.color} onPress={() => runShortcut(s)} />)}
          </Section>
          <Section title="MEDIA">
            {MEDIA.map((s) => <Tile key={s.label} icon={s.icon} label={s.label} onPress={() => runShortcut(s)} />)}
          </Section>
          <Section title="POWER">
            {POWER.map((s) => <Tile key={s.label} icon={s.icon} label={s.label} color={s.color} onPress={() => runPower(s)} />)}
          </Section>
          <View style={{ height: 10 }} />
        </ScrollView>
      )}

      {/* ---------------- FILES TAB ---------------- */}
      {tab === 'files' && (
        <ScrollView style={st.body} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={st.drop} activeOpacity={0.7} onPress={pickFiles}>
            <View style={st.dropIcon}>
              <Ionicons name="arrow-up" size={22} color={C.onAccent} />
            </View>
            <Text style={st.dropTitle}>Send files to PC</Text>
            <Text style={st.dropSub}>Photos, videos, PDFs, anything. Saved to Downloads/PhoneDrops</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[st.mBtn, { marginTop: 12, flex: 0 }]} activeOpacity={0.7} onPress={() => send({ t: 'openDrops' })}>
            <Ionicons name="folder-open-outline" size={18} color={C.text} />
            <Text style={st.mBtnTxt}>Open PhoneDrops folder on PC</Text>
          </TouchableOpacity>

          <View style={st.tip}>
            <Ionicons name="information-circle-outline" size={18} color={C.sub} />
            <Text style={st.tipTxt}>
              To drag files already on the PC (into a folder or onto an app), use the Touchpad tab with long-press, hold Left, or Drag lock.
            </Text>
          </View>

          <Text style={[st.sectionTitle, { marginTop: 26 }]}>TRANSFERS</Text>
          {files.length === 0 && <Text style={st.empty}>No files sent yet.</Text>}
          {files.map((f) => (
            <View key={f.id} style={st.fileRow}>
              <Ionicons
                name={f.status === 'done' ? 'checkmark-circle' : f.status === 'error' ? 'alert-circle' : 'document-outline'}
                size={24}
                color={f.status === 'done' ? C.text : f.status === 'error' ? C.danger : C.sub}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={st.fileName} numberOfLines={1}>{f.name}</Text>
                <View style={st.barBg}>
                  <View style={[st.barFill, { width: `${Math.round(f.progress * 100)}%`, backgroundColor: f.status === 'error' ? C.danger : C.text }]} />
                </View>
                <Text style={st.fileMeta}>
                  {fmtSize(f.size)} · {f.status === 'uploading' ? Math.round(f.progress * 100) + '%' : f.status === 'done' ? 'Sent' : 'Failed'}
                </Text>
              </View>
            </View>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* Floating bottom navigation */}
      <View style={st.tabWrap}>
        <View style={st.tabBar}>
          {tabs.map((t) => {
            const on = tab === t.k;
            return (
              <TouchableOpacity
                key={t.k}
                style={[st.tabItem, on && st.tabItemOn]}
                onPress={() => { haptic(); setTab(t.k); }}
                activeOpacity={0.8}
              >
                <Ionicons name={t.icon} size={19} color={on ? C.onAccent : C.sub} />
                {on && <Text style={st.tabTxt} numberOfLines={1}>{t.l}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

// =====================================================================
//                                 STYLES
// =====================================================================
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: {
    alignSelf: 'center', width: 72, height: 72, borderRadius: 22, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  brand: { color: C.text, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 8 },
  tag: { color: C.sub, textAlign: 'center', marginTop: 10, marginBottom: 30, lineHeight: 20, paddingHorizontal: 12, fontSize: 14 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: C.line },
  label: { color: C.sub, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.6, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg,
    borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line,
  },
  input: { flex: 1, color: C.text, paddingVertical: 14, fontSize: 15 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  errTxt: { color: C.danger, fontSize: 13, flex: 1 },
  cta: {
    marginTop: 20, backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaTxt: { color: C.onAccent, fontWeight: '700', fontSize: 15.5, letterSpacing: 0.3 },
  foot: { color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 20, paddingHorizontal: 20, lineHeight: 18 },

  // header
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, gap: 10,
  },
  hostIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  hTitle: { color: C.text, fontWeight: '700', fontSize: 16, letterSpacing: 0.2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ok, marginRight: 6 },
  hSub: { color: C.sub, fontSize: 10, letterSpacing: 1.2, fontWeight: '600' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.card,
    paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.line,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 12, fontWeight: '700', color: C.text, letterSpacing: 0.3 },
  power: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: C.line,
  },

  body: { flex: 1, paddingHorizontal: 16 },

  // touchpad
  pad: {
    flex: 1, backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.line2,
    overflow: 'hidden', marginBottom: 10,
  },
  padDrag: { borderColor: C.text, backgroundColor: '#111113' },
  corner: { position: 'absolute', width: 16, height: 16, borderColor: C.line2, borderRadius: 3 },
  padCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  padHint: { color: C.sub, fontSize: 10.5, fontWeight: '700', letterSpacing: 2.4, marginTop: 12 },
  legend: { marginTop: 18, gap: 8, alignSelf: 'stretch' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  legendKey: { color: C.sub, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, width: 68, textAlign: 'right' },
  legendVal: { color: C.dim, fontSize: 11.5, flex: 1.6 },
  glow: {
    position: 'absolute', left: -32, top: -32, width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)',
  },
  dragBadge: {
    position: 'absolute', top: 18, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.accent, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14,
  },
  dragTxt: { color: C.onAccent, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.4 },

  btnRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mBtn: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card, borderRadius: 16, paddingVertical: 15, borderWidth: 1, borderColor: C.line2,
  },
  mBtnPrimary: { backgroundColor: C.accent, borderColor: C.accent },
  mBtnTxt: { color: C.text, fontWeight: '600', fontSize: 13, letterSpacing: 0.2 },

  // control panel
  panel: {
    backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: 10, gap: 10,
  },
  seg: {
    flexDirection: 'row', backgroundColor: C.bg, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.line,
  },
  segItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 10, borderRadius: 11,
  },
  segItemOn: { backgroundColor: C.accent },
  segTxt: { color: C.sub, fontWeight: '700', fontSize: 13, letterSpacing: 0.2 },

  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleCard: {
    flex: 1, backgroundColor: C.bg, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: C.line,
  },
  toggleCardOn: { borderColor: C.line2, backgroundColor: C.card2 },
  toggleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  toggleIcon: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleTitle: { color: C.text, fontWeight: '700', fontSize: 13.5 },
  toggleSub: { color: C.sub, fontSize: 11, marginTop: 2 },

  speedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bg,
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderColor: C.line,
  },
  speedBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: C.card2, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: C.line2,
  },
  speedHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  speedLabel: { color: C.sub, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.6 },
  speedVal: { color: C.text, fontSize: 12, fontWeight: '800' },
  speedBars: { flexDirection: 'row', gap: 3 },
  speedSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: C.line2 },
  speedSegOn: { backgroundColor: C.accent },

  // keyboard + shortcuts
  sectionTitle: { color: C.sub, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.8, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modChip: {
    flexGrow: 1, minWidth: '22%', alignItems: 'center', paddingVertical: 13, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line2,
  },
  modChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  modChipTxt: { color: C.text, fontWeight: '700', fontSize: 13 },
  enterBtn: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  tile: {
    width: '31.5%', backgroundColor: C.card, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
    gap: 10, borderWidth: 1, borderColor: C.line,
  },
  tileIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center',
  },
  tileTxt: { color: C.text, fontSize: 12, fontWeight: '600' },
  keyBtn: {
    minWidth: '22%', flexGrow: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: C.line,
  },
  keyTxt: { color: C.text, fontWeight: '700', fontSize: 14 },

  // files
  drop: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 22, paddingVertical: 38,
    alignItems: 'center', backgroundColor: C.card,
  },
  dropIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  dropTitle: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 14 },
  dropSub: { color: C.sub, fontSize: 12.5, marginTop: 6, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
  tip: {
    flexDirection: 'row', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: C.line,
  },
  tipTxt: { color: C.sub, fontSize: 12.5, lineHeight: 18, flex: 1 },
  empty: { color: C.dim, fontSize: 13 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: C.line,
  },
  fileName: { color: C.text, fontWeight: '600', fontSize: 14 },
  barBg: { height: 3, backgroundColor: C.line, borderRadius: 2, marginTop: 9, overflow: 'hidden' },
  barFill: { height: 3, borderRadius: 2 },
  fileMeta: { color: C.sub, fontSize: 11.5, marginTop: 7 },

  // power countdown banner
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.accent,
    marginHorizontal: 16, marginBottom: 10, paddingVertical: 10, paddingLeft: 14, paddingRight: 10, borderRadius: 16,
  },
  bannerTxt: { flex: 1, color: C.onAccent, fontWeight: '800', fontSize: 13.5 },
  bannerBtn: { backgroundColor: C.onAccent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  bannerBtnTxt: { color: C.accent, fontWeight: '800', fontSize: 11, letterSpacing: 1.2 },

  // floating bottom navigation
  tabWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 4 : 12 },
  tabBar: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: 26, padding: 6, gap: 4,
    borderWidth: 1, borderColor: C.line2,
  },
  tabItem: {
    flex: 1, height: 46, borderRadius: 20, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7,
  },
  tabItemOn: { flex: 2.2, backgroundColor: C.accent },
  tabTxt: { color: C.onAccent, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },
});