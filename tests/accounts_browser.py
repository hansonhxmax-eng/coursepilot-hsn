"""Real SDK + mocked Supabase browser checks, not live-service/RLS verification.

Build with VITE_SUPABASE_URL=https://coursepilot-test.supabase.co and
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_coursepilot_fixture, then serve it.
Only localhost targets are accepted; no emails or real accounts are created.
"""
import copy
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect
from auth_fixture import ALICE, BOB, AUTH_URL, AuthFixture, TEST_PASSWORD, sign_in, wait_for_saved

base = os.environ.get('BASE_URL', 'http://127.0.0.1:4173/')
assert urlparse(base).hostname in ('localhost', '127.0.0.1'), 'Account fixtures must only target a local test build.'
out = Path(os.environ.get('EVIDENCE_DIR', '/tmp/coursepilot-account-evidence'))
out.mkdir(parents=True, exist_ok=True)
checks = []


def passed(name):
    checks.append(name)
    print('PASS:', name, flush=True)


def login_form(page, email='alice@example.test', password=TEST_PASSWORD):
    page.get_by_label('Email address', exact=True).fill(email)
    page.get_by_label('Password', exact=True).fill(password)
    page.get_by_role('button', name='Sign in', exact=True).click()


def sign_out(page):
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_role('button', name='Sign in', exact=True)).to_be_visible(timeout=15000)
    expect(page.locator('.real-workspace')).to_have_count(0)


def choose_course(page, code, label):
    page.get_by_role('textbox', name='Search uploaded courses').fill(code)
    page.get_by_role('button', name='Add ' + label, exact=True).click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'),
                               headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
    fixture = AuthFixture(context)
    # Anonymous browser data must never silently become an authenticated user's data.
    context.add_init_script("""localStorage.setItem('coursepilot:schedules:v1', '["MATH1013"]');
        localStorage.setItem('coursepilot:v1', JSON.stringify({watched:['HUMA1002'],prefs:{maxDays:1}}));""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base, wait_until='networkidle')
    expect(page.get_by_role('heading', name='Welcome back.')).to_be_visible()
    expect(page.get_by_role('textbox', name='Search uploaded courses')).to_have_count(0)
    for width in (1280, 1440):
        page.set_viewport_size({'width': width, 'height': 1000})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not re.search(r'[\u3400-\u9fff]', page.locator('body').inner_text())
        page.screenshot(path=str(out / f'login-{width}.png'), full_page=True)
    passed('English login screen gates personal data and fits both desktop widths')

    login_form(page, password='incorrect-password')
    expect(page.get_by_role('alert')).to_contain_text('email address or password is incorrect')
    assert not fixture.writes
    page.get_by_role('button', name='Create an account', exact=True).click()
    page.get_by_label('Name (optional)', exact=True).fill('New student')
    page.get_by_label('Email address', exact=True).fill('new@example.test')
    page.get_by_label('Password', exact=True).fill(TEST_PASSWORD)
    page.get_by_label('Confirm password', exact=True).fill('different-password')
    page.get_by_role('button', name='Create account', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('passwords do not match')
    assert not fixture.signups
    page.get_by_label('Confirm password', exact=True).fill(TEST_PASSWORD)
    page.get_by_role('button', name='Create account', exact=True).click()
    expect(page.locator('.auth-message-success')).to_contain_text('Check your email')
    assert fixture.signups[0]['redirect'].endswith('/?auth=confirm')
    expect(page.get_by_role('textbox', name='Search uploaded courses')).to_have_count(0)
    page.screenshot(path=str(out / 'signup-confirmation.png'), full_page=True)
    page.get_by_role('button', name='Sign in', exact=True).click()
    passed('Invalid login is rejected; signup validates confirmation and waits for email verification')

    sign_in(page)
    expect(page.locator('.account-identity')).to_contain_text('alice@example.test')
    expect(page.locator('.real-basket')).to_contain_text('No courses selected yet')
    page.get_by_role('button', name='Demo watchlist', exact=False).click()
    expect(page.locator('.watch-layout')).to_contain_text('Your watchlist is clear')
    page.get_by_role('button', name='Real schedules', exact=True).click()
    passed('Verified user starts with an independent workspace; legacy anonymous selections are ignored')

    choose_course(page, 'ACCT2010', 'ACCT 2010')
    page.get_by_role('checkbox', name='No classes before 10:00', exact=True).check()
    page.get_by_role('combobox', name='Maximum real campus days').select_option('3')
    lock = page.get_by_role('combobox', name='ACCT 2010 lecture section')
    choice = lock.locator('option').filter(has_text='L01 ·').first.get_attribute('value')
    lock.select_option(choice)
    page.get_by_role('button', name='Generate section plans', exact=True).click()
    page.get_by_label('Week starting Monday', exact=True).fill('2026-11-09')
    page.get_by_role('button', name='Demo catalog', exact=True).click()
    page.get_by_role('textbox', name='Search courses', exact=True).fill('HUMA1001')
    page.get_by_role('button', name='Watch HUMA1001', exact=True).click()
    wait_for_saved(page)
    account_a = copy.deepcopy(fixture.workspaces[ALICE])
    assert account_a['schedules']['selected'] == ['ACCT2010']
    assert account_a['schedules']['prefs']['maxDays'] == 3
    assert account_a['schedules']['prefs']['noEarly'] is True
    assert account_a['schedules']['locks']['ACCT2010']['lecture'] == choice
    assert account_a['schedules']['week'] == '2026-11-09'
    assert account_a['demo']['watched'] == ['HUMA1001']
    page.reload(wait_until='networkidle')
    expect(page.locator('.real-basket')).to_contain_text('ACCT 2010')
    expect(page.get_by_role('combobox', name='Maximum real campus days')).to_have_value('3')
    expect(page.get_by_role('combobox', name='ACCT 2010 lecture section')).to_have_value(choice)
    expect(page.get_by_role('checkbox', name='No classes before 10:00', exact=True)).to_be_checked()
    page.get_by_role('button', name='Generate section plans', exact=True).click()
    expect(page.get_by_label('Week starting Monday', exact=True)).to_have_value('2026-11-09')
    passed('Courses, preferences, section locks, calendar week and demo watchlist persist across reload')

    sign_out(page)
    sign_in(page, 'bob@example.test')
    expect(page.locator('.account-identity')).to_contain_text('bob@example.test')
    expect(page.locator('.real-basket')).to_contain_text('No courses selected yet')
    expect(page.get_by_role('checkbox', name='No classes before 10:00', exact=True)).not_to_be_checked()
    choose_course(page, 'MATH1013', 'MATH 1013')
    page.get_by_role('combobox', name='Maximum real campus days').select_option('2')
    wait_for_saved(page)
    account_b = copy.deepcopy(fixture.workspaces[BOB])
    assert account_b['schedules']['selected'] == ['MATH1013']
    assert account_b['demo']['watched'] == []
    assert fixture.workspaces[ALICE] == account_a
    sign_out(page)
    sign_in(page)
    expect(page.locator('.real-basket')).to_contain_text('ACCT 2010')
    assert 'MATH 1013' not in page.locator('.real-basket').inner_text()
    page.get_by_role('button', name='Demo watchlist', exact=False).click()
    expect(page.locator('.watch-layout')).to_contain_text('HUMA1001')
    page.get_by_role('button', name='Real schedules', exact=True).click()
    passed('Signing out removes the previous workspace; a second account stays separate and the first restores correctly')

    fixture.fail_writes = True
    page.get_by_role('combobox', name='Maximum real campus days').select_option('2')
    expect(page.locator('.account-save-status')).to_contain_text('Changes not saved', timeout=15000)
    assert fixture.workspaces[ALICE]['schedules']['prefs']['maxDays'] == 3
    fixture.fail_writes = False
    page.get_by_role('button', name='Retry save', exact=True).click()
    wait_for_saved(page)
    assert fixture.workspaces[ALICE]['schedules']['prefs']['maxDays'] == 2
    assert fixture.workspaces[BOB] == account_b
    passed('Save failures remain visible; retry preserves the latest changes and the other user data')

    sign_out(page)
    fixture.fail_reads = True
    before = len(fixture.writes)
    login_form(page)
    expect(page.get_by_role('heading', name='Your workspace could not be loaded')).to_be_visible(timeout=15000)
    expect(page.get_by_role('textbox', name='Search uploaded courses')).to_have_count(0)
    assert len(fixture.writes) == before
    fixture.fail_reads = False
    page.get_by_role('button', name='Retry loading workspace', exact=True).click()
    expect(page.locator('.real-basket')).to_contain_text('ACCT 2010')
    expect(page.get_by_role('combobox', name='Maximum real campus days')).to_have_value('2')
    passed('A failed account load blocks editing and never overwrites saved data with defaults')

    page.get_by_role('textbox', name='Search uploaded courses').fill('COMP1023')
    page.locator('.course-review-link').first.click()
    expect(page.locator('.review-rating-grid article')).to_have_count(4)
    expect(page.locator('.anonymous-review')).to_have_count(8)
    page.keyboard.press('Escape')
    for width in (1280, 1440):
        page.set_viewport_size({'width': width, 'height': 1000})
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.screenshot(path=str(out / 'signed-in-workspace.png'), full_page=True)
    passed('Signed-in users retain course ratings/reviews and the desktop layout without overflow')

    fixture.fail_writes = True
    page.get_by_role('combobox', name='Maximum real campus days').select_option('1')
    expect(page.locator('.account-save-status')).to_contain_text('Changes not saved', timeout=15000)
    page.get_by_role('button', name='Sign out', exact=True).click()
    expect(page.get_by_role('button', name='Sign out without saving', exact=True)).to_be_visible()
    expect(page.get_by_role('textbox', name='Search uploaded courses')).to_be_visible()
    page.get_by_role('button', name='Sign out without saving', exact=True).click()
    expect(page.get_by_role('button', name='Sign in', exact=True)).to_be_visible()
    fixture.fail_writes = False
    sign_in(page, 'bob@example.test')
    expect(page.locator('.real-basket')).to_contain_text('MATH 1013')
    assert fixture.workspaces[ALICE]['schedules']['prefs']['maxDays'] == 2
    assert fixture.workspaces[BOB] == account_b
    sign_out(page)
    passed('Unsaved changes require explicit discard before logout and never leak into the next account')

    page.get_by_role('button', name='Forgot password?', exact=True).click()
    page.get_by_label('Email address', exact=True).fill('alice@example.test')
    page.get_by_role('button', name='Send reset link', exact=True).click()
    expect(page.locator('.auth-message-success')).to_contain_text('If an account exists')
    assert fixture.recoveries[-1]['redirect'].endswith('/?auth=recovery')
    page.goto(base.rstrip('/') + '/?auth=recovery&code=fixture-recovery-code', wait_until='networkidle')
    expect(page.get_by_role('heading', name='Choose a new password.')).to_be_visible(timeout=15000)
    new_password = 'Another-CoursePilot-password!'
    page.get_by_label('Password', exact=True).fill(new_password)
    page.get_by_label('Confirm password', exact=True).fill(new_password)
    page.get_by_role('button', name='Update password', exact=True).click()
    expect(page.locator('.account-identity')).to_contain_text('alice@example.test')
    assert fixture.password_changes == [ALICE]
    assert 'auth=' not in page.url and 'code=' not in page.url
    sign_out(page)
    sign_in(page, password=new_password)
    passed('Password recovery uses the SDK PKCE callback, updates the password, and clears callback parameters')

    assert not errors, errors
    assert all(write['user_id'] in (ALICE, BOB) for write in fixture.writes)
    result = {'passed': len(checks), 'checks': checks, 'errors': errors, 'target': base,
              'scope': 'Supabase transport mocked locally. Real email delivery and PostgreSQL RLS still require a configured project.'}
    (out / 'results.json').write_text(json.dumps(result, indent=2))
    browser.close()
print(f'{len(checks)} account browser checks passed')
