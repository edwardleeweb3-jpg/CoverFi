import { create } from "zustand";
import { dictionaries } from "@/lib/i18n";
import { useLocaleStore } from "./locale";
import { useToastStore } from "./toast";

/**
 * Connection flow as a small state machine — mirrors the prototype's two-step
 * UX (picker → connecting → done) instead of a single synchronous flip.
 */
export type WalletFlow =
  | { kind: "idle" }
  | { kind: "picker" }
  | { kind: "connecting"; name: string };

interface WalletStore {
  // Persistent wallet state.
  connected: boolean;
  address: string;
  /** USDC balance, kept as a plain number while the prototype simulates with USDC. */
  balance: number;

  // UI flow state — drives <WalletFlow /> rendering.
  flow: WalletFlow;

  /** Open the wallet picker modal (entry point from "Connect wallet" buttons). */
  openPicker: () => void;
  /** Close the picker without picking a wallet (Esc / backdrop click). */
  closePicker: () => void;
  /**
   * User picked a wallet — switch to the connecting spinner state, then after
   * a simulated 1100ms flip to connected and fire the success toast.
   * Real wagmi integration replaces this in a later step.
   */
  pickWallet: (name: string) => void;
  /** Drop the connection and fire the disconnected toast. */
  disconnect: () => void;
}

const SIMULATED_CONNECT_MS = 1100;

export const useWalletStore = create<WalletStore>((set, get) => ({
  connected: false,
  address: "0x7a3f…9c2e",
  balance: 2450,
  flow: { kind: "idle" },

  openPicker: () => set({ flow: { kind: "picker" } }),
  closePicker: () => set({ flow: { kind: "idle" } }),

  pickWallet: (name) => {
    set({ flow: { kind: "connecting", name } });
    setTimeout(() => {
      // Re-read lang at fire time so language switches during the spinner work.
      const t = dictionaries[useLocaleStore.getState().lang];
      const addr = get().address;
      set({ connected: true, flow: { kind: "idle" } });
      useToastStore.getState().show(t.connected(name), {
        kind: "info",
        sub: addr,
      });
    }, SIMULATED_CONNECT_MS);
  },

  disconnect: () => {
    const t = dictionaries[useLocaleStore.getState().lang];
    set({ connected: false });
    useToastStore.getState().show(t.disconnected);
  },
}));
