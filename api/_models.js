/* Which models the agent can use. A provider shows up only when its key is set.
   Override the lists with OPENAI_MODELS / ANTHROPIC_MODELS ("id:Label,id:Label"), the default with DEFAULT_MODEL. */
const DEFAULTS = {
  openai: 'gpt-6-luna:GPT-6 Luna,gpt-6-astra:GPT-6 Astra,gpt-5.3-codex:Codex (GPT-5.3)',
  anthropic: 'claude-sonnet-5-5:Claude Sonnet 5.5,claude-haiku-5-5:Claude Haiku 5.5',
};
const parse = (s, provider) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
  .map((x) => { const [id, ...rest] = x.split(':'); return { id: id.trim(), label: (rest.join(':') || id).trim(), provider }; });

export function catalog() {
  if (globalThis.__RELAY_FAKE_CLAUDE) return [{ id: 'mock-fast', label: 'Mock · fast', provider: 'mock' }, { id: 'mock-smart', label: 'Mock · smart', provider: 'mock' }];
  const out = [];
  const add = (provider, key, list) => { if (process.env[key]) out.push(...parse(process.env[list] || DEFAULTS[provider], provider)); };
  const first = (process.env.LLM_PROVIDER || '').toLowerCase();
  const order = first === 'anthropic' ? ['anthropic', 'openai'] : first === 'openai' ? ['openai', 'anthropic'] : ['anthropic', 'openai'];
  order.forEach((p) => add(p, p === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY', p === 'openai' ? 'OPENAI_MODELS' : 'ANTHROPIC_MODELS'));
  return out;
}

/* the requested model if it is available, else DEFAULT_MODEL, else the first available */
export function pickModel(id) {
  const c = catalog();
  return c.find((m) => m.id === id) || c.find((m) => m.id === process.env.DEFAULT_MODEL) || c[0] || null;
}
