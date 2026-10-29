import 'server-only';
import { getDesktopSecretValue, saveDesktopSecretValue } from '@/server/desktop/store';

export const DEFAULT_DESKTOP_BACKEND_ORIGIN = 'https://metalab.cafeflow.com.br';
const BACKEND_SETTING_KEY = 'desktop:backend-origin';

export function getDesktopBackendOrigin() {
  const savedOrigin = getDesktopSecretValue(BACKEND_SETTING_KEY);
  if (savedOrigin) return savedOrigin;
  if (process.env.METALAB_DESKTOP_TEST_MODE === '1') return process.env.METALAB_DESKTOP_TEST_BACKEND_URL || DEFAULT_DESKTOP_BACKEND_ORIGIN;
  return DEFAULT_DESKTOP_BACKEND_ORIGIN;
}

export function saveDesktopBackendOrigin(origin: string) {
  saveDesktopSecretValue(BACKEND_SETTING_KEY, origin);
}
