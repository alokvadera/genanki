import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    try {
      await axios.post(
        "https://email.vly.ai/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a vly.ai application",
        },
        {
          headers: {
            "x-api-key": process.env.VLY_EMAIL_API_KEY ?? "",
          },
        },
      );
    } catch (error) {
      // Log diagnostics server-side only — never leak upstream details to the client
      if (error && typeof error === "object" && "isAxiosError" in error) {
        const axiosErr = error as { response?: { status?: number }; message?: string };
        console.error("otp send failed", {
          status: axiosErr.response?.status,
          message: axiosErr.message,
        });
      } else {
        console.error("otp send failed", error);
      }
      throw new Error("Could not send the verification code. Please try again or contact support.");
    }
  },
});
