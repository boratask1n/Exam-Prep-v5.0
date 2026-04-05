import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, UploadCloud, X } from "lucide-react";
import {
  useCreateQuestion,
  useUpdateQuestion,
  useUploadQuestionImage,
  QuestionCategory,
  QuestionSource,
  QuestionStatus,
  QuestionChoice,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;
type OptionLabel = (typeof OPTION_LABELS)[number];
type OptionItem = { label: OptionLabel; text: string };

const formSchema = z.object({
  lesson: z.string().min(1, "Ders adı zorunludur"),
  topic: z.string().optional(),
  description: z.string().optional(),
  publisher: z.string().optional(),
  testName: z.string().optional(),
  testNo: z.string().optional(),
  category: z.nativeEnum(QuestionCategory),
  source: z.nativeEnum(QuestionSource),
  status: z.nativeEnum(QuestionStatus).default(QuestionStatus.Cozulmedi),
  choice: z.nativeEnum(QuestionChoice).optional().nullable(),
  solutionUrl: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^https?:\/\//i.test(v), "Geçerli bir http(s) adresi girin"),
});

type FormValues = z.infer<typeof formSchema>;

interface QuestionForEdit {
  id: number;
  imageUrl?: string | null;
  description?: string | null;
  lesson: string;
  topic?: string | null;
  publisher?: string | null;
  testName?: string | null;
  testNo?: string | null;
  solutionUrl?: string | null;
  options?: Array<{ label: string; text: string }> | null;
  choice?: string | null;
  category: string;
  source: string;
  status: string;
}

interface Props {
  question?: QuestionForEdit;
  trigger?: React.ReactNode;
  onSaved?: () => void;
}

function emptyOptionTexts(): Record<OptionLabel, string> {
  return { A: "", B: "", C: "", D: "", E: "" };
}

export function QuestionFormDialog({ question, trigger, onSaved }: Props) {
  const isEdit = !!question;
  const [open, setOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [keepExistingImage, setKeepExistingImage] = useState(true);
  const [useManualChoices, setUseManualChoices] = useState(false);
  const [optionTexts, setOptionTexts] = useState<Record<OptionLabel, string>>(emptyOptionTexts());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateQuestion();
  const updateMutation = useUpdateQuestion();
  const uploadMutation = useUploadQuestionImage();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: QuestionCategory.TYT,
      source: QuestionSource.Deneme,
      status: QuestionStatus.Cozulmedi,
      solutionUrl: "",
    },
  });

  const category = watch("category");
  const lesson = watch("lesson");

  const lessonOptions = useMemo(() => getLessonsForCategory(category).map((l) => l.name), [category]);
  const topicOptions = useMemo(() => {
    if (!lesson) return [];
    if (category === "Geometri") {
      return [
        "Doğruda ve Üçgende Açılar",
        "Dik Üçgen ve Trigonometrik Bağıntılar",
        "İkizkenar ve Eşkenar Üçgen",
        "Üçgende Alan ve Benzerlik",
        "Üçgende Yardımcı Elemanlar",
        "Çokgenler ve Dörtgenler",
        "Özel Dörtgenler",
        "Çember ve Daire",
        "Katı Cisimler",
        "Analitik Geometri",
        "Çemberin Analitik İncelenmesi",
      ];
    }
    return getTopicsForLesson(category, lesson);
  }, [category, lesson]);

  const manualChoiceLabels = useMemo(() => {
    if (!useManualChoices) return OPTION_LABELS;
    return OPTION_LABELS.filter((label) => optionTexts[label].trim().length > 0);
  }, [optionTexts, useManualChoices]);

  useEffect(() => {
    if (category === "Geometri") {
      setValue("lesson", "Geometri");
    } else {
      setValue("lesson", "");
    }
    setValue("topic", "");
  }, [category, setValue]);

  useEffect(() => {
    if (open && isEdit && question) {
      reset({
        lesson: question.lesson,
        topic: question.topic ?? "",
        description: question.description ?? "",
        publisher: question.publisher ?? "",
        testName: question.testName ?? "",
        testNo: question.testNo ?? "",
        category: question.category as QuestionCategory,
        source: question.source as QuestionSource,
        status: question.status as QuestionStatus,
        choice: (question.choice as QuestionChoice) ?? undefined,
        solutionUrl: question.solutionUrl ?? "",
      });

      if (question.imageUrl) {
        setImagePreview(question.imageUrl);
        setKeepExistingImage(true);
      } else {
        setImagePreview(null);
        setKeepExistingImage(false);
      }

      if (question.options && question.options.length > 0) {
        const next = emptyOptionTexts();
        for (const option of question.options) {
          const label = (option.label || "").toUpperCase() as OptionLabel;
          if (OPTION_LABELS.includes(label)) next[label] = option.text ?? "";
        }
        setOptionTexts(next);
        setUseManualChoices(true);
      } else {
        setOptionTexts(emptyOptionTexts());
        setUseManualChoices(false);
      }
    } else if (open && !isEdit) {
      reset({
        category: QuestionCategory.TYT,
        source: QuestionSource.Deneme,
        status: QuestionStatus.Cozulmedi,
        solutionUrl: "",
      });
      setImagePreview(null);
      setImageFile(null);
      setUseManualChoices(false);
      setOptionTexts(emptyOptionTexts());
    }
  }, [isEdit, open, question, reset]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setKeepExistingImage(false);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (!e.clipboardData.items[i].type.includes("image")) continue;
      const file = e.clipboardData.items[i].getAsFile();
      if (!file) continue;
      setImageFile(file);
      setKeepExistingImage(false);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      break;
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageFile(null);
    setKeepExistingImage(false);
  };

  const onSubmit = async (data: FormValues) => {
    try {
      let imageUrl: string | null | undefined = undefined;
      const manualOptions: OptionItem[] | null = useManualChoices
        ? OPTION_LABELS.map((label) => ({ label, text: optionTexts[label].trim() })).filter((item) => item.text.length > 0)
        : null;

      if (useManualChoices && (!manualOptions || manualOptions.length < 2)) {
        toast({
          title: "En az 2 şık girin",
          description: "Manuel şık modunda en az iki şık metni doldurmalısın.",
          variant: "destructive",
        });
        return;
      }

      if (imageFile && imagePreview && !keepExistingImage) {
        const base64Data = imagePreview.split(",")[1];
        const res = await uploadMutation.mutateAsync({ data: { imageData: base64Data, mimeType: imageFile.type } });
        imageUrl = res.url;
      } else if (!keepExistingImage && !imageFile) {
        imageUrl = null;
      } else if (isEdit && keepExistingImage) {
        imageUrl = question?.imageUrl ?? null;
      }

      const payload = {
        ...data,
        source: data.source as any,
        imageUrl: isEdit ? imageUrl : imageUrl ?? null,
        options: manualOptions,
        choice: data.choice || null,
        solutionUrl: data.solutionUrl?.trim() || null,
      };

      if (isEdit && question) {
        await updateMutation.mutateAsync({ id: question.id, data: payload });
        toast({ title: "Soru güncellendi" });
      } else {
        await createMutation.mutateAsync({ data: payload });
        toast({ title: "Soru havuza eklendi" });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filters/options"] });
      onSaved?.();
      setOpen(false);
      reset();
      setImagePreview(null);
      setImageFile(null);
      setUseManualChoices(false);
      setOptionTexts(emptyOptionTexts());
    } catch {
      toast({ title: "Hata", description: "İşlem sırasında bir hata oluştu.", variant: "destructive" });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="rounded-xl px-6 font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all duration-300 gap-2">
            <PlusCircle className="w-5 h-5" />
            Soru Ekle
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border/50 shadow-2xl rounded-2xl" onPaste={handlePaste}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">{isEdit ? "Soruyu Düzenle" : "Yeni Soru Ekle"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label>
              Soru Görseli <span className="text-muted-foreground text-xs">(Sürükle bırak veya Ctrl+V ile yapıştır)</span>
            </Label>
            {!imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-border/60 hover:border-primary/50 rounded-xl bg-muted/20 flex flex-col items-center justify-center cursor-pointer transition-colors group"
              >
                <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform mb-2">
                  <UploadCloud className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">Görsel Yükle</p>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onFileSelect} />
              </div>
            ) : (
              <div className="relative w-full rounded-xl overflow-hidden border border-border/50 bg-foreground/10 group flex justify-center">
                <img src={imagePreview} alt="Önizleme" className="max-h-56 object-contain" />
                <div className="absolute inset-0 bg-foreground/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button type="button" variant="destructive" size="sm" onClick={clearImage} className="rounded-xl">
                    <X className="w-4 h-4 mr-2" /> Kaldır
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kategori *</Label>
              <Select value={watch("category")} onValueChange={(val) => setValue("category", val as QuestionCategory)}>
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(QuestionCategory).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ders *</Label>
              <Select
                value={watch("lesson") || ""}
                onValueChange={(val) => {
                  setValue("lesson", val);
                  setValue("topic", "");
                }}
                disabled={category === "Geometri"}
              >
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue placeholder={category === "Geometri" ? "Geometri" : "Ders seçin..."} />
                </SelectTrigger>
                <SelectContent>
                  {lessonOptions.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.lesson && <p className="text-destructive text-xs">{errors.lesson.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Konu</Label>
              <Select
                value={watch("topic") || "NONE"}
                onValueChange={(val) => setValue("topic", val === "NONE" ? "" : val)}
                disabled={!lesson && category !== "Geometri"}
              >
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue placeholder={lesson ? "Konu seçin..." : category === "Geometri" ? "Konu seçin..." : "Önce ders seçin"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Konu seçilmedi</SelectItem>
                  {topicOptions.length > 0
                    ? topicOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))
                    : lesson && (
                        <SelectItem value="_NO_TOPICS_" disabled>
                          Konu bulunamadı
                        </SelectItem>
                      )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kaynak Tipi *</Label>
              <Select value={watch("source")} onValueChange={(val) => setValue("source", val as QuestionSource)}>
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(QuestionSource).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Yayınevi</Label>
              <Input {...register("publisher")} placeholder="3D, Bilgi Sarmal..." className="bg-muted/30 border-border/50 rounded-xl" />
            </div>

            <div className="space-y-2">
              <Label>Doğru Şık</Label>
              <Select value={watch("choice") || "NONE"} onValueChange={(val) => setValue("choice", val === "NONE" ? null : (val as QuestionChoice))}>
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue placeholder="Belirtilmedi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Belirtilmedi</SelectItem>
                  {(useManualChoices ? manualChoiceLabels : OPTION_LABELS).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Test Adı</Label>
              <Input {...register("testName")} placeholder="Deneme adı" className="bg-muted/30 border-border/50 rounded-xl" />
            </div>

            <div className="space-y-2">
              <Label>Test No</Label>
              <Input {...register("testNo")} placeholder="42" className="bg-muted/30 border-border/50 rounded-xl" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Durum</Label>
              <Select value={watch("status")} onValueChange={(val) => setValue("status", val as QuestionStatus)}>
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={QuestionStatus.Cozulmedi}>Çözülmedi</SelectItem>
                  <SelectItem value={QuestionStatus.DogruCozuldu}>Doğru Çözüldü</SelectItem>
                  <SelectItem value={QuestionStatus.YanlisHocayaSor}>Yanlış / Hocaya Sor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border/70"
                checked={useManualChoices}
                onChange={(e) => setUseManualChoices(e.target.checked)}
              />
              Şıkları kendim gireceğim
            </label>
            {useManualChoices && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {OPTION_LABELS.map((label) => (
                  <div key={label} className="space-y-1">
                    <Label className="text-xs">{label} Şıkkı</Label>
                    <Input
                      value={optionTexts[label]}
                      onChange={(e) => setOptionTexts((prev) => ({ ...prev, [label]: e.target.value }))}
                      placeholder={`${label} şık metni`}
                      className="bg-muted/30 border-border/50 rounded-xl"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Açıklama / Notlar</Label>
            <Textarea {...register("description")} placeholder="Bu soru hakkında notlarınız..." className="bg-muted/30 border-border/50 rounded-xl resize-none min-h-[80px]" />
          </div>

          <div className="space-y-2">
            <Label>Çözüm videosu (YouTube linki)</Label>
            <Input {...register("solutionUrl")} type="url" placeholder="https://www.youtube.com/watch?v=..." className="bg-muted/30 border-border/50 rounded-xl" />
            {errors.solutionUrl && <p className="text-destructive text-xs">{errors.solutionUrl.message}</p>}
            <p className="text-[11px] text-muted-foreground">Test modunda bu soru için “Çözüm videosu” ile izlenebilir.</p>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl font-medium">
              İptal
            </Button>
            <Button type="submit" disabled={isPending} className="rounded-xl px-8 font-semibold">
              {isPending ? "Kaydediliyor..." : isEdit ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
