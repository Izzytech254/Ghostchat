/**
 * accountStore.ts – Zustand store for the local user account.
 * Account is anonymous – no phone or email.
 */

import { create } from "zustand";
import {
  generateUUID,
  generateX25519KeyPair,
  generateEd25519KeyPair,
  exportPublicKey,
  signData,
  b64Decode,
} from "@/utils/crypto";
import { saveAccount, getAccount, nukeAllData } from "@/utils/storage";
import { registerKeys } from "@/utils/keyServerApi";
import type { Account } from "@/types";

interface AccountState {
  account: Account | null;
  isUnlocked: boolean;

  createAccount: (username: string) => Promise<Account>;
  loadAccount: () => Promise<void>;
  setUnlocked: (v: boolean) => void;
  deleteAccount: () => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  account: null,
  isUnlocked: false,

  createAccount: async (username) => {
    // Generate identity key pair (for signing)
    const identityKp = await generateEd25519KeyPair();
    const identityPub = await exportPublicKey(identityKp.publicKey);

    // Generate signed pre-key (for key exchange)
    const signedPreKp = await generateX25519KeyPair();
    const signedPrePub = await exportPublicKey(signedPreKp.publicKey);

    // Sign the pre-key with identity key
    const signature = await signData(
      identityKp.privateKey,
      b64Decode(signedPrePub),
    );

    // Generate some one-time pre-keys
    const oneTimePreKeys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const otkKp = await generateX25519KeyPair();
      oneTimePreKeys.push(await exportPublicKey(otkKp.publicKey));
    }

    const userId = generateUUID();

    // Register with key server
    await registerKeys({
      user_id: userId,
      username: username.trim().toLowerCase(),
      identity_key: identityPub,
      signed_pre_key: signedPrePub,
      signed_pre_key_id: 1,
      signature,
      one_time_pre_keys: oneTimePreKeys,
    });

    const account: Account = {
      id: userId,
      username: username.trim(),
      createdAt: Date.now(),
      identityKey: identityPub,
    };

    await saveAccount(account);
    set({ account, isUnlocked: true });
    return account;
  },

  loadAccount: async () => {
    const account = await getAccount();
    set({ account });
  },

  setUnlocked: (v) => set({ isUnlocked: v }),

  deleteAccount: async () => {
    await nukeAllData();
    set({ account: null, isUnlocked: false });
  },
}));
