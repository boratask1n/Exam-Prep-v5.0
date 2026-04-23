type DesktopUpdateState = {
  status:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "up-to-date"
    | "error";
  currentVersion: string;
  latestVersion: string | null;
  downloadUrl: string | null;
  progressPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  manual: boolean;
  autoInstallSupported: boolean;
  isPortable: boolean;
  feedUrl: string;
};

type DesktopMeta = {
  currentVersion: string;
  serverUrl: string;
  isPackaged: boolean;
  autoInstallSupported: boolean;
  isPortable: boolean;
};

type DesktopSyncStatus = {
  ok: boolean;
  status: "ok" | "offline" | "missing-token" | "unauthorized" | "server-error";
  checkedAt: string;
  serverUrl: string;
  message: string;
  userName?: string | null;
};

type DesktopInstallResult = {
  action: "installing" | "download" | "none";
};

type DesktopUpdateListener = (state: DesktopUpdateState) => void;

interface Window {
  examPrepDesktop?: {
    getServerUrl: () => Promise<string>;
    setServerUrl: (url: string) => Promise<string>;
    retry: () => Promise<string>;
    clearCache: () => Promise<boolean>;
    getMeta: () => Promise<DesktopMeta>;
    getUpdateState: () => Promise<DesktopUpdateState>;
    checkForUpdates: () => Promise<DesktopUpdateState>;
    installUpdate: () => Promise<DesktopInstallResult>;
    checkSync: (token: string) => Promise<DesktopSyncStatus>;
    onUpdateState: (callback: DesktopUpdateListener) => () => void;
  };
}
