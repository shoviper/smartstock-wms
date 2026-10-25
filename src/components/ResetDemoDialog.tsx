interface ResetDemoDialogProps {
  onCancel(): void;
  onConfirm(): void;
  description?: string;
}

export function ResetDemoDialog({ onCancel, onConfirm, description = 'Products, orders and movements will return to their original sample data. Your sign-in and theme will stay as they are.' }: ResetDemoDialogProps) {
  return <div className="demo-reset-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section aria-describedby="demo-reset-description" aria-labelledby="demo-reset-title" aria-modal="true" className="demo-reset-dialog" role="alertdialog">
      <p className="eyebrow">DEMO DATA</p>
      <h2 id="demo-reset-title">Reset demo data?</h2>
      <p id="demo-reset-description">{description}</p>
      <div className="demo-reset-actions"><button className="demo-reset-cancel" onClick={onCancel} type="button">Cancel</button><button className="demo-reset-confirm" onClick={onConfirm} type="button">Reset demo data</button></div>
    </section>
  </div>;
}
