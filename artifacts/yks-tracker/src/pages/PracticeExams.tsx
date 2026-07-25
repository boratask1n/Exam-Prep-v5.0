import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Plus, BarChart2, BookOpen, Trash2, Pencil, Layers, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PracticeExamFormDialog } from "@/components/practice-exams/PracticeExamFormDialog";
import { AnalysisTabContent } from "@/components/practice-exams/AnalysisTabContent";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

interface SubjectResult {
  correct: number;
  wrong: number;
  net: number;
  questionCount: number;
}

interface PracticeExam {
  id: number;
  title: string;
  examType: "Genel" | "Branş" | "Konu";
  category: string;
  lesson?: string | null;
  topic?: string | null;
  resourceId?: number | null;
  examDate: string;
  durationMinutes?: number | null;
  totalNet: number;
  details?: Record<string, SubjectResult> | null;
  notes?: string | null;
}

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────

/** Deneme kartı */
function ExamCard({
  exam,
  onEdit,
  onDelete,
}: {
  exam: PracticeExam;
  onEdit: (e: PracticeExam) => void;
  onDelete: (id: number) => void;
}) {
  const isGenel = exam.examType === "Genel";
  const isKonu = exam.examType === "Konu";
  const isPending = Boolean((exam.details as any)?._pending);
  const subjectEntries = exam.details
    ? Object.entries(exam.details).filter(([k]) => !k.startsWith("_"))
    : [];

  return (
    <Card className={cn(
      "relative group flex flex-col hover:shadow-md transition-shadow",
      isPending && "border-amber-400/60 bg-amber-500/5 dark:border-amber-500/40"
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base leading-snug truncate font-bold flex items-center gap-1.5">
              {exam.title}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {format(new Date(exam.examDate), "d MMMM yyyy", { locale: tr })}
              {exam.durationMinutes && (
                <span className="ml-2 text-muted-foreground/70">
                  · {exam.durationMinutes} dk
                </span>
              )}
            </CardDescription>
          </div>
          {/* Aksiyon butonları */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(exam)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(exam.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {/* Etiketler */}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {isPending ? (
            <Badge variant="outline" className="text-xs py-0 h-5 font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40 animate-pulse">
              ⏳ Net Bekleniyor
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs py-0 h-5 font-semibold">
              {exam.category}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={cn(
              "text-xs py-0 h-5 font-semibold",
              isGenel
                ? "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400"
                : isKonu
                ? "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400"
                : "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400"
            )}
          >
            {exam.examType === "Branş" ? "Branş" : exam.examType === "Konu" ? "Konu" : "Genel"}
          </Badge>
          {exam.lesson && (
            <Badge variant="outline" className="text-xs py-0 h-5 truncate max-w-[140px]">
              {exam.lesson}
            </Badge>
          )}
          {exam.topic && exam.topic !== "_none" && (
            <Badge variant="secondary" className="text-xs py-0 h-5 truncate max-w-[140px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-400/30">
              {exam.topic}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pt-1">
        {isPending ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-2 text-center mt-2">
            <span className="block text-xs font-medium text-amber-800 dark:text-amber-200">
              Ders programından oluşturuldu
            </span>
            <Button
              size="sm"
              className="w-full h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
              onClick={() => onEdit(exam)}
            >
              ✍️ Net Gir ve Sonuçlandır
            </Button>
          </div>
        ) : (
          <>
            {/* Toplam Net */}
            <div className="flex items-end justify-between">
              <span className="text-xs text-muted-foreground font-medium">Toplam Net</span>
              <span
                className={cn(
                  "text-3xl font-extrabold tabular-nums",
                  exam.totalNet > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                )}
              >
                {exam.totalNet.toFixed(2)}
              </span>
            </div>

            {/* Genel deneme: ders bazlı netleri mini tablo */}
            {isGenel && subjectEntries.length > 0 && (
              <>
                <Separator className="opacity-50" />
                <div className="space-y-1">
                  {subjectEntries.map(([lesson, result]) => (
                    <div
                      key={lesson}
                      className="flex justify-between text-xs"
                    >
                      <span className="text-muted-foreground truncate max-w-[60%]">{lesson}</span>
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          result.net > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : result.net < 0
                            ? "text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {result.net.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function PracticeExams() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [examToEdit, setExamToEdit] = useState<PracticeExam | null>(null);
  const [activeTab, setActiveTab] = useState<string>("genel-denemeler");

  const {
    data: exams = [],
    isLoading,
    refetch,
  } = useQuery<PracticeExam[]>({
    queryKey: ["practice-exams"],
    queryFn: () => customFetch<PracticeExam[]>("/api/practice-exams"),
  });

  const handleDelete = async (id: number) => {
    if (!confirm("Bu denemeyi silmek istediğinizden emin misiniz?")) return;
    await customFetch(`/api/practice-exams/${id}`, { method: "DELETE" });
    refetch();
  };

  const openEditDialog = (exam: PracticeExam) => {
    setExamToEdit(exam);
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setExamToEdit(null);
    setIsDialogOpen(true);
  };

  // ── Filtrelenmiş Gruplar ───────────────────────────────────────────────────

  const sortedExams = [...exams].sort(
    (a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime()
  );

  const generalExams = sortedExams.filter((e) => e.examType === "Genel");
  const tytExams = generalExams.filter((e) => e.category === "TYT");
  const aytExams = generalExams.filter((e) => e.category === "AYT");
  const bransExams = sortedExams.filter((e) => e.examType === "Branş");
  const konuExams = sortedExams.filter((e) => e.examType === "Konu");

  // Grafik verileri (kronolojik sıralama)
  const chronologicalExams = [...exams].sort(
    (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
  );
  const chronologicalGenel = chronologicalExams.filter((e) => e.examType === "Genel");

  const netProgressData = chronologicalGenel.map((exam) => ({
    name: format(new Date(exam.examDate), "d MMM", { locale: tr }),
    tyt: exam.category === "TYT" ? exam.totalNet : undefined,
    ayt: exam.category === "AYT" ? exam.totalNet : undefined,
    title: exam.title,
  }));

  // Ders bazlı ortalama net (branş)
  const lessonNetMap = new Map<string, number[]>();
  bransExams.forEach((exam) => {
    if (exam.lesson) {
      const arr = lessonNetMap.get(exam.lesson) ?? [];
      arr.push(exam.totalNet);
      lessonNetMap.set(exam.lesson, arr);
    }
  });
  const lessonAvgData = Array.from(lessonNetMap.entries()).map(([name, nets]) => ({
    name,
    avgNet: Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 100) / 100,
    count: nets.length,
  }));

  // TYT ders gelişim verisi
  const tytLessons = ["Türkçe", "Sosyal Bilimler", "Temel Matematik", "Fen Bilimleri"];
  const chronologicalTYT = chronologicalGenel.filter((e) => e.category === "TYT");
  const tytSubjectData = chronologicalTYT.map((exam) => {
    const row: Record<string, any> = {
      name: format(new Date(exam.examDate), "d MMM", { locale: tr }),
    };
    tytLessons.forEach((l) => {
      row[l] = exam.details?.[l]?.net ?? undefined;
    });
    return row;
  });

  const LESSON_COLORS: Record<string, string> = {
    Türkçe: "#8b5cf6",
    "Sosyal Bilimler": "#f59e0b",
    "Temel Matematik": "#3b82f6",
    "Fen Bilimleri": "#10b981",
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Denemelerim</h1>
          <p className="text-muted-foreground text-sm">
            Genel, branş ve konu denemelerinizi ayrıştırarak gelişimizi detaylı inceleyin.
          </p>
        </div>
        <Button onClick={openNewDialog} className="shrink-0 font-semibold shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Yeni Deneme Ekle
        </Button>
      </div>

      {/* Sekmeler (3 Alt Sayfa: Genel, Branş, Konu + Analiz) */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto pb-1 scrollbar-none">
          <TabsList className="h-11 inline-flex w-auto min-w-full sm:min-w-0 p-1 bg-muted/60 backdrop-blur-sm rounded-2xl gap-1">
            <TabsTrigger value="genel-denemeler" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold gap-2 transition-all">
              <BookOpen className="h-4 w-4 text-blue-500" />
              <span>Genel Denemeler</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {generalExams.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="brans-denemeleri" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold gap-2 transition-all">
              <Layers className="h-4 w-4 text-purple-500" />
              <span>Branş Denemeleri</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400">
                {bransExams.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="konu-denemeleri" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold gap-2 transition-all">
              <FileText className="h-4 w-4 text-amber-500" />
              <span>Konu Denemeleri</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4 font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {konuExams.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="analiz" className="rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold gap-2 transition-all">
              <BarChart2 className="h-4 w-4 text-emerald-500" />
              <span>Analiz & Grafikler</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── 1. GENEL DENEMELER SAYFASI ── */}
        <TabsContent value="genel-denemeler" className="space-y-6 focus-visible:outline-none">
          {/* İstatistik Özet Kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Toplam Genel Deneme</p>
              <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                {generalExams.length}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">TYT Denemeleri</p>
              <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
                {tytExams.length}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">AYT Denemeleri</p>
              <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                {aytExams.length}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Ortalama TYT Net</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {tytExams.length > 0
                  ? (tytExams.reduce((a, b) => a + b.totalNet, 0) / tytExams.length).toFixed(1)
                  : "-"}
              </p>
            </Card>
          </div>

          {/* Deneme Kartları Listesi */}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-xl border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : generalExams.length === 0 ? (
            <div className="text-center p-14 border rounded-2xl bg-muted/15 border-dashed">
              <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-semibold">Henüz Genel Deneme Eklenmemiş</h3>
              <p className="text-muted-foreground mb-4 text-xs">
                TYT veya AYT genel deneme sonuçlarınızı ekleyerek net seyrinizi takip edebilirsiniz.
              </p>
              <Button onClick={openNewDialog} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Genel Deneme Ekle
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {generalExams.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  onEdit={openEditDialog}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── 2. BRANŞ DENEMELERİ SAYFASI ── */}
        <TabsContent value="brans-denemeleri" className="space-y-6 focus-visible:outline-none">
          {/* İstatistik Özet Kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Toplam Branş Denemesi</p>
              <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
                {bransExams.length}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Farklı Ders Sayısı</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {lessonAvgData.length}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Genel Ort. Branş Neti</p>
              <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                {bransExams.length > 0
                  ? (bransExams.reduce((a, b) => a + b.totalNet, 0) / bransExams.length).toFixed(1)
                  : "-"}
              </p>
            </Card>
          </div>

          {/* Branş Deneme Kartları Listesi */}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 rounded-xl border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : bransExams.length === 0 ? (
            <div className="text-center p-14 border rounded-2xl bg-muted/15 border-dashed">
              <Layers className="mx-auto h-12 w-12 text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-semibold">Henüz Branş Denemesi Eklenmemiş</h3>
              <p className="text-muted-foreground mb-4 text-xs">
                Ders bazlı çözdüğünüz branş denemelerinizi kaynaklarınız ile eşleştirerek kaydedin.
              </p>
              <Button onClick={openNewDialog} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Branş Denemesi Ekle
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bransExams.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  onEdit={openEditDialog}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── 3. KONU DENEMELERİ SAYFASI ── */}
        <TabsContent value="konu-denemeleri" className="space-y-6 focus-visible:outline-none">
          {/* İstatistik Özet Kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Toplam Konu Denemesi</p>
              <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                {konuExams.length}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Çalışılan Konu Sayısı</p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {new Set(konuExams.map((e) => e.topic).filter(Boolean)).size}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs text-muted-foreground font-medium">Ortalama Konu Neti</p>
              <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
                {konuExams.length > 0
                  ? (konuExams.reduce((a, b) => a + b.totalNet, 0) / konuExams.length).toFixed(1)
                  : "-"}
              </p>
            </Card>
          </div>

          {/* Konu Deneme Kartları Listesi */}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 rounded-xl border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : konuExams.length === 0 ? (
            <div className="text-center p-14 border rounded-2xl bg-muted/15 border-dashed">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground/60 mb-3" />
              <h3 className="text-base font-semibold">Henüz Konu Denemesi Eklenmemiş</h3>
              <p className="text-muted-foreground mb-4 text-xs">
                Belirli bir konuya özel uyguladığınız konu tara-testi veya mini denemeleri kaydedin.
              </p>
              <Button onClick={openNewDialog} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Konu Denemesi Ekle
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {konuExams.map((exam) => (
                <ExamCard
                  key={exam.id}
                  exam={exam}
                  onEdit={openEditDialog}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── 4. ANALİZ & GRAFİKLER SAYFASI ── */}
        <TabsContent value="analiz" className="space-y-6 focus-visible:outline-none">
          <AnalysisTabContent exams={exams} onNewExamClick={openNewDialog} />
        </TabsContent>
      </Tabs>

      <PracticeExamFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        examToEdit={examToEdit}
      />
    </div>
  );
}
