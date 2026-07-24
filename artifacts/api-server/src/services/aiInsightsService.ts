import fs from "node:fs/promises";
import path from "node:path";
import {
  db,
  analyticsAiInsightsTable,
  notesTable,
  questionsTable,
  testResultSummariesTable,
  testResultTopicStatsTable,
  testSolutionsTable,
} from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { getAnalyticsOverview, getTestResultBySessionId } from "./testResultService";

type AnalyticsOverview = Awaited<ReturnType<typeof getAnalyticsOverview>>;
type OverviewWeakTopic = AnalyticsOverview["weakTopics"][number];
type OverviewRepeatReminder = AnalyticsOverview["repeatReminders"][number];

type AiTopicSignal = OverviewWeakTopic & {
  recentAnsweredCount: number;
  recentCorrectCount: number;
  recentWrongCount: number;
  recentWrongRatio: number;
  previousAnsweredCount: number;
  previousWrongRatio: number;
  latestAnsweredCount: number;
  latestWrongCount: number;
  latestWrongRatio: number;
  appearanceCount: number;
  improvementDelta: number;
  priorityScore: number;
  trendLabel: "persistent_weakness" | "watch" | "improving" | "recovered";
  recentSpike: boolean;
  isRecovered: boolean;
  isActiveWeakness: boolean;
  lastSeenAt: string;
};

type AiAnalyticsOverview = Omit<AnalyticsOverview, "weakTopics" | "repeatReminders"> & {
  weakTopics: AiTopicSignal[];
  repeatReminders: Array<
    OverviewRepeatReminder & {
      trendLabel: AiTopicSignal["trendLabel"];
      lastSeenAt: string;
      priorityScore: number;
    }
  >;
  aiSignals: {
    activeWeakTopics: AiTopicSignal[];
    recoveredTopics: AiTopicSignal[];
    watchTopics: AiTopicSignal[];
  };
};

type AiInsightsResponse = {
  generatedBy: "ai" | "rule_based";
  summary: string;
  priorityTopics: Array<{
    lesson: string;
    topic: string;
    reason: string;
    action: string;
  }>;
  weeklyPlan: string[];
  examRiskNotes: string[];
  aiWeakTopicHints: Array<{
    lesson: string;
    topic: string;
    why: string;
    suggestion: string;
  }>;
  aiRepeatHints: Array<{
    lesson: string;
    topic: string;
    cadence: string;
    suggestion: string;
  }>;
  aiSuggestedTest: {
    name: string;
    reason: string;
    count: number;
    filters: {
      lessons: string[];
      topics: string[];
      status: "Cozulmedi";
    };
    distribution: Record<string, number>;
  } | null;
};

type AiInsightsNoteContext = {
  totalNotes: number;
  pinnedNotes: number;
  relevantNotes: Array<{
    lesson: string;
    topic: string | null;
    title: string;
    noteType: "text" | "drawing";
    summary: string;
    pinned: boolean;
    updatedAt: string;
    relevance: "weak_topic_match" | "lesson_match" | "pinned_recent";
  }>;
  noteCoverage: Array<{
    lesson: string;
    topic: string | null;
    noteCount: number;
    pinnedCount: number;
    drawingNoteCount: number;
  }>;
};

type AiInsightsDrawingContext = {
  recentTestDrawings: {
    testsWithDrawingCount: number;
    drawnQuestionCount: number;
    inlineModeEnabledCount: number;
    topLessons: Array<{ lesson: string; drawingCount: number }>;
    topTopics: Array<{ lesson: string; topic: string; drawingCount: number }>;
  };
  noteDrawings: {
    drawingNoteCount: number;
    topLessons: Array<{ lesson: string; drawingCount: number }>;
    topTopics: Array<{ lesson: string; topic: string; drawingCount: number }>;
  };
};

type AiInsightsContext = {
  noteContext: AiInsightsNoteContext;
  drawingContext: AiInsightsDrawingContext;
  recentQuestionContext: {
    recentTests: Array<{
      testSessionId: number;
      testName: string;
      completedAt: string;
      elapsedSeconds: number;
      wrongQuestions: Array<{
        questionId: number;
        orderIndex: number;
        lesson: string;
        topic: string | null;
        userAnswer: string | null;
        correctChoice: string | null;
      }>;
      blankQuestions: Array<{
        questionId: number;
        orderIndex: number;
        lesson: string;
        topic: string | null;
      }>;
    }>;
    hotWrongTopics: Array<{
      lesson: string;
      topic: string;
      wrongCount: number;
      blankCount: number;
    }>;
  };
};

function toPct(value: number) {
  return `%${Math.round(value * 100)}`;
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function hasDrawingPayload(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "{}") return false;
    try {
      return hasDrawingPayload(JSON.parse(trimmed));
    } catch {
      return trimmed.length > 0;
    }
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (Array.isArray(candidate["overlay"]) && candidate["overlay"].length > 0) return true;
    if (Array.isArray(candidate["board"]) && candidate["board"].length > 0) return true;
    return Object.keys(candidate).length > 0;
  }

  return false;
}

const AI_ALL_TIME_START = "2000-01-01";
const AI_ALL_TIME_END = "2999-12-31";

type TopicAttemptSnapshot = {
  lesson: string;
  topic: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  completedAt: Date;
};

function aggregateTopicAttempts(rows: TopicAttemptSnapshot[]) {
  const aggregate = rows.reduce(
    (acc, row) => {
      acc.totalQuestions += row.totalQuestions;
      acc.answeredCount += row.answeredCount;
      acc.correctCount += row.correctCount;
      acc.wrongCount += row.wrongCount;
      acc.skippedCount += row.skippedCount;
      return acc;
    },
    { totalQuestions: 0, answeredCount: 0, correctCount: 0, wrongCount: 0, skippedCount: 0 },
  );

  return {
    ...aggregate,
    wrongRatio: aggregate.answeredCount > 0 ? aggregate.wrongCount / aggregate.answeredCount : 0,
  };
}

function daysBetween(date: Date, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTopicSignal(attempts: TopicAttemptSnapshot[]): AiTopicSignal {
  const sortedAttempts = [...attempts].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const overall = aggregateTopicAttempts(sortedAttempts);
  const recentCount = Math.min(3, sortedAttempts.length);
  const recentAttempts = sortedAttempts.slice(-recentCount);
  const previousAttempts = sortedAttempts.slice(
    Math.max(0, sortedAttempts.length - recentCount - 4),
    sortedAttempts.length - recentCount,
  );
  const recent = aggregateTopicAttempts(recentAttempts);
  const previous = aggregateTopicAttempts(previousAttempts);
  const latest = sortedAttempts[sortedAttempts.length - 1];
  const latestWrongRatio = latest.answeredCount > 0 ? latest.wrongCount / latest.answeredCount : 0;
  const comparisonBase =
    previous.answeredCount > 0 ? previous.wrongRatio : overall.answeredCount > 0 ? overall.wrongRatio : 0;
  const improvementDelta = comparisonBase - recent.wrongRatio;
  const recentSpike = recentAttempts.some((attempt) => attempt.wrongCount >= 3);
  const daysSinceLastSeen = daysBetween(latest.completedAt);

  const isRecovered =
    recent.answeredCount >= 4 &&
    recent.wrongRatio <= 0.25 &&
    (overall.answeredCount >= 6 ? comparisonBase >= 0.45 || improvementDelta >= 0.18 : latestWrongRatio <= 0.2);

  const hasRecentWeakness =
    (recent.answeredCount >= 3 && recent.wrongRatio >= 0.5) ||
    (latest.answeredCount >= 2 && latestWrongRatio >= 0.5);

  const hasPersistentWeakness =
    overall.answeredCount >= 6 &&
    overall.wrongRatio >= 0.5 &&
    (recent.answeredCount === 0 || recent.wrongRatio >= 0.34 || latestWrongRatio >= 0.34);

  const isActiveWeakness = !isRecovered && (hasRecentWeakness || hasPersistentWeakness || recentSpike);
  const watchSignal =
    !isRecovered &&
    !isActiveWeakness &&
    ((overall.answeredCount >= 4 && overall.wrongRatio >= 0.4) ||
      (recent.answeredCount >= 2 && recent.wrongRatio >= 0.34));

  const stalePenalty = daysSinceLastSeen >= 150 ? 14 : daysSinceLastSeen >= 90 ? 8 : daysSinceLastSeen >= 45 ? 3 : 0;
  const priorityScore =
    recent.wrongRatio * 60 +
    overall.wrongRatio * 22 +
    Math.min(recent.wrongCount, 6) * 4 +
    Math.min(overall.wrongCount, 12) * 1.4 +
    (recentSpike ? 14 : 0) +
    (hasPersistentWeakness ? 10 : 0) +
    (latestWrongRatio >= 0.5 ? 8 : 0) -
    Math.max(0, improvementDelta) * 42 -
    (isRecovered ? 64 : 0) -
    stalePenalty;

  const trendLabel: AiTopicSignal["trendLabel"] = isRecovered
    ? "recovered"
    : isActiveWeakness
      ? "persistent_weakness"
      : improvementDelta >= 0.15
        ? "improving"
        : watchSignal
          ? "watch"
          : "improving";

  return {
    lesson: latest.lesson,
    topic: latest.topic,
    totalQuestions: overall.totalQuestions,
    answeredCount: overall.answeredCount,
    correctCount: overall.correctCount,
    wrongCount: overall.wrongCount,
    skippedCount: overall.skippedCount,
    wrongRatio: overall.wrongRatio,
    recentAnsweredCount: recent.answeredCount,
    recentCorrectCount: recent.correctCount,
    recentWrongCount: recent.wrongCount,
    recentWrongRatio: recent.wrongRatio,
    previousAnsweredCount: previous.answeredCount,
    previousWrongRatio: previous.wrongRatio,
    latestAnsweredCount: latest.answeredCount,
    latestWrongCount: latest.wrongCount,
    latestWrongRatio,
    appearanceCount: sortedAttempts.length,
    improvementDelta: clamp(improvementDelta, -1, 1),
    priorityScore,
    trendLabel,
    recentSpike,
    isRecovered,
    isActiveWeakness,
    lastSeenAt: latest.completedAt.toISOString(),
  };
}

async function buildAllTimeAiOverview(userId: number): Promise<AiAnalyticsOverview> {
  const overview = await getAnalyticsOverview(userId, AI_ALL_TIME_START, AI_ALL_TIME_END);
  if (overview.summary.totalQuestions === 0) {
    return {
      ...overview,
      weakTopics: [],
      repeatReminders: [],
      aiSignals: {
        activeWeakTopics: [],
        recoveredTopics: [],
        watchTopics: [],
      },
    };
  }

  const summaries = await db.select().from(testResultSummariesTable).where(eq(testResultSummariesTable.userId, userId));
  if (summaries.length === 0) {
    return {
      ...overview,
      weakTopics: [],
      repeatReminders: [],
      aiSignals: {
        activeWeakTopics: [],
        recoveredTopics: [],
        watchTopics: [],
      },
    };
  }

  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const resultIds = summaries.map((summary) => summary.id);
  const topicRows = await db
    .select()
    .from(testResultTopicStatsTable)
    .where(inArray(testResultTopicStatsTable.testResultId, resultIds));

  const topicAttemptMap = new Map<string, TopicAttemptSnapshot[]>();
  for (const row of topicRows) {
    const summary = summaryById.get(row.testResultId);
    if (!summary) continue;
    const key = `${row.lesson}__${row.topic}`;
    if (!topicAttemptMap.has(key)) topicAttemptMap.set(key, []);
    topicAttemptMap.get(key)!.push({
      lesson: row.lesson,
      topic: row.topic,
      totalQuestions: row.totalQuestions,
      answeredCount: row.answeredCount,
      correctCount: row.correctCount,
      wrongCount: row.wrongCount,
      skippedCount: row.skippedCount,
      completedAt: summary.completedAt,
    });
  }

  const topicSignals = Array.from(topicAttemptMap.values())
    .map((attempts) => buildTopicSignal(attempts))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.recentWrongRatio - a.recentWrongRatio);

  const activeWeakTopics = topicSignals
    .filter((signal) => signal.isActiveWeakness)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.recentWrongRatio - a.recentWrongRatio)
    .slice(0, 10);

  const recoveredTopics = topicSignals
    .filter((signal) => signal.isRecovered)
    .sort((a, b) => b.improvementDelta - a.improvementDelta || b.recentAnsweredCount - a.recentAnsweredCount)
    .slice(0, 6);

  const watchTopics = topicSignals
    .filter((signal) => !signal.isActiveWeakness && !signal.isRecovered)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 6);

  const repeatReminders = activeWeakTopics.slice(0, 8).map((signal) => ({
    lesson: signal.lesson,
    topic: signal.topic,
    totalQuestions: signal.totalQuestions,
    answeredCount: signal.answeredCount,
    correctCount: signal.correctCount,
    wrongCount: signal.wrongCount,
    skippedCount: signal.skippedCount,
    wrongRatio: signal.recentAnsweredCount > 0 ? signal.recentWrongRatio : signal.wrongRatio,
    repeatPriority:
      signal.recentSpike || signal.recentWrongRatio >= 0.7
        ? ("high" as const)
        : signal.recentWrongRatio >= 0.5 || signal.latestWrongRatio >= 0.5
          ? ("medium" as const)
          : ("low" as const),
    trigger: signal.recentSpike ? ("single_test_spike" as const) : ("aggregate" as const),
    trendLabel: signal.trendLabel,
    lastSeenAt: signal.lastSeenAt,
    priorityScore: signal.priorityScore,
  }));

  return {
    ...overview,
    weakTopics: activeWeakTopics,
    repeatReminders,
    aiSignals: {
      activeWeakTopics,
      recoveredTopics,
      watchTopics,
    },
  };
}

const DEFAULT_AI_RULES = `
Rol:
- YKS öğrencisi için veri odaklı çalışma koçu ol.

Genel ilkeler:
- Sadece verilen veriye dayan.
- Öğrenci davranışına göre kısa ve uygulanabilir öneriler yaz.
- Boş/genel cümlelerden kaç; net eylem öner.

Önceliklendirme:
- Tüm zaman verisini kullan ama son dönemde düzeltilen konuları yeniden "kritik" diye öne çıkarma.
- Önceliği güncel ve devam eden zayıflıklara ver; sadece geçmişte kötü olan konu tek başına yeterli değildir.
- Aynı konuda hem güncel yüksek hata oranı hem düşük hız varsa "kritik" kabul et.
- Tek testte yakın dönemde konusal patlama (3+ yanlış) varsa tekrar listesine ekle.

Süre kullanımı:
- Test süresi trendini son 5 test üzerinden değerlendir.
- Hız düşüşü + hata artışı birlikteyse risk notu üret.

Çıktı kalitesi:
- Kısa, net, uygulanabilir.
- Öneri cümlesi emir kipine yakın olsun ("20 soru çöz", "ertesi gün kontrol et").
- Haftalık plan 3 maddeden oluşsun ve tekrar kontrol adımı içersin.
`.trim();

async function loadAiRulesText() {
  const candidates = [
    path.resolve(process.cwd(), "src/ai/ai_coach_rules.md"),
    path.resolve(process.cwd(), "artifacts/api-server/src/ai/ai_coach_rules.md"),
  ];

  for (const candidate of candidates) {
    try {
      const text = (await fs.readFile(candidate, "utf8")).trim();
      if (text.length > 0) return text;
    } catch {
      // ignore and continue
    }
  }

  return DEFAULT_AI_RULES;
}

async function buildAiInsightsContext(
  userId: number,
  overview: Awaited<ReturnType<typeof getAnalyticsOverview>>,
): Promise<AiInsightsContext> {
  const lessonPriority = new Set(overview.subjectStats.slice(0, 6).map((row) => row.lesson));
  const weakTopicKeys = new Set(
    overview.weakTopics.slice(0, 10).map((row) => `${row.lesson}__${row.topic}`),
  );

  const notes = await db
    .select({
      lesson: notesTable.lesson,
      topic: notesTable.topic,
      title: notesTable.title,
      noteType: notesTable.noteType,
      description: notesTable.description,
      drawingData: notesTable.drawingData,
      pinned: notesTable.pinned,
      updatedAt: notesTable.updatedAt,
    })
    .from(notesTable)
    .where(eq(notesTable.userId, userId))
    .orderBy(desc(notesTable.pinned), desc(notesTable.updatedAt))
    .limit(40);

  const noteCoverageMap = new Map<
    string,
    { lesson: string; topic: string | null; noteCount: number; pinnedCount: number; drawingNoteCount: number }
  >();

  const rankedNotes = notes
    .map((note) => {
      const topic = note.topic?.trim() || null;
      const key = `${note.lesson}__${topic ?? "Konu belirtilmedi"}`;
      if (!noteCoverageMap.has(key)) {
        noteCoverageMap.set(key, {
          lesson: note.lesson,
          topic,
          noteCount: 0,
          pinnedCount: 0,
          drawingNoteCount: 0,
        });
      }

      const coverage = noteCoverageMap.get(key)!;
      coverage.noteCount += 1;
      if (note.pinned) coverage.pinnedCount += 1;
      if (note.noteType === "drawing" || hasDrawingPayload(note.drawingData)) {
        coverage.drawingNoteCount += 1;
      }

      const weakTopicMatch = topic ? weakTopicKeys.has(`${note.lesson}__${topic}`) : false;
      const lessonMatch = lessonPriority.has(note.lesson);
      const relevance: "weak_topic_match" | "lesson_match" | "pinned_recent" = weakTopicMatch
        ? "weak_topic_match"
        : lessonMatch
          ? "lesson_match"
          : "pinned_recent";

      const recencyScore = Math.max(
        0,
        30 - Math.floor((Date.now() - note.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
      );
      const score =
        (weakTopicMatch ? 100 : 0) +
        (lessonMatch ? 40 : 0) +
        (note.pinned ? 25 : 0) +
        (note.noteType === "drawing" ? 8 : 0) +
        recencyScore;

      const summary =
        note.noteType === "drawing"
          ? truncateText(note.description, 120) || "Çizimli not mevcut."
          : truncateText(note.description, 140) || "Kısa metin notu.";

      return {
        lesson: note.lesson,
        topic,
        title: truncateText(note.title, 80) || "Adsız not",
        noteType: note.noteType === "drawing" ? ("drawing" as const) : ("text" as const),
        summary,
        pinned: note.pinned,
        updatedAt: note.updatedAt.toISOString(),
        relevance,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ score: _score, ...note }) => note);

  const noteDrawingsByLesson = new Map<string, number>();
  const noteDrawingsByTopic = new Map<string, { lesson: string; topic: string; drawingCount: number }>();
  for (const note of notes) {
    const hasDrawing = note.noteType === "drawing" || hasDrawingPayload(note.drawingData);
    if (!hasDrawing) continue;
    noteDrawingsByLesson.set(note.lesson, (noteDrawingsByLesson.get(note.lesson) ?? 0) + 1);
    const topic = note.topic?.trim();
    if (!topic) continue;
    const key = `${note.lesson}__${topic}`;
    const current = noteDrawingsByTopic.get(key) ?? { lesson: note.lesson, topic, drawingCount: 0 };
    current.drawingCount += 1;
    noteDrawingsByTopic.set(key, current);
  }

  const recentTestIds = overview.recentResults.slice(0, 6).map((row) => row.testSessionId);
  const drawingRows =
    recentTestIds.length > 0
      ? await db
          .select({
            testSessionId: testSolutionsTable.testSessionId,
            questionId: testSolutionsTable.questionId,
            canvasData: testSolutionsTable.canvasData,
            inlineDrawings: testSolutionsTable.inlineDrawings,
            tempDrawing: testSolutionsTable.tempDrawing,
            inlineDrawEnabled: testSolutionsTable.inlineDrawEnabled,
            lesson: questionsTable.lesson,
            topic: questionsTable.topic,
          })
          .from(testSolutionsTable)
          .leftJoin(questionsTable, eq(testSolutionsTable.questionId, questionsTable.id))
          .where(inArray(testSolutionsTable.testSessionId, recentTestIds))
      : [];

  const drawnQuestionKeys = new Set<string>();
  const testsWithDrawing = new Set<number>();
  let inlineModeEnabledCount = 0;
  const testDrawingsByLesson = new Map<string, number>();
  const testDrawingsByTopic = new Map<string, { lesson: string; topic: string; drawingCount: number }>();

  for (const row of drawingRows) {
    if (row.inlineDrawEnabled) inlineModeEnabledCount += 1;
    const hasDrawing =
      hasDrawingPayload(row.canvasData) ||
      hasDrawingPayload(row.inlineDrawings) ||
      hasDrawingPayload(row.tempDrawing);
    if (!hasDrawing) continue;

    drawnQuestionKeys.add(`${row.testSessionId}__${row.questionId}`);
    testsWithDrawing.add(row.testSessionId);

    const lesson = row.lesson?.trim();
    if (lesson) {
      testDrawingsByLesson.set(lesson, (testDrawingsByLesson.get(lesson) ?? 0) + 1);
    }

    const topic = row.topic?.trim();
    if (lesson && topic) {
      const key = `${lesson}__${topic}`;
      const current = testDrawingsByTopic.get(key) ?? { lesson, topic, drawingCount: 0 };
      current.drawingCount += 1;
      testDrawingsByTopic.set(key, current);
    }
  }

  const recentTestResults = await Promise.all(
    overview.recentResults
      .slice(0, 3)
      .map(async (row) => {
        const result = await getTestResultBySessionId(userId, row.testSessionId);
        if (!result) return null;

        const wrongQuestions = result.questionBreakdown
          .filter((item) => item.status === "YanlisHocayaSor")
          .slice(0, 6)
          .map((item) => ({
            questionId: item.questionId,
            orderIndex: item.orderIndex,
            lesson: item.lesson,
            topic: item.topic ?? null,
            userAnswer: item.userAnswer ?? null,
            correctChoice: item.correctChoice ?? null,
          }));

        const blankQuestions = result.questionBreakdown
          .filter((item) => item.status === "Cozulmedi")
          .slice(0, 6)
          .map((item) => ({
            questionId: item.questionId,
            orderIndex: item.orderIndex,
            lesson: item.lesson,
            topic: item.topic ?? null,
          }));

        return {
          testSessionId: result.testSessionId,
          testName: result.testName,
          completedAt: result.completedAt,
          elapsedSeconds: result.elapsedSeconds,
          wrongQuestions,
          blankQuestions,
        };
      }),
  );

  const hotWrongTopicMap = new Map<
    string,
    { lesson: string; topic: string; wrongCount: number; blankCount: number }
  >();
  for (const test of recentTestResults) {
    if (!test) continue;

    for (const item of test.wrongQuestions) {
      const topic = item.topic?.trim() || "Konu belirtilmedi";
      const key = `${item.lesson}__${topic}`;
      const current = hotWrongTopicMap.get(key) ?? {
        lesson: item.lesson,
        topic,
        wrongCount: 0,
        blankCount: 0,
      };
      current.wrongCount += 1;
      hotWrongTopicMap.set(key, current);
    }

    for (const item of test.blankQuestions) {
      const topic = item.topic?.trim() || "Konu belirtilmedi";
      const key = `${item.lesson}__${topic}`;
      const current = hotWrongTopicMap.get(key) ?? {
        lesson: item.lesson,
        topic,
        wrongCount: 0,
        blankCount: 0,
      };
      current.blankCount += 1;
      hotWrongTopicMap.set(key, current);
    }
  }

  return {
    noteContext: {
      totalNotes: notes.length,
      pinnedNotes: notes.filter((note) => note.pinned).length,
      relevantNotes: rankedNotes,
      noteCoverage: Array.from(noteCoverageMap.values())
        .sort((a, b) => b.noteCount - a.noteCount || b.pinnedCount - a.pinnedCount)
        .slice(0, 8),
    },
    drawingContext: {
      recentTestDrawings: {
        testsWithDrawingCount: testsWithDrawing.size,
        drawnQuestionCount: drawnQuestionKeys.size,
        inlineModeEnabledCount,
        topLessons: Array.from(testDrawingsByLesson.entries())
          .map(([lesson, drawingCount]) => ({ lesson, drawingCount }))
          .sort((a, b) => b.drawingCount - a.drawingCount)
          .slice(0, 5),
        topTopics: Array.from(testDrawingsByTopic.values())
          .sort((a, b) => b.drawingCount - a.drawingCount)
          .slice(0, 6),
      },
      noteDrawings: {
        drawingNoteCount: notes.filter(
          (note) => note.noteType === "drawing" || hasDrawingPayload(note.drawingData),
        ).length,
        topLessons: Array.from(noteDrawingsByLesson.entries())
          .map(([lesson, drawingCount]) => ({ lesson, drawingCount }))
          .sort((a, b) => b.drawingCount - a.drawingCount)
          .slice(0, 5),
        topTopics: Array.from(noteDrawingsByTopic.values())
          .sort((a, b) => b.drawingCount - a.drawingCount)
          .slice(0, 6),
      },
    },
    recentQuestionContext: {
      recentTests: recentTestResults.filter((item) => item !== null),
      hotWrongTopics: Array.from(hotWrongTopicMap.values())
        .sort((a, b) => b.wrongCount - a.wrongCount || b.blankCount - a.blankCount)
        .slice(0, 8),
    },
  };
}

function buildRuleBasedInsights(overview: AiAnalyticsOverview): AiInsightsResponse {
  const weak = overview.weakTopics.slice(0, 4);
  const topLessons = overview.subjectStats.slice(0, 5);
  const success = overview.summary.successRate;
  const totalQuestions = overview.summary.totalQuestions;
  const recoveredTopics = overview.aiSignals.recoveredTopics.slice(0, 3);

  if (totalQuestions === 0) {
    return {
      generatedBy: "rule_based",
      summary: "Henüz sistem genelinde çözülen soru verisi yok. Analiz üretmek için önce en az bir test çöz.",
      priorityTopics: [],
      weeklyPlan: [
        "Önce kısa bir deneme çöz ve süreyi kaydet.",
        "Hata yaptığın konuları işaretle.",
        "Sonra yapay zeka analizini tekrar çalıştır.",
      ],
      examRiskNotes: ["Yeterli veri olmadığından risk analizi üretilemedi."],
      aiWeakTopicHints: [],
      aiRepeatHints: [],
      aiSuggestedTest: null,
    };
  }

  const priorityTopics = weak.map((w) => {
    const reason =
      w.recentAnsweredCount > 0
        ? `Son ${w.appearanceCount >= 3 ? "3" : String(w.appearanceCount)} görünümde ${w.recentWrongCount} yanlış (${toPct(w.recentWrongRatio)}), genel toplam ${w.wrongCount} yanlış`
        : `${w.answeredCount} çözümde ${w.wrongCount} yanlış (${toPct(w.wrongRatio)})`;
    const action =
      w.recentWrongRatio >= 0.7 || w.recentSpike
        ? "Önce temel konu özeti + 20 soru kısa tekrar, ertesi gün 10 soru kontrol."
        : "Kısa konu tekrarı + 15 soru uygulama, 2 gün sonra 10 soru pekiştirme.";
    return { lesson: w.lesson, topic: w.topic, reason, action };
  });

  const weakLesson = [...topLessons]
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 2);

  const weeklyPlan = [
    weakLesson[0]
      ? `${weakLesson[0].lesson}: haftada 3 oturum, her oturum 25-30 soru + yanlış defteri tekrar`
      : "Haftada 3 gün zayıf konularda 25-30 soru çöz",
    weakLesson[1]
      ? `${weakLesson[1].lesson}: haftada 2 oturum, her oturum 20-25 soru + konu özeti`
      : "Haftada 2 gün ikinci zayıf derse 20-25 soru ayır",
    "Pazar günü: hafta içi yanlış yapılan konulardan mini deneme (20-30 soru).",
  ];

  const examRiskNotes: string[] = [];
  if (success < 0.5) {
    examRiskNotes.push("Genel başarı %50 altında. Deneme sıklığını düşürmeden önce konu açığını kapatmaya öncelik ver.");
  } else if (success < 0.65) {
    examRiskNotes.push("Başarı orta seviyede. Zayıf konular düzenli tekrar edilmezse net artışı yavaşlar.");
  } else {
    examRiskNotes.push("Genel başarı iyi. Net artışı için hata yapılan dar konulara nokta atışı tekrar yap.");
  }
  if (weak.length >= 3) {
    examRiskNotes.push("Birden fazla konuda hata yoğunluğu var. Aynı hafta tümüne değil, ilk 2 konuya odaklan.");
  }
  if (recoveredTopics.length > 0) {
    examRiskNotes.push(
      `İyileşen alanlar var: ${recoveredTopics.map((topic) => `${topic.lesson} - ${topic.topic}`).join(", ")}. Bu konuları sadece kısa kontrol testiyle canlı tutman yeterli.`,
    );
  }

  const summary =
    weak.length > 0
      ? `En kritik tekrar alanları: ${weak.map((w) => `${w.lesson} - ${w.topic}`).join(", ")}.`
      : recoveredTopics.length > 0
        ? `Belirgin aktif zayıf konu görünmüyor. Son dönemde toparlanan alanlar: ${recoveredTopics.map((topic) => `${topic.lesson} - ${topic.topic}`).join(", ")}.`
        : "Belirgin aktif zayıf konu görünmüyor; mevcut ritmi koruyup düzenli deneme çöz.";

  const aiWeakTopicHints = weak.slice(0, 3).map((w) => ({
    lesson: w.lesson,
    topic: w.topic,
    why:
      w.recentAnsweredCount > 0
        ? `Güncel sinyal: ${w.recentWrongCount} yanlış / ${w.recentAnsweredCount} cevap (${toPct(w.recentWrongRatio)})`
        : `${w.answeredCount} çözümde ${w.wrongCount} yanlış (${toPct(w.wrongRatio)})`,
    suggestion: "Bu konu için 1 özet turu + 20 soru tekrar + ertesi gün 10 soru kontrol yap.",
  }));

  const aiRepeatHints = overview.repeatReminders.slice(0, 3).map((r) => ({
    lesson: r.lesson,
    topic: r.topic,
    cadence:
      r.repeatPriority === "high"
        ? "48 saat içinde tekrar et"
        : r.repeatPriority === "medium"
          ? "3 gün içinde tekrar et"
          : "Bu hafta içinde tekrar et",
    suggestion:
      r.repeatPriority === "high"
        ? "İlk turda kolay-orta 15 soru, ikinci turda 10 yeni soru çöz."
        : "Konu özetinden sonra 10-15 soru ile pekiştir.",
  }));

  const suggestedLessons = Array.from(new Set(weak.map((w) => w.lesson))).slice(0, 2);
  const suggestedTopics = weak.map((w) => w.topic).slice(0, 4);
  const distribution: Record<string, number> = {};
  for (const lesson of suggestedLessons) {
    distribution[lesson] = Math.max(8, Math.round(24 / Math.max(suggestedLessons.length, 1)));
  }

  const aiSuggestedTest =
    suggestedLessons.length > 0
      ? {
          name: "AI Önerisi - Zayıf Konu Tarama Testi",
          reason: "Yüksek hata oranlı konuları hızlı tekrar etmek için seçildi.",
          count: Math.max(16, Object.values(distribution).reduce((s, v) => s + v, 0)),
          filters: {
            lessons: suggestedLessons,
            topics: suggestedTopics,
            status: "Cozulmedi" as const,
          },
          distribution,
        }
      : null;

  return {
    generatedBy: "rule_based",
    summary,
    priorityTopics,
    weeklyPlan,
    examRiskNotes,
    aiWeakTopicHints,
    aiRepeatHints,
    aiSuggestedTest,
  };
}

function getGeminiKey() {
  return process.env["GEMINI_API_KEY"]?.trim() || "";
}

function getGeminiModel() {
  return process.env["GEMINI_MODEL"]?.trim() || "gemini-1.5-flash";
}

function normalizeAiResponse(raw: string): AiInsightsResponse {
  const tryParse = (text: string) => JSON.parse(text) as Partial<AiInsightsResponse>;
  let parsed: Partial<AiInsightsResponse> | null = null;
  try {
    parsed = tryParse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = tryParse(raw.slice(start, end + 1));
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed || typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
    return {
      generatedBy: "ai",
      summary: raw.length > 260 ? `${raw.slice(0, 260).trim()}...` : raw,
      priorityTopics: [],
      weeklyPlan: [],
      examRiskNotes: [],
      aiWeakTopicHints: [],
      aiRepeatHints: [],
      aiSuggestedTest: null,
    };
  }

  const safeAiWeakTopicHints = Array.isArray(parsed.aiWeakTopicHints)
    ? parsed.aiWeakTopicHints
        .slice(0, 4)
        .filter((item) => item && typeof item.lesson === "string" && typeof item.topic === "string")
        .map((item) => ({
          lesson: item.lesson,
          topic: item.topic,
          why: typeof item.why === "string" ? item.why : "AI sinyali",
          suggestion: typeof item.suggestion === "string" ? item.suggestion : "Kısa tekrar yap.",
        }))
    : [];

  const safeAiRepeatHints = Array.isArray(parsed.aiRepeatHints)
    ? parsed.aiRepeatHints
        .slice(0, 4)
        .filter((item) => item && typeof item.lesson === "string" && typeof item.topic === "string")
        .map((item) => ({
          lesson: item.lesson,
          topic: item.topic,
          cadence: typeof item.cadence === "string" ? item.cadence : "Bu hafta tekrar et",
          suggestion: typeof item.suggestion === "string" ? item.suggestion : "Konu tekrarını planla.",
        }))
    : [];

  const safeAiSuggestedTest =
    parsed.aiSuggestedTest &&
    typeof parsed.aiSuggestedTest.name === "string" &&
    typeof parsed.aiSuggestedTest.reason === "string" &&
    typeof parsed.aiSuggestedTest.count === "number" &&
    parsed.aiSuggestedTest.filters &&
    Array.isArray(parsed.aiSuggestedTest.filters.lessons) &&
    Array.isArray(parsed.aiSuggestedTest.filters.topics)
      ? {
          name: parsed.aiSuggestedTest.name,
          reason: parsed.aiSuggestedTest.reason,
          count: Math.min(40, Math.max(16, Math.round(parsed.aiSuggestedTest.count))),
          filters: {
            lessons: parsed.aiSuggestedTest.filters.lessons.slice(0, 4),
            topics: parsed.aiSuggestedTest.filters.topics.slice(0, 8),
            status: "Cozulmedi" as const,
          },
          distribution:
            parsed.aiSuggestedTest.distribution && typeof parsed.aiSuggestedTest.distribution === "object"
              ? Object.fromEntries(
                  Object.entries(parsed.aiSuggestedTest.distribution)
                    .filter(([lesson, amount]) => typeof lesson === "string" && Number.isFinite(amount))
                    .slice(0, 4)
                    .map(([lesson, amount]) => [lesson, Math.max(1, Math.round(amount))]),
                )
              : {},
        }
      : null;

  return {
    generatedBy: "ai",
    summary: parsed.summary.trim(),
    priorityTopics: Array.isArray(parsed.priorityTopics) ? parsed.priorityTopics.slice(0, 5) : [],
    weeklyPlan: Array.isArray(parsed.weeklyPlan) ? parsed.weeklyPlan.slice(0, 3) : [],
    examRiskNotes: Array.isArray(parsed.examRiskNotes) ? parsed.examRiskNotes.slice(0, 4) : [],
    aiWeakTopicHints: safeAiWeakTopicHints,
    aiRepeatHints: safeAiRepeatHints,
    aiSuggestedTest: safeAiSuggestedTest,
  };
}

async function tryGeminiInsights(
  overview: AiAnalyticsOverview,
  context: AiInsightsContext,
): Promise<AiInsightsResponse | null> {
  const apiKey = getGeminiKey();
  if (!apiKey) return null;
  const model = getGeminiModel();

  const aiRulesText = await loadAiRulesText();
  const elapsedList = overview.recentResults.map((row) => row.elapsedSeconds).filter((s) => s > 0);
  const recentSlice = elapsedList.slice(0, 3);
  const olderSlice = elapsedList.slice(3, 6);
  const speedTrend = recentSlice.length && olderSlice.length ? avg(recentSlice) - avg(olderSlice) : 0;

  const compact = {
    analysisScope: {
      type: "all_time",
      description: "Bu veri paketinde AI tüm zamanları değerlendirir; UI tarih filtresi dikkate alınmaz.",
    },
    summary: overview.summary,
    subjectStats: overview.subjectStats.slice(0, 6),
    weakTopics: overview.weakTopics.slice(0, 6),
    repeatReminders: overview.repeatReminders.slice(0, 4),
    recentResults: overview.recentResults.slice(0, 6),
    trendSignals: {
      activeWeakTopics: overview.aiSignals.activeWeakTopics.slice(0, 6).map((topic) => ({
        lesson: topic.lesson,
        topic: topic.topic,
        recentWrongRatio: Number(topic.recentWrongRatio.toFixed(3)),
        overallWrongRatio: Number(topic.wrongRatio.toFixed(3)),
        recentWrongCount: topic.recentWrongCount,
        recentAnsweredCount: topic.recentAnsweredCount,
        improvementDelta: Number(topic.improvementDelta.toFixed(3)),
        recentSpike: topic.recentSpike,
        lastSeenAt: topic.lastSeenAt,
      })),
      recoveredTopics: overview.aiSignals.recoveredTopics.slice(0, 5).map((topic) => ({
        lesson: topic.lesson,
        topic: topic.topic,
        recentWrongRatio: Number(topic.recentWrongRatio.toFixed(3)),
        previousWrongRatio: Number(topic.previousWrongRatio.toFixed(3)),
        improvementDelta: Number(topic.improvementDelta.toFixed(3)),
        lastSeenAt: topic.lastSeenAt,
      })),
      watchTopics: overview.aiSignals.watchTopics.slice(0, 5).map((topic) => ({
        lesson: topic.lesson,
        topic: topic.topic,
        recentWrongRatio: Number(topic.recentWrongRatio.toFixed(3)),
        overallWrongRatio: Number(topic.wrongRatio.toFixed(3)),
        lastSeenAt: topic.lastSeenAt,
      })),
    },
    behaviorSignals: {
      solvedTests: overview.recentResults.length,
      avgElapsedSeconds: Math.round(avg(elapsedList)),
      speedTrendSeconds: Math.round(speedTrend),
      highWrongTopicCount: overview.weakTopics.filter((w) => w.wrongRatio >= 0.6).length,
    },
    noteContext: context.noteContext,
    drawingContext: context.drawingContext,
    recentQuestionContext: context.recentQuestionContext,
  };

  const prompt = `
Sen deneyimli bir YKS koçusun.
Aşağıdaki AI kurallarına uy:
${aiRulesText}

Kısa, net ve eyleme dönük Türkçe öneriler üret.
Türkçe karakterleri doğru kullan (ç, ğ, ı, İ, ö, ş, ü).
Sadece geçerli JSON döndür, JSON dışı metin üretme.
Bu analiz seçili tarih aralığından bağımsızdır; tüm zamanları kullan ama özellikle son dönemdeki yön değişimini dikkate al.
Geçmişte zayıf olup son denemelerde toparlanan konuları kritik listesine geri alma. Ancak yeniden bozulma sinyali varsa tekrar gündeme getir.
Not ve çizim bağlamı verilirse yalnızca destekleyici sinyal olarak kullan; performans verisinin önüne geçirme.
Ham çizim koordinatları yoksa bunu sorun etme; çizim kullanım yoğunluğunu davranış sinyali olarak değerlendir.
Son soru kırılımı verilirse boş bırakılan ve yanlış yapılan soru örüntülerini özellikle dikkate al.

Sema:
{
  "generatedBy":"ai",
  "summary":"string",
  "priorityTopics":[{"lesson":"string","topic":"string","reason":"string","action":"string"}],
  "weeklyPlan":["string"],
  "examRiskNotes":["string"],
  "aiWeakTopicHints":[{"lesson":"string","topic":"string","why":"string","suggestion":"string"}],
  "aiRepeatHints":[{"lesson":"string","topic":"string","cadence":"string","suggestion":"string"}],
  "aiSuggestedTest":{
    "name":"string",
    "reason":"string",
    "count":24,
    "filters":{"lessons":["string"],"topics":["string"],"status":"Cozulmedi"},
    "distribution":{"DersAdi":12}
  }
}

Kurallar:
- priorityTopics en fazla 5.
- weeklyPlan tam 3 madde.
- examRiskNotes 2-4 madde.
- aiWeakTopicHints en fazla 4.
- aiRepeatHints en fazla 4.
- aiSuggestedTest count 16-40 arası.
- aiSuggestedTest.filters.lessons en az 1 ders.
- Tüm metinler Türkçe olsun.
- Düzelmiş konuları sadece kısa kontrol/koruma önerisi olarak an; aktif zayıflık gibi sunma.

Veri:
${JSON.stringify(compact)}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1100,
          responseMimeType: "application/json",
        },
        contents: [{ role: "user", parts: [{ text: prompt.trim() }] }],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw =
    payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!raw) return null;
  return normalizeAiResponse(raw);
}

export async function getAnalyticsAiInsights(userId: number) {
  const overview = await buildAllTimeAiOverview(userId);
  const fallback = buildRuleBasedInsights(overview);
  let insights: AiInsightsResponse = fallback;

  if (overview.summary.totalQuestions === 0) {
    insights = fallback;
  } else {
    try {
      const context = await buildAiInsightsContext(userId, overview);
      const ai = await tryGeminiInsights(overview, context);
      insights = ai ?? fallback;
    } catch (error) {
      console.error("Gemini insights fallback used:", error);
      insights = fallback;
    }
  }

  const requestedAt = new Date();
  await db
    .insert(analyticsAiInsightsTable)
    .values({
      userId,
      insights,
      requestedAt,
      updatedAt: requestedAt,
    })
    .onConflictDoUpdate({
      target: analyticsAiInsightsTable.userId,
      set: {
        insights,
        requestedAt,
        updatedAt: requestedAt,
      },
    });

  return { insights, requestedAt: requestedAt.toISOString() };
}

export async function getLatestAnalyticsAiInsights(userId: number) {
  const [row] = await db
    .select({
      insights: analyticsAiInsightsTable.insights,
      requestedAt: analyticsAiInsightsTable.requestedAt,
    })
    .from(analyticsAiInsightsTable)
    .where(eq(analyticsAiInsightsTable.userId, userId))
    .limit(1);

  if (!row) return null;
  return {
    insights: row.insights as AiInsightsResponse,
    requestedAt: row.requestedAt.toISOString(),
  };
}

export async function deleteLatestAnalyticsAiInsights(userId: number) {
  await db.delete(analyticsAiInsightsTable).where(eq(analyticsAiInsightsTable.userId, userId));
}

export async function getAiRuntimeStatus() {
  const key = getGeminiKey();
  const model = getGeminiModel();
  if (!key) {
    return { provider: "rule_based", model, geminiConfigured: false };
  }
  return { provider: "gemini", model, geminiConfigured: true };
}
