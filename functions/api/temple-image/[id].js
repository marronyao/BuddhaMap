export async function onRequestGet({ params, env }) {
  if (!env.BUDDHAMAP_DATA) return new Response('Shared storage is not configured.', { status: 503 });
  const result = await env.BUDDHAMAP_DATA.getWithMetadata(`image:${params.id}`, 'arrayBuffer');
  if (!result.value) return new Response('Image not found.', { status: 404 });
  return new Response(result.value, {
    headers: {
      'content-type': result.metadata?.contentType || 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
