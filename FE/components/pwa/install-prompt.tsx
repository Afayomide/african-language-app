"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isIosUserAgent() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  return /safari/i.test(navigator.userAgent) && !/chrome|android|crios|fxios/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone = window.matchMedia("(display-mode: standalone)").matches || ((window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsStandalone(standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!isMobile || isStandalone || dismissed) return null;

  const iosManualInstall = isIosUserAgent() && isSafariBrowser();

  async function onInstall() {
    if (iosManualInstall) {
      setShowIosHelp((value) => !value);
      return;
    }
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
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

