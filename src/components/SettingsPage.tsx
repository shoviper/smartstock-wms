import { useEffect, useRef, useState, type FormEvent } from 'react';
import packageInfo from '../../package.json';
import { resetDefaultReorderPointDraft, validateDefaultReorderPointInput } from '../domain/settings';
import { useStore } from '../store/StoreProvider';
import { ResetDemoDialog } from './ResetDemoDialog';

const savedAtFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
});

export function SettingsPage() {
  const { state, persistenceInfo, updateDefaultReorderPoint, toggleTheme, resetDemoData } = useStore();
  const [value, setValue] = useState(() => resetDefaultReorderPointDraft(state.settings.defaultReorderPoint));
  const [resetOpen, setResetOpen] = useState(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const [showSavedNotice, setShowSavedNotice] = useState(false);
  const draftValidation = validateDefaultReorderPointInput(value);
  const savedValue = state.settings.defaultReorderPoint;
  const isUnchanged = draftValidation.valid && draftValidation.value === savedValue;
  const isDraftChanged = !isUnchanged;

  useEffect(() => {
    setValue(resetDefaultReorderPointDraft(state.settings.defaultReorderPoint));
  }, [state.settings.defaultReorderPoint]);

  useEffect(() => {
    if (state.feedback?.kind !== 'success' || state.feedback.message !== 'Default reorder point updated.') {
      setShowSavedNotice(false);
      return;
    }
    setShowSavedNotice(true);
    const timeout = window.setTimeout(() => setShowSavedNotice(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [state.feedback]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftValidation.valid || isUnchanged) return;
    setShowSavedNotice(false);
    updateDefaultReorderPoint(draftValidation.value);
  }

  function discardDraft() {
    setValue(resetDefaultReorderPointDraft(savedValue));
    setShowSavedNotice(false);
  }

  function confirmReset() {
    resetDemoData();
    discardDraft();
    setResetOpen(false);
  }

  function cancelReset() {
    discardDraft();
    setResetOpen(false);
  }

  const lastSavedAt = persistenceInfo.lastSavedAt
    ? savedAtFormatter.format(new Date(persistenceInfo.lastSavedAt))
    : null;
  const settingsFeedback = state.feedback && /default reorder point/i.test(state.feedback.message)
    ? state.feedback
    : null;
  const resetFeedback = state.feedback && /demo business data/i.test(state.feedback.message) ? state.feedback : null;

  return <main className="page-content admin-page settings-page">
    <header className="admin-page-header"><p className="eyebrow">SMARTSTOCK WMS · CONFIGURATION</p><h1>Settings</h1><p className="intro">Manage demo defaults, appearance and local data.</p></header>

    <section aria-labelledby="general-settings-title" className="settings-section">
      <div className="settings-section-heading"><div><h2 id="general-settings-title">General</h2><p>Preferences for this browser demo.</p></div></div>
      <form className="settings-default-form" onSubmit={handleSubmit}>
        <label className="settings-field" htmlFor="default-reorder-point"><span>Default reorder point</span><input aria-describedby="default-reorder-help default-reorder-error" id="default-reorder-point" inputMode="numeric" onChange={(event) => { setValue(event.target.value); setShowSavedNotice(false); }} type="text" value={value} /></label>
        <div className="settings-default-actions"><button className="primary-button settings-save-button" disabled={!draftValidation.valid || isUnchanged} type="submit">Save default</button><button className="secondary-button settings-cancel-button" disabled={!isDraftChanged} onClick={discardDraft} type="button">Cancel</button></div>
        <p className="settings-help" id="default-reorder-help">Allowed range: 1–{Number.MAX_SAFE_INTEGER.toLocaleString('en-US')}. Applies to new products in the future; it does not change existing products. This prototype does not yet support adding products.</p>
        <p className="settings-error field-error-message" id="default-reorder-error" role={draftValidation.valid ? 'status' : 'alert'}>{draftValidation.valid ? '' : draftValidation.message}</p>
        <p className="settings-saved-default">Saved default: {savedValue}</p>
        {settingsFeedback?.kind === 'error' && <p className="settings-feedback settings-feedback-error feedback-banner feedback-banner-error" role="alert">{settingsFeedback.message}</p>}
        {showSavedNotice && <p className="settings-saved-toast feedback-banner feedback-banner-success" role="status"><span>Default saved</span><button aria-label="Dismiss saved message" onClick={() => setShowSavedNotice(false)} type="button">×</button></p>}
      </form>
      <div className="settings-theme-row"><div><strong>Appearance</strong><p>Current theme: {state.theme === 'dark' ? 'Dark' : 'Light'}</p></div><button aria-pressed={state.theme === 'dark'} className="secondary-button" onClick={toggleTheme} type="button">Switch to {state.theme === 'dark' ? 'Light' : 'Dark'}</button></div>
    </section>

    <section aria-labelledby="demo-data-title" className="settings-section">
      <div className="settings-demo-row"><div><h2 id="demo-data-title">Demo data</h2><p>Restore products, locations, orders and movements to their sample values. Your session, theme and Settings are preserved.</p></div><button className="settings-reset-button" onClick={() => setResetOpen(true)} ref={resetTriggerRef} type="button">Reset demo data</button></div>
      {resetFeedback && <p className="settings-feedback settings-feedback-success feedback-banner feedback-banner-success" role="status">{resetFeedback.message}</p>}
    </section>

    <section aria-labelledby="system-info-title" className="settings-section">
      <div className="settings-section-heading"><div><h2 id="system-info-title">System info</h2><p>Application and local saved-data details.</p></div></div>
      {persistenceInfo.storageKey ? <dl className="system-info-list">
        <div><dt>Application version</dt><dd>{packageInfo.version}</dd></div>
        <div><dt>Saved data version</dt><dd>{persistenceInfo.version === null ? 'Not saved yet' : `v${persistenceInfo.version}`}</dd></div>
        <div><dt>Storage key</dt><dd><code>{persistenceInfo.storageKey}</code></dd></div>
        <div><dt>Last saved</dt><dd>{lastSavedAt ?? 'No saved timestamp available'}</dd></div>
      </dl> : <div className="settings-empty"><h3>Saved-data information unavailable</h3><p>Browser storage may be unavailable in this session.</p></div>}
    </section>

    {resetOpen && <ResetDemoDialog
      description="Products, locations, orders and movements will return to their original sample data. Your sign-in, theme and default reorder point will stay as they are."
      onCancel={cancelReset}
      onConfirm={confirmReset}
      returnFocusRef={resetTriggerRef}
    />}
  </main>;
}
