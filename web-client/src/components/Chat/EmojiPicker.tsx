import { useState, useRef, useEffect } from "react";
import styles from "./EmojiPicker.module.css";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const emojiCategories = {
  recent: ["❤️", "😂", "🔥", "👍", "✨", "😢", "😍", "🎉"],
  smileys: [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊",
    "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚", "😙", "🥲",
    "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
    "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
    "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮",
    "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎",
    "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳",
    "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖",
  ],
  gestures: [
    "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞",
    "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
    "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝",
    "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂",
    "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅",
    "👄",
  ],
  love: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️",
    "😻", "💑", "💏", "👩‍❤️‍💋‍👨", "👨‍❤️‍💋‍👨", "👩‍❤️‍💋‍👩", "💏", "👩‍❤️‍👨", "👨‍❤️‍👨", "👩‍❤️‍👩",
  ],
  objects: [
    "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉", "⚽", "🏀",
    "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓",
    "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳", "🪁", "🛶",
    "🎿", "🥌", "🎯", "🪀", "🪁", "🎮", "🎰", "🧩", "♟️", "🎭",
    "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🪘", "🎷", "🎺",
    "🎸", "🪕", "🎻", "📱", "💻", "🖥️", "🖨️", "⌨️", "🖱️", "💾",
  ],
  nature: [
    "🌸", "💮", "🏵️", "🌹", "🥀", "🌺", "🌻", "🌼", "🌷", "🌱",
    "🪴", "🎋", "🎍", "🌴", "🌵", "🌾", "🌿", "☘️", "🍀", "🍁",
    "🍂", "🍃", "🌈", "☀️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌧️",
    "⛈️", "🌩️", "🌨️", "❄️", "☃️", "⛄", "🌪️", "🌈", "⭐", "🌟",
    "💫", "✨", "🔥", "💥", "☄️", "🌙", "🌛", "🌜", "🌚", "🌝",
  ],
  food: [
    "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈",
    "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦",
    "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔",
    "🍞", "🥐", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇",
    "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓",
    "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕", "🍝",
  ],
  audio: [
    "🎙️", "🎚️", "🎛️", "🎤", "🎧", "🎵", "🎶", "🎼", "🎸", "🎹",
    "🥁", "🪘", "🎷", "🎺", "🎻", "🪕", "🔊", "🔉", "🔈", "🔇",
    "📢", "📣", "🔔", "🔕", "🔊", "🎵", "💿", "📀", "💽", "💾",
  ],
  symbols: [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
    "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "✅", "❎",
    "✔️", "✖️", "❌", "❓", "❔", "❕", "❗", "‼️", "⁉️", "🔴",
    "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔶", "🔷",
    "🔸", "🔹", "💎", "🔅", "🔆", "🏁", "🚩", "🎌", "🏴", "🏳️",
  ],
};

type Category = keyof typeof emojiCategories;

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<Category>("recent");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const categories: { id: Category; icon: string }[] = [
    { id: "recent", icon: "🕐" },
    { id: "smileys", icon: "😀" },
    { id: "gestures", icon: "👋" },
    { id: "love", icon: "❤️" },
    { id: "objects", icon: "🎉" },
    { id: "nature", icon: "🌸" },
    { id: "food", icon: "🍎" },
    { id: "audio", icon: "🎙️" },
    { id: "symbols", icon: "💎" },
  ];

  return (
    <div ref={pickerRef} className={styles.picker}>
      <div className={styles.categories}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.categoryBtn} ${activeCategory === cat.id ? styles.active : ""}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            <span className={styles.categoryIcon}>{cat.icon}</span>
          </button>
        ))}
      </div>
      
      <div className={styles.grid}>
        {emojiCategories[activeCategory].map((emoji, i) => (
          <button
            key={i}
            className={styles.emoji}
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
