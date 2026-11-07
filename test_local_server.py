import http.server
import socketserver
import threading
import urllib.request
import time
import json

PORT = 8089

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass # suppress logs

def test_server():
    server = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    print(f"Server started on http://127.0.0.1:{PORT}")

    time.sleep(0.5)

    urls = [
        f"http://127.0.0.1:{PORT}/package.json",
        f"http://127.0.0.1:{PORT}/dist/index.html",
        f"http://127.0.0.1:{PORT}/dist/app.css",
        f"http://127.0.0.1:{PORT}/dist/app.js",
        f"http://127.0.0.1:{PORT}/dist/assets/logo.png",
    ]

    all_passed = True
    for u in urls:
        try:
            req = urllib.request.Request(u)
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                length = len(resp.read())
                print(f"GET {u} -> Status {status}, Length {length} bytes [OK]")
                if status != 200:
                    all_passed = False
        except Exception as e:
            print(f"GET {u} -> FAILED: {e}")
            all_passed = False

    # Check package.json format
    with open('package.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    print("\nValidating TizenBrew package.json fields:")
    required_fields = ['name', 'appName', 'version', 'packageType', 'appPath', 'keys']
    for rf in required_fields:
        if rf in manifest:
            print(f"  [OK] '{rf}': {manifest[rf]}")
        else:
            print(f"  [MISSING] '{rf}'")
            all_passed = False

    if manifest.get('packageType') == 'app':
        print("  [OK] packageType is 'app'")
    else:
        print("  [FAIL] packageType must be 'app'")
        all_passed = False

    server.shutdown()
    if all_passed:
        print("\nALL LOCAL TESTS PASSED!")
    else:
        print("\nSOME TESTS FAILED!")

if __name__ == '__main__':
    test_server()
