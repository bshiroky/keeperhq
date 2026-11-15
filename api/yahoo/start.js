// Yahoo import — start of the sign-in (and DELETE to disconnect). See server/yahoo.js.
import { createStartHandler } from '../../server/yahoo.js';
import { verifyUser } from '../../server/verifyUser.js';

export default createStartHandler({ verifyUser });
