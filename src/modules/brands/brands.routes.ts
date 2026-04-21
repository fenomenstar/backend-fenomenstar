import { Router } from 'express';
import * as brandsController from './brands.controller';

const router = Router();

router.get('/', brandsController.listBrands);

export default router;
