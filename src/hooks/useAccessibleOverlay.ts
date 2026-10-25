import { useEffect, useRef, type RefObject } from 'react';

export function useAccessibleOverlay(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose);
  const generationRef = useRef(0);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const generation = ++generationRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!containerRef.current?.contains(document.activeElement)) {
      const focusTarget = containerRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ) ?? containerRef.current;
      focusTarget?.focus({ preventScroll: true });
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      requestAnimationFrame(() => {
        if (generationRef.current !== generation) return;
        const target = returnFocusRef?.current ?? previous;
        if (target?.isConnected && !target.hasAttribute('disabled')) target.focus({ preventScroll: true });
      });
    };
  }, [open, containerRef, returnFocusRef]);
}
