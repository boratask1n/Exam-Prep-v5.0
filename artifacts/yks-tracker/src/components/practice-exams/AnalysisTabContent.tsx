import { useState, useMemo } from "react";
import { format, subDays, isAfter } from "date-fns";
import { tr } from "date-fns/locale";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Zap,
  Calendar,
  Filter,
  BarChart2,
  BookOpen,
  Layers,
  FileText,
  Clock,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";

interface SubjectResult {
  correct: number;
  wrong: number;
  net: number;
  questionCount: number;
}

export interface PracticeExam {
  id: number;
  title: string;
  examType: "Genel" | "Branş" | "Konu";
  category: string;
  lesson?: string | null;
  topic?: string | null;
  resourceId?: number | null;
  resourceName?: string | null;
  examDate: string;
  durationMinutes?: number | null;
  totalNet: number;
  details?: Record<string, SubjectResult> | null;
  notes?: string | null;
}

interface AnalysisTabContentProps {
  exams: PracticeExam[];
  onNewExamClick: () => void;
}

type TimeRangeOption = "all" | "7d" | "30d" | "90d";
type ExamTypeFilter = "all" | "Genel" | "Branş" | "Konu";

export function AnalysisTabContent({ exams, onNewExamClick }: AnalysisTabContentProps) {
  // Filtre durumları
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeOption>("all");
  const [comparisonSubTab, setComparisonSubTab] = useState<"genel" | "brans" | "konu" | "sure">("genel");

  // 1. Dinamik Ders Listesi Çıkarımı
  const availableLessons = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((exam) => {
      if (exam.lesson) set.add(exam.lesson);
      if (exam.details) {
        Object.keys(exam.details).forEach((k) => {
          if (!k.startsWith("_")) set.add(k);
        });
      }
    });
    return Array.from(set).sort();
  }, [exams]);

  // 2. Filtrelenmiş Denemeler
  const filteredExams = useMemo(() => {
    const now = new Date();
    return exams.filter((exam) => {
      // Tür Filtresi
      if (examTypeFilter !== "all" && exam.examType !== examTypeFilter) return false;

      // Kategori Filtresi
      if (categoryFilter !== "all" && exam.category !== categoryFilter) return false;

      // Ders Filtresi
      if (lessonFilter !== "all") {
        const matchesMainLesson = exam.lesson === lessonFilter;
        const matchesDetailLesson = Boolean(exam.details?.[lessonFilter]);
        if (!matchesMainLesson && !matchesDetailLesson) return false;
      }

      // Tarih Aralığı Filtresi
      if (timeRangeFilter !== "all") {
        const examDate = new Date(exam.examDate);
        let daysToSubtract = 30;
        if (timeRangeFilter === "7d") daysToSubtract = 7;
        else if (timeRangeFilter === "90d") daysToSubtract = 90;

        const cutoffDate = subDays(now, daysToSubtract);
        if (!isAfter(examDate, cutoffDate)) return false;
      }

      return true;
    });
  }, [exams, examTypeFilter, categoryFilter, lessonFilter, timeRangeFilter]);

  // Kronolojik sıralı denemeler (Grafikler için)
  const chronologicalFiltered = useMemo(() => {
    return [...filteredExams].sort(
      (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
    );
  }, [filteredExams]);

  // 3. Özet Metrik Hesaplamaları (KPI)
  const kpiStats = useMemo(() => {
    if (filteredExams.length === 0) {
      return { maxNet: 0, maxExamTitle: "-", avgNet: 0, trend: 0, totalQuestions: 0, totalExams: 0 };
    }

    let maxNet = -999;
    let maxExamTitle = "";
    let netSum = 0;
    let totalQuestions = 0;

    filteredExams.forEach((exam) => {
      // Net hesabı (Spesifik ders seçiliyse o dersin netini al, yoksa toplam net)
      const currentNet = lessonFilter !== "all" && exam.details?.[lessonFilter]
        ? exam.details[lessonFilter].net
        : exam.totalNet;

      if (currentNet > maxNet) {
        maxNet = currentNet;
        maxExamTitle = exam.title;
      }
      netSum += currentNet;

      if (exam.details) {
        Object.entries(exam.details).forEach(([k, v]) => {
          if (!k.startsWith("_")) {
            totalQuestions += (v.questionCount || (v.correct + v.wrong));
          }
        });
      }
    });

    const avgNet = Math.round((netSum / filteredExams.length) * 100) / 100;

    // Trend (Son yarı vs Eski yarı)
    let trend = 0;
    if (chronologicalFiltered.length >= 2) {
      const half = Math.floor(chronologicalFiltered.length / 2);
      const olderSlice = chronologicalFiltered.slice(0, half);
      const newerSlice = chronologicalFiltered.slice(half);

      const getSliceNet = (arr: PracticeExam[]) =>
        arr.reduce((sum, e) => sum + (lessonFilter !== "all" && e.details?.[lessonFilter] ? e.details[lessonFilter].net : e.totalNet), 0) / arr.length;

      const olderAvg = getSliceNet(olderSlice);
      const newerAvg = getSliceNet(newerSlice);
      trend = Math.round((newerAvg - olderAvg) * 100) / 100;
    }

    return {
      maxNet: maxNet === -999 ? 0 : Math.round(maxNet * 100) / 100,
      maxExamTitle,
      avgNet,
      trend,
      totalQuestions,
      totalExams: filteredExams.length,
    };
  }, [filteredExams, chronologicalFiltered, lessonFilter]);

  // 4. Genel Denemeler Net Seyri Grafik Verisi
  const netTrendChartData = useMemo(() => {
    return chronologicalFiltered.map((exam) => {
      const displayNet = lessonFilter !== "all" && exam.details?.[lessonFilter]
        ? exam.details[lessonFilter].net
        : exam.totalNet;

      return {
        id: exam.id,
        date: format(new Date(exam.examDate), "d MMM", { locale: tr }),
        title: exam.title,
        net: displayNet,
        type: exam.examType,
        category: exam.category,
      };
    });
  }, [chronologicalFiltered, lessonFilter]);

  // 5. Ders Bazlı Doğru / Yanlış / Boş & Net Ortalama Verileri
  const subjectBreakdownData = useMemo(() => {
    const map = new Map<string, { correct: number; wrong: number; skipped: number; totalNet: number; count: number }>();

    filteredExams.forEach((exam) => {
      if (exam.details) {
        Object.entries(exam.details).forEach(([subj, data]) => {
          if (subj.startsWith("_")) return;
          if (lessonFilter !== "all" && subj !== lessonFilter) return;

          const existing = map.get(subj) || { correct: 0, wrong: 0, skipped: 0, totalNet: 0, count: 0 };
          const skipped = Math.max(0, (data.questionCount || 0) - (data.correct + data.wrong));
          
          map.set(subj, {
            correct: existing.correct + data.correct,
            wrong: existing.wrong + data.wrong,
            skipped: existing.skipped + skipped,
            totalNet: existing.totalNet + data.net,
            count: existing.count + 1,
          });
        });
      } else if (exam.lesson) {
        if (lessonFilter !== "all" && exam.lesson !== lessonFilter) return;
        const existing = map.get(exam.lesson) || { correct: 0, wrong: 0, skipped: 0, totalNet: 0, count: 0 };
        map.set(exam.lesson, {
          correct: existing.correct,
          wrong: existing.wrong,
          skipped: existing.skipped,
          totalNet: existing.totalNet + exam.totalNet,
          count: existing.count + 1,
        });
      }
    });

    return Array.from(map.entries()).map(([subj, stats]) => ({
      subject: subj,
      avgCorrect: Math.round((stats.correct / stats.count) * 10) / 10,
      avgWrong: Math.round((stats.wrong / stats.count) * 10) / 10,
      avgSkipped: Math.round((stats.skipped / stats.count) * 10) / 10,
      avgNet: Math.round((stats.totalNet / stats.count) * 100) / 100,
      count: stats.count,
    })).sort((a, b) => b.avgNet - a.avgNet);
  }, [filteredExams, lessonFilter]);

  // 6. Branş Denemeleri Kaynak / Yayın Karşılaştırması
  const publisherComparisonData = useMemo(() => {
    const map = new Map<string, { totalNet: number; count: number; minNet: number; maxNet: number }>();

    filteredExams.forEach((exam) => {
      const publisherName = exam.resourceName || "Belirtilmemiş Yayın";
      const existing = map.get(publisherName) || {
        totalNet: 0,
        count: 0,
        minNet: Infinity,
        maxNet: -Infinity,
      };

      map.set(publisherName, {
        totalNet: existing.totalNet + exam.totalNet,
        count: existing.count + 1,
        minNet: Math.min(existing.minNet, exam.totalNet),
        maxNet: Math.max(existing.maxNet, exam.totalNet),
      });
    });

    return Array.from(map.entries()).map(([publisher, stats]) => ({
      publisher,
      avgNet: Math.round((stats.totalNet / stats.count) * 100) / 100,
      minNet: stats.minNet === Infinity ? 0 : stats.minNet,
      maxNet: stats.maxNet === -Infinity ? 0 : stats.maxNet,
      count: stats.count,
    })).sort((a, b) => b.avgNet - a.avgNet);
  }, [filteredExams]);

  // 7. Konu Denemeleri Analizi (Güçlü vs Zayıf Konular)
  const topicAnalysisData = useMemo(() => {
    const topicExams = filteredExams.filter((e) => e.examType === "Konu" && e.topic);
    const map = new Map<string, { topic: string; lesson: string; nets: number[]; totalNet: number }>();

    topicExams.forEach((exam) => {
      const key = `${exam.lesson || "Genel"} - ${exam.topic}`;
      const existing = map.get(key) || {
        topic: exam.topic || "",
        lesson: exam.lesson || "Genel",
        nets: [],
        totalNet: 0,
      };
      existing.nets.push(exam.totalNet);
      existing.totalNet += exam.totalNet;
      map.set(key, existing);
    });

    const list = Array.from(map.values()).map((item) => ({
      topic: item.topic,
      lesson: item.lesson,
      count: item.nets.length,
      avgNet: Math.round((item.totalNet / item.nets.length) * 100) / 100,
      latestNet: item.nets[item.nets.length - 1],
    }));

    return {
      strongTopics: [...list].sort((a, b) => b.avgNet - a.avgNet).slice(0, 5),
      weakTopics: [...list].sort((a, b) => a.avgNet - b.avgNet).slice(0, 5),
    };
  }, [filteredExams]);

  // 8. Süre & Hız Verileri
  const durationSpeedData = useMemo(() => {
    const timedExams = filteredExams.filter((e) => e.durationMinutes && e.durationMinutes > 0);
    if (timedExams.length === 0) return null;

    const totalDuration = timedExams.reduce((sum, e) => sum + (e.durationMinutes || 0), 0);
    const avgDuration = Math.round(totalDuration / timedExams.length);

    const speedList = timedExams.map((e) => {
      const net = e.totalNet > 0 ? e.totalNet : 1;
      const minPerNet = Math.round(((e.durationMinutes || 0) / net) * 10) / 10;
      return {
        title: e.title,
        date: format(new Date(e.examDate), "d MMM", { locale: tr }),
        duration: e.durationMinutes || 0,
        net: e.totalNet,
        minPerNet,
      };
    });

    const avgMinPerNet = Math.round(
      (speedList.reduce((sum, s) => sum + s.minPerNet, 0) / speedList.length) * 10
    ) / 10;

    return {
      avgDuration,
      avgMinPerNet,
      speedList,
    };
  }, [filteredExams]);

  // Filtre Sıfırlama
  const resetFilters = () => {
    setExamTypeFilter("all");
    setCategoryFilter("all");
    setLessonFilter("all");
    setTimeRangeFilter("all");
  };

  const hasActiveFilter =
    examTypeFilter !== "all" || categoryFilter !== "all" || lessonFilter !== "all" || timeRangeFilter !== "all";

  return (
    <div className="space-y-6">
      {/* ── İNTERAKTİF FİLTRE PANENİ ── */}
      <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 pt-4 px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-bold">Performans ve Karşılaştırma Filtreleri</CardTitle>
              {hasActiveFilter && (
                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-2 py-0.5">
                  Filtre Aktif
                </Badge>
              )}
            </div>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground p-0 px-2"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Filtreleri Temizle
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Deneme Türü Filtresi */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Deneme Türü</label>
              <Select value={examTypeFilter} onValueChange={(val) => setExamTypeFilter(val as ExamTypeFilter)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Deneme Türleri</SelectItem>
                  <SelectItem value="Genel">📘 Genel Denemeler</SelectItem>
                  <SelectItem value="Branş">🟣 Branş Denemeleri</SelectItem>
                  <SelectItem value="Konu">🟡 Konu Denemeleri</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Kategori Filtresi */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Kategori</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Kategoriler</SelectItem>
                  <SelectItem value="TYT">📘 TYT</SelectItem>
                  <SelectItem value="AYT">📕 AYT</SelectItem>
                  <SelectItem value="Genel">🌐 Genel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ders Filtresi */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Spesifik Ders</label>
              <Select value={lessonFilter} onValueChange={setLessonFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="all">Tüm Dersler</SelectItem>
                  {availableLessons.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Zaman Aralığı Filtresi */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Tarih Aralığı</label>
              <Select value={timeRangeFilter} onValueChange={(val) => setTimeRangeFilter(val as TimeRangeOption)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Zamanlar</SelectItem>
                  <SelectItem value="7d">Son 7 Gün</SelectItem>
                  <SelectItem value="30d">Son 30 Gün</SelectItem>
                  <SelectItem value="90d">Son 90 Gün</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI PERFORMANS KARTLARI ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* En Yüksek Net (Pik Net) */}
        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                <Award className="h-3.5 w-3.5 text-emerald-500" />
                Pik (En Yüksek) Net
              </p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {filteredExams.length > 0 ? kpiStats.maxNet : "-"}
              </p>
            </div>
            {filteredExams.length > 0 && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 truncate max-w-[90px]" title={kpiStats.maxExamTitle}>
                {kpiStats.maxExamTitle}
              </Badge>
            )}
          </div>
        </Card>

        {/* Ortalama Net */}
        <Card className="p-4 border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10">
          <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
            <Target className="h-3.5 w-3.5 text-blue-500" />
            Ortalama Net
          </p>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
            {filteredExams.length > 0 ? kpiStats.avgNet : "-"}
          </p>
        </Card>

        {/* Net Trend Değişimi */}
        <Card className="p-4 border-purple-500/20 bg-purple-500/5 dark:bg-purple-500/10">
          <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-purple-500" />
            Gelişim Trendi
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <p className={cn("text-2xl sm:text-3xl font-black tabular-nums", kpiStats.trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {kpiStats.trend > 0 ? `+${kpiStats.trend}` : kpiStats.trend}
            </p>
            {kpiStats.trend > 0 ? (
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            ) : kpiStats.trend < 0 ? (
              <TrendingDown className="h-5 w-5 text-rose-500" />
            ) : null}
          </div>
        </Card>

        {/* Toplam Deneme ve Soru */}
        <Card className="p-4 border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10">
          <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            İncelenen Deneme
          </p>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {kpiStats.totalExams} <span className="text-xs font-medium text-muted-foreground">deneme</span>
          </p>
        </Card>
      </div>

      {/* ── GRAFİK & ANALİZ DETAY ALANI ── */}
      {filteredExams.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <BarChart2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-bold">Seçili Filtrelerle Eşleşen Deneme Bulunamadı</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Filtrelerinizi esneterek veya yeni deneme ekleyerek grafikleri görüntüleyebilirsiniz.
          </p>
          <Button variant="outline" size="sm" onClick={onNewExamClick}>
            Yeni Deneme Ekle
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Alt Sekmeler: Genel Seyir | Branş & Yayın | Konu & Zayıf Yönler | Hız & Süre */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={comparisonSubTab === "genel" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonSubTab("genel")}
                className="h-8 text-xs font-semibold rounded-lg"
              >
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Genel Net Seyri & Dağılım
              </Button>
              <Button
                variant={comparisonSubTab === "brans" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonSubTab("brans")}
                className="h-8 text-xs font-semibold rounded-lg"
              >
                <Layers className="h-3.5 w-3.5 mr-1.5" />
                Branş & Yayın Karşılaştırma
              </Button>
              <Button
                variant={comparisonSubTab === "konu" ? "default" : "outline"}
                size="sm"
                onClick={() => setComparisonSubTab("konu")}
                className="h-8 text-xs font-semibold rounded-lg"
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Konu & Zayıf Noktalar
              </Button>
              {durationSpeedData && (
                <Button
                  variant={comparisonSubTab === "sure" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setComparisonSubTab("sure")}
                  className="h-8 text-xs font-semibold rounded-lg"
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Hız & Süre Takibi
                </Button>
              )}
            </div>

            <Badge variant="outline" className="text-xs text-muted-foreground font-normal">
              {filteredExams.length} deneme analiz edildi
            </Badge>
          </div>

          {/* TAB 1: GENEL NET SEYRİ & DERS DAĞILIMI */}
          {comparisonSubTab === "genel" && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Zaman İçinde Net Gelişim Grafiği */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Deneme Net Gelişim Trendi
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {lessonFilter !== "all"
                          ? `Seçili Ders: "${lessonFilter}" — zaman içindeki net değişimi`
                          : "Tüm denemelerin kronolojik net gelişimi (Ortalama çizgi referansı ile)"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={netTrendChartData} margin={{ top: 10, right: 20, bottom: 5, left: -10 }}>
                        <defs>
                          <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(val: number) => [`${val.toFixed(2)} Net`, "Net"]}
                          labelFormatter={(label, items) => {
                            const title = items?.[0]?.payload?.title;
                            return title ? `${title} (${label})` : label;
                          }}
                        />
                        <ReferenceLine
                          y={kpiStats.avgNet}
                          label={{ value: `Ort: ${kpiStats.avgNet}`, fill: '#8b5cf6', fontSize: 10, position: 'insideTopRight' }}
                          stroke="#8b5cf6"
                          strokeDasharray="4 4"
                        />
                        <Area
                          type="monotone"
                          dataKey="net"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#netGradient)"
                          dot={{ r: 4, fill: "#10b981" }}
                          activeDot={{ r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Ders Bazlı Doğru / Yanlış / Boş Dağılımı */}
              {subjectBreakdownData.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold">Ders Bazlı Soru Dağılımı & Ortalama Net</CardTitle>
                    <CardDescription className="text-xs">
                      Her ders için ortalama doğru, yanlış ve boş soru sayıları
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={subjectBreakdownData} margin={{ top: 10, right: 20, bottom: 5, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="subject" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="avgCorrect" name="Doğru" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="avgWrong" name="Yanlış" fill="#f43f5e" stackId="a" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="avgSkipped" name="Boş" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: BRANŞ & YAYIN KARŞILAŞTIRMA */}
          {comparisonSubTab === "brans" && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Yayın / Kaynak Karşılaştırması */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-purple-500" />
                    Yayın & Kaynak Bazlı Performans Karşılaştırması
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Çözdüğünüz yayınların denemelerindeki ortalama net başarınız
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  {publisherComparisonData.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center p-6">Yayın verisi bulunamadı.</p>
                  ) : (
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={publisherComparisonData} margin={{ top: 10, right: 20, bottom: 25, left: -10 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis dataKey="publisher" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
                          <YAxis tick={{ fontSize: 11 }} />
                          <RechartsTooltip formatter={(val: number) => [`${val.toFixed(2)} Net`, "Ort. Net"]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="avgNet" name="Ortalama Net" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="maxNet" name="En Yüksek Net" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Ders Bazlı Branş Sıralaması Listesi */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold">Ders Bazlı Branş Performansı</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {subjectBreakdownData.map((item) => (
                      <div key={item.subject} className="p-3 rounded-xl border bg-card/40 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm">{item.subject}</p>
                          <p className="text-xs text-muted-foreground">{item.count} deneme çözüldü</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-extrabold text-purple-600 dark:text-purple-400">{item.avgNet.toFixed(1)} <span className="text-xs font-normal">net</span></p>
                          <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                            <span className="text-emerald-500 font-medium">{item.avgCorrect} D</span>
                            <span className="text-rose-500 font-medium">{item.avgWrong} Y</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 3: KONU & ZAYIF NOKTALAR */}
          {comparisonSubTab === "konu" && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Güçlü Konular */}
              <Card className="border-emerald-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    En Başarılı Olduğun Konular (Güçlü Yönler)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Konu denemelerinde yüksek net elde ettiğin konular
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {topicAnalysisData.strongTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center p-6 border border-dashed rounded-xl">
                      Henüz konu denemesi verisi girilmemiş.
                    </p>
                  ) : (
                    topicAnalysisData.strongTopics.map((t, idx) => (
                      <div key={idx} className="p-3 rounded-xl border bg-emerald-500/5 dark:bg-emerald-500/10 flex justify-between items-center">
                        <div>
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 mb-1">
                            {t.lesson}
                          </Badge>
                          <p className="font-semibold text-xs sm:text-sm">{t.topic}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{t.avgNet} net</p>
                          <p className="text-[10px] text-muted-foreground">{t.count} deneme</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Zayıf Noktalar / Odaklanılacak Konular */}
              <Card className="border-rose-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-rose-500" />
                    Tekrar Etmen Gereken Konular (Zayıf Yönler)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Düşük net alınan ve tekrar edilmesi önerilen konular
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-2">
                  {topicAnalysisData.weakTopics.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center p-6 border border-dashed rounded-xl">
                      Henüz konu denemesi verisi girilmemiş.
                    </p>
                  ) : (
                    topicAnalysisData.weakTopics.map((t, idx) => (
                      <div key={idx} className="p-3 rounded-xl border bg-rose-500/5 dark:bg-rose-500/10 flex justify-between items-center">
                        <div>
                          <Badge variant="outline" className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 mb-1">
                            {t.lesson}
                          </Badge>
                          <p className="font-semibold text-xs sm:text-sm">{t.topic}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-extrabold text-rose-600 dark:text-rose-400">{t.avgNet} net</p>
                          <p className="text-[10px] text-muted-foreground">{t.count} deneme</p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 4: HIZ & SÜRE TAKİBİ */}
          {comparisonSubTab === "sure" && durationSpeedData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Deneme Süresi & Hız Performansı
                </CardTitle>
                <CardDescription className="text-xs">
                  Harcanan süre ve 1 Net için harcanan ortalama dakika analizi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border bg-muted/30">
                    <p className="text-xs text-muted-foreground font-medium">Ortalama Deneme Süresi</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{durationSpeedData.avgDuration} <span className="text-xs font-normal">dakika</span></p>
                  </div>
                  <div className="p-3 rounded-xl border bg-muted/30">
                    <p className="text-xs text-muted-foreground font-medium">1 Net İçin Süre (Ortalama)</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-0.5">{durationSpeedData.avgMinPerNet} <span className="text-xs font-normal">dk / net</span></p>
                  </div>
                </div>

                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={durationSpeedData.speedList} margin={{ top: 10, right: 20, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip formatter={(val: number) => [`${val} dk`, "Süre"]} />
                      <Bar dataKey="duration" name="Süre (dk)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
