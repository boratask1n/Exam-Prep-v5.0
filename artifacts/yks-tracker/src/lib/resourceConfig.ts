/**
 * Kaynak & Deneme sistemi ortak sabitleri
 * Hem ResourceDialog hem de PracticeExamFormDialog bu dosyayı kullanır.
 */

// ─── Kaynak Türleri ────────────────────────────────────────────────────────────

/**
 * Kaynaklar bölümünde seçilebilir tüm kaynak türleri.
 * "Branş Denemesi" ve "Konu Denemesi" deneme formunda kaynak olarak kullanılır.
 */
export const RESOURCE_TYPES = [
  "Soru Bankası",
  "Fasikül",
  "Ders Kitabı",
  "Genel Deneme",
  "Branş Denemesi",
  "Konu Denemesi",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Deneme formunda kaynak olarak kullanılabilecek türler */
export const EXAM_RESOURCE_TYPES = [
  "Genel Deneme",
  "Branş Denemesi",
  "Konu Denemesi",
] as const satisfies readonly ResourceType[];

export type ExamResourceType = (typeof EXAM_RESOURCE_TYPES)[number];

// ─── Kategori Sabitleri ────────────────────────────────────────────────────────

export const CATEGORIES = ["TYT", "AYT", "Geometri"] as const;
export type Category = (typeof CATEGORIES)[number];

export const EXAM_CATEGORIES = ["TYT", "AYT"] as const;
export type ExamCategory = (typeof EXAM_CATEGORIES)[number];

// ─── Deneme Türleri ────────────────────────────────────────────────────────────

export const PRACTICE_EXAM_TYPES = ["Genel", "Branş", "Konu"] as const;
export type PracticeExamType = (typeof PRACTICE_EXAM_TYPES)[number];

/**
 * Kaynak türleri için konu davranış kuralları:
 * - "Genel Deneme"    → konu YOK (gizli)
 * - "Branş Denemesi"    → konu YOK (gizli)
 * - "Soru Bankası"      → konu YOK (otomatik Genel)
 * - "Ders Kitabı"       → konu YOK (otomatik Genel)
 * - "Fasikül"           → konu ZORUNLU
 * - "Konu Denemesi"     → konu ZORUNLU
 */

/** Konu alanını hiç göstermeyen türler */
export const NO_TOPIC_TYPES = [
  "Soru Bankası",
  "Ders Kitabı",
  "Genel Deneme",
  "Branş Denemesi",
] as const;

/** Kaynak türünün konu seçimi gösterip göstermeyeceği */
export function supportsTopic(resourceType: string): boolean {
  return !(NO_TOPIC_TYPES as readonly string[]).includes(resourceType);
}

/** Kaynak türünün konu seçimi gerektirip gerektirmediğini döndürür */
export function requiresTopic(resourceType: string): boolean {
  return resourceType === "Fasikül" || resourceType === "Konu Denemesi";
}

/** Kaynak türünün ders seçimi gerektirip gerektirmediğini döndürür */
export function requiresLesson(resourceType: string): boolean {
  return resourceType !== "Genel Deneme" && resourceType !== "";
}

/** Deneme türüne karşılık gelen kaynak türünü döndürür */
export function examTypeToResourceType(examType: PracticeExamType): ExamResourceType | null {
  if (examType === "Genel") return "Genel Deneme";
  if (examType === "Branş") return "Branş Denemesi";
  if (examType === "Konu") return "Konu Denemesi";
  return null;
}

