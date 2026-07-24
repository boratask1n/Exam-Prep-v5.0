/**
 * ÖSYM sınav konfigürasyonları — 2024-2025 standartları
 * UI ve form mantığından bağımsız olarak burada tutulur.
 */

// ─── Tipler ────────────────────────────────────────────────────────────────

export interface SubjectConfig {
  /** Ders adı (veritabanında anahtar olarak kullanılır) */
  lesson: string;
  /** Resmi soru sayısı */
  questionCount: number;
  /** AYT grubu (Sayısal / Sözel / EA / Dil) — isteğe bağlı */
  group?: "Sayısal" | "Sözel" | "EA" | "Dil";
}

export interface ExamConfig {
  category: "TYT" | "AYT";
  durationMinutes: number;
  totalQuestions: number;
  subjects: SubjectConfig[];
}

export interface SubjectResult {
  correct: number;
  wrong: number;
  net: number;
  questionCount: number;
}

export type SubjectResults = Record<string, SubjectResult>;

// ─── TYT Yapılandırması ────────────────────────────────────────────────────

export const TYT_EXAM_CONFIG: ExamConfig = {
  category: "TYT",
  durationMinutes: 165,
  totalQuestions: 120,
  subjects: [
    { lesson: "Türkçe", questionCount: 40 },
    { lesson: "Sosyal Bilimler", questionCount: 20 },
    { lesson: "Temel Matematik", questionCount: 40 },
    { lesson: "Fen Bilimleri", questionCount: 20 },
  ],
};

// ─── AYT Yapılandırması ────────────────────────────────────────────────────

export const AYT_EXAM_CONFIG: ExamConfig = {
  category: "AYT",
  durationMinutes: 180,
  totalQuestions: 160,
  subjects: [
    // Sözel grubu
    { lesson: "Türk Dili ve Edebiyatı", questionCount: 24, group: "Sözel" },
    { lesson: "Tarih-1", questionCount: 10, group: "Sözel" },
    { lesson: "Coğrafya-1", questionCount: 6, group: "Sözel" },
    { lesson: "Tarih-2", questionCount: 11, group: "Sözel" },
    { lesson: "Coğrafya-2", questionCount: 11, group: "Sözel" },
    { lesson: "Felsefe Grubu", questionCount: 12, group: "Sözel" },
    { lesson: "Din Kültürü", questionCount: 6, group: "Sözel" },
    // Sayısal grubu
    { lesson: "Matematik", questionCount: 40, group: "Sayısal" },
    { lesson: "Geometri", questionCount: 10, group: "Sayısal" },
    { lesson: "Fizik", questionCount: 14, group: "Sayısal" },
    { lesson: "Kimya", questionCount: 13, group: "Sayısal" },
    { lesson: "Biyoloji", questionCount: 13, group: "Sayısal" },
  ],
};

// ─── Yardımcı fonksiyonlar ─────────────────────────────────────────────────

export const EXAM_CONFIGS: Record<"TYT" | "AYT", ExamConfig> = {
  TYT: TYT_EXAM_CONFIG,
  AYT: AYT_EXAM_CONFIG,
};

/** Net = Doğru - (Yanlış / 4), 2 ondalık hassasiyetle yuvarlanır */
export function calculateNet(correct: number, wrong: number): number {
  return Math.round((correct - wrong / 4) * 100) / 100;
}

/** Tüm dersler için toplam neti hesaplar */
export function calculateTotalNet(results: SubjectResults): number {
  const total = Object.values(results).reduce(
    (acc, r) => acc + r.net,
    0
  );
  return Math.round(total * 100) / 100;
}

/** Boş bir SubjectResults kaydı oluşturur */
export function buildEmptySubjectResults(subjects: SubjectConfig[]): SubjectResults {
  return Object.fromEntries(
    subjects.map((s) => [
      s.lesson,
      { correct: 0, wrong: 0, net: 0, questionCount: s.questionCount },
    ])
  );
}

/** Var olan exam.details nesnesinden SubjectResults oluşturur */
export function parseSubjectResults(
  details: Record<string, unknown> | null | undefined,
  subjects: SubjectConfig[]
): SubjectResults {
  const defaults = buildEmptySubjectResults(subjects);
  if (!details) return defaults;

  return Object.fromEntries(
    subjects.map((s) => {
      const raw = details[s.lesson] as Partial<SubjectResult> | undefined;
      return [
        s.lesson,
        {
          correct: raw?.correct ?? 0,
          wrong: raw?.wrong ?? 0,
          net: raw?.net ?? calculateNet(raw?.correct ?? 0, raw?.wrong ?? 0),
          questionCount: s.questionCount,
        },
      ];
    })
  );
}
