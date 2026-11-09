/* POST /api/discuss { roomId, userId, userName, sectionId|null, title, question, options:[{label, desc?, text?}], lang } → { ok, id, n } */
import { handler } from './_lib.js';
import { runDiscuss } from './_discuss.js';

export default handler((body) => runDiscuss(body));
