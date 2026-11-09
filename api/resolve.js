/* POST /api/resolve { roomId, discussionId, optionId?, userId?, userName?, lang? } → { ok } | { queued } | { error }
   Without optionId the most-voted option wins; a tie returns 409 { error: 'tie' }. */
import { handler } from './_lib.js';
import { runResolve } from './_resolve.js';

export default handler((body) => runResolve(body));
