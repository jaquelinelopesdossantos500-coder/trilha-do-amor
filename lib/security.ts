import type { AppEnv } from "./configuration";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), x => x.toString(16).padStart(2, "0")).join("");
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export async function hash(value: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
export function cookie(request: Request, name: string) {
  const raw = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="))?.slice(name.length + 1);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}
export function makeCookie(request: Request, name: string, value: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Reabra a página para continuar com segurança.");
}
export async function readBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) throw new ApiError(413, "O arquivo ultrapassa o limite permitido.");
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new ApiError(413, "O arquivo ultrapassa o limite permitido."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export async function readJSON(request: Request, max = 8192): Promise<Record<string, unknown>> {
  try { const value = JSON.parse(new TextDecoder().decode(await readBytes(request, max)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value;
  } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, "Dados inválidos. Confira os campos e tente novamente."); }
}
export async function owner(request: Request, env: AppEnv) {
  const token = cookie(request, "tda_session"); if (!token || !env.SESSION_SECRET) throw new ApiError(401, "Sua sessão expirou. Reabra o pedido neste navegador.");
  const tokenHash = await hash(env.SESSION_SECRET + ":" + token);
  const session = await env.DB!.prepare("SELECT token_hash FROM customer_sessions WHERE token_hash = ? AND expires_at > ?").bind(tokenHash,new Date().toISOString()).first();
  if (!session) throw new ApiError(401, "Sua sessão expirou. Reabra a página para continuar.");
  return tokenHash;
}
export async function requireAdmin(request: Request, env: AppEnv) {
  const token = cookie(request, "tda_admin"); if (!token) throw new ApiError(401, "Entre na área administrativa.");
  const session = await env.DB!.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?").bind(await hash(token), new Date().toISOString()).first();
  if (!session) throw new ApiError(401, "Sua sessão administrativa expirou.");
}
export async function rateLimit(request: Request, env: AppEnv, action: string, limit: number, seconds: number) {
  if (!env.SESSION_SECRET) throw new ApiError(503, "O atendimento está sendo configurado. Tente novamente mais tarde.");
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const now = Math.floor(Date.now() / 1000), window = Math.floor(now / seconds);
  const key = await hash(env.SESSION_SECRET + ":" + action + ":" + ip + ":" + window);
  const row = await env.DB!.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count").bind(key, (window + 1) * seconds).first<{ count: number }>();
  if (!row || row.count > limit) throw new ApiError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
}
export async function verifyPassword(password: string, stored: string | undefined) {
  if (!stored || password.length > 256) return false;
  const [scheme, rounds, salt, expected] = stored.split(":");
  if (scheme !== "pbkdf2" || !/^\d+$/.test(rounds) || Number(rounds) < 100000 || Number(rounds) > 1000000 || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: Number(rounds) }, key, 256));
  let delta = 0; for (let i = 0; i < expected.length; i++) delta |= derived.charCodeAt(i) ^ expected.charCodeAt(i);
  return delta === 0;
}
export function secureResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store"); headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer"); headers.set("X-Frame-Options", "DENY");
  return new Response(response.body, { status: response.status, headers });
}
