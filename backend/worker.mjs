var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/pagination.js
function pageRequest(url, scope, keyCount) {
  const requested = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100) : 25;
  const raw = url.searchParams.get("cursor");
  let keys = null;
  if (raw) {
    try {
      if (raw.length > 2e3) throw new Error();
      const cursor = JSON.parse(raw);
      if (cursor.scope !== scope || !Array.isArray(cursor.keys) || cursor.keys.length !== keyCount || cursor.keys.some((value) => typeof value === "number" ? !Number.isFinite(value) : typeof value !== "string")) throw new Error();
      keys = cursor.keys;
    } catch {
      const error = new Error("Invalid page cursor. Refresh this list.");
      error.status = 400;
      throw error;
    }
  }
  return { limit, keys, scope };
}
__name(pageRequest, "pageRequest");
function pageResult(rows, page, keys) {
  const more = rows.length > page.limit;
  const records = rows.slice(0, page.limit);
  return {
    records,
    nextCursor: more ? JSON.stringify({ scope: page.scope, keys: keys(records.at(-1)) }) : null
  };
}
__name(pageResult, "pageResult");
function searchPattern(value) {
  return "%" + value.replace(/[\\%_]/g, "\\$&") + "%";
}
__name(searchPattern, "searchPattern");

// src/operations-extension.js
var SERVICES = /* @__PURE__ */ new Set([
  "Recurring cleaning",
  "One-time cleaning",
  "Deep cleaning",
  "Move-in / move-out",
  "Other"
]);
var SCHEDULE_STATUSES = /* @__PURE__ */ new Set(["Scheduled", "In Progress", "Completed", "Cancelled"]);
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = /* @__PURE__ */ new Set(["https://sparklynikki.com", "https://www.sparklynikki.com"]);
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    ...allowed.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}
  };
}
__name(corsHeaders, "corsHeaders");
function json(request, value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders(request) });
}
__name(json, "json");
function clean(value, max = 4e3) {
  return String(value ?? "").trim().slice(0, max);
}
__name(clean, "clean");
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
__name(validDate, "validDate");
function validTime(value) {
  return value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
__name(validTime, "validTime");
async function bodyJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON body.");
  }
}
__name(bodyJson, "bodyJson");
function scheduleRecord(input, existing = {}) {
  const record = {
    id: clean(input.id || existing.id || crypto.randomUUID(), 100),
    lead_id: clean(input.lead_id ?? existing.lead_id ?? "", 100) || null,
    customer: clean(input.customer ?? existing.customer, 160),
    address: clean(input.address ?? existing.address, 240),
    service: clean(input.service ?? existing.service, 80),
    service_note: clean(input.service_note ?? existing.service_note, 180),
    job_date: clean(input.job_date ?? existing.job_date, 10),
    start_time: clean(input.start_time ?? existing.start_time, 5),
    end_time: clean(input.end_time ?? existing.end_time, 5),
    status: clean(input.status ?? existing.status ?? "Scheduled", 30),
    notes: clean(input.notes ?? existing.notes, 2e3)
  };
  if (!record.customer) throw new Error("Customer is required.");
  if (!SERVICES.has(record.service)) throw new Error("Invalid service.");
  if (record.service !== "Other") record.service_note = "";
  if (!validDate(record.job_date)) throw new Error("Valid job date is required.");
  if (!validTime(record.start_time) || !validTime(record.end_time)) throw new Error("Invalid time.");
  if (Boolean(record.start_time) !== Boolean(record.end_time)) throw new Error("Start and end time must both be set, or both be blank.");
  if (record.start_time && record.end_time <= record.start_time) throw new Error("End time must be later than start time.");
  if (!SCHEDULE_STATUSES.has(record.status)) throw new Error("Invalid schedule status.");
  return record;
}
__name(scheduleRecord, "scheduleRecord");
function reminderRecord(input, existing = {}) {
  const record = {
    id: clean(input.id || existing.id || crypto.randomUUID(), 100),
    lead_id: clean(input.lead_id ?? existing.lead_id ?? "", 100) || null,
    customer: clean(input.customer ?? existing.customer, 160),
    title: clean(input.title ?? existing.title, 180),
    due_date: clean(input.due_date ?? existing.due_date, 10),
    due_time: clean(input.due_time ?? existing.due_time, 5),
    notes: clean(input.notes ?? existing.notes, 2e3),
    completed: input.completed === void 0 ? Number(existing.completed || 0) : Number(Boolean(input.completed))
  };
  if (!record.title) throw new Error("Reminder title is required.");
  if (!validDate(record.due_date)) throw new Error("Valid due date is required.");
  if (!validTime(record.due_time)) throw new Error("Invalid due time.");
  return record;
}
__name(reminderRecord, "reminderRecord");
async function checkCustomerLink(env, id, previousId) {
  if (!id || String(id) === String(previousId)) return;
  const lead = await env.DB.prepare("SELECT id FROM leads WHERE id=? AND deleted_at IS NULL").bind(id).first();
  if (!lead) throw new Error("Customer was removed or no longer exists. Refresh and select another customer.");
}
async function scheduleRoutes(request, env, pathname) {
  const method = request.method.toUpperCase();
  if (pathname === "/api/operations/schedule") {
    if (method === "GET") {
      const url = new URL(request.url), filter = url.searchParams.get("filter") || "all";
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      const page = pageRequest(url, JSON.stringify(["schedule", filter, today]), 3);
      let where = "1=1";
      const args = [];
      if (filter === "upcoming") {
        where = "job_date>=? AND status NOT IN ('Completed','Cancelled')";
        args.push(today);
      }
      if (filter === "today") {
        where = "job_date=? AND status<>'Cancelled'";
        args.push(today);
      }
      if (filter === "completed" || filter === "cancelled") {
        where = "status=?";
        args.push(filter === "completed" ? "Completed" : "Cancelled");
      }
      if (page.keys) {
        where += " AND (job_date,start_time,id)>(?,?,?)";
        args.push(...page.keys);
      }
      const rows = (await env.DB.prepare("SELECT * FROM operations_schedule WHERE " + where + " ORDER BY job_date,start_time,id LIMIT ?").bind(...args, page.limit + 1).all()).results;
      const result = pageResult(rows, page, (row) => [row.job_date, row.start_time, row.id]);
      const summary = await env.DB.prepare(`SELECT COUNT(*) upcoming,COALESCE(SUM(job_date=?),0) today,
        COALESCE(SUM(job_date<=date(?,'+7 days')),0) week FROM operations_schedule
        WHERE job_date>=? AND status NOT IN ('Completed','Cancelled')`).bind(today, today, today).first();
      return json(request, { jobs: result.records, nextCursor: result.nextCursor, summary });
    }
    if (method === "POST") {
      const record = scheduleRecord(await bodyJson(request));
      await checkCustomerLink(env, record.lead_id);
      await env.DB.prepare(`
        INSERT OR IGNORE INTO operations_schedule
        (id, lead_id, customer, address, service, service_note, job_date, start_time, end_time, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        record.id,
        record.lead_id,
        record.customer,
        record.address,
        record.service,
        record.service_note,
        record.job_date,
        record.start_time,
        record.end_time,
        record.status,
        record.notes
      ).run();
      return json(request, { ok: true, job: await env.DB.prepare("SELECT * FROM operations_schedule WHERE id=?").bind(record.id).first() }, 201);
    }
  }
  const match = pathname.match(/^\/api\/operations\/schedule\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  if (method === "PATCH") {
    const existing = await env.DB.prepare("SELECT * FROM operations_schedule WHERE id = ?").bind(id).first();
    if (!existing) return json(request, { error: "Scheduled job not found." }, 404);
    const record = scheduleRecord({ ...await bodyJson(request), id }, existing);
    await checkCustomerLink(env, record.lead_id, existing.lead_id);
    await env.DB.prepare(`
      UPDATE operations_schedule
      SET lead_id = ?, customer = ?, address = ?, service = ?, service_note = ?, job_date = ?,
          start_time = ?, end_time = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      record.lead_id,
      record.customer,
      record.address,
      record.service,
      record.service_note,
      record.job_date,
      record.start_time,
      record.end_time,
      record.status,
      record.notes,
      id
    ).run();
    return json(request, { ok: true, job: record });
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM operations_schedule WHERE id = ?").bind(id).run();
    return json(request, { ok: true });
  }
  return json(request, { error: "Method not allowed." }, 405);
}
__name(scheduleRoutes, "scheduleRoutes");
async function reminderRoutes(request, env, pathname) {
  const method = request.method.toUpperCase();
  if (pathname === "/api/operations/reminders") {
    if (method === "GET") {
      const url = new URL(request.url), filter = url.searchParams.get("filter") || "all";
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      const page = pageRequest(url, JSON.stringify(["reminders", filter, today]), 4);
      let where = "1=1";
      const args = [];
      if (filter === "open") where = "completed=0";
      if (filter === "completed") where = "completed=1";
      if (filter === "today" || filter === "overdue") {
        where = "completed=0 AND due_date" + (filter === "today" ? "=" : "<") + "?";
        args.push(today);
      }
      if (page.keys) {
        const fixedStatus = ["open", "completed", "today", "overdue"].includes(filter);
        where += fixedStatus ? " AND (due_date,due_time,id)>(?,?,?)" : " AND (completed,due_date,due_time,id)>(?,?,?,?)";
        args.push(...fixedStatus ? page.keys.slice(1) : page.keys);
      }
      const rows = (await env.DB.prepare("SELECT * FROM operations_reminders WHERE " + where + " ORDER BY completed,due_date,due_time,id LIMIT ?").bind(...args, page.limit + 1).all()).results;
      const result = pageResult(rows, page, (row) => [row.completed, row.due_date, row.due_time, row.id]);
      const summary = await env.DB.prepare(`SELECT COUNT(*) open,COALESCE(SUM(due_date=?),0) today,
        COALESCE(SUM(due_date<?),0) overdue FROM operations_reminders WHERE completed=0`).bind(today, today).first();
      return json(request, { reminders: result.records, nextCursor: result.nextCursor, summary });
    }
    if (method === "POST") {
      const record = reminderRecord(await bodyJson(request));
      await checkCustomerLink(env, record.lead_id);
      await env.DB.prepare(`
        INSERT OR IGNORE INTO operations_reminders
        (id, lead_id, customer, title, due_date, due_time, notes, completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(record.id, record.lead_id, record.customer, record.title, record.due_date, record.due_time, record.notes, record.completed).run();
      return json(request, { ok: true, reminder: await env.DB.prepare("SELECT * FROM operations_reminders WHERE id=?").bind(record.id).first() }, 201);
    }
  }
  const match = pathname.match(/^\/api\/operations\/reminders\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  if (method === "PATCH") {
    const existing = await env.DB.prepare("SELECT * FROM operations_reminders WHERE id = ?").bind(id).first();
    if (!existing) return json(request, { error: "Reminder not found." }, 404);
    const record = reminderRecord({ ...await bodyJson(request), id }, existing);
    await checkCustomerLink(env, record.lead_id, existing.lead_id);
    await env.DB.prepare(`
      UPDATE operations_reminders
      SET lead_id = ?, customer = ?, title = ?, due_date = ?, due_time = ?, notes = ?, completed = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(record.lead_id, record.customer, record.title, record.due_date, record.due_time, record.notes, record.completed, id).run();
    return json(request, { ok: true, reminder: record });
  }
  if (method === "DELETE") {
    await env.DB.prepare("DELETE FROM operations_reminders WHERE id = ?").bind(id).run();
    return json(request, { ok: true });
  }
  return json(request, { error: "Method not allowed." }, 405);
}
__name(reminderRoutes, "reminderRoutes");
async function removeCustomer(env, id) {
  const result = await env.DB.prepare("UPDATE leads SET deleted_at=COALESCE(deleted_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id=? RETURNING id").bind(id).first();
  return result ? { ok: true, id: result.id } : null;
}
async function customerRoutes(request, env, pathname) {
  const match = pathname.match(/^\/api\/operations\/customers(?:\/(\d+))?$/);
  if (!match) return null;
  if (request.method === "DELETE" && match[1]) {
    const result = await removeCustomer(env, Number(match[1]));
    return result ? json(request, result) : json(request, { error: "Customer not found." }, 404);
  }
  const editing = request.method === "PATCH" && match[1];
  if (!editing && (request.method !== "POST" || match[1])) return json(request, { error: "Method not allowed." }, 405);
  const input = await bodyJson(request);
  const name = clean(input.name, 160), email = clean(input.email, 200).toLowerCase(), phone = clean(input.phone, 80);
  let normalizedPhone = phone.replace(/\D/g, "");
  if (normalizedPhone.length === 10) normalizedPhone = "1" + normalizedPhone;
  if (!name) throw new Error("Customer name is required.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (phone && !/^\d{7,15}$/.test(normalizedPhone)) throw new Error("Enter a valid phone number.");
  const id = editing ? Number(match[1]) : null;
  const existing = id ? await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first() : null;
  if (id && (!existing || existing.deleted_at)) return json(request, { error: "Customer not found." }, 404);
  const requestId = clean(input.request_id, 36);
  if (!editing && !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid save request. Reopen the form and try again.");
  const visitorId = "manual:" + requestId;
  if (!editing) {
    const saved2 = await env.DB.prepare("SELECT id FROM leads WHERE visitor_id = ?").bind(visitorId).first();
    if (saved2) return json(request, { ok: true, id: saved2.id });
  }
  const duplicate = await env.DB.prepare(`SELECT id FROM leads WHERE deleted_at IS NULL AND id <> ? AND
    ((? <> '' AND normalized_email = ?) OR (? <> '' AND normalized_phone = ?)) LIMIT 1`).bind(id || 0, email, email, normalizedPhone, normalizedPhone).first();
  if (duplicate) return json(request, { error: "This email or phone belongs to another CRM record. Edit that record instead." }, 409);
  const latest = id ? await env.DB.prepare("SELECT id, details FROM inquiries WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).first() : null;
  let details = {};
  try {
    details = JSON.parse(latest?.details || "{}") || {};
  } catch (_) {
  }
  for (const key of ["preferred_contact_method", "best_contact_time", "address"]) details[key] = clean(input.details?.[key], 240);
  const service = clean(input.service, 180), notes = clean(input.notes, 4e3), message = clean(input.message, 3e3);
  const statements = [];
  if (editing) {
    statements.push(env.DB.prepare(`UPDATE leads SET name=?, email=?, phone=?, normalized_email=?, normalized_phone=?,
      service=?, message=?, notes=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(name, email, phone, email, normalizedPhone, service, message, notes, id));
    for (const table of ["operations_schedule", "operations_reminders", "jobs"]) {
      statements.push(env.DB.prepare(`UPDATE ${table} SET customer=? WHERE lead_id=?`).bind(name, String(id)));
    }
  } else {
    statements.push(env.DB.prepare(`INSERT INTO leads(name,email,phone,normalized_email,normalized_phone,service,message,notes,status,source,visitor_id)
      SELECT ?,?,?,?,?,?,?,?,'Won','Existing customer',? WHERE NOT EXISTS(SELECT 1 FROM leads WHERE deleted_at IS NULL AND (visitor_id=? OR
      (?<>'' AND normalized_email=?) OR (?<>'' AND normalized_phone=?)))`).bind(name, email, phone, email, normalizedPhone, service, message, notes, visitorId, visitorId, email, email, normalizedPhone, normalizedPhone));
  }
  if (latest) {
    statements.push(env.DB.prepare("UPDATE inquiries SET details=?, message=?, service=? WHERE id=?").bind(JSON.stringify(details), message, service, latest.id));
  } else {
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO inquiries(id,lead_id,service,page,form,landing_page,referrer,source,medium,campaign,content,term,message,details)
      SELECT ?,id,?,'/admin/','existing-customer','/admin/','','Existing customer','','','','',?,? FROM leads WHERE ${editing ? "id=?" : "visitor_id=?"}`).bind(editing ? crypto.randomUUID() : requestId, service, message, JSON.stringify(details), editing ? id : visitorId));
  }
  await env.DB.batch(statements);
  const saved = editing ? { id } : await env.DB.prepare("SELECT id FROM leads WHERE visitor_id=?").bind(visitorId).first();
  if (!saved) return json(request, { error: "This customer was just added. Refresh Customers before trying again." }, 409);
  return json(request, { ok: true, id: saved.id }, editing ? 200 : 201);
}
__name(customerRoutes, "customerRoutes");
async function handleOperationsRequest(request, env, pathname, isAuthorized) {
  if (!pathname.startsWith("/api/operations/")) return null;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  if (!isAuthorized) return json(request, { error: "Unauthorized" }, 401);
  try {
    return await customerRoutes(request, env, pathname) || await scheduleRoutes(request, env, pathname) || await reminderRoutes(request, env, pathname) || json(request, { error: "Not found." }, 404);
  } catch (error) {
    return json(request, { error: error?.message || "Request failed." }, 400);
  }
}
__name(handleOperationsRequest, "handleOperationsRequest");

// src/worker.js
var enc = new TextEncoder();
var json2 = /* @__PURE__ */ __name((data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }), "json");
var clamp = /* @__PURE__ */ __name((v, n = 2e3) => String(v ?? "").trim().slice(0, n), "clamp");
var allowedEvents = /* @__PURE__ */ new Set(["page_view", "phone_click", "email_click", "cta_click", "service_view", "form_start", "form_submit"]);
var validStatuses = /* @__PURE__ */ new Set(["New", "Contacted", "Quote Sent", "Won", "Lost"]);
function cors(req, env) {
  const origin = req.headers.get("origin") || "";
  const allowed = ["https://sparklynikki.com", "https://www.sparklynikki.com"];
  if (!allowed.includes(origin)) return null;
  return { "access-control-allow-origin": origin, "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "Content-Type,Authorization", "access-control-max-age": "86400", "access-control-expose-headers": "X-Next-Cursor", "vary": "Origin" };
}
__name(cors, "cors");
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64u(new Uint8Array(sig));
}
__name(hmac, "hmac");
function b64u(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
__name(b64u, "b64u");
function ub64u(s) {
  s = s.replaceAll("-", "+").replaceAll("_", "/");
  while (s.length % 4) s += "=";
  return atob(s);
}
__name(ub64u, "ub64u");
function ctEqual(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
__name(ctEqual, "ctEqual");
async function token(env) {
  const p = b64u(enc.encode(JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1e3) + 8 * 3600, nonce: crypto.randomUUID() })));
  return `${p}.${await hmac(env.SESSION_SECRET, p)}`;
}
__name(token, "token");
async function auth(req, env) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ") || h.length > 2048) return false;
  const t = h.slice(7), parts = t.split("."), [p, s] = parts;
  if (parts.length !== 2 || !p || !s || !ctEqual(await hmac(env.SESSION_SECRET, p), s)) return false;
  try {
    const raw = ub64u(p), bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)), d = JSON.parse(new TextDecoder().decode(bytes));
    if (d.sub !== "admin" || !Number.isFinite(d.exp) || d.exp <= Math.floor(Date.now() / 1e3)) return false;
    return !await env.DB.prepare("SELECT bucket FROM rate_limits WHERE bucket=? AND reset_at>?").bind("revoked:" + await anonId(env, t), Math.floor(Date.now() / 1e3)).first();
  } catch {
    return false;
  }
}
__name(auth, "auth");
function getVisitor(body) {
  return /^[0-9a-f-]{36}$/i.test(body.visitor_id || "") ? body.visitor_id : crypto.randomUUID();
}
__name(getVisitor, "getVisitor");
async function anonId(env, raw) {
  return (await hmac(env.SESSION_SECRET, raw)).slice(0, 32);
}
__name(anonId, "anonId");
function sourceFrom(body) {
  if (body.utm_source) return clamp(body.utm_source, 120);
  const ref = clamp(body.referrer, 500);
  if (!ref) return "Direct";
  try {
    const h = new URL(ref).hostname.toLowerCase();
    if (h.includes("google.")) return "Google";
    if (h.includes("facebook.") || h.includes("fb.")) return "Facebook";
    if (h.includes("instagram.")) return "Instagram";
    if (h.includes("bing.")) return "Bing";
    return h.replace(/^www\./, "");
  } catch {
    return "Referral";
  }
}
__name(sourceFrom, "sourceFrom");
function since(days) {
  if (days === "all") return "1970-01-01T00:00:00.000Z";
  const n = Math.max(1, Math.min(3650, Number(days) || 30));
  return new Date(Date.now() - n * 864e5).toISOString();
}
__name(since, "since");
async function rateLimit(env, key, limit = 120, seconds = 60) {
  const now = Math.floor(Date.now() / 1e3), reset = now + seconds;
  const row = await env.DB.prepare("INSERT INTO rate_limits(bucket,hits,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING hits").bind(key, reset, now, now).first();
  return row.hits <= limit;
}
__name(rateLimit, "rateLimit");
async function ipHashKey(req, env) {
  return anonId(env, "rate:" + (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) + ":" + (req.headers.get("cf-connecting-ip") || "unknown"));
}
__name(ipHashKey, "ipHashKey");
async function readBody(req) {
  const text = await req.text();
  if (text.length > 16384) throw new Error("Invalid body");
  const body = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  return body;
}
__name(readBody, "readBody");
async function handleEvent(req, env, headers) {
  if (!await rateLimit(env, "evt:" + await ipHashKey(req, env), 120, 60)) return json2({ error: "Too many requests" }, 429, headers);
  let b;
  try {
    b = await readBody(req);
  } catch {
    return json2({ error: "Invalid JSON" }, 400, headers);
  }
  const event = clamp(b.event, 50);
  if (!allowedEvents.has(event)) return json2({ error: "Invalid event" }, 400, headers);
  const id = /^[0-9a-f-]{36}$/i.test(b.event_id || "") ? b.event_id : crypto.randomUUID();
  const visitor = await anonId(env, getVisitor(b)), source = sourceFrom(b), cf = req.cf || {};
  const page = clamp(b.page, 500), landing = clamp(b.landing_page || page, 500), form = clamp(b.form, 100);
  const services = { "/residential-cleaning.html": "Standard / recurring", "/deep-cleaning.html": "Deep clean", "/move-out-cleaning.html": "Move-in / move-out" };
  const service = clamp(b.lead?.service || b.service || services[page] || "", 180);
  const referrer = clamp(b.referrer, 500), medium = clamp(b.utm_medium, 120), campaign = clamp(b.utm_campaign, 160), content = clamp(b.utm_content, 160), term = clamp(b.utm_term, 160);
  const statements = [];
  if (event === "form_submit") {
    const l = b.lead || {}, name = clamp(l.name, 160), email = clamp(l.email, 200).toLowerCase(), phone = clamp(l.phone, 80), message = clamp(l.message, 3e3);
    let digits = phone.replace(/\D/g, "");
    if (digits.length === 10) digits = "1" + digits;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), validPhone = /^\d{7,15}$/.test(digits);
    if (!name || !validEmail && !validPhone || l.honeypot) return json2({ error: "Invalid inquiry" }, 400, headers);
    const ne = validEmail ? email : "", np = validPhone ? digits : "";
    const match = "deleted_at IS NULL AND ((?<>'' AND normalized_email=?) OR (?<>'' AND normalized_phone=? AND (?='' OR normalized_email='' OR normalized_email=?) AND (?<>'' OR normalized_email='' OR (SELECT COUNT(DISTINCT p.normalized_email) FROM leads p WHERE p.deleted_at IS NULL AND p.normalized_phone=? AND p.normalized_email<>'')<=1)))";
    const args = [ne, ne, np, np, ne, ne, ne, np];
    const selected = `SELECT id FROM leads WHERE ${match} ORDER BY CASE WHEN normalized_email=? AND ?<>'' THEN 0 ELSE 1 END,id LIMIT 1`;
    const selectArgs = [...args, ne, ne];
    const fresh = "NOT EXISTS(SELECT 1 FROM events WHERE event_id=?)";
    statements.push(env.DB.prepare(`INSERT INTO leads(name,email,phone,service,message,source,medium,campaign,landing_page,visitor_id,normalized_email,normalized_phone,referrer,content,term) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM leads WHERE ${match}) AND ${fresh}`).bind(name, email, phone, service, message, source, medium, campaign, landing, visitor, ne, np, referrer, content, term, ...args, id));
    statements.push(env.DB.prepare(`UPDATE leads SET name=?,email=CASE WHEN ?<>'' THEN ? ELSE email END,phone=CASE WHEN ?<>'' THEN ? ELSE phone END,normalized_email=CASE WHEN ?<>'' THEN ? ELSE normalized_email END,normalized_phone=CASE WHEN ?<>'' THEN ? ELSE normalized_phone END,service=?,message=?,submission_count=submission_count+1,last_page=?,last_form=?,last_contact_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=(${selected}) AND ${fresh}`).bind(name, ne, email, np, phone, ne, ne, np, np, service, message, page, form, ...selectArgs, id));
    const details = {};
    for (const key of ["source_page", "zip_code", "bedrooms", "bathrooms", "square_feet", "frequency", "preferred_contact_method", "best_contact_time", "preferred_timing", "pets", "inside_fridge", "inside_oven", "interior_windows"]) if (l.details?.[key]) details[key] = clamp(l.details[key], 200);
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO inquiries(id,lead_id,service,page,form,landing_page,referrer,source,medium,campaign,content,term,message,details) SELECT ?,id,?,?,?,?,?,?,?,?,?,?,?,? FROM leads WHERE id=(${selected}) AND ${fresh}`).bind(id, service, page, form, landing, referrer, source, medium, campaign, content, term, message, JSON.stringify(details), ...selectArgs, id));
    if (form === "quote-form" && (page === "/" || page === "/index.html")) statements.push(env.DB.prepare("INSERT OR IGNORE INTO quote_requests(id,lead_id,service) SELECT id,lead_id,service FROM inquiries WHERE id=?").bind(id));
  }
  statements.push(env.DB.prepare("INSERT OR IGNORE INTO events(event_id,visitor_id,event,page,title,label,referrer,source,medium,campaign,content,term,country,region,city,landing_page,form,service) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, visitor, event, page, clamp(b.title, 250), clamp(b.label, 150), referrer, source, medium, campaign, content, term, clamp(cf.country, 80), clamp(cf.region, 120), clamp(cf.city, 120), landing, form, service));
  await env.DB.batch(statements);
  return json2({ ok: true }, 200, headers);
}
__name(handleEvent, "handleEvent");
var ledgerFinance = `WITH finance AS (
 SELECT j.id,j.lead_id,j.service,COALESCE(NULLIF(l.source,''),'Manual') source,COALESCE(l.campaign,'') campaign,j.job_date day,COALESCE(j.quoted_cents,0)/100.0 quoted,j.collected_cents/100.0 revenue,MAX(COALESCE(j.quoted_cents,0)-j.collected_cents,0)/100.0 balance,(j.payment_status='Paid') won FROM jobs j LEFT JOIN leads l ON l.id=j.lead_id WHERE j.deleted_at IS NULL
 UNION ALL
 SELECT 'lead-'||l.id,l.id,l.service,COALESCE(NULLIF(l.source,''),'Direct'),COALESCE(l.campaign,''),substr(l.created_at,1,10),l.quote_amount,l.revenue,MAX(l.quote_amount-l.revenue,0),(l.status='Won') FROM leads l WHERE NOT EXISTS(SELECT 1 FROM ledger_leads m WHERE m.lead_id=l.id)
)`;
async function ledgerSummary(env, start, trafficNames = []) {
  const day = start.slice(0, 10), q = /* @__PURE__ */ __name(async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results, "q");
  const totals = await env.DB.prepare(`${ledgerFinance} SELECT COALESCE(SUM(revenue),0) revenue,COALESCE(SUM(quoted),0) quoteValue,COALESCE(SUM(balance),0) openPipeline,COALESCE(SUM(won),0) wonJobs,COALESCE(SUM(revenue)/NULLIF(SUM(revenue>0),0),0) avgJob FROM finance WHERE day>=?`).bind(day).first();
  const breakdown = /* @__PURE__ */ __name((field, fallback) => q(`${ledgerFinance}, contributions AS (
   SELECT COALESCE(NULLIF(${field},''),'${fallback}') name,COUNT(*) leads,0 customers,0 revenue
   FROM leads WHERE created_at>=? GROUP BY name
   UNION ALL
   SELECT COALESCE(NULLIF(${field},''),'${fallback}') name,0 leads,SUM(won) customers,SUM(revenue) revenue
   FROM finance WHERE day>=? GROUP BY name)
   SELECT name,SUM(leads) leads,SUM(customers) customers,SUM(revenue) revenue FROM contributions
   GROUP BY name ORDER BY revenue DESC,leads DESC,name LIMIT 20`, start, day), "breakdown");
  const sources = await breakdown("source", "Direct");
  const services = await breakdown("service", "General inquiry");
  const traffic = trafficNames.length ? await q(`${ledgerFinance} SELECT source||CASE WHEN campaign<>'' THEN ' \xB7 '||campaign ELSE '' END name,SUM(revenue) revenue FROM finance WHERE day>=? AND (source||CASE WHEN campaign<>'' THEN ' \xB7 '||campaign ELSE '' END) IN (${trafficNames.map(() => "?").join(",")}) GROUP BY source,campaign`, day, ...trafficNames) : [];
  const jobs = await q("SELECT j.*,l.name lead_name FROM jobs j LEFT JOIN leads l ON l.id=j.lead_id WHERE j.deleted_at IS NULL AND j.job_date>=? ORDER BY j.job_date DESC,j.created_at DESC,j.id DESC LIMIT 10", day);
  return { totals, sources, services, traffic, jobs };
}
__name(ledgerSummary, "ledgerSummary");
function ledgerLeadUpdates(env, id) {
  if (!id) return [];
  return [
    env.DB.prepare("INSERT OR IGNORE INTO ledger_leads(lead_id,prior_status) SELECT id,status FROM leads WHERE id=?").bind(id),
    env.DB.prepare("UPDATE ledger_leads SET prior_status=(SELECT status FROM leads WHERE id=?),promoted=1 WHERE lead_id=? AND promoted=0 AND (SELECT status FROM leads WHERE id=?)<>'Won' AND EXISTS(SELECT 1 FROM jobs WHERE lead_id=? AND deleted_at IS NULL AND payment_status='Paid')").bind(id, id, id, id),
    env.DB.prepare("UPDATE leads SET status='Won',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND EXISTS(SELECT 1 FROM jobs WHERE lead_id=? AND deleted_at IS NULL AND payment_status='Paid')").bind(id, id),
    env.DB.prepare("UPDATE leads SET status=(SELECT prior_status FROM ledger_leads WHERE lead_id=?),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='Won' AND EXISTS(SELECT 1 FROM ledger_leads WHERE lead_id=? AND promoted=1) AND NOT EXISTS(SELECT 1 FROM jobs WHERE lead_id=? AND deleted_at IS NULL AND payment_status='Paid')").bind(id, id, id, id),
    env.DB.prepare("UPDATE ledger_leads SET promoted=0 WHERE lead_id=? AND NOT EXISTS(SELECT 1 FROM jobs WHERE lead_id=? AND deleted_at IS NULL AND payment_status='Paid')").bind(id, id)
  ];
}
__name(ledgerLeadUpdates, "ledgerLeadUpdates");
async function ledgerRoute(req, env, url, headers) {
  const match = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})$/i), id = match?.[1];
  if (req.method === "GET" && url.pathname === "/api/jobs") return json2(await jobsPage(env, url), 200, headers);
  if (!["POST", "PATCH", "DELETE"].includes(req.method) || req.method !== "POST" && !id) return json2({ error: "Not found" }, 404, headers);
  const old = id ? await env.DB.prepare("SELECT * FROM jobs WHERE id=? AND deleted_at IS NULL").bind(id).first() : null;
  if (id && !old) return json2({ error: "Job not found" }, 404, headers);
  if (req.method === "DELETE") {
    await env.DB.batch([env.DB.prepare("UPDATE jobs SET deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(id), ...ledgerLeadUpdates(env, old.lead_id)]);
    return json2({ ok: true }, 200, headers);
  }
  let b;
  try {
    b = await readBody(req);
  } catch {
    return json2({ error: "Invalid job" }, 400, headers);
  }
  const jobId = id || b.id, customer = clamp(b.customer, 160), service = clamp(b.service, 180), date = clamp(b.job_date, 10), notes = clamp(b.notes, 4e3), status = b.payment_status, method = b.payment_method;
  const cents = /* @__PURE__ */ __name((v, optional = false) => {
    if (optional && (v === "" || v === null || v === void 0)) return null;
    const s = String(v ?? "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return NaN;
    const n = Math.round(Number(s) * 100);
    return Number.isSafeInteger(n) && n <= 1e10 ? n : NaN;
  }, "cents");
  const quoted = cents(b.amount_quoted, true), collected = cents(b.amount_collected);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
  if (!/^[0-9a-f-]{36}$/i.test(jobId || "") || !customer || !service || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > today || !["Paid", "Partial", "Unpaid"].includes(status) || !["Cash", "Card", "Check", "Venmo", "Other"].includes(method) || Number.isNaN(quoted) || Number.isNaN(collected)) return json2({ error: "Check the name, service, date and amounts. Use today or an earlier job date." }, 400, headers);
  if (status === "Paid" && !(collected > 0 && (quoted === null || collected >= quoted)) || status === "Partial" && !(quoted > collected && collected > 0) || status === "Unpaid" && !(collected === 0 && quoted > 0)) return json2({ error: "Paid needs full payment; Partial needs a larger quoted amount; Unpaid needs a quote and zero collected." }, 400, headers);
  let lead = null;
  if (b.lead_id) {
    lead = await env.DB.prepare("SELECT id FROM leads WHERE id=? AND (deleted_at IS NULL OR id=?)").bind(Number(b.lead_id), old?.lead_id || null).first();
    if (!lead) return json2({ error: "Linked lead not found" }, 400, headers);
  } else if (old && old.customer === customer) lead = old.lead_id ? { id: old.lead_id } : null;
  else {
    const candidates = (await env.DB.prepare("SELECT id FROM leads WHERE deleted_at IS NULL AND (lower(trim(name))=lower(?) OR normalized_email=lower(?)) ORDER BY id LIMIT 2").bind(customer, customer).all()).results;
    if (candidates.length === 1 && (customer.includes("@") || customer.trim().split(/\s+/).length >= 2)) lead = candidates[0];
  }
  const leadId = lead?.id || null;
  if (!id) {
    const existing = await env.DB.prepare("SELECT id FROM jobs WHERE id=?").bind(jobId).first();
    if (existing) return json2({ ok: true, id: jobId }, 200, headers);
  }
  const mutation = id ? env.DB.prepare("UPDATE jobs SET lead_id=?,customer=?,service=?,quoted_cents=?,collected_cents=?,payment_status=?,payment_method=?,job_date=?,notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND deleted_at IS NULL").bind(leadId, customer, service, quoted, collected, status, method, date, notes, jobId) : env.DB.prepare("INSERT OR IGNORE INTO jobs(id,lead_id,customer,service,quoted_cents,collected_cents,payment_status,payment_method,job_date,notes) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(jobId, leadId, customer, service, quoted, collected, status, method, date, notes);
  await env.DB.batch([mutation, ...ledgerLeadUpdates(env, leadId), ...old?.lead_id && old.lead_id !== leadId ? ledgerLeadUpdates(env, old.lead_id) : []]);
  return json2({ ok: true, id: jobId }, 200, headers);
}
__name(ledgerRoute, "ledgerRoute");
async function businessSummary(env, now = /* @__PURE__ */ new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const monthStart = today.slice(0, 7) + "-01";
  const yearStart = today.slice(0, 4) + "-01-01";
  const rollingStart = /* @__PURE__ */ new Date(today + "T00:00:00Z");
  rollingStart.setUTCDate(rollingStart.getUTCDate() - 29);
  const cached = await env.DB.prepare("SELECT value FROM admin_summary_cache WHERE key='business' AND valid_on=?").bind(today).first();
  if (cached) return JSON.parse(cached.value);
  const row = await env.DB.prepare(`INSERT INTO admin_summary_cache(key,valid_on,value)
    ${ledgerFinance} SELECT 'business',?,json_object(
      'monthRevenue',ROUND(COALESCE(SUM(CASE WHEN day>=? THEN revenue ELSE 0 END),0),2),
      'last30Revenue',ROUND(COALESCE(SUM(CASE WHEN day>=? THEN revenue ELSE 0 END),0),2),
      'yearRevenue',ROUND(COALESCE(SUM(CASE WHEN day>=? THEN revenue ELSE 0 END),0),2),
      'allTimeRevenue',ROUND(COALESCE(SUM(revenue),0),2),
      'outstanding',ROUND(COALESCE(SUM(balance),0),2),
      'averageCompleted',ROUND(COALESCE(AVG(CASE WHEN won=1 THEN revenue END),0),2))
    FROM finance WHERE day<=? ON CONFLICT(key) DO UPDATE SET valid_on=excluded.valid_on,value=excluded.value RETURNING value`).bind(today, monthStart, rollingStart.toISOString().slice(0, 10), yearStart, today).first();
  return JSON.parse(row.value);
}
__name(businessSummary, "businessSummary");
async function dashboard(env, url) {
  let start = since(url.searchParams.get("days"));
  if (url.searchParams.get("days") === "all") {
    const first = await env.DB.prepare("SELECT MIN(first) first FROM (SELECT MIN(created_at) first FROM events UNION ALL SELECT MIN(created_at) FROM leads UNION ALL SELECT MIN(job_date) FROM jobs WHERE deleted_at IS NULL)").first();
    start = first?.first || (/* @__PURE__ */ new Date()).toISOString();
  }
  const q = /* @__PURE__ */ __name(async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results, "q");
  const one = /* @__PURE__ */ __name(async (sql, ...args) => await env.DB.prepare(sql).bind(...args).first(), "one");
  const [e, l] = await Promise.all([one(`SELECT SUM(event='page_view') pageViews, COUNT(DISTINCT visitor_id) visitors, SUM(event='phone_click') phoneClicks, SUM(event='email_click') emailClicks, SUM(event='form_start') formStarts, SUM(event='form_submit') formSubmits, SUM(event='service_view') serviceViews, SUM(event IN ('phone_click','email_click','form_submit') OR (event='cta_click' AND label LIKE '%quote%')) contactAttempts FROM events WHERE created_at>=?`, start), one(`SELECT COUNT(*) leads, SUM(status='Won') customers, SUM(quote_amount>0) quotes, COALESCE(SUM(quote_amount),0) quoteValue, COALESCE(SUM(revenue),0) revenue, COALESCE(AVG(CASE WHEN status='Won' AND revenue>0 THEN revenue END),0) avgJob, COALESCE(SUM(CASE WHEN status NOT IN ('Won','Lost') THEN quote_amount ELSE 0 END),0) openPipeline FROM leads WHERE created_at>=?`, start)]);
  const qr = await one("SELECT COUNT(*) quoteRequests FROM quote_requests WHERE created_at>=?", start);
  const legacy = await one("SELECT COUNT(*) n FROM leads WHERE quote_amount>0 AND created_at>=? AND NOT EXISTS(SELECT 1 FROM quote_requests q WHERE q.lead_id=leads.id)", start);
  const metrics = { ...e, ...l, quoteRequests: Number(qr.quoteRequests || 0), quotes: Number(qr.quoteRequests || 0) + Number(legacy.n || 0) };
  Object.keys(metrics).forEach((k) => metrics[k] = Number(metrics[k] || 0));
  const trendStart = start > new Date(Date.now() - 365 * 864e5).toISOString() ? start : new Date(Date.now() - 365 * 864e5).toISOString();
  const trend = await q(`WITH RECURSIVE dates(d) AS (SELECT date(?) UNION ALL SELECT date(d,'+1 day') FROM dates WHERE d<date('now')),
    visits AS (SELECT date(created_at) d,COUNT(DISTINCT visitor_id) n FROM events WHERE created_at>=? GROUP BY d),
    inquiries AS (SELECT date(created_at) d,COUNT(*) n FROM leads WHERE created_at>=? GROUP BY d)
    SELECT dates.d date,COALESCE(visits.n,0) visitors,COALESCE(inquiries.n,0) leads
    FROM dates LEFT JOIN visits USING(d) LEFT JOIN inquiries USING(d) ORDER BY dates.d`, trendStart, trendStart.slice(0, 10), trendStart.slice(0, 10));
  const recentLeads = await q(`SELECT id,name,service,source,status,created_at FROM leads WHERE deleted_at IS NULL AND created_at>=? ORDER BY created_at DESC LIMIT 7`, start);
  const pages = await q(`SELECT COALESCE(NULLIF(page,''),'/') name, COUNT(*) count FROM events WHERE created_at>=? AND event='page_view' GROUP BY name ORDER BY count DESC LIMIT 15`, start);
  const events = await q(`SELECT event name,COUNT(*) count FROM events WHERE created_at>=? GROUP BY event ORDER BY count DESC`, start);
  const traffic = await q(`SELECT source || CASE WHEN campaign<>'' THEN ' \xB7 '||campaign ELSE '' END name, COUNT(DISTINCT visitor_id) visitors, (SELECT COUNT(*) FROM leads l WHERE l.created_at>=? AND l.source=e.source AND l.campaign=e.campaign) leads, 0 revenue FROM events e WHERE created_at>=? GROUP BY source,campaign ORDER BY visitors DESC LIMIT 20`, start, start);
  const sales = await ledgerSummary(env, start, traffic.map((row) => row.name));
  Object.assign(metrics, sales.totals);
  return { businessSummary: await businessSummary(env), metrics, trend, sources: sales.sources, services: sales.services, recentLeads, pages, events, traffic: traffic.map((r) => ({ ...r, revenue: sales.traffic.find((x) => x.name === r.name)?.revenue || 0 })), jobs: sales.jobs };
}
__name(dashboard, "dashboard");
var leadFinancialColumns = `EXISTS(SELECT 1 FROM ledger_leads m WHERE m.lead_id=leads.id) ledger_managed,
  (SELECT COALESCE(SUM(quoted_cents),0)/100.0 FROM jobs j WHERE j.lead_id=leads.id AND j.deleted_at IS NULL) ledger_quote,
  (SELECT COALESCE(SUM(collected_cents),0)/100.0 FROM jobs j WHERE j.lead_id=leads.id AND j.deleted_at IS NULL) ledger_revenue`;
var leadColumns = `leads.*,${leadFinancialColumns},
  (SELECT COUNT(*) FROM quote_requests q WHERE q.lead_id=leads.id) quote_requests,
  (SELECT details FROM inquiries i WHERE i.lead_id=leads.id ORDER BY created_at DESC,id DESC LIMIT 1) inquiry_details`;
function leadAmounts(lead) {
  return lead?.ledger_managed ? { ...lead, quote_amount: lead.ledger_quote, revenue: lead.ledger_revenue } : lead;
}
__name(leadAmounts, "leadAmounts");
async function leads(env, url) {
  const query = clamp(url.searchParams.get("q"), 120), status = clamp(url.searchParams.get("status"), 30);
  const lookup = url.searchParams.get("lookup") === "1";
  const page = pageRequest(url, JSON.stringify(["leads", query, status, lookup]), 1);
  const columns = lookup ? `id,name,email,phone,service,status,notes,message,
    (SELECT details FROM inquiries i WHERE i.lead_id=leads.id ORDER BY created_at DESC,id DESC LIMIT 1) inquiry_details` : leadColumns;
  let sql = "SELECT " + columns + " FROM leads WHERE deleted_at IS NULL";
  const args = [];
  if (query) {
    sql += " AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR service LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')";
    args.push(...Array(5).fill(searchPattern(query)));
  }
  if (status && validStatuses.has(status)) {
    sql += " AND status=?";
    args.push(status);
  }
  if (page.keys) {
    sql += " AND id<?";
    args.push(page.keys[0]);
  }
  const rows = (await env.DB.prepare(sql + " ORDER BY id DESC LIMIT ?").bind(...args, page.limit + 1).all()).results;
  const result = pageResult(rows, page, (row) => [row.id]);
  return { leads: result.records.map(leadAmounts), nextCursor: result.nextCursor };
}
__name(leads, "leads");
async function jobsPage(env, url) {
  const start = since(url.searchParams.get("days")).slice(0, 10);
  const page = pageRequest(url, JSON.stringify(["jobs", url.searchParams.get("days") || "30"]), 3);
  let sql = "SELECT j.*,l.name lead_name FROM jobs j LEFT JOIN leads l ON l.id=j.lead_id WHERE j.deleted_at IS NULL AND j.job_date>=?";
  const args = [start];
  if (page.keys) {
    sql += " AND (j.job_date,j.created_at,j.id)<(?,?,?)";
    args.push(...page.keys);
  }
  const rows = (await env.DB.prepare(sql + " ORDER BY j.job_date DESC,j.created_at DESC,j.id DESC LIMIT ?").bind(...args, page.limit + 1).all()).results;
  const result = pageResult(rows, page, (row) => [row.job_date, row.created_at, row.id]);
  return { jobs: result.records, nextCursor: result.nextCursor };
}
__name(jobsPage, "jobsPage");
async function exportCsv(env, url, headers) {
  const page = pageRequest(url, "export", 1);
  page.limit = 500;
  const rows = (await env.DB.prepare("SELECT id,name,email,phone,service,source,medium,campaign,status,quote_amount,revenue,notes,created_at,updated_at," + leadFinancialColumns + " FROM leads WHERE deleted_at IS NULL AND id<? ORDER BY id DESC LIMIT ?").bind(page.keys?.[0] || Number.MAX_SAFE_INTEGER, page.limit + 1).all()).results.map(leadAmounts);
  const result = pageResult(rows, page, (row) => [row.id]);
  const columns = ["id", "name", "email", "phone", "service", "source", "medium", "campaign", "status", "quote_amount", "revenue", "notes", "created_at", "updated_at"];
  const escape = /* @__PURE__ */ __name((value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }, "escape");
  const lines = result.records.map((row) => columns.map((key) => escape(row[key])).join(","));
  if (!page.keys) lines.unshift(columns.join(","));
  return new Response(lines.join("\r\n") + (lines.length ? "\r\n" : ""), { headers: {
    ...headers,
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="sparkly-nikki-leads.csv"',
    "cache-control": "no-store",
    "X-Next-Cursor": result.nextCursor || ""
  } });
}
__name(exportCsv, "exportCsv");
var worker_default = { async fetch(req, env) {
  const url = new URL(req.url), ch = cors(req, env);
  if (req.method === "OPTIONS") return ch ? new Response(null, { status: 204, headers: ch }) : new Response(null, { status: 403 });
  if (!ch && req.headers.get("origin")) return json2({ error: "Origin not allowed" }, 403);
  const headers = ch || {};
  try {
    if (typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32) return json2({ error: "Authentication is not configured" }, 503, headers);
    if (url.pathname === "/" && req.method === "GET") return json2({ ok: true }, 200, headers);
    if (url.pathname === "/api/event" && req.method === "POST") return await handleEvent(req, env, headers);
    if (url.pathname === "/api/login" && req.method === "POST") {
      if (!await rateLimit(env, "login:" + await ipHashKey(req, env), 10, 600)) return json2({ error: "Too many login attempts. Try again later." }, 429, headers);
      let b;
      try {
        b = await readBody(req);
      } catch {
        return json2({ error: "Invalid JSON" }, 400, headers);
      }
      const user = clamp(b.username, 80), pass = String(b.password ?? "");
      const userOk = ctEqual(user.toLowerCase(), (env.ADMIN_USERNAME || "admin").toLowerCase()), passOk = env.ADMIN_PASSWORD && ctEqual(pass, env.ADMIN_PASSWORD);
      if (!userOk || !passOk) return json2({ error: "Invalid username or password" }, 401, headers);
      return json2({ token: await token(env) }, 200, headers);
    }
    if (!await auth(req, env)) return json2({ error: "Unauthorized" }, 401, headers);
    if (url.pathname.startsWith("/api/operations/")) return await handleOperationsRequest(req, env, url.pathname, true);
    if (url.pathname === "/api/jobs" || /^\/api\/jobs\/[0-9a-f-]{36}$/i.test(url.pathname)) return await ledgerRoute(req, env, url, headers);
    if (url.pathname === "/api/session") return json2({ ok: true }, 200, headers);
    if (url.pathname === "/api/logout" && req.method === "POST") {
      const t = req.headers.get("authorization").slice(7);
      await env.DB.prepare("INSERT OR REPLACE INTO rate_limits(bucket,hits,reset_at) VALUES(?,1,?)").bind("revoked:" + await anonId(env, t), Math.floor(Date.now() / 1e3) + 8 * 3600).run();
      return json2({ ok: true }, 200, headers);
    }
    if (url.pathname === "/api/dashboard" && req.method === "GET") return json2(await dashboard(env, url), 200, headers);
    if (url.pathname === "/api/leads" && req.method === "GET") return json2(await leads(env, url), 200, headers);
    const m = url.pathname.match(/^\/api\/leads\/(\d+)$/);
    if (m && req.method === "DELETE") {
      const result = await removeCustomer(env, Number(m[1]));
      return result ? json2(result, 200, headers) : json2({ error: "Customer not found" }, 404, headers);
    }
    if (m && req.method === "GET") {
      const lead = await env.DB.prepare("SELECT " + leadColumns + " FROM leads WHERE id=?").bind(Number(m[1])).first();
      return lead ? json2({ lead: leadAmounts(lead) }, 200, headers) : json2({ error: "Lead not found" }, 404, headers);
    }
    if (m && req.method === "PATCH") {
      const active = await env.DB.prepare("SELECT id FROM leads WHERE id=? AND deleted_at IS NULL").bind(Number(m[1])).first();
      if (!active) return json2({ error: "Customer not found or removed" }, 404, headers);
      let b;
      try {
        b = await readBody(req);
      } catch {
        return json2({ error: "Invalid JSON" }, 400, headers);
      }
      const status = validStatuses.has(b.status) ? b.status : "New";
      const managed = await env.DB.prepare("SELECT lead_id FROM ledger_leads WHERE lead_id=?").bind(Number(m[1])).first();
      if (managed) {
        const old = await env.DB.prepare("SELECT quote_amount,revenue FROM leads WHERE id=?").bind(Number(m[1])).first();
        b.quote_amount = old.quote_amount;
        b.revenue = old.revenue;
        await env.DB.prepare("UPDATE ledger_leads SET promoted=0 WHERE lead_id=? AND (SELECT status FROM leads WHERE id=?)<>?").bind(Number(m[1]), Number(m[1]), status).run();
      }
      await env.DB.prepare(`UPDATE leads SET status=?,service=?,quote_amount=?,revenue=?,notes=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(status, clamp(b.service, 180), Math.max(0, Number(b.quote_amount) || 0), Math.max(0, Number(b.revenue) || 0), clamp(b.notes, 4e3), Number(m[1])).run();
      return json2({ ok: true }, 200, headers);
    }
    if (url.pathname === "/api/export/leads.csv" && req.method === "GET") return exportCsv(env, url, headers);
    if (url.pathname === "/api/health" && req.method === "GET") {
      const last = await env.DB.prepare("SELECT (SELECT MAX(created_at) FROM events) lastEvent, COUNT(*) events24h FROM events WHERE created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").first();
      const lr = await env.DB.prepare("SELECT COUNT(*) leads24h FROM leads WHERE created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").first();
      return json2({ status: "Connected", database: "D1 connected", time: (/* @__PURE__ */ new Date()).toISOString(), lastEvent: last?.lastEvent || "", events24h: Number(last?.events24h || 0), leads24h: Number(lr?.leads24h || 0) }, 200, headers);
    }
    return json2({ error: "Not found" }, 404, headers);
  } catch (error) {
    return json2({ error: error.status === 400 ? error.message : "Server error" }, error.status === 400 ? 400 : 500, headers);
  }
} };
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
