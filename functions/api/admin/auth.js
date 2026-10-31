const encoder = new TextEncoder();
const SESSION_COOKIE = 'bm_admin';
const SESSION_SECONDS = 8 * 60 * 60;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid authenticator secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const output = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) output.push(parseInt(bits.slice(offset, offset + 8), 2));
  return new Uint8Array(output);
}

async function hmac(hash, secret, message) {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
}

function safeEqual(left, right) {
  const a = String(left); const b = String(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function totp(secret, timestamp) {
  let counter = BigInt(Math.floor(timestamp / 1000 / 30));
  const message = new Uint8Array(8);
  for (let index = 7; index >= 0; index -= 1) { message[index] = Number(counter & 255n); counter >>= 8n; }
  const digest = await hmac('SHA-1', base32Decode(secret), message);
  const offset = digest[digest.length - 1] & 15;
  const value = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1000000).padStart(6, '0');
}

async function verifyTotp(secret, code) {
  const now = Date.now();
  for (const window of [-1, 0, 1]) if (safeEqual(await totp(secret, now + window * 30000), code)) return true;
  return false;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signSession(secret, payload) {
  return base64Url(await hmac('SHA-256', encoder.encode(secret), encoder.encode(payload)));
}

async function createSession(secret) {
  const payload = `v1.${Math.floor(Date.now() / 1000) + SESSION_SECONDS}`;
  return `${payload}.${await signSession(secret, payload)}`;
}

async function validSession(secret, token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(parts[2], await signSession(secret, `${parts[0]}.${parts[1]}`));
}

function getCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequest({ request, env }) {
  if (!env.ADMIN_TOTP_SECRET || !env.ADMIN_SESSION_SECRET) return json({ error: 'Developer authentication is not configured.' }, 503);
  if (!sameOrigin(request)) return json({ error: 'Request origin was not accepted.' }, 403);

  if (request.method === 'GET') {
    return json({ authenticated: await validSession(env.ADMIN_SESSION_SECRET, getCookie(request, SESSION_COOKIE)) });
  }

  if (request.method === 'DELETE') {
    return json({ authenticated: false }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (error) { return json({ error: 'Enter a valid six-digit code.' }, 400); }
    const code = String(body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) return json({ error: 'Enter a valid six-digit code.' }, 400);
    if (!await verifyTotp(env.ADMIN_TOTP_SECRET, code)) return json({ error: 'That code was not accepted. Check the time on your device and try again.' }, 401);
    const token = await createSession(env.ADMIN_SESSION_SECRET);
    return json({ authenticated: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}` });
  }

  return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST, DELETE' });
}
