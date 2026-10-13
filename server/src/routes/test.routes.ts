import { Router } from 'express';
import { generateTestsHandler, executeTestsHandler } from '../controllers/test.controller.js';

export const testRouter = Router();

testRouter.post('/generate', generateTestsHandler);
testRouter.post('/execute', executeTestsHandler);
