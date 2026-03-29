import { useState } from "react";
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
import { Filter, Book, FileText, CheckCircle2, XCircle, Trash2, Clock, Pencil } from "lucide-react";
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

function StatusIcon({ status }: { status: string }) {
  if (status === QuestionStatus.DogruCozuldu) return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === QuestionStatus.YanlisHocayaSor) return <XCircle className="w-4 h-4 text-destructive" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
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
    status?: QuestionStatus;
  }>({});

  const { data: questions, isLoading } = useListQuestions(filters as any);
  const { data: options } = useGetFilterOptions();
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

  const activeQuestion = questions?.find((q) => q.id === canvasQuestionId);

  const totalCount = questions?.length ?? 0;
  const solvedCount = questions?.filter((q) => q.status === QuestionStatus.DogruCozuldu).length ?? 0;
  const wrongCount = questions?.filter((q) => q.status === QuestionStatus.YanlisHocayaSor).length ?? 0;
  const solvedPct = totalCount > 0 ? Math.round((solvedCount / totalCount) * 100) : 0;
  const wrongPct = totalCount > 0 ? Math.round((wrongCount / totalCount) * 100) : 0;

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 mt-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Soru Havuzu</h1>
          <p className="text-muted-foreground mt-1">Arşivlediğin tüm sorular ve durumları.</p>
        </div>
        <QuestionFormDialog />
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-5 bg-card/40 border border-border/50 rounded-2xl p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2">
            <span className="text-sm font-medium text-muted-foreground shrink-0">{totalCount} soru</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold">
              <span className="text-green-500 shrink-0">✓ {solvedCount} doğru</span>
              <span className="text-destructive shrink-0">✗ {wrongCount} yanlış</span>
              <span className="text-muted-foreground shrink-0">· {totalCount - solvedCount - wrongCount} çözülmedi</span>
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${solvedPct}%` }} />
            <div className="h-full bg-destructive/70 transition-all duration-500" style={{ width: `${wrongPct}%` }} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 bg-card/40 p-4 rounded-2xl border border-border/50 backdrop-blur-md">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mr-1">
          <Filter className="w-4 h-4" /> Filtreler:
        </div>

        <Select value={filters.category || "ALL"} onValueChange={(v) => setFilters((p) => ({ ...p, category: v === "ALL" ? undefined : (v as QuestionCategory) }))}>
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-40">
            <SelectValue placeholder="Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Kategoriler</SelectItem>
            <SelectItem value="TYT">TYT</SelectItem>
            <SelectItem value="AYT">AYT</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.lesson || "ALL"} onValueChange={(v) => setFilters((p) => ({ ...p, lesson: v === "ALL" ? undefined : v }))}>
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-40">
            <SelectValue placeholder="Ders" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Dersler</SelectItem>
            {options?.lessons?.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filters.status || "ALL"} onValueChange={(v) => setFilters((p) => ({ ...p, status: v === "ALL" ? undefined : (v as QuestionStatus) }))}>
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-44">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Durumlar</SelectItem>
            <SelectItem value={QuestionStatus.Cozulmedi}>Çözülmedi</SelectItem>
            <SelectItem value={QuestionStatus.DogruCozuldu}>Doğru Çözüldü</SelectItem>
            <SelectItem value={QuestionStatus.YanlisHocayaSor}>Yanlış / Hocaya Sor</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.source || "ALL"} onValueChange={(v) => setFilters((p) => ({ ...p, source: v === "ALL" ? undefined : (v as QuestionSource) }))}>
          <SelectTrigger className="bg-background rounded-xl border-border/50 h-9 w-40">
            <SelectValue placeholder="Kaynak" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tüm Kaynaklar</SelectItem>
            <SelectItem value="Deneme">Deneme</SelectItem>
            <SelectItem value="Banka">Soru Bankası</SelectItem>
          </SelectContent>
        </Select>

        {(filters.category || filters.lesson || filters.status || filters.source) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})} className="rounded-xl h-9 text-muted-foreground hover:text-foreground">
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
                  <img src={q.imageUrl} alt={q.topic || "Soru"} className="max-w-full max-h-full object-contain rounded" />
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
        <div className="fixed inset-0 z-50 bg-black/95">
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
