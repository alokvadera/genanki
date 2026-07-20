import { describe, it, expect } from "vitest";
import { hashIp, encrypt, decrypt } from "./encryption";

describe("Zero-Knowledge Encryption Module", () => {
  const testIp = "192.168.1.100";
  const testPayload = JSON.stringify({
    deckName: "Test Biology Deck",
    cards: [
      { front: "What is mitochondria?", back: "Powerhouse of the cell" },
      { front: "What is photosynthesis?", back: "Process converting light to energy" },
    ],
  });

  describe("hashIp", () => {
    it("hashes IP address deterministically", () => {
      const hash1 = hashIp(testIp);
      const hash2 = hashIp(testIp);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // 64-char SHA256 hex string
    });

    it("generates different hashes for different IPs", () => {
      const hash1 = hashIp("192.168.1.100");
      const hash2 = hashIp("192.168.1.101");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("encrypt & decrypt", () => {
    it("successfully encrypts and decrypts deck payloads", () => {
      const encrypted = encrypt(testPayload, testIp);
      expect(encrypted).not.toBe(testPayload);
      expect(typeof encrypted).toBe("string");

      const decrypted = decrypt(encrypted, testIp);
      expect(decrypted).toBe(testPayload);
      
      const parsed = JSON.parse(decrypted);
      expect(parsed.deckName).toBe("Test Biology Deck");
      expect(parsed.cards).toHaveLength(2);
    });

    it("returns unauthorized fallback notice if wrong IP address is used", () => {
      const encrypted = encrypt(testPayload, testIp);
      const decrypted = decrypt(encrypted, "192.168.1.101");
      expect(decrypted).toBe("[Encrypted - Unauthorized IP]");
    });

    it("returns invalid fallback notice for non-encrypted strings", () => {
      const decrypted = decrypt("plain-text", testIp);
      expect(decrypted).toBe("[Encrypted - Invalid Payload]");
    });
  });
});
