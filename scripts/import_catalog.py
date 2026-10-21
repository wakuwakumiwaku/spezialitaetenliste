#!/usr/bin/env python3
"""Deterministic BAG October 2026 XLSX + FHIR import; Python standard library only."""
from __future__ import annotations
import collections
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from decimal import Decimal, ROUND_HALF_UP

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = '2026-10-01'
BASENAME = 'foph-sl-publication-20261001-de'
PINS = {
    BASENAME+'.xlsx': 'b77178c464192722f7ab67c8ee172fc62e7d0c6a4817b8d428649a33d1cfeef1',
    BASENAME+'.ndjson': '3776cf9157cf9f60259d542bb57c832a1d0fb24e25ad5c5dfb1595f98a6e424d',
}
ARCHIVE_URL = 'https://epl.bag.admin.ch/static/sl/archive/per-year/2026/2026-10-01/BAG_xls_2026.zip'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
        if tag in ('p', 'div', 'br', 'li', 'tr', 'h1', 'h2', 'h3'): self.parts.append('\n')
        if tag == 'li': self.parts.append('• ')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip = max(0, self.skip-1)
        if tag in ('p', 'div', 'li', 'tr'): self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def plain(html):
    p = PlainText(); p.feed(html or '')
    return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', ''.join(p.parts)).strip()

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def cents(value):
    if value is None or value == '': return None
    n = Decimal(str(value))
    if not n.is_finite() or n < 0: raise ValueError('Invalid price')
    return int((n*100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
def ext_value(extension):
    for k, v in extension.items():
        if k.startswith('value'): return v
    return None

def extensions(resource):
    return {e['url'].rsplit('/', 1)[-1]: ext_value(e) for e in resource.get('extension', [])}

def selected_price(history, kind, snapshot=SNAPSHOT):
    eligible = [p for p in history if p['kind'] == kind and p['currency'] == 'CHF' and p['date'] and p['date'] <= snapshot]
    if not eligible: return None
    date = max(p['date'] for p in eligible)
    values = {p['cents'] for p in eligible if p['date'] == date}
    return values.pop() if len(values) == 1 else None

def sheet_rows(path, number):
    with zipfile.ZipFile(path) as z:
        ss = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rows = []
        for row in ET.fromstring(z.read(f'xl/worksheets/sheet{number}.xml')).findall('.//s:row', NS):
            values = {}
            for c in row:
                v = c.find('s:v', NS); inline = c.find('s:is', NS)
                values[re.sub(r'\d', '', c.attrib['r'])] = ss[int(v.text)] if c.attrib.get('t') == 's' else (v.text if v is not None else ''.join(inline.itertext()) if inline is not None else '')
            rows.append((int(row.attrib['r']), values))
        columns = list(rows[0][1]); headers = list(rows[0][1].values())
        return headers, [(n, [r.get(c, '') for c in columns]) for n, r in rows[1:]]

def iso(value):
    return '-'.join(reversed(value.split('.'))) if value else None

def write_json(path, value, compress=False):
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(raw)
    if compress: path.with_suffix(path.suffix+'.gz').write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'gzipBytes': path.with_suffix(path.suffix+'.gz').stat().st_size if compress else None}

def run(root=ROOT):
    source = root/'sources'; out = root/'public'/'data'; out.mkdir(parents=True, exist_ok=True)
    for name, digest in PINS.items():
        if sha(source/name) != digest: raise ValueError('Source checksum mismatch: '+name)
    headers, rows = sheet_rows(source/(BASENAME+'.xlsx'), 1)
    limheaders, limrows = sheet_rows(source/(BASENAME+'.xlsx'), 2)
    packages = []; by_id = {}; products = {}; limit_pool = []; limit_keys = {}; lim_by_package = collections.defaultdict(list)
    for n, f in limrows:
        # Exact German XLSX strings, including whitespace, never rewritten from FHIR narrative.
        key = tuple(f[i] for i in (3, 4, 5, 6, 7, 8, 9))
        if key not in limit_keys:
            limit_keys[key] = len(limit_pool)
            limit_pool.append({'text': f[3], 'code': f[4], 'indication': f[5], 'points': f[6], 'maxPoints': f[7], 'start': iso(f[8]), 'end': iso(f[9])})
        lim_by_package[f[14]].append({'index': limit_keys[key], 'row': n})
    for n, f in rows:
        mid, pid = f[8], f[9]
        if pid in by_id: raise ValueError('Duplicate XLSX package ID: '+pid)
        key = pid or 'xlsx-'+hashlib.sha256(json.dumps([n,f],ensure_ascii=False).encode()).hexdigest()[:24]
        p = {'id': key, 'productId': mid, 'brand': f[0], 'form': f[1], 'size': f[2], 'ingredients': f[3], 'manufacturer': f[4], 'swissmedic': f[5] or None, 'gtin': f[6] or None, 'previousGtin': f[7] or None, 'pharmacode': None, 'list': f[25] or None, 'characteristic': f[22] or None, 'atc': f[26], 'retail': cents(f[12]), 'factory': cents(f[11]), 'currency': 'CHF', 'listingStart': iso(f[20]), 'listingEnd': iso(f[21]), 'limitationFlag': f[15], 'limitations': lim_by_package[pid], 'sourceRow': n, 'fields': f, 'prices': [], 'authorizations': [], 'fhirLimitations': []}
        packages.append(p); by_id[pid] = p
    resources = collections.Counter(); resource_ids = collections.defaultdict(set); bundle_count = 0; fhir_packages = set(); condition_pool = []; condition_keys = {}; price_mismatches = []; join_errors = []; fhir_lim_links = 0; missing_conditions = []; text_mismatches = []; bullet_only_mismatches = []; resource_types = collections.Counter(); future_prices = 0; fhir_condition_count = 0
    for line_no, line in enumerate((source/(BASENAME+'.ndjson')).open(encoding='utf-8'), 1):
        b = json.loads(line, parse_float=Decimal); bundle_count += 1
        entries = [e['resource'] for e in b['entry']]
        m = [r for r in entries if r['resourceType'] == 'MedicinalProductDefinition']
        if len(m) != 1: raise ValueError('Expected exactly one medicinal product per bundle')
        m = m[0]; mid = m['id']
        if mid in products: raise ValueError('Duplicate FHIR medicinal product')
        cs = [c for classification in m.get('classification', []) for c in classification.get('coding', [])]
        product = {'id': mid, 'name': next((x['productName'] for x in m['name'] if any(c.get('code') == 'de-CH' for u in x.get('usage',[]) for c in u.get('language',{}).get('coding',[]))), plain(m.get('text',{}).get('div'))), 'classifications': cs, 'ingredients': [], 'bundleId': b['id'], 'sourceLine': line_no, 'packages': []}
        products[mid] = product
        conditions = {}
        for r in entries:
            if r['resourceType'] == 'ClinicalUseDefinition':
                if r['id'] in conditions and conditions[r['id']] != r:
                    raise ValueError('Conflicting condition within bundle: '+b['id']+'/'+r['id'])
                conditions[r['id']] = r
        local_condition_map = {}
        for cid, c in conditions.items():
            txt = c.get('indication',{}).get('diseaseSymptomProcedure',{}).get('concept',{}).get('text') or plain(c.get('text',{}).get('div'))
            obj = {'id': cid, 'text': txt, 'narrative': plain(c.get('text',{}).get('div'))}
            key = json.dumps(obj, ensure_ascii=False, sort_keys=True)
            if key not in condition_keys: condition_keys[key] = len(condition_pool); condition_pool.append(obj)
            local_condition_map[cid] = condition_keys[key]
        for r in entries:
            t = r['resourceType']; resources[t] += 1; resource_ids[t].add(r['id'])
            if t == 'Ingredient':
                product['ingredients'].append({'id': r['id'], 'text': plain(r.get('text',{}).get('div')), 'role': r.get('role'), 'substance': r.get('substance')})
            if t == 'PackagedProductDefinition':
                pid = r['id']; fhir_packages.add(pid)
                if {ref.get('reference','').rsplit('/',1)[-1] for ref in r.get('packageFor',[])} != {mid}: raise ValueError('FHIR packageFor context mismatch: '+pid)
                if pid not in by_id: join_errors.append('FHIR package without XLSX: '+pid); continue
                p = by_id[pid]; product['packages'].append(p['id'])
                if p['productId'] != mid: join_errors.append('Product mismatch: '+pid)
                p['description'] = r['description']
            if t != 'RegulatedAuthorization': continue
            for cod in r.get('type',{}).get('coding',[]): resource_types[cod.get('display','')] += 1
            for sub in r.get('subject',[]):
                pid = sub.get('reference','').rsplit('/',1)[-1]
                if pid not in by_id: continue
                p = by_id[pid]
                for e in r.get('extension',[]):
                    if not e['url'].endswith('/reimbursementSL'): continue
                    vals = extensions(e)
                    # Preserve original typed reimbursement metadata; no inferred eligibility.
                    meta = {'id': r['id'], 'bundleId': b['id'], 'values': {k:v for k,v in vals.items() if k not in ('productPrice','regulatedAuthorization-limitation')}}
                    p['authorizations'].append(meta)
                    for x in e.get('extension',[]):
                        if x['url'].endswith('/productPrice'):
                            v = extensions(x); money = v.get('value',{}); cod = v.get('type',{}).get('coding',[{}])[0]
                            kind = {'756002005001':'retail','756002005002':'factory'}.get(cod.get('code'), cod.get('code'))
                            p['prices'].append({'kind':kind,'cents':cents(money.get('value')),'currency':money.get('currency'), 'date':v.get('changeDate'), 'type':v.get('type'), 'changeType':v.get('changeType')})
                            if v.get('changeDate','') > SNAPSHOT: future_prices += 1
                    for indication in r.get('indication', []):
                        for x in indication.get('extension', []):
                            if not x['url'].endswith('/regulatedAuthorization-limitation'): continue
                            fhir_lim_links += 1; v = extensions(x); cid = v.get('limitationIndication',{}).get('reference','').split('/',1)[-1]
                            index = local_condition_map.get(cid)
                            p['fhirLimitations'].append({'condition':index,'bundleId': b['id'],'authorizationId':r['id'],'metadata':v})
                            if index is None: missing_conditions.append({'package':pid,'reference':cid})
        fhir_condition_count += len(conditions)
    for p in packages:
        for kind in ('retail','factory'):
            chosen = selected_price(p['prices'],kind)
            if chosen != p[kind]: price_mismatches.append({'package':p['id'],'field':kind,'xlsx':p[kind],'fhir':chosen})
            # A conflict is unresolved, not permission to choose an arbitrary price.
            p[kind] = chosen if chosen == p[kind] else None
        x = sorted(re.sub(r'\s+',' ',limit_pool[l['index']]['text']).strip() for l in p['limitations'])
        f = sorted(re.sub(r'\s+',' ',condition_pool[l['condition']]['text']).strip() for l in p['fhirLimitations'] if l['condition'] is not None)
        if x != f:
            text_mismatches.append(p['id'])
            bullet_normalize = lambda lines: sorted(re.sub(r'\s+',' ',line.replace('•','')).strip() for line in lines)
            if bullet_normalize(x) == bullet_normalize(f): bullet_only_mismatches.append(p['id'])
    missing_fhir = sorted(set(by_id)-fhir_packages)
    orphan_limits = sorted(set(lim_by_package)-set(by_id))
    if join_errors or missing_fhir or orphan_limits or missing_conditions: raise ValueError(json.dumps({'joins':join_errors,'missingFHIR':missing_fhir,'orphanLimits':orphan_limits,'missingConditions':missing_conditions}))
    stats = {'products':len(products),'packages':len(packages),'xlsxPackageRows':len(rows),'xlsxLimitationRows':len(limrows),'fhirBundles':bundle_count,'fhirResources':dict(resources),'fhirLimitationLinks':fhir_lim_links,'uniqueGermanLimitations':len(limit_pool),'fhirConditionOccurrences':fhir_condition_count,'uniqueFHIRConditions':len(condition_pool),'lists':dict(collections.Counter(p['list'] for p in packages)),'characteristics':dict(collections.Counter(p['characteristic'] or '(nicht angegeben)' for p in packages)),'missing':{k:sum(p[k] in (None,'') for p in packages) for k in ('gtin','swissmedic','pharmacode','ingredients','atc','retail','factory')},'packagesWithLimitations':sum(bool(p['limitations']) for p in packages),'futurePriceRecords':future_prices,'priceRecords':sum(len(p['prices']) for p in packages),'priceConflicts':len(price_mismatches),'limitationWhitespaceNormalizedMismatchPackages':len(text_mismatches),'unmatchedPackages':len(missing_fhir),'orphanLimitationRows':len(orphan_limits)}
    stats['limitationOnlyBulletFormattingDifferencePackages'] = len(bullet_only_mismatches)
    stats['fhirUniqueIds'] = {k:len(v) for k,v in resource_ids.items()}
    controls = {'MedicinalProductDefinition':6749,'PackagedProductDefinition':10352,'RegulatedAuthorization':27453,'Ingredient':8741,'ClinicalUseDefinition':5009}
    if dict(resources) != controls or len(rows) != 10352 or len(limrows) != 6340 or fhir_lim_links != 6340:
        raise ValueError('Independent completeness controls failed')
    # Details are fetched only on demand; search/collection never downloads the full source.
    details = {format(i,'x'):{'products':{},'packages':{}} for i in range(16)}
    limit_fields = {n:f for n,f in limrows}
    for product in products.values():
        shard = hashlib.sha256(product['id'].encode()).hexdigest()[0]
        product['shard'] = shard
        details[shard]['products'][product['id']] = {k:product.pop(k) for k in ('ingredients','classifications')}
    for p in packages:
        shard = products[p['productId']]['shard']
        detail = {k:p.pop(k) for k in ('fields','prices','authorizations','fhirLimitations')}
        detail['limitationRows'] = [{'row':l['row'],'fields':limit_fields[l['row']]} for l in p['limitations']]
        details[shard]['packages'][p['id']] = detail
    detail_sizes = {}
    def serializable(obj): return json.loads(json.dumps(obj,ensure_ascii=False,default=lambda x:str(x) if isinstance(x,Decimal) else x))
    for shard, detail in details.items(): detail_sizes[shard] = write_json(out/('details-'+shard+'.json'),serializable(detail),True)
    detail_sizes['texts'] = write_json(out/'texts.json',{'limitations':limit_pool,'conditions':condition_pool},True)
    catalog = {'schema':1,'snapshot':SNAPSHOT,'publisher':'Bundesamt für Gesundheit (BAG)','sourceURL':ARCHIVE_URL,'fallback':'Das aktuelle Ressourcen-API lieferte keine Download-URLs. Verwendet wird die vollständige amtliche Archivpublikation vom 01.10.2026, nicht der Abrufstand vom 21.10.2026.','headers':headers,'limitationHeaders':limheaders,'products':list(products.values()),'packages':packages,'stats':stats}
    catalog = serializable(catalog)
    sizes = write_json(out/'catalog.json',catalog,True)
    shutil.copyfile(source/(BASENAME+'.xlsx'),out/(BASENAME+'.xlsx'))
    # Optional complete original FHIR download; NOT used at page startup.
    with (source/(BASENAME+'.ndjson')).open('rb') as src, (out/(BASENAME+'.ndjson.gz')).open('wb') as dst:
        with gzip.GzipFile(fileobj=dst,mode='wb',filename='',mtime=0,compresslevel=9) as gz: shutil.copyfileobj(src,gz)
    report = {'schema':1,'snapshot':SNAPSHOT,'sourceURL':ARCHIVE_URL,'archiveSHA256':'0f2b24ffb556a4c532257775c1c32f86b67a00b79e738699d598474f304bc307','members':{name:{'sha256':digest,'bytes':(source/name).stat().st_size,'archiveMember':'BAG_xls_2026/'+name} for name,digest in PINS.items()},'catalog':sizes,'details':detail_sizes,'stats':stats,'priceMismatches':price_mismatches,'limitationTextMismatchPackageIds':text_mismatches,'policy':{'priceDate':SNAPSHOT,'currency':'CHF','conflict':'null on disagreement or ambiguous latest applicable FHIR values; XLSX original retained','identifiers':'Literal source strings. No numeric parsing; Pharmacode unavailable in this snapshot.','limits':'All XLSX package-limit rows retained by reference, exact German text. All FHIR links/metadata and distinct condition texts retained separately.','scope':'SL, GGSL and GGML are explicitly labeled and filterable, not merged.','unmodeled':'Full XLSX source columns retained. Optional gzip original FHIR retains every original byte after decompression; no runtime clinical interpretation.'}}
    write_json(out/'import-report.json',report,True)
    print(json.dumps({'stats':stats,'catalog':sizes,'originalFHIRGzipBytes':(out/(BASENAME+'.ndjson.gz')).stat().st_size},ensure_ascii=False,indent=2))
    return report

if __name__ == '__main__': run()
