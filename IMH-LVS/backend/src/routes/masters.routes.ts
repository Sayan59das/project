// Master data — six resources with the same shape, so they get one router
// built six times rather than six near-identical files.
//
// The differences between them are entirely in their fields, and those live in
// the repository's typed Input types. What a route can do (list, read, create,
// update) and how it reports failure are identical, and duplicating that per
// resource is how five of them end up correct and the sixth quietly does not
// report a 404.

import { Router } from 'express';
import {
  brands,
  claims,
  flavours,
  manufacturingCompanies,
  marketingCompanies,
  productCategories
} from '../repositories/masters.repository';
import { asyncHandler, orNotFound, requireActor, sendData } from '../controllers/http';

// The subset of a master repository's facade these routes need. Declared
// structurally rather than importing each concrete type, because the six
// facades differ only in their Input generic and this router never inspects it.
type MasterFacade<T, TInput> = {
  list: (db?: never) => Promise<T[]>;
  getById: (id: string, db?: never) => Promise<T | undefined>;
  create: (input: TInput, actor: string, db?: never) => Promise<T>;
  update: (id: string, patch: Partial<TInput>, actor: string, db?: never) => Promise<T | undefined>;
};

/**
 * Builds the four routes every master resource has.
 *
 * The request body is passed to the repository as-is. That is deliberate: the
 * database owns which fields are required, which values are in range and which
 * names must already exist, and it reports all three in messages the
 * repositories translate. A field allow-list here would add a second
 * specification of the same rules, and the failure mode of the two disagreeing
 * is a field the API silently drops.
 */
function masterRouter<T, TInput>(facade: MasterFacade<T, TInput>, label: string): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      sendData(res, await facade.list());
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      sendData(res, orNotFound(await facade.getById(req.params.id), `${label} "${req.params.id}"`));
    })
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const created = await facade.create(req.body as TInput, requireActor(req));
      sendData(res, created, 201);
    })
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const updated = await facade.update(req.params.id, req.body as Partial<TInput>, requireActor(req));
      sendData(res, orNotFound(updated, `${label} "${req.params.id}"`));
    })
  );

  return router;
}

const router = Router();

router.use('/marketing-companies', masterRouter(marketingCompanies, 'Marketing company'));
router.use('/manufacturing-companies', masterRouter(manufacturingCompanies, 'Manufacturing company'));
router.use('/brands', masterRouter(brands, 'Brand'));
router.use('/flavours', masterRouter(flavours, 'Flavour'));
router.use('/claims', masterRouter(claims, 'Claim'));
router.use('/product-categories', masterRouter(productCategories, 'Product category'));

export default router;
