import type { ReactNode } from 'react';

interface ModalLayerProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  footer?: ReactNode;
  className?: string;
}

export default function ModalLayer({
  title,
  children,
  onClose,
  footer,
  className
}: ModalLayerProps) {
  const classes = ['modalPanel', className].filter(Boolean).join(' ');

  return (
    <div className="modalOverlay" role="presentation">
      <section className={classes} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modalHeader">
          <h1 id="modal-title">{title}</h1>
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
