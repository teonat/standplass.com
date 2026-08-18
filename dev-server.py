#!/usr/bin/env python3
"""Local static server for public/ that mimics Cloudflare's extensionless
routing (e.g. /felt -> /felt.html), which plain `python -m http.server`
doesn't do -- without it, every extensionless link on the site 404s locally."""
import http.server
import os

PORT = 8800
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        clean = path.split('?', 1)[0].split('#', 1)[0]
        last_segment = clean.rsplit('/', 1)[-1]
        if clean != '/' and '.' not in last_segment:
            candidate = os.path.join(ROOT, clean.lstrip('/') + '.html')
            if os.path.isfile(candidate):
                return candidate
        return super().translate_path(path)


if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('', PORT), Handler) as httpd:
        print('\n  http://localhost:%d\n' % PORT)
        httpd.serve_forever()
