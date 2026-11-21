// TEMP (Chunk 2 check): redirect server/config/database.js (connects to MySQL on import) to a fake pool.
const FAKE = new URL('./tmp_chunk2_fakeDatabase.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.endsWith('/server/config/database.js')) {
    return { ...result, url: FAKE, shortCircuit: true };
  }
  return result;
}
