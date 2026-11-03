"""Automatic login-to-batch workflow on local fixtures; no real account requests."""
import importlib.util,json,os,tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from playwright.sync_api import sync_playwright

spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'tools/ustspace/collect.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
codes=['ACCT2010','COMP1021','MATH1013','FINA1000']
args=SimpleNamespace(content_selector='main',max_pages=0,max_scrolls=0,delay=.001,manual=False,url_template=None,search_selector=None)
checks=[]
def passed(name):checks.append(name);print('PASS:',name,flush=True)

def routes(context,deny_robots=False,deny_course=None,loading_course=False):
 # Browser routes do not intercept APIRequestContext; stub its one robots
 # request separately so this workflow test cannot contact the real site.
 def robots(url,**kwargs):
  assert url=='https://ust.space/robots.txt'
  return SimpleNamespace(status=200,text=lambda:'User-agent: *\nDisallow: /review/' if deny_robots else 'User-agent: *\nAllow: /')
 request_patch=patch.object(context.request,'get',side_effect=robots)
 request_patch.start();context.on('close',lambda *_:request_patch.stop())
 def respond(route):
  path=route.request.url.split('ust.space',1)[1]
  if path=='/robots.txt':
   route.fulfill(status=200,content_type='text/plain',body='User-agent: *\nDisallow: /review/' if deny_robots else 'User-agent: *\nAllow: /');return
  if path=='/login':
   body="""<h1>Fixture login</h1><button onclick="location.href='/review'">Sign in</button><script>setTimeout(()=>document.querySelector('button').click(),100)</script>"""
  elif path=='/review':
   body="""<h1>Course catalog</h1><main><h2>MATH1013</h2><a id='course' href='/review/MATH1013' target='_blank'>Open course</a></main><script>setTimeout(()=>document.querySelector('#course').click(),1300)</script>"""
  else:
   code=path.rsplit('/',1)[-1].split('?')[0]
   if code==deny_course:route.fulfill(status=429,content_type='text/html',body='<h1>Rate limit</h1>');return
   body='<h1>Course not found</h1>' if code=='COMP1021' else f'<h1>{code}</h1><p>TEST FIXTURE visible course page evidence.</p>'
   body='<main>'+body+'</main>'
   if loading_course and code=='MATH1013':
    # The URL already names a course while its SPA body is still loading.
    # This previously raised CourseUnavailable out of the login wait loop.
    body=body.removeprefix('<main>').removesuffix('</main>').replace('<h1>MATH1013</h1>','<h1>MATH / 1013</h1>')
    body="<div>Loading course page...</div><script>setTimeout(()=>{document.body.innerHTML="+json.dumps(body)+"},1500)</script>"
  route.fulfill(status=200,content_type='text/html',body='<title>Course fixture</title>'+body)
 context.route('https://ust.space/**',respond)

with sync_playwright() as p:
 options={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 browser=p.chromium.launch(**options)
 with tempfile.TemporaryDirectory() as t, patch('builtins.input',side_effect=AssertionError('Automatic mode must not request terminal input')), patch.object(m.time,'sleep'):
  # A simulated login and a course click open a new tab. Start on the third
  # listed course; the first course must still be navigated and captured.
  context=browser.new_context();routes(context,loading_course=True)
  page=context.new_page();page.goto('https://ust.space/login')
  output=Path(t)/'all.json';rows=[]
  m.start_collection(context,codes,codes,args,rows,[],output)
  saved=json.loads(output.read_text())['courses']
  assert len(context.pages)==2
  assert len(saved)==len(codes) and len({r['courseCode'] for r in saved})==len(codes)
  assert saved[0]['courseCode']=='MATH1013' and saved[0]['status']=='captured'
  assert next(r for r in saved if r['courseCode']=='ACCT2010')['text'].startswith('ACCT2010')
  assert next(r for r in saved if r['courseCode']=='COMP1021')['status']=='unavailable'
  assert saved[-1]['courseCode']=='FINA1000' and saved[-1]['status']=='captured'
  passed('Login, delayed course content and a new tab automatically reach the full batch without stdin')
  context.close()

  context=browser.new_context();routes(context)
  page=context.new_page();page.goto('https://ust.space/review/MATH1013')
  old={'courseCode':'MATH1013','status':'captured','text':'Previously captured review evidence must be retained.','sourceUrl':'https://ust.space/review/MATH1013'}
  rows=[old.copy()];pending=m.pending_codes(codes,rows)
  m.start_collection(context,codes,pending,args,rows,[],output)
  assert next(r for r in rows if r['courseCode']=='MATH1013')==old and len(rows)==4
  passed('Already captured course can be used as the automatic test; its saved evidence remains unchanged')
  context.close()

  context=browser.new_context();routes(context)
  page=context.new_page();page.goto('https://ust.space/review/MATH1013')
  rows=[];race_output=Path(t)/'race.json';original_collect=m.collect_current
  calls=[]
  def course_changes_before_first_read(page,code,args):
   calls.append(code)
   if len(calls)==1:
    assert not rows and not race_output.exists()
    raise m.CourseUnavailable('Requested course code was not visible on this page.')
   return original_collect(page,code,args)
  with patch.object(m,'collect_current',side_effect=course_changes_before_first_read):
   m.start_collection(context,codes,codes,args,rows,[],race_output)
  assert calls[:2]==['MATH1013','MATH1013']
  assert len(rows)==len(codes) and len({r['courseCode'] for r in rows})==len(codes)
  assert json.loads(race_output.read_text())['courses']==rows
  passed('A disappearing course at the first test read returns to waiting, then completes the batch without losing records')
  context.close()

  context=browser.new_context();routes(context,deny_robots=True)
  page=context.new_page();page.goto('https://ust.space/review/MATH1013')
  rows=[]
  try:m.start_collection(context,codes,codes,args,rows,[],output)
  except m.AccessStop as e:assert 'robots' in str(e)
  else:raise AssertionError('Robots denial must stop before test capture')
  assert not rows
  passed('Robots denial stops automatic capture before collecting the test course')
  context.close()

  context=browser.new_context();routes(context,deny_course='ACCT2010')
  page=context.new_page();page.goto('https://ust.space/review/MATH1013')
  rows=[]
  try:m.start_collection(context,codes,codes,args,rows,[],output)
  except m.AccessStop as e:assert '429' in str(e)
  else:raise AssertionError('HTTP 429 must stop the automatic batch')
  assert [r['courseCode'] for r in rows]==['MATH1013']
  assert json.loads(output.read_text())['courses']==rows
  passed('Rate limit after a successful test stops the batch and keeps the saved test result')
  context.close()
 browser.close()
print(f'{len(checks)} automatic workflow browser checks passed. Only local mock pages were used.')
