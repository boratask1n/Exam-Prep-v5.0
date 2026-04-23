const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("examPrepDesktop", {
  getServerUrl: () => ipcRenderer.invoke("server-url:get"),
  setServerUrl: (url) => ipcRenderer.invoke("server-url:set", url),
  retry: () => ipcRenderer.invoke("server-url:retry"),
  clearCache: () => ipcRenderer.invoke("cache:clear"),
  getMeta: () => ipcRenderer.invoke("desktop:get-meta"),
  getUpdateState: () => ipcRenderer.invoke("desktop:update:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:update:check"),
  installUpdate: () => ipcRenderer.invoke("desktop:update:install"),
  checkSync: (token) => ipcRenderer.invoke("desktop:sync:check", token),
  onUpdateState: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop:update-state", listener);
    return () => ipcRenderer.removeListener("desktop:update-state", listener);
  },
});
