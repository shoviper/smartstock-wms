import { useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { Product } from '../domain/models';
import { filterProductsBySkuQuery } from '../domain/skuSearch';

interface SkuComboboxProps {
  id: string;
  products: Product[];
  selectedSku: string;
  onSelect(sku: string): void;
  onClear(): void;
}

export function SkuCombobox({ id, products, selectedSku, onSelect, onClear }: SkuComboboxProps) {
  const [open, setOpen] = useState(false);
  const [browseAll, setBrowseAll] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-listbox`;
  const selectedProduct = products.find((product) => product.sku === selectedSku);
  const visibleProducts = useMemo(() => filterProductsBySkuQuery(products, query), [products, query]);
  const activeProduct = visibleProducts[activeIndex];

  function openAll() {
    setQuery('');
    setBrowseAll(true);
    const selectedIndex = products.findIndex((product) => product.sku === selectedSku);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
    inputRef.current?.select();
  }

  function choose(product: Product) {
    onSelect(product.sku);
    setQuery('');
    setBrowseAll(false);
    setOpen(false);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
    setQuery('');
    setBrowseAll(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) openAll();
      else setActiveIndex((index) => Math.min(index + 1, visibleProducts.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openAll();
      else setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && activeProduct) {
      event.preventDefault();
      choose(activeProduct);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      setBrowseAll(false);
    }
  }

  return <div className="sku-combobox" onBlur={handleBlur}>
    <div className="sku-combobox-control">
      <input
        aria-activedescendant={open && activeProduct ? `${id}-option-${activeIndex}` : undefined}
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required="true"
        autoComplete="off"
        className="sku-combobox-input"
        id={id}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setBrowseAll(false);
          setQuery(nextQuery);
          setOpen(true);
          setActiveIndex(0);
        }}
        onClick={() => { if (!open) openAll(); }}
        onFocus={openAll}
        onKeyDown={handleKeyDown}
        placeholder="Search SKU or product name"
        ref={inputRef}
        role="combobox"
        required
        value={open ? (browseAll && selectedProduct ? `${selectedProduct.sku} — ${selectedProduct.name}` : query) : selectedProduct ? `${selectedProduct.sku} — ${selectedProduct.name}` : ''}
      />
      <div className="sku-combobox-icons">
        <button aria-hidden={!selectedProduct} aria-label="Clear SKU" className={`sku-combobox-icon-button sku-combobox-clear${selectedProduct ? '' : ' sku-combobox-clear-hidden'}`} disabled={!selectedProduct} onClick={() => {
          onClear(); setQuery(''); setBrowseAll(false); setOpen(false); inputRef.current?.focus();
        }} onMouseDown={(event) => event.preventDefault()} tabIndex={selectedProduct ? 0 : -1} type="button">
          <svg aria-hidden="true" fill="none" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
        <button aria-label={open ? 'Close SKU options' : 'Open SKU options'} aria-expanded={open} className="sku-combobox-icon-button sku-combobox-toggle" onClick={() => {
          if (open) { setOpen(false); setQuery(''); setBrowseAll(false); }
          else { inputRef.current?.focus(); openAll(); }
        }} onMouseDown={(event) => event.preventDefault()} type="button">
          <svg aria-hidden="true" fill="none" viewBox="0 0 16 16"><path d="m3.5 6 4.5 4.5L12.5 6" /></svg>
        </button>
      </div>
    </div>
    {open && <div className="sku-combobox-menu" id={listId} role="listbox" aria-label="Products">
      {visibleProducts.length === 0 ? <div className="sku-combobox-empty">No matching products</div> : visibleProducts.map((product, index) => <div
        aria-selected={product.sku === selectedSku}
        className={`sku-combobox-option${index === activeIndex ? ' sku-combobox-option-active' : ''}${product.sku === selectedSku ? ' sku-combobox-option-selected' : ''}`}
        id={`${id}-option-${index}`}
        key={product.sku}
        onClick={() => choose(product)}
        onMouseDown={(event) => event.preventDefault()}
        role="option"
      ><strong>{product.sku}</strong><span>{product.name}</span></div>)}</div>}
  </div>;
}
