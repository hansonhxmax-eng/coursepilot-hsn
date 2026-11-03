"""Collect visible USTSpace course-page snapshots after the owner logs in locally.
No passwords, request headers, cookies, API tokens or HAR files are exported.
Actual USTSpace compatibility requires a first-course check on the user's machine.
"""
import argparse,json,re,time,sys,shutil,itertools
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlparse,urlunparse,parse_qsl,urlencode,urljoin
from urllib.robotparser import RobotFileParser

KIND='ustspace-visible-snapshots'
CODE=re.compile(r'^[A-Z]{4}\d{4}[A-Z]?$')
REDACT_EMAIL=re.compile(r'(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',re.I)
class AccessStop(Exception):pass
class CourseUnavailable(Exception):pass

def utc():return datetime.now(timezone.utc).isoformat()
def codes_from(path):
 value=json.loads(Path(path).read_text(encoding='utf-8-sig'))
 rows=value.get('courseCodes',[]) if isinstance(value,dict) else value
 if not isinstance(rows,list):raise ValueError('courseCodes must be an array')
 codes=[];excluded=[]
 for raw in rows:
  code=re.sub(r'\s','',str(raw)).upper()
  if CODE.fullmatch(code):
   if code not in codes:codes.append(code)
  else:excluded.append(code)
 return codes,excluded

def official_url(url):
 p=urlparse(url)
 return p.scheme=='https' and (p.hostname=='ust.space' or (p.hostname or '').endswith('.ust.space')) and not p.username and not p.password

def source_url(url):
 if not official_url(url):raise AccessStop('Unexpected source host; collection stopped.')
 p=urlparse(url)
 return urlunparse((p.scheme,p.netloc,p.path,'','',''))

def derive_template(url,code):
 if not official_url(url):return None
 p=urlparse(url)
 allowed={'course','code','coursecode','subject','department','term','semester'}
 if any(k.lower() not in allowed for k,v in parse_qsl(p.query)):return None
 compact=code[:4]+code[4:]
 candidates=[(compact,'{course}'),(code[:4]+'%20'+code[4:],'{subject}%20{number}'),(code[:4]+'-'+code[4:],'{subject}-{number}'),(code[:4]+'/'+code[4:],'{subject}/{number}')]
 for pattern,replacement in candidates:
  if re.search(re.escape(pattern),url,re.I):return re.sub(re.escape(pattern),replacement,url,flags=re.I)
 return None

def render_template(template,code):
 return template.replace('{course}',code).replace('{subject}',code[:4]).replace('{number}',code[4:])

def page_has_code(text,code):
 return bool(re.search(r'(?<![A-Z0-9])'+code[:4]+r'[\s/-]*'+code[4:]+r'(?![A-Z0-9])',text,re.I))

def clean_visible(text):
 # Only rendered page text is collected. Hide email-like strings and obvious
 # inline credential fields in case a site unexpectedly renders them.
 text=REDACT_EMAIL.sub('[email removed]',text)
 lines=[line for line in text.splitlines() if not re.search(r'(?:authorization|access[_ -]?token|refresh[_ -]?token|password|cookie)\s*[:=]',line,re.I)]
 return '\n'.join(lines).strip()

def add_chunk(chunks,text):
 if not text or any(text in old for old in chunks):return chunks
 return [old for old in chunks if old not in text]+[text]

def check_access(page,status=None):
 status=status or getattr(page,'_collector_blocked_status',None)
 if status in (401,403,429):raise AccessStop(f'Access/rate-limit response {status}; no retries or bypass attempted.')
 if re.search(r'/(?:login|signin|sign-in|auth|register)(?:[/?#]|$)',page.url,re.I):raise AccessStop('Site returned to login; please authenticate yourself before restarting.')
 title=page.title()
 if re.search(r'just a moment|attention required|checking your browser|verify.*human',title,re.I):raise AccessStop('Browser challenge encountered; collection stopped.')

def visible_text(page,selector,code):
 loc=page.locator(selector).first
 if not loc.count():
  # When the site has no semantic main element, keep only the part after the
  # requested course heading, rather than the account/navigation header.
  raw=page.locator('body').inner_text()
  match=re.search(re.escape(code[:4])+r'\s*'+re.escape(code[4:]),raw,re.I)
  if not match:raise CourseUnavailable('Requested course code was not visible on this page.')
  raw=raw[match.start():]
 else:raw=loc.inner_text()
 if re.search(r'please (?:log|sign) in|log in to (?:view|read)|sign in to (?:view|read)|登入後.*(?:查看|閱讀)|登录后.*(?:查看|阅读)',raw,re.I):raise AccessStop('The site requires login to read this content.')
 if not page_has_code(raw,code):raise CourseUnavailable('Course page did not display the requested course code.')
 return clean_visible(raw)

def next_control(page,pattern):
 for role in ['button','link']:
  loc=page.get_by_role(role,name=pattern)
  for i in range(min(loc.count(),10)):
   candidate=loc.nth(i)
   if candidate.is_visible() and candidate.is_enabled() and candidate.get_attribute('aria-disabled')!='true':return candidate
 return None

def load_more(page,args):
 previous='';stable=0
 for _ in (range(args.max_scrolls) if args.max_scrolls else itertools.count()):
  check_access(page)
  button=next_control(page,re.compile(r'^(?:load more(?: reviews)?|show more reviews|more reviews|載入更多(?:評價)?|加载更多(?:评价)?|更多評價|更多评价)$',re.I))
  if button:button.click()
  else:page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
  page.wait_for_timeout(args.delay*1000)
  text=page.locator('body').inner_text()
  if text==previous:stable+=1
  else:stable=0
  previous=text
  if stable>=2:break

def collect_current(page,code,args):
 chunks=[];pages=0;seen=set()
 for index in (range(args.max_pages) if args.max_pages else itertools.count()):
  check_access(page)
  initial=visible_text(page,args.content_selector,code)
  if initial in seen:break
  seen.add(initial);chunks=add_chunk(chunks,initial)
  load_more(page,args)
  chunks=add_chunk(chunks,visible_text(page,args.content_selector,code));pages+=1
  button=next_control(page,re.compile(r'^(?:next(?: page)?|下一頁|下一页|下頁|下页)$',re.I))
  if not button:break
  button.click();page.wait_for_timeout(args.delay*1000)
 text='\n\n--- visible page snapshot ---\n\n'.join(chunks)
 return {'courseCode':code,'status':'captured','sourceUrl':source_url(page.url),'capturedAt':utc(),'text':text,'visiblePagesCaptured':pages,'completeness':'visible-content-only','note':'Rendered page evidence only; may include course descriptions and navigation. Website visibility and any optional limits mean this is not guaranteed to contain all reviews. No rating or syllabus tags were inferred.'}

def navigate_course(page,code,args,template):
 if template:
  target=render_template(template,code)
  if not official_url(target):raise AccessStop('Course template points outside USTSpace.')
  response=page.goto(target,wait_until='domcontentloaded',timeout=45000)
  page.wait_for_timeout(args.delay*1000);check_access(page,response.status if response else None);return
 if args.manual:
  input(f'Open the page for {code} in this browser yourself, then press Enter here (or Ctrl+C to stop): ')
  check_access(page);return
 response=page.goto('https://ust.space/review',wait_until='domcontentloaded',timeout=45000)
 page.wait_for_timeout(args.delay*1000);check_access(page,response.status if response else None)
 if args.search_selector:search=page.locator(args.search_selector).first
 else:
  search=page.get_by_role('searchbox').first
  if not search.count():search=page.get_by_placeholder(re.compile(r'search|搜尋|搜索|搜尋課程|搜索课程',re.I)).first
 if not search.count():raise CourseUnavailable('No known search control. Restart with --manual or a verified --search-selector; no routes were guessed.')
 search.fill(code);page.wait_for_timeout(args.delay*1000)
 pattern=re.compile(re.escape(code[:4])+r'\s*'+re.escape(code[4:]),re.I)
 link=page.get_by_role('link',name=pattern).first
 if not link.count():raise CourseUnavailable('Search did not expose a course link. No data was fabricated.')
 href=link.get_attribute('href')
 if href:
  target=urljoin(page.url,href)
  if not official_url(target):raise AccessStop('Search result points outside USTSpace.')
  response=page.goto(target,wait_until='domcontentloaded',timeout=45000)
  page.wait_for_timeout(args.delay*1000);check_access(page,response.status if response else None)
 else:link.click();page.wait_for_timeout(args.delay*1000);check_access(page)

def collect_courses(page,codes,anchor,args,template,robots,rows,excluded,output):
 for index,code in enumerate(codes):
  if not robots.can_fetch('CoursePilotResearchSnapshot',page.url if code==anchor else render_template(template,code) if template else 'https://ust.space/review'):
   raise AccessStop('robots.txt disallows the requested path; collection stopped.')
  try:
   if code!=anchor:navigate_course(page,code,args,template)
   if not robots.can_fetch('CoursePilotResearchSnapshot',page.url):raise AccessStop('robots.txt disallows the observed course path; collection stopped.')
   record=collect_current(page,code,args);rows[:]=[r for r in rows if r['courseCode']!=code];rows.append(record)
   print(code+': captured visible page evidence (not a verified review count).',flush=True)
  except AccessStop:raise
  except CourseUnavailable as e:
   rows[:]=[r for r in rows if r['courseCode']!=code];rows.append({'courseCode':code,'status':'unavailable','reason':str(e),'capturedAt':utc()});print(code+': unavailable; recorded without invented data.',flush=True)
  except Exception as e:
   rows[:]=[r for r in rows if r['courseCode']!=code];rows.append({'courseCode':code,'status':'failed','reason':type(e).__name__,'capturedAt':utc()});print(code+': failed ('+type(e).__name__+').',flush=True)
   raise AccessStop('Unexpected page error; partial results saved. Check website structure before retrying.')
  save(output,rows,excluded,None);time.sleep(args.delay)

def partition_rows(rows,max_bytes=8*1024*1024):
 parts=[];current=[];size=0
 for row in rows:
  n=len(json.dumps(row,ensure_ascii=False).encode('utf-8'))+2
  if current and size+n>max_bytes:parts.append(current);current=[];size=0
  current.append(row);size+=n
 if current:parts.append(current)
 return parts

def save(output,rows,excluded,stopped):
 document={'schemaVersion':1,'kind':KIND,'capturedAt':utc(),'courses':rows,'excludedCodes':excluded,'stoppedBecause':stopped,'capturedCount':sum(r['status']=='captured' for r in rows),'attemptedCount':len(rows),'completeness':'visible-content-only; not guaranteed complete reviews'}
 output.parent.mkdir(parents=True,exist_ok=True)
 parts=partition_rows(rows)
 if len(parts)>1:
  document['importParts']=[]
  for i,part in enumerate(parts,1):
   path=output.with_name(output.stem+f'.part-{i:03d}.json')
   value={**document,'courses':part,'capturedCount':sum(r['status']=='captured' for r in part),'attemptedCount':len(part)}
   value.pop('importParts',None)
   path.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
   document['importParts'].append(path.name)
 temporary=output.with_suffix('.tmp');temporary.write_text(json.dumps(document,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(output)

def resume_rows(output,allowed):
 if not output.exists():return []
 value=json.loads(output.read_text(encoding='utf-8-sig'))
 if not isinstance(value,dict) or value.get('schemaVersion')!=1 or value.get('kind')!=KIND or not isinstance(value.get('courses'),list):
  raise ValueError('Invalid resume file; original output is unchanged.')
 rows=value['courses'];seen=set()
 for row in rows:
  if not isinstance(row,dict) or row.get('courseCode') not in allowed or row.get('courseCode') in seen or row.get('status') not in ('captured','unavailable','failed'):
   raise ValueError('Unknown, duplicate or invalid resume record; original output is unchanged.')
  if row['status']=='captured' and (not isinstance(row.get('text'),str) or not row['text'].strip() or not official_url(row.get('sourceUrl',''))):
   raise ValueError('Invalid captured resume record; original output is unchanged.')
  seen.add(row['courseCode'])
 return rows

def pending_codes(codes,rows,retry_unavailable=False):
 done={r['courseCode'] for r in rows if r['status']=='captured' or r['status']=='unavailable' and not retry_unavailable}
 return [code for code in codes if code not in done]

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--courses',default='coursepilot-course-codes.json');ap.add_argument('--output',default='ustspace-snapshots.json');ap.add_argument('--profile',default='.ustspace-local-session')
 ap.add_argument('--limit',type=int,default=0,help='Optional course limit; 0 (default) processes the full supplied list.')
 ap.add_argument('--delay',type=float,default=4);ap.add_argument('--max-scrolls',type=int,default=0);ap.add_argument('--max-pages',type=int,default=0)
 ap.add_argument('--resume',action='store_true');ap.add_argument('--retry-unavailable',action='store_true')
 ap.add_argument('--content-selector',default='main');ap.add_argument('--search-selector');ap.add_argument('--url-template');ap.add_argument('--manual',action='store_true');ap.add_argument('--channel',default=None)
 args=ap.parse_args()
 if args.limit<0 or args.delay<3 or args.max_pages<0 or args.max_scrolls<0:ap.error('Limits must be non-negative (0 means unlimited); delay >=3 seconds.')
 codes,excluded=codes_from(args.courses)
 if not codes:ap.error('No unambiguous course codes were supplied.')
 output=Path(args.output).resolve();stopped=None
 try:rows=resume_rows(output,set(codes)) if args.resume else []
 except (ValueError,OSError) as e:ap.error(str(e))
 anchor=codes[0];total=len(codes);codes=pending_codes(codes,rows,args.retry_unavailable)
 if args.limit:codes=codes[:args.limit]
 if output.exists():
  backup=output.with_name(output.stem+'.backup-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+output.suffix)
  shutil.copy2(output,backup);print('Previous output copied to '+backup.name,flush=True)
 print(f'{total} courses; {len(codes)} pending; {len(rows)} previous record(s) retained.',flush=True)
 if not codes:print('No pending courses. Existing output retained.');return 0
 print('Only collect pages your account may normally access, in accordance with the site rules. This tool does not bypass access controls.',flush=True)
 from playwright.sync_api import sync_playwright
 with sync_playwright() as p:
  options={'user_data_dir':str(Path(args.profile).resolve()),'headless':False,'accept_downloads':False,'viewport':{'width':1280,'height':900}}
  if args.channel:options['channel']=args.channel
  context=p.chromium.launch_persistent_context(**options)
  page=context.pages[0] if context.pages else context.new_page()
  try:
   page.goto('https://ust.space/review',wait_until='domcontentloaded',timeout=45000)
   print('\nIn the opened browser, log in yourself. Do not paste credentials into this terminal or chat.',flush=True)
   input(f'Open the actual review-detail page for {anchor}, then press Enter here: ')
   check_access(page);visible_text(page,args.content_selector,anchor)
   def observe(response):
    if official_url(response.url) and response.status in (401,403,429) and response.request.resource_type in ('document','xhr','fetch'):
     page._collector_blocked_status=response.status
   page.on('response',observe)
   # Read robots through the same normal browser context, without exporting auth.
   robots=RobotFileParser();response=context.request.get('https://ust.space/robots.txt',timeout=20000)
   if response.status==200:robots.parse(response.text().splitlines())
   elif response.status==404:robots.parse([])
   else:raise AccessStop(f'Cannot establish robots policy (HTTP {response.status}); automatic collection stopped.')
   template=args.url_template or (None if args.manual else derive_template(page.url,anchor))
   if template and not ('{course}' in template or '{subject}' in template and '{number}' in template):raise ValueError('URL template must contain {course}, or both {subject} and {number}.')
   if not template and not args.manual:print('No course route template was observed; subsequent courses will use visible search controls. If unavailable, use --manual.',flush=True)
   collect_courses(page,codes,anchor,args,template,robots,rows,excluded,output)
  except KeyboardInterrupt:stopped='Stopped by user.'
  except (AccessStop,CourseUnavailable,ValueError) as e:stopped=str(e);print('STOP: '+stopped,flush=True)
  except Exception as e:stopped='Setup/navigation failed: '+type(e).__name__;print('STOP: '+stopped,flush=True)
  finally:
   save(output,rows,excluded,stopped);context.close()
 print(f'Saved {sum(r["status"]=="captured" for r in rows)}/{len(rows)} attempted course snapshots to {output.name}.',flush=True)
 if len(partition_rows(rows))>1:print('Large export: import the generated .part-001.json, .part-002.json, etc. separately; the complete export is also retained.',flush=True)
 if stopped:return 2
 return 0
if __name__=='__main__':sys.exit(main())
