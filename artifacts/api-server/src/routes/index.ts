import { Router, type IRouter } from "express";
import healthRouter from "./health";
import questionsRouter from "./questions";
import notesRouter from "./notes";
import testsRouter from "./tests";
import testSolutionsRouter from "./testSolutions";
import testProgressRouter from "./testProgress";
import testResultsRouter from "./testResults";

const router: IRouter = Router();

router.use(healthRouter);
router.use(questionsRouter);
router.use(notesRouter);
router.use(testsRouter);
router.use(testSolutionsRouter);
router.use(testProgressRouter);
router.use(testResultsRouter);

export default router;
