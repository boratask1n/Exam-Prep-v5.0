import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  Trash2,
  FolderKanban,
  NotebookPen,
  CheckCircle2,
  XCircle,
  BarChart2,
  Library,
  ChevronDown,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
  useDeleteResource,
  ResourceWithStats,
} from "@workspace/api-client-react";
import { ResourceDialog } from "@/components/resources/ResourceDialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getLessonsForCategory } from "@/lib/lessonTopics";
import { RESOURCE_TYPES } from "@/lib/resourceConfig";



export default function Resources() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [lessonFilter, setLessonFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [resourceForEdit, setResourceForEdit] = useState<ResourceWithStats | null>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const { data: resources = [], isLoading } = useListResources(
    {
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      resourceType: typeFilter !== "all" ? typeFilter : undefined,
      lesson: lessonFilter !== "all" ? lessonFilter : undefined,
    },
    {
      query: {
        staleTime: 60 * 1000,
      } as any,
    }
  );

  const deleteMutation = useDeleteResource();

  const availableLessons = useMemo(() => {
    if (categoryFilter !== "all") {
      return getLessonsForCategory(categoryFilter).map((l) => l.name);
    }
    return [
      ...getLessonsForCategory("TYT").map((l) => l.name),
      ...getLessonsForCategory("AYT").map((l) => l.name),
      ...getLessonsForCategory("Geometri").map((l) => l.name),
    ].filter((v, i, a) => a.indexOf(v) === i);
  }, [categoryFilter]);

  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(term) ||
        (r.publisher && r.publisher.toLowerCase().includes(term)) ||
        (r.lesson && r.lesson.toLowerCase().includes(term))
      );
    });
  }, [resources, search]);

  const handleEdit = (resource: ResourceWithStats) => {
    setResourceForEdit(resource);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setResourceForEdit(null);
    setDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteId) return;
    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast({ title: "Silindi", description: "Kaynak başarıyla silindi." });
      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err?.message || "Kaynak silinirken bir sorun oluştu.",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Header section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Library className="h-6 w-6 text-primary" />
              Kaynak Yönetim Merkezi
            </h1>
            <p className="text-sm text-muted-foreground">
              Soru bankalarınız, denemeleriniz ve fasiküllerinizi düzenleyin; ilerlemenizi takip edin.
            </p>
          </div>
          <Button onClick={handleCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Yeni Kaynak Ekle
          </Button>
        </div>

        {/* Filters bar */}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Kaynak adı veya yayın evi ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Kategori Filtresi */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Kategoriler</SelectItem>
                <SelectItem value="TYT">TYT</SelectItem>
                <SelectItem value="AYT">AYT</SelectItem>
                <SelectItem value="Geometri">Geometri</SelectItem>
              </SelectContent>
            </Select>

            {/* Tür Filtresi */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Kaynak Türü" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {RESOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Ders Filtresi */}
            <Select value={lessonFilter} onValueChange={setLessonFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Ders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Dersler</SelectItem>
                {availableLessons.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Resource Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filteredResources.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResources.map((resource) => {
              const target = resource.targetQuestionCount || 0;
              const solved = resource.solvedQuestions || 0;
              const totalInPool = resource.totalQuestions || 0;

              // Compute progress percentage
              const baseTarget = target > 0 ? target : totalInPool > 0 ? totalInPool : 0;
              const progressPercent =
                baseTarget > 0 ? Math.min(100, Math.round((solved / baseTarget) * 100)) : 0;

              return (
                <Card key={resource.id} className="relative flex flex-col justify-between overflow-hidden transition-all hover:shadow-md border">
                  <CardHeader
                    className="pb-3 cursor-pointer hover:bg-muted/20 transition-colors"
                    onClick={() => setLocation(`/resources/${resource.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <CardTitle className="text-base font-semibold leading-tight line-clamp-1 hover:text-primary transition-colors">
                          {resource.name}
                        </CardTitle>
                        {resource.publisher && (
                          <CardDescription className="text-xs font-medium text-muted-foreground">
                            {resource.publisher}
                          </CardDescription>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 font-normal">
                        {resource.resourceType}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-2">
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {resource.category}
                      </Badge>
                      {resource.lesson && (
                        <Badge variant="secondary" className="text-[11px] font-normal bg-primary/10 text-primary">
                          {resource.lesson}
                        </Badge>
                      )}
                      {(resource as any).topic && (
                        <Badge variant="outline" className="text-[11px] font-normal border-primary/30 text-primary">
                          {(resource as any).topic}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0">
                    {/* Quick Stats Grid */}
                    <div
                      className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2.5 text-center text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setLocation(`/resources/${resource.id}`)}
                    >
                      <div>
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <FolderKanban className="h-3 w-3" />
                          <span>Havuz</span>
                        </div>
                        <span className="font-semibold">{totalInPool} soru</span>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 text-emerald-600 mb-0.5">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Doğru</span>
                        </div>
                        <span className="font-semibold text-emerald-600">{resource.correctQuestions}</span>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 text-amber-600 mb-0.5">
                          <NotebookPen className="h-3 w-3" />
                          <span>Notlar</span>
                        </div>
                        <span className="font-semibold">{resource.totalNotes} not</span>
                      </div>
                    </div>

                    {/* Topic Breakdown Section */}
                    {(() => {
                      const topicStats = resource.topicStats || [];
                      const isExpanded = !!expandedIds[resource.id];
                      return (
                        <div className="space-y-2 border-t pt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            className="w-full justify-between px-2 text-xs font-semibold text-foreground/80 hover:bg-muted/50 h-8"
                            onClick={() => toggleExpand(resource.id)}
                          >
                            <span className="flex items-center gap-1.5">
                              <BookOpen className="h-3.5 w-3.5 text-primary" />
                              Eklenen Konular ({topicStats.length})
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                isExpanded ? "rotate-180" : ""
                              )}
                            />
                          </Button>

                          {isExpanded && (
                            <div className="space-y-1.5 pl-1 pr-1 max-h-48 overflow-y-auto">
                              {topicStats.length > 0 ? (
                                topicStats.map((t) => (
                                  <div
                                    key={t.topic}
                                    onClick={() =>
                                      setLocation(
                                        `/resources/${resource.id}`
                                      )
                                    }
                                    className="flex items-center justify-between p-2 text-xs rounded-lg border bg-background/80 hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors"
                                  >
                                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                                      <span className="font-medium text-foreground truncate">
                                        {t.topic}
                                      </span>
                                      {t.lesson && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {t.lesson}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] px-1.5 py-0 font-normal"
                                      >
                                        {t.total} soru
                                      </Badge>
                                      {t.correct > 0 && (
                                        <span className="text-[10px] text-emerald-600 font-semibold">
                                          {t.correct}D
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground text-center py-2 italic">
                                  Henüz bu kaynağa eklenmiş soru bulunmuyor.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1.5 text-primary hover:text-primary font-semibold"
                        onClick={() => setLocation(`/resources/${resource.id}`)}
                      >
                        <FolderKanban className="h-3.5 w-3.5" />
                        Kaynağı ve Soruları İncele
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleEdit(resource)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteId(resource.id)}
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
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Library className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Henüz Kaynak Bulunmuyor</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Çözdüğünüz soru bankası, deneme veya fasikülleri ekleyerek soru ve notlarınızı kaynak bazlı düzenleyebilirsiniz.
            </p>
            <Button onClick={handleCreate} className="mt-4 gap-2">
              <Plus className="h-4 w-4" />
              İlk Kaynağını Ekle
            </Button>
          </div>
        )}
      </div>

      <ResourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resourceForEdit={resourceForEdit}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kaynağı Silmek İstediğinize Emin Misiniz?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kaynak silindiğinde, ilişkilendirilmiş sorular ve notlar korunacak ancak kaynak bilgisi kaldırılacaktır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
