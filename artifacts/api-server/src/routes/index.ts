import { Router, type IRouter } from "express";
import healthRouter from "./health";
import questionsRouter from "./questions";
import testsRouter from "./tests";

const router: IRouter = Router();

router.use(healthRouter);
router.use(questionsRouter);
router.use(testsRouter);

export default router;
