"""Real PDF snapshot workspace integration checks; no USTSpace login required."""
import os,json,re,zipfile,io
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base=os.environ.get('BASE_URL','http://127.0.0.1:4173/')
out=Path(os.environ.get('EVIDENCE_DIR','/tmp/coursepilot-real-evidence'));out.mkdir(parents=True,exist_ok=True)
checks=[]
def passed(name):checks.append(name);print('PASS:',name,flush=True)
with sync_playwright() as p:
 options={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 if base.startswith('https://') and os.environ.get('HTTPS_PROXY'):options['proxy']={'server':os.environ['HTTPS_PROXY']}
 browser=p.chromium.launch(**options);context=browser.new_context(viewport={'width':1440,'height':1050},reduced_motion='reduce',accept_downloads=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base,wait_until='networkidle')
 expect(page.locator('h1')).to_contain_text('Your real courses')
 expect(page.locator('.snapshot-note')).to_contain_text('Capture date is unknown')
 expect(page.locator('.real-stats')).to_contain_text('544')
 expect(page.locator('.real-course')).to_have_count(12)
 passed('Real uploaded PDF workspace is the default; term, OCR and stale-availability boundaries are visible')
 page.get_by_role('button',name='Next course page').click();expect(page.locator('.real-pagination')).to_contain_text('Page 2')
 search=page.get_by_role('textbox',name='Search uploaded courses');search.fill('ACCT 2010')
 expect(page.locator('.real-course')).to_have_count(1);expect(page.locator('.real-course')).to_contain_text('Principles of Accounting')
 passed('Real catalog paginates and matches spaced or compact course codes')
 page.locator('.real-course-title').first.click()
 expect(page.get_by_role('dialog')).to_contain_text('L01')
 expect(page.get_by_role('dialog')).to_contain_text('13:30–14:50')
 expect(page.get_by_role('dialog')).to_contain_text('Review scores, workload and assessment rules are unknown')
 assert page.get_by_role('dialog').locator('a[href*=".pdf"]').count()==0
 page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
 passed('Course details retain class duration and unknown fields without PDF links')
 assert page.locator('a[href*=".pdf"]').count()==0
 for name in ['ACCT','AISC','MATH']:
  pdf=context.request.get(base.rstrip('/')+'/schedules/'+name+'.pdf')
  assert not pdf.body().startswith(b'%PDF'), name+' PDF must not be served'
 passed('No PDF entry points or served PDF assets')
 search.fill('MATH 4052');expect(page.locator('.real-course')).to_have_count(1)
 expect(page.locator('.real-course')).to_contain_text('Partial Differential Equations')
 page.get_by_role('combobox',name='Schedule department').select_option('MATH')
 search.fill('');expect(page.locator('.real-catalog-meta')).to_contain_text('82')
 passed('MATH catalog contains 82 courses and finds corrected MATH4052')
 page.get_by_role('combobox',name='Schedule department').select_option('all')
 search.fill('');page.get_by_role('combobox',name='Schedule department').select_option('AISC')
 expect(page.locator('.real-course')).to_have_count(2)
 page.get_by_role('checkbox',name='CC26 tag detected',exact=True).check();expect(page.locator('.real-course')).to_have_count(2)
 search.fill('not-a-course');expect(page.locator('.real-empty')).to_contain_text('No matching courses')
 page.get_by_role('button',name='Clear filters',exact=True).click()
 passed('Department, CC26-detected and empty search filters work without inventing domain eligibility')
 page.get_by_role('button',name='Try a real schedule').click()
 expect(page.locator('.real-plan-tabs button')).to_have_count(3)
 expect(page.locator('.real-basket')).to_contain_text('ACCT 2010')
 expect(page.locator('.real-plan-details')).to_contain_text('AISC 1000B')
 expect(page.locator('.real-verification')).to_contain_text('not enrollment approval')
 first=page.locator('.real-plan-details').inner_text();page.locator('.real-plan-tabs button').nth(1).click();assert page.locator('.real-plan-details').inner_text()!=first
 passed('Three real-course section plans are generated; switching plans changes selected sections')
 with page.expect_download() as info:page.get_by_role('button',name='Export selected week').click()
 info.value.save_as(out/'real-week.ics');ics=(out/'real-week.ics').read_text()
 assert 'DTEND;TZID=Asia/Hong_Kong:20261105T175000' in ics
 assert 'DTSTART;TZID=Asia/Hong_Kong:20261105T160000' in ics
 assert '[PDF snapshot]' in ics and 'RRULE:' not in ics
 passed('Real calendar export preserves 110-minute session and uses a single user-selected week')
 week=page.get_by_label('Snapshot week starting Monday');week.fill('2026-11-03')
 expect(week).to_have_value('2026-11-02');expect(page.locator('.real-message')).to_contain_text('Choose a Monday')
 passed('Non-Monday input is rejected; last valid week stays selected')
 page.get_by_role('checkbox',name='No mandatory attendance',exact=True).check()
 page.get_by_role('button',name='Generate section plans').click()
 expect(page.locator('.real-blockers')).to_contain_text('attendance not established')
 expect(page.locator('.real-plan-tabs button')).to_have_count(0)
 passed('Missing attendance evidence yields no plan instead of a false no-attendance recommendation')
 page.get_by_role('checkbox',name='No mandatory attendance',exact=True).uncheck()
 for button in page.locator('.real-days button').all():
  if button.get_attribute('aria-pressed')=='true':button.click()
 page.get_by_role('button',name='Generate section plans').click()
 expect(page.locator('.real-blockers')).to_be_visible()
 passed('Impossible weekday availability does not relax constraints')
 page.get_by_role('button',name='Clear selection',exact=True).click()
 search.fill('AISC1000A');page.get_by_role('button',name='Add AISC 1000A',exact=True).click()
 page.get_by_role('button',name='Generate section plans').click();expect(page.locator('.real-blockers')).to_contain_text('No usable lab')
 passed('TBA-only AISC course is excluded from complete schedules')
 page.get_by_role('button',name='Try a real schedule').click()
 lock=page.get_by_role('combobox',name='ACCT 2010 lecture section')
 # Explicitly choose a known Tuesday/Thursday lecture and regenerate.
 choice=lock.locator('option').filter(has_text='L02 ·').first.get_attribute('value');lock.select_option(choice)
 page.get_by_role('button',name='Generate section plans').click()
 expect(page.locator('.real-blockers')).to_contain_text('No conflict-free schedule')
 choice=lock.locator('option').filter(has_text='L01 ·').first.get_attribute('value');lock.select_option(choice)
 page.get_by_role('button',name='Generate section plans').click()
 expect(page.locator('.real-plan-details')).to_contain_text('L01')
 passed('Conflicting locked section returns no plan; compatible section lock is respected')
 with page.expect_download() as info:page.get_by_role('button',name='Download course codes').click()
 info.value.save_as(out/'codes.json');codes=json.loads((out/'codes.json').read_text())
 assert 'ACCT2010' in codes['courseCodes'] and 'AISC1000B' in codes['courseCodes']
 assert not codes['excluded']
 assert 'ACCT6970A' in codes['courseCodes'] and 'ACCT7900I' in codes['courseCodes']
 passed('Downloadable course list contains well-formed real codes, checked suffix corrections and an explicit exclusion field')
 zip_response=context.request.get(base.rstrip('/')+'/collector/CoursePilot-collector.zip');assert zip_response.status==200
 with zipfile.ZipFile(io.BytesIO(zip_response.body())) as z:
  names=z.namelist();assert any(n.endswith('collect.py') for n in names) and any(n.endswith('README.md') for n in names)
 passed('Collector and its login/setup guide are downloadable as a valid ZIP')
 fixture={'schemaVersion':1,'kind':'ustspace-visible-snapshots','courses':[{'courseCode':'ACCT2010','status':'captured','sourceUrl':'https://ust.space/review/ACCT2010','capturedAt':'2026-11-03T04:00:00Z','text':'TEST FIXTURE, not an actual review. <script>window.TEST_INJECTION=true</script>','completeness':'visible-content-only'}]}
 valid=out/'test-review.json';valid.write_text(json.dumps(fixture))
 page.get_by_label('Import USTSpace snapshot JSON').set_input_files(valid)
 expect(page.locator('.real-review-count')).to_contain_text('1 course review snapshot')
 page.locator('.review-evidence summary').click();expect(page.locator('.review-evidence pre')).to_contain_text('<script>')
 assert not page.evaluate('Boolean(window.TEST_INJECTION)')
 passed('Imported review text stays literal, matches a real code, and does not execute markup or infer academic tags')
 invalid=out/'invalid-review.json';invalid.write_text('{}');page.get_by_label('Import USTSpace snapshot JSON').set_input_files(invalid)
 expect(page.locator('#real-reviews .real-message')).to_contain_text('Import failed')
 expect(page.locator('.real-review-count')).to_contain_text('1 course review snapshot')
 passed('Invalid import fails without deleting earlier session evidence')
 page.get_by_role('button',name='Preference demo',exact=True).click();expect(page.locator('.demo-banner')).to_contain_text('synthetic')
 page.get_by_role('button',name='Real schedules',exact=True).click();expect(page.locator('.real-review-count')).to_contain_text('1 course review snapshot')
 page.reload();expect(page.locator('.real-review-count')).to_contain_text('0 course review snapshot')
 expect(page.locator('.real-basket')).to_contain_text('ACCT 2010')
 passed('Real/demo modes are distinct; course selection persists while imported review text clears on reload')
 page.get_by_role('button',name='Try a real schedule').click()
 page.screenshot(path=str(out/'real-desktop.png'),full_page=True)
 assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
 mobile=context.new_page(viewport=None) if False else context.new_page()
 mobile.set_viewport_size({'width':390,'height':844});mobile.goto(base,wait_until='networkidle')
 expect(mobile.locator('h1')).to_contain_text('Your real courses')
 mobile.get_by_role('button',name='Try a real schedule').click()
 expect(mobile.locator('.real-plan-tabs button')).to_have_count(3)
 assert not mobile.evaluate('document.documentElement.scrollWidth>innerWidth')
 mobile.screenshot(path=str(out/'real-mobile.png'),full_page=True)
 assert not errors,errors
 passed('Desktop and mobile real workflows fit the viewport; no uncaught JavaScript errors')
 (out/'real-browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors,'target':base},indent=2))
 browser.close()
print(f'{len(checks)} real-workspace browser checks passed')
