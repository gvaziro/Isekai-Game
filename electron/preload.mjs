import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("lastSummonDesktop", {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  profileRead: () => ipcRenderer.invoke("last-summon:profile-read"),
  profileWrite: (json) => ipcRenderer.invoke("last-summon:profile-write", json),
});
