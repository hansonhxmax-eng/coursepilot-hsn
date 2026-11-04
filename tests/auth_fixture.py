"""Local-only Supabase transport fixture; never a production authentication bypass.

Use only with a build pointed at https://coursepilot-test.supabase.co and the
explicit AUTH_FIXTURE=1 test flag. This models ownership for browser behavior;
it does not prove the deployed PostgreSQL row-level-security policies.
"""
import base64
import copy
import hashlib
import json
import os
import time
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect

AUTH_URL = 'https://coursepilot-test.supabase.co'
TEST_PASSWORD = 'CoursePilot-test-password!'
ALICE = '11111111-1111-4111-8111-111111111111'
BOB = '22222222-2222-4222-8222-222222222222'


def encoded(value):
    raw = json.dumps(value, separators=(',', ':')).encode() if not isinstance(value, bytes) else value
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


class AuthFixture:
    def __init__(self, context):
        self.context = context
        self.users = {}
        self.passwords = {}
        self.workspaces = {}
        self.tokens = {}
        self.refresh_tokens = {}
        self.requests = []
        self.writes = []
        self.fail_reads = False
        self.fail_writes = False
        self.fail_logout = False
        self.recoveries = []
        self.signups = []
        self.password_changes = []
        self.codes = {}
        self.serial = 0
        self.add_user(ALICE, 'alice@example.test', 'Alice')
        self.add_user(BOB, 'bob@example.test', 'Bob')
        context.route(AUTH_URL + '/**', self.handle)

    def add_user(self, user_id, email, name, password=TEST_PASSWORD, confirmed=True):
        self.users[user_id] = {
            'id': user_id, 'aud': 'authenticated', 'role': 'authenticated',
            'email': email, 'email_confirmed_at': '2026-01-01T00:00:00Z' if confirmed else None,
            'phone': '', 'app_metadata': {'provider': 'email', 'providers': ['email']},
            'user_metadata': {'display_name': name}, 'identities': [],
            'created_at': '2026-01-01T00:00:00Z', 'updated_at': '2026-01-01T00:00:00Z',
            'is_anonymous': False,
        }
        self.passwords[user_id] = password
        return self.users[user_id]

    def session(self, user_id):
        self.serial += 1
        now = int(time.time())
        token = '.'.join((encoded({'alg': 'HS256', 'typ': 'JWT'}), encoded({
            'aud': 'authenticated', 'sub': user_id, 'email': self.users[user_id]['email'],
            'role': 'authenticated', 'iat': now, 'exp': now + 3600,
            'jti': f'fixture-{self.serial}', 'aal': 'aal1',
        }), encoded(b'local-browser-fixture-only')))
        refresh = f'fixture-refresh-{self.serial}'
        self.tokens[token] = user_id
        self.refresh_tokens[refresh] = user_id
        return {'access_token': token, 'refresh_token': refresh, 'token_type': 'bearer',
                'expires_in': 3600, 'expires_at': now + 3600, 'user': copy.deepcopy(self.users[user_id])}

    def actor(self, request):
        return self.tokens.get(request.headers.get('authorization', '').removeprefix('Bearer '))

    def handle(self, route):
        request = route.request
        url = urlparse(request.url)
        query = parse_qs(url.query)
        method = request.method
        body = request.post_data_json if request.post_data else {}
        actor = self.actor(request)
        self.requests.append({'path': url.path, 'method': method, 'actor': actor})

        def reply(value=None, status=200):
            headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                       'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
                       'x-supabase-api-version': '2024-01-01'}
            route.fulfill(status=status, content_type='application/json', headers=headers,
                          body='' if status == 204 else json.dumps(value))

        if method == 'OPTIONS':
            return reply(None, 204)
        if url.path == '/auth/v1/token' and method == 'POST':
            grant = query.get('grant_type', [''])[0]
            if grant == 'password':
                user_id = next((uid for uid, user in self.users.items() if user['email'] == body.get('email')), None)
                if not user_id or self.passwords[user_id] != body.get('password'):
                    return reply({'code': 'invalid_credentials', 'msg': 'Invalid login credentials'}, 400)
                if not self.users[user_id]['email_confirmed_at']:
                    return reply({'code': 'email_not_confirmed', 'msg': 'Email not confirmed'}, 400)
                return reply(self.session(user_id))
            if grant == 'pkce':
                data = self.codes.pop(body.get('auth_code'), None)
                challenge = encoded(hashlib.sha256(body.get('code_verifier', '').encode()).digest())
                if not data or challenge != data['challenge']:
                    return reply({'code': 'bad_code_verifier', 'msg': 'Invalid code verifier'}, 400)
                return reply(self.session(data['user_id']))
            if grant == 'refresh_token':
                user_id = self.refresh_tokens.get(body.get('refresh_token'))
                if user_id:
                    return reply(self.session(user_id))
                return reply({'code': 'refresh_token_not_found', 'msg': 'Invalid refresh token'}, 400)
        if url.path == '/auth/v1/user':
            if not actor:
                return reply({'code': 'bad_jwt', 'msg': 'Invalid JWT'}, 401)
            if method == 'GET':
                return reply(self.users[actor])
            if method == 'PUT':
                if body.get('password'):
                    self.passwords[actor] = body['password']
                    self.password_changes.append(actor)
                return reply(self.users[actor])
        if url.path == '/auth/v1/signup' and method == 'POST':
            user_id = '33333333-3333-4333-8333-333333333333'
            user = self.add_user(user_id, body['email'], body.get('data', {}).get('display_name', ''), body['password'], False)
            self.signups.append({'email': body['email'], 'redirect': query.get('redirect_to', [''])[0]})
            return reply(user)
        if url.path == '/auth/v1/recover' and method == 'POST':
            user_id = next((uid for uid, user in self.users.items() if user['email'] == body.get('email')), None)
            self.recoveries.append({'email': body.get('email'), 'redirect': query.get('redirect_to', [''])[0]})
            if user_id:
                self.codes['fixture-recovery-code'] = {'user_id': user_id, 'challenge': body.get('code_challenge')}
            return reply({})
        if url.path == '/auth/v1/logout' and method == 'POST':
            if self.fail_logout:
                return reply({'code': 'unexpected_failure', 'msg': 'Could not sign out'}, 500)
            return reply(None, 204)
        if url.path == '/rest/v1/user_workspaces':
            if not actor:
                return reply({'code': '42501', 'message': 'Not authenticated'}, 401)
            if method == 'GET':
                if self.fail_reads:
                    return reply({'code': 'fixture_offline', 'message': 'Temporary read failure'}, 503)
                owner = query.get('user_id', [''])[0].removeprefix('eq.')
                if owner != actor:
                    return reply([])
                return reply([{'workspace': copy.deepcopy(self.workspaces[actor])}] if actor in self.workspaces else [])
            if method == 'POST':
                if self.fail_writes:
                    return reply({'code': 'fixture_offline', 'message': 'Temporary save failure'}, 503)
                if body.get('user_id') != actor:
                    return reply({'code': '42501', 'message': 'Row ownership rejected'}, 403)
                self.workspaces[actor] = copy.deepcopy(body['workspace'])
                self.writes.append({'user_id': actor, 'workspace': copy.deepcopy(body['workspace'])})
                return reply(None, 201)
        return reply({'code': 'unexpected_fixture_request', 'message': f'Unhandled fixture endpoint: {method} {url.path}'}, 500)


def install_optional_auth_fixture(context):
    return AuthFixture(context) if os.environ.get('AUTH_FIXTURE') == '1' else None


def sign_in(page, email='alice@example.test', password=TEST_PASSWORD):
    page.get_by_label('Email address', exact=True).fill(email)
    page.get_by_label('Password', exact=True).fill(password)
    page.get_by_role('button', name='Sign in', exact=True).click()
    expect(page.get_by_role('button', name='Sign out', exact=True)).to_be_visible(timeout=15000)
    expect(page.get_by_role('textbox', name='Search uploaded courses')).to_be_visible(timeout=15000)


def sign_in_if_fixture(page, fixture):
    if fixture is not None:
        sign_in(page)


def wait_for_saved(page):
    expect(page.locator('.account-save-status')).to_contain_text('All changes saved', timeout=15000)
