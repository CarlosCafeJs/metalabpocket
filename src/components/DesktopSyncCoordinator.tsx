'use client';

import { useEffect } from 'react';

type StatusResponse = {
  api?: { reachable?: boolean; authorized?: boolean };
  preferences?: { automatic?: boolean; intervalSeconds?: number; paused?: boolean };
  retryWaiting?: number;
};

export default function DesktopSyncCoordinator() {
  useEffect(() => {
    if (window.metaLabDesktop?.enabled !== true) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval = 60_000;

    const tick = async () => {
      if (stopped || running) return;
      running = true;
      if (!navigator.onLine) {
        running = false;
        if (!stopped) timer = setTimeout(() => void tick(), interval);
        return;
      }
      try {
        const response = await fetch('/api/desktop/sync/status', { cache: 'no-store', credentials: 'same-origin' });
        const status = await response.json().catch(() => ({})) as StatusResponse;
        const preferences = status.preferences;
        if (preferences && Number.isInteger(preferences.intervalSeconds)) interval = Math.max(30, Math.min(300, preferences.intervalSeconds!)) * 1000;
        if (response.ok && navigator.onLine && status.api?.reachable && status.api.authorized && preferences?.automatic && !preferences.paused && (status.retryWaiting || 0) > 0) {
          window.dispatchEvent(new CustomEvent('metalab:desktop-sync', { detail: { state: 'running' } }));
          await fetch('/api/desktop/sync', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'automatic' })
          }).catch(() => undefined);
          window.dispatchEvent(new CustomEvent('metalab:desktop-sync', { detail: { state: 'finished' } }));
        }
      } catch { /* Connectivity is shown by the sync page; keep the local outbox intact. */ }
      finally {
        running = false;
        if (!stopped) timer = setTimeout(() => void tick(), interval);
      }
    };
    const onOnline = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    void tick();
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, []);
  return null;
}
