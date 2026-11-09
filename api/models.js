/* GET /api/models → { models: [{ id, label, provider }], default } — only providers whose key is configured */
import { catalog, pickModel } from './_models.js';

export default function models(req, res) {
  const list = catalog(); const def = pickModel();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ models: list, default: def ? def.id : null }));
}
