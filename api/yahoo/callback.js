// Yahoo discovery spike — OAuth callback + the dump. Throwaway; see
// server/yahooSpike.js for what it does and how to remove it.
import { createCallbackHandler } from '../../server/yahooSpike.js';

export const config = { maxDuration: 60 };

export default createCallbackHandler({});
