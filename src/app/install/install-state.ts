// Shared install state for the "Keep jambuch on your home screen" card, the
// /install page and the footer link. Android (Chrome, Edge, Samsung) offers an
// install prompt we can trigger; iPhone has none, so we show the steps.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DONE_KEY = "install.done"; // dismissed or installed: never ask again here
const FINISHED_KEY = "reader.finished-one"; // set when a first chapter is finished

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

// The browser can offer its prompt before the page's scripts start; this tiny
// inline script (root layout) holds on to it until watchInstallPrompt runs.
export const EARLY_PROMPT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__installPrompt=e})`;

// Called once from <Pwa /> in the root layout.
export function watchInstallPrompt() {
  const early = (window as Window & { __installPrompt?: InstallPrompt }).__installPrompt;
  if (early) deferred = early;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own gentle card
    deferred = e as InstallPrompt;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    markDone();
    notify();
  });
}

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const canPrompt = () => deferred !== null;

export async function promptInstall() {
  if (!deferred) return false;
  const prompt = deferred;
  deferred = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === "accepted") markDone();
  notify();
  return outcome === "accepted";
}

export function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIphone() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but with a touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const isPhone = () => isIphone() || /Android/.test(navigator.userAgent);

export function markDone() {
  try {
    localStorage.setItem(DONE_KEY, "1");
  } catch {}
}

export function isDone() {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFinishedOne() {
  try {
    if (localStorage.getItem(FINISHED_KEY)) return;
    localStorage.setItem(FINISHED_KEY, "1");
  } catch {}
  window.dispatchEvent(new Event("jambuch:finished-one"));
}

export function hasFinishedOne() {
  try {
    return localStorage.getItem(FINISHED_KEY) === "1";
  } catch {
    return false;
  }
}
