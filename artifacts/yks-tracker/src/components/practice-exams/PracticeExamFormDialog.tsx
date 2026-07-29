import { useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronDown, AlertCircle, Lock } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

import { usePracticeExamForm } from "@/hooks/usePracticeExamForm";
import { ResourceSelect } from "@/components/resources/ResourceSelect";
import type { SubjectConfig, SubjectResult } from "@/lib/practiceExamConfig";
import { examTypeToResourceType } from "@/lib/resourceConfig";

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface PracticeExamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examToEdit?: any;
  initialResource?: any;
}

// ─── Alt Bileşenler ───────────────────────────────────────────────────────────

/** Tek bir ders satırı — D/Y/Net girişi */
function SubjectResultRow({
  subject,
  result,
  onUpdate,
}: {
  subject: SubjectConfig;
  result: SubjectResult;
  onUpdate: (lesson: string, field: "correct" | "wrong", value: number, maxCount?: number) => void;
}) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
      <td className="py-2 pl-3 pr-2 text-sm font-medium">
        {subject.lesson}
        <span className="ml-1.5 text-xs text-muted-foreground font-normal">
          /{subject.questionCount}
        </span>
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          min={0}
          max={subject.questionCount}
          value={result.correct === 0 ? "" : result.correct}
          placeholder="0"
          onChange={(e) =>
            onUpdate(subject.lesson, "correct", Number(e.target.value), subject.questionCount)
          }
          className="h-8 text-center w-16 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          min={0}
          max={subject.questionCount}
          value={result.wrong === 0 ? "" : result.wrong}
          placeholder="0"
          onChange={(e) =>
            onUpdate(subject.lesson, "wrong", Number(e.target.value), subject.questionCount)
          }
          className="h-8 text-center w-16 tabular-nums text-destructive/80 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </td>
      <td className="py-2 pr-3 pl-2 text-center tabular-nums">
        <span
          className={cn(
            "text-sm font-semibold",
            result.net > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : result.net < 0
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {result.net.toFixed(2)}
        </span>
      </td>
    </tr>
  );
}

/** TYT/AYT ders tablosu */
function SubjectResultsTable({
  subjects,
  results,
  onUpdate,
}: {
  subjects: SubjectConfig[];
  results: Record<string, SubjectResult>;
  onUpdate: (lesson: string, field: "correct" | "wrong", value: number, maxCount?: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wider">
            <th className="py-2 pl-3 pr-2 text-left font-medium">Ders</th>
            <th className="px-2 py-2 text-center font-medium w-20">Doğru</th>
            <th className="px-2 py-2 text-center font-medium w-20">Yanlış</th>
            <th className="pr-3 pl-2 py-2 text-center font-medium w-20">Net</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject) => (
            <SubjectResultRow
              key={subject.lesson}
              subject={subject}
              result={results[subject.lesson] ?? { correct: 0, wrong: 0, net: 0, questionCount: subject.questionCount }}
              onUpdate={onUpdate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** D/Y/Net giriş alanları (Branş ve Konu için ortak) */
function BransKonuResultFields({
  form,
  bransNet,
}: {
  form: any;
  bransNet: number;
}) {
  const watchQuestionCount = form.watch("bransQuestionCount") ?? 0;
  const watchCorrect = form.watch("bransCorrect") ?? 0;
  const watchWrong = form.watch("bransWrong") ?? 0;

  const maxQuestions = Number(watchQuestionCount) || 0;
  const totalAnswered = Number(watchCorrect) + Number(watchWrong);
  const isOverflow = maxQuestions > 0 && totalAnswered > maxQuestions;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-3">
        <FormField
          control={form.control}
          name="bransQuestionCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-semibold">Soru Sayısı *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  placeholder="Örn: 40"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const newCount = Number(e.target.value) || 0;
                    field.onChange(e.target.value ? newCount : "");
                  }}
                  className="text-center tabular-nums h-9 font-bold"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bransCorrect"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-emerald-600 font-semibold">Doğru</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  {...field}
                  value={field.value === 0 ? "" : field.value}
                  onChange={(e) => {
                    const val = Math.max(0, Number(e.target.value) || 0);
                    field.onChange(val);
                  }}
                  className="text-center tabular-nums h-9 font-semibold text-emerald-600 dark:text-emerald-400"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bransWrong"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs text-destructive font-semibold">Yanlış</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  {...field}
                  value={field.value === 0 ? "" : field.value}
                  onChange={(e) => {
                    const val = Math.max(0, Number(e.target.value) || 0);
                    field.onChange(val);
                  }}
                  className="text-center tabular-nums h-9 font-semibold text-destructive"
                />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-primary">Net</span>
          <div className="flex items-center justify-center h-9 rounded-md border border-border/60 bg-muted/30 px-3 tabular-nums font-bold text-primary">
            {bransNet.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Toplam cevap göstergesi */}
      {maxQuestions > 0 && (
        <div className={cn(
          "flex items-center justify-between text-xs px-2 py-1.5 rounded-lg font-medium",
          isOverflow
            ? "bg-destructive/10 text-destructive border border-destructive/30"
            : "bg-muted/50 text-muted-foreground"
        )}>
          <span>
            {isOverflow ? "\u26a0\ufe0f Toplam cevap sayısı soru sayısını aşıyor!" : "ℹ\ufe0f Cevaplanan"}
          </span>
          <span className={cn("font-bold tabular-nums", isOverflow && "text-destructive")}>
            {totalAnswered} / {maxQuestions}
          </span>
        </div>
      )}

      {!maxQuestions && (
        <p className="text-[11px] text-muted-foreground italic text-center pt-0.5">
          ⓘ Soru sayısını girerek doğru / yanlış girişini doğrulayabilirsiniz (isteğe bağlı).
        </p>
      )}
    </div>
  );
}

// ─── Ana Dialog ───────────────────────────────────────────────────────────────

export function PracticeExamFormDialog({
  open,
  onOpenChange,
  examToEdit,
  initialResource,
}: PracticeExamFormDialogProps) {
  const {
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
  } = usePracticeExamForm({
    examToEdit,
    initialResource,
    open,
    onSuccess: () => onOpenChange(false),
  });

  const isGenel = watchExamType === "Genel";
  const isBrans = watchExamType === "Branş";
  const isKonu = watchExamType === "Konu";
  const isDetailed = isBrans || isKonu; // Branş veya Konu: Kaynak zorunlu

  // Branş/Konu taşma kontrolü
  const watchBransQCount = form.watch("bransQuestionCount") ?? 0;
  const watchBransCorrect = form.watch("bransCorrect") ?? 0;
  const watchBransWrong = form.watch("bransWrong") ?? 0;
  const isDYOverflow =
    isDetailed &&
    Number(watchBransQCount) > 0 &&
    Number(watchBransCorrect) + Number(watchBransWrong) > Number(watchBransQCount);

  // Deneme türüne göre kaynak filtresi
  const examResourceType = examTypeToResourceType(watchExamType);
  // Branş ve Konu denemelerinde alanlar varsayılan olarak kilitli (read-only)
  const isFieldLocked = isDetailed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto p-0">
        {/* Başlık */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl">
              {examToEdit ? "Denemeyi Düzenle" : "Yeni Deneme Ekle"}
            </DialogTitle>
            {totalNet > 0 && (
              <Badge variant="secondary" className="text-emerald-600 bg-emerald-500/10 border-emerald-500/20 font-bold">
                Toplam Net: {totalNet.toFixed(2)}
              </Badge>
            )}
          </div>
          <DialogDescription className="text-sm">
            Deneme sonucunuzu girin; net puanlar otomatik hesaplanır.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5 px-6 py-5"
          >
            {/* ── Deneme Türü ── */}
            <FormField
              control={form.control}
              name="examType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deneme Türü</FormLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Genel", "Branş", "Konu"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          field.onChange(type);
                          form.setValue("lesson", "");
                          form.setValue("topic", "");
                          form.setValue("resourceId", null);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all duration-150",
                          field.value === type
                            ? "border-primary bg-primary/8 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                            : "border-border/60 bg-card/50 text-muted-foreground hover:border-primary/30 hover:bg-primary/5"
                        )}
                      >
                        <span className="text-lg">
                          {type === "Genel" ? "📋" : type === "Branş" ? "📚" : "📝"}
                        </span>
                        <span>{type === "Genel" ? "Genel Deneme" : type === "Branş" ? "Branş Denemesi" : "Konu Denemesi"}</span>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Kaynak Seçimi (Branş/Konu için ZORUNLU, Genel için İSTEĞE BAĞLI) ── */}
            {examResourceType && (
              <FormField
                control={form.control}
                name="resourceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Kaynak {isDetailed && <span className="text-destructive">*</span>}{" "}
                      <span className="text-xs text-muted-foreground font-normal">
                        ({isGenel ? "İsteğe bağlı - Kaynaklarım'dan deneme seçimi" : `Sadece ${examResourceType} kaynakları`})
                      </span>
                    </FormLabel>
                    <FormControl>
                      <ResourceSelect
                        value={field.value}
                        onValueChange={(id, name, pub, resourceObj) => {
                          if (resourceObj) {
                            const resourceName = name || resourceObj.name || "";
                            form.setValue("title", resourceName, { shouldValidate: true, shouldDirty: true });
                            const publisherName = resourceObj.publisher || pub || "";
                            if (publisherName) {
                              form.setValue("publisher" as any, publisherName, { shouldValidate: true, shouldDirty: true });
                            }
                            if (resourceObj.category) {
                              form.setValue("category", resourceObj.category, { shouldValidate: true, shouldDirty: true });
                            }
                            if (!isGenel && resourceObj.lesson) {
                              form.setValue("lesson", resourceObj.lesson, { shouldValidate: true, shouldDirty: true });
                            }
                            if (!isGenel && resourceObj.topic) {
                              form.setValue("topic", resourceObj.topic, { shouldValidate: true, shouldDirty: true });
                            }
                            if (resourceObj.targetQuestionCount || resourceObj.questionCount) {
                              form.setValue("bransQuestionCount", resourceObj.targetQuestionCount || resourceObj.questionCount, { shouldValidate: true, shouldDirty: true });
                            }
                          }
                          field.onChange(id);
                        }}
                        examResourceType={examResourceType}
                        category={isFieldLocked ? watchCategory : undefined}
                        lesson={isFieldLocked ? (watchLesson || undefined) : undefined}
                        topic={isFieldLocked && isKonu ? (form.watch("topic") || undefined) : undefined}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Kaynak seçildi bilgilendirme rozeti */}
            {isFieldLocked && (
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
                <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span>Kaynak seçimi zorunlu olduğu için başlık, ders ve konu alanları kilitlidir. Soru sayısı ve sonuçları belirleyebilirsiniz.</span>
              </div>
            )}

            {/* Deneme Başlığı */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deneme Başlığı</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Örn: 3D TYT Denemesi 5 — Ocak"
                      disabled={isFieldLocked}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Kategori ── */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isGenel ? "Sınav Kategorisi" : "Alan"}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isFieldLocked}>
                    <FormControl>
                      <SelectTrigger disabled={isFieldLocked}>
                        <SelectValue placeholder="Seçin" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="TYT">TYT</SelectItem>
                      <SelectItem value="AYT">AYT</SelectItem>
                      {isBrans && (
                        <SelectItem value="YDT">YDT</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── Branş Denemesi: sadece Ders seçimi ── */}
            {isBrans && (
              <FormField
                control={form.control}
                name="lesson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ders *</FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        form.setValue("topic", "");
                        if (!form.getValues("resourceId")) {
                          form.setValue("resourceId", null);
                        }
                      }}
                      value={field.value}
                      disabled={isFieldLocked}
                    >
                      <FormControl>
                        <SelectTrigger disabled={isFieldLocked}>
                          <SelectValue placeholder="Ders seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {bransLessons.map((l) => (
                          <SelectItem key={l.name} value={l.name}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* ── Konu Denemesi: Ders + Konu seçimi (listeden) ── */}
            {isKonu && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="lesson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ders *</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue("topic", "");
                          if (!form.getValues("resourceId")) {
                            form.setValue("resourceId", null);
                          }
                        }}
                        value={field.value}
                        disabled={isFieldLocked}
                      >
                        <FormControl>
                          <SelectTrigger disabled={isFieldLocked}>
                            <SelectValue placeholder="Ders seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {bransLessons.map((l) => (
                            <SelectItem key={l.name} value={l.name}>
                              {l.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="topic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Konu *</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val === "_none" ? "" : val);
                          if (!form.getValues("resourceId")) {
                            form.setValue("resourceId", null);
                          }
                        }}
                        value={field.value || ""}
                        disabled={isFieldLocked || !watchLesson || bransTopics.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger disabled={isFieldLocked || !watchLesson || bransTopics.length === 0}>
                            <SelectValue
                              placeholder={
                                !watchLesson
                                  ? "Önce ders seçin"
                                  : bransTopics.length === 0
                                  ? "Konu yok"
                                  : "Konu seçin"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {bransTopics.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Deneme Numarası + Tarih + Süre */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="examNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">
                      Deneme No {!isGenel && <span className="text-destructive">*</span>}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        placeholder={isGenel ? "Örn: 1" : "Örn: 3 *"}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : "")}
                        className="tabular-nums font-bold h-9"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="examDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">Tarih</FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Tarih seçin"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">
                      Süre (Dk)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        value={field.value ?? ""}
                        disabled={isGenel}
                        placeholder={isGenel ? "Otomatik" : "Süre girin"}
                        className="tabular-nums h-9"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Genel Deneme: Ders tablosu ── */}
            {isGenel && examConfig && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {watchCategory} Soru Dağılımı
                  </p>
                  <span className="text-xs text-muted-foreground font-semibold">
                    {watchCategory === "AYT" ? 80 : 120} Soru · {examConfig.durationMinutes} dk
                  </span>
                </div>
                <SubjectResultsTable
                  subjects={examConfig.subjects}
                  results={subjectResults}
                  onUpdate={updateSubjectResult}
                />
                <div className="flex justify-end items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Toplam Net:</span>
                  <span
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      totalNet > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {totalNet.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* ── Branş / Konu Denemesi: D/Y/Net ── */}
            {isDetailed && (
              <div className="space-y-3">
                <Separator />
                <p className="text-sm font-medium">Sonuçlar</p>
                <BransKonuResultFields form={form} bransNet={bransNet} />
              </div>
            )}

            {/* Notlar */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notlar (Opsiyonel)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Deneme hakkında genel notlar, hissettikleriniz..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Hata mesajı */}
            {saveMutation.isError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {saveMutation.error instanceof Error
                    ? saveMutation.error.message
                    : "Kaydetme sırasında hata oluştu."}
                </span>
              </div>
            )}

            {/* Aksiyon butonları */}
            <div className="flex justify-end gap-3 pt-2 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                İptal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || isDYOverflow}>
                {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
