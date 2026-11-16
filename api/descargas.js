// Descargas de cada app, sumando todos los archivos de todos sus releases en GitHub.
// Vercel guarda la respuesta 15 min en su caché; si GitHub falla, se usa el último valor guardado en Redis.
const REPOS = {
  voxia: 'voxia',
  tempia: 'tempia',
  audio: 'convertidor-audio-pro',
  img: 'convertidor-imagenes',
  fotos: 'organizador-fotos'
};

async function redis(cmds) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds)
    });
    return await r.json();
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  const headers = { 'User-Agent': 'boldo3108.cl', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;

  const out = {};
  await Promise.all(Object.entries(REPOS).map(async ([id, repo]) => {
    try {
      const r = await fetch('https://api.github.com/repos/boldo3108/' + repo + '/releases?per_page=100', { headers });
      if (!r.ok) return;
      const rel = await r.json();
      out[id] = rel.reduce((s, x) => s + (x.assets || []).reduce((t, a) => t + (a.download_count || 0), 0), 0);
    } catch (e) {}
  }));

  // Guardar lo que llegó y rellenar lo que faltó con el último valor conocido
  const ids = Object.keys(REPOS);
  const ok = ids.filter(id => id in out);
  const cmds = [];
  if (ok.length) cmds.push(['HSET', 'descargas', ...ok.flatMap(id => [id, String(out[id])])]);
  cmds.push(['HGETALL', 'descargas']);
  const saved = await redis(cmds);
  const flat = saved && saved[saved.length - 1] && saved[saved.length - 1].result || [];
  for (let i = 0; i < flat.length; i += 2) if (!(flat[i] in out)) out[flat[i]] = Number(flat[i + 1]);

  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  res.status(200).json(out);
};
