/* POST /api/agent { roomId, userId, userName, text, lang } → { ok } | { queued } | { error } */
import { handler } from './_lib.js';
import { runAgent } from './_agent.js';

export default handler((body) => runAgent(body));
