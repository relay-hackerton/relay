import { withProfile } from './_session.js';
import { runDiscuss } from './_discuss.js';

export default withProfile(runDiscuss);
