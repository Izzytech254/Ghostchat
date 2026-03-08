// Telegram-style paper plane icon (filled, modern)
export default function PaperPlaneIcon({
  size = 22,
  color = "#fff",
  className = "",
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block" }}
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill={color} />
    </svg>
  );
}
