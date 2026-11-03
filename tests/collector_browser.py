"""Simulated course-page compatibility test, NOT a real USTSpace login test."""
import importlib.util,os,json
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
 browser.close()
 print('PASS: MOCK browser: visible load-more and next-page capture, course matching, redaction, explicit incompleteness, rate-limit stop. No real USTSpace request or login performed.')
