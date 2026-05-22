const CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // sem caracteres confusos (0/O, 1/l/I)

export function generateShortCode(length = 6) {
  return Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}
