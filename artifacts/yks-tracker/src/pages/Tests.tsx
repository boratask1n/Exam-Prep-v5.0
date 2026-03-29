import { useState } from "react";
import { Link } from "wouter";
import {
  useListTests,
  useCreateTest,
  QuestionCategory,
  QuestionStatus,
  type TestSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, PlusCircle, Trash2, Calendar, CheckSquare, Target, Book, Clock, X, Eye } from "lucide-react";
import { hasTestDraft, clearTestLocalStorage } from "@/lib/testSessionStorage";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const TYT_LESSONS = ["Türkçe", "Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji", "Din Kültürü", "Felsefe", "Tarih", "Coğrafya"];
const AYT_LESSONS = ["Matematik", "Geometri", "Fizik", "Kimya", "Biyoloji", "Türk Dili ve Edebiyatı", "Tarih", "Coğrafya", "Felsefe"];

export default function Tests() {
  const { data: tests, isLoading } = useListTests();
  const createMutation = useCreateTest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [count, setCount] = useState("10");
  const [category, setCategory] = useState<"ALL" | QuestionCategory>("ALL");
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [onlyUnsolved, setOnlyUnsolved] = useState(true);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("30");

  const lessonOptions = category === QuestionCategory.AYT ? AYT_LESSONS : category === QuestionCategory.TYT ? TYT_LESSONS : [...TYT_LESSONS, ...AYT_LESSONS.filter(l => !TYT_LESSONS.includes(l))];

  const toggleLesson = (lesson: string) => {
    setSelectedLessons((prev) =>
      prev.includes(lesson) ? prev.filter((l) => l !== lesson) : [...prev, lesson]
    );
  };

  const handleCreate = async () => {
    if (!name.trim()) { toast({ title: "Test adı zorunludur", variant: "destructive" }); return; }

    try {
      const timeLimitSeconds = timeLimitEnabled ? parseInt(timeLimitMinutes) * 60 : null;
      await createMutation.mutateAsync({
        data: {
          name: name.trim(),
          count: parseInt(count),
          timeLimitSeconds,
          filters: {
            category: category !== "ALL" ? category : undefined,
            lessons: selectedLessons.length > 0 ? selectedLessons : undefined,
            status: onlyUnsolved ? QuestionStatus.Cozulmedi : undefined,
          },
        },
      });
      toast({ title: "Test oluşturuldu!" });
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      setOpen(false);
      setName("");
      setSelectedLessons([]);
      setTimeLimitEnabled(false);
    } catch {
      toast({ title: "Test oluşturulurken hata", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Testi silmek istediğinize emin misiniz?")) {
      await fetch(`/api/tests/${id}`, { method: "DELETE" });
      clearTestLocalStorage(id);
      queryClient.invalidateQueries({ queryKey: ["/api/tests"] });
      toast({ title: "Test silindi" });
    }
  };

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
                  <Select value={category} onValueChange={(v) => { setCategory(v as any); setSelectedLessons([]); }}>
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
                    onClick={() => setSelectedLessons([])}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Seçimi temizle
                  </button>
                )}
              </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
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
          tests.map((test: TestSession) => {
            const pct = test.questionCount > 0 ? Math.round((test.completedCount / test.questionCount) * 100) : 0;
            const completedAt = (test as { completedAt?: string | null }).completedAt;
            const hasDraft = hasTestDraft(test.id);
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
    </div>
  );
}
