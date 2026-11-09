/* POST /api/profile { name, userId? } → { ok, userId, name, avatar } | 409 { error: 'taken' } | 400 { error: 'length' }
   POST /api/profile { userId } → the stored profile, 404 when unknown */
import { handler } from './_lib.js';
import { runProfile } from './_profile.js';

export default handler((body) => runProfile(body));
