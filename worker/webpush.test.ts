import { describe, expect, it } from "vitest";
import { b64url, encryptPayload, generateVapidKeys, vapidAuth } from "./webpush";

/** Imports a P-256 key pair for ECDH from a raw private scalar and raw public point. */
async function ecdhPair(d: string, pub: string): Promise<CryptoKeyPair> {
  const p = b64url.decode(pub);
  const x = b64url.encode(p.slice(1, 33));
  const y = b64url.encode(p.slice(33, 65));
  const privateKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d, x, y, ext: true }, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = await crypto.subtle.importKey("raw", p, { name: "ECDH", namedCurve: "P-256" }, true, []);
  return { privateKey, publicKey };
}

describe("encryptPayload (RFC 8291 Appendix A)", () => {
  it("reproduces the RFC's example message byte for byte", async () => {
    const sender = await ecdhPair("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    const body = await encryptPayload(
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      new TextEncoder().encode("When I grow up, I want to be a watermelon"),
      { senderKeys: sender, salt: b64url.decode("DGv6ra1nlYgDCS1FRnbzlw") },
    );
    expect(b64url.encode(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });
});

describe("vapidAuth", () => {
  it("signs an ES256 JWT for the push service origin", async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuth("https://fcm.googleapis.com/fcm/send/abc", keys, "https://med-vault.example", 1_700_000_000_000);
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m).toBeTruthy();
    const claims = JSON.parse(new TextDecoder().decode(b64url.decode(m[2])));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 12 * 3600, sub: "https://med-vault.example" });
    expect(m[4]).toBe(keys.publicKey);
    // The signature verifies with the public key the browser subscribed with.
    const pub = await crypto.subtle.importKey("raw", b64url.decode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64url.decode(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });
});
