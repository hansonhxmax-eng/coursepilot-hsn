"""Optional browser integration test: pip install playwright; python tests/browser_smoke.py.
Start npm run dev first. Set BASE_URL and CHROMIUM_PATH when needed.
"""
import os, json, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
out=Path(os.environ.get('EVIDENCE_DIR','/tmp/coursepilot-evidence'))
out.mkdir(parents=True,exist_ok=True)
checks=[]
def passed(name):
 checks.append(name)
 print('PASS:',name)
with sync_playwright() as p:
 options={'headless':True,'args':['--no-sandbox']}
 if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 if os.environ.get('BASE_URL','').startswith('https://') and os.environ.get('HTTPS_PROXY'):options['proxy']={'server':os.environ['HTTPS_PROXY']}
 browser=p.chromium.launch(**options)
 context=browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce',accept_downloads=True)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('BASE_URL','http://127.0.0.1:5173/'),wait_until='networkidle')
 page.get_by_role('button',name='Preference demo',exact=True).click()
 expect(page.locator('.plan-tab')).to_have_count(3)
 expect(page.locator('.course-row')).to_have_count(3)
 assert 'simulated' in page.locator('.demo-banner').inner_text()
 passed('Initial dashboard: 3 plans, 3 courses, explicit demo disclosure')
 initial=page.locator('.course-row-main').all_text_contents()
 page.locator('.plan-tab').nth(1).click()
 assert page.locator('.course-row-main').all_text_contents()!=initial
 passed('Switching Plan B changes the course list and selected timetable')
 page.get_by_role('button',name='Export .ics').click()
 with page.expect_download() as info:page.get_by_role('button',name='Export .ics').click()
 download=info.value;download.save_as(out/'plan.ics');ics=(out/'plan.ics').read_text()
 assert ics.count('BEGIN:VEVENT')==6
 assert 'DTSTART;TZID=Asia/Hong_Kong:202702' in ics
 assert 'RRULE:FREQ=WEEKLY;COUNT=12' in ics
 assert '[DEMO]' in ics
 passed('Calendar export: 6 recurring sessions with explicit demo titles and Hong Kong timezone')
 page.get_by_role('button',name='All 5 scenarios').click()
 expect(page.get_by_role('dialog')).to_be_visible()
 page.keyboard.press('Escape');expect(page.get_by_role('dialog')).to_have_count(0)
 passed('Dialog opens, closes with Escape, and returns focus')
 for index in range(5):
  page.get_by_role('button',name='All 5 scenarios').click()
  page.locator('.scenario-list button').nth(index).click()
  expect(page.locator('.plan-tab')).to_have_count(3)
  expected=2 if index in (2,4) else 3
  expect(page.locator('.course-row')).to_have_count(expected)
  passed(f'Reviewer scenario {index+1}: generated 3 plans and {expected} courses')
 q=page.get_by_role('textbox',name='Describe your ideal semester')
 q.fill('Write me a poem');page.get_by_role('button',name='Apply request').click()
 expect(page.locator('.query-note')).to_contain_text('could not map')
 passed('Unsupported natural language shows a clear limitation')
 q.fill('推荐2门艺术课，不要小测，不要早课，不要周五');page.get_by_role('button',name='Apply request').click()
 expect(page.locator('.checked-label')).to_contain_text('Update pending')
 page.get_by_role('button',name='Generate my plans').click()
 expect(page.locator('.course-row')).to_have_count(2)
 assert not page.locator('.day-buttons button').nth(4).get_attribute('aria-pressed')=='true'
 passed('Chinese supported phrases update visible filters; Generate applies them')
 for b in page.locator('.day-buttons button').all():
  if b.get_attribute('aria-pressed')=='true':b.click()
 page.get_by_role('button',name='Generate my plans').click()
 expect(page.locator('.empty-state')).to_contain_text('No plan fits every constraint')
 expect(page.locator('.plan-tab')).to_have_count(0)
 page.get_by_role('button',name='Try the balanced sample').click()
 expect(page.locator('.plan-tab')).to_have_count(3)
 passed('Impossible availability returns no plan; recovery restores valid plans')
 page.get_by_role('button',name='Demo catalog',exact=True).click()
 expect(page.locator('.catalog-card')).to_have_count(30)
 field=page.get_by_role('textbox',name='Search courses');field.fill('impossible string')
 expect(page.locator('.empty-state')).to_contain_text('No courses found')
 page.get_by_role('button',name='Clear filters').click()
 page.get_by_role('combobox',name='Filter by domain').select_option('SUS')
 expect(page.locator('.catalog-card')).to_have_count(5)
 page.get_by_role('combobox',name='Filter by domain').select_option('all')
 field.fill('HUMA1001');expect(page.locator('.catalog-card')).to_have_count(1)
 page.get_by_role('button',name='Watch HUMA1001',exact=True).click()
 passed('Catalog: search, empty state, domain filter and bookmarking work')
 page.reload();page.get_by_role('button',name='Demo watchlist',exact=False).click()
 assert 'HUMA1001' in page.locator('.watch-layout').inner_text()
 page.get_by_role('button',name='Simulate seat update').click()
 expect(page.locator('.update-item')).to_have_count(1)
 expect(page.locator('.update-item')).to_contain_text('waitlist 28 → 23')
 passed('Watchlist persists on reload; simulation updates seats and emits an in-app notification')
 page.get_by_role('button',name='Demo activity',exact=True).click()
 expect(page.locator('.activity')).to_contain_text('SIMULATED update')
 expect(page.locator('.audit')).to_contain_text('Stale source record')
 passed('Activity trail records simulated updates and shows exclusion reasons')
 page.get_by_role('navigation').get_by_role('button',name='Official sources',exact=True).click()
 expect(page.locator('h1')).to_contain_text('one click away')
 for name,url in [('Open USTSpace reviews','https://ust.space/review'),('Open HKUST Student Hotlinks','https://itso.hkust.edu.hk/student-hotlinks/')]:
  link=page.get_by_role('link',name=name)
  expect(link).to_have_attribute('href',url)
  expect(link).to_have_attribute('target','_blank')
  expect(link).to_have_attribute('rel','noopener noreferrer')
 expect(page.locator('.route-steps')).to_contain_text('My Favorites')
 expect(page.locator('.source-return')).to_contain_text('does not scrape reviews or read your SIS account')
 assert page.locator('input[type=password]').count()==0
 passed('Official source links use user-provided URLs, safe new tabs, SIS path and honest manual-access status')
 page.get_by_role('button',name='Preference demo',exact=True).click()
 page.locator('.course-row-main').first.click()
 expect(page.get_by_role('dialog')).to_contain_text('Synthetic demo fixture')
 expect(page.get_by_role('link',name='Check USTSpace')).to_have_attribute('href','https://ust.space/review')
 expect(page.get_by_role('link',name='Open SIS entry')).to_have_attribute('href','https://itso.hkust.edu.hk/student-hotlinks/')
 page.get_by_role('button',name='Close course details').press('Shift+Tab')
 assert page.evaluate('document.activeElement.closest("[role=dialog]") !== null')
 page.keyboard.press('Escape')
 passed('Course details disclose provenance; modal keyboard focus is trapped')
 page.screenshot(path=str(out/'desktop.png'),full_page=True)
 assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
 passed('Desktop 1440px: no page overflow or runtime errors')
 mobile=context.new_page()
 mobile.set_viewport_size({'width':390,'height':844})
 mobile.goto(os.environ.get('BASE_URL','http://127.0.0.1:5173/'),wait_until='networkidle')
 assert not mobile.evaluate('document.documentElement.scrollWidth>innerWidth')
 assert mobile.locator('.sidebar').bounding_box()['x'] < -200
 mobile.get_by_role('button',name='Open menu').click()
 mobile.get_by_role('button',name='Demo catalog',exact=True).click()
 expect(mobile.locator('.catalog-card')).to_have_count(30)
 assert mobile.locator('.sidebar').bounding_box()['x'] < -200
 mobile.get_by_role('button',name='Open menu').click()
 mobile.get_by_role('button',name='Preference demo',exact=True).click()
 mobile.screenshot(path=str(out/'mobile.png'),full_page=True)
 passed('Mobile 390px: collapsed navigation, working menu, and no page overflow')
 assert not errors,errors
 passed('No uncaught JavaScript exceptions during the desktop journey')
 (out/'browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'errors':errors},indent=2))
 browser.close()
print(f'{len(checks)} browser checks passed')
