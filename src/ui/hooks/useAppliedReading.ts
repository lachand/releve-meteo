import { useEffect } from 'react';

/** Applique la lecture rapide sur `<html>` (`data-lecture`, styles/tokens.css). */
export function useAppliedReading(quick: boolean): void {
  useEffect(() => {
    if (quick) {
      document.documentElement.dataset.lecture = 'rapide';
    } else {
      delete document.documentElement.dataset.lecture;
    }
    return () => {
      delete document.documentElement.dataset.lecture;
    };
  }, [quick]);
}
