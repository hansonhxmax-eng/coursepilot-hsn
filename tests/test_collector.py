"""Offline helper tests; no USTSpace account or real review requests."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'tools/ustspace/collect.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CollectorTests(unittest.TestCase):
 def test_course_codes_deduplicate_and_flag_unclear_ocr(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'codes.json';p.write_text(json.dumps({'courseCodes':['ACCT 2010','ACCT2010','AISC1000B','ACCT69704']}))
   codes,excluded=m.codes_from(p);self.assertEqual(codes,['ACCT2010','AISC1000B']);self.assertEqual(excluded,['ACCT69704'])
 def test_observed_templates_preserve_route_shape(self):
  for url,expected in [('https://ust.space/review/ACCT2010','https://ust.space/review/COMP1021'),('https://ust.space/review/ACCT/2010','https://ust.space/review/COMP/1021'),('https://ust.space/review/ACCT%202010','https://ust.space/review/COMP%201021')]:
   template=m.derive_template(url,'ACCT2010');self.assertEqual(m.render_template(template,'COMP1021'),expected)
 def test_does_not_guess_numeric_routes_or_reuse_token_queries(self):
  self.assertIsNone(m.derive_template('https://ust.space/review/12345','ACCT2010'))
  self.assertIsNone(m.derive_template('https://ust.space/review/ACCT2010?token=private','ACCT2010'))
 def test_source_urls_drop_queries_and_reject_outside_hosts(self):
  self.assertEqual(m.source_url('https://ust.space/review/ACCT2010?session=private#x'),'https://ust.space/review/ACCT2010')
  for url in ['http://ust.space/review','https://ust.space.evil.test/review','https://u:p@ust.space/review']:
   with self.assertRaises(m.AccessStop):m.source_url(url)
 def test_course_match_has_boundaries(self):
  self.assertTrue(m.page_has_code('ACCT 2010 — real heading','ACCT2010'))
  self.assertFalse(m.page_has_code('ACCT 2010A','ACCT2010'))
 def test_visible_text_redacts_email_and_inline_credentials(self):
  text=m.clean_visible('Student review\na@example.test\naccess_token: secret\nNormal comment')
  self.assertIn('[email removed]',text);self.assertNotIn('secret',text);self.assertIn('Normal comment',text)
 def test_growing_snapshots_do_not_repeat_whole_old_page(self):
  self.assertEqual(m.add_chunk(['old text'],'new old text expanded'),['new old text expanded'])
  self.assertEqual(m.add_chunk(['old text'],'old text'),['old text'])
 def test_partial_results_are_saved_with_explicit_incomplete_status(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'out.json';m.save(path,[{'courseCode':'ACCT2010','status':'captured'}],[],'Rate limit')
   x=json.loads(path.read_text());self.assertEqual(x['kind'],m.KIND);self.assertEqual(x['capturedCount'],1);self.assertEqual(x['stoppedBecause'],'Rate limit');self.assertIn('not guaranteed',x['completeness'])
 def test_downloadable_zip_contains_current_code_and_no_login_profile(self):
  import zipfile
  root=Path(__file__).parents[1]
  with zipfile.ZipFile(root/'public/collector/CoursePilot-collector.zip') as z:
   self.assertEqual(z.read('CoursePilot-collector/collect.py'),(root/'tools/ustspace/collect.py').read_bytes())
   self.assertFalse(any('session' in n or 'cookie' in n for n in z.namelist()))
 def test_large_exports_partition_without_losing_courses(self):
  rows=[{'courseCode':'ACCT2010','status':'captured','text':'a'*100},{'courseCode':'COMP1021','status':'captured','text':'b'*100}]
  parts=m.partition_rows(rows,max_bytes=180)
  self.assertEqual(len(parts),2);self.assertEqual([r['courseCode'] for part in parts for r in part],['ACCT2010','COMP1021'])
 def test_access_rejections_stop_without_retry(self):
  class Page:
   url='https://ust.space/review/ACCT2010'
   def title(self):return 'Course review'
  for status in [401,403,429]:
   with self.assertRaises(m.AccessStop):m.check_access(Page(),status)
  page=Page();page._collector_blocked_status=429
  with self.assertRaises(m.AccessStop):m.check_access(page)
if __name__=='__main__':unittest.main(verbosity=2)
