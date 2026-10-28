export const STORAGE_KEY = 'sl.workspace.v1';
export const SNAPSHOT = '2026-10-01';
export const MAX_LINES = 5000;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const keys = (v, expected) => object(v) && Object.keys(v).every(k => expected.includes(k)) && expected.every(k => Object.hasOwn(v, k));
const string = (v, max) => typeof v === 'string' && v.length <= max;
export function emptyWorkspace() { return {schema: 1, snapshot: SNAPSHOT, lines: [], favorites: [], note: ''}; }
const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function validateWorkspace(v) {
  if (!keys(v, ['schema','snapshot','lines','favorites','note']) || v.schema !== 1 || !validDate(v.snapshot) || !string(v.note, 10000) || !Array.isArray(v.lines) || v.lines.length > MAX_LINES || !Array.isArray(v.favorites) || v.favorites.length > MAX_LINES) throw new Error('Ungültiges Sammlungsformat.');
  const ids = new Set();
  for (const l of v.lines) {
    if (!keys(l,['id','quantity','label','note']) || !string(l.id,200) || !l.id.trim() || ids.has(l.id) || !Number.isSafeInteger(l.quantity) || l.quantity < 1 || l.quantity > 9999 || !string(l.label,1000) || !string(l.note,10000)) throw new Error('Ungültige oder doppelte Sammlungsposition.');
    ids.add(l.id);
  }
  const fav = new Set();
  for (const id of v.favorites) {
    if (!string(id,200) || !id.trim() || fav.has(id)) throw new Error('Ungültige oder doppelte Favoriten.');
    fav.add(id);
  }
  if(new TextEncoder().encode(JSON.stringify(v)).length>5000000)throw new Error('Sammlung überschreitet die Sicherungsgrenze von 5 MB.');
  return structuredClone(v);
}
export function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
}
export const collator = new Intl.Collator('de-CH', {numeric:true,sensitivity:'base'});
export function createIndex(catalog) {
  const products = new Map(catalog.products.map(p => [p.id,p]));
  const packages = new Map(catalog.packages.map(p => [p.id,p]));
  const search = new Map(catalog.packages.map(p => [p.id, normalize([p.brand,p.form,p.size,p.ingredients,p.atc,p.gtin,p.previousGtin,p.swissmedic,p.pharmacode,p.manufacturer,p.id,products.get(p.productId)?.name].join(' '))]));
  const orders={name:catalog.packages};
  for(const kind of ['retail','factory'])orders[kind]=[...catalog.packages].sort((a,b)=>(a[kind]??Infinity)-(b[kind]??Infinity)||collator.compare(search.get(a.id),search.get(b.id)));
  return {catalog, products, packages, search, orders};
}
export function searchPackages(index, filters = {}, favorites = []) {
  const tokens = normalize(filters.query).split(' ').filter(Boolean), favs = new Set(favorites);
  const source = index.orders[filters.sort] || index.orders.name;
  return source.filter(p => tokens.every(t => index.search.get(p.id).includes(t)) && (!filters.list || p.list === filters.list) && (!filters.atc || p.atc.startsWith(filters.atc)) && (!filters.manufacturer || p.manufacturer === filters.manufacturer) && (!filters.type || (p.characteristic || '').split(/,\s*/).includes(filters.type)) && (!filters.scope || (filters.scope === 'favorites' ? favs.has(p.id) : filters.scope === 'limitations' ? p.limitations.length > 0 : p.retail === null || p.factory === null)));
}
export const packageName = p => [p.brand,p.form,p.size].filter(Boolean).join(' · ');
const integerFormat = new Intl.NumberFormat('de-CH', {maximumFractionDigits:0});
export function money(cents) {
  if(cents===null || cents===undefined)return 'Nicht verfügbar';
  if(typeof cents!=='bigint' && !Number.isSafeInteger(cents))throw new Error('Ungültiger Rappenbetrag.');
  const value=BigInt(cents), absolute=value<0n?-value:value;
  return (value<0n?'-':'')+'CHF '+integerFormat.format(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');
}
export function calculate(workspace, packages) {
  const rows = workspace.lines.map(line => {
    const p = packages.get(line.id);
    return {...line, package:p ?? null, retail:p?.retail == null ? null : BigInt(p.retail) * BigInt(line.quantity), factory:p?.factory == null ? null : BigInt(p.factory) * BigInt(line.quantity)};
  });
  const totals = {};
  for (const kind of ['retail','factory']) totals[kind] = {cents: rows.reduce((n,r) => n + (r[kind] ?? 0n),0n), missing: rows.filter(r => r[kind] === null).length};
  return {rows, totals};
}
const columns = ['type','id','quantity','label','note','retailCents','factoryCents','snapshot'];
const cell = s => '"'+String(s ?? '').replace(/"/g,'""')+'"';
const spreadsheetText = s => /^\s*[=+@\-]|^[\t\r\n']/.test(String(s)) ? "'"+s : s;
const decodeText = s => s.startsWith("'") ? s.slice(1) : s;
export function exportCSV(workspace, packages) {
  const rows = [columns, ['workspace','','','',spreadsheetText(workspace.note),'','',workspace.snapshot]];
  for (const l of workspace.lines) { const p = packages.get(l.id); rows.push(['line',spreadsheetText(l.id),l.quantity,spreadsheetText(l.label),spreadsheetText(l.note),p?.retail ?? '',p?.factory ?? '',workspace.snapshot]); }
  for (const f of workspace.favorites) rows.push(['favorite',spreadsheetText(f),'','','','','',workspace.snapshot]);
  return '\uFEFF'+rows.map(r => r.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/,''); const rows = []; let row=[], value='', quoted=false, closed=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) { if (c==='"' && text[i+1]==='"') {value+='"';i++;} else if (c==='"') {quoted=false;closed=true;} else value+=c; continue; }
    if (c==='"') {if(value || closed) throw new Error('Ungültige CSV-Anführungszeichen.');quoted=true;}
    else if (c===',') {row.push(value);value='';closed=false;}
    else if (c==='\n' || c==='\r') {if(c==='\r' && text[i+1]==='\n')i++;row.push(value);rows.push(row);row=[];value='';closed=false;}
    else {if(closed)throw new Error('Ungültige CSV-Zelle.');value+=c;}
  }
  if (quoted) throw new Error('Unvollständige CSV-Zelle.');
  if (value || row.length || closed) {row.push(value);rows.push(row);}
  return rows;
}
export function importCSV(text) {
  const rows=parseCSV(text); if (JSON.stringify(rows.shift()) !== JSON.stringify(columns)) throw new Error('CSV-Spalten passen nicht zum SL-Sicherungsformat.');
  const v=emptyWorkspace(); let meta=0;
  for (const r of rows) {
    if(r.length!==columns.length)throw new Error('Ungültige CSV-Spaltenzahl.');
    const [type,encodedId,q,encodedLabel,encodedNote,retail,factory,snapshot]=r;
    const id=decodeText(encodedId),label=decodeText(encodedLabel),note=decodeText(encodedNote);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshot) || [retail,factory].some(n => n!=='' && (!/^\d+$/.test(n) || !Number.isSafeInteger(Number(n))))) throw new Error('Ungültiger CSV-Preis oder Quellenstand.');
    if(type==='workspace') {if(meta++ || [id,q,label,retail,factory].some(Boolean))throw new Error('Ungültiger CSV-Kopf.');v.note=note;v.snapshot=snapshot;}
    else if(type==='line') {if(!/^[1-9]\d{0,3}$/.test(q))throw new Error('Ungültige Packungsmenge.');v.lines.push({id,quantity:Number(q),label,note});}
    else if(type==='favorite') {if([q,label,note,retail,factory].some(Boolean))throw new Error('Ungültiger Favorit.');v.favorites.push(id);}
    else throw new Error('Unbekannter CSV-Zeilentyp.');
    if (v.lines.length + v.favorites.length > MAX_LINES*2) throw new Error('Zu viele Positionen.');
  }
  if(meta!==1 || rows.some(r=>r[7]!==v.snapshot))throw new Error('Widersprüchlicher CSV-Quellenstand.');
  return validateWorkspace(v);
}
export function parseImport(text, filename='') {
    if (text.length > 12000000) throw new Error('Datei ist zu gross (max. 12 MB).');
  return filename.toLowerCase().endsWith('.csv') ? importCSV(text) : validateWorkspace(JSON.parse(text));
}
export class WorkspaceStore {
  constructor(storage) {
    this.storage=storage;this.raw=null;this.value=emptyWorkspace();this.problem='';this.paused=false;
    try {this.raw=storage.getItem(STORAGE_KEY); if(this.raw!==null)this.value=validateWorkspace(JSON.parse(this.raw));}
    catch {this.paused=true;this.problem=this.raw===null ? 'Speicher nicht lesbar. Änderungen bleiben nur im Arbeitsspeicher. Bitte exportieren.' : 'Gespeicherte Sammlung ist beschädigt. Original bleibt unverändert; bitte sichern und geprüft importieren.';}
  }
  externalChange() {this.paused=true;this.problem='Andere Registerkarte hat den Speicher geändert. Schreiben pausiert. Aktuelle Arbeit exportieren und neu laden.';}
  replace(next, recovery=false) {
    const valid=validateWorkspace(next);
    if (this.paused && !recovery) {this.value=valid;return false;}
    try {
      if(this.storage.getItem(STORAGE_KEY)!==this.raw) {this.externalChange();if(!recovery)this.value=valid;return false;}
      const raw=JSON.stringify(valid);this.storage.setItem(STORAGE_KEY,raw);
      this.raw=raw;this.value=valid;this.paused=false;this.problem='';return true;
    } catch {this.paused=true;this.problem='Speichern blockiert oder Speicher voll. Arbeit exportieren; vorhandener Speicher bleibt unverändert.';if(!recovery)this.value=valid;return false;}
  }
}
