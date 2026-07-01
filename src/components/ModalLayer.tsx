import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

interface ModalLayerProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true'
  );
}

export default function ModalLayer({
  title,
  children,
  onClose,
  footer,
  className
}: ModalLayerProps) {
  const classes = ['modalPanel', className].filter(Boolean).join(' ');
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;

    if (!panel) {
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstFocusableElement = getFocusableElements(panel)[0];
    (firstFocusableElement ?? panel).focus();

    return () => {
      const previousFocus = previousFocusRef.current;

      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      if (onCloseRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const focusableElements = getFocusableElements(panel);

    if (focusableElements.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (event.shiftKey) {
      if (!activeElement || activeElement === firstFocusableElement || !panel.contains(activeElement)) {
        event.preventDefault();
        lastFocusableElement.focus();
      }

      return;
    }

    if (!activeElement || activeElement === lastFocusableElement || !panel.contains(activeElement)) {
      event.preventDefault();
      firstFocusableElement.focus();
    }
  };

  return (
    <div className="modalOverlay" role="presentation">
      <section
        ref={panelRef}
        className={classes}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="modalHeader">
          <h1 id={titleId}>{title}</h1>
          {onClose ? (
            <button className="iconButton" type="button" aria-label="关闭" onClick={onClose}>
              ×
            </button>
          ) : null}
        </header>
        <div className="modalBody">{children}</div>
        {footer ? <footer className="modalFooter">{footer}</footer> : null}
      </section>
    </div>
  );
}
