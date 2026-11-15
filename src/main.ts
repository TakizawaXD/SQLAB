import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

(window as any).__SQLAB_BOOTED__ = true;
const statusEl = document.getElementById('app-loading-msg');
if (statusEl) statusEl.innerText = 'Cargando módulos de Angular...';

bootstrapApplication(App, appConfig).then(() => {
  try {
    sessionStorage.removeItem('sqllab_auto_reload');
  } catch {}
}).catch((err) => {
  console.error('CRITICAL BOOTSTRAP ERROR:', err);
  const root = document.querySelector('app-root');
  if (root) {
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0B0F19;color:#f87171;font-family:sans-serif;padding:20px;text-align:center;">
        <div style="font-size:28px;margin-bottom:8px;">⚠️</div>
        <h2 style="color:#fff;font-size:18px;margin-bottom:12px;">No se pudo iniciar SQL LAB</h2>
        <pre style="background:#1e1b4b;color:#fca5a5;padding:16px;border-radius:8px;border:1px solid #7f1d1d;max-width:800px;font-size:12px;text-align:left;overflow:auto;max-height:300px;white-space:pre-wrap;">${err?.stack || err?.message || err}</pre>
        <button onclick="localStorage.clear();location.reload();" style="margin-top:16px;padding:8px 18px;background:#7c3aed;color:#fff;font-weight:600;border:none;border-radius:6px;cursor:pointer;">Limpiar Caché y Recargar</button>
      </div>
    `;
  }
});
