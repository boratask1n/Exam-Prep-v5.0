import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function isDesktopShell() {
  return (
    typeof window !== "undefined" &&
    typeof window.examPrepDesktop !== "undefined"
  );
}

function shouldShowPopup(state: DesktopUpdateState | null) {
  if (!state) return false;
  return ["available", "downloading", "downloaded", "error"].includes(
    state.status,
  );
}

export function DesktopStatusLayer() {
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(
    null,
  );
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;

    let cancelled = false;
    void window.examPrepDesktop?.getUpdateState().then((state) => {
      if (!cancelled) setUpdateState(state);
    });

    const unsubscribe = window.examPrepDesktop?.onUpdateState((state) => {
      if (!cancelled) setUpdateState(state);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const popupKey = useMemo(
    () =>
      updateState
        ? `${updateState.status}:${updateState.latestVersion || updateState.currentVersion}:${updateState.message || ""}`
        : null,
    [updateState],
  );

  const popupVisible =
    shouldShowPopup(updateState) &&
    popupKey !== null &&
    dismissedKey !== popupKey;

  const title =
    updateState?.status === "downloaded"
      ? "Güncelleme hazır"
      : updateState?.status === "downloading"
        ? "Güncelleme indiriliyor"
        : updateState?.status === "error"
          ? "Güncelleme kontrolü bekliyor"
          : "Yeni sürüm bulundu";

  const description =
    updateState?.status === "downloaded"
      ? `${updateState.latestVersion || "Yeni sürüm"} indirildi. Uygulama içinden kurabilirsin.`
      : updateState?.status === "downloading"
        ? `${updateState.latestVersion || "Yeni sürüm"} arka planda indiriliyor.`
        : updateState?.status === "error"
          ? updateState.message || "Güncelleme sunucusuna şu an ulaşılamadı."
          : `${updateState?.latestVersion || "Yeni sürüm"} hazır. İstersen şimdi indirebilirsin.`;

  const primaryLabel =
    updateState?.status === "downloaded"
      ? "Kur ve yeniden başlat"
      : updateState?.status === "error"
        ? "Tekrar dene"
        : "İndir";

  const primaryIcon =
    updateState?.status === "downloaded" ? (
      <CheckCircle2 className="h-4 w-4" />
    ) : updateState?.status === "error" ? (
      <RefreshCw className="h-4 w-4" />
    ) : updateState?.status === "downloading" ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Download className="h-4 w-4" />
    );

  const handlePrimaryAction = async () => {
    if (!window.examPrepDesktop || !updateState) return;
    if (updateState.status === "error") {
      const nextState = await window.examPrepDesktop.checkForUpdates();
      setUpdateState(nextState);
      return;
    }
    await window.examPrepDesktop.installUpdate();
  };

  if (!isDesktopShell()) return null;

  return popupVisible && updateState ? (
    <div className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-lg border border-primary/18 bg-background/96 shadow-[0_30px_70px_-30px_rgba(15,23,42,0.52)] backdrop-blur-xl">
        <div className="flex items-start gap-3 border-b border-border/55 bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(56,189,248,0.08))] px-4 py-4">
          <img
            src={`${import.meta.env.BASE_URL}brand/exam-duck-logo-256.png`}
            alt="Exam Duck"
            className="h-11 w-11 rounded-lg bg-white/80 object-contain p-1"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissedKey(popupKey)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sürüm {updateState.currentVersion}</span>
            <span>
              {updateState.latestVersion
                ? `Yeni: ${updateState.latestVersion}`
                : "Kontrol ediliyor"}
            </span>
          </div>

          {updateState.status === "downloading" ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${updateState.progressPercent || 0}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                %{updateState.progressPercent || 0} tamamlandı
              </p>
            </div>
          ) : null}

          {updateState.status === "error" ? (
            <div className="inline-flex items-center gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:border-amber-400/20 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                Gerekirse yeni kurulum dosyasını indirip üstüne açabilirsin.
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setDismissedKey(popupKey)}
            >
              Sonra
            </Button>
            <Button
              type="button"
              className="rounded-lg gap-2"
              onClick={() => void handlePrimaryAction()}
              disabled={updateState.status === "downloading"}
            >
              {primaryIcon}
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  ) : null;
}
