// Contador público de visitas para boldo3108.cl
// POST = suma una visita (y su país), GET = solo lee. Guarda en Upstash Redis (Vercel Marketplace).
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'Falta conectar la base de datos' });

  const raw = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) ? raw : 'XX';

  const cmds = [];
  if (req.method === 'POST') cmds.push(['INCR', 'visitas:total'], ['HINCRBY', 'visitas:paises', country, 1]);
  cmds.push(['GET', 'visitas:total'], ['HGETALL', 'visitas:paises']);

  try {
    const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds)
    });
    const out = await r.json();
    const total = Number(out[out.length - 2].result || 0);
    const flat = out[out.length - 1].result || [];
    const paises = [];
    for (let i = 0; i < flat.length; i += 2) if (flat[i] !== 'XX') paises.push({ c: flat[i], n: Number(flat[i + 1]) });
    paises.sort((a, b) => b.n - a.n);
    res.status(200).json({ total, paises: paises.slice(0, 5), totalPaises: paises.length });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo leer el contador' });
  }
};
