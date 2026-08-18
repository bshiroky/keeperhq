// Bundle entry for the shared-page tests (npm run test:shared). The page's
// row derivation and rail rules are pure, but they sit behind imports that
// need a bundler (JSX, import.meta.env), so esbuild flattens them for node.
export {
  buildSharedRows, sortRowsDefault, sharedFilterChips, costColumnLabel, OWNER_COLUMN_LABEL,
} from '../src/lib/sharedLeague.js';
