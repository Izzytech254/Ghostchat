import { useEffect, useState } from "react";
import WhisproLogo from "@/components/WhisproLogo";
import styles from "./WelcomeScreen.module.css";

interface WelcomeScreenProps {
  onComplete: () => void;
}

export default function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [phase, setPhase] = useState<"logo" | "slogan" | "done">("logo");

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase("slogan"), 600);
    const timer2 = setTimeout(() => setPhase("done"), 3000);
    const timer3 = setTimeout(() => onComplete(), 3200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  if (phase === "done") return null;

  return (
    <div className={styles.screen}>
      <div className={styles.bgGlow} />
      <div className={styles.bgGlow2} />
      
      <div className={styles.content}>
        <div className={`${styles.logoContainer} ${phase === "slogan" ? styles.logoUp : ""}`}>
          <WhisproLogo size={140} animated={true} />
        </div>
        
        <div className={`${styles.sloganContainer} ${phase === "slogan" ? styles.sloganVisible : ""}`}>
          <span className={styles.wordWrapper}>
            <span className={`${styles.word} ${styles.word1}`}>Whisper</span>
          </span>
          <span className={styles.wordWrapper}>
            <span className={`${styles.word} ${styles.word2}`}>Without</span>
          </span>
          <span className={styles.wordWrapper}>
            <span className={`${styles.word} ${styles.wordAccent} ${styles.word3}`}>Worry</span>
          </span>
        </div>
        
        <div className={`${styles.tagline} ${phase === "slogan" ? styles.taglineVisible : ""}`}>
          <span>✨ Secure Messaging</span>
        </div>
      </div>
      
      <div className={styles.particles}>
        <span className={styles.particle}>✦</span>
        <span className={styles.particle}>✧</span>
        <span className={styles.particle}>⋆</span>
        <span className={styles.particle}>✦</span>
        <span className={styles.particle}>✧</span>
      </div>
    </div>
  );
}
