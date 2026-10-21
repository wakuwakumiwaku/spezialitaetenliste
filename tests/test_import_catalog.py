import collections
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('import_catalog',ROOT/'scripts/import_catalog.py')
imp=importlib.util.module_from_spec(spec);spec.loader.exec_module(imp)
class ImportTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.catalog=json.loads((ROOT/'public/data/catalog.json').read_text())
  cls.report=json.loads((ROOT/'public/data/import-report.json').read_text())
  cls.texts=json.loads((ROOT/'public/data/texts.json').read_text())
  cls.details={s:json.loads((ROOT/f'public/data/details-{s}.json').read_text()) for s in '0123456789abcdef'}
 def test_decimal_rounding_and_date_selection(self):
  self.assertEqual(imp.cents('1.005'),101);self.assertIsNone(imp.cents(''));self.assertEqual(imp.cents('0'),0)
  with self.assertRaises(ValueError):imp.cents('NaN')
  h=[{'kind':'retail','currency':'CHF','date':'2026-01-01','cents':100},{'kind':'retail','currency':'CHF','date':'2026-12-01','cents':999}]
  self.assertEqual(imp.selected_price(h,'retail'),100)
  h.append({'kind':'retail','currency':'CHF','date':'2026-01-01','cents':200});self.assertIsNone(imp.selected_price(h,'retail'))
 def test_safe_narrative_flattening(self):
  text=imp.plain('<div>A<p>B</p><ul><li>C &amp; D</li></ul><script>alert(1)</script></div>')
  self.assertIn('A\nB',text);self.assertIn('• C & D',text);self.assertNotIn('alert',text)
 def test_every_original_xlsx_package_and_limitation_exactly_reconciled(self):
  headers,rows=imp.sheet_rows(ROOT/'public/data'/ (imp.BASENAME+'.xlsx'),1)
  limheaders,limits=imp.sheet_rows(ROOT/'public/data'/ (imp.BASENAME+'.xlsx'),2)
  self.assertEqual(headers,self.catalog['headers']);self.assertEqual(limheaders,self.catalog['limitationHeaders'])
  packages={p['id']:p for p in self.catalog['packages']};products={p['id']:p for p in self.catalog['products']}
  self.assertEqual(set(packages),{f[9] for n,f in rows});self.assertEqual(len(rows),10352)
  counts=collections.Counter();original_limits={n:f for n,f in limits}
  for n,f in rows:
   p=packages[f[9]];shard=self.details[products[p['productId']]['shard']];d=shard['packages'][p['id']]
   self.assertEqual(d['fields'],f);self.assertEqual(p['sourceRow'],n);self.assertEqual(p['productId'],f[8]);self.assertEqual(p['gtin'],f[6] or None);self.assertEqual(p['swissmedic'],f[5] or None)
   self.assertEqual(p['retail'],imp.cents(f[12]));self.assertEqual(p['factory'],imp.cents(f[11]))
   for link in p['limitations']:
    counts[link['row']]+=1;source=original_limits[link['row']];text=self.texts['limitations'][link['index']]
    self.assertEqual(source[14],p['id']);self.assertEqual(source[13],p['productId']);self.assertEqual(text['text'],source[3]);self.assertEqual(text['code'],source[4]);self.assertEqual(text['start'],imp.iso(source[8]));self.assertEqual(text['end'],imp.iso(source[9]))
   for lr in d['limitationRows']:self.assertEqual(lr['fields'],original_limits[lr['row']])
   self.assertEqual(len(d['fhirLimitations']),len(p['limitations']))
   self.assertTrue(all(a['bundleId']==products[p['productId']]['bundleId'] for a in d['authorizations']))
  self.assertEqual(len(counts),6340);self.assertTrue(all(v==1 for v in counts.values()))
 def test_complete_original_fhir_stream_and_independent_resource_controls(self):
  path=ROOT/'public/data'/(imp.BASENAME+'.ndjson.gz');h=hashlib.sha256();counts=collections.Counter();ids=collections.defaultdict(set);bundles=0
  with gzip.open(path,'rb') as f:
   for line in f:
    h.update(line);b=json.loads(line);bundles+=1
    for e in b['entry']:
     r=e['resource'];counts[r['resourceType']]+=1;ids[r['resourceType']].add(r['id'])
  self.assertEqual(h.hexdigest(),imp.PINS[imp.BASENAME+'.ndjson']);self.assertEqual(bundles,6749)
  self.assertEqual(dict(counts),self.report['stats']['fhirResources'])
  self.assertEqual({k:len(v) for k,v in ids.items()},self.report['stats']['fhirUniqueIds'])
  self.assertEqual(len(ids['RegulatedAuthorization']),24319);self.assertEqual(len(ids['ClinicalUseDefinition']),1687)
 def test_expected_gaps_are_explicit(self):
  s=self.report['stats'];self.assertEqual(s['lists'],{'SL':10064,'GGSL':143,'GGML':145});self.assertEqual(s['priceConflicts'],0);self.assertEqual(s['fhirLimitationLinks'],6340)
  self.assertEqual(s['missing'],{'gtin':87,'swissmedic':150,'pharmacode':10352,'ingredients':58,'atc':58,'retail':152,'factory':185})
  self.assertEqual(s['limitationWhitespaceNormalizedMismatchPackages'],24)
  self.assertEqual(s['limitationOnlyBulletFormattingDifferencePackages'],24)
if __name__=='__main__':unittest.main()
