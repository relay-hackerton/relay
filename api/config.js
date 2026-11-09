/* GET /api/config → a script that sets window.RELAY_CONFIG with the public Supabase URL and anon key. */
export default function config(req, res) {
  const cfg = { supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`window.RELAY_CONFIG = ${JSON.stringify(cfg)};`);
}
