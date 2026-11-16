// Puente de inicio de sesión de Kick para Stremia.
// Kick pide el Client Secret al cambiar el código de inicio de sesión por la sesión (y al renovarla).
// El secreto no puede ir dentro de Stremia.exe, así que vive aquí, en las variables de Vercel:
//   KICK_CLIENT_ID      el Client ID de la app «Stremia» en kick.com/settings/developer
//   KICK_CLIENT_SECRET  su Client Secret
// Este puente no guarda nada: recibe el pedido de Stremia, le agrega el secreto, lo manda a Kick y devuelve la respuesta.
const KICK_TOKEN = 'https://id.kick.com/oauth/token';
const REDIRECT_OK = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/kick\/callback$/;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

  const id = process.env.KICK_CLIENT_ID;
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) return res.status(503).json({ error: 'El puente de Kick aún no está configurado' });

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }

  // solo los dos pedidos que usa Stremia, solo para su propia app y su dirección local
  const form = new URLSearchParams({ client_id: id, client_secret: secret });
  if (String(b.client_id || '') !== id) return res.status(400).json({ error: 'App de Kick incorrecta' });
  if (b.grant_type === 'authorization_code') {
    if (!b.code || !b.code_verifier || !REDIRECT_OK.test(String(b.redirect_uri || ''))) {
      return res.status(400).json({ error: 'Pedido incompleto' });
    }
    form.set('grant_type', 'authorization_code');
    form.set('code', String(b.code));
    form.set('code_verifier', String(b.code_verifier));
    form.set('redirect_uri', String(b.redirect_uri));
  } else if (b.grant_type === 'refresh_token' && b.refresh_token) {
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', String(b.refresh_token));
  } else {
    return res.status(400).json({ error: 'Pedido no permitido' });
  }

  try {
    const r = await fetch(KICK_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString()
    });
    const texto = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json');
    return res.send(texto);
  } catch (e) {
    return res.status(502).json({ error: 'Kick no respondió' });
  }
};
