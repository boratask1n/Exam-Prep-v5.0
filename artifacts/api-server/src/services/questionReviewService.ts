import { db, questionReviewStatsTable, questionsTable } from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";

type QuestionStatus = "Cozulmedi" | "DogruCozuldu" | "YanlisHocayaSor";
export type QuestionReviewFeedback =
  | "again"
  | "wrong"
  | "hard"
  | "correct"
  | "easy"
  | "less_often"
  | "more_often";

type QuestionReviewOutcome = "correct" | "wrong";

type ReviewQuestionRow = {
  id: number;
  imageUrl: string | null;
  description: string | null;
  lesson: string;
  topic: string | null;
  publisher: string | null;
  testName: string | null;
  testNo: string | null;
  choice: string | null;
  solutionUrl: string | null;
  solutionYoutubeUrl: string | null;
  solutionYoutubeStartSecond: number | null;
  solutionYoutubeEndSecond: number | null;
  category: string;
  source: string;
  status: QuestionStatus;
  hasDrawing: boolean;
  isOsymBadge: boolean;
  isPremiumBadge: boolean;
  createdAt: Date;
  updatedAt: Date;
  totalServed: number | null;
  totalReviewed: number | null;
  correctReviewCount: number | null;
  wrongReviewCount: number | null;
  repetitionStage: number | null;
  lastServedAt: Date | null;
  lastReviewedAt: Date | null;
  nextEligibleAt: Date | null;
  lastOutcome: string | null;
  lastTestSessionId: number | null;
};

type QuestionWithSolution = {
  questionId: number;
  status: QuestionStatus;
};

const REVIEW_INTERVAL_MINUTES = [
  0, 15, 120, 720, 1440, 4320, 10080, 20160, 43200,
];
const MIN_SERVE_GAP_MS = 45 * 1000;

function getReviewDueAt(
  row: Pick<ReviewQuestionRow, "nextEligibleAt" | "createdAt">,
) {
  return row.nextEligibleAt instanceof Date
    ? row.nextEligibleAt
    : row.createdAt;
}

function clampStage(stage: number) {
  return Math.max(0, Math.min(stage, REVIEW_INTERVAL_MINUTES.length - 1));
}

function getNextEligibleFromStage(stage: number, now: Date) {
  const normalizedStage = clampStage(stage);
  return new Date(
    now.getTime() + REVIEW_INTERVAL_MINUTES[normalizedStage] * 60 * 1000,
  );
}

function parseQuestionIds(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return [] as number[];
  return value
    .split(",")
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function buildQuestionReviewScore(row: ReviewQuestionRow, now: Date) {
  const dueAt = getReviewDueAt(row);
  const totalServed = typeof row.totalServed === "number" ? row.totalServed : 0;
  const totalReviewed =
    typeof row.totalReviewed === "number" ? row.totalReviewed : 0;
  const repetitionStage =
    typeof row.repetitionStage === "number" ? row.repetitionStage : 0;
  const lastServedAt =
    row.lastServedAt instanceof Date ? row.lastServedAt : null;
  const isDue = dueAt.getTime() <= now.getTime();
  const minutesOverdue = isDue
    ? Math.max(0, (now.getTime() - dueAt.getTime()) / 60000)
    : 0;
  const minutesUntilDue = !isDue
    ? Math.max(0, (dueAt.getTime() - now.getTime()) / 60000)
    : 0;

  const statusBoost =
    row.status === "YanlisHocayaSor"
      ? 170
      : row.status === "Cozulmedi"
        ? 70
        : -25;
  const unseenBoost = totalServed === 0 ? 95 : 0;
  const neverReviewedBoost = totalReviewed === 0 ? 60 : 0;
  const badgeBoost = (row.isOsymBadge ? 10 : 0) + (row.isPremiumBadge ? 8 : 0);
  const cooldownPenalty =
    lastServedAt &&
    now.getTime() - lastServedAt.getTime() < MIN_SERVE_GAP_MS * 6
      ? -160
      : 0;
  const stagePenalty = repetitionStage * 10;
  const dueBoost = isDue
    ? 150 + Math.min(90, minutesOverdue / 12)
    : Math.max(-80, -(minutesUntilDue / 20));

  return (
    statusBoost +
    unseenBoost +
    neverReviewedBoost +
    badgeBoost +
    cooldownPenalty +
    dueBoost -
    stagePenalty
  );
}

function pickWeightedQuestions<T extends { score: number }>(
  rows: T[],
  limit: number,
) {
  const pool = [...rows];
  const selected: T[] = [];

  while (pool.length > 0 && selected.length < limit) {
    const weights = pool.map((row) => Math.max(1, row.score + 240));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = Math.random() * totalWeight;
    let chosenIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        chosenIndex = index;
        break;
      }
    }

    selected.push(pool[chosenIndex]);
    pool.splice(chosenIndex, 1);
  }

  return selected;
}

function serializeReviewQuestion(row: ReviewQuestionRow & { score?: number }) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastServedAt:
      row.lastServedAt instanceof Date ? row.lastServedAt.toISOString() : null,
    lastReviewedAt:
      row.lastReviewedAt instanceof Date
        ? row.lastReviewedAt.toISOString()
        : null,
    nextEligibleAt:
      row.nextEligibleAt instanceof Date
        ? row.nextEligibleAt.toISOString()
        : null,
  };
}

async function getQuestionById(questionId: number) {
  return db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.id, questionId))
    .then((rows) => rows[0] ?? null);
}

async function getOwnedQuestionById(userId: number, questionId: number) {
  return db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(
      and(eq(questionsTable.id, questionId), eq(questionsTable.userId, userId)),
    )
    .then((rows) => rows[0] ?? null);
}

export async function getQuestionReviewFeed(params: {
  userId: number;
  limit?: number;
  search?: string;
  excludeIdsRaw?: unknown;
}) {
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 16);
  const search = params.search?.trim();
  const excludeIds = parseQuestionIds(params.excludeIdsRaw);
  const conditions = [eq(questionsTable.userId, params.userId)];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        sql`coalesce(${questionsTable.lesson}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.topic}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.category}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.source}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.publisher}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.testName}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.testNo}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.choice}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.solutionUrl}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.solutionYoutubeUrl}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.description}, '') ilike ${pattern}`,
        sql`coalesce(${questionsTable.options}::text, '') ilike ${pattern}`,
      )!,
    );
  }

  if (excludeIds.length > 0) {
    conditions.push(
      sql`${questionsTable.id} not in (${sql.join(
        excludeIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  }

  const rows = (await db
    .select({
      id: questionsTable.id,
      imageUrl: questionsTable.imageUrl,
      description: questionsTable.description,
      lesson: questionsTable.lesson,
      topic: questionsTable.topic,
      publisher: questionsTable.publisher,
      testName: questionsTable.testName,
      testNo: questionsTable.testNo,
      choice: questionsTable.choice,
      solutionUrl: questionsTable.solutionUrl,
      solutionYoutubeUrl: questionsTable.solutionYoutubeUrl,
      solutionYoutubeStartSecond: questionsTable.solutionYoutubeStartSecond,
      solutionYoutubeEndSecond: questionsTable.solutionYoutubeEndSecond,
      category: questionsTable.category,
      source: questionsTable.source,
      status: questionsTable.status,
      hasDrawing: questionsTable.hasDrawing,
      isOsymBadge: questionsTable.isOsymBadge,
      isPremiumBadge: questionsTable.isPremiumBadge,
      createdAt: questionsTable.createdAt,
      updatedAt: questionsTable.updatedAt,
      totalServed: questionReviewStatsTable.totalServed,
      totalReviewed: questionReviewStatsTable.totalReviewed,
      correctReviewCount: questionReviewStatsTable.correctReviewCount,
      wrongReviewCount: questionReviewStatsTable.wrongReviewCount,
      repetitionStage: questionReviewStatsTable.repetitionStage,
      lastServedAt: questionReviewStatsTable.lastServedAt,
      lastReviewedAt: questionReviewStatsTable.lastReviewedAt,
      nextEligibleAt: questionReviewStatsTable.nextEligibleAt,
      lastOutcome: questionReviewStatsTable.lastOutcome,
      lastTestSessionId: questionReviewStatsTable.lastTestSessionId,
    })
    .from(questionsTable)
    .leftJoin(
      questionReviewStatsTable,
      eq(questionReviewStatsTable.questionId, questionsTable.id),
    )
    .where(
      conditions.length > 0 ? and(...conditions) : undefined,
    )) as ReviewQuestionRow[];

  const now = new Date();
  const scoredRows = rows
    .map((row) => ({ ...row, score: buildQuestionReviewScore(row, now) }))
    .sort((left, right) => right.score - left.score);
  const candidatePool = scoredRows.slice(0, Math.max(limit * 5, 20));
  const selected = pickWeightedQuestions(candidatePool, limit)
    .sort((left, right) => right.score - left.score)
    .map(serializeReviewQuestion);

  return {
    items: selected,
    pagination: {
      total: rows.length,
      limit,
      offset: 0,
      hasMore: rows.length > selected.length,
    },
    algorithm: {
      name: "active-recall-question-feed",
      description:
        "Yanlış ve zamanı gelen soruları öne alır; doğru çözülenleri giderek daha uzun aralıklarla geri getirir.",
    },
  };
}

export async function markQuestionServed(userId: number, questionId: number) {
  const question = await getOwnedQuestionById(userId, questionId);
  if (!question) return null;

  const existing = await db
    .select()
    .from(questionReviewStatsTable)
    .where(eq(questionReviewStatsTable.questionId, questionId))
    .then((rows) => rows[0] ?? null);
  const now = new Date();

  if (
    existing?.lastServedAt instanceof Date &&
    now.getTime() - existing.lastServedAt.getTime() < MIN_SERVE_GAP_MS
  ) {
    return { ok: true, deduped: true };
  }

  const currentStage =
    typeof existing?.repetitionStage === "number"
      ? existing.repetitionStage
      : 0;
  const nextEligibleAt = getNextEligibleFromStage(
    Math.max(1, currentStage),
    now,
  );

  if (existing) {
    await db
      .update(questionReviewStatsTable)
      .set({
        totalServed: (existing.totalServed ?? 0) + 1,
        lastServedAt: now,
        nextEligibleAt,
        updatedAt: now,
      })
      .where(eq(questionReviewStatsTable.questionId, questionId));
  } else {
    await db.insert(questionReviewStatsTable).values({
      questionId,
      totalServed: 1,
      repetitionStage: 0,
      lastServedAt: now,
      nextEligibleAt,
      updatedAt: now,
    });
  }

  return { ok: true, nextEligibleAt: nextEligibleAt.toISOString() };
}

export async function submitQuestionReviewFeedback(
  userId: number,
  questionId: number,
  feedback: QuestionReviewFeedback,
) {
  const question = await getOwnedQuestionById(userId, questionId);
  if (!question) return null;

  const existing = await db
    .select()
    .from(questionReviewStatsTable)
    .where(eq(questionReviewStatsTable.questionId, questionId))
    .then((rows) => rows[0] ?? null);
  const now = new Date();
  const baseStage =
    typeof existing?.repetitionStage === "number"
      ? existing.repetitionStage
      : 0;

  const outcome: QuestionReviewOutcome | null =
    feedback === "correct" || feedback === "easy"
      ? "correct"
      : feedback === "again" || feedback === "wrong" || feedback === "hard"
        ? "wrong"
        : null;

  let nextStage = baseStage;
  if (feedback === "again" || feedback === "wrong") nextStage = 0;
  if (feedback === "hard") nextStage = Math.max(1, baseStage);
  if (feedback === "correct" || feedback === "easy")
    nextStage = Math.min(baseStage + 2, REVIEW_INTERVAL_MINUTES.length - 1);
  if (feedback === "less_often")
    nextStage = Math.min(baseStage + 3, REVIEW_INTERVAL_MINUTES.length - 1);
  if (feedback === "more_often") nextStage = Math.max(0, baseStage - 1);

  const nextEligibleAt =
    feedback === "again" || feedback === "wrong"
      ? new Date(now.getTime() + 10 * 60 * 1000)
      : feedback === "hard"
        ? new Date(
            now.getTime() +
              Math.max(30, REVIEW_INTERVAL_MINUTES[nextStage]) * 60 * 1000,
          )
        : feedback === "more_often"
          ? new Date(now.getTime() + 25 * 60 * 1000)
          : feedback === "less_often"
            ? new Date(
                now.getTime() +
                  Math.max(720, REVIEW_INTERVAL_MINUTES[nextStage]) * 60 * 1000,
              )
            : getNextEligibleFromStage(nextStage, now);

  if (existing) {
    await db
      .update(questionReviewStatsTable)
      .set({
        totalReviewed: (existing.totalReviewed ?? 0) + (outcome ? 1 : 0),
        correctReviewCount:
          (existing.correctReviewCount ?? 0) + (outcome === "correct" ? 1 : 0),
        wrongReviewCount:
          (existing.wrongReviewCount ?? 0) + (outcome === "wrong" ? 1 : 0),
        repetitionStage: nextStage,
        lastReviewedAt: outcome ? now : existing.lastReviewedAt,
        nextEligibleAt,
        lastOutcome: outcome ?? existing.lastOutcome,
        updatedAt: now,
      })
      .where(eq(questionReviewStatsTable.questionId, questionId));
  } else {
    await db.insert(questionReviewStatsTable).values({
      questionId,
      totalReviewed: outcome ? 1 : 0,
      correctReviewCount: outcome === "correct" ? 1 : 0,
      wrongReviewCount: outcome === "wrong" ? 1 : 0,
      repetitionStage: nextStage,
      lastReviewedAt: outcome ? now : null,
      nextEligibleAt,
      lastOutcome: outcome,
      updatedAt: now,
    });
  }

  if (outcome) {
    await db
      .update(questionsTable)
      .set({
        status: outcome === "correct" ? "DogruCozuldu" : "YanlisHocayaSor",
        updatedAt: now,
      })
      .where(
        and(
          eq(questionsTable.id, questionId),
          eq(questionsTable.userId, userId),
        ),
      );
  }

  return {
    ok: true,
    feedback,
    outcome,
    repetitionStage: nextStage,
    nextEligibleAt: nextEligibleAt.toISOString(),
  };
}

export async function applyQuestionReviewOutcomesFromTest(
  tx: any,
  testSessionId: number,
  questions: QuestionWithSolution[],
) {
  const reviewedQuestions = questions.filter(
    (question) =>
      question.status === "DogruCozuldu" ||
      question.status === "YanlisHocayaSor",
  );
  if (reviewedQuestions.length === 0) return;

  const questionIds = reviewedQuestions.map((question) => question.questionId);
  const existingRows = (await tx
    .select()
    .from(questionReviewStatsTable)
    .where(inArray(questionReviewStatsTable.questionId, questionIds))) as Array<
    typeof questionReviewStatsTable.$inferSelect
  >;
  const existingByQuestionId = new Map<
    number,
    typeof questionReviewStatsTable.$inferSelect
  >(existingRows.map((row) => [row.questionId, row]));
  const now = new Date();

  for (const question of reviewedQuestions) {
    const outcome: QuestionReviewOutcome =
      question.status === "DogruCozuldu" ? "correct" : "wrong";
    const existing = existingByQuestionId.get(question.questionId);
    if (existing?.lastTestSessionId === testSessionId) continue;

    const baseStage =
      typeof existing?.repetitionStage === "number"
        ? existing.repetitionStage
        : 0;
    const nextStage =
      outcome === "correct"
        ? Math.min(baseStage + 1, REVIEW_INTERVAL_MINUTES.length - 1)
        : 0;
    const nextEligibleAt =
      outcome === "correct"
        ? getNextEligibleFromStage(nextStage, now)
        : new Date(now.getTime() + 10 * 60 * 1000);

    if (existing) {
      await tx
        .update(questionReviewStatsTable)
        .set({
          totalReviewed: (existing.totalReviewed ?? 0) + 1,
          correctReviewCount:
            (existing.correctReviewCount ?? 0) +
            (outcome === "correct" ? 1 : 0),
          wrongReviewCount:
            (existing.wrongReviewCount ?? 0) + (outcome === "wrong" ? 1 : 0),
          repetitionStage: nextStage,
          lastReviewedAt: now,
          nextEligibleAt,
          lastOutcome: outcome,
          lastTestSessionId: testSessionId,
          updatedAt: now,
        })
        .where(eq(questionReviewStatsTable.questionId, question.questionId));
    } else {
      await tx.insert(questionReviewStatsTable).values({
        questionId: question.questionId,
        totalReviewed: 1,
        correctReviewCount: outcome === "correct" ? 1 : 0,
        wrongReviewCount: outcome === "wrong" ? 1 : 0,
        repetitionStage: nextStage,
        lastReviewedAt: now,
        nextEligibleAt,
        lastOutcome: outcome,
        lastTestSessionId: testSessionId,
        updatedAt: now,
      });
    }
  }
}
