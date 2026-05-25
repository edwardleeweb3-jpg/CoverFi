import { create } from "zustand";

/**
 * Wallet UI flow state machine. Connection state (address, isConnected,
 * chainId, balance) lives in wagmi hooks now — this store only tracks
 * which modal layer is visible (idle / picker / spinner-while-connecting).
 */
export type WalletFlow =
  | { kind: "idle" }
  | { kind: "picker" }
  | { kind: "connecting"; name: string };

interface WalletStore {
  flow: WalletFlow;
  openPicker: () => void;
  closePicker: () => void;
  /** WalletFlow flips to the spinner-state right after dispatching wagmi connect(). */
  setConnecting: (name: string) => void;
  /** Returns the flow to idle (used by WalletFlow after success / error). */
  setIdle: () => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  flow: { kind: "idle" },
  openPicker: () => set({ flow: { kind: "picker" } }),
  closePicker: () => set({ flow: { kind: "idle" } }),
  setConnecting: (name) => set({ flow: { kind: "connecting", name } }),
  setIdle: () => set({ flow: { kind: "idle" } }),
}));
