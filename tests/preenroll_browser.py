"""Desktop import checks against the local Supabase transport fixture."""
import os
from playwright.sync_api import sync_playwright, expect
from auth_fixture import ALICE, BOB, TEST_PASSWORD, install_optional_auth_fixture, sign_in, wait_for_saved

base = os.environ.get('BASE_URL', 'http://127.0.0.1:4174/')
calendar = b'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:acct-preenrolled\r\nSUMMARY:ACCT 2010 Lecture\r\nDTSTART;TZID=Asia/Hong_Kong:20261103T133000\r\nDTEND;TZID=Asia/Hong_Kong:20261103T145000\r\nLOCATION:Lecture Theater E (143)\r\nDESCRIPTION:Instructor: YE, Guibo\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    fixture = install_optional_auth_fixture(context)
    assert fixture is not None, 'AUTH_FIXTURE=1 is required'
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base, wait_until='networkidle')
    sign_in(page)
    input_file = page.get_by_label('Import pre-enrolled .ics file')
    input_file.set_input_files({'name': 'sis.ics', 'mimeType': 'text/calendar', 'buffer': calendar})
    expect(page.locator('.preenroll-status')).to_contain_text('1 course · 1 meeting')
    expect(page.locator('.preenroll-meetings')).to_contain_text('Lecture Theater E (143)')
    expect(page.locator('.preenroll-meetings')).to_contain_text('YE, Guibo')
    page.locator('.preenroll-panel').screenshot(path='/tmp/coursepilot-preenroll-panel.png')
    page.get_by_role('button', name='Clear selection', exact=True).click()
    expect(page.locator('.preenroll-status')).to_contain_text('Locked / Pre-enrolled')
    wait_for_saved(page)
    assert len(fixture.workspaces[ALICE]['schedules']['preenrolled']) == 1
    page.reload(wait_until='networkidle')
    expect(page.locator('.preenroll-status')).to_contain_text('1 course · 1 meeting')
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_label('Import pre-enrolled .ics file').set_input_files({'name': 'bad.ics', 'mimeType': 'text/calendar', 'buffer': b'BEGIN:VCALENDAR\r\nEND:VCALENDAR'})
    expect(page.locator('.preenroll-message')).to_contain_text('No dated course meetings')
    expect(page.locator('.preenroll-status')).to_contain_text('1 course · 1 meeting')
    page.get_by_role('textbox', name='Search uploaded courses').fill('ACCT 2010')
    expect(page.get_by_role('button', name='ACCT 2010 is locked as pre-enrolled')).to_be_disabled()
    page.get_by_role('button', name='Sign out', exact=True).click()
    sign_in(page, 'bob@example.test', TEST_PASSWORD)
    expect(page.locator('.preenroll-status')).to_have_count(0)
    assert BOB not in fixture.workspaces
    assert not errors, errors
    browser.close()
print('PASS: SIS import, lock, clearing selection, account save/reload, and account isolation')
