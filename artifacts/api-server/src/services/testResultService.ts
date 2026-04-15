import {
  db,
  questionsTable,
  testSessionProgressTable,
  testSessionQuestionsTable,
  testSessionsTable,
  testSolutionsTable,
  testResultSummariesTable,
  testResultTopicStatsTable,
} from "@workspace/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { applyQuestionReviewOutcomesFromTest } from "./questionReviewService";

type QuestionStatus = "Cozulmedi" | "DogruCozuldu" | "YanlisHocayaSor";

type QuestionWithSolution = {
  questionId: number;
  orderIndex: number;
  lesson: string;
  topic: string | null;
  choice: string | null;
  userAnswer: string | null;
  status: QuestionStatus;
};

function normalizeStatus(raw: string | null | undefined): QuestionStatus {
  if (raw === "DogruCozuldu" || raw === "YanlisHocayaSor" || raw === "Cozulmedi") return raw;
  return "Cozulmedi";
}

function inferStatus(
  status: string | null | undefined,
  userAnswer: string | null | undefined,
  correctChoice: string | null | undefined,
): QuestionStatus {
  const normalized = normalizeStatus(status);
  if (normalized !== "Cozulmedi") return normalized;
  if (!userAnswer) return "Cozulmedi";
  if (correctChoice && userAnswer === correctChoice) return "DogruCozuldu";
  return "YanlisHocayaSor";
}

async function getQuestionRowsForTest(testSessionId: number) {
  const sessionQuestions = await db
    .select({
      questionId: testSessionQuestionsTable.questionId,
      orderIndex: testSessionQuestionsTable.orderIndex,
    })
    .from(testSessionQuestionsTable)
    .where(eq(testSessionQuestionsTable.testSessionId, testSessionId))
    .orderBy(testSessionQuestionsTable.orderIndex);

  if (sessionQuestions.length === 0) return [];

  const questionIds = sessionQuestions.map((sq) => sq.questionId);
  const [questions, solutions] = await Promise.all([
    db
      .select({
        id: questionsTable.id,
        lesson: questionsTable.lesson,
        topic: questionsTable.topic,
        choice: questionsTable.choice,
      })
      .from(questionsTable)
      .where(inArray(questionsTable.id, questionIds)),
    db
      .select({
        questionId: testSolutionsTable.questionId,
        userAnswer: testSolutionsTable.userAnswer,
        status: testSolutionsTable.status,
      })
      .from(testSolutionsTable)
      .where(eq(testSolutionsTable.testSessionId, testSessionId)),
  ]);

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const solutionByQuestionId = new Map(solutions.map((s) => [s.questionId, s]));

  const rows: QuestionWithSolution[] = [];
  for (const sq of sessionQuestions) {
    const question = questionById.get(sq.questionId);
    if (!question) continue;
    const solution = solutionByQuestionId.get(sq.questionId);
    const status = inferStatus(solution?.status, solution?.userAnswer, question.choice);
    rows.push({
      questionId: sq.questionId,
      orderIndex: sq.orderIndex,
      lesson: question.lesson,
      topic: question.topic ?? null,
      choice: question.choice ?? null,
      userAnswer: solution?.userAnswer ?? null,
      status,
    });
  }
  return rows;
}

function topicKey(lesson: string, topic: string) {
  return `${lesson}__${topic}`;
}

export async function finalizeTestResult(testSessionId: number) {
  const [session, progress] = await Promise.all([
    db
      .select({
        id: testSessionsTable.id,
        name: testSessionsTable.name,
        completedAt: testSessionsTable.completedAt,
      })
      .from(testSessionsTable)
      .where(eq(testSessionsTable.id, testSessionId))
      .then((rows) => rows[0]),
    db
      .select({ elapsed: testSessionProgressTable.elapsed })
      .from(testSessionProgressTable)
      .where(eq(testSessionProgressTable.testSessionId, testSessionId))
      .then((rows) => rows[0] ?? null),
  ]);

  if (!session) return null;

  const questions = await getQuestionRowsForTest(testSessionId);
  const totalQuestions = questions.length;
  const correctCount = questions.filter((q) => q.status === "DogruCozuldu").length;
  const wrongCount = questions.filter((q) => q.status === "YanlisHocayaSor").length;
  const skippedCount = Math.max(0, totalQuestions - correctCount - wrongCount);
  const completedAt = session.completedAt ?? new Date();
  const elapsedSeconds = progress?.elapsed ?? 0;

  const topicMap = new Map<
    string,
    {
      lesson: string;
      topic: string;
      totalQuestions: number;
      correctCount: number;
      wrongCount: number;
      skippedCount: number;
    }
  >();

  for (const row of questions) {
    const topic = row.topic?.trim() || "Konu belirtilmedi";
    const key = topicKey(row.lesson, topic);
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        lesson: row.lesson,
        topic,
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
      });
    }
    const stat = topicMap.get(key)!;
    stat.totalQuestions += 1;
    if (row.status === "DogruCozuldu") stat.correctCount += 1;
    else if (row.status === "YanlisHocayaSor") stat.wrongCount += 1;
    else stat.skippedCount += 1;
  }

  const summary = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: testResultSummariesTable.id })
      .from(testResultSummariesTable)
      .where(eq(testResultSummariesTable.testSessionId, testSessionId))
      .then((rows) => rows[0] ?? null);

    let summaryRow: { id: number };
    if (existing) {
      const [updated] = await tx
        .update(testResultSummariesTable)
        .set({
          testName: session.name,
          totalQuestions,
          correctCount,
          wrongCount,
          skippedCount,
          elapsedSeconds,
          completedAt,
          updatedAt: new Date(),
        })
        .where(eq(testResultSummariesTable.id, existing.id))
        .returning({ id: testResultSummariesTable.id });
      summaryRow = updated;

      await tx
        .delete(testResultTopicStatsTable)
        .where(eq(testResultTopicStatsTable.testResultId, existing.id));
    } else {
      const [created] = await tx
        .insert(testResultSummariesTable)
        .values({
          testSessionId,
          testName: session.name,
          totalQuestions,
          correctCount,
          wrongCount,
          skippedCount,
          elapsedSeconds,
          completedAt,
          updatedAt: new Date(),
        })
        .returning({ id: testResultSummariesTable.id });
      summaryRow = created;
    }

    const topicStatsValues = Array.from(topicMap.values()).map((stat) => ({
      testResultId: summaryRow.id,
      lesson: stat.lesson,
      topic: stat.topic,
      totalQuestions: stat.totalQuestions,
      correctCount: stat.correctCount,
      wrongCount: stat.wrongCount,
      skippedCount: stat.skippedCount,
      answeredCount: stat.correctCount + stat.wrongCount,
    }));
    if (topicStatsValues.length > 0) {
      await tx.insert(testResultTopicStatsTable).values(topicStatsValues);
    }

    await applyQuestionReviewOutcomesFromTest(tx, testSessionId, questions);

    return summaryRow;
  });

  return getTestResultBySessionId(testSessionId, summary.id, questions);
}

function formatRepeatPriority(wrongRatio: number) {
  if (wrongRatio >= 0.7) return "high";
  if (wrongRatio >= 0.5) return "medium";
  return "low";
}

function shouldFlagWeakTopic(answeredCount: number, wrongCount: number, wrongRatio: number) {
  // Global rule: enough solved data + high wrong ratio
  if (answeredCount >= 4 && wrongRatio >= 0.5) return true;
  // Single-test spike rule: even one test with 3+ wrong is a strong weakness signal
  if (wrongCount >= 3) return true;
  return false;
}

export async function getTestResultBySessionId(
  testSessionId: number,
  knownResultId?: number,
  knownQuestions?: QuestionWithSolution[],
) {
  const [summary, existingSession] = await Promise.all([
    db
      .select()
      .from(testResultSummariesTable)
      .where(eq(testResultSummariesTable.testSessionId, testSessionId))
      .then((rows) => rows[0] ?? null),
    db
      .select({ id: testSessionsTable.id })
      .from(testSessionsTable)
      .where(eq(testSessionsTable.id, testSessionId))
      .then((rows) => rows[0] ?? null),
  ]);
  if (!summary) return null;

  const topicStats = await db
    .select()
    .from(testResultTopicStatsTable)
    .where(eq(testResultTopicStatsTable.testResultId, knownResultId ?? summary.id));

  const questionRows = knownQuestions ?? (await getQuestionRowsForTest(testSessionId));
  const lessonStatsMap = new Map<
    string,
    { lesson: string; totalQuestions: number; correctCount: number; wrongCount: number; skippedCount: number }
  >();
  for (const row of topicStats) {
    if (!lessonStatsMap.has(row.lesson)) {
      lessonStatsMap.set(row.lesson, {
        lesson: row.lesson,
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
      });
    }
    const stat = lessonStatsMap.get(row.lesson)!;
    stat.totalQuestions += row.totalQuestions;
    stat.correctCount += row.correctCount;
    stat.wrongCount += row.wrongCount;
    stat.skippedCount += row.skippedCount;
  }

  const weakTopics = topicStats
    .map((row) => {
      const answered = row.answeredCount;
      const wrongRatio = answered > 0 ? row.wrongCount / answered : 0;
      return {
        lesson: row.lesson,
        topic: row.topic,
        totalQuestions: row.totalQuestions,
        answeredCount: answered,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        skippedCount: row.skippedCount,
        wrongRatio,
      };
    })
    .filter((row) => shouldFlagWeakTopic(row.answeredCount, row.wrongCount, row.wrongRatio))
    .sort((a, b) => b.wrongRatio - a.wrongRatio || b.wrongCount - a.wrongCount);

  return {
    testSessionId: summary.testSessionId,
    testName: summary.testName,
    isTestDeleted: !existingSession,
    completedAt: summary.completedAt.toISOString(),
    elapsedSeconds: summary.elapsedSeconds,
    totalQuestions: summary.totalQuestions,
    correctCount: summary.correctCount,
    wrongCount: summary.wrongCount,
    skippedCount: summary.skippedCount,
    successRate: summary.totalQuestions > 0 ? summary.correctCount / summary.totalQuestions : 0,
    lessonStats: Array.from(lessonStatsMap.values()).map((row) => ({
      ...row,
      successRate: row.totalQuestions > 0 ? row.correctCount / row.totalQuestions : 0,
      net: row.correctCount - row.wrongCount / 4,
    })),
    topicStats: topicStats.map((row) => ({
      lesson: row.lesson,
      topic: row.topic,
      totalQuestions: row.totalQuestions,
      answeredCount: row.answeredCount,
      correctCount: row.correctCount,
      wrongCount: row.wrongCount,
      skippedCount: row.skippedCount,
      wrongRatio: row.answeredCount > 0 ? row.wrongCount / row.answeredCount : 0,
    })),
    weakTopics: weakTopics.map((row) => ({
      ...row,
      repeatPriority: formatRepeatPriority(row.wrongRatio),
    })),
    questionBreakdown: questionRows.map((q) => ({
      questionId: q.questionId,
      orderIndex: q.orderIndex,
      lesson: q.lesson,
      topic: q.topic,
      userAnswer: q.userAnswer,
      correctChoice: q.choice,
      status: q.status,
    })),
  };
}

function parseRangeDate(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveDateRange(startDateRaw?: string, endDateRaw?: string) {
  const now = new Date();
  const defaultEnd = new Date(now);
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const start = parseRangeDate(startDateRaw, false) ?? defaultStart;
  const end = parseRangeDate(endDateRaw, true) ?? defaultEnd;
  return { start, end };
}

async function ensureCompletedTestsHaveSnapshots() {
  const completedSessions = await db
    .select({
      id: testSessionsTable.id,
    })
    .from(testSessionsTable)
    .where(sql`${testSessionsTable.completedAt} is not null`);

  if (completedSessions.length === 0) return;

  const completedIds = completedSessions.map((s) => s.id);
  const existingSnapshots = await db
    .select({ testSessionId: testResultSummariesTable.testSessionId })
    .from(testResultSummariesTable)
    .where(inArray(testResultSummariesTable.testSessionId, completedIds));

  const existingIds = new Set(existingSnapshots.map((s) => s.testSessionId));
  const missingIds = completedIds.filter((id) => !existingIds.has(id));

  for (const missingId of missingIds) {
    try {
      await finalizeTestResult(missingId);
    } catch (error) {
      console.error("Failed to backfill snapshot for completed test:", { missingId, error });
    }
  }
}

export async function getAnalyticsOverview(startDateRaw?: string, endDateRaw?: string) {
  await ensureCompletedTestsHaveSnapshots();

  const { start, end } = resolveDateRange(startDateRaw, endDateRaw);

  const summaries = await db
    .select()
    .from(testResultSummariesTable)
    .where(
      and(
        gte(testResultSummariesTable.completedAt, start),
        lte(testResultSummariesTable.completedAt, end),
      ),
    )
    .orderBy(testResultSummariesTable.completedAt);

  if (summaries.length === 0) {
    return {
      dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
      summary: {
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
        successRate: 0,
      },
      subjectStats: [],
      topicStats: [],
      weakTopics: [],
      repeatReminders: [],
      recentResults: [],
    };
  }

  const existingSessions = await db
    .select({ id: testSessionsTable.id })
    .from(testSessionsTable)
    .where(inArray(testSessionsTable.id, summaries.map((s) => s.testSessionId)));
  const existingSessionIds = new Set(existingSessions.map((s) => s.id));

  const resultIds = summaries.map((s) => s.id);
  const topicRows = await db
    .select()
    .from(testResultTopicStatsTable)
    .where(inArray(testResultTopicStatsTable.testResultId, resultIds));

  const summary = summaries.reduce(
    (acc, row) => {
      acc.totalQuestions += row.totalQuestions;
      acc.correctCount += row.correctCount;
      acc.wrongCount += row.wrongCount;
      acc.skippedCount += row.skippedCount;
      return acc;
    },
    { totalQuestions: 0, correctCount: 0, wrongCount: 0, skippedCount: 0 },
  );

  const subjectMap = new Map<
    string,
    { lesson: string; totalQuestions: number; correctCount: number; wrongCount: number; skippedCount: number }
  >();
  const topicMap = new Map<
    string,
    {
      lesson: string;
      topic: string;
      totalQuestions: number;
      answeredCount: number;
      correctCount: number;
      wrongCount: number;
      skippedCount: number;
    }
  >();

  for (const row of topicRows) {
    if (!subjectMap.has(row.lesson)) {
      subjectMap.set(row.lesson, {
        lesson: row.lesson,
        totalQuestions: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
      });
    }
    const lesson = subjectMap.get(row.lesson)!;
    lesson.totalQuestions += row.totalQuestions;
    lesson.correctCount += row.correctCount;
    lesson.wrongCount += row.wrongCount;
    lesson.skippedCount += row.skippedCount;

    const key = topicKey(row.lesson, row.topic);
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        lesson: row.lesson,
        topic: row.topic,
        totalQuestions: 0,
        answeredCount: 0,
        correctCount: 0,
        wrongCount: 0,
        skippedCount: 0,
      });
    }
    const topic = topicMap.get(key)!;
    topic.totalQuestions += row.totalQuestions;
    topic.answeredCount += row.answeredCount;
    topic.correctCount += row.correctCount;
    topic.wrongCount += row.wrongCount;
    topic.skippedCount += row.skippedCount;
  }

  const weakTopics = Array.from(topicMap.values())
    .map((row) => ({
      ...row,
      wrongRatio: row.answeredCount > 0 ? row.wrongCount / row.answeredCount : 0,
    }));

  const allTopicStats = [...weakTopics]
    .sort((a, b) => b.answeredCount - a.answeredCount || b.wrongRatio - a.wrongRatio);

  const filteredWeakTopics = weakTopics
    .filter((row) => shouldFlagWeakTopic(row.answeredCount, row.wrongCount, row.wrongRatio))
    .sort((a, b) => b.wrongRatio - a.wrongRatio || b.wrongCount - a.wrongCount)
    .slice(0, 12);

  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  const perTestSpikeTopics = topicRows
    .map((row) => {
      const summary = summaryById.get(row.testResultId);
      const answeredCount = row.answeredCount;
      const wrongRatio = answeredCount > 0 ? row.wrongCount / answeredCount : 0;
      return {
        lesson: row.lesson,
        topic: row.topic,
        totalQuestions: row.totalQuestions,
        answeredCount,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        skippedCount: row.skippedCount,
        wrongRatio,
        completedAt: summary?.completedAt ?? new Date(0),
      };
    })
    .filter((row) => row.wrongCount >= 3)
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime() || b.wrongCount - a.wrongCount);

  const uniqueSpikes = new Map<string, (typeof perTestSpikeTopics)[number]>();
  for (const spike of perTestSpikeTopics) {
    const key = topicKey(spike.lesson, spike.topic);
    if (!uniqueSpikes.has(key)) uniqueSpikes.set(key, spike);
  }

  const repeatReminderMap = new Map<
    string,
    {
      lesson: string;
      topic: string;
      totalQuestions: number;
      answeredCount: number;
      correctCount: number;
      wrongCount: number;
      skippedCount: number;
      wrongRatio: number;
      repeatPriority: "high" | "medium" | "low";
      trigger: "aggregate" | "single_test_spike";
    }
  >();

  for (const row of filteredWeakTopics) {
    const key = topicKey(row.lesson, row.topic);
    repeatReminderMap.set(key, {
      ...row,
      repeatPriority: formatRepeatPriority(row.wrongRatio),
      trigger: "aggregate",
    });
  }

  for (const row of uniqueSpikes.values()) {
    const key = topicKey(row.lesson, row.topic);
    if (repeatReminderMap.has(key)) continue;
    repeatReminderMap.set(key, {
      lesson: row.lesson,
      topic: row.topic,
      totalQuestions: row.totalQuestions,
      answeredCount: row.answeredCount,
      correctCount: row.correctCount,
      wrongCount: row.wrongCount,
      skippedCount: row.skippedCount,
      wrongRatio: row.wrongRatio,
      repeatPriority: row.wrongCount >= 4 || row.wrongRatio >= 0.7 ? "high" : "medium",
      trigger: "single_test_spike",
    });
  }

  const repeatReminders = Array.from(repeatReminderMap.values())
    .sort((a, b) => b.wrongRatio - a.wrongRatio || b.wrongCount - a.wrongCount)
    .slice(0, 8);

  return {
    dateRange: { startDate: start.toISOString(), endDate: end.toISOString() },
    summary: {
      ...summary,
      successRate: summary.totalQuestions > 0 ? summary.correctCount / summary.totalQuestions : 0,
    },
    subjectStats: Array.from(subjectMap.values())
      .map((row) => ({
        ...row,
        successRate: row.totalQuestions > 0 ? row.correctCount / row.totalQuestions : 0,
        net: row.correctCount - row.wrongCount / 4,
      }))
      .sort((a, b) => b.totalQuestions - a.totalQuestions),
    topicStats: allTopicStats,
    weakTopics: filteredWeakTopics,
    repeatReminders,
    recentResults: [...summaries]
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      .slice(0, 10)
      .map((row) => ({
        testSessionId: row.testSessionId,
        isTestDeleted: !existingSessionIds.has(row.testSessionId),
        testName: row.testName,
        totalQuestions: row.totalQuestions,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        skippedCount: row.skippedCount,
        elapsedSeconds: row.elapsedSeconds,
        completedAt: row.completedAt.toISOString(),
      })),
  };
}

export async function getAnalyticsCharts(startDateRaw?: string, endDateRaw?: string) {
  const overview = await getAnalyticsOverview(startDateRaw, endDateRaw);
  return {
    dateRange: overview.dateRange,
    lessonStats: overview.subjectStats,
    topicStats: overview.topicStats,
  };
}
