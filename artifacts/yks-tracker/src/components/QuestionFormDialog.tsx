import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, UploadCloud, X } from "lucide-react";
import {
  useCreateQuestion,
  useUpdateQuestion,
  useUploadQuestionImage,
  QuestionCategory,
  QuestionSource,
  QuestionStatus,
  QuestionChoice,
  customFetch,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";
import { convertLegacyMathValueToLatex } from "@/components/math/mathExpression";
import {
  formatVideoTimestamp,
  parseVideoTimestampInput,
  getYoutubeVideoId,
} from "@/lib/youtubeEmbed";
import { ResourceSelect } from "@/components/resources/ResourceSelect";

import { Badge } from "@/components/ui/badge";

const MathLiveChoiceEditor = lazy(() =>
  import("@/components/math/MathLiveChoiceEditor").then((module) => ({
    default: module.MathLiveChoiceEditor,
  })),
);

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;
type OptionLabel = (typeof OPTION_LABELS)[number];
type OptionItem = { label: OptionLabel; text: string };
const formSchema = z
  .object({
    lesson: z.string().min(1, "Ders adı zorunludur"),
    topic: z.string().min(1, "Konu seçimi zorunludur"),
    resourceId: z.number().optional().nullable(),
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
      .refine(
        (v) => !v || /^https?:\/\//i.test(v),
        "Geçerli bir http(s) adresi girin",
      ),
    solutionYoutubeUrl: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (v) => !v || /^https?:\/\//i.test(v),
        "Geçerli bir http(s) adresi girin",
      ),
    solutionYoutubeStartSecond: z.string().optional().or(z.literal("")),
    solutionYoutubeEndSecond: z.string().optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    const hasVideo = !!value.solutionYoutubeUrl?.trim();
    if (!hasVideo) return;

    const isYoutube = !!getYoutubeVideoId(value.solutionYoutubeUrl);
    if (!isYoutube) return; // Non-YouTube URLs do not require durations

    const start = parseVideoTimestampInput(value.solutionYoutubeStartSecond);
    const end = parseVideoTimestampInput(value.solutionYoutubeEndSecond);

    if (Number.isNaN(start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solutionYoutubeStartSecond"],
        message: "Süre formatı 1:25 gibi olmalı",
      });
      return;
    }

    if (Number.isNaN(end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solutionYoutubeEndSecond"],
        message: "Süre formatı 2:10 gibi olmalı",
      });
      return;
    }

    if (start == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solutionYoutubeStartSecond"],
        message: "Video linki varsa başlangıç zamanı zorunludur",
      });
    }

    if (start != null && end != null && end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solutionYoutubeEndSecond"],
        message: "Bitiş saniyesi başlangıçtan büyük olmalıdır",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface QuestionForEdit {
  id: number;
  resourceId?: number | null;
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
  solutionYoutubeEndSecond?: number | null;
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
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultValues?: {
    testName?: string;
    publisher?: string;
    category?: QuestionCategory;
    lesson?: string;
    topic?: string;
    resourceId?: number | null;
    source?: QuestionSource;
    entryType?: "kaynak" | "diger" | "deneme";
    examType?: "Genel" | "Branş" | "Konu";
  };
}

function emptyOptionTexts(): Record<OptionLabel, string> {
  return { A: "", B: "", C: "", D: "", E: "" };
}

async function prepareQuestionImage(file: File) {
  const supportedInput = ["image/jpeg", "image/png", "image/webp"].includes(
    file.type,
  );
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
  const scale = Math.min(
    1,
    maxSide / Math.max(image.naturalWidth, image.naturalHeight),
  );
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

export function QuestionFormDialog({
  question,
  trigger,
  onSaved,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultValues,
}: Props) {
  const isEdit = !!question;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setInternalOpen;
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [keepExistingImage, setKeepExistingImage] = useState(true);
  const [useManualChoices, setUseManualChoices] = useState(false);
  const [optionTexts, setOptionTexts] =
    useState<Record<OptionLabel, string>>(emptyOptionTexts());
  const [entryType, setEntryType] = useState<"kaynak" | "diger" | "deneme">(
    question?.source === "Deneme"
      ? "deneme"
      : question?.resourceId
      ? "kaynak"
      : defaultValues?.entryType ?? "kaynak"
  );
  const [denemeType, setDenemeType] = useState<"Genel" | "Branş" | "Konu">("Genel");
  const [selectedResourceObj, setSelectedResourceObj] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateQuestion();
  const updateMutation = useUpdateQuestion();
  const uploadMutation = useUploadQuestionImage();

  const { data: practiceExams = [] } = useQuery<Array<{
    id: number;
    title: string;
    examType: "Genel" | "Branş" | "Konu";
    category: string;
    lesson?: string | null;
    topic?: string | null;
    publisher?: string | null;
    resourceId?: number | null;
  }>>({
    queryKey: ["practice-exams"],
    queryFn: () => customFetch("/api/practice-exams"),
    enabled: open,
  });

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
      category: defaultValues?.category ?? QuestionCategory.TYT,
      source: defaultValues?.source ?? QuestionSource.Deneme,
      status: QuestionStatus.Cozulmedi,
      solutionUrl: "",
      solutionYoutubeUrl: "",
      solutionYoutubeStartSecond: "",
      solutionYoutubeEndSecond: "",
      testName: defaultValues?.testName ?? "",
      publisher: defaultValues?.publisher ?? "",
      lesson: defaultValues?.lesson ?? "",
      topic: defaultValues?.topic ?? "",
      resourceId: defaultValues?.resourceId ?? null,
    },
  });

  const category = watch("category");
  const lesson = watch("lesson");
  const solutionYoutubeUrlValue = watch("solutionYoutubeUrl");
  const isYoutube = useMemo(() => {
    return !!getYoutubeVideoId(solutionYoutubeUrlValue);
  }, [solutionYoutubeUrlValue]);

  const lessonOptions = useMemo(
    () => getLessonsForCategory(category).map((l) => l.name),
    [category],
  );
  const topicOptions = useMemo(() => {
    if (!lesson) return [];
    return getTopicsForLesson(category, lesson);
  }, [category, lesson]);

  const filteredExams = useMemo(() => {
    return practiceExams.filter(
      (e) => e.examType === denemeType && e.category === category
    );
  }, [practiceExams, denemeType, category]);

  const manualChoiceLabels = useMemo(() => {
    if (!useManualChoices) return OPTION_LABELS;
    return OPTION_LABELS.filter(
      (label) => optionTexts[label].trim().length > 0,
    );
  }, [optionTexts, useManualChoices]);

  useEffect(() => {
    if (category === "Geometri") {
      setValue("lesson", "Geometri");
    }
  }, [category, setValue]);

  useEffect(() => {
    if (open && isEdit && question) {
      if (question.source === "Deneme") {
        setEntryType("deneme");
      } else if (question.resourceId) {
        setEntryType("kaynak");
      } else {
        setEntryType("diger");
      }

      reset({
        lesson: question.lesson,
        topic: question.topic ?? "",
        resourceId: question.resourceId ?? null,
        description: question.description ?? "",
        publisher: question.publisher ?? "",
        testName: question.testName ?? "",
        testNo: question.testNo ?? "",
        category: question.category as QuestionCategory,
        source: question.source as QuestionSource,
        status: question.status as QuestionStatus,
        choice: (question.choice as QuestionChoice) ?? undefined,
        solutionUrl: question.solutionUrl ?? "",
        solutionYoutubeUrl:
          question.solutionYoutubeUrl ?? question.solutionUrl ?? "",
        solutionYoutubeStartSecond: formatVideoTimestamp(
          question.solutionYoutubeStartSecond,
        ),
        solutionYoutubeEndSecond: formatVideoTimestamp(
          question.solutionYoutubeEndSecond,
        ),
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
          if (OPTION_LABELS.includes(label))
            next[label] = convertLegacyMathValueToLatex(option.text ?? "");
        }
        setOptionTexts(next);
        setUseManualChoices(true);
      } else {
        setOptionTexts(emptyOptionTexts());
        setUseManualChoices(false);
      }
    } else if (open && !isEdit) {
      setEntryType(defaultValues?.entryType ?? "kaynak");
      if (defaultValues?.examType) {
        setDenemeType(defaultValues.examType);
      }
      reset({
        category: defaultValues?.category ?? QuestionCategory.TYT,
        source: defaultValues?.source ?? (defaultValues?.entryType === "deneme" ? QuestionSource.Deneme : QuestionSource.Banka),
        status: QuestionStatus.Cozulmedi,
        testName: defaultValues?.testName ?? "",
        publisher: defaultValues?.publisher ?? "",
        lesson: defaultValues?.lesson ?? "",
        topic: defaultValues?.topic ?? "",
        resourceId: defaultValues?.resourceId ?? null,
        solutionUrl: "",
        solutionYoutubeUrl: "",
        solutionYoutubeStartSecond: "",
        solutionYoutubeEndSecond: "",
      });
      setImagePreview(null);
      setImageFile(null);
      setUseManualChoices(false);
      setOptionTexts(emptyOptionTexts());
    }
  }, [isEdit, open, question, reset, defaultValues]);

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
        toast({
          title: "Görsel hazırlanamadı",
          description: (error as Error).message,
          variant: "destructive",
        });
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
          toast({
            title: "Görsel hazırlanamadı",
            description: (error as Error).message,
            variant: "destructive",
          });
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
        toast({
          title: "Ders Seçimi Zorunlu",
          description: "Lütfen bir ders seçin.",
          variant: "destructive",
        });
        setError("lesson", { type: "manual", message: "Ders adı zorunludur" });
        return;
      }
      if (entryType === "kaynak" && !data.resourceId) {
        toast({
          title: "Kaynak Seçimi Zorunlu",
          description: "Lütfen kayıtlı kaynaklarınızdan birini seçin veya yeni kaynak ekleyin.",
          variant: "destructive",
        });
        return;
      }

      // Deneme sorularında konu boş ise otomatik "Genel" konusu atanır
      let finalTopic = data.topic?.trim() || "";
      if (!finalTopic) {
        if (entryType === "deneme") {
          finalTopic = "Genel";
        } else {
          toast({
            title: "Konu Seçimi Zorunlu",
            description: "Lütfen bir konu seçin.",
            variant: "destructive",
          });
          setError("topic", {
            type: "manual",
            message: "Konu seçimi zorunludur",
          });
          return;
        }
      }

      let imageUrl: string | null | undefined = undefined;
      const manualOptions: OptionItem[] | null = useManualChoices
        ? OPTION_LABELS.map((label) => ({
            label,
            text: optionTexts[label].trim(),
          })).filter((item) => item.text.length > 0)
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
        const res = await uploadMutation.mutateAsync({
          data: { imageData: base64Data, mimeType: imageFile.type },
        });
        imageUrl = res.url;
      } else if (!keepExistingImage && !imageFile) {
        imageUrl = null;
      } else if (isEdit && keepExistingImage) {
        imageUrl = question?.imageUrl ?? null;
      }

      const startSecond = parseVideoTimestampInput(
        data.solutionYoutubeStartSecond,
      );
      const endSecond = parseVideoTimestampInput(data.solutionYoutubeEndSecond);
      const hasUrl = !!data.solutionYoutubeUrl?.trim();
      const isYoutubeUrl = hasUrl && !!getYoutubeVideoId(data.solutionYoutubeUrl);

      const payload = {
        ...data,
        topic: finalTopic,
        testName: data.testName || defaultValues?.testName || null,
        publisher: data.publisher || defaultValues?.publisher || null,
        resourceId: data.resourceId ?? defaultValues?.resourceId ?? null,
        source: entryType === "deneme" ? QuestionSource.Deneme : (data.source as any),
        imageUrl: isEdit ? imageUrl : (imageUrl ?? null),
        options: manualOptions,
        choice: data.choice || null,
        solutionUrl: data.solutionYoutubeUrl?.trim() || null,
        solutionYoutubeUrl: isYoutubeUrl ? (data.solutionYoutubeUrl?.trim() || null) : null,
        solutionYoutubeStartSecond:
          isYoutubeUrl && startSecond != null && !Number.isNaN(startSecond)
            ? startSecond
            : null,
        solutionYoutubeEndSecond:
          isYoutubeUrl && endSecond != null && !Number.isNaN(endSecond)
            ? endSecond
            : null,
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
    } catch (error: any) {
      console.error("Question save error:", error);
      toast({
        title: "Hata",
        description: error?.message || "İşlem sırasında bir hata oluştu.",
        variant: "destructive",
      });
    }
  };

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    uploadMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="rounded-xl px-6 font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all duration-300 gap-2">
              <PlusCircle className="w-5 h-5" />
              Soru Ekle
            </Button>
          )}
        </DialogTrigger>
      )}

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
          <DialogTitle className="text-2xl font-display">
            {isEdit ? "Soruyu D\u00fczenle" : "Yeni Soru Ekle"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Soru bilgilerini, görseli ve gerekiyorsa matematiksel şıklarını bu
            pencereden düzenleyebilirsin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label>
              {"Soru G\u00f6rseli"}{" "}
              <span className="text-muted-foreground text-xs">
                {
                  "(S\u00fcr\u00fckle b\u0131rak veya Ctrl+V ile yap\u0131\u015ft\u0131r)"
                }
              </span>
            </Label>
            {!imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-border/60 hover:border-primary/50 rounded-xl bg-muted/20 flex flex-col items-center justify-center cursor-pointer transition-colors group"
              >
                <div className="p-3 bg-primary/10 rounded-full group-hover:scale-110 transition-transform mb-2">
                  <UploadCloud className="w-6 h-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {"G\u00f6rsel Y\u00fckle"}
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={onFileSelect}
                />
              </div>
            ) : (
              <div className="relative w-full rounded-xl overflow-hidden border border-border/50 bg-foreground/10 group flex justify-center">
                <img
                  src={imagePreview}
                  alt={"\u00d6nizleme"}
                  className="max-h-56 object-contain"
                />
                <div className="absolute inset-0 bg-foreground/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={clearImage}
                    className="rounded-xl"
                  >
                    <X className="w-4 h-4 mr-2" /> {"Kald\u0131r"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Giriş Türü Seçimi */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2">
            <Label className="font-semibold text-xs text-primary uppercase tracking-wider">
              Soru Ekleme Yöntemi *
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={entryType === "kaynak" ? "default" : "outline"}
                onClick={() => {
                  setEntryType("kaynak");
                  setValue("source", QuestionSource.Banka);
                }}
                className="rounded-xl text-xs sm:text-sm font-medium px-2"
              >
                Kayıtlı Kaynak
              </Button>
              <Button
                type="button"
                variant={entryType === "deneme" ? "default" : "outline"}
                onClick={() => {
                  setEntryType("deneme");
                  setValue("source", QuestionSource.Deneme);
                  setValue("resourceId", null);
                  setSelectedResourceObj(null);
                }}
                className="rounded-xl text-xs sm:text-sm font-medium px-2"
              >
                Deneme Sorusu
              </Button>
              <Button
                type="button"
                variant={entryType === "diger" ? "default" : "outline"}
                onClick={() => {
                  setEntryType("diger");
                  setValue("resourceId", null);
                  setSelectedResourceObj(null);
                }}
                className="rounded-xl text-xs sm:text-sm font-medium px-2"
              >
                YouTube / Web...
              </Button>
            </div>
          </div>

          {/* Dinamik Alanlar */}
          {entryType === "kaynak" ? (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="space-y-1.5 min-w-0 max-w-full">
                <Label className="font-semibold">Kayıtlı Kaynak Seçin *</Label>
                <ResourceSelect
                  value={watch("resourceId")}
                  onValueChange={(resId, _resName, _resPub, resObj) => {
                    setValue("resourceId", resId);
                    setSelectedResourceObj(resObj);
                    if (resObj) {
                      if (resObj.category) setValue("category", resObj.category as any);
                      if (resObj.publisher) setValue("publisher", resObj.publisher);
                      if (resObj.lesson) setValue("lesson", resObj.lesson);
                      if (resObj.topic) {
                        setValue("topic", resObj.topic);
                      } else if (resObj.resourceType === "Branş Denemesi") {
                        setValue("topic", "Genel");
                      }
                    }
                  }}
                />
                {watch("resourceId") ? (
                  <p className="text-xs text-emerald-600 font-medium pt-1 truncate h-5 flex items-center">
                    🔒 Kaynak kilitlendi ({watch("category")} • {watch("lesson")}{watch("topic") ? ` • ${watch("topic")}` : ""})
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 font-medium pt-1 truncate h-5 flex items-center">
                    Lütfen önceden eklediğiniz kaynaklardan birini seçin veya sağdaki (+) butonuyla yeni ekleyin.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ders seçimi */}
                <div className="space-y-2">
                  <Label>Ders * {selectedResourceObj?.lesson && <span className="text-[11px] text-muted-foreground font-normal">(Kaynaktan kilitli)</span>}</Label>
                  <Select
                    value={watch("lesson") || ""}
                    onValueChange={(val) => {
                      setValue("lesson", val);
                      setValue("topic", "");
                      clearErrors("lesson");
                    }}
                    disabled={category === "Geometri" || !!selectedResourceObj?.lesson}
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
                </div>

                {/* Konu seçimi (Serbest/Açık) */}
                <div className="space-y-2">
                  <Label>Konu *</Label>
                  <Select
                    value={watch("topic") || "NONE"}
                    onValueChange={(val) => {
                      setValue("topic", val === "NONE" ? "" : val, { shouldValidate: true });
                      clearErrors("topic");
                    }}
                    disabled={!lesson && category !== "Geometri"}
                  >
                    <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                      <SelectValue placeholder={lesson ? "Konu seçin..." : "Önce ders seçin"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Konu seçilmedi</SelectItem>
                      {topicOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.topic && <p className="text-destructive text-xs">{errors.topic.message}</p>}
                </div>
              </div>
            </div>
          ) : entryType === "deneme" ? (
            <div className="space-y-4 rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
              {defaultValues?.testName ? (
                /* Deneme Kartından Otomatik Çekilen Bilgi Paneli */
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                        🏆 Deneme: <span className="font-bold">{watch("testName")}</span>
                      </p>
                      <p className="text-[11px] text-purple-600/80 dark:text-purple-400/80">
                        {watch("category")} • {denemeType === "Genel" ? "Genel Deneme" : denemeType === "Branş" ? "Branş Denemesi" : "Konu Denemesi"}
                        {watch("publisher") ? ` • ${watch("publisher")}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-400/40 text-xs shrink-0">
                      🔒 Deneme Kilitli
                    </Badge>
                  </div>

                  {/* Genel Deneme: Sadece Ders ve Konu Seçimi */}
                  {denemeType === "Genel" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div className="space-y-2">
                        <Label>Ders Seçin *</Label>
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
                        <Label>Konu Seçin *</Label>
                        <Select
                          value={watch("topic") || "NONE"}
                          onValueChange={(val) => {
                            setValue("topic", val === "NONE" ? "" : val, { shouldValidate: true });
                            clearErrors("topic");
                          }}
                          disabled={!lesson && category !== "Geometri"}
                        >
                          <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                            <SelectValue placeholder={lesson ? "Konu seçin..." : "Önce ders seçin"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">Konu seçilmedi</SelectItem>
                            {topicOptions.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.topic && <p className="text-destructive text-xs">{errors.topic.message}</p>}
                      </div>
                    </div>
                  )}

                  {/* Branş Denemesi: Ders Otomatik Çekildi/Kilitli, Sadece Konu Seçimi */}
                  {denemeType === "Branş" && (
                    <div className="space-y-3 pt-1">
                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs flex justify-between items-center">
                        <span className="text-muted-foreground font-medium">Ders:</span>
                        <span className="font-bold text-foreground">{watch("lesson") || "Belirtilmedi"} (Denemeden Çekildi)</span>
                      </div>
                      <div className="space-y-2">
                        <Label>Konu Seçin *</Label>
                        <Select
                          value={watch("topic") || "NONE"}
                          onValueChange={(val) => {
                            setValue("topic", val === "NONE" ? "" : val, { shouldValidate: true });
                            clearErrors("topic");
                          }}
                          disabled={!lesson && category !== "Geometri"}
                        >
                          <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                            <SelectValue placeholder="Konu seçin..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NONE">Konu seçilmedi</SelectItem>
                            {topicOptions.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.topic && <p className="text-destructive text-xs">{errors.topic.message}</p>}
                      </div>
                    </div>
                  )}

                  {/* Konu Denemesi: Hem Ders hem Konu Kilitli */}
                  {denemeType === "Konu" && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
                      <span>🔒 Ders ve Konu Otomatik Çekildi</span>
                      <span className="font-bold">{watch("lesson")} • {watch("topic")}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Manuel Deneme Sorusu Ekleme Paneli */
                <>
                  <div className="space-y-2">
                    <Label className="font-semibold text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                      Deneme Türü Seçimi
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["Genel", "Branş", "Konu"] as const).map((t) => (
                        <Button
                          key={t}
                          type="button"
                          variant={denemeType === t ? "default" : "outline"}
                          size="sm"
                          onClick={() => setDenemeType(t)}
                          className="rounded-xl text-xs font-medium"
                        >
                          {t === "Genel" ? "Genel Deneme" : t === "Branş" ? "Branş Denemesi" : "Konu Denemesi"}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Kaydedilmiş Deneme Seçimi */}
                  <div className="space-y-2">
                    <Label className="font-semibold text-xs">Kaydedilmiş Denemelerinizden Seçin (Opsiyonel)</Label>
                    <Select
                      onValueChange={(val) => {
                        if (val === "NONE") return;
                        const examId = Number(val);
                        const selectedExam = practiceExams.find((e) => e.id === examId);
                        if (selectedExam) {
                          setValue("testName", selectedExam.title);
                          if (selectedExam.publisher) setValue("publisher", selectedExam.publisher);
                          if (selectedExam.category) setValue("category", selectedExam.category as QuestionCategory);
                          if (selectedExam.lesson) setValue("lesson", selectedExam.lesson);
                          if (selectedExam.topic) setValue("topic", selectedExam.topic);
                          if (selectedExam.resourceId) setValue("resourceId", selectedExam.resourceId);
                        }
                      }}
                    >
                      <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                        <SelectValue placeholder={filteredExams.length > 0 ? "Mevcut denemelerinizden seçin..." : "Kayıtlı deneme bulunamadı (Manuel girin)"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Seçim yapma (Manuel gir)</SelectItem>
                        {filteredExams.map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>
                            {e.title} ({e.category}{e.lesson ? ` • ${e.lesson}` : ""}{e.topic ? ` • ${e.topic}` : ""})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Deneme / Sınav Adı *</Label>
                      <Input
                        {...register("testName")}
                        placeholder="Örn: 3D Türkiye Geneli Deneme 1"
                        className="bg-muted/30 border-border/50 rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Yayınevi / Yayıncı</Label>
                      <Input
                        {...register("publisher")}
                        placeholder="Örn: 3D, Bilgi Sarmal, Özdebir..."
                        className="bg-muted/30 border-border/50 rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Kategori *</Label>
                      <Select
                        value={watch("category")}
                        onValueChange={(val) => setValue("category", val as QuestionCategory)}
                      >
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
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label>Konu *</Label>
                      <Select
                        value={watch("topic") || "NONE"}
                        onValueChange={(val) => {
                          setValue("topic", val === "NONE" ? "" : val, { shouldValidate: true });
                          clearErrors("topic");
                        }}
                        disabled={!lesson && category !== "Geometri"}
                      >
                        <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                          <SelectValue placeholder={lesson ? "Konu seçin..." : "Önce ders seçin"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Konu seçilmedi</SelectItem>
                          {topicOptions.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.topic && <p className="text-destructive text-xs">{errors.topic.message}</p>}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="space-y-2">
                <Label>Diğer Kaynak Türü *</Label>
                <Select
                  value={watch("source")}
                  onValueChange={(val) => setValue("source", val as QuestionSource)}
                >
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
                <Label>Yayınevi / Yayıncı</Label>
                <Input
                  {...register("publisher")}
                  placeholder="3D, Bilgi Sarmal, VDD..."
                  className="bg-muted/30 border-border/50 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label>Kategori *</Label>
                <Select
                  value={watch("category")}
                  onValueChange={(val) => setValue("category", val as QuestionCategory)}
                >
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
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Konu *</Label>
                <Select
                  value={watch("topic") || "NONE"}
                  onValueChange={(val) => {
                    setValue("topic", val === "NONE" ? "" : val, { shouldValidate: true });
                    clearErrors("topic");
                  }}
                  disabled={!lesson && category !== "Geometri"}
                >
                  <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                    <SelectValue placeholder={lesson ? "Konu seçin..." : "Önce ders seçin"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Konu seçilmedi</SelectItem>
                    {topicOptions.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.topic && <p className="text-destructive text-xs">{errors.topic.message}</p>}
              </div>
            </div>
          )}

            <div className="space-y-2">
              <Label>{"Do\u011fru \u015e\u0131k"}</Label>
              <Select
                value={watch("choice") || "NONE"}
                onValueChange={(val) =>
                  setValue(
                    "choice",
                    val === "NONE" ? null : (val as QuestionChoice),
                  )
                }
              >
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue placeholder="Belirtilmedi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Belirtilmedi</SelectItem>
                  {(useManualChoices ? manualChoiceLabels : OPTION_LABELS).map(
                    (c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{"Test Ad\u0131"}</Label>
              <Input
                {...register("testName")}
                placeholder={"Deneme ad\u0131"}
                className="bg-muted/30 border-border/50 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label>Soru No</Label>
              <Input
                {...register("testNo")}
                placeholder="Örn: 42"
                className="bg-muted/30 border-border/50 rounded-xl"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Durum</Label>
              <Select
                value={watch("status")}
                onValueChange={(val) =>
                  setValue("status", val as QuestionStatus)
                }
              >
                <SelectTrigger className="bg-muted/30 border-border/50 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={QuestionStatus.Cozulmedi}>
                    {"\u00c7\u00f6z\u00fclmedi"}
                  </SelectItem>
                  <SelectItem value={QuestionStatus.DogruCozuldu}>
                    {"Do\u011fru \u00c7\u00f6z\u00fcld\u00fc"}
                  </SelectItem>
                  <SelectItem value={QuestionStatus.YanlisHocayaSor}>
                    {"Yanl\u0131\u015f / Hocaya Sor"}
                  </SelectItem>
                </SelectContent>
              </Select>
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
                <Suspense
                  fallback={
                    <div className="rounded-xl border border-border/50 bg-background/70 p-4 text-sm text-muted-foreground">
                      Matematik editörü hazırlanıyor...
                    </div>
                  }
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {OPTION_LABELS.map((label) => (
                      <div key={label} className="space-y-1">
                        <Label className="text-xs">
                          {label} {"\u015e\u0131kk\u0131"}
                        </Label>
                        <MathLiveChoiceEditor
                          value={optionTexts[label]}
                          onChange={(nextValue) =>
                            setOptionTexts((prev) => ({
                              ...prev,
                              [label]: nextValue,
                            }))
                          }
                          placeholder={`${label}\u00A0\u015f\u0131k\u00A0metni`}
                        />
                      </div>
                    ))}
                  </div>
                </Suspense>
                <p className="text-[11px] text-muted-foreground">
                  MathLive editörü odaklandığında matematik klavyesi açılır.
                  Limit, kesir, integral ve iç içe ifadeleri doğrudan bu alanda
                  yazabilirsin.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{"A\u00e7\u0131klama / Notlar"}</Label>
            <Textarea
              {...register("description")}
              placeholder={"Bu soru hakk\u0131nda notlar\u0131n\u0131z..."}
              className="bg-muted/30 border-border/50 rounded-xl resize-none min-h-[80px]"
            />
          </div>

          <div className={`grid grid-cols-1 gap-3 rounded-xl border border-border/50 bg-muted/20 p-3 ${isYoutube ? "sm:grid-cols-[1fr_150px_150px]" : "sm:grid-cols-1"}`}>
            <div className="space-y-2">
              <Label>{"\u00c7\u00f6z\u00fcm videosu linki"}</Label>
              <Input
                {...register("solutionYoutubeUrl")}
                type="url"
                placeholder="https://..."
                className="bg-background/70 border-border/50 rounded-xl"
              />
              {errors.solutionYoutubeUrl && (
                <p className="text-destructive text-xs">
                  {errors.solutionYoutubeUrl.message}
                </p>
              )}
            </div>
            {isYoutube && (
              <>
                <div className="space-y-2">
                  <Label>{"Başlangıç (dk:sn)"}</Label>
                  <Input
                    {...register("solutionYoutubeStartSecond")}
                    type="text"
                    inputMode="numeric"
                    placeholder="1:25"
                    className="bg-background/70 border-border/50 rounded-xl"
                  />
                  {errors.solutionYoutubeStartSecond && (
                    <p className="text-destructive text-xs">
                      {errors.solutionYoutubeStartSecond.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{"Bitiş (dk:sn)"}</Label>
                  <Input
                    {...register("solutionYoutubeEndSecond")}
                    type="text"
                    inputMode="numeric"
                    placeholder="Opsiyonel"
                    className="bg-background/70 border-border/50 rounded-xl"
                  />
                  {errors.solutionYoutubeEndSecond && (
                    <p className="text-destructive text-xs">
                      {errors.solutionYoutubeEndSecond.message}
                    </p>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground sm:col-span-3">
                  {
                    "Süreleri 1:25 veya 01:12:05 gibi yazabilirsin. Video linki eklersen başlangıç zorunludur; bitiş boşsa video sonuna kadar oynar, girilirse sadece seçilen kesitte durur."
                  }
                </p>
              </>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="rounded-xl font-medium"
            >
              {"\u0130ptal"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="rounded-xl px-8 font-semibold"
            >
              {isPending
                ? "Kaydediliyor..."
                : isEdit
                  ? "G\u00fcncelle"
                  : "Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
