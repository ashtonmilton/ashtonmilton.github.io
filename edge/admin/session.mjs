const cookieName = "__Host-ashton_admin";
const lifetime = 8 * 60 * 60;
const encoder = new TextEncoder();
const format = /^[a-f0-9]{64}$/;
const encode = (bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const decode = (text) => Uint8Array.from(text.match(/../g), (byte) => parseInt(byte, 16));

export function localLoginReady(env) {
  return format.test(env.ADMIN_LOGIN_KEY || "") && typeof env.ADMIN_LOGIN_LIMIT?.limit === "function";
}

function importKey(secret) {
  return crypto.subtle.importKey("raw", decode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign", "verify"]);
}

export async function matchesPassword(password, secret) {
  if (!format.test(password)) return false;
  const challenge = encoder.encode("ashton-admin:password-v1");
  const expected = await crypto.subtle.sign("HMAC", await importKey(secret), challenge);
  return crypto.subtle.verify("HMAC", await importKey(password), expected, challenge);
}

export async function startSession(secret, now = Date.now()) {
  const value = `${Math.floor(now / 1000) + lifetime}.${encode(crypto.getRandomValues(new Uint8Array(16)))}`;
  const sig = encode(await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(`ashton-admin:session-v1:${value}`)));
  return cookie(`${value}.${sig}`, lifetime);
}

function cookie(value, maxAge) {
  return `${cookieName}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

export const endSession = () => cookie("", 0);

export async function validSession(request, secret, now = Date.now()) {
  const raw = request.headers.get("Cookie") || "";
  const token = raw.split(/;\s*/).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const parts = /^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token || "");
  if (!parts || Number(parts[1]) <= Math.floor(now / 1000)) return false;
  return crypto.subtle.verify("HMAC", await importKey(secret), decode(parts[3]),
    encoder.encode(`ashton-admin:session-v1:${parts[1]}.${parts[2]}`));
}

export async function loginInput(request) {
  if (!(request.headers.get("Content-Type") || "").startsWith("application/x-www-form-urlencoded") || !request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let input = "";
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 512) { await reader.cancel(); return ""; }
    input += decoder.decode(value, {stream: true});
  }
  return new URLSearchParams(input + decoder.decode()).get("password") || "";
}
