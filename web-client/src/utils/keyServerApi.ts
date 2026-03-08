/**
 * keyServerApi.ts – API client for the key distribution server
 */

// Use empty string to route through Vite proxy (same origin)
const KEY_SERVER_URL = import.meta.env.VITE_KEY_SERVER_URL || "";

export interface KeyBundle {
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_id: number;
  signature: string;
  one_time_pre_key?: string | null;
}

export interface RegisterKeysPayload {
  user_id: string;
  username: string;
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_id: number;
  signature: string;
  one_time_pre_keys: string[];
}

/** Extract a readable message from a FastAPI error response body. */
function extractDetail(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const detail = (err as Record<string, unknown>).detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: array of { loc, msg, type }
  if (Array.isArray(detail)) {
    return (
      detail
        .map((d) =>
          typeof d === "object" && d !== null
            ? (d as Record<string, unknown>).msg
            : String(d),
        )
        .filter(Boolean)
        .join("; ") || fallback
    );
  }
  return String(detail) || fallback;
}

/**
 * Register keys with the key server
 */
export async function registerKeys(
  payload: RegisterKeysPayload,
): Promise<void> {
  const res = await fetch(`${KEY_SERVER_URL}/keys/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(extractDetail(err, `Registration failed: ${res.status}`));
  }
}

/**
 * Look up a user by username to get their user_id
 */
export async function lookupUser(
  username: string,
): Promise<{ user_id: string; username: string } | null> {
  const res = await fetch(
    `${KEY_SERVER_URL}/keys/lookup/${encodeURIComponent(username.toLowerCase())}`,
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Lookup failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch a user's key bundle for X3DH
 */
export async function fetchKeyBundle(userId: string): Promise<KeyBundle> {
  const res = await fetch(
    `${KEY_SERVER_URL}/keys/${encodeURIComponent(userId)}`,
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(extractDetail(err, `Failed to fetch keys: ${res.status}`));
  }

  return res.json();
}
