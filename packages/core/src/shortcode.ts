import { randomInt } from "node:crypto";

// Unambiguous base62-ish alphabet (no 0/O/1/l/I to keep codes readable).
const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DEFAULT_LENGTH = 7;

/** Generate a random short code (e.g. "x7Kp2qm"). */
export function generateShortCode(length = DEFAULT_LENGTH): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Validate a short code's shape before hitting the database. */
export function isValidShortCode(code: string): boolean {
  if (code.length < 4 || code.length > 16) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
