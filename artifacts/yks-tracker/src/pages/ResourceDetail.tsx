import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  NotebookPen,
  Youtube,
  FolderKanban,
  Library,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useListResources,
  useListQuestions,
  useDeleteQuestion,
  useUpdateQuestion,
  useDeleteResource,
  Question,
  QuestionStatus,
  QuestionSource,
  QuestionCategory,
} from "@workspace/api-client-react";
import { ResourceDialog } from "@/components/resources/ResourceDialog";
import { QuestionFormDialog } from "@/components/QuestionFormDialog";
import { PracticeExamFormDialog } from "@/components/practice-exams/PracticeExamFormDialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatVideoTimestampRange, getYoutubeWatchUrl } from "@/lib/youtubeEmbed";

export default function ResourceDetail() {
  const [, params] = useRoute("/resources/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const resourceId = params?.id ? Number.parseInt(params.id, 10) : null;

  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [addExamOpen, setAddExamOpen] = useState(false);

  const [deleteResourceDialogOpen, setDeleteResourceDialogOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null);
  const [questionToEdit, setQuestionToEdit] = useState<Question | null>(null);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);

  // Fetch resource list to find current resource with stats
  const { data: resources = [], isLoading: isLoadingResource } = useListResources();
  const resource = useMemo(() => {
    return resources.find((r) => r.id === resourceId) || null;
  }, [resources, resourceId]);

  const defaultValuesForResource = useMemo(() => {
    if (!resource) return undefined;
    return {
      resourceId: resource.id,
      publisher: resource.publisher || undefined,
      category: (resource.category as QuestionCategory) || QuestionCategory.TYT,
      lesson: resource.lesson || undefined,
      topic: resource.topic || undefined,
      testName: resource.name || undefined,
      source: resource.resourceType === "Deneme" || resource.resourceType === "Branş Denemesi" || resource.resourceType === "Genel Deneme" ? QuestionSource.Deneme : QuestionSource.Banka,
    };
  }, [resource]);

  // Fetch questions for this resource
  const { data: questionsResponse, isLoading: isLoadingQuestions } = useListQuestions(
    {
      resourceId: resourceId ?? undefined,
      limit: 100,
    },
    {
      query: {
        enabled: !!resourceId,
        staleTime: 60 * 1000,
      } as any,
    }
  );

  const questions = useMemo(() => {
    if (!questionsResponse) return [];
    if (Array.isArray(questionsResponse)) return questionsResponse;
    return (questionsResponse as any).items || (questionsResponse as any).questions || [];
  }, [questionsResponse]);

  const deleteQuestionMutation = useDeleteQuestion();
  const updateQuestionMutation = useUpdateQuestion();
  const deleteResourceMutation = useDeleteResource();

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q: Question) => {
      if (selectedTopicFilter !== "all" && q.topic !== selectedTopicFilter) {
        return false;
      }
      if (statusFilter !== "all" && q.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const term = search.toLowerCase();
        const topicMatch = q.topic?.toLowerCase().includes(term);
        const descMatch = q.description?.toLowerCase().includes(term);
        const publisherMatch = q.publisher?.toLowerCase().includes(term);
        if (!topicMatch && !descMatch && !publisherMatch) return false;
      }
      return true;
    });
  }, [questions, selectedTopicFilter, statusFilter, search]);

  const handleDeleteResource = async () => {
    if (!resourceId) return;
    try {
      await deleteResourceMutation.mutateAsync({ id: resourceId });
      toast({ title: "Silindi", description: "Kaynak başarıyla silindi." });
      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      setLocation("/resources");
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err?.message || "Kaynak silinirken bir sorun oluştu.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteQuestionConfirm = async () => {
    if (!questionToDelete) return;
    try {
      await deleteQuestionMutation.mutateAsync({ id: questionToDelete.id });
      toast({ title: "Soru Silindi" });
      await queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err?.message || "Soru silinemedi.",
        variant: "destructive",
      });
    } finally {
      setQuestionToDelete(null);
    }
  };

  const handleStatusChange = async (q: Question, newStatus: QuestionStatus) => {
    try {
      await updateQuestionMutation.mutateAsync({
        id: q.id,
        data: { status: newStatus },
      });
      toast({ title: "Soru Durumu Güncellendi" });
      await queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    } catch {
      toast({ title: "Hata", description: "Durum güncellenemedi.", variant: "destructive" });
    }
  };

  if (isLoadingResource) {
    return (
      <PageShell>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </PageShell>
    );
  }

  if (!resource && !isLoadingResource) {
    return (
      <PageShell>
        <div className="space-y-4 text-center py-12">
          <h2 className="text-xl font-bold">Kaynak Bulunamadı</h2>
          <p className="text-sm text-muted-foreground">Aradığınız kaynak mevcut değil veya silinmiş olabilir.</p>
          <Button onClick={() => setLocation("/resources")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Kaynaklara Dön
          </Button>
        </div>
      </PageShell>
    );
  }

  const topicStats = resource?.topicStats || [];
  const solved = resource?.solvedQuestions || 0;
  const correct = resource?.correctQuestions || 0;
  const totalInPool = resource?.totalQuestions || 0;
  const accuracy = solved > 0 ? Math.round((correct / solved) * 100) : 0;

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
          <div className="flex items-start gap-3.5">
            {/* Book Cover Thumbnail */}
            <div className="relative shrink-0 w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden border shadow-md bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-pink-500/20 flex flex-col justify-between p-2">
              {(resource as any)?.coverImageUrl ? (
                <img
                  src={(resource as any).coverImageUrl}
                  alt={resource?.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as any).style.display = "none"; }}
                />
              ) : (
                <div className="flex flex-col justify-between h-full w-full">
                  <span className="text-[9px] font-black uppercase tracking-wider text-primary/80 truncate">
                    {resource?.publisher || resource?.category}
                  </span>
                  <BookOpen className="h-6 w-6 mx-auto text-primary/70 my-auto" />
                  <Badge variant="outline" className="text-[9px] px-1 py-0 justify-center bg-background/80 border-primary/20">
                    {resource?.category}
                  </Badge>
                </div>
              )}
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-black/15" />
            </div>

            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/resources")}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground pl-0 -ml-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Kaynaklar Listesine Dön
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{resource?.name}</h1>
                <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
                  {resource?.resourceType}
                </Badge>
                <Badge variant="secondary">{resource?.category}</Badge>
                {resource?.lesson && <Badge variant="outline">{resource.lesson}</Badge>}
                {(resource as any)?.topic && (
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    {(resource as any).topic}
                  </Badge>
                )}
              </div>

              {resource?.publisher && (
                <p className="text-xs text-muted-foreground">Yayın Evi: <strong>{resource.publisher}</strong></p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditDialogOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Pencil className="h-3.5 w-3.5" /> Düzenle
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteResourceDialogOpen(true)}
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Sil
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddExamOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Deneme Neti Ekle
            </Button>
            <Button onClick={() => setAddQuestionOpen(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Bu Kaynağa Soru Ekle
            </Button>
          </div>
        </div>

        {/* Resource Stats Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <Card className="p-3 bg-card shadow-sm border">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <FolderKanban className="h-4 w-4 text-primary" />
              <span>Havuzdaki Sorular</span>
            </div>
            <p className="text-xl font-bold mt-1">{totalInPool} <span className="text-xs font-normal text-muted-foreground">soru</span></p>
          </Card>

          <Card className="p-3 bg-card shadow-sm border">
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>Doğru Cevaplanan</span>
            </div>
            <p className="text-xl font-bold mt-1 text-emerald-600">{correct} <span className="text-xs font-normal text-muted-foreground">soru</span></p>
          </Card>

          <Card className="p-3 bg-card shadow-sm border">
            <div className="flex items-center gap-2 text-amber-600 text-xs font-medium">
              <XCircle className="h-4 w-4" />
              <span>Yanlış / Hocaya Sor</span>
            </div>
            <p className="text-xl font-bold mt-1 text-amber-600">{resource?.wrongQuestions || 0} <span className="text-xs font-normal text-muted-foreground">soru</span></p>
          </Card>

          <Card className="p-3 bg-card shadow-sm border">
            <div className="flex items-center gap-2 text-primary text-xs font-medium">
              <Clock className="h-4 w-4" />
              <span>Başarı Oranı</span>
            </div>
            <p className="text-xl font-bold mt-1">%{accuracy}</p>
          </Card>

          <Card className="p-3 bg-card shadow-sm border col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <NotebookPen className="h-4 w-4 text-indigo-500" />
              <span>Toplam Notlar</span>
            </div>
            <p className="text-xl font-bold mt-1">{resource?.totalNotes || 0} <span className="text-xs font-normal text-muted-foreground">not</span></p>
          </Card>
        </div>

        {/* Topic Breakdown Pills */}
        {topicStats.length > 0 && (
          <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              Eklenen Konular ({topicStats.length})
            </h3>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant={selectedTopicFilter === "all" ? "default" : "outline"}
                size="sm"
                className="text-xs h-7 rounded-lg"
                onClick={() => setSelectedTopicFilter("all")}
              >
                Tüm Konular ({questions.length})
              </Button>
              {topicStats.map((t) => (
                <Button
                  key={t.topic}
                  variant={selectedTopicFilter === t.topic ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 rounded-lg gap-1.5"
                  onClick={() => setSelectedTopicFilter(t.topic)}
                >
                  <span>{t.topic}</span>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                    {t.total}
                  </Badge>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Filters & Search for Questions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-xl border">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sorularda ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="Durum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Durumlar</SelectItem>
                <SelectItem value={QuestionStatus.Cozulmedi}>Beklemede</SelectItem>
                <SelectItem value={QuestionStatus.DogruCozuldu}>Doğru</SelectItem>
                <SelectItem value={QuestionStatus.YanlisHocayaSor}>Yanlış</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={() => setAddQuestionOpen(true)} size="sm" className="h-9 gap-1.5 text-xs">
              <Plus className="h-4 w-4" /> Soru Ekle
            </Button>
          </div>
        </div>

        {/* Questions Grid */}
        {isLoadingQuestions ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-64 rounded-xl border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filteredQuestions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredQuestions.map((q: Question) => {
              const youtubeWatchUrl = getYoutubeWatchUrl(
                q.solutionYoutubeUrl || q.solutionUrl,
                q.solutionYoutubeStartSecond
              );
              const formattedVideoTime = formatVideoTimestampRange(
                q.solutionYoutubeStartSecond,
                q.solutionYoutubeEndSecond
              );

              return (
                <Card key={q.id} className="relative flex flex-col justify-between overflow-hidden transition-all hover:shadow-md border">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[11px] font-normal">
                          {q.lesson}
                        </Badge>
                        {q.topic && (
                          <Badge variant="outline" className="text-[11px] font-normal border-primary/30 text-primary">
                            {q.topic}
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant={
                          q.status === QuestionStatus.DogruCozuldu
                            ? "default"
                            : q.status === QuestionStatus.YanlisHocayaSor
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[11px]"
                      >
                        {q.status === QuestionStatus.DogruCozuldu
                          ? "Doğru"
                          : q.status === QuestionStatus.YanlisHocayaSor
                          ? "Yanlış"
                          : "Beklemede"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 px-4 pb-3 pt-1 flex-1 flex flex-col justify-between">
                    {/* Image Preview */}
                    {q.imageUrl ? (
                      <div
                        onClick={() => setImageModalUrl(q.imageUrl || null)}
                        className="relative h-48 w-full rounded-lg border bg-muted/30 overflow-hidden cursor-pointer group flex justify-center items-center"
                      >
                        <img
                          src={q.imageUrl}
                          alt="Soru Görseli"
                          className="max-h-full object-contain transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                          Büyütmek İçin Tıkla
                        </div>
                      </div>
                    ) : (
                      <div className="h-28 w-full rounded-lg border border-dashed bg-muted/20 flex items-center justify-center text-xs text-muted-foreground italic">
                        Görsel eklenmemiş
                      </div>
                    )}

                    {/* Choice & Solution Video Info */}
                    <div className="space-y-2 text-xs pt-1">
                      {q.choice && (
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-md">
                          <span>Doğru Şık:</span>
                          <Badge variant="default" className="bg-emerald-600 text-white font-bold h-5 px-1.5 text-xs">
                            {q.choice}
                          </Badge>
                        </div>
                      )}

                      {youtubeWatchUrl && (
                        <a
                          href={youtubeWatchUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-2 rounded-md border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-100 transition-colors"
                        >
                          <div className="flex items-center gap-1.5 font-medium">
                            <Youtube className="h-4 w-4 text-red-600 shrink-0" />
                            <span>Çözüm Videosu İzle</span>
                          </div>
                          {formattedVideoTime && (
                            <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-mono">
                              {formattedVideoTime}
                            </span>
                          )}
                        </a>
                      )}

                      {q.description && (
                        <p className="text-muted-foreground line-clamp-2 italic bg-muted/30 p-2 rounded-md">
                          "{q.description}"
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between border-t pt-2 mt-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant={q.status === QuestionStatus.DogruCozuldu ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => handleStatusChange(q, QuestionStatus.DogruCozuldu)}
                        >
                          Doğru
                        </Button>
                        <Button
                          variant={q.status === QuestionStatus.YanlisHocayaSor ? "destructive" : "outline"}
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => handleStatusChange(q, QuestionStatus.YanlisHocayaSor)}
                        >
                          Yanlış
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setQuestionToEdit(q)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setQuestionToDelete(q)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center">
            <Library className="h-8 w-8 text-muted-foreground mb-2" />
            <h3 className="text-base font-semibold">Bu Kaynağa Henüz Soru Eklenmemiş</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              Bu kaynağa soru ekleyerek konu bazlı istatistiklerinizi takip edin.
            </p>
            <Button onClick={() => setAddQuestionOpen(true)} className="mt-4 gap-2 text-xs" size="sm">
              <Plus className="h-4 w-4" />
              İlk Soruyu Ekle
            </Button>
          </div>
        )}
      </div>

      {/* Edit Resource Dialog */}
      {resource && (
        <ResourceDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          resourceForEdit={resource}
        />
      )}

      {/* Add / Edit Question Dialog */}
      <QuestionFormDialog
        open={addQuestionOpen || !!questionToEdit}
        onOpenChange={(open) => {
          if (!open) {
            setAddQuestionOpen(false);
            setQuestionToEdit(null);
          }
        }}
        question={questionToEdit || undefined}
        defaultValues={defaultValuesForResource}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
        }}
      />

      {/* Delete Resource Confirmation */}
      <AlertDialog open={deleteResourceDialogOpen} onOpenChange={setDeleteResourceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kaynağı Silmek İstediğinize Emin Misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kaynak silindiğinde ilişkilendirilmiş sorular korunacak ancak kaynak bağlantısı kaldırılacaktır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteResource} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Question Confirmation */}
      <AlertDialog open={!!questionToDelete} onOpenChange={(open) => !open && setQuestionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soruyu Silmek İstediğinize Emin Misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteQuestionConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Practice Exam Form Dialog */}
      <PracticeExamFormDialog
        open={addExamOpen}
        onOpenChange={setAddExamOpen}
        initialResource={resource}
      />

      {/* Image Zoom Modal */}
      {imageModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setImageModalUrl(null)}
        >
          <img
            src={imageModalUrl}
            alt="Büyük Görsel"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </PageShell>
  );
}
