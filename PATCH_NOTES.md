# GST Automation Tool — Integration Patch Notes

This file documents the EXACT changes needed in your existing module files
to connect them to the new index.html / dashboard.html flow.
Do NOT touch anything else — these are surgical path-only edits.

---

## FOLDER STRUCTURE (target layout in your git repo)

```
GST-Automation-Tool/
├── index.html              ← NEW (login page)
├── dashboard.html          ← NEW (module selector)
├── js/
│   ├── supabase-client.js  ← NEW (shared Supabase client)
│   └── auth-guard.js       ← NEW (auth guard for modules)
│
├── module1/                ← your "gstr 1 autoation batch 2" folder (renamed)
│   ├── gstr1-to-tally-pro-v2.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── supabase-client.js  ← keep this copy OR delete and update HTML reference
│       ├── auth.js             ← EDIT BELOW
│       └── gstr1-to-tally-pro-v2.js  ← EDIT BELOW
│
└── module2/                ← your "gstr 2b automation/code" folder (renamed)
    ├── index.html          ← EDIT BELOW
    └── style.css
```

---

## PATCH 1 — module1/js/auth.js

Find this line (after successful login):
  window.location.href = "./gstr1-to-tally-pro-v2.html";

Change to:
  window.location.href = "../../dashboard.html";

---

## PATCH 2 — module1/js/gstr1-to-tally-pro-v2.js

There are TWO occurrences of login.html in this file. Fix both:

Occurrence 1 — inside ensureAuthenticated():
  window.location.href = "login.html";
Change to:
  window.location.href = "../../index.html";

Occurrence 2 — inside logoutBtn click handler:
  window.location.href = "login.html";
Change to:
  window.location.href = "../../index.html";

---

## PATCH 3 — module2/index.html

Add these 3 lines in the <head> section, BEFORE any other <script> tags:

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="../js/supabase-client.js"></script>
  <script src="../js/auth-guard.js"></script>

That's it. auth-guard.js will silently redirect to ../index.html if no session found.
No other changes needed in module2.

---

## NOTES

- module1/js/supabase-client.js: You can keep it as-is (it's a duplicate).
  The module1 HTML files reference js/supabase-client.js (relative path within module1),
  so they'll continue to work without change.

- module2/index.html already has the Supabase CDN script? Check first.
  If it already has:  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">
  then skip that line and only add the two local script lines.

- Once Module 3 (Streamlit) is ready, add its URL to dashboard.html module 3 card's
  onclick: openModule('https://your-streamlit-url.streamlit.app')
  and remove the .disabled class and disabled-btn class.
