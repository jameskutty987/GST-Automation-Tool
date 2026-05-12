document.addEventListener('DOMContentLoaded', () => {
    const authScreen = document.getElementById('authScreen');
    const dashboard = document.getElementById('dashboard');
    const logoutBtn = document.getElementById('logoutBtn');
    const navButtons = document.querySelectorAll('.nav-btn');
  
    function showDashboard() {
      authScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
    }
  
    function showAuth() {
      dashboard.classList.add('hidden');
      authScreen.classList.remove('hidden');
    }
  
    navButtons.forEach(btn => btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.module-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.target);
      if(panel) panel.classList.add('active');
    }));
  
    if (window.supabaseClient) {
      supabaseClient.auth.getSession().then(({data}) => {
        if(data && data.session) showDashboard(); else showAuth();
      }).catch(showAuth);
  
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if(session) showDashboard(); else showAuth();
      });
  
      if(logoutBtn) logoutBtn.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        showAuth();
      });
    }
  });