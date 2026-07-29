import { useState, useMemo } from "react";
import { format, subDays, isAfter } from "date-fns";
import { tr } from "date-fns/locale";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Zap,
  Filter,
  BarChart2,
  BookOpen,
  Layers,
  FileText,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  PieChart as PieChartIcon,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
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
  Cell,
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

type MainTab = "overview" | "genel" | "brans" | "konu";
type TimeRangeOption = "all" | "7d" | "30d" | "90d";

export function AnalysisTabContent({ exams, onNewExamClick }: AnalysisTabContentProps) {
  // Ana Sekme (4 Kulvar)
  const [activeTab, setActiveTab] = useState<MainTab>("overview");

  // Filtre durumları
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeOption>("all");
  const [genelCategory, setGenelCategory] = useState<"TYT" | "AYT">("TYT");
  const [bransLesson, setBransLesson] = useState<string>("all");
  const [konuLesson, setKonuLesson] = useState<string>("all");

  // Dinamik Ders Listesi
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

  // Tarih Filtreli Denemeler
  const timeFilteredExams = useMemo(() => {
    const now = new Date();
    return exams.filter((exam) => {
      if (timeRangeFilter === "all") return true;
      const examDate = new Date(exam.examDate);
      let daysToSubtract = 30;
      if (timeRangeFilter === "7d") daysToSubtract = 7;
      else if (timeRangeFilter === "90d") daysToSubtract = 90;
      return isAfter(examDate, subDays(now, daysToSubtract));
    });
  }, [exams, timeRangeFilter]);

  // Kronolojik sıralı denemeler
  const sortedExams = useMemo(() => {
    return [...timeFilteredExams].sort(
      (a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
    );
  }, [timeFilteredExams]);

  // ─── 1. ANA PERFORMANS (OVERVIEW) VERİLERİ ──────────────────────────────────
  const overviewStats = useMemo(() => {
    const totalCount = timeFilteredExams.length;
    const genelExams = timeFilteredExams.filter((e) => e.examType === "Genel");
    const bransExams = timeFilteredExams.filter((e) => e.examType === "Branş");
    const konuExams = timeFilteredExams.filter((e) => e.examType === "Konu");

    const tytGenel = genelExams.filter((e) => e.category === "TYT");
    const aytGenel = genelExams.filter((e) => e.category === "AYT");

    const avgNet = (arr: PracticeExam[]) =>
      arr.length > 0 ? Math.round((arr.reduce((s, e) => s + e.totalNet, 0) / arr.length) * 100) / 100 : 0;

    const maxNet = (arr: PracticeExam[]) =>
      arr.length > 0 ? Math.max(...arr.map((e) => e.totalNet)) : 0;

    // Toplam Soru Hacmi Hesabı
    let totalQuestions = 0;
    timeFilteredExams.forEach((e) => {
      if (e.examType === "Genel") {
        totalQuestions += e.category === "AYT" ? 80 : 120;
      } else if (e.details) {
        Object.entries(e.details).forEach(([k, v]) => {
          if (!k.startsWith("_")) totalQuestions += v.questionCount || v.correct + v.wrong;
        });
      }
    });

    // Tür bazlı kıyaslama grafiği verisi
    const typeDistributionData = [
      {
        type: "Genel Denemeler",
        count: genelExams.length,
        avgNet: avgNet(genelExams),
        maxNet: maxNet(genelExams),
        color: "#3b82f6",
      },
      {
        type: "Branş Denemeleri",
        count: bransExams.length,
        avgNet: avgNet(bransExams),
        maxNet: maxNet(bransExams),
        color: "#8b5cf6",
      },
      {
        type: "Konu Denemeleri",
        count: konuExams.length,
        avgNet: avgNet(konuExams),
        maxNet: maxNet(konuExams),
        color: "#f59e0b",
      },
    ];

    return {
      totalCount,
      genelCount: genelExams.length,
      bransCount: bransExams.length,
      konuCount: konuExams.length,
      totalQuestions,
      tytCount: tytGenel.length,
      tytAvg: avgNet(tytGenel),
      tytMax: maxNet(tytGenel),
      aytCount: aytGenel.length,
      aytAvg: avgNet(aytGenel),
      aytMax: maxNet(aytGenel),
      typeDistributionData,
    };
  }, [timeFilteredExams]);

  // ─── 2. GENEL DENEMELER VERİLERİ ───────────────────────────────────────────
  const genelStats = useMemo(() => {
    const genelList = sortedExams.filter(
      (e) => e.examType === "Genel" && e.category === genelCategory
    );

    const trendData = genelList.map((e) => {
      const item: Record<string, any> = {
        id: e.id,
        date: format(new Date(e.examDate), "d MMM", { locale: tr }),
        title: e.title,
        totalNet: e.totalNet,
      };
      if (e.details) {
        Object.entries(e.details).forEach(([subj, data]) => {
          if (!subj.startsWith("_")) {
            item[subj] = data.net;
          }
        });
      }
      return item;
    });

    const solvedCount = genelList.length;
    const avgNet = solvedCount > 0
      ? Math.round((genelList.reduce((s, e) => s + e.totalNet, 0) / solvedCount) * 100) / 100
      : 0;
    const maxNet = solvedCount > 0 ? Math.max(...genelList.map((e) => e.totalNet)) : 0;
    const minNet = solvedCount > 0 ? Math.min(...genelList.map((e) => e.totalNet)) : 0;

    // Ders bazlı ortalamalar
    const lessonNetMap = new Map<string, { totalNet: number; count: number; maxNet: number }>();
    genelList.forEach((e) => {
      if (e.details) {
        Object.entries(e.details).forEach(([subj, data]) => {
          if (subj.startsWith("_")) return;
          const curr = lessonNetMap.get(subj) || { totalNet: 0, count: 0, maxNet: 0 };
          lessonNetMap.set(subj, {
            totalNet: curr.totalNet + data.net,
            count: curr.count + 1,
            maxNet: Math.max(curr.maxNet, data.net),
          });
        });
      }
    });

    const lessonAverages = Array.from(lessonNetMap.entries()).map(([subj, val]) => ({
      lesson: subj,
      avgNet: Math.round((val.totalNet / val.count) * 100) / 100,
      maxNet: val.maxNet,
      count: val.count,
    })).sort((a, b) => b.avgNet - a.avgNet);

    return {
      genelList,
      trendData,
      solvedCount,
      avgNet,
      maxNet,
      minNet,
      lessonAverages,
    };
  }, [sortedExams, genelCategory]);

  // ─── 3. BRANŞ DENEMELERİ VERİLERİ ─────────────────────────────────────────
  const bransStats = useMemo(() => {
    const bransList = sortedExams.filter((e) => {
      if (e.examType !== "Branş") return false;
      if (bransLesson !== "all" && e.lesson !== bransLesson) return false;
      return true;
    });

    const trendData = bransList.map((e) => ({
      id: e.id,
      date: format(new Date(e.examDate), "d MMM", { locale: tr }),
      title: e.title,
      net: e.totalNet,
      lesson: e.lesson || "Genel",
      publisher: e.resourceName || "Bilinmiyor",
    }));

    // Yayın bazlı ortalama net kıyaslaması
    const pubMap = new Map<string, { totalNet: number; count: number; maxNet: number }>();
    bransList.forEach((e) => {
      const pub = e.resourceName || "Diğer / Belirtilmedi";
      const curr = pubMap.get(pub) || { totalNet: 0, count: 0, maxNet: 0 };
      pubMap.set(pub, {
        totalNet: curr.totalNet + e.totalNet,
        count: curr.count + 1,
        maxNet: Math.max(curr.maxNet, e.totalNet),
      });
    });

    const publisherComparison = Array.from(pubMap.entries()).map(([pub, val]) => ({
      publisher: pub,
      avgNet: Math.round((val.totalNet / val.count) * 100) / 100,
      maxNet: val.maxNet,
      count: val.count,
    })).sort((a, b) => b.avgNet - a.avgNet);

    const count = bransList.length;
    const avgNet = count > 0 ? Math.round((bransList.reduce((s, e) => s + e.totalNet, 0) / count) * 100) / 100 : 0;
    const maxNet = count > 0 ? Math.max(...bransList.map((e) => e.totalNet)) : 0;

    return {
      bransList,
      trendData,
      publisherComparison,
      count,
      avgNet,
      maxNet,
    };
  }, [sortedExams, bransLesson]);

  // ─── 4. KONU DENEMELERİ VERİLERİ ──────────────────────────────────────────
  const konuStats = useMemo(() => {
    const konuList = sortedExams.filter((e) => {
      if (e.examType !== "Konu") return false;
      if (konuLesson !== "all" && e.lesson !== konuLesson) return false;
      return true;
    });

    // Konu bazlı gruplama
    const topicMap = new Map<string, { topic: string; lesson: string; totalNet: number; count: number; maxNet: number }>();
    konuList.forEach((e) => {
      const topicName = e.topic || "Genel Konular";
      const lessonName = e.lesson || "Genel";
      const key = `${lessonName} - ${topicName}`;

      const curr = topicMap.get(key) || { topic: topicName, lesson: lessonName, totalNet: 0, count: 0, maxNet: 0 };
      topicMap.set(key, {
        topic: topicName,
        lesson: lessonName,
        totalNet: curr.totalNet + e.totalNet,
        count: curr.count + 1,
        maxNet: Math.max(curr.maxNet, e.totalNet),
      });
    });

    const topicComparison = Array.from(topicMap.values()).map((val) => ({
      topic: val.topic,
      lesson: val.lesson,
      avgNet: Math.round((val.totalNet / val.count) * 100) / 100,
      maxNet: val.maxNet,
      count: val.count,
    })).sort((a, b) => b.avgNet - a.avgNet);

    const strongTopics = [...topicComparison].slice(0, 5);
    const weakTopics = [...topicComparison].reverse().slice(0, 5);

    const count = konuList.length;
    const avgNet = count > 0 ? Math.round((konuList.reduce((s, e) => s + e.totalNet, 0) / count) * 100) / 100 : 0;

    return {
      konuList,
      topicComparison,
      strongTopics,
      weakTopics,
      count,
      avgNet,
    };
  }, [sortedExams, konuLesson]);

  return (
    <div className="space-y-6">
      {/* ── ÜST ZAMAN FİLTRESİ VE SAYFA BAŞLIĞI ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2">
            📊 Deneme Analizi ve Performans Kıyaslama
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Denemelerinizi kendi kulvarlarında (Genel, Branş, Konu) ayrı ayrı analiz edin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={timeRangeFilter} onValueChange={(v) => setTimeRangeFilter(v as TimeRangeOption)}>
            <SelectTrigger className="h-8 text-xs w-36">
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

      {/* ── 4 ANA KULVAR SEKMELERİ NAVİGASYONU ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button
          variant={activeTab === "overview" ? "default" : "outline"}
          onClick={() => setActiveTab("overview")}
          className="h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold"
        >
          <span className="flex items-center gap-1.5">
            <PieChartIcon className="h-4 w-4 text-blue-500" />
            Ana Performans
          </span>
          <span className="text-[10px] font-normal opacity-80">{overviewStats.totalCount} Deneme Toplam</span>
        </Button>

        <Button
          variant={activeTab === "genel" ? "default" : "outline"}
          onClick={() => setActiveTab("genel")}
          className="h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold"
        >
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-emerald-500" />
            Genel Denemeler
          </span>
          <span className="text-[10px] font-normal opacity-80">TYT & AYT Analizi</span>
        </Button>

        <Button
          variant={activeTab === "brans" ? "default" : "outline"}
          onClick={() => setActiveTab("brans")}
          className="h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold"
        >
          <span className="flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-purple-500" />
            Branş Denemeleri
          </span>
          <span className="text-[10px] font-normal opacity-80">Ders & Yayın Kıyası</span>
        </Button>

        <Button
          variant={activeTab === "konu" ? "default" : "outline"}
          onClick={() => setActiveTab("konu")}
          className="h-11 flex flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold"
        >
          <span className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-amber-500" />
            Konu Denemeleri
          </span>
          <span className="text-[10px] font-normal opacity-80">Konu Karşılaştırmaları</span>
        </Button>
      </div>

      {/* ── KULVAR 1: ANA PERFORMANS SEKME İÇERİĞİ ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* KPI Kartları */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 border-blue-500/20 bg-blue-500/5">
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5 text-blue-500" />
                Toplam Çözülen Deneme
              </p>
              <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                {overviewStats.totalCount}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {overviewStats.genelCount} Genel · {overviewStats.bransCount} Branş · {overviewStats.konuCount} Konu
              </p>
            </Card>

            <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
                Çözülen Toplam Soru
              </p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                {overviewStats.totalQuestions}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">Sınav Pratiği Hacmi</p>
            </Card>

            <Card className="p-4 border-purple-500/20 bg-purple-500/5">
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                <Award className="h-3.5 w-3.5 text-purple-500" />
                TYT Genel Ort. Net
              </p>
              <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1 tabular-nums">
                {overviewStats.tytAvg} <span className="text-xs text-muted-foreground font-normal">/ 120</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">En Yüksek: {overviewStats.tytMax} Net</p>
            </Card>

            <Card className="p-4 border-amber-500/20 bg-amber-500/5">
              <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                AYT Genel Ort. Net
              </p>
              <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                {overviewStats.aytAvg} <span className="text-xs text-muted-foreground font-normal">/ 80</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">En Yüksek: {overviewStats.aytMax} Net</p>
            </Card>
          </div>

          {/* Tür Bazlı Çözülen Deneme Dağılım Grafiği */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                Deneme Türlerinin Karşılaştırması
              </CardTitle>
              <CardDescription className="text-xs">
                Genel, Branş ve Konu denemelerinin çözülme adedi ve ortalama net performansı
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overviewStats.typeDistributionData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="type" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="count" name="Çözülen Adet" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="right" dataKey="avgNet" name="Ortalama Net" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── KULVAR 2: GENEL DENEMELER SEKME İÇERİĞİ ── */}
      {activeTab === "genel" && (
        <div className="space-y-6">
          {/* TYT / AYT Kategori Seçici */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Button
                variant={genelCategory === "TYT" ? "default" : "outline"}
                size="sm"
                onClick={() => setGenelCategory("TYT")}
                className="h-8 text-xs font-bold rounded-lg px-4"
              >
                📘 TYT Genel Denemeleri (120 Soru)
              </Button>
              <Button
                variant={genelCategory === "AYT" ? "default" : "outline"}
                size="sm"
                onClick={() => setGenelCategory("AYT")}
                className="h-8 text-xs font-bold rounded-lg px-4"
              >
                📕 AYT Genel Denemeleri (80 Soru)
              </Button>
            </div>

            <Badge variant="outline" className="text-xs font-semibold">
              {genelStats.solvedCount} Deneme Kayıtlı
            </Badge>
          </div>

          {/* İstatistik Özet */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3.5 text-center bg-muted/30">
              <span className="text-xs text-muted-foreground font-medium block">Ortalama Net</span>
              <span className="text-2xl font-black text-primary tabular-nums mt-0.5 block">{genelStats.avgNet}</span>
            </Card>
            <Card className="p-3.5 text-center bg-emerald-500/10 border-emerald-500/20">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">Pik (En Yüksek) Net</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">{genelStats.maxNet}</span>
            </Card>
            <Card className="p-3.5 text-center bg-blue-500/10 border-blue-500/20">
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium block">En Düşük Net</span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums mt-0.5 block">{genelStats.minNet}</span>
            </Card>
          </div>

          {/* Zaman İçinde Genel Net Trend Grafiği */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                {genelCategory} Genel Deneme Net Gelişimi
              </CardTitle>
              <CardDescription className="text-xs">
                {genelCategory} denemelerindeki zaman içindeki toplam net değişimi ve ortalama çizgisi
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              {genelStats.trendData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs">
                  Henüz {genelCategory} kategorisinde genel deneme eklenmedi.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={genelStats.trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <defs>
                      <linearGradient id="genelColorNet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, genelCategory === "TYT" ? 120 : 80]} tick={{ fontSize: 11 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <ReferenceLine y={genelStats.avgNet} label={`Ortalama: ${genelStats.avgNet}`} stroke="#3b82f6" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="totalNet" name="Toplam Net" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#genelColorNet)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Ders Bazlı Net Dağılımı Tablosu */}
          {genelStats.lessonAverages.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  {genelCategory} Ders Bazlı Net Performansı
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {genelStats.lessonAverages.map((item) => (
                    <div key={item.lesson} className="p-3 rounded-xl border bg-card/60 space-y-1">
                      <span className="text-xs font-bold text-foreground block truncate">{item.lesson}</span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-black text-primary tabular-nums">{item.avgNet}</span>
                        <span className="text-[11px] text-muted-foreground">Pik: {item.maxNet}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── KULVAR 3: BRANŞ DENEMELERİ SEKME İÇERİĞİ ── */}
      {activeTab === "brans" && (
        <div className="space-y-6">
          {/* Ders Filtresi Seçici */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Ders Seçimi:</span>
              <Select value={bransLesson} onValueChange={setBransLesson}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue placeholder="Ders Seçin" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  <SelectItem value="all">Tüm Branş Denemeleri</SelectItem>
                  {availableLessons.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Badge variant="outline" className="text-xs font-semibold">
              {bransStats.count} Branş Denemesi
            </Badge>
          </div>

          {/* Branş Net Seyri Grafiği */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                {bransLesson === "all" ? "Tüm Derslerin" : bransLesson} Branş Denemeleri Net Gelişimi
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              {bransStats.trendData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs">
                  Seçili filtre için branş denemesi bulunamadı.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bransStats.trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="net" name="Net Score" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Yayın Evi Bazlı Performans Karşılaştırması */}
          {bransStats.publisherComparison.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Layers className="h-4 w-4 text-purple-500" />
                  Yayın Evlerine Göre Branş Denemesi Net Kıyaslaması
                </CardTitle>
                <CardDescription className="text-xs">
                  Hangi yayın evinin branş denemesinde kaç ortalama net yaptığınızı görün
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bransStats.publisherComparison} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="publisher" type="category" tick={{ fontSize: 11 }} width={110} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="avgNet" name="Ortalama Net" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── KULVAR 4: KONU DENEMELERİ SEKME İÇERİĞİ ── */}
      {activeTab === "konu" && (
        <div className="space-y-6">
          {/* Ders Filtresi Seçici */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">Ders Seçimi:</span>
              <Select value={konuLesson} onValueChange={setKonuLesson}>
                <SelectTrigger className="h-8 text-xs w-48">
                  <SelectValue placeholder="Ders Seçin" />
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

            <Badge variant="outline" className="text-xs font-semibold">
              {konuStats.count} Konu Denemesi
            </Badge>
          </div>

          {/* Her Dersin Kendine Özel Konu Karşılaştırma Grafiği */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-500" />
                {konuLesson === "all" ? "Tüm Derslerin" : konuLesson} Konu Karşılaştırmaları
              </CardTitle>
              <CardDescription className="text-xs">
                Konu bazında ortalama net skorlarınızın grafiksel kıyaslaması
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80 pt-4">
              {konuStats.topicComparison.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs">
                  Henüz konu denemesi verisi girilmedi.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={konuStats.topicComparison} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="topic" type="category" tick={{ fontSize: 11 }} width={140} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="avgNet" name="Ortalama Net" radius={[0, 6, 6, 0]}>
                      {konuStats.topicComparison.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.avgNet >= 10 ? "#10b981" : entry.avgNet >= 5 ? "#f59e0b" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Güçlü ve Zayıf Konular Kartları */}
          {konuStats.topicComparison.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Güçlü Konular */}
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    En Yüksek Net Yapılan Konular (Güçlü Yönler)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {konuStats.strongTopics.map((t) => (
                    <div key={t.topic} className="flex justify-between items-center p-2 rounded-lg bg-background/60 border">
                      <div>
                        <span className="font-semibold text-foreground block">{t.topic}</span>
                        <span className="text-[11px] text-muted-foreground">{t.lesson}</span>
                      </div>
                      <Badge variant="outline" className="font-extrabold text-emerald-600 bg-emerald-500/10 border-emerald-500/30">
                        {t.avgNet} Net Ort.
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Zayıf Konular */}
              <Card className="border-rose-500/20 bg-rose-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-4 w-4" />
                    Tekrar Gerektiren Konular (Geliştirilecek Yönler)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {konuStats.weakTopics.map((t) => (
                    <div key={t.topic} className="flex justify-between items-center p-2 rounded-lg bg-background/60 border">
                      <div>
                        <span className="font-semibold text-foreground block">{t.topic}</span>
                        <span className="text-[11px] text-muted-foreground">{t.lesson}</span>
                      </div>
                      <Badge variant="outline" className="font-extrabold text-rose-600 bg-rose-500/10 border-rose-500/30">
                        {t.avgNet} Net Ort.
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
