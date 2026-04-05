import { Router } from "express";
import { db, testResultSummariesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  finalizeTestResult,
  getAnalyticsOverview,
  getTestResultBySessionId,
} from "../services/testResultService";
import { getAiRuntimeStatus, getAnalyticsAiInsights } from "../services/aiInsightsService";

const router = Router();

function parseId(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

router.get("/tests/:testId/result", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    const existing = await getTestResultBySessionId(testId);
    if (existing) {
      return res.json(existing);
    }

    const finalized = await finalizeTestResult(testId);
    if (!finalized) {
      return res.status(404).json({ error: "Test result not found" });
    }

    return res.json(finalized);
  } catch (error) {
    console.error("Error fetching test result:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/tests/:testId/result", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    await db.delete(testResultSummariesTable).where(eq(testResultSummariesTable.testSessionId, testId));
    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting test result analytics:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tests/:testId/finalize", async (req, res) => {
  try {
    const testId = parseId(req.params.testId);
    if (testId === null) {
      return res.status(400).json({ error: "Invalid test ID" });
    }

    const finalized = await finalizeTestResult(testId);
    if (!finalized) {
      return res.status(404).json({ error: "Test not found" });
    }
    return res.json(finalized);
  } catch (error) {
    console.error("Error finalizing test result:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/overview", async (req, res) => {
  try {
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const data = await getAnalyticsOverview(startDate, endDate);
    return res.json(data);
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/ai-insights", async (req, res) => {
  try {
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
    const data = await getAnalyticsAiInsights(startDate, endDate);
    return res.json(data);
  } catch (error) {
    console.error("Error fetching analytics ai insights:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/ai-status", async (_req, res) => {
  try {
    const status = await getAiRuntimeStatus();
    return res.json(status);
  } catch (error) {
    console.error("Error fetching ai runtime status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
