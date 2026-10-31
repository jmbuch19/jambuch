"use client";

import { useEffect } from "react";
import { isInstalled, markDone, watchInstallPrompt } from "./install/install-state";

// Registers the service worker (public/sw.js) and keeps the browser's install
// prompt for our own card. Production only: in development it would cache
// half-built pages.
export default function Pwa() {
  useEffect(() => {
    watchInstallPrompt();
    // Opened from the home-screen icon: it's installed, never ask again.
    if (isInstalled()) markDone();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
