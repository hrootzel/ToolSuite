#!/usr/bin/env python3
"""HTTP integration checks for generic per-app JSON persistence (Python standard library only)."""
import http.client as http_client, json, os, pathlib, socket, subprocess, tempfile, time
from contextlib import contextmanager
DIR = pathlib.Path(__file__).resolve().parent


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def http(p, method, route, value=None, headers=None):
    connection = http_client.HTTPConnection('127.0.0.1', p, timeout=4)
    body = json.dumps(value) if value is not None else None
    headers = dict(headers or {})
    if value is not None:
        headers['Content-Type'] = 'application/json'
    connection.request(method, route, body, headers)
    response = connection.getresponse()
    data = response.read()
    result = (response.status, json.loads(data) if data.startswith(b'{') else data.decode(errors='replace'))
    connection.close()
    return result


@contextmanager
def server(p, root):
    proc = subprocess.Popen(['node', str(DIR / 'server.js')],
        env={**os.environ, 'PORT': str(p), 'WEB_ROOT': str(root)},
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for i in range(100):
            if proc.poll() is not None:
                raise RuntimeError(proc.stderr.read().decode())
            try:
                if http(p, 'GET', '/healthz')[0] == 200:
                    break
            except (ConnectionError, OSError):
                time.sleep(.05)
        else:
            raise RuntimeError('Server did not start')
        yield
    finally:
        proc.terminate()
        try: proc.communicate(timeout=4)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()


def run():
    with tempfile.TemporaryDirectory() as temp:
        root = pathlib.Path(temp) / 'public'; root.mkdir()
        app = root / 'ToolSuite'; app.mkdir()
        other = root / 'AnotherApp'; other.mkdir()
        (app / 'BabyCalendar.html').write_bytes((DIR / 'BabyCalendar.html').read_bytes())
        (other / 'index.html').write_text('<html></html>')
        (root / 'index.html').write_text('root')
        app2 = root / 'AssetsOnly'; app2.mkdir()
        (app2 / 'style.css').write_text('')
        p = port()
        calendar = '/ToolSuite/api/storage/baby-calendar'
        other_api = '/AnotherApp/api/storage/settings'
        # Test while WEB_ROOT is read-only, but individual app directories are writable.
        root.chmod(0o555)
        try:
            with server(p, root):
                status, initial = http(p, 'GET', calendar)
                assert status == 200 and initial['revision'] == 0 and initial['data'] is None and not initial['initialized']
                assert http(p,'GET','/ToolSuite/BabyCalendar.html')[0] == 200
                assert http(p,'GET','/api/storage/baby-calendar')[0] == 404
                assert http(p,'PUT',calendar,{'revision': 0})[0] == 400
                payload = {'revision': 0, 'data': {'eventTypes': [{'id': 'feeding', 'label': 'Feeding', 'emoji': '🍼'}], 'entries': [{'notes': '5 oz'}]}}
                status, saved = http(p, 'PUT', calendar, payload)
                assert status == 200 and saved['revision'] == 1, (status, saved)
                data = app / 'data' / 'baby-calendar.json'
                assert data.is_file()
                assert not (root / 'data').exists()
                assert http(p,'GET','/ToolSuite/data/baby-calendar.json')[0] == 403
                assert http(p,'GET','/ToolSuite/data/')[0] == 403
                assert http(p,'GET','/ToolSuite/.git/config')[0] == 403
                assert http(p,'GET',calendar)[1]['data']['entries'][0]['notes'] == '5 oz'
                assert http(p,'PUT',calendar,payload)[0] == 409
                payload['revision']=1
                payload['data']['entries'].append({'notes': '6 oz'})
                assert http(p,'PUT',calendar,payload)[0] == 200
                assert http(p,'PUT',calendar,payload,{'Origin': 'http://evil.example'})[0] == 403
                assert http(p,'PUT',other_api,{'revision': 0, 'data': {'theme':'dark'}})[0] == 200
                assert (other / 'data' / 'settings.json').is_file()
                assert not (app / 'data' / 'settings.json').exists()
                assert http(p,'GET','/AssetsOnly/api/storage/test')[0] == 404
                assert http(p,'GET','/ToolSuite/api/storage/../other')[0] != 200
                assert http(p,'GET','/ToolSuite/api/storage/%2e%2e')[0] != 200
                assert http(p,'GET','/ToolSuite/api/storage/bad.name')[0] != 200
                print('PASS: private app-local data, generic multi-app keys, CAS, validation, root read-only')
            with server(p, root):
                status, stored = http(p, 'GET', calendar)
                assert status == 200 and stored['revision'] == 2 and len(stored['data']['entries']) == 2
                print('PASS: data persists across Node restarts')
            # Symlinks must not redirect an app's writable store to another directory.
            with server(p, root):
                hostile = root / 'BadApp'; hostile.mkdir(); (hostile / 'index.html').write_text('html')
                (hostile / 'data').symlink_to(other / 'data', target_is_directory=True)
                assert http(p,'PUT','/BadApp/api/storage/evil',{'revision': 0, 'data': 'bad'})[0] == 403
                assert http(p,'GET','/BadApp/api/storage/evil')[0] == 403
                (app / 'data' / 'symlink.json').symlink_to(other / 'data' / 'settings.json')
                assert http(p,'GET','/ToolSuite/api/storage/symlink')[0] != 200
                assert http(p,'PUT','/ToolSuite/api/storage/symlink',{'revision':0,'data':1})[0] != 200
                assert http(p,'GET','/ToolSuite/data/symlink.json')[0] == 403
                print('PASS: data folder and document symlink escape protection')
        finally:
            root.chmod(0o755)

if __name__ == '__main__': run()
