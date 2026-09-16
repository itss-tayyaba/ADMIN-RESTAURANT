const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
let defaultTenantCache = null;

async function getDefaultTenant() {
  if (defaultTenantCache) return defaultTenantCache;
  let tenant = await Tenant.findOne({ slug: 'ember-and-brew' });
  if (!tenant) {
    tenant = await Tenant.createDefaultTenant();
  }
  defaultTenantCache = tenant;
  return defaultTenantCache;
}

async function getDefaultTenantId() {
  const tenant = await getDefaultTenant();
  return tenant ? String(tenant._id) : null;
}

// Resolves tenant from request (header, query, body, user JWT, or fallback)
async function resolveTenant(req) {
  // 1. Authenticated non-superadmin staff/user is strictly locked to their tenantId
  if (req.admin && req.admin.tenantId && req.admin.role !== 'superadmin') {
    return req.admin.tenantId;
  }
  if (req.user && req.user.tenantId && req.user.role !== 'superadmin') {
    return req.user.tenantId;
  }
  if (req.customer && req.customer.tenantId) {
    return req.customer.tenantId;
  }

  // 2. Superadmin or public requests can specify tenant via header, query, or body
  const headerTenant = req.headers['x-tenant-id'] || req.headers['x-tenant-slug'];
  if (headerTenant) {
    if (OBJECT_ID_RE.test(headerTenant)) return headerTenant;
    const found = await Tenant.findOne({ slug: headerTenant.toLowerCase() }).select('_id');
    if (found) return String(found._id);
  }

  const queryTenant = (req.query && (req.query.tenantId || req.query.tenant)) || (req.body && (req.body.tenantId || req.body.tenant));
  if (queryTenant) {
    if (OBJECT_ID_RE.test(queryTenant)) return queryTenant;
    const found = await Tenant.findOne({ slug: String(queryTenant).toLowerCase() }).select('_id');
    if (found) return String(found._id);
  }

  // 3. Fallback (default primary tenant)
  return getDefaultTenantId();
}

// Scopes a MongoDB query filter to the given tenantId
async function addTenantScope(query, tenantId) {
  if (!tenantId) return query;
  const defaultTenantId = await getDefaultTenantId();

  if (String(tenantId) === String(defaultTenantId)) {
    // Back-compat: match records with defaultTenantId OR unassigned null
    query.$and = [...(query.$and || []), { $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }] }];
  } else {
    query.tenantId = tenantId;
  }
  return query;
}

// Backend enforcement helper: strictly applies tenant filter to a MongoDB query
// For superadmins, accepts an optional query tenantId; for all other users,
// unconditionally forces their authenticated tenantId.
async function enforceTenantQuery(query, user, clientTenantId) {
  if (!user) return query;
  if (user.role === 'superadmin') {
    if (clientTenantId) await addTenantScope(query, clientTenantId);
    return query;
  }
  const tenantId = user.tenantId || (await getDefaultTenantId());
  await addTenantScope(query, tenantId);
  return query;
}

module.exports = {
  getDefaultTenant,
  getDefaultTenantId,
  resolveTenant,
  addTenantScope,
  enforceTenantQuery,
  OBJECT_ID_RE
};
