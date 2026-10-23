/* dsh-deepseek-balance — host half.
 *
 * The chip, its hover card, and every platform request live in the browser
 * half (client.js). This host half is a deliberate no-op: it exists so the
 * loader mounts a fiber for the package, which is what lets the client bundle
 * reach window.__DSH_BOOT__ and register into the composer.
 */

/** Stable Cordis plugin name; matches cordis.patch.yml's roster id. */
const name = "dsh-deepseek-balance";

/** No host-side services or registries are required. */
function apply() {}

export { apply, name };
