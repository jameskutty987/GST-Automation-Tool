/**
 * auth-guard.js
 * Drop this into any protected module page (one level deep from root).
 * Must be loaded AFTER supabase-client.js and the Supabase CDN script.
 */
(async function () {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data || !data.session) {
      window.location.href = "../index.html";
    }
  } catch (e) {
    window.location.href = "../index.html";
  }
})();
