"use client";

import type { ReactNode } from "react";

/** Form s JS potvrdenim pred odoslanim - mirror onsubmit="return confirm(...)" v EJS. */
export default function ConfirmForm({
  action, confirmText, children, style,
}: {
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <form
      action={action}
      style={style}
      onSubmit={(e) => { if (!confirm(confirmText)) e.preventDefault(); }}
    >
      {children}
    </form>
  );
}
