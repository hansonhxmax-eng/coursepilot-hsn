"""Simulated course-page compatibility test, NOT a real USTSpace login test."""
import importlib.util,os,json,tempfile
from urllib.robotparser import RobotFileParser
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
from playwright.sync_api import sync_playwright
spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'tools/ustspace/collect.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
html='''<!doctype html><title>Mock course page — NOT REAL USTSpace</title><main><h1>ACCT 2010</h1><p id="review">TEST FIXTURE review page one. email@example.test</p><button onclick="document.getElementById('review').textContent+=' Additional TEST FIXTURE review.';this.remove()">Load more reviews</button><button id="next" onclick="document.getElementById('review').textContent='TEST FIXTURE review page two.';this.disabled=true">Next</button></main>'''
with sync_playwright() as p:
 options={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**options);context=browser.new_context()
 context.route('https://ust.space/**',lambda route:route.fulfill(status=200,content_type='text/html',body=html))
 page=context.new_page();page.goto('https://ust.space/review/ACCT2010')
 record=m.collect_current(page,'ACCT2010',SimpleNamespace(content_selector='main',max_pages=3,max_scrolls=3,delay=.01))
 assert 'page one' in record['text'] and 'page two' in record['text'] and 'Additional TEST FIXTURE review' in record['text']
 assert record['visiblePagesCaptured']==2
 assert 'email@example.test' not in record['text']
 assert record['completeness']=='visible-content-only'
 try:m.collect_current(page,'COMP1021',SimpleNamespace(content_selector='main',max_pages=1,max_scrolls=1,delay=.01))
 except m.CourseUnavailable:pass
 else:raise AssertionError('Wrong course must not be captured')
 page._collector_blocked_status=429
 try:m.collect_current(page,'ACCT2010',SimpleNamespace(content_selector='main',max_pages=1,max_scrolls=1,delay=.01))
 except m.AccessStop:pass
 else:raise AssertionError('Rate limit must stop capture')
 # Unlimited pagination/loading must retain content beyond the old text cap.
 page._collector_blocked_status=None
 context.unroute('https://ust.space/**')
 large="""<title>Fixture</title><main><h1>MATH1013</h1><p id='text'>page 1</p><button onclick="document.getElementById('text').textContent+='x'.repeat(260000);this.remove()">Load more reviews</button><button onclick="document.getElementById('text').textContent='final page';this.remove()">Next</button></main>"""
 context.route('https://ust.space/**',lambda route:route.fulfill(status=200,content_type='text/html',body=large))
 page.goto('https://ust.space/review/MATH1013')
 args=SimpleNamespace(content_selector='main',max_pages=0,max_scrolls=0,delay=.001,manual=False)
 record=m.collect_current(page,'MATH1013',args)
 assert len(record['text'])>260000 and 'final page' in record['text'] and record['visiblePagesCaptured']==2
 # Real browser navigation through 6 unavailable courses must reach MATH,
 # while retaining the owner's reported 8 captured + 6 unavailable records.
 context.unroute('https://ust.space/**')
 def fixture(route):
  code=route.request.url.rsplit('/',1)[-1]
  text=code+' fixture review' if code.startswith('MATH') else 'Course not found'
  route.fulfill(status=200,content_type='text/html',body='<title>Fixture</title><main>'+text+'</main>')
 context.route('https://ust.space/**',fixture)
 retained=[{'courseCode':'ACCT'+str(2000+i),'status':'captured','text':'retained fixture','sourceUrl':'https://ust.space/review/ACCT'+str(2000+i)} for i in range(8)]
 retained += [{'courseCode':'ACCT'+str(2000+i),'status':'unavailable'} for i in range(8,14)]
 pending=['COMP'+str(5000+i) for i in range(6)]+['MATH1013']
 robots=RobotFileParser();robots.parse([])
 with tempfile.TemporaryDirectory() as t, patch.object(m.time,'sleep'):
  output=Path(t)/'out.json';m.save(output,retained,[],None)
  rows=m.resume_rows(output,{r['courseCode'] for r in retained}|set(pending))
  m.collect_courses(page,pending,'ACCT2000',args,'https://ust.space/review/{course}',robots,rows,[],output)
  saved=json.loads(output.read_text())['courses']
  assert saved[:14]==retained and len(saved)==21
  assert all(r['status']=='unavailable' for r in saved[14:20])
  assert saved[-1]['courseCode']=='MATH1013' and saved[-1]['status']=='captured'
  page._collector_blocked_status=429
  try:m.collect_courses(page,['MATH1014'],'ACCT2000',args,'https://ust.space/review/{course}',robots,rows,[],output)
  except m.AccessStop:pass
  else:raise AssertionError('Access denial must still stop collection')
 print('PASS: unlimited loading and pagination preserve >260k characters; six unavailable courses continue to MATH; 14 previous records retained; 429 stops.')
 browser.close()
 print('PASS: MOCK browser: visible load-more and next-page capture, course matching, redaction, explicit incompleteness, rate-limit stop. No real USTSpace request or login performed.')
