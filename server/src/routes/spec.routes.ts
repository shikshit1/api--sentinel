import { Router } from 'express';
import { parseSpecHandler } from '../controllers/spec.controller.js';

export const specRouter = Router();

specRouter.post('/parse', parseSpecHandler);
