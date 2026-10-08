(() => {
  const cfg = window.SITE_CONFIG || {};
  const businessName = cfg.businessName || "Nikki's Sparkly Solutions";
  const displayName = businessName.replace(/'/g, '’');
  const ownerName = cfg.ownerName || "Nikki";
  const destinationEmail = cfg.destinationEmail || cfg.publicEmail || "nikkisparklysolutions@gmail.com";
  const publicEmail = cfg.publicEmail || "";
  const phone = cfg.phone || "";
  const city = cfg.city || "Rochester";
  const state = cfg.state || "MN";
  const cityState = `${city}, ${state}`;
  const serviceArea = cfg.serviceAreaText || `${city}, ${state} and nearby communities`;
  const replyTime = cfg.replyTimeText || "usually within one business day";
  const configuredUrl = (cfg.websiteUrl || "").trim().replace(/\/$/, "");
  const liveOrigin = /^https?:$/.test(location.protocol) ? location.origin : "";
  const siteUrl = configuredUrl || liveOrigin;
  const logoPath = (cfg.logoPath || 'assets/logo.png').replace(/^\//, '');

  document.querySelectorAll('[data-business-name]').forEach(el => el.textContent = displayName);
  document.querySelectorAll('[data-city-state]').forEach(el => el.textContent = cityState);
  document.querySelectorAll('[data-service-area]').forEach(el => el.textContent = serviceArea);
  document.querySelectorAll('[data-reply-time]').forEach(el => el.textContent = replyTime);

  const page = document.body.dataset.page || 'home';
  const seo = {
    home: {
      title: `${displayName} | Residential Cleaning in ${cityState}`,
      description: `Residential cleaning in ${cityState} from ${displayName}. Tell me about your home and request a free cleaning quote online.`,
      path: '/'
    },
    residential: {
      title: `Residential Cleaning in ${cityState} | ${displayName}`,
      description: `Weekly, every-other-week, and monthly residential cleaning in ${cityState} from ${displayName}. Request a free quote online.`,
      path: '/residential-cleaning.html'
    },
    deep: {
      title: `Deep Cleaning in ${cityState} | ${displayName}`,
      description: `Deep and one-time house cleaning in ${cityState} from ${displayName}. Tell me what your home needs and request a free quote.`,
      path: '/deep-cleaning.html'
    },
    move: {
      title: `Move-In & Move-Out Cleaning in ${cityState} | ${displayName}`,
      description: `Move-in and move-out cleaning in ${cityState} for empty or nearly empty homes. Request a free quote from ${displayName}.`,
      path: '/move-out-cleaning.html'
    }
  }[page] || null;

  if (seo) {
    document.title = seo.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = seo.description;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = seo.title;
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = seo.description;
    const canonical = document.getElementById('canonical-link');
    if (canonical && siteUrl) canonical.href = `${siteUrl}${seo.path}`;
    const ogImage = document.getElementById('og-image');
    if (ogImage && siteUrl) ogImage.content = `${siteUrl}/${logoPath}`;
  }

  if (siteUrl) {
    const localBusiness = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${siteUrl}/#business`,
      name: displayName,
      url: `${siteUrl}/`,
      sameAs: ['https://g.page/r/CRxONIWlUpBDECE/review'],
      description: `One-person residential cleaning service serving ${serviceArea}.`,
      logo: `${siteUrl}/${logoPath}`,
      image: `${siteUrl}/${logoPath}`,
      areaServed: {
        '@type': 'City',
        name: `${city}, Minnesota`
      },
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Residential cleaning services',
        itemListElement: [
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Recurring residential cleaning' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Deep cleaning' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Move-in and move-out cleaning' } }
        ]
      }
    };
    if (publicEmail) localBusiness.email = publicEmail;
    if (phone) localBusiness.telephone = phone;
    const jsonLd = document.createElement('script');
    jsonLd.type = 'application/ld+json';
    jsonLd.textContent = JSON.stringify(page === 'home' ? {
      '@context': 'https://schema.org',
      '@graph': [localBusiness, {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: displayName,
        url: `${siteUrl}/`,
        publisher: { '@id': `${siteUrl}/#business` }
      }]
    } : localBusiness);
    document.head.appendChild(jsonLd);
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const form = document.getElementById('quote-form');
  const submitButton = document.getElementById('submit-button');
  const message = document.getElementById('form-message');
  if (!form) return;

  async function saveInquiry(data) {
    const value = key => String(data.get(key) || '').trim();
    if (value('_honey')) return true;
    const api = document.querySelector('script[data-api]')?.dataset.api;
    if (!api) return false;
    const uuid = () => crypto.randomUUID
      ? crypto.randomUUID()
      : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,
          c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    let visitor = uuid();
    let attribution = {};
    let sourcePage = '';
    try {
      visitor = localStorage.getItem('sn_visitor') || visitor;
      attribution = JSON.parse(sessionStorage.getItem('sn_attribution') || '{}') || {};
      sourcePage = JSON.parse(sessionStorage.getItem('sn_service_page') || '""');
    } catch (_) {}
    const campaign = new URLSearchParams(location.search);
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      if (campaign.get(key)) attribution[key] = campaign.get(key);
    }
    if (!attribution.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (!['sparklynikki.com', 'www.sparklynikki.com'].includes(ref.hostname)) {
          attribution.referrer = ref.origin + ref.pathname;
        }
      } catch (_) {}
    }
    const details = { source_page: sourcePage };
    for (const key of [
      'zip_code', 'bedrooms', 'bathrooms', 'square_feet', 'frequency',
      'preferred_contact_method', 'best_contact_time', 'preferred_timing',
      'pets', 'inside_fridge', 'inside_oven', 'interior_windows'
    ]) {
      details[key] = value(key);
    }
    const body = JSON.stringify({
      ...attribution,
      event: 'form_submit',
      event_id: uuid(),
      visitor_id: visitor,
      page: location.pathname,
      landing_page: attribution.landing_page || location.pathname,
      form: form.id,
      lead: {
        name: value('name'),
        email: value('email'),
        phone: value('phone'),
        service: value('cleaning_type'),
        message: value('notes'),
        details
      }
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(api.replace(/\/$/, '') + '/api/event', {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal
        });
        if (response.ok) return true;
        if (response.status < 500 && response.status !== 429) return false;
      } catch (_) {} finally {
        clearTimeout(timeout);
      }
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
    return false;
  }

  const endpoint = `https://formsubmit.co/ajax/${encodeURIComponent(destinationEmail)}`;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.className = 'form-message';
    message.textContent = '';
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Sending…';
    try {
      const data = new FormData(form);
      const _submissionName = value('name');
      const _submissionTime = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      data.set('_subject', _submissionName ? `New quote request - ${_submissionName} - ${_submissionTime}` : `New quote request - ${_submissionTime}`);
      data.set('website', businessName);
      data.set('service_area', serviceArea);
      const response = await fetch(endpoint, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } });
      let result = null;
      try { result = await response.json(); } catch (_) {}
      if (!response.ok || result?.success === false) throw new Error('Submission failed');
      const crmSaved = await saveInquiry(data).catch(() => false);
      form.reset();
      message.className = 'form-message success';
      message.textContent = `Thanks! Your quote request was sent to ${ownerName}. You should hear back ${replyTime}.`;
      if (!crmSaved) message.textContent += ' Your email was sent, but the dashboard copy could not be saved. Please do not resubmit.';
    } catch (error) {
      message.className = 'form-message error';
      message.textContent = 'That didn’t go through. Please try again in a moment.';
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = 'Send quote request';
    }
  });
})();
