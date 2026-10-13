import { Router } from 'express';
import { compareRunsHandler } from '../controllers/regression.controller.js';

export const regressionRouter = Router();

regressionRouter.post('/compare', compareRunsHandler);
