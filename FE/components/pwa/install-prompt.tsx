"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const PWA_INSTALLED_KEY = "pwa_installed";

function isIosUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    const uaMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    const smallViewport = window.innerWidth < 768;
    return uaMobile || smallViewport;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PWA_INSTALLED_KEY) === "1") {
      setDismissed(true);
      return;
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches || ((window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsStandalone(standalone);
    if (standalone) {
      window.localStorage.setItem(PWA_INSTALLED_KEY, "1");
      setDismissed(true);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      window.localStorage.setItem(PWA_INSTALLED_KEY, "1");
      setDismissed(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!isMobile || isStandalone || dismissed) return null;

  const iosManualInstall = isIosUserAgent();

  async function onInstall() {
    if (iosManualInstall) {
      setShowIosHelp((value) => !value);
      return;
    }
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(PWA_INSTALLED_KEY, "1");
      setDismissed(true);
    }
    setDeferredPrompt(null);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] rounded-2xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur sm:hidden">
      <p className="text-sm font-semibold text-foreground">Install this app for faster access.</p>
      {showIosHelp && (
        <p className="mt-2 text-xs text-muted-foreground">
          On iPhone: tap Share, then tap Add to Home Screen.
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" className="h-9" onClick={onInstall} disabled={!iosManualInstall && !deferredPrompt}>
          Install
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={() => setDismissed(true)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
