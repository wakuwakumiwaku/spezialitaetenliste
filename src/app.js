import {STORAGE_KEY,SNAPSHOT,collator,WorkspaceStore,validateWorkspace,createIndex,searchPackages,packageName,money,calculate,exportCSV,parseImport} from './domain.js';
import {loadCatalog,loadJSON} from './catalog.js';
const $ = id => document.getElementById(id);
function el(tag, attrs={}, ...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(key==='class')node.className=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
    else if(key==='text')node.textContent=value;
    else if(key==='value')node.value=value;
    else if(value!==false && value!==null && value!==undefined)node.setAttribute(key,String(value));
  }
  for(const child of children.flat()) if(child!==null && child!==undefined)node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
const btn=(text,fn,attrs={})=>el('button',{type:'button',onclick:fn,...attrs},text);
let index, catalog, page=0, detailToken=0, importToken=0, pending=null, toastTimer;
const PAGE_SIZE=40;
let storage;
try {storage=window.localStorage;} catch {storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};}
const store=new WorkspaceStore(storage);
function toast(text) {clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,5500);}
function download(name,text,type='application/json') {
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=el('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function storageStatus() {
  const w=$('storage-warning');w.hidden=!store.problem;w.replaceChildren();
  if(store.problem)w.append(...[el('span',{},store.problem),btn('Arbeit als JSON sichern',()=>exportJSON()),store.raw!==null?btn('Unveränderten Speicher sichern',()=>download('sl-speicher-original.txt',store.raw,'text/plain')):null,btn('Neu laden',()=>location.reload())].filter(Boolean));
}
function commit(mutator) {
  const next=structuredClone(store.value),before=store.value;
  try {mutator(next);store.replace(next);storageStatus();renderCollection();renderResults();return store.value!==before;}
  catch(e){toast(e.message);return false;}
}
function saveDraft(next){try{store.replace(next);storageStatus();}catch(e){toast(e.message);}}
function toggleFavorite(id) {commit(v=>{const i=v.favorites.indexOf(id);if(i<0)v.favorites.push(id);else v.favorites.splice(i,1);});}
function addPackage(p) {
  if(!index)return;
  const changed=commit(v=>{const line=v.lines.find(l=>l.id===p.id);if(line){if(line.quantity===9999)throw new Error('Maximal 9999 Packungen.');line.quantity++;}else v.lines.push({id:p.id,quantity:1,label:packageName(p),note:''});});
  if(changed)toast('Packung zur Sammlung hinzugefügt.');
}
function filters(){return {query:$('search').value,list:$('list').value,atc:$('atc').value,manufacturer:$('manufacturer').value,type:$('type').value,scope:$('scope').value,sort:$('sort').value};}
function renderResults() {
  if(!index)return;
  const start=performance.now(), matches=searchPackages(index,filters(),store.value.favorites), pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));page=Math.min(page,pages-1);
  const visible=matches.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE),root=$('results'),groups=[];
  root.replaceChildren();
  for(const p of visible){const last=groups.at(-1);if(last?.[0]===p.productId)last[1].push(p);else groups.push([p.productId,[p]]);}
  for(const [mid,ps] of groups) {
    const m=index.products.get(mid), group=el('article',{class:'medicine','data-product':mid});
    group.append(el('div',{class:'medicine-heading'},el('h3',{class:'medicine-name'},m.name)),el('p',{class:'medicine-meta'},[...new Set(ps.map(p=>p.ingredients||'Wirkstoff nicht angegeben'))].join(' / '),' · ',[...new Set(ps.map(p=>p.manufacturer||'Anbieterin nicht angegeben'))].join(' / ')));
    for(const p of ps) {
      const f=store.value.favorites.includes(p.id),row=el('div',{class:'pack-row','data-id':p.id});
      row.append(el('div',{},btn(p.size,()=>showDetail(p.id),{class:'pack-main pack-title','aria-label':'Details: '+packageName(p)}),el('div',{class:'pack-codes'},el('code',{},p.gtin?'GTIN '+p.gtin:p.swissmedic?'Swissmedic '+p.swissmedic:'Quellen-ID '+p.id)),el('div',{class:'source-note'},p.atc||'ATC nicht angegeben',' · ',p.list||'Liste nicht angegeben',' · ',p.characteristic||'Typ nicht angegeben',p.limitations.length?' · Limitierung':'')),el('div',{class:'pack-prices'},price(p.retail,'Publikumspreis'),price(p.factory,'Fabrikabgabepreis')),
        el('div',{class:'pack-actions'},btn('＋ Sammlung',()=>addPackage(p),{class:'primary','data-add':p.id}),btn(f?'★ Favorit':'☆ Merken',()=>toggleFavorite(p.id),{class:'favorite','aria-pressed':f,'aria-label':'Favorit: '+packageName(p)}),btn('Details',()=>showDetail(p.id),{'data-detail':p.id})));
      group.append(row);
    }
    root.append(group);
  }
  if(!matches.length)root.append(el('p',{class:'empty'},'Keine Packungen für diese Auswahl. Filter oder Suchbegriff ändern.'));
  $('result-count').textContent=matches.length.toLocaleString('de-CH')+' von '+catalog.packages.length.toLocaleString('de-CH')+' Packungen · '+new Set(matches.map(p=>p.productId)).size.toLocaleString('de-CH')+' Präparate';
  $('page-info').textContent=`Seite ${page+1} / ${pages}`;$('previous').disabled=page===0;$('next').disabled=page+1===pages;
  root.setAttribute('aria-busy','false');root.dataset.matches=matches.length;root.dataset.rendered=visible.length;root.dataset.renderMs=(performance.now()-start).toFixed(2);
}
function price(value,label){return el('div',{},el('span',{class:'price-label'},label),el('span',{class:'amount'},money(value)));}
function renderCollection() {
  if(!index)return;
  const calc=calculate(store.value,index.packages),root=$('collection-lines');root.replaceChildren();
  for(const line of calc.rows) {
    const p=line.package,row=el('article',{class:'collection-line'+(!p?' unresolved':''),'data-id':line.id});
    row.append(el('h3',{},p?packageName(p):line.label||line.id),el('p',{class:'line-meta'},p?(p.gtin?'GTIN '+p.gtin:'Quellen-ID '+p.id)+' · '+p.list:'Nicht im Quellenstand gefunden · '+line.id));
    if(p)row.append(btn('Packungsdetails',()=>showDetail(p.id)));
    const input=el('input',{type:'number',min:1,max:9999,step:1,value:line.quantity,'aria-label':'Anzahl Packungen: '+(p?packageName(p):line.label),onchange:event=>{
      const value=event.target.value;
      if(!/^[1-9]\d{0,3}$/.test(value)){event.target.value=line.quantity;toast('Bitte 1 bis 9999 ganze Packungen angeben.');return;}
      commit(v=>v.lines.find(l=>l.id===line.id).quantity=Number(value));
    }});
    row.append(el('div',{class:'quantity-row'},el('label',{},'Packungen',input),btn('Entfernen',()=>commit(v=>{v.lines=v.lines.filter(l=>l.id!==line.id);}))),el('div',{class:'line-prices'},price(line.retail,'Publikumspreis × Menge'),price(line.factory,'Fabrikabgabepreis × Menge')));
    const note=el('textarea',{rows:1,maxlength:10000,'aria-label':'Positionsnotiz: '+(p?packageName(p):line.label),oninput:event=>{
      const next=structuredClone(store.value);next.lines.find(l=>l.id===line.id).note=event.target.value;saveDraft(next);
    }});note.value=line.note;row.append(note);root.append(row);
  }
  if(!calc.rows.length)root.append(el('p',{class:'empty'},'Noch keine Packungen. Wählen Sie im Katalog „＋ Sammlung“.'));
  const totals=$('totals');totals.replaceChildren();
  for(const [kind,label] of [['retail','Publikumspreise inkl. MwSt'],['factory','Fabrikabgabepreise exkl. MwSt']]) {
    const t=calc.totals[kind];totals.append(el('div',{class:'total'},el('span',{class:'price-label'},label),el('strong',{class:'amount'},money(t.cents)),t.missing?el('span',{class:'incomplete'},`Unvollständige Teilsumme · ${t.missing} Position(en) ohne Preis`):el('span',{class:'source-note'},'Summe der Packungspreise')));
  }
  $('collection-count').textContent=String(store.value.lines.length);
  if(document.activeElement!==$('workspace-note'))$('workspace-note').value=store.value.note;
  const unknownFavs=store.value.favorites.filter(id=>!index.packages.has(id)).length;
  if(unknownFavs)totals.append(el('p',{class:'incomplete'},`${unknownFavs} unbekannte Favoriten bleiben in Sicherungen erhalten.`));
  if(store.value.snapshot!==SNAPSHOT)totals.append(el('p',{class:'incomplete'},`Importierter Stand ${store.value.snapshot}. Berechnung ausschliesslich mit Quellenpreisen vom ${SNAPSHOT}.`));
}
function appendDL(parent,entries) {const dl=el('dl');for(const [label,value] of entries)dl.append(el('dt',{},label),el('dd',{},value===null||value===''||value===undefined?'Nicht angegeben':value));parent.append(dl);}
function dataDetails(title,data) {return el('details',{},el('summary',{},title),el('pre',{},JSON.stringify(data,null,2)));}
async function showDetail(id) {
  const p=index.packages.get(id);if(!p)return;const m=index.products.get(p.productId),token=++detailToken,body=$('detail-body');
  $('detail-title').textContent=packageName(p);body.replaceChildren(el('p',{},'Originalangaben werden geladen …'));if(!$('detail-dialog').open)$('detail-dialog').showModal();
  try {
    const [shard,texts]=await Promise.all([loadJSON('details-'+m.shard),loadJSON('texts')]);if(token!==detailToken)return;
    const d=shard.packages[p.id],md=shard.products[m.id];body.replaceChildren();
    body.append(el('p',{class:'source-note'},`BAG · ${p.list} · Publikationsstand 01.10.2026 · Datenstamm, Zeile ${p.sourceRow}`),el('div',{class:'detail-prices'},price(p.retail,'Publikumspreis inkl. MwSt'),price(p.factory,'Fabrikabgabepreis exkl. MwSt')),btn('＋ Zur Sammlung',()=>addPackage(p),{class:'primary'}));
    appendDL(body,[['Präparat',m.name],['Handelsname',p.brand],['gal. Form / Dosierung (Quelle)',p.form],['Packung',p.size],['Wirkstoffe',p.ingredients],['Zulassungsinhaberin',p.manufacturer],['GTIN',p.gtin],['Swissmedic Code Packung',p.swissmedic],['Vorgänger-GTIN',p.previousGtin],['Pharmacode','In dieser Quelle nicht enthalten'],['ATC',p.atc],['Listung',p.list],['Charakteristikum (Quellcode)',p.characteristic],['Aufnahme ab',p.listingStart],['Aufnahme befristet bis',p.listingEnd],['Medizinische Präparate-ID',p.productId],['Packungs-ID',p.id]]);
    body.append(el('p',{class:'source-note'},'Gleicher Wirkstoff oder ATC-Code bedeutet keine therapeutische Gleichwertigkeit. Eine Listung allein garantiert keine Vergütung. Die folgenden Limitierungen sind Original-Quellentext, keine Dosierungsanweisung dieser Anwendung.'));
    body.append(el('h3',{},`Limitierungen · ${p.limitations.length} Zuordnung(en)`));
    if(!p.limitations.length)body.append(el('p',{},'Für diese Packung enthält das Quellenblatt keine Limitierungszeile. Daraus wird keine uneingeschränkte Vergütung abgeleitet.'));
    for(const l of p.limitations) {
      const v=texts.limitations[l.index],section=el('section',{class:'limitation','data-source-row':l.row});
      section.append(el('h3',{},v.code||'Limitierung'),el('p',{class:'source-note'},`BAG XLSX · Limitierungen, Zeile ${l.row} · Gültig ab: ${v.start||'nicht angegeben'} · Befristet bis: ${v.end||'nicht angegeben'}`,v.indication?' · Indikationscode: '+v.indication:'',v.points?' · Punkte pro Packung: '+v.points:'',v.maxPoints?' · Gesamthaft zugelassene Punkte: '+v.maxPoints:''),el('div',{class:'limitation-text'},v.text));body.append(section);
    }
    const fhir=el('details',{},el('summary',{},`FHIR-Abgleich: ${d.fhirLimitations.length} Limitierungszuordnung(en), Metadaten & Bedingungen`));
    fhir.append(el('p',{class:'source-note'},'Alle FHIR-Zuordnungen im Kontext dieser Packung; nicht mit gleichlautenden Kennungen anderer Präparate zusammengeführt. Bei 24 Packungen fehlen im FHIR-Text die Aufzählungszeichen des XLSX; beide Fassungen bleiben erhalten. Original-Metadaten werden nicht als persönlicher Vergütungsentscheid interpretiert.'));
    for(const link of d.fhirLimitations){const condition=texts.conditions[link.condition];fhir.append(el('h3',{},condition?.id||'Referenz nicht aufgelöst'),el('p',{class:'limitation-text'},condition?.text||'Kein Text'),dataDetails('Status, Fristen & Kontext',link));}
    body.append(fhir,dataDetails('Preisstände & Änderungsdaten (FHIR)',d.prices),dataDetails('Listungs- und Vergütungsmetadaten (FHIR)',d.authorizations),dataDetails('Wirkstoffe & Klassifikationen (FHIR)',md));
    const original=el('details',{},el('summary',{},'Sämtliche Originalspalten dieser XLSX-Packung'));
    appendDL(original,catalog.headers.map((h,i)=>[h,d.fields[i]]));body.append(original);
    const limitOriginal=el('details',{},el('summary',{},'Originalspalten aller XLSX-Limitierungszeilen'));for(const r of d.limitationRows){limitOriginal.append(el('h3',{},'Limitierungen, Zeile '+r.row));appendDL(limitOriginal,catalog.limitationHeaders.map((h,i)=>[h,r.fields[i]]));}body.append(limitOriginal);
    body.append(el('h3',{},`Packungen desselben Quellen-Präparats · ${m.packages.length}`));
    const siblings=el('div',{class:'siblings'});for(const sid of m.packages){const s=index.packages.get(sid);siblings.append(btn(s.size+' · '+money(s.retail),()=>showDetail(sid),{'aria-current':sid===id?'true':null}));}body.append(siblings,el('p',{class:'source-note'},`FHIR Bundle ${m.bundleId} · NDJSON Zeile ${m.sourceLine}`));
  } catch(e) {if(token!==detailToken)return;body.replaceChildren(el('p',{class:'error'},e.message),btn('Erneut laden',()=>showDetail(id)));}
}
async function showSources() {
  const root=$('source-body');root.replaceChildren(el('p',{},'Quellennachweise werden geladen …'));$('source-dialog').showModal();
  try {
    const report=await loadJSON('import-report');root.replaceChildren(el('p',{},catalog.fallback),el('p',{},'Automatisch gebündelt geladen: alle 10’352 Packungen der deutschen Publikation; SL 10’064, GGSL 143, GGML 145. Keine manuelle Katalogdatei und keine externe Laufzeit-API.'),el('p',{},'Preisstand ist der 01.10.2026, nicht das heutige Datum. Publikumspreis und Fabrikabgabepreis bleiben getrennt. Fehlende oder widersprüchliche Werte sind unbekannt, niemals null Franken. Historische bzw. zukünftige Preisstände bleiben in den Details erhalten; ausgewählt wird nur der letzte eindeutige CHF-Preis mit Änderungsdatum bis zum Quellenstichtag. Keine Preisumrechnung pro mg oder Einheit.'),el('p',{},'Pharmacodes sind in dieser Publikation nicht enthalten. 87 Packungen haben keine GTIN, 150 keinen Swissmedic-Packungscode, 152 keinen Publikumspreis und 185 keinen Fabrikabgabepreis. Kennungen und unbekannte importierte Positionen bleiben unverändert erhalten.'),el('p',{},'Original-Limitierungen werden vollständig aus dem deutschen XLSX-Blatt angezeigt, mit Packungsbezug, Zeilennummer und Fristen. FHIR-Zuordnungen und Metadaten sind zusätzlich einsehbar. ATC- oder Wirkstoffgruppen sind keine Prüfung der Austauschbarkeit, Indikation oder Versicherungsleistung. Die Anwendung erhebt keine Patientendaten.'),el('p',{},el('a',{href:'https://sl.bag.admin.ch/resources/current-and-archived-data',target:'_blank',rel:'noopener noreferrer'},'BAG: aktuelle und archivierte Daten'),' · ',el('a',{href:catalog.sourceURL,target:'_blank',rel:'noopener noreferrer'},'Amtliches Jahresarchiv 2026 (188 MB)')),
      el('p',{},el('a',{href:'./data/foph-sl-publication-20261001-de.xlsx',download:''},'Original XLSX herunterladen (3 MB)'),' · ',el('a',{href:'./data/foph-sl-publication-20261001-de.ndjson.gz',download:''},'Original FHIR, gzip (4,3 MB; entpackt 93,6 MB)')),
      el('p',{},el('a',{href:'./data/import-report.json',download:''},'Importbericht JSON herunterladen')),dataDetails('Original-Prüfsummen und exakte Importstatistik',report));
  } catch(e){root.replaceChildren(el('p',{class:'error'},e.message));}
}
function exportJSON(){download('sl-sammlung.json',JSON.stringify(validateWorkspace(store.value),null,2)+'\n');}
function preparePrint() {
  if(!index)return;const root=$('print-view'),calc=calculate(store.value,index.packages);root.replaceChildren(el('h1',{},'Spezialitätenliste · Packungspreisvergleich'),el('p',{},'BAG Quellenstand 01.10.2026 · Unabhängige Referenz. Keine garantierte Vergütung oder Austauschbarkeit. Menge = Packungen.'),el('p',{},store.value.note));
  for(const l of calc.rows)root.append(el('article',{},el('h2',{},l.package?packageName(l.package):l.label||l.id),el('p',{},`${l.quantity} Packung(en) · ${l.package?.gtin||l.id} · ${l.package?.list||'Ungeklärt'}`),el('p',{},`Publikumspreis × Menge: ${money(l.retail)}\nFabrikabgabepreis × Menge: ${money(l.factory)}`),el('p',{},l.note)));
  for(const [kind,label]of [['retail','Publikumspreise'],['factory','Fabrikabgabepreise']]){const t=calc.totals[kind];root.append(el('p',{class:'amount'},label+': '+money(t.cents)+(t.missing?' · Unvollständige Teilsumme, '+t.missing+' Position(en) ohne Preis':'')));}
}
function bind() {
  $('filter-toggle').onclick=()=>{const open=document.querySelector('.filters').classList.toggle('filters-open');$('filter-toggle').setAttribute('aria-expanded',String(open));$('filter-toggle').textContent=open?'Filter ausblenden':'Filter anzeigen';};
  for(const id of ['list','atc','manufacturer','type','scope','sort'])$(id).addEventListener('change',()=>{page=0;renderResults();});
  $('search').addEventListener('input',()=>{page=0;renderResults();});
  $('reset').onclick=()=>{for(const id of ['search','list','atc','manufacturer','type','scope'])$(id).value='';$('sort').value='name';page=0;renderResults();};
  for(const [id,delta]of [['previous',-1],['next',1]])$(id).onclick=()=>{page+=delta;renderResults();$('catalog-title').scrollIntoView({block:'start'});};
  $('detail-close').onclick=()=>{detailToken++;$('detail-dialog').close();};$('detail-dialog').addEventListener('close',()=>detailToken++);
  $('source-open').onclick=showSources;$('source-footer').onclick=showSources;$('source-close').onclick=()=>$('source-dialog').close();
  $('workspace-note').addEventListener('input',event=>{const next=structuredClone(store.value);next.note=event.target.value;saveDraft(next);});
  $('export-json').onclick=exportJSON;$('export-csv').onclick=()=>download('sl-sammlung.csv',exportCSV(store.value,index.packages),'text/csv;charset=utf-8');
  $('clear').onclick=()=>{if(confirm('Alle Positionen und die Sammlungsnotiz entfernen? Favoriten bleiben erhalten.'))commit(v=>{v.lines=[];v.note='';});};
  $('print').onclick=()=>{preparePrint();window.print();};window.addEventListener('beforeprint',preparePrint);
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY||event.key===null){store.externalChange();storageStatus();}});
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;const token=++importToken;
    try {
      if(file.size>12000000)throw new Error('Maximal 12 MB pro Sicherung.');
      const valid=parseImport(await file.text(),file.name);if(token!==importToken)return;
      const raw=storage.getItem(STORAGE_KEY);
      if(raw!==store.raw)throw new Error('Speicher wurde in einer anderen Registerkarte geändert. Erst sichern und neu laden.');
      pending={value:valid,raw,backedUp:raw===null};
      $('import-summary').textContent=`${valid.lines.length} Position(en), ${valid.favorites.length} Favorit(en), ${valid.lines.filter(l=>!index.packages.has(l.id)).length} unbekannte Kennung(en). Vorhandene Sammlung wird erst nach Bestätigung ersetzt.`;
      $('backup-before-import').disabled=raw===null;$('import-confirm').disabled=!pending.backedUp;$('import-dialog').showModal();
    } catch(e) {if(token!==importToken)return;pending=null;toast('Import abgelehnt: '+e.message);}
  });
  $('backup-before-import').onclick=()=>{if(!pending)return;download('sl-vor-import-speicher.txt',pending.raw??'','text/plain');pending.backedUp=true;$('import-confirm').disabled=false;};
  $('import-cancel').onclick=()=>{pending=null;$('import-dialog').close();};
  $('import-dialog').addEventListener('cancel',()=>pending=null);
  $('import-confirm').onclick=()=>{
    if(!pending?.backedUp)return;
    try {
      if(storage.getItem(STORAGE_KEY)!==pending.raw)throw new Error('Speicher hat sich seit der Vorschau geändert. Kein Import.');
      if(!store.replace(pending.value,true))throw new Error(store.problem);
      pending=null;$('import-dialog').close();renderCollection();renderResults();storageStatus();toast('Geprüfte Sammlung übernommen.');
    } catch(e){pending=null;$('import-dialog').close();storageStatus();toast('Import nicht gespeichert: '+e.message);}
  };
}
function options(id,values){for(const v of values)$(id).append(el('option',{value:v},v));}
async function main() {
  storageStatus();
  try {
    const start=performance.now();catalog=await loadCatalog();index=createIndex(catalog);
    options('list',[...new Set(catalog.packages.map(p=>p.list).filter(Boolean))].sort());options('atc',[...new Set(catalog.packages.map(p=>p.atc[0]).filter(Boolean))].sort());options('manufacturer',[...new Set(catalog.packages.map(p=>p.manufacturer).filter(Boolean))].sort(collator.compare));
    options('type',[...new Set(catalog.packages.flatMap(p=>(p.characteristic||'').split(/,\s*/)).filter(Boolean))].sort());
    bind();renderCollection();renderResults();document.body.dataset.ready='true';document.body.dataset.loadMs=(performance.now()-start).toFixed(2);
  } catch(e) {$('load-error').hidden=false;$('load-error').replaceChildren(el('span',{},'Der gebündelte Katalog konnte nicht geladen werden: '+e.message+' Bitte Verbindung/Dateien prüfen und neu laden.'),btn('Neu laden',()=>location.reload()));$('results').setAttribute('aria-busy','false');$('result-count').textContent='Katalog nicht verfügbar';}
}
main();
