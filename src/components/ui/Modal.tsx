"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

/**
 * Matches prototype `.overlay > .modal`. Closing happens via:
 *   - Escape key
 *   - Clicking the backdrop (not the modal itself)
 *   - The caller setting `open={false}` after handling an in-modal action
 *
 * Mobile (≤680px): becomes a bottom sheet with a drag handle, per prototype.
 */
export function Modal({ open, onClose, title, description, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {(title || description) && (
          <div className="modal-h">
            {title && <h3>{title}</h3>}
            {description && <p>{description}</p>}
          </div>
        )}
        <div className="modal-b">{children}</div>
      </div>
    </div>
  );
}
