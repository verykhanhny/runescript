// Assembles the static site for the Cloudflare Worker (static assets) into dist/: web/* at the root plus scripts/
// (the browser imports /scripts/index.js). Node-only files are left out.
import { cp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist`;
await rm(dist, { recursive: true, force: true });
await cp(`${root}web`, dist, { recursive: true });
await cp(`${root}scripts`, `${dist}/scripts`, {
  recursive: true,
  filter: (src) => !/[\\/](cli\.js|ge-cache\.js|build\.js)$/.test(src),
});
console.log("Built dist/");
