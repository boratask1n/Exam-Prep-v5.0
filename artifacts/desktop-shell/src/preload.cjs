const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("examPrepDesktop", {
  getServerUrl: () => ipcRenderer.invoke("server-url:get"),
  setServerUrl: (url) => ipcRenderer.invoke("server-url:set", url),
  retry: () => ipcRenderer.invoke("server-url:retry"),
});
