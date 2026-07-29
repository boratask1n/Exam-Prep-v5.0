import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getLessonsForCategory } from "@/lib/lessonTopics";
import { ResourceSelect } from "@/components/resources/ResourceSelect";
import { useListResources } from "@workspace/api-client-react";
import { type ExamResourceType } from "@/lib/resourceConfig";

export type DayName = "Pazartesi" | "Salı" | "Çarşamba" | "Perşembe" | "Cuma" | "Cumartesi" | "Pazar";

export type ActivityType =
  | "Konu Çalışması"
  | "Soru Çözümü"
  | "Ekstra Soru Çözümü"
  | "Branş Denemesi"
  | "Konu Denemesi"
  | "Genel Deneme"
  | "Tekrar"
  | "Mola"
  | "Serbest Çalışma";

export interface StudySlot {
  id: string;
  day: DayName;
  startTime: string;
  endTime: string;
  category?: "TYT" | "AYT" | "Genel";
  lesson: string;
  topic?: string;
  activityType: ActivityType;
  resourceId?: number | null;
  resourceName?: string | null;
  examNo?: number | null;
  targetQuestions?: number;
  notes?: string;
  color: string;
  completed: boolean;
  practiceExamId?: number | null;
}

export const DAYS_OF_WEEK: DayName[] = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "Konu Çalışması", label: "📚 Konu Çalışması" },
  { value: "Soru Çözümü", label: "📝 Soru Çözümü" },
  { value: "Ekstra Soru Çözümü", label: "⚡ Ekstra Soru Çözümü" },
  { value: "Branş Denemesi", label: "⏱️ Branş Denemesi" },
  { value: "Konu Denemesi", label: "🎯 Konu Denemesi" },
  { value: "Genel Deneme", label: "🏆 Genel Deneme" },
  { value: "Tekrar", label: "🔄 Tekrar / Not İnceleme" },
  { value: "Mola", label: "☕ Mola / Dinlenme" },
  { value: "Serbest Çalışma", label: "📖 Serbest Çalışma" },
];

export const COLOR_OPTIONS = [
  { name: "Mavi", key: "indigo", bg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800" },
  { name: "Kırmızı", key: "rose", bg: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800" },
  { name: "Sarı", key: "amber", bg: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800" },
  { name: "Yeşil", key: "emerald", bg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800" },
  { name: "Mor", key: "purple", bg: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800" },
  { name: "Pembe", key: "fuchsia", bg: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-300 dark:border-fuchsia-800" },
  { name: "Gri", key: "slate", bg: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-800" },
  { name: "Turkuaz", key: "cyan", bg: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800" },
  { name: "Turuncu", key: "orange", bg: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800" },
  { name: "Menekşe", key: "violet", bg: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800" },
  { name: "Deniz Yeşili", key: "teal", bg: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-300 dark:border-teal-800" },
];

interface ScheduleSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDay?: DayName;
  slotToEdit?: StudySlot | null;
  onSave: (slot: StudySlot) => void;
}

export function ScheduleSlotDialog({
  open,
  onOpenChange,
  initialDay = "Pazartesi",
  slotToEdit,
  onSave,
}: ScheduleSlotDialogProps) {
  const [day, setDay] = useState<DayName>(initialDay);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [category, setCategory] = useState<"TYT" | "AYT" | "Genel">("TYT");
  const [lesson, setLesson] = useState("TYT Matematik");
  const [topic, setTopic] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("Konu Çalışması");
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [resourceName, setResourceName] = useState<string | null>(null);
  const [examNo, setExamNo] = useState<string>("");
  const [examNoError, setExamNoError] = useState<string | null>(null);
  const [targetQuestions, setTargetQuestions] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState("indigo");

  const { data: allResources = [] } = useListResources();

  const isResourceLocked = Boolean(resourceId);

  const examResourceType = useMemo<ExamResourceType | undefined>(() => {
    if (activityType === "Branş Denemesi") return "Branş Denemesi";
    if (activityType === "Konu Denemesi") return "Konu Denemesi";
    return undefined;
  }, [activityType]);

  const allowedResourceTypes = useMemo<string[] | undefined>(() => {
    if (activityType === "Soru Çözümü" || activityType === "Ekstra Soru Çözümü") {
      return ["Soru Bankası", "Fasikül"];
    }
    if (activityType === "Branş Denemesi") {
      return ["Branş Denemesi"];
    }
    if (activityType === "Konu Denemesi") {
      return ["Konu Denemesi"];
    }
    if (activityType === "Genel Deneme") {
      return ["Genel Deneme"];
    }
    return undefined;
  }, [activityType]);

  const showResourceSelect =
    activityType === "Soru Çözümü" ||
    activityType === "Ekstra Soru Çözümü" ||
    activityType === "Branş Denemesi" ||
    activityType === "Konu Denemesi" ||
    activityType === "Genel Deneme";

  // Dynamic lesson options based on selected TYT / AYT category
  const filteredLessons = useMemo(() => {
    if (category === "TYT") {
      const tyt = getLessonsForCategory("TYT").map((l) => l.name);
      if (!tyt.includes("Geometri")) tyt.push("Geometri");
      return tyt;
    } else if (category === "AYT") {
      const ayt = getLessonsForCategory("AYT").map((l) => l.name);
      if (!ayt.includes("Geometri")) ayt.push("Geometri");
      return ayt;
    } else {
      const tyt = getLessonsForCategory("TYT").map((l) => l.name);
      const ayt = getLessonsForCategory("AYT").map((l) => l.name);
      const set = new Set([...tyt, ...ayt, "Geometri", "Ders Yok"]);
      return Array.from(set);
    }
  }, [category]);


  useEffect(() => {
    setExamNoError(null);
    if (slotToEdit) {
      setDay(slotToEdit.day);
      setStartTime(slotToEdit.startTime);
      setEndTime(slotToEdit.endTime);

      const cat = slotToEdit.category || (slotToEdit.lesson.startsWith("AYT") ? "AYT" : "TYT");
      setCategory(cat);
      setLesson(slotToEdit.lesson);
      setTopic(slotToEdit.topic || "");
      setActivityType(slotToEdit.activityType || "Konu Çalışması");
      setResourceId(slotToEdit.resourceId || null);
      setResourceName(slotToEdit.resourceName || null);
      setExamNo(slotToEdit.examNo ? String(slotToEdit.examNo) : "");
      setTargetQuestions(slotToEdit.targetQuestions ? String(slotToEdit.targetQuestions) : "");
      setNotes(slotToEdit.notes || "");
      setColor(slotToEdit.color || "indigo");
    } else {
      setDay(initialDay);
      setStartTime("09:00");
      setEndTime("10:00");
      setCategory("TYT");
      setLesson("TYT Matematik");
      setTopic("");
      setActivityType("Konu Çalışması");
      setResourceId(null);
      setResourceName(null);
      setExamNo("");
      setTargetQuestions("");
      setNotes("");
      setColor("indigo");
    }
  }, [slotToEdit, initialDay, open]);

  const handleCategoryChange = (newCat: "TYT" | "AYT" | "Genel") => {
    setCategory(newCat);
    if (newCat === "TYT") {
      setLesson(activityType === "Genel Deneme" ? "Genel Deneme" : "TYT Matematik");
      setColor("indigo");
      if (activityType === "Genel Deneme") {
        setTargetQuestions("120");
      }
    } else if (newCat === "AYT") {
      setLesson(activityType === "Genel Deneme" ? "Genel Deneme" : "AYT Matematik");
      setColor("indigo");
      if (activityType === "Genel Deneme") {
        setTargetQuestions("80");
      }
    } else {
      setLesson("Ders Yok");
      setColor("slate");
    }
  };

  const handleLessonChange = (selected: string) => {
    setLesson(selected);
    if (selected.includes("Matematik")) setColor("indigo");
    else if (selected.includes("Türkçe") || selected.includes("Edebiyat")) setColor("rose");
    else if (selected.includes("Fizik")) setColor("amber");
    else if (selected.includes("Kimya") || selected.includes("Biyoloji")) setColor("emerald");
    else if (selected.includes("Tarih") || selected.includes("Coğrafya") || selected.includes("Sosyal") || selected.includes("Felsefe")) setColor("purple");
    else if (selected === "Ders Yok") setColor("slate");
  };

  const handleActivityChange = (act: ActivityType) => {
    setActivityType(act);
    if (act === "Mola") setColor("slate");
    else if (act.includes("Deneme")) setColor("fuchsia");
    else if (act === "Ekstra Soru Çözümü") setColor("rose");
    
    if (act === "Genel Deneme") {
      const targetCat = category === "AYT" ? "AYT" : "TYT";
      if (category === "Genel") setCategory("TYT");
      setLesson("Genel Deneme");
      setTopic("");
      setTargetQuestions(targetCat === "AYT" ? "80" : "120");
    }
    
    // Çalışma bloğu türü her değiştirildiğinde seçili kaynağı sıfırla
    setResourceId(null);
    setResourceName(null);
  };

  const handleResourceSelected = (id: number | null, name?: string, _pub?: string | null, resourceObj?: any) => {
    setResourceId(id);
    setResourceName(name || null);

    const res = resourceObj || (id ? allResources.find((r) => r.id === id) : null);
    if (res) {
      if (res.category) {
        const cat = res.category === "AYT" ? "AYT" : res.category === "TYT" ? "TYT" : "Genel";
        setCategory(cat);
      }
      if (res.lesson) {
        setLesson(res.lesson);
        if (res.lesson.includes("Matematik")) setColor("indigo");
        else if (res.lesson.includes("Türkçe") || res.lesson.includes("Edebiyat")) setColor("rose");
        else if (res.lesson.includes("Fizik")) setColor("amber");
        else if (res.lesson.includes("Kimya") || res.lesson.includes("Biyoloji")) setColor("emerald");
        else if (res.lesson.includes("Tarih") || res.lesson.includes("Coğrafya") || res.lesson.includes("Sosyal") || res.lesson.includes("Felsefe")) setColor("purple");
      }
      if (res.topic) {
        setTopic(res.topic);
      } else if (activityType === "Branş Denemesi") {
        setTopic(`${res.lesson || "Branş"} Denemesi`);
      } else if (activityType === "Konu Denemesi") {
        setTopic(`${res.lesson || "Konu"} Denemesi`);
      } else if (activityType === "Genel Deneme") {
        setTopic("Genel Deneme");
      }
      const qCount = res.targetQuestionCount || res.questionCount;
      if (qCount) {
        setTargetQuestions(String(qCount));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) return;

    const isBransOrKonuDeneme = activityType === "Branş Denemesi" || activityType === "Konu Denemesi";
    if (isBransOrKonuDeneme && (!examNo || parseInt(examNo, 10) <= 0)) {
      setExamNoError("Branş ve Konu denemelerinde Deneme No zorunludur (örn. 1, 2, 3)");
      return;
    }

    const effectiveCategory = activityType === "Genel Deneme"
      ? (category === "AYT" ? "AYT" : "TYT")
      : category;

    const newSlot: StudySlot = {
      id: slotToEdit ? slotToEdit.id : `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      day,
      startTime,
      endTime,
      category: effectiveCategory,
      lesson: activityType === "Genel Deneme" ? `${effectiveCategory} Genel Denemesi` : (lesson.trim() || "Ders"),
      topic: topic.trim() || undefined,
      activityType,
      resourceId: activityType === "Genel Deneme" ? undefined : (resourceId || undefined),
      resourceName: activityType === "Genel Deneme" ? undefined : (resourceName || undefined),
      examNo: examNo ? parseInt(examNo, 10) : undefined,
      targetQuestions: targetQuestions ? parseInt(targetQuestions, 10) : undefined,
      notes: notes.trim() || undefined,
      color,
      completed: slotToEdit ? slotToEdit.completed : false,
      practiceExamId: slotToEdit?.practiceExamId || undefined,
    };

    onSave(newSlot);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* w-[448px]: sabit genişlik — içerik değişse bile dialog sağa/sola hareket etmez */}
      <DialogContent className="w-[448px] max-w-[calc(100vw-32px)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {slotToEdit ? "Etüt Bloğunu Düzenle" : "Yeni Etüt Bloğu Ekle"}
          </DialogTitle>
          <DialogDescription>
            Çalışma programınıza yeni zaman dilimi, ders ve kaynak ekleyin.
          </DialogDescription>
        </DialogHeader>

        {/*
          max-h + overflow-y-auto: içerik uzasa da dialog taşmaz.
          [scrollbar-gutter:stable]: scrollbar alanı her zaman rezerve edilir
          → scrollbar gelince/gidince yatay kayma olmaz.
        */}
        <div className="max-h-[70vh] overflow-y-auto [scrollbar-gutter:stable] pr-1 -mr-1">
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Gün ve Saat Bilgileri */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="day-select">Gün</Label>
              <Select value={day} onValueChange={(val) => setDay(val as DayName)}>
                <SelectTrigger id="day-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="start-time">Başlangıç Saati</Label>
              <Input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="end-time">Bitiş Saati</Label>
              <Input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>

            {/* Çalışma Bloğu Türü */}
            <div className="space-y-1.5">
              <Label htmlFor="activity-type">Çalışma Bloğu Türü</Label>
              <Select value={activityType} onValueChange={(val) => handleActivityChange(val as ActivityType)}>
                <SelectTrigger id="activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((act) => (
                    <SelectItem key={act.value} value={act.value}>
                      {act.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kaynak Seçimi — Öncelikli (Soru Çözümü / Denemeler için) */}
          {showResourceSelect && (
            <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3 max-w-full min-w-0 overflow-hidden">
              <Label className="font-semibold text-primary flex items-center min-w-0">
                <span className="truncate min-w-0">Kullanılacak Kaynak (Kitap/Yayın) *</span>
              </Label>
              <ResourceSelect
                value={resourceId}
                allowedResourceTypes={allowedResourceTypes}
                examResourceType={examResourceType}
                category={isResourceLocked ? category : undefined}
                lesson={isResourceLocked ? lesson : undefined}
                onValueChange={handleResourceSelected}
              />
            </div>
          )}

          {/* Deneme Numarası (Sırası) - Deneme Etütlerinde */}
          {activityType.includes("Deneme") && (
            <div className="space-y-1.5 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
              <Label htmlFor="exam-no" className="font-semibold text-purple-700 dark:text-purple-300">
                Deneme No / Sırası {activityType !== "Genel Deneme" && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="exam-no"
                type="number"
                min={1}
                placeholder={activityType === "Genel Deneme" ? "Örn: 1 (İsteğe bağlı)" : "Örn: 3 (Zorunlu)"}
                value={examNo}
                onChange={(e) => {
                  setExamNo(e.target.value);
                  setExamNoError(null);
                }}
                className="h-10 font-bold tabular-nums"
              />
              {examNoError && (
                <p className="text-xs text-destructive font-medium">{examNoError}</p>
              )}
            </div>
          )}

          {/* Sınav Kategorisi, Ders ve Konu Seçimi */}
          {activityType === "Genel Deneme" ? (
            <div className="space-y-3">
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="category-select-genel">Sınav Kategorisi *</Label>
                <Select value={category === "AYT" ? "AYT" : "TYT"} onValueChange={(val) => handleCategoryChange(val as any)}>
                  <SelectTrigger id="category-select-genel" className="font-semibold text-primary w-full min-w-0 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TYT">📘 TYT Genel Deneme (165 dk)</SelectItem>
                    <SelectItem value="AYT">📕 AYT Genel Deneme (180 dk)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="genel-topic">Deneme / Yayın Adı (İsteğe Bağlı)</Label>
                <Input
                  id="genel-topic"
                  placeholder="Örn: 3D Türkiye Geneli #1, Özdebir, Bilgi Sarmal vb."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="h-10 bg-muted/50"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="category-select">Sınav Kategorisi</Label>
                  <Select value={category} onValueChange={(val) => handleCategoryChange(val as any)} disabled={isResourceLocked}>
                    <SelectTrigger id="category-select" className="font-semibold text-primary w-full min-w-0 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TYT">📘 TYT Dersleri</SelectItem>
                      <SelectItem value="AYT">📕 AYT Dersleri</SelectItem>
                      <SelectItem value="Genel">🌐 Genel / Ders Yok</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="lesson-select">Ders ({category})</Label>
                  <Select value={lesson} onValueChange={handleLessonChange} disabled={isResourceLocked}>
                    <SelectTrigger id="lesson-select" className="w-full min-w-0 h-10">
                      <SelectValue placeholder="Ders Seçin" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredLessons.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Konu Girişi */}
              <div className="space-y-1.5">
                <Label htmlFor="custom-topic">Konu / Deneme Adı</Label>
                <Input
                  id="custom-topic"
                  placeholder="Örn: Problemler, Trigonometri V, Paragraf vb."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  readOnly={isResourceLocked}
                  className="h-10 bg-muted/50 text-muted-foreground"
                />
              </div>
            </>
          )}

          {/* Soru Hedefi ve Renk Etiketi */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="target-q">
                {activityType === "Branş Denemesi" || activityType === "Konu Denemesi"
                  ? "Soru Sayısı"
                  : "Hedef Soru Sayısı"}
              </Label>
              <Input
                id="target-q"
                type="number"
                min={0}
                placeholder="Örn: 40"
                value={targetQuestions}
                onChange={(e) => setTargetQuestions(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="color-select">Renk Etiketi</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger id="color-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notlar */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notlar (İsteğe Bağlı)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Örn: 3D Soru Bankası Test 4 çözülecek"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button type="submit">
              {slotToEdit ? "Güncelle" : "Ekle"}
            </Button>
          </DialogFooter>
        </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

