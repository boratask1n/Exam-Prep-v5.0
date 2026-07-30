import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Plus,
  Sparkles,
  Copy,
  Printer,
  Trash2,
  CheckCircle2,
  Circle,
  Pencil,
  Clock,
  BookOpen,
  Search,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ScheduleSlotDialog,
  StudySlot,
  DayName,
  DAYS_OF_WEEK,
  COLOR_OPTIONS,
} from "@/components/schedule/ScheduleSlotDialog";
import { TemplateWizardDialog } from "@/components/schedule/TemplateWizardDialog";
import { CopyDayDialog } from "@/components/schedule/CopyDayDialog";
import { ScheduleStats } from "@/components/schedule/ScheduleStats";

import { cn } from "@/lib/utils";
import { getAllLessons } from "@/lib/lessonTopics";
import { customFetch } from "@workspace/api-client-react";

const STORAGE_KEY = "yks-study-schedule-v1";

const DEFAULT_INITIAL_SLOTS: StudySlot[] = [
  {
    id: "slot_init_1",
    day: "Pazartesi",
    startTime: "09:00",
    endTime: "10:00",
    lesson: "TYT Türkçe",
    topic: "Paragraf Çözümü",
    activityType: "Soru Çözümü",
    targetQuestions: 30,
    color: "rose",
    completed: true,
  },
  {
    id: "slot_init_2",
    day: "Pazartesi",
    startTime: "10:15",
    endTime: "11:45",
    lesson: "TYT Matematik",
    topic: "Problemler",
    activityType: "Konu Çalışması",
    targetQuestions: 40,
    color: "indigo",
    completed: false,
  },
  {
    id: "slot_init_3",
    day: "Salı",
    startTime: "09:30",
    endTime: "11:00",
    lesson: "AYT Fizik",
    topic: "Vektörler & Hareket",
    activityType: "Konu Çalışması",
    targetQuestions: 25,
    color: "amber",
    completed: false,
  },
];

const getCurrentDayName = (): DayName => {
  const days: DayName[] = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  return days[new Date().getDay()];
};

export default function StudySchedule() {
  const queryClient = useQueryClient();

  const [activeDay, setActiveDay] = useState<DayName>(getCurrentDayName());
  const [viewMode, setViewMode] = useState<"weekly" | "daily">("weekly");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLessonFilter, setSelectedLessonFilter] = useState("all");

  // Schedule Slot Modals
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [slotToEdit, setSlotToEdit] = useState<StudySlot | null>(null);
  const [dialogInitialDay, setDialogInitialDay] = useState<DayName>(getCurrentDayName());

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);

  const allLessons = getAllLessons();

  // Load slots using React Query (cached across page navigation)
  const { data: slots = [], isLoading } = useQuery<StudySlot[]>({
    queryKey: ["/api/schedule-slots"],
    queryFn: async () => {
      // Clean legacy localStorage key if present
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}

      const data = await customFetch<StudySlot[]>("/api/schedule-slots");
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }

      // Check if user has initialized schedule before
      const hasInitialized = localStorage.getItem("yks-schedule-initialized-v2");
      if (!hasInitialized) {
        localStorage.setItem("yks-schedule-initialized-v2", "true");
        await customFetch("/api/schedule-slots", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(DEFAULT_INITIAL_SLOTS),
        });
        return DEFAULT_INITIAL_SLOTS;
      }
      return Array.isArray(data) ? data : [];
    },
  });

  // Mutation to persist schedule to database
  const saveMutation = useMutation({
    mutationFn: async (updatedSlots: StudySlot[]) => {
      localStorage.setItem("yks-schedule-initialized-v2", "true");
      return customFetch<StudySlot[]>("/api/schedule-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSlots),
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/schedule-slots"], updated);
    },
  });

  // Helper to sync state immediately and commit to DB
  const saveSlotsToDb = async (updatedSlots: StudySlot[]) => {
    queryClient.setQueryData(["/api/schedule-slots"], updatedSlots);
    try {
      await saveMutation.mutateAsync(updatedSlots);
    } catch (err) {
      console.error("Ders programı kaydetme hatası:", err);
      queryClient.invalidateQueries({ queryKey: ["/api/schedule-slots"] });
    }
  };

  // Color helper mapping
  const getColorClass = (colorKey: string) => {
    const found = COLOR_OPTIONS.find((c) => c.key === colorKey);
    return found ? found.bg : "bg-primary/10 text-primary border-primary/20";
  };

  // Save or Update Slot
  const handleSaveSlot = async (savedSlot: StudySlot) => {
    let finalSlot = { ...savedSlot };

    // Eğer Deneme (Genel, Branş veya Konu) eklendiyse otomatik Denemelerim ekranına kaydet
    const isDeneme =
      savedSlot.activityType === "Branş Denemesi" ||
      savedSlot.activityType === "Konu Denemesi" ||
      savedSlot.activityType === "Genel Deneme";

    if (isDeneme && !finalSlot.practiceExamId) {
      try {
        const examType =
          savedSlot.activityType === "Branş Denemesi"
            ? "Branş"
            : savedSlot.activityType === "Konu Denemesi"
            ? "Konu"
            : "Genel";

        const category = savedSlot.category && savedSlot.category !== "Genel"
          ? savedSlot.category
          : (savedSlot.lesson.startsWith("AYT") ? "AYT" : "TYT");

        let title = "";
        const publisherTag = savedSlot.resourceName ? `[${savedSlot.resourceName}] ` : "";

        if (examType === "Genel") {
          const customName = savedSlot.topic ? ` (${savedSlot.topic})` : "";
          title = `${publisherTag}${category} Genel Denemesi${customName}`;
        } else if (examType === "Branş") {
          title = `${publisherTag}${savedSlot.lesson} Branş Denemesi`;
        } else {
          const topicStr = savedSlot.topic ? ` - ${savedSlot.topic}` : "";
          title = `${publisherTag}${savedSlot.lesson}${topicStr} Konu Denemesi`;
        }

        const qCount = savedSlot.targetQuestions || (examType === "Genel" ? (category === "AYT" ? 80 : 120) : 0);

        const createdExam = await customFetch<any>("/api/practice-exams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            examType,
            category,
            lesson: examType === "Genel" ? null : savedSlot.lesson,
            topic: examType === "Genel" ? null : (savedSlot.topic || null),
            resourceId: savedSlot.resourceId || null,
            publisher: savedSlot.resourceName || null,
            examNo: savedSlot.examNo || null,
            targetQuestionCount: qCount,
            examDate: new Date().toISOString(),
            durationMinutes: examType === "Genel" ? (category === "AYT" ? 180 : 165) : 60,
            totalNet: 0,
            details: {
              _pending: true,
              _brans: {
                correct: 0,
                wrong: 0,
                net: 0,
                questionCount: qCount,
                examNo: savedSlot.examNo || null,
              },
            },
            notes: savedSlot.notes || "Ders programından eklendi (Net Bekleniyor)",
          }),
        });

        if (createdExam && createdExam.id) {
          finalSlot.practiceExamId = createdExam.id;
          queryClient.invalidateQueries({ queryKey: ["practice-exams"] });
        }
      } catch (err) {
        console.error("Deneme oluşturma hatası:", err);
      }
    }

    const exists = slots.some((s) => s.id === finalSlot.id);
    const newSlots = exists
      ? slots.map((s) => (s.id === finalSlot.id ? finalSlot : s))
      : [...slots, finalSlot];

    await saveSlotsToDb(newSlots);
  };

  // Delete Slot
  const handleDeleteSlot = async (id: string) => {
    const newSlots = slots.filter((s) => s.id !== id);
    await saveSlotsToDb(newSlots);
  };

  // Toggle Slot Completion
  const handleToggleComplete = async (id: string) => {
    const newSlots = slots.map((s) =>
      s.id === id ? { ...s, completed: !s.completed } : s
    );
    await saveSlotsToDb(newSlots);
  };

  // Apply Template
  const handleApplyTemplate = async (newSlots: StudySlot[]) => {
    await saveSlotsToDb(newSlots);
  };

  // Copy Day
  const handleCopyDay = async (targetDays: DayName[]) => {
    const sourceSlots = slots.filter((s) => s.day === activeDay);
    if (sourceSlots.length === 0) return;

    const newCopiedSlots: StudySlot[] = [];
    targetDays.forEach((targetDay) => {
      sourceSlots.forEach((slot, idx) => {
        newCopiedSlots.push({
          ...slot,
          id: `slot_copy_${targetDay}_${Date.now()}_${idx}`,
          day: targetDay,
          completed: false,
        });
      });
    });

    const newSlots = [
      ...slots.filter((s) => !targetDays.includes(s.day)),
      ...newCopiedSlots,
    ];
    await saveSlotsToDb(newSlots);
  };

  // Reset Schedule
  const handleResetSchedule = async () => {
    if (window.confirm("Tüm haftalık ders programınızı sıfırlamak istediğinize emin misiniz?")) {
      await saveSlotsToDb([]);
    }
  };

  // Filter slots
  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      const matchesSearch =
        !searchQuery ||
        slot.lesson.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (slot.topic && slot.topic.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (slot.notes && slot.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (slot.resourceName && slot.resourceName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesLesson =
        selectedLessonFilter === "all" || slot.lesson === selectedLessonFilter;

      return matchesSearch && matchesLesson;
    });
  }, [slots, searchQuery, selectedLessonFilter]);

  // Open add modal for specific day
  const openAddForDay = (day: DayName) => {
    setSlotToEdit(null);
    setDialogInitialDay(day);
    setSlotDialogOpen(true);
  };

  // Open edit modal
  const openEditSlot = (slot: StudySlot) => {
    setSlotToEdit(slot);
    setDialogInitialDay(slot.day);
    setSlotDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 print:p-0 print:m-0 print:max-w-none print:bg-white print:text-black">
      {/* ── Print Styles ─────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          .print\\:break-inside-avoid {
            break-inside: avoid !important;
          }
          @page {
            size: landscape;
            margin: 10mm;
          }
        }
      `}</style>

      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/60 print:border-b-2 print:border-slate-800">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <CalendarDays className="h-7 w-7 text-primary print:hidden" /> Haftalık Ders Programım
          </h1>
          <p className="text-sm text-muted-foreground mt-1 print:text-slate-600">
            Haftalık etütlerinizi planlayın, kaynak ve denemelerinizi canlı takip edin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            onClick={() => {
              setSlotToEdit(null);
              setDialogInitialDay(activeDay);
              setSlotDialogOpen(true);
            }}
            className="gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" /> Etüt Ekle
          </Button>

          <Button
            variant="outline"
            onClick={() => setTemplateDialogOpen(true)}
            className="gap-2 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
          >
            <Sparkles className="h-4 w-4" /> Akıllı Şablonlar
          </Button>

          <Button
            variant="outline"
            size="icon"
            title="Yazdır (Sadece Program Tablosu)"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            title="Programı Sıfırla"
            onClick={handleResetSchedule}
            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          <Button
            variant="default"
            className="gap-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={async () => {
              if (window.confirm("Haftayı bitirmek istediğinize emin misiniz? Tamamlanan etütler analiz grafiklerine kalıcı olarak kaydedilecek ve programdaki tikleri kaldırılacaktır. (Programınız silinmeyecektir, sonraki hafta için tekrar kullanabilirsiniz.)")) {
                try {
                  const updatedSlots = await customFetch("/api/schedule-slots/finish-week", { method: "POST" });
                  queryClient.setQueryData(["/api/schedule-slots"], updatedSlots);
                  // Trigger invalidation of analysis stats as well
                  queryClient.invalidateQueries({ queryKey: ["practice-exams"] });
                } catch (error) {
                  console.error("Haftayı bitirme hatası:", error);
                }
              }
            }}
          >
            <CheckCircle2 className="h-4 w-4" /> Haftayı Bitir
          </Button>
        </div>
      </div>

      {/* ── Stats Summary ─────────────────────────────────────────────────── */}
      <div className="print:hidden">
        <ScheduleStats slots={slots} activeDay={activeDay} />
      </div>

      {/* ── Controls & View Tabs ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-2xl border border-border/60 print:hidden">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Ders, kaynak veya konuda ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          <Select value={selectedLessonFilter} onValueChange={setSelectedLessonFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Ders Filtresi" />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              <SelectItem value="all">Tüm Dersler</SelectItem>
              {allLessons.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-9">
              <TabsTrigger value="weekly" className="text-xs px-3">
                Haftalık Görünüm (7 Gün)
              </TabsTrigger>
              <TabsTrigger value="daily" className="text-xs px-3">
                Günlük Zaman Çizelgesi
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* ── View Content ────────────────────────────────────────────────────── */}
      {viewMode === "weekly" ? (
        /* ──────── 7-DAY WEEKLY GRID VIEW ──────── */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 print:grid-cols-7 print:gap-1.5 print:w-full">
          {DAYS_OF_WEEK.map((day) => {
            const daySlots = filteredSlots
              .filter((s) => s.day === day)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            const completedCount = daySlots.filter((s) => s.completed).length;

            return (
              <Card
                key={day}
                className="border-border/60 flex flex-col h-full bg-card/70 hover:border-primary/40 transition-colors print:border-slate-400 print:bg-white print:break-inside-avoid print:shadow-none"
              >
                <CardHeader className="p-2.5 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between space-y-0 print:p-2 print:border-slate-300">
                  <div>
                    <CardTitle className="text-xs font-extrabold text-foreground print:text-slate-900">
                      {day}
                    </CardTitle>
                    <span className="text-[10px] text-muted-foreground print:text-slate-600">
                      {daySlots.length} Etüt {completedCount > 0 && `(✓${completedCount})`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground print:hidden"
                    title={`${day} gününe etüt ekle`}
                    onClick={() => openAddForDay(day)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </CardHeader>

                <CardContent className="p-2 space-y-2 flex-1 min-h-[140px] print:p-1.5 print:space-y-1">
                  {daySlots.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-3 text-center text-muted-foreground print:hidden">
                      <p className="text-[11px]">Boş Gün</p>
                      <Button
                        variant="link"
                        className="text-[10px] h-5 px-1 mt-0.5 text-primary"
                        onClick={() => openAddForDay(day)}
                      >
                        + Etüt Ekle
                      </Button>
                    </div>
                  ) : (
                    daySlots.map((slot) => {
                      const isDeneme =
                        slot.activityType === "Branş Denemesi" ||
                        slot.activityType === "Konu Denemesi" ||
                        slot.activityType === "Genel Deneme";

                      return (
                        <div
                          key={slot.id}
                          className={cn(
                            "group relative p-2 rounded-xl border text-xs transition-all space-y-1 print:border-slate-300 print:p-1.5 print:bg-white print:text-slate-900 print:break-inside-avoid min-w-0 max-w-full overflow-hidden",
                            slot.completed
                              ? "bg-muted/40 border-muted text-muted-foreground opacity-75 print:opacity-100"
                              : getColorClass(slot.color)
                          )}
                        >
                          <div className="flex items-start justify-between gap-1 min-w-0 max-w-full">
                            <button
                              type="button"
                              onClick={() => handleToggleComplete(slot.id)}
                              className="flex items-center gap-1.5 font-semibold hover:opacity-80 text-left min-w-0 flex-1 overflow-hidden"
                            >
                              {slot.completed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 print:text-emerald-700" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 print:text-slate-400" />
                              )}
                              <span className={cn("truncate font-bold text-[11px] min-w-0 flex-1 block", slot.completed && "line-through print:no-underline")} title={slot.lesson}>
                                {slot.lesson}
                              </span>
                            </button>

                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 print:hidden">
                              <button
                                onClick={() => openEditSlot(slot)}
                                className="p-1 hover:text-foreground rounded"
                                title="Düzenle"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="p-1 hover:text-rose-500 rounded"
                                title="Sil"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-medium opacity-90 print:text-slate-700">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="truncate">{slot.startTime} - {slot.endTime}</span>
                          </div>

                          {slot.topic && (
                            <div className="text-[10.5px] font-medium truncate min-w-0 max-w-full print:text-slate-900" title={slot.topic}>
                              {slot.topic}
                            </div>
                          )}

                          {slot.resourceName && (
                            <div className="text-[9.5px] font-semibold text-primary flex items-center gap-1 min-w-0 max-w-full overflow-hidden print:text-indigo-800" title={slot.resourceName}>
                              <BookOpen className="h-3 w-3 shrink-0" />
                              <span className="truncate min-w-0 flex-1 block">{slot.resourceName}</span>
                            </div>
                          )}

                          {/* Deneme tamamlanma göstergesi */}
                          {isDeneme && slot.completed && (
                            <div className="pt-0.5 print:hidden min-w-0">
                              <span className="w-full text-left text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded flex items-center gap-1 truncate">
                                <Check className="h-2.5 w-2.5 shrink-0" /> Deneme Tamamlandı
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-0.5 gap-1 text-[9.5px] min-w-0 max-w-full">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 bg-background/60 shrink-0 truncate max-w-[70%] print:bg-white print:border-slate-400" title={slot.activityType}>
                              <span className="truncate">{slot.activityType}</span>
                            </Badge>
                            {slot.targetQuestions && (
                              <span className="font-bold text-primary shrink-0 print:text-slate-800">
                                {slot.targetQuestions} Soru
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ──────── DAILY TIMELINE VIEW ──────── */
        <div className="space-y-4 print:space-y-2">
          {/* Day selection tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b print:hidden">
            {DAYS_OF_WEEK.map((d) => {
              const dayCount = slots.filter((s) => s.day === d).length;

              return (
                <button
                  key={d}
                  onClick={() => setActiveDay(d)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2",
                    activeDay === d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/50 hover:bg-muted text-muted-foreground"
                  )}
                >
                  <span>{d}</span>
                  {dayCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                      {dayCount}
                    </Badge>
                  )}
                </button>
              );
            })}

            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => setCopyDialogOpen(true)}
              >
                <Copy className="h-3.5 w-3.5" /> Günü Kopyala
              </Button>
            </div>
          </div>

          {/* Active Day Slots List */}
          <Card className="border-border/60 print:border-slate-400 print:shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-3 print:pb-2">
              <div>
                <CardTitle className="text-lg font-bold print:text-slate-900">
                  {activeDay} Günü Etüt Programı
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5 print:text-slate-600">
                  Gününüzü etüt saatlerine göre adım adım tamamlayın.
                </p>
              </div>
              <Button size="sm" onClick={() => openAddForDay(activeDay)} className="gap-1.5 print:hidden">
                <Plus className="h-4 w-4" /> Yeni Etüt Ekle
              </Button>
            </CardHeader>

            <CardContent className="space-y-3 print:space-y-2">
              {filteredSlots.filter((s) => s.day === activeDay).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground space-y-3 print:py-4">
                  <BookOpen className="h-10 w-10 mx-auto opacity-30 print:hidden" />
                  <p className="text-sm font-medium">
                    {activeDay} günü için henüz bir etüt eklenmemiş.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => openAddForDay(activeDay)} className="print:hidden">
                    + {activeDay} Gününe Etüt Ekle
                  </Button>
                </div>
              ) : (
                filteredSlots
                  .filter((s) => s.day === activeDay)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((slot) => {
                    const isDeneme =
                      slot.activityType === "Branş Denemesi" ||
                      slot.activityType === "Konu Denemesi" ||
                      slot.activityType === "Genel Deneme";

                    return (
                      <div
                        key={slot.id}
                        className={cn(
                          "flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border transition-all gap-4 print:p-2.5 print:border-slate-300 print:break-inside-avoid min-w-0 max-w-full overflow-hidden",
                          slot.completed
                            ? "bg-muted/30 border-border/40 text-muted-foreground"
                            : "bg-card hover:border-primary/40 shadow-sm"
                        )}
                      >
                        <div className="flex items-start gap-3.5 flex-1 min-w-0 max-w-full overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleToggleComplete(slot.id)}
                            className="mt-1 shrink-0 print:hidden"
                          >
                            {slot.completed ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground/60 hover:text-primary transition-colors" />
                            )}
                          </button>

                          <div className="space-y-1 min-w-0 flex-1 overflow-hidden">
                            <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
                              <span
                                className={cn(
                                  "font-bold text-base print:text-slate-900 truncate max-w-full",
                                  slot.completed && "line-through text-muted-foreground print:no-underline"
                                )}
                                title={slot.lesson}
                              >
                                {slot.lesson}
                              </span>
                              <Badge variant="outline" className="text-xs shrink-0 print:border-slate-400">
                                {slot.activityType}
                              </Badge>
                              {slot.resourceName && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs flex items-center gap-1 max-w-[200px] sm:max-w-[320px] min-w-0 overflow-hidden print:text-slate-800" title={slot.resourceName}>
                                  <BookOpen className="h-3 w-3 shrink-0" />
                                  <span className="truncate min-w-0 block">{slot.resourceName}</span>
                                </Badge>
                              )}
                              {slot.targetQuestions && (
                                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-xs shrink-0">
                                  {slot.targetQuestions} Soru Hedefi
                                </Badge>
                              )}
                            </div>

                            {slot.topic && (
                              <p className="text-xs font-medium text-muted-foreground print:text-slate-800 truncate max-w-full" title={slot.topic}>
                                Konu: <span className="text-foreground font-semibold">{slot.topic}</span>
                              </p>
                            )}

                            {isDeneme && slot.completed && (
                              <div className="pt-1 print:hidden">
                                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-xs flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  Deneme Tamamlandı
                                </Badge>
                              </div>
                            )}

                            {slot.notes && (
                              <p className="text-xs text-muted-foreground italic print:text-slate-700 truncate max-w-full" title={slot.notes}>
                                "{slot.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-muted print:bg-slate-100 print:text-slate-900">
                            <Clock className="h-3.5 w-3.5 text-primary" />
                            {slot.startTime} - {slot.endTime}
                          </div>

                          <div className="flex items-center gap-1 print:hidden">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditSlot(slot)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                              onClick={() => handleDeleteSlot(slot.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Dialog Modals ──────────────────────────────────────────────────── */}
      <ScheduleSlotDialog
        open={slotDialogOpen}
        onOpenChange={setSlotDialogOpen}
        initialDay={dialogInitialDay}
        slotToEdit={slotToEdit}
        onSave={handleSaveSlot}
      />

      <TemplateWizardDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onApplyTemplate={handleApplyTemplate}
      />

      <CopyDayDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        sourceDay={activeDay}
        slots={slots}
        onCopy={handleCopyDay}
      />


    </div>
  );
}
