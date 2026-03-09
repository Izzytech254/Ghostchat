import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { deriveStorageKey } from "@/utils/storage";
import { setStorageKey } from "@/utils/storage";
import WhisproLogo from "@/components/WhisproLogo";
import styles from "./AuthScreen.module.css";

type Step = "landing" | "setup" | "unlock";

export default function AuthScreen() {
  const { createAccount, loadAccount, setUnlocked } = useAccountStore();

  // Check if an account exists by looking for the salt in localStorage
  // (salt is stored when account is created, so its presence means account exists)
  const hasExistingAccount = !!localStorage.getItem("wp_salt");

  const [step, setStep] = useState<Step>(
    hasExistingAccount ? "unlock" : "landing",
  );
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    setError("");

    if (username.trim().length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (passphrase.length < 4) {
      setError("Passphrase must be at least 4 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match.");
      return;
    }

    setLoading(true);
    try {
      console.log("[AuthScreen] Creating account for:", username.trim());
      setError("Deriving key...");
      const { key, salt } = await deriveStorageKey(passphrase);
      localStorage.setItem("wp_salt", btoa(String.fromCharCode(...salt)));
      setStorageKey(key);
      console.log("[AuthScreen] Storage key set, calling createAccount");
      setError("Registering with server...");
      await createAccount(username.trim());
      console.log("[AuthScreen] Account created, store state:", useAccountStore.getState());
      // Explicitly set unlocked in case createAccount didn't trigger re-render
      setUnlocked(true);
      setError("");
    } catch (e) {
      console.error("[AuthScreen] Account creation failed:", e);
      const errMsg = e instanceof Error ? e.message : "Failed to create account.";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setError("");
    setLoading(true);

    try {
      console.log("[AuthScreen] Attempting unlock...");
      const rawSalt = localStorage.getItem("wp_salt");
      if (!rawSalt)
        throw new Error("No salt found - please create a new account.");

      const salt = Uint8Array.from(atob(rawSalt), (c) => c.charCodeAt(0));
      console.log("[AuthScreen] Deriving key from passphrase...");
      const { key } = await deriveStorageKey(passphrase, salt);
      setStorageKey(key);
      console.log("[AuthScreen] Storage key set, loading account...");

      // Reload account data now that storage is unlocked
      await loadAccount();
      
      // Verify account was actually loaded (decryption worked)
      const { account } = useAccountStore.getState();
      console.log("[AuthScreen] Account after load:", account);
      if (!account) {
        throw new Error("Wrong passphrase - unable to decrypt account.");
      }
      
      console.log("[AuthScreen] Unlock successful, setting isUnlocked=true");
      setUnlocked(true);
    } catch (e) {
      console.error("[AuthScreen] Unlock failed:", e);
      setError(e instanceof Error ? e.message : "Wrong passphrase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <WhisproLogo size={100} className={styles.logo} />
        <h1 className={styles.title}>Whispro</h1>
        <p className={styles.sub}>Whisper Without Worry</p>

        {step === "landing" && (
          <div className={styles.buttons}>
            <button className={styles.btn} onClick={() => setStep("setup")}>
              New Identity
            </button>
            <button
              className={`${styles.btn} ${styles.secondary}`}
              onClick={() => setStep("unlock")}
            >
              I Have an Account
            </button>
          </div>
        )}

        {step === "setup" && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              handleSetup();
            }}
          >
            <label className={styles.label}>
              Username
              <input
                className={styles.input}
                type="text"
                placeholder="anonymous_whisper"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </label>

            <label className={styles.label}>
              Passphrase
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••••••"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </label>

            <label className={styles.label}>
              Confirm Passphrase
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "Materializing..." : "Create Identity"}
            </button>
          </form>
        )}

        {step === "unlock" && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
          >
            <label className={styles.label}>
              Passphrase
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••••••"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoFocus
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? "Entering..." : "Enter"}
            </button>
            <button
              className={`${styles.btn} ${styles.secondary}`}
              type="button"
              onClick={() => setStep("landing")}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
