import { create } from "zustand";

export type ToastKind = "ok" | "info" | "err";

export interface ToastOpts {
  sub?: string;
  kind?: ToastKind;
  /** Use 4200ms instead of 3000ms — for messages that deserve a longer read. */
  long?: boolean;
}

interface ToastStore {
  msg: string;
  sub: string;
  kind: ToastKind;
  visible: boolean;
  show: (msg: string, opts?: ToastOpts) => void;
  dismiss: () => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastStore>((set) => ({
  msg: "",
  sub: "",
  kind: "ok",
  visible: false,
  show: (msg, opts = {}) => {
    if (hideTimer) clearTimeout(hideTimer);
    set({
      msg,
      sub: opts.sub ?? "",
      kind: opts.kind ?? "ok",
      visible: true,
    });
    hideTimer = setTimeout(
      () => {
        set({ visible: false });
        hideTimer = null;
      },
      opts.long ? 4200 : 3000,
    );
  },
  dismiss: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ visible: false });
  },
}));

/** Hook returning the `show` function only — most callers don't need the rest. */
export function useToast() {
  return useToastStore((s) => s.show);
}
