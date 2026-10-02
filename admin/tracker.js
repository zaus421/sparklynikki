(() => {
  'use strict';
  const API = (document.currentScript?.dataset.api || '').replace(/\/$/, '');
  if (!API || location.pathname.startsWith('/admin')) return;
  const endpoint = `${API}/api/event`;
  const params = new URLSearchParams(location.search);
  const campaign = Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].map(k => [k, params.get(k) || '']));
  let stored = {}, visitor = crypto.randomUUID();
  try {
    if (Object.values(campaign).some(Boolean)) sessionStorage.setItem('sn_campaign', JSON.stringify(campaign));
    stored = JSON.parse(sessionStorage.getItem('sn_campaign') || '{}');
    const previous = localStorage.getItem('sn_visitor');
    if (/^[0-9a-f-]{36}$/i.test(previous || '')) visitor = previous;
    else localStorage.setItem('sn_visitor', visitor);
  } catch {}
  let referrer = '';
  try { const ref = new URL(document.referrer); referrer = ref.origin + ref.pathname; } catch {}
  const base = {page: location.pathname, referrer, ...stored, visitor_id: visitor};
  const send = (event, meta = {}) => {
    try {
      return fetch(endpoint, {method:'POST', mode:'cors', credentials:'omit', keepalive:true,
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({...base, event, ...meta})}).catch(() => {});
    } catch {}
  };
  send('page_view', {title:document.title});
  if (document.body.dataset.page && !['home','reviews'].includes(document.body.dataset.page)) send('service_view', {label:document.title});
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a,button');
    if (!a) return;
    const href = a.getAttribute('href') || '', text = (a.textContent || '').trim().slice(0,100);
    if (href.startsWith('tel:')) send('phone_click', {label:text || 'Phone'});
    else if (href.startsWith('mailto:')) send('email_click', {label:text || 'Email'});
    else if (a.matches('[data-service], [data-track="service"]')) send('service_view', {label:a.dataset.service || text});
    else if (a.matches('[data-track], .cta, .btn, .button, button') || href.endsWith('#quote')) send('cta_click', {label:a.dataset.track || text});
  }, true);
  const seen = new WeakSet();
  document.addEventListener('input', e => {
    const f = e.target.form;
    if (f?.id === 'quote-form' && !seen.has(f)) { seen.add(f); send('form_start', {form:f.id}); }
  }, true);
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || f.id !== 'quote-form' || !f.checkValidity() || f.querySelector('[type="submit"]')?.disabled) return;
    const fd = new FormData(f);
    if (fd.get('_honey')) return;
    const pick = (...keys) => { for (const k of keys) { const v = fd.get(k); if (typeof v === 'string' && v.trim()) return v.trim().slice(0,2000); } return ''; };
    send('form_submit', {form:f.id, lead:{name:pick('name','full_name'), email:pick('email','email_address'),
      phone:pick('phone','telephone'), service:pick('cleaning_type','service','service_type'), message:pick('notes','message','details')}});
  }, true);
})();
