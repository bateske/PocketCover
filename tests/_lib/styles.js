// Optional style filter for heavy per-style test loops (test-only helper; the
// cover runtime never reads the environment). Example, in Git Bash:
//   POCKET_STYLES=plants,islands node --test
// Unset or blank means every style, so a default run is unchanged. Not yet
// applied to any existing assertion.
const raw=globalThis.process?.env?.POCKET_STYLES;

/** Requested style ids as a frozen array, or null when the variable is unset. */
export const POCKET_STYLES=typeof raw==='string'&&raw.trim()
  ?Object.freeze(raw.split(',').map(s=>s.trim()).filter(Boolean)):null;

/** Keep style ids or `{id}` records named by POCKET_STYLES. Returns the same
 * array when the variable is unset. */
export function filterStyles(styles) {
  if(!POCKET_STYLES)return styles;
  return styles.filter(style=>POCKET_STYLES.includes(typeof style==='string'?style:style?.id));
}
