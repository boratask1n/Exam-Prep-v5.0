import { Router, type IRouter } from "express";
import healthRouter from "./health";
import questionsRouter from "./questions";
import notesRouter from "./notes";
import testsRouter from "./tests";
import testSolutionsRouter from "./testSolutions";
import testProgressRouter from "./testProgress";
import testResultsRouter from "./testResults";
import authRouter from "./auth";
import uploadsRouter from "./uploads";
import resourcesRouter from "./resources";
import practiceExamsRouter from "./practiceExams";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(uploadsRouter);
router.use(requireAuth);
router.use("/resources", resourcesRouter);
router.use(questionsRouter);
router.use(notesRouter);
router.use(testsRouter);
router.use(testSolutionsRouter);
router.use(testProgressRouter);
router.use(testResultsRouter);
router.use("/practice-exams", practiceExamsRouter);

export default router;
