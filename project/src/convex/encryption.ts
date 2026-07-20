"use node";

import crypto from "crypto";

const pepper = process.env.ENCRYPTION_PEPPER || "fallback-pepper-static-string-12345";

// Helper to derive a stable 256-bit key from the IP address + server pepper
function getIpKey(ip: string): Buffer {
  return crypto.scryptSync(ip, pepper, 32);
}

// Encrypt string with AES-256-GCM
export function encrypt(text: string, ip: string): string {
  const key = getIpKey(ip);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

// Decrypt string — returns fallback notice if IP doesn't match
export function decrypt(encryptedText: string, ip: string): string {
  try {
    const key = getIpKey(ip);
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(":");
    if (!ivHex || !authTagHex || !encryptedHex) return "[Encrypted - Invalid Payload]";
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return "[Encrypted - Unauthorized IP]";
  }
}

// SHA-256 hash of IP + Pepper for index queries without storing raw IP in index fields
export function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip + pepper).digest("hex");
}
