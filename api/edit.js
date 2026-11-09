/* POST /api/edit { roomId, userId, userName, sectionId, paras, rev, lang } → { ok, changeId } | 409 { error: 'stale' | 'frozen' } */
import { handler } from './_lib.js';
import { runEdit } from './_edit.js';

export default handler((body) => runEdit(body));
