import { useEffect } from 'react';

/**
 * Applies the signed-in palette (index.css `.theme-app`) to <html> while a signed-in shell is
 * mounted — on <html> so portals and toasts follow it — and removes it on unmount, so the public
 * website never sees it.
 */
export function useAppTheme(): void {
  useEffect(() => {
    document.documentElement.classList.add('theme-app');
    return () => document.documentElement.classList.remove('theme-app');
  }, []);
}
