import { useState, useEffect, useRef } from "react";
import {
  useListQuestions,
  useGetFilterOptions,
  useDeleteQuestion,
  useGetDrawing,
  QuestionCategory,
  QuestionSource,
  QuestionStatus,
} from "@workspace/api-client-react";
import { QuestionFormDialog } from "@/components/QuestionFormDialog";
import { DrawingCanvas } from "@/components/canvas/DrawingCanvas";
import { Badge } from "@/components/ui/badge";
import { Filter, Book, FileText, CheckCircle2, XCircle, Trash2, Clock, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";

function StatusIcon({ status }: { status: string }) {
  if (status === QuestionStatus.DogruCozuldu) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === QuestionStatus.YanlisHocayaSor) return <XCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

// Lazy loading image component
function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "50px" }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className="w-full h-full flex items-center justify-center">
      {isVisible ? (
        <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded" loading="lazy" />
      ) : (
        <div className="animate-pulse bg-muted/30 w-full h-full rounded" />
      )}
    </div>
  );
}

function CanvasModal({ questionId, imageUrl, onClose }: { questionId: number; imageUrl?: string | null; onClose: () => void }) {
  const { data, isLoading } = useGetDrawing(questionId);
  if (isLoading) return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-b-2 border-white rounded-full" />
    </div>
  );
  return <DrawingCanvas questionId={questionId} imageUrl={imageUrl} initialData={data?.canvasData} onClose={onClose} />;
}

export default function Pool() {
  const [filters, setFilters] = useState<{
    category?: QuestionCategory;
    source?: QuestionSource;
    lesson?: string;
    topic?: string;
    status?: QuestionStatus;
  }>({});
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const offset = (page - 1) * limit;
  const { data: response, isLoading } = useListQuestions({ ...filters, offset, limit } as any);
  const questions: any[] = (response as any)?.items || [];
  const pagination = (response as any)?.pagination;
  const { data: options } = useGetFilterOptions();
  
  // Get available lessons based on selected category
  const availableLessons = filters.category ? getLessonsForCategory(filters.category).map(l => l.name) : (options?.lessons || []);
  
  // Get available topics based on selected category and lesson
  const availableTopics = (filters.category && filters.lesson) 
    ? getTopicsForLesson(filters.category, filters.lesson)
    : (options?.topics || []);
  const [canvasQuestionId, setCanvasQuestionId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const deleteMutation = useDeleteQuestion();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const confirmDeleteQuestion = async () => {
    if (deleteTargetId == null) return;
    const id = deleteTargetId;
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
    toast({ title: "Soru silindi" });
    setDeleteTargetId(null);
  };

  const activeQuestion = questions?.find((q: any) => q.id === canvasQuestionId);

  const visibleCount = questions?.length ?? 0;
  const totalCount = pagination?.total ?? visibleCount;
  const solvedCount = questions?.filter((q: any) => q.status === QuestionStatus.DogruCozuldu).length ?? 0;
  const wrongCount = questions?.filter((q: any) => q.status === QuestionStatus.YanlisHocayaSor).length ?? 0;
  const solvedPct = visibleCount > 0 ? Math.round((solvedCount / visibleCount) * 100) : 0;
  const wrongPct = visibleCount > 0 ? Math.round((wrongCount / visibleCount) * 100) : 0;

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 mt-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Soru Havuzu</h1>
          <p className="text-muted-foreground mt-1">Arşivlediğin tüm sorular ve durumları.</p>
        </div>
        <QuestionFormDialog />
      </div>

      {/* Progress bar - always visible */}
      <div className="mb-5 bg-card/40 border border-border/50 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2">
          <span className="text-sm font-medium text-muted-foreground shrink-0">
            {visibleCount || 0} gorunen soru
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
            <span className="text-green-500 shrink-0">✓ {solvedCount || 0} doğru</span>
            <span className="text-destructive shrink-0">✗ {wrongCount || 0} yanlış</span>
            <span className="text-muted-foreground shrink-0">· {(visibleCount || 0) - (solvedCount || 0) - (wrongCount || 0)} çözülmedi</span>
          </div>
        </div>
        {totalCount !== visibleCount && (
          <p className="text-xs text-muted-foreground mb-2">
            Ozet yalnizca bu sayfayi gosterir. Filtre toplam: {totalCount} soru.
          </p>
        )}
        <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden flex">
          <div 
            className="h-full bg-green-500 transition-all duration-500" 
            style={{ width: `${solvedPct}%` }} 
          />
          <div 
            className="h-full bg-destructive/70 transition-all duration-500" 
            style={{ width: `${wrongPct}%` }} 
          />
        </div>
        {totalCount === 0 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Veri görmek için bu başlık altına soru yükleyin
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 bg-card/40 p-4 rounded-2xl border border-border/50 backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-1">
          <Filter className="w-4 h-4" /> Filtreler:
        </div>

        <Select value={filters.category || "ALL"} onValueChange={(v) => { 
          setPage(1); 
          const newCategory = v === "ALL" ? undefined : (v as QuestionCategory);
          // If Geometri is selected, auto-set lesson to Geometri
          if (newCategory === QuestionCategory.Geometri) {
            setFilters((p) => ({ ...p, category: newCategory, lesson: "Geometri", topic: undefined }));
          } else {
            setFilters((p) => ({ ...p, category: newCategory, lesson: undefined, topic: undefined }));
          }
        }}>
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-40">
            <SelectValue placeholder="Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Kategoriler</SelectItem>
            <SelectItem value="TYT">TYT</SelectItem>
            <SelectItem value="AYT">AYT</SelectItem>
            <SelectItem value="Geometri">Geometri</SelectItem>
          </SelectContent>
        </Select>

        <Select 
          value={filters.lesson || "ALL"} 
          onValueChange={(v) => { setPage(1); setFilters((p) => ({ ...p, lesson: v === "ALL" ? undefined : v, topic: undefined })); }}
          disabled={filters.category === "Geometri"}
        >
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-40">
            <SelectValue placeholder={filters.category === "Geometri" ? "Geometri" : "Ders"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Dersler</SelectItem>
            {availableLessons.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        {availableTopics.length > 0 && (
          <Select 
            value={filters.topic || "ALL"} 
            onValueChange={(v) => { setPage(1); setFilters((p) => ({ ...p, topic: v === "ALL" ? undefined : v })); }}
            disabled={!filters.lesson}
          >
            <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-44">
              <SelectValue placeholder={filters.lesson ? "Konu" : "Önce ders seçin"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tüm Konular</SelectItem>
              {availableTopics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select 
          value={filters.source || "ALL"} 
          onValueChange={(v) => { setPage(1); setFilters((p) => ({ ...p, source: v === "ALL" ? undefined : (v as QuestionSource) })); }}
        >
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-40">
            <SelectValue placeholder="Kaynak" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Kaynaklar</SelectItem>
            <SelectItem value="Deneme">Deneme</SelectItem>
            <SelectItem value="Banka">Soru Bankası</SelectItem>
            <SelectItem value="Fasikül">Fasikül</SelectItem>
          </SelectContent>
        </Select>

        {/* Durum filtreleri - açık liste şeklinde */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Durum:</span>
          {[
            { value: "ALL", label: "Tümü", icon: Filter },
            { value: QuestionStatus.Cozulmedi, label: "Beklemede", icon: Clock, color: "text-amber-500" },
            { value: QuestionStatus.DogruCozuldu, label: "Doğru", icon: CheckCircle2, color: "text-green-500" },
            { value: QuestionStatus.YanlisHocayaSor, label: "Yanlış", icon: XCircle, color: "text-destructive" },
          ].map((statusOption) => {
            const Icon = statusOption.icon;
            const isActive = filters.status === statusOption.value || (statusOption.value === "ALL" && !filters.status);
            return (
              <button
                key={statusOption.value}
                type="button"
                onClick={() => { setPage(1); setFilters((p) => ({ ...p, status: statusOption.value === "ALL" ? undefined : (statusOption.value as QuestionStatus) })); }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", !isActive && statusOption.color)} />
                {statusOption.label}
              </button>
            );
          })}
        </div>

        {(filters.category || filters.lesson || filters.topic || filters.status || filters.source) && (
          <Button variant="ghost" size="sm" onClick={() => { setPage(1); setFilters({}); }} className="rounded-xl h-9 text-muted-foreground hover:text-foreground">
            Temizle
          </Button>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      ) : !questions?.length ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-80">
          <img src={`${import.meta.env.BASE_URL}images/empty-state.png`} alt="Boş" className="w-56 h-56 object-contain opacity-50 drop-shadow-2xl mb-6" />
          <h3 className="text-xl font-display font-medium text-foreground">Buralar Çok Sessiz</h3>
          <p className="text-muted-foreground mt-2 max-w-sm text-center">Filtrelere uygun soru bulunamadı. Yeni soru ekleyerek havuzunu genişlet!</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-20">
            {questions.map((q) => (
              <div
                key={q.id}
                onClick={() => setCanvasQuestionId(q.id)}
                className="group relative bg-card rounded-2xl overflow-hidden border border-border/40 hover:border-primary/50 shadow-sm hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 cursor-pointer flex flex-col"
              >
                {/* Image area */}
                <div className="relative h-40 bg-muted/20 border-b border-border/40 overflow-hidden flex items-center justify-center p-3">
                  {q.imageUrl ? (
                    <LazyImage src={q.imageUrl} alt={q.topic || "Soru"} />
                  ) : (
                    <div className="text-muted-foreground/30 font-display font-medium text-base">Görsel Yok</div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <Badge variant="secondary" className="bg-background/80 backdrop-blur text-xs px-2 py-0.5 shadow-sm rounded-lg border-border/50">
                      {q.category}
                    </Badge>
                    {q.hasDrawing && (
                      <Badge className="bg-primary/90 text-white backdrop-blur text-[10px] px-1.5 py-0 shadow-sm rounded-lg">Çizim</Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <QuestionFormDialog
                      question={q as any}
                      trigger={
                        <button className="p-1.5 bg-primary/90 text-white rounded-lg backdrop-blur shadow-sm hover:bg-primary transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      }
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTargetId(q.id);
                      }}
                      className="p-1.5 bg-destructive/90 text-white rounded-lg backdrop-blur shadow-sm hover:bg-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-start justify-between mb-1.5">
                    <h3 className="font-semibold text-foreground line-clamp-1">{q.lesson}</h3>
                    <StatusIcon status={q.status} />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1 mb-1">{q.topic || "Konu belirtilmedi"}</p>
                  {(q as any).description && (
                    <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-2 italic">{(q as any).description}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground/70 pt-3 border-t border-border/30 mt-auto">
                    <span className="flex items-center gap-1"><Book className="w-3 h-3" /> {q.publisher || "—"}</span>
                    <span className={cn(
                      "flex items-center gap-1 font-medium",
                      q.choice ? "text-primary/80" : ""
                    )}>
                      {q.choice ? `Şık: ${q.choice}` : <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{q.source}</span>}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.total > limit && (
            <div className="flex items-center justify-center gap-2 mt-6 mb-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-xl"
              >
                <ChevronLeft className="w-4 h-4" /> Önceki
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Sayfa {page} / {Math.ceil(pagination.total / limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={!pagination.hasMore}
                className="rounded-xl"
              >
                Sonraki <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent className="rounded-2xl border-border/60 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Soruyu sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu soru kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl mt-0 border-border/60">Vazgeç</AlertDialogCancel>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={deleteMutation.isPending}
              onClick={() => void confirmDeleteQuestion()}
            >
              {deleteMutation.isPending ? "Siliniyor…" : "Sil"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Canvas Modal — fixed overlay (avoids Dialog X button and w-screen overflow) */}
      {canvasQuestionId && activeQuestion && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
          <CanvasModal
            questionId={activeQuestion.id}
            imageUrl={activeQuestion.imageUrl}
            onClose={() => setCanvasQuestionId(null)}
          />
        </div>
      )}
    </div>
  );
}

