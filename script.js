(() => {
  const cfg = window.SITE_CONFIG || {};
  const businessName = cfg.businessName || "Nikki's Sparkly Solutions";
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

  document.querySelectorAll('[data-business-name]').forEach(el => el.textContent = businessName);
  document.querySelectorAll('[data-city-state]').forEach(el => el.textContent = cityState);
  document.querySelectorAll('[data-service-area]').forEach(el => el.textContent = serviceArea);
  document.querySelectorAll('[data-reply-time]').forEach(el => el.textContent = replyTime);

  const page = document.body.dataset.page || 'home';
  const seo = {
    home: {
      title: `${businessName} | Residential Cleaning in ${cityState}`,
      description: `Residential cleaning in ${cityState} from ${businessName}. Tell me about your home and request a free cleaning quote online.`,
      path: '/'
    },
    residential: {
      title: `Residential Cleaning in ${cityState} | ${businessName}`,
      description: `Weekly, every-other-week, and monthly residential cleaning in ${cityState} from ${businessName}. Request a free quote online.`,
      path: '/residential-cleaning.html'
    },
    deep: {
      title: `Deep Cleaning in ${cityState} | ${businessName}`,
      description: `Deep and one-time house cleaning in ${cityState} from ${businessName}. Tell me what your home needs and request a free quote.`,
      path: '/deep-cleaning.html'
    },
    move: {
      title: `Move-In & Move-Out Cleaning in ${cityState} | ${businessName}`,
      description: `Move-in and move-out cleaning in ${cityState} for empty or nearly empty homes. Request a free quote from ${businessName}.`,
      path: '/move-out-cleaning.html'
    },
    reviews: {
      title: `Customer Reviews | ${businessName} | ${cityState}`,
      description: `Read Google reviews for ${businessName}, a residential cleaning service serving ${cityState}, and leave feedback after your cleaning.`,
      path: '/reviews.html'
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
      name: businessName,
      url: siteUrl,
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
    jsonLd.textContent = JSON.stringify(localBusiness);
    document.head.appendChild(jsonLd);
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const reviewLinkEls = document.querySelectorAll('[data-google-review-link]');
  if (cfg.googleReviewUrl) {
    reviewLinkEls.forEach(el => {
      el.href = cfg.googleReviewUrl;
      el.removeAttribute('aria-disabled');
      el.classList.remove('is-disabled');
    });
  } else {
    reviewLinkEls.forEach(el => {
      el.href = '#reviews-coming-soon';
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('is-disabled');
    });
  }

  const reviewsMount = document.getElementById('google-reviews');
  const reviewsStatus = document.getElementById('reviews-status');
  const ratingMount = document.getElementById('google-rating-summary');
  const allReviewsLink = document.getElementById('view-all-google-reviews');

  async function loadGoogleReviews() {
    if (!reviewsMount) return;
    const enabled = Boolean(cfg.googleReviewsEnabled);
    const placeId = (cfg.googlePlaceId || '').trim();
    const apiKey = (cfg.googleMapsApiKey || '').trim();

    if (!enabled || !placeId || !apiKey) {
      if (reviewsStatus) reviewsStatus.textContent = 'I’m getting the Google Business Profile set up. Once it’s connected, reviews will show up right here.';
      return;
    }

    try {
      if (!window.google?.maps) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-google-maps-loader]');
          if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
          }
          const loader = document.createElement('script');
          loader.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly&loading=async`;
          loader.async = true;
          loader.dataset.googleMapsLoader = 'true';
          loader.addEventListener('load', resolve, { once: true });
          loader.addEventListener('error', reject, { once: true });
          document.head.appendChild(loader);
        });
      }

      const { Place } = await google.maps.importLibrary('places');
      const place = new Place({ id: placeId });
      await place.fetchFields({ fields: ['displayName', 'rating', 'userRatingCount', 'reviews', 'googleMapsURI'] });

      if (ratingMount && place.rating) {
        const count = Number.isFinite(place.userRatingCount) ? ` from ${place.userRatingCount.toLocaleString()} Google reviews` : '';
        ratingMount.textContent = `${place.rating.toFixed(1)} out of 5${count}`;
      }

      if (allReviewsLink && place.googleMapsURI) {
        allReviewsLink.href = place.googleMapsURI;
        allReviewsLink.hidden = false;
      }

      const reviews = Array.isArray(place.reviews) ? place.reviews : [];
      reviewsMount.replaceChildren();
      if (!reviews.length) {
        if (reviewsStatus) reviewsStatus.textContent = 'There aren’t any Google reviews to show here yet.';
        return;
      }
      if (reviewsStatus) reviewsStatus.textContent = '';

      const attributionMount = document.getElementById('google-place-attributions');
      if (attributionMount) {
        attributionMount.replaceChildren();
        const attributions = Array.isArray(place.attributions) ? place.attributions : [];
        attributions.forEach(value => {
          const item = document.createElement('span');
          item.textContent = value;
          attributionMount.appendChild(item);
        });
      }

      for (const review of reviews) {
        const card = document.createElement('article');
        card.className = 'review-card';

        const top = document.createElement('div');
        top.className = 'review-card-top';

        const authorWrap = document.createElement('div');
        authorWrap.className = 'review-author-wrap';

        if (review.authorAttribution?.photoURI) {
          const avatar = document.createElement('img');
          avatar.className = 'review-avatar';
          avatar.src = review.authorAttribution.photoURI;
          avatar.alt = '';
          avatar.width = 36;
          avatar.height = 36;
          avatar.loading = 'lazy';
          avatar.referrerPolicy = 'no-referrer';
          authorWrap.appendChild(avatar);
        }

        const author = document.createElement(review.authorAttribution?.uri ? 'a' : 'span');
        author.className = 'review-author';
        author.textContent = review.authorAttribution?.displayName || 'Google customer';
        if (review.authorAttribution?.uri) {
          author.href = review.authorAttribution.uri;
          author.target = '_blank';
          author.rel = 'noopener noreferrer';
        }
        authorWrap.appendChild(author);

        const stars = document.createElement('span');
        stars.className = 'review-stars';
        stars.setAttribute('aria-label', `${review.rating || 0} out of 5 stars`);
        const rounded = Math.max(0, Math.min(5, Math.round(review.rating || 0)));
        stars.textContent = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);

        top.append(authorWrap, stars);
        card.appendChild(top);

        if (review.relativePublishTimeDescription) {
          const time = document.createElement('p');
          time.className = 'review-time';
          time.textContent = review.relativePublishTimeDescription;
          card.appendChild(time);
        }

        if (review.text) {
          const body = document.createElement('p');
          body.className = 'review-text';
          body.textContent = review.text;
          card.appendChild(body);
        }

        const source = document.createElement('p');
        source.className = 'review-source';
        source.textContent = 'Google review';
        card.appendChild(source);
        reviewsMount.appendChild(card);
      }
    } catch (error) {
      if (reviewsStatus) reviewsStatus.textContent = 'The Google reviews aren’t loading right now, but you can still view them directly on Google.';
    }
  }

  loadGoogleReviews();

  const form = document.getElementById('quote-form');
  const submitButton = document.getElementById('submit-button');
  const message = document.getElementById('form-message');
  if (!form) return;

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
      data.set('_subject', `New quote request for ${businessName}`);
      data.set('website', businessName);
      data.set('service_area', serviceArea);
      const response = await fetch(endpoint, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } });
      let result = null;
      try { result = await response.json(); } catch (_) {}
      if (!response.ok || result?.success === false) throw new Error('Submission failed');
      form.reset();
      message.className = 'form-message success';
      message.textContent = `Thanks! Your quote request was sent to ${ownerName}. You should hear back ${replyTime}.`;
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
