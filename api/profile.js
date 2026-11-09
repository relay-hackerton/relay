import { handler } from './_lib.js';
import { runProfile } from './_profile.js';
import { sessionRequired, sessionUser, setSession } from './_session.js';

export default handler(async ({ name }, req, res) => {
  const userId = sessionUser(req);
  if (!name && !userId) return sessionRequired;
  const result = await runProfile(userId ? { userId } : { name });
  if (result.ok) setSession(req, res, result.userId);
  return result;
});
