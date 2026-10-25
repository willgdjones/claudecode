// tests/helpers/sf-env.mjs — lets the browser modules that load data/ (js/sf-data.js) run under Node: fetch() of
// file: URLs from the local data/ folder. Import this before any module that imports js/sf-data.js.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = typeof url === 'string' ? new URL(url) : url;
  if (u.protocol !== 'file:') return realFetch(url, opts);
  const bytes = fs.readFileSync(fileURLToPath(u));
  return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
};
