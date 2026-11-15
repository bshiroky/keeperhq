// Yahoo import — league list and the per-league import bundle. See server/yahoo.js.
import { createDataHandler } from '../../server/yahoo.js';
import { verifyUser } from '../../server/verifyUser.js';

export const config = { maxDuration: 60 };

export default createDataHandler({ verifyUser });
