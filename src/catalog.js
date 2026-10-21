const cache = new Map();
export async function loadJSON(name) {
  if (!cache.has(name)) cache.set(name, (async () => {
    if (typeof DecompressionStream !== 'undefined') {
      const response=await fetch(new URL('../data/'+name+'.json.gz',import.meta.url));
      if (!response.ok) throw new Error('Katalogdatei konnte nicht geladen werden: '+response.status);
      return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();
    }
    const response=await fetch(new URL('../data/'+name+'.json',import.meta.url));
    if(!response.ok)throw new Error('Katalogdatei konnte nicht geladen werden: '+response.status);
    return response.json();
  })().catch(e=>{cache.delete(name);throw e;}));
  return cache.get(name);
}
export async function loadCatalog() {
  const c=await loadJSON('catalog');
  if(c.schema!==1 || c.snapshot!=='2026-10-01' || c.packages.length!==10352 || c.products.length!==6749)throw new Error('Katalogprüfung fehlgeschlagen.');
  return c;
}
