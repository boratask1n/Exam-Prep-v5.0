import { Router, type IRouter } from "express";
import healthRouter from "./health";
import questionsRouter from "./questions";
import testsRouter from "./tests";
import testSolutionsRouter from "./testSolutions";
import testProgressRouter from "./testProgress";

const router: IRouter = Router();

router.use(healthRouter);
router.use(questionsRouter);
router.use(testsRouter);
router.use(testSolutionsRouter);
router.use(testProgressRouter);

export default router;
