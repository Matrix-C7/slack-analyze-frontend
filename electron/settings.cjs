'use strict';
// Desktop preferences, kept as JSON in the user-data folder (%APPDATA%\Slack Analyze\settings.json on Windows).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  /** Dashboard URL chosen on the connect page (overrides the build default). */
  appUrl: null,
  /** Closing the window keeps the app running in the tray. */
  closeToTray: true,
  /** Flash the taskbar button when a notification arrives while the window isn't focused. */
  flashFrame: true,
  /** Desktop notifications are paused until this time (ms since epoch); 0 = not paused. */
  dndUntil: 0,
  /** The "still running in the tray" hint was shown once. */
  trayHintShown: false,
  bounds: null,
  maximized: false,
};

let data = null;
let timer = null;

const file = () => path.join(app.getPath('userData'), 'settings.json');

function load() {
  if (data) return data;
  try {
    data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    data = { ...DEFAULTS };
  }
  return data;
}

function flush() {
  clearTimeout(timer);
  timer = null;
  if (!data) return;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file());
  } catch (err) {
    console.error('[settings] could not save', err);
  }
}

module.exports = {
  get: (key) => load()[key],
  set(patch) {
    Object.assign(load(), patch);
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  },
  flush,
};
