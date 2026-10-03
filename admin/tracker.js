(() => {
  'use strict';
  try {
    const API=(document.currentScript?.dataset.api||'').replace(/\/$/,'');
    if(!API||location.pathname.startsWith('/admin'))return;
    const uuid=()=>crypto.randomUUID();
    const read=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')||fallback}catch{return fallback}};
    const write=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value))}catch{}};
    const params=new URLSearchParams(location.search),campaign=Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].map(k=>[k,params.get(k)||'']));
    let visitor=uuid(),attribution={landing_page:location.pathname,referrer:''};
    try {const stored=localStorage.getItem('sn_visitor');if(/^[0-9a-f-]{36}$/i.test(stored||''))visitor=stored;else localStorage.setItem('sn_visitor',visitor)}catch{}
    try {const ref=new URL(document.referrer);if(!['sparklynikki.com','www.sparklynikki.com'].includes(ref.hostname))attribution.referrer=ref.origin+ref.pathname}catch{}
    try {attribution=read(sessionStorage,'sn_attribution',attribution);if(Object.values(campaign).some(Boolean))Object.assign(attribution,campaign);write(sessionStorage,'sn_attribution',attribution)}catch{}
    const servicePages={'/residential-cleaning.html':'Standard / recurring','/deep-cleaning.html':'Deep clean','/move-out-cleaning.html':'Move-in / move-out'};
    let servicePage=servicePages[location.pathname]?location.pathname:'';
    try {if(servicePage)write(sessionStorage,'sn_service_page',servicePage);else servicePage=read(sessionStorage,'sn_service_page','')}catch{}
    const base={...attribution,page:location.pathname,visitor_id:visitor,service:servicePages[location.pathname]||''};
    const send=(event,meta={})=>{
      try {
        const body=JSON.stringify({...base,event,event_id:uuid(),...meta});
        const attempt=async n=>{try{const response=await fetch(`${API}/api/event`,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(8000)});if(response.ok||response.status<500&&response.status!==429)return}catch{}if(n<3)setTimeout(()=>attempt(n+1),[0,1000,5000,15000][n])};
        attempt(1).catch(()=>{});
      }catch{}
    };
    const safely=fn=>e=>{try{fn(e)}catch{}};
    send('page_view',{title:document.title});
    if(servicePages[location.pathname])send('service_view',{label:servicePages[location.pathname]});
    document.addEventListener('click',safely(e=>{
      const a=e.target.closest?.('a,button');if(!a)return;
      const href=a.getAttribute('href')||'',text=(a.textContent||'').trim().slice(0,100);
      if(href.startsWith('tel:'))send('phone_click',{label:text||'Phone'});
      else if(href.startsWith('mailto:'))send('email_click',{label:text||'Email'});
      else if(a.matches('[data-service], [data-track="service"]'))send('service_view',{label:a.dataset.service||text});
      else if(a.matches('[data-track], .cta, .btn, .button, button')||href.endsWith('#quote'))send('cta_click',{label:a.dataset.track||text});
    }),true);
    const seen=new WeakSet();
    document.addEventListener('input',safely(e=>{const f=e.target.form;if(f?.id==='quote-form'&&!seen.has(f)){seen.add(f);send('form_start',{form:f.id})}}),true);

  }catch{}
})();