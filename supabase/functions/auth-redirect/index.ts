import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Public bridge page. Supabase redirects the magic link here with the session
// in the URL fragment (#access_token=...&refresh_token=...). The fragment is
// NOT sent to the server, so a client-side script reads it and rebuilds the
// app deep link. iOS Safari blocks custom-scheme AUTO redirects but allows a
// user-tapped link, so we render a big "Open Clad" button.
//
// The app passes its deep-link target as ?target=<url-encoded exp:// or clad:// url>.

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Clad</title>
  <style>
    body {
      margin: 0; background: #0f0f0f; color: #fff;
      font-family: -apple-system, system-ui, sans-serif;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh; padding: 24px; text-align: center;
    }
    h1 { font-size: 32px; letter-spacing: -1px; margin-bottom: 8px; }
    p { color: #888; margin-bottom: 32px; line-height: 1.5; }
    a.btn {
      background: #6366f1; color: #fff; text-decoration: none;
      padding: 16px 32px; border-radius: 12px; font-size: 17px; font-weight: 700;
      display: inline-block;
    }
    .err { color: #ff6666; }
  </style>
</head>
<body>
  <h1>Clad</h1>
  <p id="msg">Tap below to finish signing in.</p>
  <a id="btn" class="btn" href="#">Open Clad</a>
  <script>
    (function () {
      var params = new URLSearchParams(location.search);
      var target = params.get('target');
      var hash = location.hash || '';
      var msg = document.getElementById('msg');
      var btn = document.getElementById('btn');
      if (!target) {
        msg.textContent = 'Missing redirect target.';
        msg.className = 'err';
        btn.style.display = 'none';
        return;
      }
      // Rebuild app deep link with the session fragment appended.
      var deep = target + hash;
      btn.href = deep;
      // Attempt auto-open (works on Android / some iOS); button is the fallback.
      try { window.location.href = deep; } catch (e) {}
    })();
  </script>
</body>
</html>`;

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
});
