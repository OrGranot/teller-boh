"use client";
import { useEffect, useState } from "react";

type Mode = "android" | "ios" | null;

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;
}
function isInStandaloneMode() {
  return ("standalone" in navigator && (navigator as unknown as Record<string, unknown>).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let deferredPrompt: any = null;

export default function InstallPWABanner() {
  const [mode,    setMode]    = useState<Mode>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return; // already installed
    if (localStorage.getItem("pwa-dismissed")) return;

    // Android: listen for Chrome's install prompt
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt = e;
      setMode("android");
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari: show manual instructions
    if (isIOS()) {
      setMode("ios");
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem("pwa-dismissed", "1");
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === "accepted") {
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe-area-inset-bottom">
      <div className="mx-auto max-w-sm mb-4 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <img src="/icon-192.png" alt="Teller Berlin" className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Add to Home Screen</p>
            <p className="text-xs text-gray-500 truncate">Teller Berlin — quick clock-in access</p>
          </div>
          <button
            onClick={dismiss}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 p-1"
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Android: one-tap install */}
        {mode === "android" && (
          <div className="px-4 pb-4">
            <button
              onClick={install}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "#701C42" }}
            >
              Install app
            </button>
          </div>
        )}

        {/* iOS: step-by-step instructions */}
        {mode === "ios" && (
          <div className="px-4 pb-4">
            <ol className="text-xs text-gray-600 space-y-1.5 list-none">
              <li className="flex items-start gap-2">
                <span className="font-bold text-gray-400 w-4 flex-shrink-0">1.</span>
                <span>Tap the <strong>Share</strong> button <span className="inline-block align-middle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 inline">
                    <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                </span> at the bottom of Safari</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-gray-400 w-4 flex-shrink-0">2.</span>
                <span>Scroll down and tap <strong>Add to Home Screen</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-gray-400 w-4 flex-shrink-0">3.</span>
                <span>Tap <strong>Add</strong> — done!</span>
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
