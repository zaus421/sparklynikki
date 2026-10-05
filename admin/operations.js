(() => {
  'use strict';

  const cfg = window.SPARKLY_ADMIN_CONFIG || {};
  const API = String(cfg.apiBase || '').replace(/\/$/, '');
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const TEST_KEY = 'sn_operations_test_v1';
  const TEST_DESTROYED_KEY = 'sn_operations_test_destroyed';
  const APPLE_SHORTCUT_KEY = 'sn_apple_reminder_shortcut_ready';
  const SERVICES = ['Recurring cleaning', 'One-time cleaning', 'Deep cleaning', 'Move-in / move-out', 'Other'];
  const STATUS_LABELS = { Won: 'Booked / customer', Lost: 'Not booked' };
  const state = { leads: [], schedule: [], reminders: [], test: loadTestData(), backendReady: true, lookup: [], selectedLead: null };
  const pages = Object.fromEntries(['schedule','customers','reminders'].map(name=>[name,{cursors:[null],next:null,request:0,summary:{}}]));

  function safe(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
  }

  function today() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function prettyDate(value) {
    if (!value) return 'No date';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
  }

  function prettyTime(value) {
    if (!value) return '';
    const [hour, minute] = value.split(':').map(Number);
    const date = new Date(2000, 0, 1, hour, minute || 0);
    return date.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  }

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  async function api(path, options = {}) {
    if (!API) throw new Error('Admin API is not configured.');
    const token = sessionStorage.getItem('sn_admin_token') || '';
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, { ...options, headers, mode:'cors' });
    if (response.status === 401) throw new Error('Your admin session expired. Sign in again.');
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try { message = (await response.json()).error || message; } catch (_) {}
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response.text();
  }

  function loadTestData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TEST_KEY) || '{}');
      return {
        leads: Array.isArray(parsed.leads) ? parsed.leads : [],
        schedule: Array.isArray(parsed.schedule) ? parsed.schedule : [],
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : []
      };
    } catch (_) {
      return { leads: [], schedule: [], reminders: [] };
    }
  }

  function saveTestData() {
    localStorage.setItem(TEST_KEY, JSON.stringify(state.test));
    renderTestCount();
  }

  function testDestroyed() {
    return localStorage.getItem(TEST_DESTROYED_KEY) === '1';
  }

  function allLeads() {
    return [...new Map([...state.leads,...state.lookup,...(state.selectedLead?[state.selectedLead]:[]),...state.test.leads].map(lead=>[String(lead.id),lead])).values()];
  }

  function allSchedule() {
    return [...state.schedule, ...state.test.schedule];
  }

  function allReminders() {
    return [...state.reminders, ...state.test.reminders];
  }

  function leadById(id) {
    return allLeads().find(lead => String(lead.id) === String(id));
  }

  function parseDetails(lead) {
    if (!lead) return {};
    if (lead.inquiry_details && typeof lead.inquiry_details === 'object') return lead.inquiry_details;
    try { return JSON.parse(lead.inquiry_details || '{}') || {}; } catch (_) { return {}; }
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || status || 'New inquiry';
  }

  function normalizeService(value) {
    const map = {
      'Standard / recurring':'Recurring cleaning',
      'One-time clean':'One-time cleaning',
      'Deep clean':'Deep cleaning'
    };
    return map[value] || value || 'Not set';
  }

  function serviceText(record) {
    const service = normalizeService(record?.service);
    return service === 'Other' && record?.service_note ? `Other: ${record.service_note}` : service;
  }

  function setOperationsStatus(message = '') {
    const el = $('#operationsStatus');
    el.hidden = !message;
    el.textContent = message;
  }

  async function loadAll(reset=true) {
    if (!sessionStorage.getItem('sn_admin_token') || !$('#operationsView').classList.contains('active-view')) return;
    const name=$('.ops-pane.active').id.replace('Ops',''), page=pages[name];
    if(reset!==false)page.cursors=[null];
    const request=++page.request;
    page.loading=true;
    $('#'+name+'Previous').disabled=true;$('#'+name+'Next').disabled=true;
    const query=new URLSearchParams({limit:'25'});
    if(page.cursors.at(-1))query.set('cursor',page.cursors.at(-1));
    if(name==='customers'){query.set('status','Won');query.set('q',$('#opsCustomerSearch').value.trim());}
    else query.set('filter',$(name==='schedule'?'#scheduleFilter':'#reminderFilter').value);
    try {
      const result=await api((name==='customers'?'/api/leads':'/api/operations/'+name)+'?'+query);
      if(request!==page.request)return;
      if(name==='customers')state.leads=result.leads||[];
      if(name==='schedule')state.schedule=result.jobs||[];
      if(name==='reminders')state.reminders=result.reminders||[];
      page.next=result.nextCursor;page.summary=result.summary||{};
      state.backendReady=true;setOperationsStatus('');
    }catch(error){if(request===page.request)setOperationsStatus(error.message);}
    finally{if(request===page.request){page.loading=false;renderAll();}}
  }

  function renderAll() {
    renderSchedule();
    renderCustomers();
    renderReminders();
    renderTestCount();
    for(const [name,page] of Object.entries(pages)) {
      $('#'+name+'Previous').disabled=page.loading||page.cursors.length===1;
      $('#'+name+'Next').disabled=page.loading||!page.next;
      $('#'+name+'PageInfo').textContent='Page '+page.cursors.length;
    }
  }

  function showSpecialView(name) {
    $$('.view').forEach(view => view.classList.toggle('active-view', view.id === `${name}View`));
    $$('#nav button').forEach(button => button.classList.remove('active'));
    if (name === 'operations') $('#operationsNav').classList.add('active');
    if (name === 'test') $('#testNav').classList.add('active');
    $('#sectionEyebrow').textContent = name === 'test' ? 'TEMPORARY TESTING' : 'BUSINESS OPERATIONS';
    $('#sectionTitle').textContent = name === 'test' ? 'Test' : 'Operations';
    if (name === 'operations') loadAll();
  }

  function showOpsTab(name) {
    $$('.operations-tabs button').forEach(button => button.classList.toggle('active', button.dataset.opsTab === name));
    $$('.ops-pane').forEach(pane => pane.classList.toggle('active', pane.id === `${name}Ops`));
    loadAll();
  }

  function scheduleMatches(job, filter) {
    const date = String(job.job_date || '');
    const status = job.status || 'Scheduled';
    if (filter === 'today') return date === today() && !['Cancelled'].includes(status);
    if (filter === 'completed') return status === 'Completed';
    if (filter === 'cancelled') return status === 'Cancelled';
    if (filter === 'upcoming') return date >= today() && !['Completed','Cancelled'].includes(status);
    return true;
  }

  function renderSchedule() {
    const rows = allSchedule().slice().sort((a, b) => String(a.job_date).localeCompare(String(b.job_date)) || String(a.start_time || '').localeCompare(String(b.start_time || '')));
    const active = state.test.schedule.filter(job => job.job_date >= today() && !['Completed','Cancelled'].includes(job.status));
    const todayRows = active.filter(job => job.job_date === today());
    const weekEnd = addDays(today(), 7);
    const weekRows = active.filter(job => job.job_date >= today() && job.job_date <= weekEnd);
    $('#scheduleSummary').innerHTML = [
      ['Today', Number(pages.schedule.summary.today||0)+todayRows.length],
      ['Next 7 days', Number(pages.schedule.summary.week||0)+weekRows.length],
      ['Upcoming', Number(pages.schedule.summary.upcoming||0)+active.length]
    ].map(([label, value]) => `<article class="ops-summary-card"><div class="ops-summary-label">${safe(label)}</div><div class="ops-summary-value">${value}</div></article>`).join('');

    const filter = $('#scheduleFilter')?.value || 'upcoming';
    const visible = rows.filter(job => scheduleMatches(job, filter));
    $('#scheduleList').innerHTML = visible.length ? visible.map(scheduleCard).join('') : '<div class="ops-empty">No scheduled jobs in this view.</div>';
  }

  function scheduleCard(job) {
    const lead = leadById(job.lead_id);
    const times = job.start_time && job.end_time ? `${prettyTime(job.start_time)} – ${prettyTime(job.end_time)}` : 'All day / time not set';
    const statusClass = job.status === 'Completed' ? 'good' : job.status === 'Cancelled' ? 'bad' : job.job_date === today() ? 'warn' : '';
    return `<article class="ops-card ${job.test_record ? 'ops-test-card' : ''}">
      <div class="ops-card-top">
        <div><h3>${safe(job.customer || lead?.name || 'Customer')}</h3><p>${safe(prettyDate(job.job_date))} · ${safe(times)}${job.address ? `<br>${safe(job.address)}` : ''}</p></div>
        ${job.test_record ? '<span class="ops-test-badge">Test</span>' : `<span class="ops-chip ${statusClass}">${safe(job.status || 'Scheduled')}</span>`}
      </div>
      <div class="ops-card-meta"><span class="ops-chip">${safe(serviceText(job))}</span>${job.lead_id ? `<span class="ops-chip">CRM linked</span>` : ''}</div>
      ${job.notes ? `<p>${safe(job.notes)}</p>` : ''}
      <div class="ops-actions">
        <button type="button" class="row-btn" data-schedule-google="${safe(job.id)}">Google Calendar</button>
        <button type="button" class="row-btn" data-schedule-apple="${safe(job.id)}">Apple Calendar</button>
        <button type="button" class="row-btn" data-schedule-edit="${safe(job.id)}">Edit</button>
        <button type="button" class="row-btn" data-schedule-delete="${safe(job.id)}">Delete</button>
      </div>
    </article>`;
  }

  function renderCustomers() {
    const query = ($('#opsCustomerSearch')?.value || '').trim().toLowerCase();
    const rows = [...state.leads,...state.test.leads].filter(lead => {
      if (lead.status !== 'Won') return false;
      if (!query) return true;
      const haystack = [lead.name, lead.phone, lead.email, lead.service, lead.notes].join(' ').toLowerCase();
      return haystack.includes(query);
    }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    $('#opsCustomerList').innerHTML = rows.length ? rows.map(customerCard).join('') : '<div class="ops-empty">No booked customers match. Mark a booked lead as Won in Leads & CRM to show them here.</div>';
  }

  function customerCard(lead) {
    const details = parseDetails(lead);
    const contact = [details.preferred_contact_method, details.best_contact_time].filter(Boolean).join(' · ');
    const statusClass = lead.status === 'Won' ? 'good' : lead.status === 'Lost' ? 'bad' : ['Contacted','Quote Sent'].includes(lead.status) ? 'warn' : '';
    return `<article class="ops-card ${lead.test_record ? 'ops-test-card' : ''}">
      <div class="ops-card-top">
        <div><h3>${safe(lead.name || 'Unknown')}</h3><p>${safe(serviceText(lead))}${contact ? `<br>Prefers ${safe(contact)}` : ''}</p></div>
        ${lead.test_record ? '<span class="ops-test-badge">Test</span>' : `<span class="ops-chip ${statusClass}">${safe(statusLabel(lead.status))}</span>`}
      </div>
      <div class="ops-contact">
        ${lead.phone ? `<a href="tel:${safe(lead.phone)}">Call ${safe(lead.phone)}</a><a href="sms:${safe(lead.phone)}">Text</a>` : ''}
        ${lead.email ? `<a href="mailto:${safe(lead.email)}">Email</a>` : ''}
      </div>
      ${details.address ? `<p>${safe(details.address)}</p>` : ''}
      ${lead.notes ? `<p class="ops-customer-notes">${safe(lead.notes)}</p>` : ''}
      <div class="ops-actions">
        <button type="button" class="row-btn" data-customer-schedule="${safe(lead.id)}">Schedule</button>
        <button type="button" class="row-btn" data-customer-reminder="${safe(lead.id)}">Add reminder</button>
        ${lead.test_record ? '' : `<button type="button" class="row-btn" data-customer-edit="${safe(lead.id)}">Edit</button><button type="button" class="row-btn" data-customer-crm="${safe(lead.id)}">Manage in CRM</button>`}
      </div>
    </article>`;
  }

  function reminderMatches(reminder, filter) {
    const due = String(reminder.due_date || '');
    const done = Boolean(reminder.completed);
    if (filter === 'open') return !done;
    if (filter === 'today') return !done && due === today();
    if (filter === 'overdue') return !done && due < today();
    if (filter === 'completed') return done;
    return true;
  }

  function renderReminders() {
    const rows = allReminders().slice().sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)) || String(a.due_date).localeCompare(String(b.due_date)) || String(a.due_time || '').localeCompare(String(b.due_time || '')));
    const open = state.test.reminders.filter(item => !item.completed);
    const overdue = open.filter(item => item.due_date < today());
    const dueToday = open.filter(item => item.due_date === today());
    $('#reminderSummary').innerHTML = [
      ['Open', Number(pages.reminders.summary.open||0)+open.length],
      ['Due today', Number(pages.reminders.summary.today||0)+dueToday.length],
      ['Overdue', Number(pages.reminders.summary.overdue||0)+overdue.length]
    ].map(([label, value]) => `<article class="ops-summary-card"><div class="ops-summary-label">${safe(label)}</div><div class="ops-summary-value">${value}</div></article>`).join('');

    const filter = $('#reminderFilter')?.value || 'open';
    const visible = rows.filter(reminder => reminderMatches(reminder, filter));
    $('#reminderList').innerHTML = visible.length ? visible.map(reminderCard).join('') : '<div class="ops-empty">No reminders in this view.</div>';
  }

  function reminderCard(reminder) {
    const lead = leadById(reminder.lead_id);
    const overdue = !reminder.completed && reminder.due_date < today();
    const dueToday = !reminder.completed && reminder.due_date === today();
    const due = `${prettyDate(reminder.due_date)}${reminder.due_time ? ` at ${prettyTime(reminder.due_time)}` : ''}`;
    return `<article class="ops-card ${reminder.completed ? 'ops-reminder-done' : ''} ${overdue ? 'ops-overdue' : dueToday ? 'ops-today' : ''}">
      <div class="ops-card-top">
        <div><h3>${safe(reminder.title)}</h3><p>${safe(due)}${reminder.customer || lead ? ` · ${safe(reminder.customer || lead.name)}` : ''}</p></div>
        ${reminder.test_record ? '<span class="ops-test-badge">Test</span>' : overdue ? '<span class="ops-chip bad">Overdue</span>' : dueToday ? '<span class="ops-chip warn">Today</span>' : reminder.completed ? '<span class="ops-chip good">Done</span>' : '<span class="ops-chip">Open</span>'}
      </div>
      ${reminder.notes ? `<p>${safe(reminder.notes)}</p>` : ''}
      <div class="ops-actions">
        <button type="button" class="row-btn" data-reminder-toggle="${safe(reminder.id)}">${reminder.completed ? 'Reopen' : 'Done'}</button>
        <button type="button" class="row-btn" data-reminder-iphone="${safe(reminder.id)}">iPhone Reminder</button>
        <button type="button" class="row-btn" data-reminder-edit="${safe(reminder.id)}">Edit</button>
        <button type="button" class="row-btn" data-reminder-delete="${safe(reminder.id)}">Delete</button>
      </div>
    </article>`;
  }

  let customerRequestId = '';

  function openCustomer(id = '') {
    const lead = leadById(id);
    const details = parseDetails(lead);
    $('#customerOpsForm').reset();
    customerRequestId = crypto.randomUUID();
    $('#customerOpsId').value = lead?.id || '';
    $('#customerOpsTitle').textContent = lead ? 'Edit customer' : 'Add Existing Customer';
    $('#customerOpsError').textContent = '';
    for (const [field, value] of Object.entries({ Name:lead?.name, Phone:lead?.phone, Email:lead?.email,
      Service:lead?.service, Contact:details.preferred_contact_method, Time:details.best_contact_time,
      Address:details.address, Message:lead?.message, Notes:lead?.notes })) {
      $('#customerOps' + field).value = value || '';
    }
    $('#customerOpsDialog').showModal();
  }

  async function saveCustomer(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button.disabled || !event.currentTarget.reportValidity()) return;
    const id = $('#customerOpsId').value;
    const record = {
      request_id: customerRequestId,
      name: $('#customerOpsName').value.trim(), phone: $('#customerOpsPhone').value.trim(),
      email: $('#customerOpsEmail').value.trim(), service: $('#customerOpsService').value.trim(),
      message: $('#customerOpsMessage').value.trim(), notes: $('#customerOpsNotes').value.trim(),
      details: { preferred_contact_method: $('#customerOpsContact').value,
        best_contact_time: $('#customerOpsTime').value, address: $('#customerOpsAddress').value.trim() }
    };
    button.disabled = true;
    try {
      await api('/api/operations/customers' + (id ? '/' + id : ''), {
        method: id ? 'PATCH' : 'POST', body: JSON.stringify(record)
      });
      $('#refreshBtn').click();
      $('#customerOpsDialog').close();
      toast('Customer saved');
    } catch (error) {
      $('#customerOpsError').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  function setCustomScheduleVisibility() {
    const custom = $('#scheduleLeadId').value === 'custom';
    $('#scheduleCustomWrap').hidden = !custom;
    $('#scheduleCustomName').disabled = !custom;
    $('#scheduleCustomName').required = custom;
  }

  function fillScheduleCustomer() {
    setCustomScheduleVisibility();
    const lead = leadById($('#scheduleLeadId').value);
    if (!lead) return;
    const service = normalizeService(lead.service);
    $('#scheduleAddress').value = parseDetails(lead).address || '';
    $('#scheduleService').value = SERVICES.includes(service) ? service : 'Other';
    $('#scheduleServiceNote').value = SERVICES.includes(service) ? '' : (lead.service || '');
    $('#scheduleNotes').value = lead.notes || lead.message || '';
    setServiceNoteVisibility();
  }

  let lookupRequest=0;
  async function loadCustomerOptions(kind,query='',selectedId='') {
    const request=++lookupRequest;
    const params=new URLSearchParams({lookup:'1',limit:'20',q:query});
    if(kind==='schedule')params.set('status','Won');
    const result=await api('/api/leads?'+params);
    let selected=selectedId?leadById(selectedId):null;
    if(selectedId&&!selected&&!String(selectedId).startsWith('ops-test-'))selected=(await api('/api/leads/'+encodeURIComponent(selectedId))).lead;
    if(request!==lookupRequest)return;
    state.lookup=result.leads||[];state.selectedLead=selected;
    fillCustomerSelects(kind,selectedId);
  }

  function fillCustomerSelects(kind,selectedId='') {
    const select=$(kind==='schedule'?'#scheduleLeadId':'#reminderOpsLeadId');
    const current=selectedId||select.value;
    const choices=[...new Map([...state.lookup,...(state.selectedLead?[state.selectedLead]:[]),...state.test.leads]
      .filter(lead=>kind!=='schedule'||lead.status==='Won'||String(lead.id)===String(current))
      .map(lead=>[String(lead.id),lead])).values()];
    const blank=kind==='schedule'?'<option value="">Select customer</option><option value="custom">Custom</option>':'<option value="">No linked customer</option>';
    select.innerHTML=blank+choices.map(lead=>'<option value="'+safe(lead.id)+'">'+safe(lead.name||'Unknown')+(lead.test_record?' [TEST]':'')+'</option>').join('');
    if([...select.options].some(option=>option.value===String(current)))select.value=current;
  }

  async function openSchedule(id = '', leadId = '') {
    const job = allSchedule().find(item => String(item.id) === String(id));
    try { await loadCustomerOptions('schedule','',job?.lead_id||leadId); }catch(error){toast(error.message);return;}
    const service = normalizeService(job?.service || leadById(leadId)?.service);
    $('#scheduleForm').reset();
    $('#scheduleError').textContent = '';
    $('#scheduleId').value = job?.id || crypto.randomUUID();
    $('#scheduleCustomerSearch').value='';
    $('#scheduleDialogTitle').textContent = job ? 'Edit scheduled job' : 'Schedule job';
    fillCustomerSelects('schedule',job?.lead_id||leadId);
    $('#scheduleLeadId').value = job ? (job.lead_id || 'custom') : leadId || '';
    $('#scheduleCustomName').value = job?.customer || '';
    setCustomScheduleVisibility();
    $('#scheduleAddress').value = job?.address || '';
    $('#scheduleService').value = SERVICES.includes(service) ? service : 'Other';
    $('#scheduleServiceNote').value = job?.service_note || (job && !SERVICES.includes(normalizeService(job.service)) ? normalizeService(job.service) : '');
    $('#scheduleStatus').value = job?.status || 'Scheduled';
    $('#scheduleDate').value = job?.job_date || today();
    $('#scheduleStart').value = job?.start_time || '';
    $('#scheduleEnd').value = job?.end_time || '';
    $('#scheduleNotes').value = job?.notes || '';
    if (!job && leadId) fillScheduleCustomer();
    setServiceNoteVisibility();
    $('#scheduleDialog').showModal();
  }

  function setServiceNoteVisibility() {
    $('#scheduleServiceNoteWrap').hidden = $('#scheduleService').value !== 'Other';
  }

  function validateScheduleTimes() {
    const start = $('#scheduleStart').value;
    const end = $('#scheduleEnd').value;
    if (Boolean(start) !== Boolean(end)) {
      $('#scheduleError').textContent = 'Add both a start and end time, or leave both blank for an all-day job.';
      return false;
    }
    if (start && end && end <= start) {
      $('#scheduleError').textContent = 'End time must be later than start time.';
      return false;
    }
    return true;
  }

  async function saveSchedule(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button.disabled) return;
    if (!$('#scheduleForm').reportValidity() || !validateScheduleTimes()) return;
    const lead = leadById($('#scheduleLeadId').value);
    const custom = $('#scheduleLeadId').value === 'custom';
    if (!lead && !custom) return;
    const existing = allSchedule().find(item => String(item.id) === String($('#scheduleId').value));
    if (lead && lead.status !== 'Won' && String(existing?.lead_id) !== String(lead.id)) {
      $('#scheduleError').textContent = 'Mark this lead as Won in Leads & CRM before scheduling booked work.';
      return;
    }
    const record = {
      id: existing?.id || $('#scheduleId').value,
      lead_id: lead?.id || '',
      customer: lead?.name || $('#scheduleCustomName').value.trim(),
      address: $('#scheduleAddress').value.trim(),
      service: $('#scheduleService').value,
      service_note: $('#scheduleService').value === 'Other' ? $('#scheduleServiceNote').value.trim() : '',
      job_date: $('#scheduleDate').value,
      start_time: $('#scheduleStart').value,
      end_time: $('#scheduleEnd').value,
      status: $('#scheduleStatus').value,
      notes: $('#scheduleNotes').value.trim()
    };

    button.disabled = true;
    try {
      if (existing && !existing.test_record && lead?.test_record) throw new Error('A real schedule cannot be linked to a local test customer.');
      if (existing?.test_record || lead?.test_record) {
        record.test_record = true;
        const index = state.test.schedule.findIndex(item => item.id === record.id);
        if (index >= 0) state.test.schedule[index] = record; else state.test.schedule.push(record);
        saveTestData();
      } else {
        if (!state.backendReady) throw new Error('Operations backend is not installed yet.');
        const path = existing ? `/api/operations/schedule/${encodeURIComponent(record.id)}` : '/api/operations/schedule';
        const result = await api(path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(record) });
        record.id = result.job?.id || record.id;
        await loadAll();
      }
      $('#scheduleDialog').close();
      renderAll();
      toast('Schedule saved');
    } catch (error) {
      $('#scheduleError').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function deleteSchedule(id) {
    const job = allSchedule().find(item => String(item.id) === String(id));
    if (!job || !confirm(`Delete the scheduled job for ${job.customer}?`)) return;
    if (job.test_record) {
      state.test.schedule = state.test.schedule.filter(item => item.id !== job.id);
      saveTestData();
      renderAll();
      return;
    }
    try {
      await api(`/api/operations/schedule/${encodeURIComponent(job.id)}`, { method:'DELETE' });
      await loadAll();
      toast('Scheduled job deleted');
    } catch (error) { toast(error.message); }
  }

  function calendarRange(job) {
    if (Boolean(job.start_time) !== Boolean(job.end_time)) {
      alert('Add both a start time and end time before adding this as a timed calendar event. Clear both times for an all-day event.');
      return null;
    }
    if (!job.start_time) return { allDay:true, start:job.job_date, end:addDays(job.job_date, 1) };
    return { allDay:false, start:`${job.job_date.replaceAll('-','')}T${job.start_time.replace(':','')}00`, end:`${job.job_date.replaceAll('-','')}T${job.end_time.replace(':','')}00` };
  }

  function calendarDetails(job) {
    return [serviceText(job), job.notes, 'Scheduled in Sparkly Nikki Operations'].filter(Boolean).join('\n\n');
  }

  function googleCalendar(job) {
    if (!job) return;
    const range = calendarRange(job);
    if (!range) return;
    const dates = range.allDay ? `${range.start.replaceAll('-','')}/${range.end.replaceAll('-','')}` : `${range.start}/${range.end}`;
    const params = new URLSearchParams({ action:'TEMPLATE', ctz:'America/Chicago', text:`${job.customer} - ${serviceText(job)}`, dates, details:calendarDetails(job), location:job.address || '' });
    window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank', 'noopener');
  }

  function icsEscape(value) {
    return String(value || '').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  }

  function appleCalendar(job) {
    if (!job) return;
    const range = calendarRange(job);
    if (!range) return;
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sparkly Nikki//Operations//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${job.id}@sparklynikki.com`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`];
    if (range.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${range.start.replaceAll('-','')}`,`DTEND;VALUE=DATE:${range.end.replaceAll('-','')}`);
    } else {
      lines.push(`DTSTART;TZID=America/Chicago:${range.start}`,`DTEND;TZID=America/Chicago:${range.end}`);
    }
    lines.push(`SUMMARY:${icsEscape(`${job.customer} - ${serviceText(job)}`)}`,`LOCATION:${icsEscape(job.address)}`,`DESCRIPTION:${icsEscape(calendarDetails(job))}`,'END:VEVENT','END:VCALENDAR');
    downloadBlob(lines.join('\r\n'), `sparkly-nikki-${job.job_date}.ics`, 'text/calendar;charset=utf-8');
  }

  async function openReminder(id = '', leadId = '') {
    const reminder = allReminders().find(item => String(item.id) === String(id));
    try { await loadCustomerOptions('reminders','',reminder?.lead_id||leadId); }catch(error){toast(error.message);return;}
    $('#reminderOpsForm').reset();
    $('#reminderOpsError').textContent = '';
    $('#reminderOpsId').value = reminder?.id || crypto.randomUUID();
    $('#reminderCustomerSearch').value='';
    $('#reminderOpsDialogTitle').textContent = reminder ? 'Edit reminder' : 'Add reminder';
    fillCustomerSelects('reminders',reminder?.lead_id||leadId);
    $('#reminderOpsTitle').value = reminder?.title || '';
    $('#reminderOpsLeadId').value = reminder?.lead_id || leadId || '';
    $('#reminderOpsDate').value = reminder?.due_date || today();
    $('#reminderOpsTime').value = reminder?.due_time || '';
    $('#reminderOpsNotes').value = reminder?.notes || '';
    $('#reminderOpsDialog').showModal();
  }

  async function saveReminder(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button.disabled) return;
    if (!$('#reminderOpsForm').reportValidity()) return;
    const lead = leadById($('#reminderOpsLeadId').value);
    const existing = allReminders().find(item => String(item.id) === String($('#reminderOpsId').value));
    const record = {
      id: existing?.id || $('#reminderOpsId').value,
      lead_id: lead?.id || null,
      customer: lead?.name || '',
      title: $('#reminderOpsTitle').value.trim(),
      due_date: $('#reminderOpsDate').value,
      due_time: $('#reminderOpsTime').value,
      notes: $('#reminderOpsNotes').value.trim(),
      completed: Boolean(existing?.completed)
    };
    button.disabled = true;
    try {
      if (existing && !existing.test_record && lead?.test_record) throw new Error('A real reminder cannot be linked to a local test customer.');
      if (existing?.test_record || lead?.test_record) {
        record.test_record = true;
        const index = state.test.reminders.findIndex(item => item.id === record.id);
        if (index >= 0) state.test.reminders[index] = record; else state.test.reminders.push(record);
        saveTestData();
      } else {
        if (!state.backendReady) throw new Error('Operations backend is not installed yet.');
        const path = existing ? `/api/operations/reminders/${encodeURIComponent(record.id)}` : '/api/operations/reminders';
        await api(path, { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(record) });
        await loadAll();
      }
      $('#reminderOpsDialog').close();
      renderAll();
      toast('Reminder saved');
    } catch (error) {
      $('#reminderOpsError').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function toggleReminder(id) {
    const reminder = allReminders().find(item => String(item.id) === String(id));
    if (!reminder) return;
    if (reminder.test_record) {
      reminder.completed = !reminder.completed;
      saveTestData();
      renderAll();
      return;
    }
    try {
      await api(`/api/operations/reminders/${encodeURIComponent(reminder.id)}`, { method:'PATCH', body:JSON.stringify({ ...reminder, completed:!reminder.completed }) });
      await loadAll();
    } catch (error) { toast(error.message); }
  }

  async function deleteReminder(id) {
    const reminder = allReminders().find(item => String(item.id) === String(id));
    if (!reminder || !confirm(`Delete reminder "${reminder.title}"?`)) return;
    if (reminder.test_record) {
      state.test.reminders = state.test.reminders.filter(item => item.id !== reminder.id);
      saveTestData();
      renderAll();
      return;
    }
    try {
      await api(`/api/operations/reminders/${encodeURIComponent(reminder.id)}`, { method:'DELETE' });
      await loadAll();
      toast('Reminder deleted');
    } catch (error) { toast(error.message); }
  }

  function appleReminder(reminder) {
    if (!reminder) return;
    if (localStorage.getItem(APPLE_SHORTCUT_KEY) !== '1') {
      $('#appleReminderSetupDialog').showModal();
      return;
    }
    const payload = JSON.stringify({
      title: reminder.title,
      notes: [reminder.notes, reminder.customer ? `Customer: ${reminder.customer}` : ''].filter(Boolean).join('\n'),
      due_date: reminder.due_date,
      due_time: reminder.due_time || ''
    });
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent('Nikki Reminder')}&input=text&text=${encodeURIComponent(payload)}`;
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function manageCustomerInCrm(id) {
    const lead = leadById(id);
    if (!lead || lead.test_record) return;
    const crmButton = $('#nav [data-view="leads"]');
    crmButton?.click();
    setTimeout(() => {
      const search = $('#leadSearch');
      if (!search) return;
      search.value = lead.name || lead.email || lead.phone || '';
      search.dispatchEvent(new Event('input', { bubbles:true }));
    }, 0);
  }

  function createTestCustomer() {
    const id = `ops-test-customer-${crypto.randomUUID()}`;
    const number = state.test.leads.length + 1;
    state.test.leads.push({
      id, test_record:true, created_at:new Date().toISOString(), name:`Test Customer ${number}`,
      phone:`(507) 555-01${String(40 + number).padStart(2,'0')}`, email:`test.customer${number}@example.com`,
      service:'Deep cleaning', status:'Won', notes:'TEST DATA - safe to edit or remove.',
      inquiry_details:{ preferred_contact_method:'Text message', best_contact_time:'Afternoon' }
    });
    return id;
  }

  function createTestSchedule(leadId) {
    const lead = leadById(leadId) || leadById(createTestCustomer());
    state.test.schedule.push({
      id:`ops-test-schedule-${crypto.randomUUID()}`, test_record:true, lead_id:lead.id, customer:lead.name,
      address:'123 Test Street, Rochester, MN 55901', service:'Recurring cleaning', service_note:'',
      job_date:addDays(today(), 1), start_time:'10:00', end_time:'12:00', status:'Scheduled', notes:'TEST DATA - calendar test job.'
    });
  }

  function createTestReminder(leadId) {
    const lead = leadById(leadId) || leadById(createTestCustomer());
    state.test.reminders.push({
      id:`ops-test-reminder-${crypto.randomUUID()}`, test_record:true, lead_id:lead.id, customer:lead.name,
      title:'Follow up with test customer', due_date:addDays(today(), -1), due_time:'16:00', completed:false, notes:'TEST DATA - iPhone reminder test.'
    });
  }

  function renderTestCount() {
    const count = state.test.leads.length + state.test.schedule.length + state.test.reminders.length;
    if ($('#opsTestCount')) $('#opsTestCount').textContent = `${count} test record${count === 1 ? '' : 's'}`;
  }

  function clearTestData() {
    state.test = { leads:[], schedule:[], reminders:[] };
    saveTestData();
    renderAll();
  }

  function destroyTestMode() {
    if (!confirm('Delete all local test data and permanently hide the Test section in this browser?')) return;
    clearTestData();
    localStorage.setItem(TEST_DESTROYED_KEY, '1');
    $('#testNav').hidden = true;
    showSpecialView('operations');
    toast('Test mode removed');
  }

  $('#operationsNav').addEventListener('click', () => showSpecialView('operations'));
  $('#testNav').addEventListener('click', () => showSpecialView('test'));
  $$('#nav [data-view]').forEach(button => button.addEventListener('click', () => {
    $('#operationsNav').classList.remove('active');
    $('#testNav').classList.remove('active');
  }));
  $('#refreshBtn').addEventListener('click',()=>loadAll());
  for(const [name,page] of Object.entries(pages)) {
    $('#'+name+'Previous').addEventListener('click',()=>{if(page.cursors.length>1){page.cursors.pop();loadAll(false);}});
    $('#'+name+'Next').addEventListener('click',()=>{if(page.next){page.cursors.push(page.next);loadAll(false);}});
  }
  for(const [input,kind,select] of [['#scheduleCustomerSearch','schedule','#scheduleLeadId'],['#reminderCustomerSearch','reminders','#reminderOpsLeadId']]) {
    let timer;
    $(input).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>loadCustomerOptions(kind,$(input).value.trim(),$(select).value==='custom'?'':$(select).value).catch(error=>toast(error.message)),300);});
  }
  $$('.operations-tabs button').forEach(button => button.addEventListener('click', () => showOpsTab(button.dataset.opsTab)));
  $('#scheduleFilter').addEventListener('change',()=>loadAll());
  let customerSearchTimer;
  $('#opsCustomerSearch').addEventListener('input',()=>{clearTimeout(customerSearchTimer);customerSearchTimer=setTimeout(()=>loadAll(),300);});
  $('#reminderFilter').addEventListener('change',()=>loadAll());
  $('#scheduleJobBtn').addEventListener('click', () => openSchedule());
  $('#addReminderBtn').addEventListener('click', () => openReminder());
  $('#scheduleService').addEventListener('change', setServiceNoteVisibility);
  $('#scheduleForm').addEventListener('submit', saveSchedule);
  $('#scheduleLeadId').addEventListener('change', fillScheduleCustomer);
  $('#addExistingCustomerBtn').addEventListener('click', () => openCustomer());
  $('#customerOpsForm').addEventListener('submit', saveCustomer);
  $('#reminderOpsForm').addEventListener('submit', saveReminder);
  $('#appleReminderSetupBtn').addEventListener('click', () => $('#appleReminderSetupDialog').showModal());
  $('#markAppleShortcutReady').addEventListener('click', () => {
    localStorage.setItem(APPLE_SHORTCUT_KEY, '1');
    $('#appleReminderSetupDialog').close();
    toast('iPhone Reminders shortcut marked ready');
  });
  $$('[data-close-ops]').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.closeOps;
    if (target === 'customer') $('#customerOpsDialog').close();
    if (target === 'schedule') $('#scheduleDialog').close();
    if (target === 'reminder') $('#reminderOpsDialog').close();
    if (target === 'apple-setup') $('#appleReminderSetupDialog').close();
  }));

  document.addEventListener('click', event => {
    const scheduleEdit = event.target.closest('[data-schedule-edit]');
    const scheduleDelete = event.target.closest('[data-schedule-delete]');
    const google = event.target.closest('[data-schedule-google]');
    const apple = event.target.closest('[data-schedule-apple]');
    const customerSchedule = event.target.closest('[data-customer-schedule]');
    const customerReminder = event.target.closest('[data-customer-reminder]');
    const customerEdit = event.target.closest('[data-customer-edit]');
    if (customerEdit) openCustomer(customerEdit.dataset.customerEdit);
    const customerCrm = event.target.closest('[data-customer-crm]');
    const reminderToggle = event.target.closest('[data-reminder-toggle]');
    const reminderEdit = event.target.closest('[data-reminder-edit]');
    const reminderDelete = event.target.closest('[data-reminder-delete]');
    const reminderIphone = event.target.closest('[data-reminder-iphone]');

    if (scheduleEdit) openSchedule(scheduleEdit.dataset.scheduleEdit);
    if (scheduleDelete) deleteSchedule(scheduleDelete.dataset.scheduleDelete);
    if (google) googleCalendar(allSchedule().find(item => String(item.id) === String(google.dataset.scheduleGoogle)));
    if (apple) appleCalendar(allSchedule().find(item => String(item.id) === String(apple.dataset.scheduleApple)));
    if (customerSchedule) { openSchedule('', customerSchedule.dataset.customerSchedule); showOpsTab('schedule'); }
    if (customerReminder) { openReminder('', customerReminder.dataset.customerReminder); showOpsTab('reminders'); }
    if (customerCrm) manageCustomerInCrm(customerCrm.dataset.customerCrm);
    if (reminderToggle) toggleReminder(reminderToggle.dataset.reminderToggle);
    if (reminderEdit) openReminder(reminderEdit.dataset.reminderEdit);
    if (reminderDelete) deleteReminder(reminderDelete.dataset.reminderDelete);
    if (reminderIphone) appleReminder(allReminders().find(item => String(item.id) === String(reminderIphone.dataset.reminderIphone)));
  });

  $('#addOpsTestCustomer').addEventListener('click', () => { createTestCustomer(); saveTestData(); renderAll(); toast('Test customer added'); });
  $('#addOpsTestSchedule').addEventListener('click', () => { createTestSchedule(state.test.leads[0]?.id); saveTestData(); renderAll(); toast('Test schedule added'); });
  $('#addOpsTestReminder').addEventListener('click', () => { createTestReminder(state.test.leads[0]?.id); saveTestData(); renderAll(); toast('Test reminder added'); });
  $('#addOpsFullTestSet').addEventListener('click', () => {
    const leadId = createTestCustomer();
    createTestSchedule(leadId);
    createTestReminder(leadId);
    saveTestData();
    renderAll();
    toast('Full test set added');
  });
  $('#clearOpsTestData').addEventListener('click', () => { clearTestData(); toast('Test data cleared'); });
  $('#destroyOpsTestMode').addEventListener('click', destroyTestMode);

  if (testDestroyed()) $('#testNav').hidden = true;
  renderAll();
})();
