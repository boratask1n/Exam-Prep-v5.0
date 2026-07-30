import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch, useListResources } from "@workspace/api-client-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Plus,
  BarChart2,
  BookOpen,
  Trash2,
  Pencil,
  Layers,
  FileText,
  ListFilter,
  ArrowRight,
  ArrowLeft,
  Library,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PracticeExamFormDialog } from "@/components/practice-exams/PracticeExamFormDialog";
import { AnalysisTabContent, calculateSuccessPercentage } from "@/components/practice-exams/AnalysisTabContent";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  publisher?: string | null;
  resourceId?: number | null;
  resourceName?: string | null;
  examNo?: number | null;
  targetQuestionCount?: number | null;
  examDate: string;
  durationMinutes?: number | null;
  totalNet: number;
  details?: Record<string, SubjectResult> | null;
  notes?: string | null;
}

// ─── Deneme Kartı (Net Girme & İnceleme Odaklı) ───────────────────────────────

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
      "relative group flex flex-col hover:shadow-md transition-all duration-200 border-border/60 justify-between",
      isPending && "border-amber-400/60 bg-amber-500/5 dark:border-amber-500/40"
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {exam.examNo && (
                <Badge variant="outline" className="text-xs py-0 h-5 font-extrabold bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-400/40">
                  Deneme #{exam.examNo}
                </Badge>
              )}
              <CardTitle className="text-base leading-snug truncate font-bold flex items-center gap-1.5">
                {exam.title}
              </CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
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
        <div className="flex flex-wrap gap-1.5 mt-2">
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
            <div className="flex items-end justify-between p-2.5 rounded-xl bg-muted/30 border border-border/40">
              <span className="text-xs text-muted-foreground font-semibold">
                Toplam Net {exam.targetQuestionCount ? `(${exam.targetQuestionCount} Soru)` : ""}
              </span>
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

            {/* Genel deneme: ders bazlı net tablosu */}
            {isGenel && subjectEntries.length > 0 && (
              <>
                <Separator className="opacity-50" />
                <div className="space-y-1">
                  {subjectEntries.map(([lesson, result]) => (
                    <div
                      key={lesson}
                      className="flex justify-between text-xs py-0.5"
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
                        {result.net.toFixed(2)} Net ({result.correct}D / {result.wrong}Y)
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

// ─── Kaynak Odaklı Kütüphane Kartı ──────────────────────────────────────────────

function ResourcePackCard({
  resource,
  exams,
  onOpenDrillDown,
}: {
  resource: { id?: number; name: string; publisher?: string | null; category?: string; lesson?: string | null; resourceType?: string; coverImageUrl?: string | null };
  exams: PracticeExam[];
  onOpenDrillDown: (resource: any) => void;
}) {
  const solvedCount = exams.length;
  const avgNet = solvedCount > 0
    ? (exams.reduce((sum, e) => sum + e.totalNet, 0) / solvedCount).toFixed(2)
    : "0.00";

  const sortedPackExams = [...exams].sort((a, b) => {
    if (a.examNo && b.examNo) return a.examNo - b.examNo;
    return new Date(b.examDate).getTime() - new Date(a.examDate).getTime();
  });

  const latestExam = sortedPackExams[sortedPackExams.length - 1];
  const hasCover = Boolean(resource.coverImageUrl);

  return (
    <Card
      onClick={() => onOpenDrillDown(resource)}
      className="group relative cursor-pointer hover:shadow-xl transition-all duration-200 border-border/60 hover:border-primary/50 overflow-hidden flex flex-col justify-between"
    >
      <div className="flex gap-3.5 p-4 pb-2 items-start">
        {/* Book Cover Thumbnail */}
        <div className="relative shrink-0 w-20 h-28 rounded-lg overflow-hidden border shadow-md bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-pink-500/20 flex flex-col justify-between p-2 group-hover:scale-105 transition-transform">
          {hasCover ? (
            <img
              src={resource.coverImageUrl!}
              alt={resource.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { (e.target as any).style.display = "none"; }}
            />
          ) : (
            <div className="flex flex-col justify-between h-full w-full">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary/80 truncate">
                {resource.publisher || resource.category || "YKS"}
              </span>
              <div className="my-auto text-center">
                <BookOpen className="h-6 w-6 mx-auto text-primary/70 mb-1" />
                <span className="text-[9px] font-bold leading-tight line-clamp-2 text-foreground/90">
                  {resource.lesson || resource.name}
                </span>
              </div>
              <Badge variant="outline" className="text-[9px] px-1 py-0 justify-center bg-background/80 backdrop-blur-sm border-primary/20">
                {resource.category || "TYT"}
              </Badge>
            </div>
          )}
          {/* Subtle book spine overlay effect */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-black/15 shadow-inner" />
        </div>

        {/* Info */}
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px] py-0 px-2 font-semibold bg-primary/10 text-primary border-primary/20">
              {resource.category || "TYT"}
            </Badge>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-medium">
              {resource.resourceType || "Deneme Paketi"}
            </Badge>
          </div>
          <CardTitle className="text-base font-bold leading-snug group-hover:text-primary transition-colors mt-1 line-clamp-2">
            {resource.name}
          </CardTitle>
          {resource.publisher && (
            <CardDescription className="text-xs font-medium text-muted-foreground truncate">
              {resource.publisher} {resource.lesson ? `· ${resource.lesson}` : ""}
            </CardDescription>
          )}
          <div className="pt-1">
            <Badge variant="outline" className="text-[11px] font-extrabold bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-400/30">
              {solvedCount} Deneme Çözüldü
            </Badge>
          </div>
        </div>
      </div>

      <CardContent className="space-y-3 pt-1 pb-4">
        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-muted/40 text-xs">
          <div>
            <span className="text-muted-foreground block text-[11px]">Ortalama Net</span>
            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">
              {avgNet}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Son Çözülen</span>
            <span className="font-semibold text-foreground text-xs truncate block">
              {latestExam?.examNo ? `Deneme #${latestExam.examNo}` : latestExam ? format(new Date(latestExam.examDate), "d MMM", { locale: tr }) : "-"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-primary font-semibold group-hover:translate-x-0.5 transition-transform pt-1">
          <span>Paket Sayfasına Git ({solvedCount} Deneme)</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tam Sayfa Paket Detay Görünümü (Pure Net & Analysis Page View) ──────────

function ResourcePackDetailPage({
  resource,
  exams,
  onBack,
  onEdit,
  onDelete,
  onNewExamForResource,
}: {
  resource: any;
  exams: PracticeExam[];
  onBack: () => void;
  onEdit: (e: PracticeExam) => void;
  onDelete: (id: number) => void;
  onNewExamForResource: () => void;
}) {
  const sortedExams = [...exams].sort((a, b) => {
    if (a.examNo && b.examNo) return a.examNo - b.examNo;
    return new Date(b.examDate).getTime() - new Date(a.examDate).getTime();
  });

  const solvedCount = exams.length;
  const avgNet = solvedCount > 0
    ? (exams.reduce((sum, e) => sum + e.totalNet, 0) / solvedCount).toFixed(2)
    : "0.00";
  const maxNet = solvedCount > 0
    ? Math.max(...exams.map((e) => e.totalNet)).toFixed(2)
    : "0.00";

  const hasCover = Boolean(resource.coverImageUrl);

  return (
    <div className="space-y-6">
      {/* Üst Gezinme Butonu ve Başlık */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-start gap-4">
          {/* Cover Thumbnail in header */}
          <div className="relative shrink-0 w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden border shadow-md bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-pink-500/20 flex flex-col justify-between p-2">
            {hasCover ? (
              <img
                src={resource.coverImageUrl!}
                alt={resource.name}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as any).style.display = "none"; }}
              />
            ) : (
              <div className="flex flex-col justify-between h-full w-full">
                <span className="text-[10px] font-black uppercase tracking-wider text-primary/80 truncate">
                  {resource.publisher || resource.category || "YKS"}
                </span>
                <div className="my-auto text-center">
                  <BookOpen className="h-6 w-6 mx-auto text-primary/70 mb-1" />
                </div>
                <Badge variant="outline" className="text-[9px] px-1 py-0 justify-center bg-background/80 border-primary/20">
                  {resource.category || "TYT"}
                </Badge>
              </div>
            )}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/15" />
          </div>

          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground px-0 h-7 gap-1.5 font-medium -ml-1 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Tüm Kaynaklara Dön</span>
            </Button>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {resource.name}
              </h1>
              <Badge variant="outline" className="text-xs py-0.5 px-2.5 font-bold bg-primary/10 text-primary border-primary/20">
                {resource.category || "TYT"}
              </Badge>
              {resource.resourceType && (
                <Badge variant="secondary" className="text-xs py-0.5 px-2.5 font-medium">
                  {resource.resourceType}
                </Badge>
              )}
            </div>
            {resource.publisher && (
              <p className="text-sm text-muted-foreground font-medium">
                Yayın: <span className="font-bold text-foreground">{resource.publisher}</span>
                {resource.lesson ? ` · Ders: ${resource.lesson}` : ""}
              </p>
            )}
          </div>
        </div>

        <Button onClick={onNewExamForResource} className="font-semibold shadow-sm shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Yeni Deneme Neti Ekle
        </Button>
      </div>

      {/* İstatistik Özet Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground font-medium">Çözülen Deneme Sayısı</p>
          <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
            {solvedCount}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground font-medium">Ortalama Net</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {avgNet}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-muted-foreground font-medium">En Yüksek Net</p>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
            {maxNet}
          </p>
        </Card>
      </div>

      {/* Çözülen Denemeler Net Listesi */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight">
            Çözülen Deneme Sıralaması ({sortedExams.length} Deneme)
          </h3>
        </div>

        {sortedExams.length === 0 ? (
          <div className="text-center p-12 border rounded-2xl bg-muted/15 border-dashed">
            <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/60 mb-2" />
            <h4 className="font-semibold text-sm">Bu pakete henüz deneme eklenmemiş</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Çözdüğünüz deneme net sonuçlarını eklemek için yeni deneme ekleme butonunu kullanın.
            </p>
            <Button onClick={onNewExamForResource} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Deneme Neti Ekle
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sortedExams.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sayfalama Kontrolleri ────────────────────────────────────────────────────
function PaginationControls({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
}: {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between mt-6 pt-4 border-t border-border/50 gap-4">
      <p className="text-xs text-muted-foreground">
        Toplam <span className="font-semibold text-foreground">{totalItems}</span> kayıttan{" "}
        <span className="font-semibold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> -{" "}
        <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span> arası gösteriliyor
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Önceki
        </Button>
        <span className="text-xs font-semibold px-2">
          Sayfa {currentPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Sonraki
          <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── ANA SAYFA BİLEŞENİ ───────────────────────────────────────────────────────
export default function PracticeExams() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [examToEdit, setExamToEdit] = useState<PracticeExam | null>(null);
  const [activeTab, setActiveTab] = useState<string>("genel-denemeler");
  const [viewMode, setViewMode] = useState<"resource" | "list">("resource");

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, viewMode]);

  const [selectedResource, setSelectedResource] = useState<any | null>(null);

  const { data: resources = [] } = useListResources();

  const {
    data: exams = [],
    isLoading,
    refetch,
  } = useQuery<PracticeExam[]>({
    queryKey: ["practice-exams"],
    queryFn: () => customFetch<PracticeExam[]>("/api/practice-exams"),
  });

  const selectedResourceExams = useMemo(() => {
    if (!selectedResource) return [];
    return exams.filter((e) => {
      if (selectedResource.id && e.resourceId === selectedResource.id) return true;
      if (!selectedResource.id && selectedResource.publisher && e.publisher === selectedResource.publisher) return true;
      if (!selectedResource.id && !e.resourceId && !e.publisher) return true;
      return false;
    }).sort((a, b) => {
      if (a.examNo && b.examNo) return a.examNo - b.examNo;
      return new Date(b.examDate).getTime() - new Date(a.examDate).getTime();
    });
  }, [selectedResource, exams]);

  const selectedResourceWithNextExamNo = useMemo(() => {
    if (!selectedResource) return null;
    const maxExamNo = selectedResourceExams.reduce(
      (max, e) => Math.max(max, e.examNo || 0),
      0
    );
    return {
      ...selectedResource,
      nextExamNo: maxExamNo + 1,
    };
  }, [selectedResource, selectedResourceExams]);

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

  const handleOpenResourcePage = (resourceObj: any) => {
    setSelectedResource(resourceObj);
  };

  // ── Kaynak Odaklı Gruplama Fonksiyonu ─────────────────────────────────────

  const groupExamsByResource = (examList: PracticeExam[]) => {
    const map = new Map<string, { resource: any; exams: PracticeExam[] }>();

    examList.forEach((exam) => {
      let key = "standalone";
      let resourceObj: any = {
        name: "Bağımsız Denemeler",
        publisher: "Müstakil Denemeler",
        category: exam.category,
        resourceType: exam.examType === "Genel" ? "Genel Deneme" : "Deneme",
      };

      if (exam.resourceId) {
        const found = resources.find((r) => r.id === exam.resourceId);
        if (found) {
          key = `res_${found.id}`;
          resourceObj = found;
        } else if (exam.publisher) {
          key = `pub_${exam.publisher}`;
          resourceObj = { name: `${exam.publisher} Deneme Seti`, publisher: exam.publisher, category: exam.category };
        }
      } else if (exam.publisher) {
        key = `pub_${exam.publisher}`;
        resourceObj = { name: `${exam.publisher} Deneme Seti`, publisher: exam.publisher, category: exam.category };
      }

      const existing = map.get(key);
      if (existing) {
        existing.exams.push(exam);
      } else {
        map.set(key, { resource: resourceObj, exams: [exam] });
      }
    });

    return Array.from(map.values());
  };

  // ── Filtrelenmiş Gruplar ───────────────────────────────────────────────────

  const sortedExams = [...exams].sort((a, b) => {
    const aPending = Boolean((a.details as any)?._pending);
    const bPending = Boolean((b.details as any)?._pending);
    if (aPending !== bPending) return aPending ? -1 : 1;
    if (a.examNo && b.examNo) return a.examNo - b.examNo;
    return new Date(b.examDate).getTime() - new Date(a.examDate).getTime();
  });

  const searchedExams = sortedExams.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.publisher?.toLowerCase().includes(q) ||
      e.lesson?.toLowerCase().includes(q) ||
      e.topic?.toLowerCase().includes(q) ||
      e.resourceName?.toLowerCase().includes(q)
    );
  });

  const pendingExams = searchedExams.filter((e) => Boolean((e.details as any)?._pending));
  const generalExams = searchedExams.filter((e) => e.examType === "Genel");
  const tytExams = generalExams.filter((e) => e.category === "TYT");
  const aytExams = generalExams.filter((e) => e.category === "AYT");
  const bransExams = searchedExams.filter((e) => e.examType === "Branş");
  const konuExams = searchedExams.filter((e) => e.examType === "Konu");

  const generalResourceGroups = groupExamsByResource(generalExams);
  const bransResourceGroups = groupExamsByResource(bransExams);
  const konuResourceGroups = groupExamsByResource(konuExams);

  const getPaginatedData = <T,>(arr: T[]) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return arr.slice(startIndex, startIndex + itemsPerPage);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Pakete Girilmişse TAM SAYFA Paket Detayı Gösterilir */}
      {selectedResource ? (
        <ResourcePackDetailPage
          resource={selectedResource}
          exams={selectedResourceExams}
          onBack={() => setSelectedResource(null)}
          onEdit={openEditDialog}
          onDelete={handleDelete}
          onNewExamForResource={openNewDialog}
        />
      ) : (
        <>
          {/* Başlık ve Görünüm Değiştirici */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Denemelerim</h1>
              <p className="text-muted-foreground text-sm">
                Genel, branş ve konu denemelerinizin net sonuçlarını girin, gelişim analizinizi takip edin.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center p-1 rounded-xl bg-muted/60 border border-border/50">
                <Button
                  variant={viewMode === "resource" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("resource")}
                  className="h-8 text-xs font-semibold rounded-lg gap-1.5"
                >
                  <Library className="h-3.5 w-3.5" />
                  <span>Kaynak Kütüphanesi</span>
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="h-8 text-xs font-semibold rounded-lg gap-1.5"
                >
                  <ListFilter className="h-3.5 w-3.5" />
                  <span>Tüm Liste</span>
                </Button>
              </div>

              <Button onClick={openNewDialog} className="shrink-0 font-semibold shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Yeni Deneme Neti Ekle
              </Button>
            </div>
          </div>

          {/* Arama Çubuğu */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Deneme adı, yayın evi, ders veya konu ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/60 shadow-sm border-border/50 transition-all focus:bg-background"
            />
          </div>

          {/* Net Sonucu Bekleyen Denemeler Uyarısı */}
          {pendingExams.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/15 overflow-hidden shadow-sm">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold shrink-0 text-sm">
                    ⏳ {pendingExams.length} Deneme
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                      Ders Programınızdan Eklentisi Yapılmış Net Bekleyen Denemeleriniz Var
                    </h4>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      Çözdüğünüz denemenin net sonucunu girmek için ilgili deneme kartındaki <strong>"✍️ Net Gir ve Sonuçlandır"</strong> butonuna tıklayın.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sekmeler */}
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
              </TabsList>
            </div>

            {/* ── 1. GENEL DENEMELER SAYFASI ── */}
            <TabsContent value="genel-denemeler" className="space-y-6 focus-visible:outline-none">
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
                    Genel Deneme Neti Ekle
                  </Button>
                </div>
              ) : viewMode === "resource" ? (
                /* Kaynak Odaklı Kütüphane Görünümü */
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getPaginatedData(generalResourceGroups).map((group, idx) => (
                      <ResourcePackCard
                        key={idx}
                        resource={group.resource}
                        exams={group.exams}
                        onOpenDrillDown={handleOpenResourcePage}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={generalResourceGroups.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </>
              ) : (
                /* Düz Liste Görünümü */
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getPaginatedData(generalExams).map((exam) => (
                      <ExamCard
                        key={exam.id}
                        exam={exam}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={generalExams.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </TabsContent>

            {/* ── 2. BRANŞ DENEMELERİ SAYFASI ── */}
            <TabsContent value="brans-denemeleri" className="space-y-6 focus-visible:outline-none">
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
                    {new Set(bransExams.map((e) => e.lesson).filter(Boolean)).size}
                  </p>
                </Card>
                <Card className="p-3.5">
                  <p className="text-xs text-muted-foreground font-medium">Genel Başarı Yüzdesi</p>
                  <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                    {bransExams.length > 0
                      ? "%" + (bransExams.reduce((a, b) => a + calculateSuccessPercentage(b), 0) / bransExams.length).toFixed(1)
                      : "-"}
                  </p>
                </Card>
              </div>

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
              ) : viewMode === "resource" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getPaginatedData(bransResourceGroups).map((group, idx) => (
                      <ResourcePackCard
                        key={idx}
                        resource={group.resource}
                        exams={group.exams}
                        onOpenDrillDown={handleOpenResourcePage}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={bransResourceGroups.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getPaginatedData(bransExams).map((exam) => (
                      <ExamCard
                        key={exam.id}
                        exam={exam}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={bransExams.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </TabsContent>

            {/* ── 3. KONU DENEMELERİ SAYFASI ── */}
            <TabsContent value="konu-denemeleri" className="space-y-6 focus-visible:outline-none">
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
                  <p className="text-xs text-muted-foreground font-medium">Konu Başarı Oranı (%)</p>
                  <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 tabular-nums">
                    {konuExams.length > 0
                      ? "%" + (konuExams.reduce((a, b) => a + calculateSuccessPercentage(b), 0) / konuExams.length).toFixed(1)
                      : "-"}
                  </p>
                </Card>
              </div>

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
                    Belirli bir konuya özel uyguladığınız konu tarama testlerinizi kaydedin.
                  </p>
                  <Button onClick={openNewDialog} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1.5" />
                    Konu Denemesi Ekle
                  </Button>
                </div>
              ) : viewMode === "resource" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getPaginatedData(konuResourceGroups).map((group, idx) => (
                      <ResourcePackCard
                        key={idx}
                        resource={group.resource}
                        exams={group.exams}
                        onOpenDrillDown={handleOpenResourcePage}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={konuResourceGroups.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {getPaginatedData(konuExams).map((exam) => (
                      <ExamCard
                        key={exam.id}
                        exam={exam}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={konuExams.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <PracticeExamFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        examToEdit={examToEdit}
        initialResource={selectedResourceWithNextExamNo}
      />
    </div>
  );
}
