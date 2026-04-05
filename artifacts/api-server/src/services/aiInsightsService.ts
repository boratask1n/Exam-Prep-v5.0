import fs from "node:fs/promises";
import path from "node:path";
import { db, notesTable, questionsTable, testSolutionsTable } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { getAnalyticsOverview, getTestResultBySessionId } from "./testResultService";

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

const DEFAULT_AI_RULES = `
Rol:
- YKS öğrencisi için veri odaklı çalışma koçu ol.

Genel ilkeler:
- Sadece verilen veriye dayan.
- Öğrenci davranışına göre kısa ve uygulanabilir öneriler yaz.
- Boş/genel cümlelerden kaç; net eylem öner.

Önceliklendirme:
- Son testlerde tekrar eden hata konularına daha yüksek öncelik ver.
- Aynı konuda hem yüksek hata oranı hem düşük hız varsa "kritik" kabul et.
- Tek testte konusal patlama (3+ yanlış) varsa tekrar listesine mutlaka ekle.

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
        const result = await getTestResultBySessionId(row.testSessionId);
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

function buildRuleBasedInsights(overview: Awaited<ReturnType<typeof getAnalyticsOverview>>): AiInsightsResponse {
  const weak = overview.weakTopics.slice(0, 4);
  const topLessons = overview.subjectStats.slice(0, 5);
  const success = overview.summary.successRate;
  const totalQuestions = overview.summary.totalQuestions;

  if (totalQuestions === 0) {
    return {
      generatedBy: "rule_based",
      summary: "Bu tarih aralığında henüz çözülen soru verisi yok. Analiz üretmek için en az bir test çöz.",
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
    const reason = `${w.answeredCount} çözümde ${w.wrongCount} yanlış (${toPct(w.wrongRatio)})`;
    const action =
      w.wrongRatio >= 0.7
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

  const summary =
    weak.length > 0
      ? `En kritik tekrar alanları: ${weak.map((w) => `${w.lesson} - ${w.topic}`).join(", ")}.`
      : "Bu aralıkta belirgin zayıf konu sinyali yok; mevcut ritmi koruyup düzenli deneme çöz.";

  const aiWeakTopicHints = weak.slice(0, 3).map((w) => ({
    lesson: w.lesson,
    topic: w.topic,
    why: `${w.answeredCount} çözümde ${w.wrongCount} yanlış (${toPct(w.wrongRatio)})`,
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
  overview: Awaited<ReturnType<typeof getAnalyticsOverview>>,
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
    summary: overview.summary,
    subjectStats: overview.subjectStats.slice(0, 6),
    weakTopics: overview.weakTopics.slice(0, 6),
    repeatReminders: overview.repeatReminders.slice(0, 4),
    recentResults: overview.recentResults.slice(0, 6),
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

export async function getAnalyticsAiInsights(startDateRaw?: string, endDateRaw?: string) {
  const overview = await getAnalyticsOverview(startDateRaw, endDateRaw);
  const fallback = buildRuleBasedInsights(overview);
  if (overview.summary.totalQuestions === 0) {
    return fallback;
  }

  try {
    const context = await buildAiInsightsContext(overview);
    const ai = await tryGeminiInsights(overview, context);
    if (ai) return ai;
    return fallback;
  } catch (error) {
    console.error("Gemini insights fallback used:", error);
    return fallback;
  }
}

export async function getAiRuntimeStatus() {
  const key = getGeminiKey();
  const model = getGeminiModel();
  if (!key) {
    return { provider: "rule_based", model, geminiConfigured: false };
  }
  return { provider: "gemini", model, geminiConfigured: true };
}
