import { useRef, type RefObject } from 'react';
import { useAccessibleOverlay } from '../hooks/useAccessibleOverlay';

interface ResetDemoDialogProps {
  onCancel(): void;
  onConfirm(): void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const resetDescription = 'Products, locations, orders and movements will return to their sample data. Your session, theme, and Settings (including the default reorder point) will be preserved.';

export function ResetDemoDialog({ onCancel, onConfirm, returnFocusRef }: ResetDemoDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useAccessibleOverlay(true, onCancel, dialogRef, returnFocusRef);
  return <div className="demo-reset-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section aria-describedby="demo-reset-description" aria-labelledby="demo-reset-title" aria-modal="true" className="demo-reset-dialog app-dialog" ref={dialogRef} role="alertdialog" tabIndex={-1}>
      <p className="eyebrow">DEMO DATA</p>
      <h2 id="demo-reset-title">Reset demo data?</h2>
      <p id="demo-reset-description">{resetDescription}</p>
      <div className="demo-reset-actions"><button className="demo-reset-cancel" onClick={onCancel} type="button">Cancel</button><button className="demo-reset-confirm" onClick={onConfirm} type="button">Reset demo data</button></div>
    </section>
  </div>;
}
