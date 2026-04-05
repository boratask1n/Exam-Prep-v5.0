import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListTests,
  useCreateTest,
  useGetFilterOptions,
  QuestionCategory,
  QuestionStatus,
  type TestSession,
  type TestSessionProgress,
  type TestSolution,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, PlusCircle, Trash2, Calendar, CheckSquare, Target, Book, Clock, X, Eye, BookOpen, CheckCircle, BarChart3 } from "lucide-react";
import { hasTestDraft, clearTestLocalStorage } from "@/lib/testSessionStorage";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getTopicsForLesson } from "@/lib/lessonTopics";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const TYT_LESSONS = ["Türkçe", "Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji", "Din Kültürü", "Felsefe", "Tarih", "Coğrafya"];
const AYT_LESSONS = ["Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji", "Türk Dili ve Edebiyatı", "Tarih", "Coğrafya", "Felsefe"];

function hasRemoteDraftData(
  progress: TestSessionProgress | null | undefined,
  solutions: TestSolution[] | undefined,
) {
  const hasProgress =
    !!progress &&
    (
      (progress.currentIndex ?? 0) > 0 ||
      (progress.elapsed ?? 0) > 0 ||
      progress.inlineDrawEnabled === true ||
      !!(progress.collapsedLessons && Object.keys(progress.collapsedLessons).length > 0)
    );

  const hasSolutions =
    !!solutions?.some(
      (solution) =>
        !!solution.userAnswer ||
        !!solution.tempDrawing ||
        !!solution.canvasData ||
        (Array.isArray(solution.inlineDrawings) && solution.inlineDrawings.length > 0),
    );

  return hasProgress || hasSolutions;
}

export default function Tests() {
  const { data: tests, isLoading } = useListTests();
  const { data: filterOptions, isLoading: isLoadingFilters } = useGetFilterOptions();
  const createMutation = useCreateTest();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [remoteDrafts, setRemoteDrafts] = useState<Record<number, boolean>>({});

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [count, setCount] = useState("10");
  const [category, setCategory] = useState<"ALL" | QuestionCategory>("ALL");
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [showTopicSelector, setShowTopicSelector] = useState(false);
  const [onlyUnsolved, setOnlyUnsolved] = useState(true);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("30");
  
  // Soru dağılımı state'leri
  const [enableDistribution, setEnableDistribution] = useState(false);
  const [distributionMode, setDistributionMode] = useState<"auto" | "manual">("auto");
  const [manualDistribution, setManualDistribution] = useState<Record<string, number>>({});

  // Silme onay dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 6;

  useEffect(() => {
    let cancelled = false;

    const loadRemoteDrafts = async () => {
      if (!tests?.length) {
        if (!cancelled) setRemoteDrafts({});
        return;
      }

      const incompleteTests = tests.filter(
        (test) => !(test as { completedAt?: string | null }).completedAt,
      );

      const results = await Promise.all(
        incompleteTests.map(async (test) => {
          try {
            const [progressResponse, solutionsResponse] = await Promise.all([
              fetch(`/api/tests/${test.id}/progress`),
              fetch(`/api/tests/${test.id}/solutions`),
            ]);

            const progress = progressResponse.ok
              ? ((await progressResponse.json()) as TestSessionProgress | null)
              : null;
            const solutions = solutionsResponse.ok
              ? ((await solutionsResponse.json()) as TestSolution[])
              : [];

            return [test.id, hasRemoteDraftData(progress, solutions)] as const;
          } catch {
            return [test.id, false] as const;
          }
        }),
      );

      if (!cancelled) {
        setRemoteDrafts(Object.fromEntries(results));
      }
    };

    void loadRemoteDrafts();

    return () => {
      cancelled = true;
    };
  }, [tests]);

  // Mevcut dersleri filtrele (soru olanlar)
  const availableLessons = filterOptions?.lessons || [];
  
  const lessonOptions = category === QuestionCategory.AYT 
    ? AYT_LESSONS.filter(l => availableLessons.includes(l))
    : category === QuestionCategory.TYT 
      ? TYT_LESSONS.filter(l => availableLessons.includes(l))
      : [...new Set([...TYT_LESSONS, ...AYT_LESSONS])].filter(l => availableLessons.includes(l));

  // TYT ve AYT ders ağırlıkları (soru sayılarına göre)
  const TYT_WEIGHTS: Record<string, number> = {
    "Türkçe": 40,
    "Matematik": 30,
    "Geometri": 10,
    "Fizik": 7,
    "Kimya": 7,
    "Biyoloji": 6,
    "Din Kültürü": 5,
    "Felsefe": 5,
    "Tarih": 5,
    "Coğrafya": 5,
  };
  
  const AYT_WEIGHTS: Record<string, number> = {
    "Matematik": 30,
    "Geometri": 10,
    "Fizik": 14,
    "Kimya": 13,
    "Biyoloji": 13,
    "Türk Dili ve Edebiyatı": 24,
    "Tarih": 10,
    "Coğrafya": 6,
    "Felsefe": 12,
  };
  
  // Otomatik dağılım hesaplama
  const calculateAutoDistribution = (): Record<string, number> => {
    if (selectedLessons.length === 0) return {};
    
    const totalQuestions = parseInt(count) || 10;
    const weights = category === "AYT" ? AYT_WEIGHTS : TYT_WEIGHTS;
    
    // Seçili derslerin ağırlıklarını topla
    let totalWeight = 0;
    const selectedWeights: Record<string, number> = {};
    
    selectedLessons.forEach((lesson) => {
      const weight = weights[lesson] || 10;
      selectedWeights[lesson] = weight;
      totalWeight += weight;
    });
    
    // Ağırlıklara göre soru sayılarını hesapla
    const distribution: Record<string, number> = {};
    let assigned = 0;
    
    selectedLessons.forEach((lesson) => {
      const ratio = selectedWeights[lesson] / totalWeight;
      const questions = Math.max(1, Math.round(totalQuestions * ratio));
      distribution[lesson] = questions;
      assigned += questions;
    });
    
    // Yuvarlama farkını en yüksek ağırlıklı derse ekle/çıkar
    const diff = totalQuestions - assigned;
    if (diff !== 0 && selectedLessons.length > 0) {
      let maxLesson = selectedLessons[0];
      let maxWeight = selectedWeights[maxLesson] || 0;
      
      selectedLessons.forEach((lesson) => {
        if ((selectedWeights[lesson] || 0) > maxWeight) {
          maxWeight = selectedWeights[lesson] || 0;
          maxLesson = lesson;
        }
      });
      
      distribution[maxLesson] = Math.max(1, (distribution[maxLesson] || 0) + diff);
    }
    
    return distribution;
  };
  
  const handleManualDistributionChange = (lesson: string, value: string) => {
    const num = parseInt(value) || 0;
    setManualDistribution((prev) => ({
      ...prev,
      [lesson]: Math.max(0, num),
    }));
  };

  const toggleLesson = (lesson: string) => {
    setSelectedLessons((prev) => {
      const newSelection = prev.includes(lesson) ? prev.filter((l) => l !== lesson) : [...prev, lesson];
      // Clear topics when lesson is removed
      if (prev.includes(lesson) && !newSelection.includes(lesson)) {
        const topicsForLesson = getTopicsForLesson(category === "ALL" ? "TYT" : (category as QuestionCategory), lesson);
        setSelectedTopics((topics) => topics.filter((t) => !topicsForLesson.includes(t)));
      }
      return newSelection;
    });
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const clearAllTopics = () => {
    setSelectedTopics([]);
  };

  // Get all available topics for selected lessons - sadece mevcut konuları göster
  const availableTopics = selectedLessons.flatMap((lesson) => {
    // Filter options'dan gelen konuları al
    const existingTopics = filterOptions?.topics || [];
    const lessonTopics = lesson === "Geometri" ? [
      'Doğruda ve Üçgende Açılar',
      'Dik Üçgen ve Trigonometrik Bağıntılar',
      'İkizkenar ve Eşkenar Üçgen',
      'Üçgende Alan ve Benzerlik',
      'Üçgende Yardımcı Elemanlar',
      'Çokgenler ve Dörtgenler',
      'Özel Dörtgenler',
      'Çember ve Daire',
      'Katı Cisimler',
      'Analitik Geometri',
      'Çemberin Analitik İncelenmesi'
    ] : getTopicsForLesson(category === "ALL" ? "TYT" : (category as QuestionCategory), lesson);
    // Sadece veritabanında mevcut olan konuları göster
    return lessonTopics.filter(topic => existingTopics.includes(topic));
  });

  // Group topics by lesson for display - sadece mevcut konuları göster
  const topicsByLesson = selectedLessons.map((lesson) => {
    const existingTopics = filterOptions?.topics || [];
    const allLessonTopics = lesson === "Geometri" ? [
      'Doğruda ve Üçgende Açılar',
      'Dik Üçgen ve Trigonometrik Bağıntılar',
      'İkizkenar ve Eşkenar Üçgen',
      'Üçgende Alan ve Benzerlik',
      'Üçgende Yardımcı Elemanlar',
      'Çokgenler ve Dörtgenler',
      'Özel Dörtgenler',
      'Çember ve Daire',
      'Katı Cisimler',
      'Analitik Geometri',
      'Çemberin Analitik İncelenmesi'
    ] : getTopicsForLesson(category === "ALL" ? "TYT" : (category as QuestionCategory), lesson);
    return {
      lesson,
      topics: allLessonTopics.filter(topic => existingTopics.includes(topic)),
    };
  });

  const handleCreate = async () => {
    if (!name.trim()) { toast({ title: "Test adı zorunludur", variant: "destructive" }); return; }

    try {
      const timeLimitSeconds = timeLimitEnabled ? parseInt(timeLimitMinutes) * 60 : null;
      
      // Calculate question distribution if enabled
      let distribution: Record<string, number> | undefined;
      if (enableDistribution && selectedLessons.length > 0) {
        if (distributionMode === "auto") {
          distribution = calculateAutoDistribution();
        } else {
          // Use manual distribution, filter out 0 values
          distribution = Object.fromEntries(
            Object.entries(manualDistribution).filter(([_, count]) => count > 0)
          );
        }
      }
      
      await createMutation.mutateAsync({
        data: {
          name: name.trim(),
          count: parseInt(count),
          timeLimitSeconds,
          filters: {
            category: category !== "ALL" ? category : undefined,
            lessons: selectedLessons.length > 0 ? selectedLessons : undefined,
            topics: selectedTopics.length > 0 ? selectedTopics : undefined,
            status: onlyUnsolved ? QuestionStatus.Cozulmedi : undefined,
          },
          distribution,
        },
      });
      toast({ title: "Test oluşturuldu!" });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      setOpen(false);
      setName("");
      setSelectedLessons([]);
      setSelectedTopics([]);
      setShowTopicSelector(false);
      setTimeLimitEnabled(false);
      setEnableDistribution(false);
      setManualDistribution({});
    } catch {
      toast({ title: "Test oluşturulurken hata", variant: "destructive" });
    }
  };

  const handleDelete = (id: number) => {
    setTestToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!testToDelete) return;
    await fetch(`/api/tests/${testToDelete}`, { method: "DELETE" });
    clearTestLocalStorage(testToDelete);
    queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
    toast({ title: "Test silindi" });
    setDeleteDialogOpen(false);
    setTestToDelete(null);
  };
  const filteredTests = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("tr-TR");
    const items = tests ?? [];
    return items.filter((test) => {
      if (!query) return true;
      return test.name.toLocaleLowerCase("tr-TR").includes(query);
    });
  }, [searchTerm, tests]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, tests]);

  const totalPages = Math.max(1, Math.ceil(filteredTests.length / testsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTests = useMemo(() => {
    const start = (safeCurrentPage - 1) * testsPerPage;
    return filteredTests.slice(start, start + testsPerPage);
  }, [filteredTests, safeCurrentPage]);

  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, safeCurrentPage - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [safeCurrentPage, totalPages]);

  return (
    <div className="h-full flex flex-col p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between gap-4 mb-8 mt-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground flex items-center gap-3">
            <Target className="w-8 h-8 text-primary" /> Test Merkezi
          </h1>
          <p className="text-muted-foreground mt-1">Özel testler oluştur, kendini sına ve eksiklerini kapat.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl px-6 font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all duration-300 gap-2">
              <PlusCircle className="w-5 h-5" />
              Yeni Test Oluştur
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border/50 rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Akıllı Test Kurucu</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 mt-4">
              <div className="space-y-2">
                <Label>Test Adı *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn: Haftalık TYT Antrenmanı" className="rounded-xl" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Soru Sayısı</Label>
                  <Input type="number" value={count} onChange={(e) => setCount(e.target.value)} min="1" max="100" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Kategori</Label>
                  <Select value={category} onValueChange={(v) => { setCategory(v as any); setSelectedLessons([]); setSelectedTopics([]); }}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Karma (TYT + AYT)</SelectItem>
                      <SelectItem value="TYT">TYT</SelectItem>
                      <SelectItem value="AYT">AYT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Lesson multi-select */}
              <div className="space-y-2">
                <Label>Ders Filtresi <span className="text-muted-foreground text-xs">(boş bırakılırsa tüm dersler)</span></Label>
                {lessonOptions.length === 0 ? (
                  <div className="p-4 bg-muted/20 rounded-xl border border-border/50 text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      Henüz hiç ders eklenmemiş.
                    </p>
                    <Link href="/">
                      <Button variant="outline" size="sm" className="rounded-lg text-xs">
                        <PlusCircle className="w-3 h-3 mr-1" /> Soru kaydetmeye başla
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 p-3 bg-muted/20 rounded-xl border border-border/50 min-h-[48px]">
                      {lessonOptions.map((lesson) => (
                        <button
                          key={lesson}
                          type="button"
                          onClick={() => toggleLesson(lesson)}
                          className={cn(
                            "px-3 py-1 rounded-lg text-sm font-medium transition-all border",
                            selectedLessons.includes(lesson)
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground"
                          )}
                        >
                          {lesson}
                        </button>
                      ))}
                    </div>
                    {selectedLessons.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSelectedLessons([]); setSelectedTopics([]); }}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Seçimi temizle
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Topic Selection - Only show if lessons are selected */}
              {selectedLessons.length > 0 && availableTopics.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-primary" />
                      Konu Seçimi
                      <span className="text-muted-foreground text-xs font-normal">
                        ({selectedTopics.length} konu seçili)
                      </span>
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTopicSelector(!showTopicSelector)}
                      className="rounded-lg text-xs"
                    >
                      {showTopicSelector ? "Gizle" : "Konuları Göster"}
                    </Button>
                  </div>

                  {showTopicSelector && (
                    <div className="p-4 bg-muted/20 rounded-xl border border-border/50 space-y-4 max-h-[300px] overflow-y-auto">
                      {topicsByLesson.map(({ lesson, topics }) => (
                        <div key={lesson} className="space-y-2">
                          <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Book className="w-3 h-3 text-primary" />
                            {lesson}
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {topics.map((topic) => (
                              <button
                                key={topic}
                                type="button"
                                onClick={() => toggleTopic(topic)}
                                className={cn(
                                  "px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
                                  selectedTopics.includes(topic)
                                    ? "bg-accent text-accent-foreground border-accent shadow-sm"
                                    : "bg-background text-muted-foreground border-border/50 hover:border-accent/50 hover:text-foreground"
                                )}
                              >
                                {topic}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {selectedTopics.length > 0 && (
                        <div className="pt-3 border-t border-border/30 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {selectedTopics.length} konu seçildi
                          </span>
                          <button
                            type="button"
                            onClick={clearAllTopics}
                            className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Tümünü Temizle
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!showTopicSelector && selectedTopics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-3 bg-muted/20 rounded-xl border border-border/50">
                      {selectedTopics.slice(0, 5).map((topic) => (
                        <span
                          key={topic}
                          className="px-2 py-1 bg-accent/20 text-accent-foreground rounded-md text-xs font-medium flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" />
                          {topic.length > 20 ? topic.slice(0, 20) + "..." : topic}
                        </span>
                      ))}
                      {selectedTopics.length > 5 && (
                        <span className="px-2 py-1 text-muted-foreground rounded-md text-xs">
                          +{selectedTopics.length - 5} daha...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Only unsolved */}
              <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/50">
                <input
                  type="checkbox"
                  id="onlyUnsolved"
                  checked={onlyUnsolved}
                  onChange={(e) => setOnlyUnsolved(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <label htmlFor="onlyUnsolved" className="text-sm font-medium cursor-pointer">
                  Yalnızca çözülmemiş sorulardan seç
                </label>
              </div>

              {/* Question Distribution */}
              <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="enableDistribution"
                    checked={enableDistribution}
                    onChange={(e) => setEnableDistribution(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="enableDistribution" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <BarChart3 className="w-4 h-4 text-primary" /> Soru Dağılımını Düzenle
                  </label>
                </div>
                
                {enableDistribution && selectedLessons.length > 0 && (
                  <div className="pl-7 space-y-3">
                    {/* Mode Selection */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDistributionMode("auto")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                          distributionMode === "auto"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border/50 hover:border-primary/50"
                        )}
                      >
                        🤖 Otomatik (TYT/AYT Oranları)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDistributionMode("manual")}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                          distributionMode === "manual"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border/50 hover:border-primary/50"
                        )}
                      >
                        ✏️ Manuel
                      </button>
                    </div>
                    
                    {distributionMode === "auto" ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {category === "AYT" ? "AYT" : "TYT"} oranlarına göre dağılım:
                        </p>
                        <div className="space-y-1.5">
                          {(() => {
                            const distribution = calculateAutoDistribution();
                            const total = Object.values(distribution).reduce((a, b) => a + b, 0);
                            return selectedLessons.map((lesson) => {
                              const count_ = distribution[lesson] || 0;
                              const weight = (category === "AYT" ? AYT_WEIGHTS : TYT_WEIGHTS)[lesson] || 10;
                              return (
                                <div key={lesson} className="flex items-center gap-2 text-sm">
                                  <span className="w-24 truncate">{lesson}</span>
                                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary/60 rounded-full transition-all"
                                      style={{ width: `${total > 0 ? (count_ / total) * 100 : 0}%` }}
                                    />
                                  </div>
                                  <span className="w-8 text-right font-medium">{count_}</span>
                                  <span className="text-xs text-muted-foreground">({weight})</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Matematik, Geometri ve Türkçe'ye daha fazla ağırlık verilir.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Her dersten kaç soru:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {selectedLessons.map((lesson) => (
                            <div key={lesson} className="flex items-center gap-2">
                              <span className="text-xs w-20 truncate">{lesson}</span>
                              <Input
                                type="number"
                                min="0"
                                max="50"
                                value={manualDistribution[lesson] || ""}
                                onChange={(e) => handleManualDistributionChange(lesson, e.target.value)}
                                className="h-7 w-16 text-xs rounded-lg"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Toplam: {Object.values(manualDistribution).reduce((a, b) => a + b, 0)} soru
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {enableDistribution && selectedLessons.length === 0 && (
                  <p className="text-xs text-muted-foreground pl-7">
                    Dağılım için önce ders seçin.
                  </p>
                )}
              </div>

              {/* Timer */}
              <div className="space-y-3 p-3 bg-muted/20 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="timeLimitEnabled"
                    checked={timeLimitEnabled}
                    onChange={(e) => setTimeLimitEnabled(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="timeLimitEnabled" className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                    <Clock className="w-4 h-4 text-primary" /> Süre Sınırı Belirle
                  </label>
                </div>
                {timeLimitEnabled && (
                  <div className="flex items-center gap-3 pl-7">
                    <Input
                      type="number"
                      value={timeLimitMinutes}
                      onChange={(e) => setTimeLimitMinutes(e.target.value)}
                      min="1"
                      max="180"
                      className="rounded-xl w-24"
                    />
                    <span className="text-sm text-muted-foreground">dakika</span>
                  </div>
                )}
                {!timeLimitEnabled && (
                  <p className="text-xs text-muted-foreground pl-7">Süre sınırı olmazsa kronometre olarak çalışır.</p>
                )}
              </div>

              <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full rounded-xl mt-2 font-semibold">
                {createMutation.isPending ? "Oluşturuluyor..." : "Oluştur"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>


      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-sm">
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Test ara..." className="rounded-xl" />
        </div>
        <p className="text-sm text-muted-foreground">{filteredTests.length} test bulundu</p>
      </div>      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
        {isLoading ? (
          <div className="col-span-full py-20 flex justify-center">
            <div className="animate-spin h-10 w-10 border-b-2 border-primary rounded-full" />
          </div>
        ) : !tests?.length ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-80">
            <Book className="w-20 h-20 text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-display font-medium text-foreground">Henüz Test Yok</h3>
            <p className="text-muted-foreground mt-2">Sağ üstten yeni bir test oluşturarak çalışmaya başla.</p>
          </div>
        ) : (
          paginatedTests.map((test: TestSession) => {
            const pct = test.questionCount > 0 ? Math.round((test.completedCount / test.questionCount) * 100) : 0;
            const completedAt = (test as { completedAt?: string | null }).completedAt;
            const hasDraft = hasTestDraft(test.id) || !!remoteDrafts[test.id];
            const ctaLabel = completedAt ? "Gözden geçir" : hasDraft ? "Devam et" : "Testi çöz";
            const CtaIcon = completedAt ? Eye : PlayCircle;
            return (
              <Card key={test.id} className="relative group overflow-hidden bg-card/40 border-border/50 hover:border-primary/40 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent opacity-70" />
                <div className="p-6 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg font-display text-foreground line-clamp-2 pr-6">{test.name}</h3>
                    <button
                      onClick={() => handleDelete(test.id)}
                      className="absolute top-5 right-5 p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2.5 mb-5 flex-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckSquare className="w-4 h-4 text-primary" />
                      <span>{test.questionCount} Soru · {test.completedCount} Doğru</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span>{format(new Date(test.createdAt), "dd MMM yyyy")}</span>
                    </div>
                    {(test as any).timeLimitSeconds && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4 text-primary" />
                        <span>Süre: {Math.round((test as any).timeLimitSeconds / 60)} dk</span>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-border/40">
                      <div className="flex justify-between text-xs font-semibold mb-1.5">
                        <span className="text-muted-foreground">İlerleme</span>
                        <span className="text-primary">{pct}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <Link href={`/tests/${test.id}`} className="w-full">
                    <Button className="w-full rounded-xl gap-2 font-semibold">
                      <CtaIcon className="w-4 h-4" />
                      {ctaLabel}
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })
        )}
      </div>


      {filteredTests.length > 0 ? (
        <div className="flex flex-col items-center gap-3 pb-10">
          <p className="text-sm text-muted-foreground">
            {(safeCurrentPage - 1) * testsPerPage + 1} - {Math.min(safeCurrentPage * testsPerPage, filteredTests.length)} / {filteredTests.length} test gösteriliyor
          </p>
          {totalPages > 1 ? (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (safeCurrentPage > 1) setCurrentPage(safeCurrentPage - 1);
                    }}
                    className={safeCurrentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {visiblePageNumbers.map((pageNumber) => (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      href="#"
                      isActive={pageNumber === safeCurrentPage}
                      onClick={(e) => {
                        e.preventDefault();
                        setCurrentPage(pageNumber);
                      }}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      if (safeCurrentPage < totalPages) setCurrentPage(safeCurrentPage + 1);
                    }}
                    className={safeCurrentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      ) : null}
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border/50 rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Testi Sil
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Bu testi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-border/50 hover:bg-muted">
              İptal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}




