'use strict';
// Exposes a small, typed bridge as window.desktop (see src/lib/desktop.ts). Runs sandboxed with context isolation;
// the main process only honours these calls from the dashboard's own origin (or the bundled connect page).
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (callback) => {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,

  /** Shows a native notification. */
  notify: (notification) => ipcRenderer.send('desktop:notify', notification),
  /** Unread count for the taskbar / dock badge and the tray icon. */
  setUnreadCount: (count) => ipcRenderer.send('desktop:unread', count),
  /** The backend's origin: its files open in app windows and download in place. */
  setApiOrigin: (url) => ipcRenderer.send('desktop:api-origin', url),
  /** { dndUntil, version } */
  getState: () => ipcRenderer.invoke('desktop:state'),

  onNotificationClick: listen('desktop:notification-click'),
  onMarkAllRead: listen('desktop:mark-all-read'),
  onDoNotDisturb: listen('desktop:dnd'),

  // Connect page only.
  getConnectInfo: () => ipcRenderer.invoke('desktop:connect-info'),
  connect: (url) => ipcRenderer.invoke('desktop:connect', url),
  cancelConnect: () => ipcRenderer.send('desktop:connect-cancel'),
});
