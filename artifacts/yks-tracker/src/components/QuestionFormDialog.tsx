import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { MathLiveChoiceEditor } from "@/components/math/MathLiveChoiceEditor";
import { convertLegacyMathValueToLatex } from "@/components/math/mathExpression";

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;
type OptionLabel = (typeof OPTION_LABELS)[number];
type OptionItem = { label: OptionLabel; text: string };
const formSchema = z.object({
  lesson: z.string().min(1, "Ders ad\u0131 zorunludur"),
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
    .refine((v) => !v || /^https?:\/\//i.test(v), "Ge\u00e7erli bir http(s) adresi girin"),
  solutionYoutubeUrl: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^https?:\/\//i.test(v), "Ge\u00e7erli bir http(s) adresi girin"),
  solutionYoutubeStartSecond: z.preprocess(
    (value) => (value === "" || value == null ? null : Number(value)),
    z.number().int("Saniye tam sayı olmalı").min(0, "Saniye 0 veya daha büyük olmalı").nullable().optional(),
  ),
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
  solutionYoutubeUrl?: string | null;
  solutionYoutubeStartSecond?: number | null;
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

async function prepareQuestionImage(file: File) {
  const supportedInput = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!supportedInput) {
    throw new Error("Sadece JPEG, PNG veya WEBP görsel yükleyebilirsin.");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(String(event.target?.result ?? ""));
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel işlenemedi."));
    img.src = dataUrl;
  });

  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Görsel işlenemedi.");
  context.drawImage(image, 0, 0, width, height);

  const optimizedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.86);
  });
  if (!optimizedBlob) throw new Error("Görsel sıkıştırılamadı.");

  const optimizedFile = new File(
    [optimizedBlob],
    file.name.replace(/\.[^.]+$/, "") || "question-image",
    { type: "image/webp" },
  );
  const optimizedPreview = canvas.toDataURL("image/webp", 0.86);

  return { file: optimizedFile, preview: optimizedPreview };
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
    setError,
    clearErrors,
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
      solutionYoutubeUrl: "",
      solutionYoutubeStartSecond: null,
    },
  });

  const category = watch("category");
  const lesson = watch("lesson");

  const lessonOptions = useMemo(() => getLessonsForCategory(category).map((l) => l.name), [category]);
  const topicOptions = useMemo(() => {
    if (!lesson) return [];
    if (category === "Geometri") {
      return [
        "Do\u011fruda ve \u00dc\u00e7gende A\u00e7\u0131lar",
        "Dik \u00dc\u00e7gen ve Trigonometrik Ba\u011f\u0131nt\u0131lar",
        "\u0130kizkenar ve E\u015fkenar \u00dc\u00e7gen",
        "\u00dc\u00e7gende Alan ve Benzerlik",
        "\u00dc\u00e7gende Yard\u0131mc\u0131 Elemanlar",
        "\u00c7okgenler ve D\u00f6rtgenler",
        "\u00d6zel D\u00f6rtgenler",
        "\u00c7ember ve Daire",
        "Kat\u0131 Cisimler",
        "Analitik Geometri",
        "\u00c7emberin Analitik \u0130ncelenmesi",
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
        solutionYoutubeUrl: question.solutionYoutubeUrl ?? question.solutionUrl ?? "",
        solutionYoutubeStartSecond: question.solutionYoutubeStartSecond ?? null,
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
          if (OPTION_LABELS.includes(label)) next[label] = convertLegacyMathValueToLatex(option.text ?? "");
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
        solutionYoutubeUrl: "",
        solutionYoutubeStartSecond: null,
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
    void prepareQuestionImage(file)
      .then((prepared) => {
        setImageFile(prepared.file);
        setImagePreview(prepared.preview);
        setKeepExistingImage(false);
      })
      .catch((error) => {
        toast({ title: "Görsel hazırlanamadı", description: (error as Error).message, variant: "destructive" });
      });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      if (!e.clipboardData.items[i].type.includes("image")) continue;
      const file = e.clipboardData.items[i].getAsFile();
      if (!file) continue;
      void prepareQuestionImage(file)
        .then((prepared) => {
          setImageFile(prepared.file);
          setImagePreview(prepared.preview);
          setKeepExistingImage(false);
        })
        .catch((error) => {
          toast({ title: "Görsel hazırlanamadı", description: (error as Error).message, variant: "destructive" });
        });
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
      if (!data.lesson?.trim()) {
        setError("lesson", { type: "manual", message: "Ders adı zorunludur" });
        return;
      }

      let imageUrl: string | null | undefined = undefined;
      const manualOptions: OptionItem[] | null = useManualChoices
        ? OPTION_LABELS.map((label) => ({ label, text: optionTexts[label].trim() })).filter((item) => item.text.length > 0)
        : null;

      if (useManualChoices && (!manualOptions || manualOptions.length < 2)) {
        toast({
          title: "En az 2 \u015f\u0131k girin",
          description: "Manuel \u015f\u0131k modunda en az iki \u015f\u0131k metni doldurmal\u0131s\u0131n.",
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
        solutionUrl: data.solutionYoutubeUrl?.trim() || data.solutionUrl?.trim() || null,
        solutionYoutubeUrl: data.solutionYoutubeUrl?.trim() || null,
        solutionYoutubeStartSecond: data.solutionYoutubeStartSecond ?? null,
      };

      if (isEdit && question) {
        await updateMutation.mutateAsync({ id: question.id, data: payload });
        toast({ title: "Soru g\u00fcncellendi" });
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
      toast({ title: "Hata", description: "\u0130\u015flem s\u0131ras\u0131nda bir hata olu\u015ftu.", variant: "destructive" });
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

      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border/50 shadow-2xl rounded-2xl"
        onPaste={handlePaste}
        onInteractOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (
            target?.closest(".ML__keyboard") ||
            target?.closest(".MLK__backdrop") ||
            target?.closest("[data-command-target='virtual-keyboard']")
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">{isEdit ? "Soruyu D\u00fczenle" : "Yeni Soru Ekle"}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Soru bilgilerini, görseli ve gerekiyorsa matematiksel şıklarını bu pencereden düzenleyebilirsin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label>
              {"Soru G\u00f6rseli"} <span className="text-muted-foreground text-xs">{"(S\u00fcr\u00fckle b\u0131rak veya Ctrl+V ile yap\u0131\u015ft\u0131r)"}</span>
            </Label>
            {!imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-border/60 hover:border-primary/50 rounded-xl bg-muted/20 flex flex-col items-center justify-center cursor-pointer transition-colors group"
              >
                <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform mb-2">
                  <UploadCloud className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">{"G\u00f6rsel Y\u00fckle"}</p>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onFileSelect} />
              </div>
            ) : (
              <div className="relative w-full rounded-xl overflow-hidden border border-border/50 bg-foreground/10 group flex justify-center">
                <img src={imagePreview} alt={"\u00d6nizleme"} className="max-h-56 object-contain" />
                <div className="absolute inset-0 bg-foreground/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button type="button" variant="destructive" size="sm" onClick={clearImage} className="rounded-xl">
                    <X className="w-4 h-4 mr-2" /> {"Kald\u0131r"}
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
                  clearErrors("lesson");
                }}
                disabled={category === "Geometri"}
              >
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue placeholder={category === "Geometri" ? "Geometri" : "Ders se\u00e7in..."} />
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
                  <SelectValue placeholder={lesson ? "Konu se\u00e7in..." : category === "Geometri" ? "Konu se\u00e7in..." : "\u00d6nce ders se\u00e7in"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{"Konu se\u00e7ilmedi"}</SelectItem>
                  {topicOptions.length > 0
                    ? topicOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))
                    : lesson && (
                        <SelectItem value="_NO_TOPICS_" disabled>
                          {"Konu bulunamad\u0131"}
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
              <Label>{"Yay\u0131nevi"}</Label>
              <Input {...register("publisher")} placeholder="3D, Bilgi Sarmal..." className="bg-muted/30 border-border/50 rounded-xl" />
            </div>

            <div className="space-y-2">
              <Label>{"Do\u011fru \u015e\u0131k"}</Label>
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
              <Label>{"Test Ad\u0131"}</Label>
              <Input {...register("testName")} placeholder={"Deneme ad\u0131"} className="bg-muted/30 border-border/50 rounded-xl" />
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
                  <SelectItem value={QuestionStatus.Cozulmedi}>{"\u00c7\u00f6z\u00fclmedi"}</SelectItem>
                  <SelectItem value={QuestionStatus.DogruCozuldu}>{"Do\u011fru \u00c7\u00f6z\u00fcld\u00fc"}</SelectItem>
                  <SelectItem value={QuestionStatus.YanlisHocayaSor}>{"Yanl\u0131\u015f / Hocaya Sor"}</SelectItem>
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
              {"\u015e\u0131klar\u0131 kendim girece\u011fim"}
            </label>
            {useManualChoices && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OPTION_LABELS.map((label) => (
                    <div key={label} className="space-y-1">
                      <Label className="text-xs">{label} {"\u015e\u0131kk\u0131"}</Label>
                      <MathLiveChoiceEditor
                        value={optionTexts[label]}
                        onChange={(nextValue) => setOptionTexts((prev) => ({ ...prev, [label]: nextValue }))}
                        placeholder={`${label}\u00A0\u015f\u0131k\u00A0metni`}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  MathLive editörü odaklandığında matematik klavyesi açılır. Limit, kesir, integral ve iç içe ifadeleri doğrudan bu alanda yazabilirsin.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{"A\u00e7\u0131klama / Notlar"}</Label>
            <Textarea {...register("description")} placeholder={"Bu soru hakk\u0131nda notlar\u0131n\u0131z..."} className="bg-muted/30 border-border/50 rounded-xl resize-none min-h-[80px]" />
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/50 bg-muted/20 p-3 sm:grid-cols-[1fr_150px]">
            <div className="space-y-2">
              <Label>{"\u00c7\u00f6z\u00fcm videosu (YouTube linki)"}</Label>
              <Input
                {...register("solutionYoutubeUrl")}
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                className="bg-background/70 border-border/50 rounded-xl"
              />
              {errors.solutionYoutubeUrl && <p className="text-destructive text-xs">{errors.solutionYoutubeUrl.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>{"Ba\u015flang\u0131\u00e7 saniyesi"}</Label>
              <Input
                {...register("solutionYoutubeStartSecond")}
                type="number"
                min={0}
                step={1}
                placeholder="0"
                className="bg-background/70 border-border/50 rounded-xl"
              />
              {errors.solutionYoutubeStartSecond && <p className="text-destructive text-xs">{errors.solutionYoutubeStartSecond.message}</p>}
            </div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              {"Linke t\u0131kland\u0131\u011f\u0131nda video do\u011frudan bu saniyeden ba\u015flar. Eski \u00e7\u00f6z\u00fcm linkleri de otomatik korunur."}
            </p>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="rounded-xl font-medium">
              {"\u0130ptal"}
            </Button>
            <Button type="submit" disabled={isPending} className="rounded-xl px-8 font-semibold">
              {isPending ? "Kaydediliyor..." : isEdit ? "G\u00fcncelle" : "Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

