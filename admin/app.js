(() => {
  'use strict';
  const cfg = window.SPARKLY_ADMIN_CONFIG || {};
  const API = String(cfg.apiBase || '').replace(/\/$/, '');
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const state = {
    token: sessionStorage.getItem('sn_admin_token') || '',
    dashboard: null,
    leads: []
  };
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cfg.currency || 'USD',
    maximumFractionDigits: 2
  });
  const num = new Intl.NumberFormat('en-US');
  const safe = (v = '') =>
    String(v).replace(
      /[&<>'"]/g,
      c =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        })[c]
    );

  async function api(path, opts = {}) {
    if (!API || API.includes('REPLACE-WITH'))
      throw new Error(
        'API URL is not configured yet. Edit admin/config.js after deploying the Worker.'
      );
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers,
      mode: 'cors'
    });
    if (res.status === 401 && path !== '/api/login') {
      signOut(false);
      throw new Error('Your session expired. Sign in again.');
    }
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const j = await res.json();
        msg = j.error || msg;
      } catch {}
      throw new Error(msg);
    }
    const type = res.headers.get('content-type') || '';
    return type.includes('application/json') ? res.json() : res.text();
  }

  function daysQuery() {
    return '?days=30';
  }
  function pct(a, b) {
    return b ? `${((a / b) * 100).toFixed(1)}%` : '0%';
  }
  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(v.endsWith?.('Z') ? v : v + 'Z');
    return Number.isNaN(d.getTime())
      ? safe(v)
      : d.toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
  }
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
  function setLoading(on) {
    $('#content').classList.toggle('loading', on);
  }

  async function login(e) {
    e.preventDefault();
    $('#loginError').textContent = '';
    const username = $('#username').value.trim(),
      password = $('#password').value;
    try {
      const r = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      state.token = r.token;
      sessionStorage.setItem('sn_admin_token', r.token);
      $('#password').value = '';
      showApp();
      await refreshAll();
    } catch (err) {
      $('#loginError').textContent = err.message;
    }
  }
  function signOut(call = true) {
    if (call && state.token)
      api('/api/logout', { method: 'POST' }).catch(() => {});
    state.token = '';
    sessionStorage.removeItem('sn_admin_token');
    $('#appView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
    $('#password').value = '';
  }
  async function verifySession() {
    if (!state.token) return false;
    try {
      await api('/api/session');
      return true;
    } catch {
      return false;
    }
  }
  function showApp() {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
  }

  function kpi(label, value, sub = '') {
    return `<article class="kpi"><div class="label">${safe(label)}</div><div class="value">${safe(value)}</div><div class="sub">${safe(sub)}</div></article>`;
  }
  function renderOverview(d) {
    const summary = d.businessSummary;
    $('#businessSummaryKpis').innerHTML = summary
      ? [
          ['This month revenue', summary.monthRevenue, 'Month to date'],
          [
            'Last 30 days revenue',
            summary.last30Revenue,
            'Today and previous 29 days'
          ],
          ['Year-to-date revenue', summary.yearRevenue, 'January 1 to today'],
          [
            'All-time revenue',
            summary.allTimeRevenue,
            'All recorded collections'
          ],
          [
            'Outstanding / unpaid',
            summary.outstanding,
            'All recorded unpaid balances'
          ],
          [
            'Average completed job',
            summary.averageCompleted,
            'Paid / won jobs · all time'
          ]
        ]
          .map(([label, value, detail]) =>
            kpi(label, money.format(value), detail)
          )
          .join('')
      : '<p class="muted">Business summary unavailable. Please refresh.</p>';
    const m = d.metrics || {};
    $('#kpis').innerHTML = [
      kpi('Visitors', num.format(m.visitors || 0), 'unique visitors'),
      kpi(
        'Leads',
        num.format(m.leads || 0),
        `${pct(m.leads, m.visitors)} visitor → lead`
      ),
      kpi('Conversion', pct(m.customers, m.leads), 'lead → customer'),
      kpi(
        'Quotes',
        num.format(m.quotes || 0),
        `${num.format(m.quoteRequests || 0)} requests · ${money.format(m.quoteValue || 0)} quoted`
      ),
      kpi('Customers', num.format(m.customers || 0), 'won jobs'),
      kpi(
        'Revenue',
        money.format(m.revenue || 0),
        `avg ${money.format(m.avgJob || 0)} / won job`
      )
    ].join('');
    renderTrend(d.trend || []);
    const funnel = [
      ['Visitors', m.visitors || 0],
      ['Service views', m.serviceViews || 0],
      ['Contact attempts', m.contactAttempts || 0],
      ['Leads', m.leads || 0],
      ['Quotes', m.quotes || 0],
      ['Customers', m.customers || 0]
    ];
    const max = Math.max(1, ...funnel.map(x => x[1]));
    $('#funnelChart').innerHTML = funnel
      .map(
        ([n, v]) =>
          `<div class="funnel-row"><span>${safe(n)}</span><div class="funnel-bar"><div class="funnel-fill" style="width:${Math.max(2, (v / max) * 100)}%"></div></div><span class="funnel-value">${num.format(v)}</span></div>`
      )
      .join('');
    renderMetricList(
      '#sourceBreakdown',
      d.sources || [],
      x => x.name,
      x =>
        `${num.format(x.leads || 0)} leads · ${money.format(x.revenue || 0)}`,
      x => x.leads || 0
    );
    renderMetricList(
      '#serviceBreakdown',
      d.services || [],
      x => x.name,
      x =>
        `${num.format(x.leads || 0)} leads · ${money.format(x.revenue || 0)}`,
      x => x.revenue || 0
    );
    $('#recentLeads').innerHTML = (d.recentLeads || []).length
      ? d.recentLeads
          .map(
            l =>
              `<div class="lead-card"><div class="lead-name">${safe(l.name || 'Unknown')}</div><div class="lead-meta">${safe(l.service || 'General inquiry')} · ${safe(l.source || 'Direct')} · ${fmtDate(l.created_at)}</div></div>`
          )
          .join('')
      : '<div class="empty">No leads yet.</div>';
  }
  function renderTrend(rows) {
    const el = $('#trendChart');
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No traffic yet.</div>';
      return;
    }
    const W = 680,
      H = 235,
      pad = 28,
      max = Math.max(1, ...rows.flatMap(r => [r.visitors || 0, r.leads || 0]));
    const x = i =>
      pad + i * Math.max(1, (W - pad * 2) / (rows.length - 1 || 1));
    const y = v => H - pad - (v / max) * (H - pad * 2);
    const path = key =>
      rows
        .map(
          (r, i) =>
            `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(r[key] || 0).toFixed(1)}`
        )
        .join(' ');
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map(
        t =>
          `<line class="grid-line" x1="${pad}" x2="${W - pad}" y1="${y(max * t)}" y2="${y(max * t)}"/><text class="axis-label" x="0" y="${y(max * t) + 3}">${Math.round(max * t)}</text>`
      )
      .join('');
    const labels = rows
      .filter(
        (_, i) =>
          i === 0 || i === rows.length - 1 || i === Math.floor(rows.length / 2)
      )
      .map(r => {
        const i = rows.indexOf(r);
        return `<text class="axis-label" x="${x(i) - 12}" y="${H}">${safe(String(r.date).slice(5))}</text>`;
      })
      .join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}">${grid}<path class="line-visitors" d="${path('visitors')}"/><path class="line-leads" d="${path('leads')}"/>${labels}</svg><div class="legend"><span><i class="v"></i>Visitors</span><span><i class="l"></i>Leads</span></div>`;
  }
  function renderMetricList(sel, rows, name, sub, val) {
    const el = $(sel);
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No data yet.</div>';
      return;
    }
    const max = Math.max(1, ...rows.map(val));
    el.innerHTML = `<div class="metric-list">${rows
      .slice(0, 7)
      .map(
        r =>
          `<div class="metric-row"><div class="metric-main"><div class="metric-name">${safe(name(r) || 'Unknown')}</div><div class="metric-sub">${safe(sub(r))}</div><div class="mini-bar"><span style="width:${Math.max(2, (val(r) / max) * 100)}%"></span></div></div><div class="metric-amount">${safe(String(val(r)))}</div></div>`
      )
      .join('')}</div>`;
  }

  function renderAnalytics(d) {
    const m = d.metrics || {};
    $('#analyticsKpis').innerHTML = [
      kpi('Page views', num.format(m.pageViews || 0), 'all tracked pages'),
      kpi('Visitors', num.format(m.visitors || 0), 'anonymous uniques'),
      kpi('Phone clicks', num.format(m.phoneClicks || 0), 'tap-to-call'),
      kpi('Email clicks', num.format(m.emailClicks || 0), 'email intent'),
      kpi('Form starts', num.format(m.formStarts || 0), 'started inquiry'),
      kpi(
        'Form submits',
        num.format(m.formSubmits || 0),
        `${pct(m.formSubmits, m.formStarts)} completion`
      )
    ].join('');
    simpleTable('#pagesTable', d.pages || [], [
      ['Page', r => r.name],
      ['Views', r => num.format(r.count || 0)]
    ]);
    simpleTable('#eventsTable', d.events || [], [
      ['Event', r => r.name],
      ['Count', r => num.format(r.count || 0)]
    ]);
    simpleTable('#trafficTable', d.traffic || [], [
      ['Source / campaign', r => r.name],
      ['Visitors', r => num.format(r.visitors || 0)],
      ['Leads', r => num.format(r.leads || 0)],
      ['Revenue', r => money.format(r.revenue || 0)]
    ]);
  }
  function renderSales(d) {
    renderJobs(d.jobs);
    const m = d.metrics || {};
    $('#salesKpis').innerHTML = [
      kpi('Won revenue', money.format(m.revenue || 0), 'money collected'),
      kpi(
        'Quoted value',
        money.format(m.quoteValue || 0),
        'recorded quoted amounts'
      ),
      kpi(
        'Close rate',
        m.leads ? pct(m.customers, m.leads) : '—',
        'won / total leads'
      ),
      kpi('Avg job', money.format(m.avgJob || 0), 'collected / paying jobs'),
      kpi('Won jobs', num.format(m.wonJobs || 0), 'completed paid jobs'),
      kpi(
        'Open / unpaid balance',
        money.format(m.openPipeline || 0),
        'quoted minus collected'
      )
    ].join('');
    renderMetricList(
      '#revenueSources',
      d.sources || [],
      x => x.name,
      x => `${x.customers || 0} won jobs`,
      x => Number(x.revenue) || 0
    );
    renderMetricList(
      '#revenueServices',
      d.services || [],
      x => x.name,
      x => `${x.customers || 0} won jobs`,
      x => Number(x.revenue) || 0
    );
  }
  function simpleTable(sel, rows, cols) {
    const el = $(sel);
    if (!rows.length) {
      el.innerHTML = '<div class="empty">No data yet.</div>';
      return;
    }
    el.innerHTML = `<div class="data-list">${rows
      .slice(0, 20)
      .map(
        r =>
          `<div class="data-row"><div>${safe(cols[0][1](r) || 'Unknown')}</div><div>${cols
            .slice(1)
            .map(
              c =>
                `<span style="margin-left:14px">${safe(c[0])}: <strong>${safe(c[1](r))}</strong></span>`
            )
            .join('')}</div></div>`
      )
      .join('')}</div>`;
  }

  async function loadLeads() {
    const qs = new URLSearchParams();
    if ($('#leadSearch').value.trim())
      qs.set('q', $('#leadSearch').value.trim());
    if ($('#leadStatus').value) qs.set('status', $('#leadStatus').value);
    const r = await api(`/api/leads?${qs}`);
    state.leads = r.leads || [];
    $('#leadsTable').innerHTML = state.leads.length
      ? state.leads
          .map(
            l =>
              `<tr><td class="table-person"><strong>${safe(l.name || 'Unknown')}</strong><span>${safe(l.email || l.phone || 'No contact')}</span></td><td>${safe(l.service || 'General')}</td><td>${safe(l.source || 'Direct')}</td><td><span class="status-pill status-${safe(String(l.status || 'New').replaceAll(' ', '-'))}">${safe(l.status || 'New')}</span></td><td>${money.format(Number(l.quote_amount) || 0)}</td><td>${money.format(Number(l.revenue) || 0)}</td><td>${fmtDate(l.created_at)}</td><td><button class="row-btn" data-edit="${l.id}">Edit</button></td></tr>`
          )
          .join('')
      : '<tr><td colspan="8"><div class="empty">No leads match this filter.</div></td></tr>';
  }
  function openLead(id) {
    const l = state.leads.find(x => String(x.id) === String(id));
    if (!l) return;
    $('#leadId').value = l.id;
    $('#leadDialogTitle').textContent = l.name || 'Edit lead';
    $('#editStatus').value = l.status || 'New';
    $('#editService').value = l.service || '';
    $('#editQuote').value = l.quote_amount || '';
    $('#editQuote').disabled = !!l.ledger_managed;
    $('#editRevenue').disabled = !!l.ledger_managed;
    $('#editRevenue').value = l.revenue || '';
    $('#editNotes').value = l.notes || '';
    let context = $('#leadContext');
    if (!context) {
      context = document.createElement('div');
      context.id = 'leadContext';
      context.className = 'muted';
      $('#leadForm').insertBefore(context, $('.form-grid'));
    }
    let details = {};
    try { details = JSON.parse(l.inquiry_details || '{}') || {}; } catch (_) {}
    const inquiryFields = [
      ['ZIP code', 'zip_code'], ['Bedrooms', 'bedrooms'], ['Bathrooms', 'bathrooms'],
      ['Square feet', 'square_feet'], ['Frequency', 'frequency'], ['Requested timing', 'preferred_timing'],
      ['Pets', 'pets'], ['Inside refrigerator', 'inside_fridge'], ['Inside oven', 'inside_oven'],
      ['Interior windows', 'interior_windows']
    ];
    context.innerHTML = `<h3>Inquiry</h3><p class="inquiry-message">${safe(l.message || 'No message provided.')}</p>`
      + inquiryFields.filter(([, key]) => details[key]).map(([label, key]) => `<div>${label}: ${safe(details[key])}</div>`).join('')
      + `<p>${l.submission_count || 0} inquiries · ${l.quote_requests || 0} quote requests.<br>Source: ${safe(l.source || 'Direct')}${l.campaign ? ' / ' + safe(l.campaign) : ''}.<br>Latest: ${safe(l.last_page || '—')} (${safe(l.last_form || '—')}). Landing: ${safe(l.landing_page || '—')}.</p>`;
    let contact = $('#leadContact');
    if (!contact) {
      contact = document.createElement('p');
      contact.id = 'leadContact';
      contact.className = 'muted';
      contact.style.overflowWrap = 'anywhere';
      $('#leadForm').insertBefore(contact, context);
    }
    const contactLines = [
      `Phone: ${l.phone ? `<a href="tel:${safe(l.phone)}">${safe(l.phone)}</a> · <a href="sms:${safe(l.phone)}">Text</a>` : 'Not provided'}`,
      `Email: ${l.email ? `<a href="mailto:${safe(l.email)}">${safe(l.email)}</a>` : 'Not provided'}`
    ];
    if (details.preferred_contact_method) contactLines.push(`Preferred contact method: ${safe(details.preferred_contact_method)}`);
    if (details.best_contact_time) contactLines.push(`Preferred contact time: ${safe(details.best_contact_time)}`);
    contact.innerHTML = contactLines.join('<br>');
    $('#leadDialog').showModal();
    $('#leadDialog').scrollTop = 0;
  }
  async function saveLead(e) {
    e.preventDefault();
    const id = $('#leadId').value;
    const body = {
      status: $('#editStatus').value,
      service: $('#editService').value.trim(),
      quote_amount: Number($('#editQuote').value) || 0,
      revenue: Number($('#editRevenue').value) || 0,
      notes: $('#editNotes').value.trim()
    };
    await api(`/api/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
    $('#leadDialog').close();
    toast('Lead updated');
    await refreshAll();
  }
  async function exportCsv() {
    const res = await fetch(`${API}/api/export/leads.csv`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!res.ok) return toast('Export failed');
    const blob = await res.blob(),
      u = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = u;
    a.download = 'sparkly-nikki-leads.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(u);
  }

  let refreshing = false,
    refreshAgain = false;
  async function refreshAll() {
    if (!state.token) return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    setLoading(true);
    try {
      const d = await api(`/api/dashboard${daysQuery()}`);
      if (jobsHistory) {
        const history = await api('/api/jobs?days=all');
        if (jobsHistory) d.jobs = history.jobs;
      }
      state.dashboard = d;
      renderOverview(d);
      renderAnalytics(d);
      renderSales(d);
      await loadLeads();
      await loadHealth();
      setApiStatus(true);
    } catch (err) {
      setApiStatus(false);
      toast(err.message);
    } finally {
      refreshing = false;
      setLoading(false);
      if (refreshAgain) {
        refreshAgain = false;
        refreshAll();
      }
    }
  }
  async function loadHealth() {
    try {
      const h = await api('/api/health');
      $('#healthInfo').innerHTML =
        `<div class="data-list"><div class="data-row"><span>API</span><strong>${safe(h.status)}</strong></div><div class="data-row"><span>Database</span><strong>${safe(h.database)}</strong></div><div class="data-row"><span>Server time</span><strong>${safe(h.time)}</strong></div></div>`;
      $('#trackingHealth').innerHTML =
        `<div class="data-list"><div class="data-row"><span>Last event</span><strong>${safe(h.lastEvent || 'No events yet')}</strong></div><div class="data-row"><span>Events (24h)</span><strong>${num.format(h.events24h || 0)}</strong></div><div class="data-row"><span>Leads (24h)</span><strong>${num.format(h.leads24h || 0)}</strong></div></div>`;
    } catch (err) {
      $('#healthInfo').innerHTML =
        `<div class="error-box">${safe(err.message)}</div>`;
    }
  }
  function setApiStatus(ok) {
    const d = $('#apiStatus .status-dot');
    d.className = 'status-dot ' + (ok ? 'ok' : 'bad');
    $('#apiStatus span:last-child').textContent = ok
      ? 'API connected'
      : 'API unavailable';
  }

  function switchView(name) {
    $$('.view').forEach(v =>
      v.classList.toggle('active-view', v.id === `${name}View`)
    );
    $$('#nav button').forEach(b =>
      b.classList.toggle('active', b.dataset.view === name)
    );
    const map = {
      overview: ['BUSINESS OVERVIEW', 'Dashboard'],
      leads: ['SALES PIPELINE', 'Leads & CRM'],
      analytics: ['WEBSITE', 'Analytics'],
      sales: ['JOB HISTORY', 'Jobs / Payments'],
      health: ['SYSTEM', 'Site health']
    };
    $('#sectionEyebrow').textContent = map[name][0];
    $('#sectionTitle').textContent = map[name][1];
  }

  $('#loginForm').addEventListener('submit', login);
  $('#logoutBtn').addEventListener('click', () => signOut());
  $('#refreshBtn').addEventListener('click', refreshAll);
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-view]');
    if (b) switchView(b.dataset.view);
  });
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) switchView(g.dataset.go);
    const b = e.target.closest('[data-edit]');
    if (b) openLead(b.dataset.edit);
  });
  $('#leadForm').addEventListener('submit', saveLead);
  $('#closeDialog').addEventListener('click', () => $('#leadDialog').close());
  $('#cancelLead').addEventListener('click', () => $('#leadDialog').close());
  $('#leadSearch').addEventListener('input', () => {
    clearTimeout(window.__ls);
    window.__ls = setTimeout(loadLeads, 250);
  });
  $('#leadStatus').addEventListener('change', loadLeads);
  $('#exportBtn').addEventListener('click', exportCsv);

  let ledgerRows = [],
    customerOptions = [];
  let jobsHistory = false,
    jobsPage = 0;
  function renderJobs(rows) {
    ledgerRows = [...(rows || [])].sort(
      (a, b) =>
        String(b.job_date).localeCompare(String(a.job_date)) ||
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
    const pageCount = Math.max(1, Math.ceil(ledgerRows.length / 25));
    jobsPage = Math.min(jobsPage, pageCount - 1);
    const visibleRows = jobsHistory
      ? ledgerRows.slice(jobsPage * 25, (jobsPage + 1) * 25)
      : ledgerRows.slice(0, 10);
    $('#jobsHeading').textContent = jobsHistory
      ? 'Jobs / payment history'
      : 'Recent jobs / payments';
    $('#viewAllJobs').hidden = jobsHistory;
    $('#recentJobs').hidden = !jobsHistory;
    $('#jobsPagination').hidden = !jobsHistory;
    $('#jobsPrevious').disabled = jobsPage === 0;
    $('#jobsNext').disabled = jobsPage >= pageCount - 1;
    $('#jobsPageInfo').textContent =
      'Page ' +
      (jobsPage + 1) +
      ' of ' +
      pageCount +
      ' · ' +
      ledgerRows.length +
      ' jobs';
    $('#jobsHistoryLimit').hidden = !jobsHistory || ledgerRows.length < 200;
    $('#jobsTable').innerHTML = visibleRows.length
      ? visibleRows
          .map(
            j =>
              `<tr><td>${safe(j.job_date)}</td><td>${safe(j.customer)}${j.lead_name ? '<br><small>Linked to CRM</small>' : ''}</td><td>${safe(j.service)}</td><td>${j.quoted_cents === null ? '—' : money.format(j.quoted_cents / 100)}</td><td>${money.format(j.collected_cents / 100)}</td><td>${j.quoted_cents === null ? '—' : money.format(Math.max(0, j.quoted_cents - j.collected_cents) / 100)}</td><td>${safe(j.payment_status)}</td><td>${safe(j.payment_method)}</td><td><button class="row-btn" data-job-edit="${safe(j.id)}">Edit</button> <button class="row-btn" data-job-delete="${safe(j.id)}">Delete</button></td></tr>`
          )
          .join('')
      : '<tr><td colspan="9"><div class="empty">No jobs yet. Add your first payment above.</div></td></tr>';
  }
  function jobRules() {
    const unpaid = $('#jobStatus').value === 'Unpaid';
    $('#jobQuoted').required = $('#jobStatus').value !== 'Paid';
    $('#jobCollected').readOnly = unpaid;
    if (unpaid) $('#jobCollected').value = '0';
  }
  function openJob(id) {
    const j = ledgerRows.find(r => r.id === id);
    $('#jobForm').reset();
    $('#jobError').textContent = '';
    $('#jobId').value = j?.id || crypto.randomUUID();
    $('#jobId').dataset.edit = j ? 'true' : '';
    $('#jobTitle').textContent = j ? 'Edit job / payment' : 'Add job / payment';
    customerOptions = state.leads.map(l => ({
      label: l.name + (l.email || l.phone ? ' — ' + (l.email || l.phone) : ''),
      lead: l
    }));
    $('#jobCustomers').innerHTML = customerOptions
      .map(x => `<option value="${safe(x.label)}"></option>`)
      .join('');
    const linked = j && customerOptions.find(x => x.lead.id === j.lead_id);
    $('#jobCustomer').value = linked ? linked.label : j?.customer || '';
    $('#jobService').value = j?.service || 'Standard / recurring';
    $('#jobQuoted').value = j?.quoted_cents == null ? '' : j.quoted_cents / 100;
    $('#jobCollected').value = j ? j.collected_cents / 100 : '';
    $('#jobStatus').value = j?.payment_status || 'Paid';
    $('#jobMethod').value = j?.payment_method || 'Cash';
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    $('#jobDate').max = today;
    $('#jobDate').value = j?.job_date || today;
    $('#jobNotes').value = j?.notes || '';
    jobRules();
    $('#jobDialog').showModal();
    $('#jobCustomer').focus();
  }
  async function saveJob(e) {
    e.preventDefault();
    if (!$('#jobForm').reportValidity()) return;
    const button = $('#saveJob');
    button.disabled = true;
    $('#jobError').textContent = '';
    try {
      const selected = customerOptions.find(
        x => x.label === $('#jobCustomer').value.trim()
      );
      const id = $('#jobId').value;
      await api($('#jobId').dataset.edit ? `/api/jobs/${id}` : '/api/jobs', {
        method: $('#jobId').dataset.edit ? 'PATCH' : 'POST',
        body: JSON.stringify({
          id,
          lead_id: selected?.lead.id || null,
          customer: selected?.lead.name || $('#jobCustomer').value.trim(),
          service: $('#jobService').value.trim(),
          amount_quoted: $('#jobQuoted').value,
          amount_collected: $('#jobCollected').value,
          payment_status: $('#jobStatus').value,
          payment_method: $('#jobMethod').value,
          job_date: $('#jobDate').value,
          notes: $('#jobNotes').value.trim()
        })
      });
      $('#jobDialog').close();
      toast('Job saved');
      await refreshAll();
    } catch (err) {
      $('#jobError').textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }
  async function deleteJob(id) {
    if (
      !confirm('Delete this job/payment from the ledger? Totals will update.')
    )
      return;
    try {
      await api(`/api/jobs/${id}`, { method: 'DELETE' });
      toast('Job deleted');
      await refreshAll();
    } catch (err) {
      toast(err.message);
    }
  }
  $('#viewAllJobs').addEventListener('click', () => {
    jobsHistory = true;
    jobsPage = 0;
    refreshAll();
  });
  $('#recentJobs').addEventListener('click', () => {
    jobsHistory = false;
    jobsPage = 0;
    refreshAll();
  });
  $('#jobsPrevious').addEventListener('click', () => {
    if (jobsPage > 0) jobsPage--;
    renderJobs(ledgerRows);
  });
  $('#jobsNext').addEventListener('click', () => {
    jobsPage++;
    renderJobs(ledgerRows);
  });
  $('#addJob').addEventListener('click', () => openJob());
  $('#jobForm').addEventListener('submit', saveJob);
  $('#jobStatus').addEventListener('change', jobRules);
  $('#cancelJob').addEventListener('click', () => $('#jobDialog').close());
  $('#closeJob').addEventListener('click', () => $('#jobDialog').close());
  $('#jobsTable').addEventListener('click', e => {
    const edit = e.target.closest('[data-job-edit]'),
      del = e.target.closest('[data-job-delete]');
    if (edit) openJob(edit.dataset.jobEdit);
    if (del) deleteJob(del.dataset.jobDelete);
  });

  const autoRefresh = () => {
    if (
      state.token &&
      !document.hidden &&
      !$('#leadDialog').open &&
      !$('#jobDialog').open
    )
      refreshAll();
  };
  setInterval(autoRefresh, 30000);
  document.addEventListener('visibilitychange', autoRefresh);
  window.addEventListener('focus', autoRefresh);
  (async () => {
    if (await verifySession()) {
      showApp();
      await refreshAll();
    }
  })();
})();
