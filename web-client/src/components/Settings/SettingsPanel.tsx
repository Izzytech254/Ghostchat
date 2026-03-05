import { useState } from "react";
import { useAccountStore } from "@/store/accountStore";
import styles from "./SettingsPanel.module.css";

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const { account, deleteAccount } = useAccountStore();
  const [confirming, setConfirming] = useState(false);
  const [wiping, setWiping] = useState(false);

  const triggerSelfDestruct = async () => {
    setWiping(true);
    await deleteAccount();
    // Page reloads to force a clean state
    window.location.reload();
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <button className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </header>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Account</h3>
        <div className={styles.row}>
          <span className={styles.key}>Username</span>
          <span className={styles.value}>{account?.username}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>Your ID</span>
          <span
            className={`${styles.value} ${styles.mono}`}
            style={{ fontSize: "10px", wordBreak: "break-all" }}
          >
            {account?.id}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>Identity key</span>
          <span className={`${styles.value} ${styles.mono}`}>
            {account?.identityKey.slice(0, 20)}…
          </span>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Privacy</h3>
        <div className={styles.row}>
          <span className={styles.key}>Screenshot protection</span>
          <span className={styles.badge}>Active</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>Metadata encryption</span>
          <span className={styles.badge}>Active</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>Zero-knowledge server</span>
          <span className={styles.badge}>Active</span>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={`${styles.sectionTitle} ${styles.danger}`}>
          Danger Zone
        </h3>

        {confirming ? (
          <div className={styles.confirmBox}>
            <p className={styles.warnText}>
              ⚠ This will{" "}
              <strong>
                permanently delete all messages, contacts, and keys
              </strong>
              . There is no recovery. Are you sure?
            </p>
            <div className={styles.confirmBtns}>
              <button
                className={`${styles.btn} ${styles.dangerBtn}`}
                onClick={triggerSelfDestruct}
                disabled={wiping}
              >
                {wiping ? "💀 Wiping…" : "💀 NUKE ALL DATA"}
              </button>
              <button
                className={`${styles.btn} ${styles.cancelBtn}`}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className={`${styles.btn} ${styles.dangerBtn}`}
            onClick={() => setConfirming(true)}
          >
            🔥 Self-Destruct (Delete all data)
          </button>
        )}
      </section>
    </div>
  );
}
