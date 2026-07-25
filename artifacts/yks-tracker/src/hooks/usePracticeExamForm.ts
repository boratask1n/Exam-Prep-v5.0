import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  EXAM_CONFIGS,
  calculateNet,
  calculateTotalNet,
  buildEmptySubjectResults,
  parseSubjectResults,
  type SubjectResults,
} from "@/lib/practiceExamConfig";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";
import { type PracticeExamType } from "@/lib/resourceConfig";

// ─── Zod Şeması ───────────────────────────────────────────────────────────────

export const practiceExamFormSchema = z.object({
  title: z.string().min(1, "Başlık zorunludur"),
  examType: z.enum(["Genel", "Branş", "Konu"]),
  category: z.string().min(1, "Kategori zorunludur"),
  examDate: z.string().min(1, "Tarih zorunludur"),
  durationMinutes: z.coerce.number().optional().nullable(),
  lesson: z.string().optional(),
  topic: z.string().optional(),
  resourceId: z.number().nullable().optional(),
  publisher: z.string().nullable().optional(),
  /** Branş ve Konu denemesi için ek alanlar */
  bransCorrect: z.coerce.number().min(0).optional().default(0),
  bransWrong: z.coerce.number().min(0).optional().default(0),
  bransQuestionCount: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.examType === "Genel" && !data.durationMinutes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["durationMinutes"],
      message: "Genel denemelerde süre zorunludur",
    });
  }
  if (data.examType !== "Genel" && !data.resourceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["resourceId"],
      message: "Kaynak seçimi zorunludur",
    });
  }
});

export type PracticeExamFormValues = z.infer<typeof practiceExamFormSchema>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UsePracticeExamFormOptions {
  examToEdit?: any;
  onSuccess: () => void;
}

export function usePracticeExamForm({ examToEdit, onSuccess }: UsePracticeExamFormOptions) {
  const queryClient = useQueryClient();

  // Form ana değerleri
  const form = useForm<PracticeExamFormValues>({
    resolver: zodResolver(practiceExamFormSchema),
    defaultValues: getDefaultValues(examToEdit),
  });

  const watchExamType = form.watch("examType") as PracticeExamType;
  const watchCategory = form.watch("category");
  const watchLesson = form.watch("lesson");
  const watchBransCorrect = form.watch("bransCorrect");
  const watchBransWrong = form.watch("bransWrong");

  // Genel deneme ders sonuçları (TYT/AYT)
  const [subjectResults, setSubjectResults] = useState<SubjectResults>({});

  // Mevcut konfigürasyon (sadece Genel deneme için)
  const examConfig = useMemo(() => {
    if (watchExamType !== "Genel") return null;
    return EXAM_CONFIGS[watchCategory as "TYT" | "AYT"] ?? null;
  }, [watchExamType, watchCategory]);

  // Branş/Konu dersleri
  const bransLessons = useMemo(
    () => getLessonsForCategory(watchCategory || "TYT"),
    [watchCategory]
  );

  // Konu listesi (Branş ve Konu denemesi için)
  const bransTopics = useMemo(
    () => (watchLesson ? getTopicsForLesson(watchCategory || "TYT", watchLesson) : []),
    [watchCategory, watchLesson]
  );

  // Branş/Konu neti (otomatik)
  const bransNet = useMemo(
    () => calculateNet(watchBransCorrect ?? 0, watchBransWrong ?? 0),
    [watchBransCorrect, watchBransWrong]
  );

  // Toplam net
  const totalNet = useMemo(() => {
    if (watchExamType === "Branş" || watchExamType === "Konu") return bransNet;
    return calculateTotalNet(subjectResults);
  }, [watchExamType, bransNet, subjectResults]);

  // Form sıfırlama (dialog açıldığında / examToEdit değiştiğinde)
  useEffect(() => {
    const defaults = getDefaultValues(examToEdit);
    form.reset(defaults);

    if (examToEdit) {
      const cfg = EXAM_CONFIGS[examToEdit.category as "TYT" | "AYT"];
      if (cfg && examToEdit.examType === "Genel") {
        setSubjectResults(parseSubjectResults(examToEdit.details, cfg.subjects));
      } else {
        setSubjectResults({});
      }
    } else {
      setSubjectResults({});
    }
  }, [examToEdit, form]);

  // Kategori değişince konfigürasyona göre ders sonuçlarını sıfırla
  useEffect(() => {
    if (watchExamType !== "Genel") return;
    const cfg = EXAM_CONFIGS[watchCategory as "TYT" | "AYT"];
    if (!cfg) return;
    if (!examToEdit || examToEdit.category !== watchCategory) {
      setSubjectResults(buildEmptySubjectResults(cfg.subjects));
    }
  }, [watchCategory, watchExamType, examToEdit]);

  // Otomatik süre doldurma (Genel TYT → 165dk, AYT → 180dk)
  useEffect(() => {
    if (watchExamType !== "Genel") return;
    const cfg = EXAM_CONFIGS[watchCategory as "TYT" | "AYT"];
    if (cfg) form.setValue("durationMinutes", cfg.durationMinutes);
  }, [watchCategory, watchExamType, form]);

  // Ders sonucu güncelle
  const updateSubjectResult = useCallback(
    (lesson: string, field: "correct" | "wrong", rawValue: number, maxCount?: number) => {
      let value = Math.max(0, rawValue || 0);
      if (maxCount !== undefined) {
        value = Math.min(value, maxCount);
      }
      setSubjectResults((prev) => {
        const current = prev[lesson] ?? { correct: 0, wrong: 0, net: 0, questionCount: maxCount || 0 };
        const updated = { ...current, [field]: value };
        // Max kontrolü ekle: doğru + yanlış > maxCount olamaz
        if (maxCount !== undefined && updated.correct + updated.wrong > maxCount) {
          if (field === "correct") {
            updated.wrong = Math.max(0, maxCount - updated.correct);
          } else {
            updated.correct = Math.max(0, maxCount - updated.wrong);
          }
        }
        updated.net = calculateNet(updated.correct, updated.wrong);
        return { ...prev, [lesson]: updated };
      });
    },
    []
  );

  // API mutation — BUG FIX: customFetch zaten parse edilmiş veri döndürür, .json() çağırmaya gerek yok
  const saveMutation = useMutation({
    mutationFn: async (values: PracticeExamFormValues) => {
      const payload = buildPayload(values, subjectResults, totalNet);
      const url = examToEdit?.id
        ? `/api/practice-exams/${examToEdit.id}`
        : "/api/practice-exams";
      const method = examToEdit?.id ? "PUT" : "POST";

      // customFetch parse edilmiş JSON'u doğrudan döndürür — Response nesnesi değil
      const result = await customFetch<Record<string, unknown>>(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["practice-exams"] });
      onSuccess();
    },
    onError: (err: Error) => {
      console.error("Practice exam save error:", err.message);
    },
  });

  const onSubmit = (values: PracticeExamFormValues) => {
    saveMutation.mutate(values);
  };

  return {
    form,
    examConfig,
    subjectResults,
    updateSubjectResult,
    bransLessons,
    bransTopics,
    bransNet,
    totalNet,
    watchExamType,
    watchCategory,
    watchLesson,
    saveMutation,
    onSubmit,
  };
}

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function getDefaultValues(examToEdit?: any): PracticeExamFormValues {
  if (examToEdit) {
    return {
      title: examToEdit.title ?? "",
      examType: (["Genel", "Branş", "Konu"].includes(examToEdit.examType)
        ? examToEdit.examType
        : "Genel") as PracticeExamType,
      category: examToEdit.category ?? "TYT",
      examDate: examToEdit.examDate
        ? new Date(examToEdit.examDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      durationMinutes: examToEdit.durationMinutes ?? (examToEdit.examType === "Genel" ? 165 : null),
      lesson: examToEdit.lesson ?? "",
      topic: examToEdit.topic ?? "",
      resourceId: examToEdit.resourceId ?? null,
      bransCorrect: examToEdit.details?._brans?.correct ?? 0,
      bransWrong: examToEdit.details?._brans?.wrong ?? 0,
      bransQuestionCount: examToEdit.details?._brans?.questionCount ?? undefined,
      notes: examToEdit.notes ?? "",
    };
  }
  return {
    title: "",
    examType: "Genel",
    category: "TYT",
    examDate: new Date().toISOString().split("T")[0],
    durationMinutes: 165, // Sadece genel deneme için varsayılan
    lesson: "",
    topic: "",
    resourceId: null,
    bransCorrect: 0,
    bransWrong: 0,
    bransQuestionCount: undefined,
    notes: "",
  };
}

function buildPayload(
  values: PracticeExamFormValues,
  subjectResults: SubjectResults,
  totalNet: number
): Record<string, unknown> {
  const isGenel = values.examType === "Genel";
  const isBrans = values.examType === "Branş";
  const isKonu = values.examType === "Konu";

  const details: Record<string, unknown> = isGenel
    ? subjectResults
    : {
        _brans: {
          correct: values.bransCorrect ?? 0,
          wrong: values.bransWrong ?? 0,
          net: calculateNet(values.bransCorrect ?? 0, values.bransWrong ?? 0),
          questionCount: values.bransQuestionCount ?? 0,
        },
      };

  // Lesson ve topic — sadece Branş/Konu denemelerinde
  const lesson = isGenel ? null : (values.lesson || null);
  const topic = (isBrans || isKonu) ? (values.topic || null) : null;

  // resourceId — sadece Branş ve Konu denemelerinde kullanılır
  const resourceId = (isBrans || isKonu) ? (values.resourceId ?? null) : null;

  return {
    title: values.title,
    examType: values.examType,
    category: isGenel ? values.category : (values.category || "TYT"),
    examDate: values.examDate,
    durationMinutes: values.durationMinutes,
    totalNet,
    details,
    lesson,
    topic,
    resourceId,
    publisher: (values as any).publisher || null,
    notes: values.notes || null,
  };
}
