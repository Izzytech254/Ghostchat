import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import { deriveStorageKey } from "@/utils/storage";
import { setStorageKey } from "@/utils/storage";
import GhostLogo from "@/components/GhostLogo";
import styles from "./AuthScreen.module.css";

type Step = "landing" | "setup" | "unlock";

export default function AuthScreen() {
  const { createAccount, loadAccount, setUnlocked } = useAccountStore();

  // Check if an account exists by looking for the salt in localStorage
  // (salt is stored when account is created, so its presence means account exists)
  const hasExistingAccount = !!localStorage.getItem("gc_salt");

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
    if (passphrase.length < 12) {
      setError("Passphrase must be at least 12 characters.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match.");
      return;
    }

    setLoading(true);
    try {
      const { key, salt } = await deriveStorageKey(passphrase);
      // Store salt in localStorage (not secret, just needed for key derivation later)
      localStorage.setItem("gc_salt", btoa(String.fromCharCode(...salt)));
      setStorageKey(key);
      await createAccount(username.trim());
    } catch (e) {
      console.error("Account creation failed:", e);
      setError(e instanceof Error ? e.message : "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async () => {
    setError("");
    setLoading(true);

    try {
      const rawSalt = localStorage.getItem("gc_salt");
      if (!rawSalt)
        throw new Error("No salt found - please create a new account.");

      const salt = Uint8Array.from(atob(rawSalt), (c) => c.charCodeAt(0));
      await deriveStorageKey(passphrase, salt);

      // Reload account data now that storage is unlocked
      await loadAccount();
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wrong passphrase.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <GhostLogo size={100} className={styles.logo} />
        <h1 className={styles.title}>GhostChat</h1>
        <p className={styles.sub}>Secure. Ephemeral. Untraceable.</p>

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
                placeholder="anonymous_ghost"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </label>

            <label className={styles.label}>
              Passphrase (12+ characters)
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
