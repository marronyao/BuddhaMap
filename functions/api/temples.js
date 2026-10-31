const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function getCookie(request, name) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function validSession(secret, token) {
  if (!secret || !token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || Number(parts[1]) <= Math.floor(Date.now() / 1000)) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${parts[0]}.${parts[1]}`))));
  if (signature.length !== parts[2].length) return false;
  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) difference |= signature.charCodeAt(index) ^ parts[2].charCodeAt(index);
  return difference === 0;
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequest({ request, env }) {
  if (!env.BUDDHAMAP_DATA) return json({ error: 'Shared storage is not configured.' }, 503);
  if (request.method === 'GET') return json({ temples: await env.BUDDHAMAP_DATA.get('temples', 'json') });
  if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(request)) return json({ error: 'Request origin was not accepted.' }, 403);
  if (!await validSession(env.ADMIN_SESSION_SECRET, getCookie(request, 'bm_admin'))) return json({ error: 'Developer authentication required.' }, 401);

  let body;
  try { body = await request.json(); } catch (error) { return json({ error: 'Invalid temple data.' }, 400); }
  if (!Array.isArray(body?.temples) || body.temples.length > 1000) return json({ error: 'Invalid temple list.' }, 400);

  const temples = [];
  for (const rawTemple of body.temples) {
    const temple = { ...rawTemple };
    if (!/^[a-z0-9-]{1,100}$/.test(String(temple.id || ''))) return json({ error: 'Invalid temple ID.' }, 400);
    if (typeof temple.image === 'string' && temple.image.startsWith('data:image/')) {
      const match = temple.image.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) return json({ error: `Invalid image for ${temple.name || temple.id}.` }, 400);
      const binary = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
      if (binary.byteLength > 5 * 1024 * 1024) return json({ error: `Image for ${temple.name || temple.id} is too large.` }, 413);
      await env.BUDDHAMAP_DATA.put(`image:${temple.id}`, binary.buffer, { metadata: { contentType: match[1] } });
      temple.image = `/api/temple-image/${encodeURIComponent(temple.id)}?v=${Date.now()}`;
    }
    temples.push(temple);
  }
  await env.BUDDHAMAP_DATA.put('temples', JSON.stringify(temples));
  return json({ temples });
}
