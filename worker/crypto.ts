export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 256-bit random token, base64url. Used for device cookies. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Crockford-style alphabet: no 0/O, 1/I/L, U, so codes survive being read aloud or retyped.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Random code of `length` chars (each ~4.9 bits). */
export function randomCode(length: number): string {
  const out: string[] = [];
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 240) out.push(ALPHABET[b % 30]); // rejection sampling keeps it unbiased
  }
  while (out.length < length) out.push(ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % 30]);
  return out.join("");
}

/** Uppercases and strips spaces/dashes so users can type codes loosely. */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** 20 chars ≈ 98 bits, shown as XXXX-XXXX-XXXX-XXXX-XXXX. */
export function recoveryKey(): string {
  return randomCode(20).match(/.{4}/g)!.join("-");
}
