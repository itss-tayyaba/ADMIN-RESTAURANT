// src/utils/branchScope.js
//
// Shared helpers for the superadmin role. A superadmin is an AdminUser with
// role: 'superadmin' and branchId: null — the null branchId is what makes
// them see everything by default.
//
// Two things every "admin-only" route needs once superadmin exists:
//   1. Treat 'admin' and 'superadmin' as equally allowed to call the route
//      (isAdminRole).
//   2. Decide which branchId (if any) to filter a query by (resolveBranchId).
//      - A regular branch admin is ALWAYS filtered to their own branchId.
//      - A superadmin with no ?branchId= query param sees everything
//        (combined/all-branch view) — the filter is simply omitted.
//      - A superadmin WITH a ?branchId=<id> query param is scoped to that
//        one branch, same as a branch admin would be.

const BRANCH_ID_RE = /^[0-9a-fA-F]{24}$/;

// True for both a regular branch admin and a superadmin — use this
// anywhere a route previously did `decoded.role !== 'admin'`.
function isAdminRole(role) {
  return role === 'admin' || role === 'superadmin';
}

// decoded: the JWT payload (req.user / req.admin — has .role and .branchId)
// query: req.query (read optional ?branchId= for a superadmin)
//
// Returns a branchId string to filter by, or null to mean "no filter"
// (only ever returned for a superadmin who didn't pick a specific branch).
function resolveBranchId(decoded, query) {
  if (!decoded) return null;

  if (decoded.role === 'superadmin') {
    const requested = query && query.branchId;
    if (requested && BRANCH_ID_RE.test(requested)) return requested;
    return null; // combined, all-branch view
  }

  return decoded.branchId || null;
}

module.exports = { isAdminRole, resolveBranchId, BRANCH_ID_RE };
