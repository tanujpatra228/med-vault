import { Hono, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./env";
import { HttpError, readJson } from "./http";

const COOKIE = "mv_session";
const SESSION_DAYS = 365;
const MAX_FAILS = 10;
const FAIL_WINDOW_MIN = 15;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Compares digests so timing does not leak the password length or prefix.
async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isSecure = (url: string) => new URL(url).protocol === "https:";

export const auth = new Hono<AppEnv>();

auth.get("/me", async (c) => {
  const token = getCookie(c, COOKIE);
  return c.json({ authenticated: token ? await sessionValid(c.env.DB, token) : false });
});

auth.post("/login", async (c) => {
  const expected = c.env.APP_PASSWORD;
  if (!expected) throw new HttpError(500, "APP_PASSWORD is not configured on the server");

  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000).toISOString();
  const fails = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND attempted_at > ?")
    .bind(ip, since)
    .first<number>("n");
  if ((fails ?? 0) >= MAX_FAILS) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");

  const body = await readJson(c);
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await passwordMatches(password, expected))) {
    await c.env.DB.prepare("INSERT INTO login_attempts (ip) VALUES (?)").bind(ip).run();
    throw new HttpError(401, "Wrong password");
  }

  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO sessions (token_hash, expires_at, user_agent) VALUES (?, ?, ?)").bind(
      await sha256Hex(token),
      expires.toISOString(),
      (c.req.header("user-agent") ?? "").slice(0, 200),
    ),
    c.env.DB.prepare("DELETE FROM login_attempts WHERE ip = ? OR attempted_at < ?").bind(ip, since),
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()),
  ]);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c.req.url),
    sameSite: "Lax",
    path: "/",
    expires,
  });
  return c.json({ ok: true });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE, { path: "/" });
  return c.json({ ok: true });
});

async function sessionValid(db: D1Database, token: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await sha256Hex(token), new Date().toISOString())
    .first("ok");
  return row === 1;
}

export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token || !(await sessionValid(c.env.DB, token))) throw new HttpError(401, "Please log in");
  await next();
};
