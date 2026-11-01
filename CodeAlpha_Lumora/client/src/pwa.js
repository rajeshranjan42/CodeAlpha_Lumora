import { useEffect, useState } from 'react';

/* Install-as-app support. The browser fires `beforeinstallprompt` once, early, so it is captured here at import time. */
let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true);

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** { canInstall, installed, ios, install() } — canInstall is true when the browser can show its install prompt. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return {
    canInstall: !!deferred && !isStandalone(),
    installed: isStandalone(),
    ios: isIOS() && !isStandalone(),
    install: async () => {
      if (!deferred) return false;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === 'accepted';
    },
  };
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker failed:', e.message));
  });
}