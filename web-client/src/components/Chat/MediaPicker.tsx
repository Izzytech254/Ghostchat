import { useState, useRef } from "react";
import styles from "./MediaPicker.module.css";

export type MediaType = "image" | "video" | "audio" | "file";

export interface MediaFile {
  type: MediaType;
  file: File;
  preview?: string;
  compressed?: Blob;
}

interface MediaPickerProps {
  onSelect: (media: MediaFile) => void;
  onClose: () => void;
}

const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.85;

function getMediaType(file: File): MediaType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

async function compressImage(file: File): Promise<{ blob: Blob; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not compress image"));
              return;
            }
            const preview = URL.createObjectURL(blob);
            resolve({ blob, preview });
          },
          "image/jpeg",
          IMAGE_QUALITY
        );
      };

      img.onerror = () => reject(new Error("Could not load image"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function MediaPicker({ onSelect, onClose }: MediaPickerProps) {
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const type = getMediaType(file);
    setCompressing(true);
    setProgress(0);
    setError(null);

    try {
      let result: { blob: Blob; preview: string };

      if (type === "image") {
        setProgress(20);
        result = await compressImage(file);
        setProgress(100);
      } else if (type === "video") {
        setProgress(50);
        const preview = URL.createObjectURL(file);
        result = { blob: file, preview };
        setProgress(100);
      } else if (type === "audio") {
        setProgress(50);
        const preview = URL.createObjectURL(file);
        result = { blob: file, preview };
        setProgress(100);
      } else {
        const preview = URL.createObjectURL(file);
        result = { blob: file, preview };
        setProgress(100);
      }

      onSelect({
        type,
        file,
        preview: result.preview,
        compressed: result.blob,
      });
    } catch (err) {
      console.error("Compression failed:", err);
      setError("Failed to process file");
      const preview = URL.createObjectURL(file);
      onSelect({ type, file, preview });
    } finally {
      setCompressing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={styles.picker}>
      <div className={styles.header}>
        <span className={styles.title}>Send Media</span>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
      </div>

      {compressing ? (
        <div className={styles.compressing}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <span>Processing... {progress}%</span>
        </div>
      ) : error ? (
        <div className={styles.error}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>Try Again</button>
        </div>
      ) : (
        <div className={styles.buttons}>
          <button className={styles.btn} onClick={openFilePicker}>
            <span className={styles.iconBg}>
              <span className={styles.icon}>🖼️</span>
            </span>
            <span className={styles.btnText}>Photo</span>
          </button>
          
          <button className={styles.btn} onClick={openFilePicker}>
            <span className={styles.iconBg}>
              <span className={styles.icon}>🎬</span>
            </span>
            <span className={styles.btnText}>Video</span>
          </button>
          
          <button className={styles.btn} onClick={openFilePicker}>
            <span className={styles.iconBg}>
              <span className={styles.icon}>🎤</span>
            </span>
            <span className={styles.btnText}>Audio</span>
          </button>
          
          <button className={styles.btn} onClick={openFilePicker}>
            <span className={styles.iconBg}>
              <span className={styles.icon}>📁</span>
            </span>
            <span className={styles.btnText}>File</span>
          </button>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
            onChange={handleInputChange}
            className={styles.hidden}
          />
        </div>
      )}
    </div>
  );
}
