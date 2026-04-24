/**
 * Generate a readable 16-char password. Omits the visually-confusable
 * letters (I, l, 1, O, 0) to keep it dictation-friendly when a pro
 * generates one and reads it over the phone. Mixes upper + lower +
 * digits + a small set of symbols that don't trip on corporate
 * password-policy blocklists.
 */
export function generatePassword(): string {
  const chars =
    "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  let pw = "";
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) pw += chars[arr[i] % chars.length];
  return pw;
}
