// Ingredient master: admin-edited, versioned; only complete + ACTIVE ingredients are usable.
const { INGREDIENT_SECTIONS, INGREDIENT_FIELDS, REVIEW_MAX_DAYS } = require('../ingredients/fields');
const SEED = require('../ingredients/seed');
const { cleanFields } = require('../assessment/validate');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const isAdmin = role => ['ADMIN', 'SUPER_ADMIN'].includes(role);
const blank = v => v === null || v === undefined || v === '';

/** Required fields still empty (IS-01) and whether the evidence review is out of date (IS-05). */
function completeness(ing) {
  const missing = INGREDIENT_FIELDS.filter(f => f.required && blank(ing[f.key])).map(f => f.label);
  const reviewDays = ing.last_review ? (Date.now() - Date.parse(ing.last_review)) / 86400000 : null;
  return { missing, reviewExpired: reviewDays !== null && reviewDays > REVIEW_MAX_DAYS };
}

function ingredientsService(repo) {
  const decorate = i => ({ ...i, ...completeness(i), usable: i.status === 'ACTIVE' && !completeness(i).missing.length && !completeness(i).reviewExpired });

  function clean(body) {
    const { data, errors } = cleanFields(INGREDIENT_FIELDS, body);
    if (errors.length) throw new HttpError(400, errors.join('; '));
    // cleanFields drops blank values; carry explicit clears through.
    for (const f of INGREDIENT_FIELDS) if (f.key in body && blank(body[f.key])) data[f.key] = null;
    if ('status' in body) {
      if (!['ACTIVE', 'INACTIVE'].includes(body.status)) throw new HttpError(400, 'Invalid status');
      data.status = body.status;
    }
    return data;
  }

  function assertActivatable(merged) {
    if (merged.status !== 'ACTIVE') return;
    const c = completeness(merged);
    if (c.missing.length) throw new HttpError(400, 'Cannot activate — fill in: ' + c.missing.join(', '));
    if (c.reviewExpired) throw new HttpError(400, `Cannot activate — evidence review is older than ${REVIEW_MAX_DAYS} days`);
  }

  return {
    sections: () => INGREDIENT_SECTIONS,
    async seed() { let n = 0; for (const i of SEED) if (await repo.insert(i, null, 'Starter ingredient (inactive, to be completed)')) n++; if (n) console.log(`fertility ingredients: seeded ${n}`); },
    list: async () => (await repo.all()).map(decorate),
    usableByIds: async ids => (await repo.many(ids)).map(decorate),
    async get(id) {
      const i = await repo.get(id);
      if (!i) throw new HttpError(404, 'Ingredient not found');
      return { ...decorate(i), history: await repo.history(id) };
    },
    async create(user, mod, body) {
      if (!isAdmin(mod.role)) throw new HttpError(403, 'Admin only');
      const id = String(body.id || '').trim().toUpperCase();
      if (!/^ING-\d{3,4}$/.test(id)) throw new HttpError(400, 'ID must look like ING-011');
      const data = { status: 'INACTIVE', ...clean(body) };
      if (!data.name || !data.unit) throw new HttpError(400, 'Name and unit are required');
      assertActivatable(data);
      if (!(await repo.insert({ ...data, id }, user.id, body.change_note || 'Ingredient created'))) throw new HttpError(409, 'ID already exists');
      return id;
    },
    async update(user, mod, id, body) {
      if (!isAdmin(mod.role)) throw new HttpError(403, 'Admin only');
      const cur = await repo.get(id);
      if (!cur) throw new HttpError(404, 'Ingredient not found');
      if (!String(body.change_note || '').trim()) throw new HttpError(400, 'Write what changed and why');
      const patch = clean(body);
      assertActivatable({ ...cur, ...patch });
      if (!(await repo.update(id, patch, Number(body.version), user.id, String(body.change_note).slice(0, 500))))
        throw new HttpError(409, 'Someone else changed this ingredient — reload to see their version');
    },
  };
}

module.exports = { ingredientsService, completeness };
