# Module 3 — Render Deployment Guide
# GSTR-3B Multi-Month Aggregator (Streamlit)

═══════════════════════════
FOLDER STRUCTURE (module 3)
═══════════════════════════

Create a NEW separate git repo (or subfolder) for this:

  gst-module3/
  ├── app.py               ← your existing file
  ├── gstr1_engine.py      ← your existing file
  └── requirements.txt     ← NEW (provided)


═══════════════════════════════
STEP 1 — Push to GitHub
═══════════════════════════════

Create a new GitHub repo (e.g. gst-module3) and push these 3 files.
Render pulls directly from GitHub.


═══════════════════════════════
STEP 2 — Create Web Service on Render
═══════════════════════════════

1. Go to https://dashboard.render.com
2. Click "New" → "Web Service"
3. Connect your GitHub repo (gst-module3)
4. Fill in the settings:

   Name          : gst-module3  (or any name you like)
   Environment   : Python 3
   Region        : Singapore (closest to India)
   Branch        : main
   Build Command : pip install -r requirements.txt
   Start Command : streamlit run app.py --server.port $PORT --server.address 0.0.0.0
   Instance Type : Free

5. Click "Create Web Service"
6. Wait ~2 minutes for the first deploy to complete.
7. Render gives you a URL like: https://gst-module3.onrender.com


═══════════════════════════════
STEP 3 — Share the URL with me
═══════════════════════════════

Once deployed, share the Render URL.
I will activate the Module 3 card in dashboard.html with one line change.


═══════════════════════════════
NOTES
═══════════════════════════════

- Free tier on Render spins down after 15 min of inactivity.
  First load after idle takes ~30 seconds (cold start). This is normal.

- If you want it always-on, upgrade to Starter ($7/month) on Render.

- The Streamlit app runs independently — no Supabase auth needed
  since it is protected by the dashboard login before the user can
  even see the link.
