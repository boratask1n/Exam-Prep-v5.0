import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateResource,
  useUpdateResource,
  useUploadQuestionImage,
  ResourceWithStats,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getLessonsForCategory, getTopicsForLesson } from "@/lib/lessonTopics";
import {
  RESOURCE_TYPES,
  CATEGORIES,
  requiresTopic,
  supportsTopic,
  requiresLesson,
  type ResourceType,
} from "@/lib/resourceConfig";

// ─── Kapak fotoğrafı sıkıştırma ────────────────────────────────────────────
// Kaynak kapakları küçük bir küçük resim (thumbnail); ham telefon fotoğrafını
// (2-8MB) olduğu gibi base64 metin olarak veritabanına yazmak yerine, soru
// görsellerinde kullanılan yöntemle aynı şekilde sıkıştırıp dosya olarak
// yüklüyor, veritabanına sadece kısa bir URL kaydediyoruz.
async function prepareCoverImage(file: File) {
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

  const maxSide = 600; // kapak sadece küçük bir kart görselinde kullanılıyor
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
    canvas.toBlob(resolve, "image/webp", 0.82);
  });
  if (!optimizedBlob) throw new Error("Görsel sıkıştırılamadı.");

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Görsel okunamadı."));
    reader.readAsDataURL(optimizedBlob);
  });

  return { base64Data, mimeType: "image/webp" };
}

// ─── Form şeması ──────────────────────────────────────────────────────────────

const formSchema = z
  .object({
    name: z.string().optional(),
    publisher: z.string().optional(),
    category: z.string().default("TYT"),
    lesson: z.string().optional(),
    topic: z.string().optional(),
    resourceType: z.string().default("Soru Bankası"),
    coverImageUrl: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Ders zorunluluğu (Geometri ve Genel Deneme hariç tüm türler için)
    if (requiresLesson(data.resourceType) && data.category !== "Geometri" && !data.lesson?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lesson"],
        message: "İlgili ders seçimi zorunludur",
      });
    }
    // Konu zorunluluğu (Fasikül ve Konu Denemesi için)
    if (requiresTopic(data.resourceType) && !data.topic?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topic"],
        message: "Bu kaynak türü için konu seçimi zorunludur",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceForEdit?: ResourceWithStats | null;
  onCreated?: (newResourceId: number) => void;
  defaultCategory?: string;
  defaultLesson?: string;
  defaultResourceType?: string;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export function ResourceDialog({
  open,
  onOpenChange,
  resourceForEdit,
  onCreated,
  defaultCategory = "TYT",
  defaultLesson,
  defaultResourceType,
}: ResourceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!resourceForEdit;

  const createMutation = useCreateResource();
  const updateMutation = useUpdateResource();
  const uploadCoverMutation = useUploadQuestionImage();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      publisher: "",
      category: defaultCategory,
      lesson: defaultLesson ?? "",
      topic: "",
      resourceType: defaultResourceType ?? "Soru Bankası",
      coverImageUrl: "",
    },
  });

  const selectedCategory = form.watch("category");
  const selectedLesson = form.watch("lesson");
  const selectedTopic = form.watch("topic");
  const selectedPublisher = form.watch("publisher");
  const selectedResourceType = form.watch("resourceType") as ResourceType;

  // Konu seçiminin aktif olup olmadığı
  const topicEnabled = supportsTopic(selectedResourceType) && !!selectedLesson;
  // Konu seçiminin zorunlu olup olmadığı
  const topicRequired = requiresTopic(selectedResourceType);
  // Ders seçiminin disabled olup olmadığı
  const lessonDisabled = selectedCategory === "Geometri" || selectedResourceType === "Genel Deneme";

  const availableLessons = getLessonsForCategory(selectedCategory);
  const availableTopics = useMemo(() => {
    if (!selectedLesson) return [];
    return getTopicsForLesson(selectedCategory, selectedLesson);
  }, [selectedCategory, selectedLesson]);

  // Otomatik isim önerisi
  const suggestedName = useMemo(() => {
    const parts = [
      selectedPublisher?.trim(),
      selectedCategory,
      selectedLesson,
      selectedTopic ? selectedTopic : null,
      selectedResourceType,
    ].filter(Boolean);
    return parts.join(" ");
  }, [selectedPublisher, selectedCategory, selectedLesson, selectedTopic, selectedResourceType]);

  // Dialog açılınca formu sıfırla
  useEffect(() => {
    if (open) {
      if (resourceForEdit) {
        form.reset({
          name: resourceForEdit.name,
          publisher: resourceForEdit.publisher ?? "",
          category: resourceForEdit.category,
          lesson: resourceForEdit.lesson ?? "",
          topic: (resourceForEdit as any).topic ?? "",
          resourceType: resourceForEdit.resourceType,
          coverImageUrl: (resourceForEdit as any).coverImageUrl ?? "",
        });
      } else {
        form.reset({
          name: "",
          publisher: "",
          category: defaultCategory,
          lesson: defaultCategory === "Geometri" ? "Geometri" : (defaultLesson ?? ""),
          topic: "",
          resourceType: "Soru Bankası",
          coverImageUrl: "",
        });
      }
    }
  }, [open, resourceForEdit, defaultCategory, defaultLesson, form]);

  const onSubmit = async (values: FormValues) => {
    try {
      const finalName =
        values.name?.trim() ||
        suggestedName ||
        `${values.category} ${values.lesson} ${values.resourceType}`;

      const payload = {
        name: finalName,
        publisher: values.publisher?.trim() || null,
        category: values.category,
        lesson: values.lesson?.trim() || null,
        topic: supportsTopic(values.resourceType)
          ? (values.topic?.trim() || null)
          : (values.resourceType === "Soru Bankası" || values.resourceType === "Ders Kitabı" ? "Tüm Konular (Genel)" : null),
        resourceType: values.resourceType,
        coverImageUrl: values.coverImageUrl?.trim() || null,
      } as any;

      if (isEditing && resourceForEdit) {
        await updateMutation.mutateAsync({ id: resourceForEdit.id, data: payload });
        toast({ title: "Başarılı", description: "Kaynak başarıyla güncellendi." });
      } else {
        const res = await createMutation.mutateAsync({ data: payload });
        toast({ title: "Başarılı", description: "Yeni kaynak oluşturuldu." });
        if (onCreated && res?.id) {
          onCreated(res.id);
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Hata",
        description: err?.message || "Kaynak kaydedilirken bir sorun oluştu.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Kaynağı Düzenle" : "Yeni Kaynak Ekle"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Kaynak bilgilerini güncelleyin."
              : "Soru bankası, deneme veya fasikül kaynağınızı ekleyin."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          {/* Kaynak Türü + Kategori */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kaynak Türü *</Label>
              <Select
                value={form.watch("resourceType")}
                onValueChange={(val) => {
                  form.setValue("resourceType", val, { shouldValidate: true });
                  // Branş Denemesi → topic'i temizle, Soru Bankası/Ders Kitabı → "Tüm Konular (Genel)" yap
                  if (!supportsTopic(val)) {
                    form.setValue(
                      "topic",
                      val === "Soru Bankası" || val === "Ders Kitabı" ? "Tüm Konular (Genel)" : ""
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tür seçin" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Kategori *</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(val) => {
                  form.setValue("category", val, { shouldValidate: true });
                  form.setValue(
                    "lesson",
                    val === "Geometri" ? "Geometri" : "",
                    { shouldValidate: true }
                  );
                  form.setValue("topic", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategori seçin" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* İlgili Ders */}
          <div className="space-y-1.5">
            <Label>
              İlgili Ders *
            </Label>
            <Select
              value={form.watch("lesson") || ""}
              onValueChange={(val) => {
                form.setValue("lesson", val, { shouldValidate: true });
                form.setValue("topic", "");
              }}
              disabled={lessonDisabled}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    selectedResourceType === "Genel Deneme"
                      ? "Tüm Dersler (Genel)"
                      : lessonDisabled
                      ? "Geometri"
                      : "Ders Seçin"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableLessons.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.lesson && (
              <p className="text-xs text-destructive">
                {form.formState.errors.lesson.message}
              </p>
            )}
          </div>

          {/* Konu Seçimi — Branş Denemesi'nde gizli, Fasikül/Konu Denemesi'nde zorunlu */}
          {supportsTopic(selectedResourceType) && (
            <div className="space-y-1.5">
              <Label>
                Konu{" "}
                {topicRequired ? (
                  <span className="text-destructive text-xs">*</span>
                ) : (
                  <span className="text-xs text-muted-foreground font-normal">
                    (Opsiyonel — boşsa Genel)
                  </span>
                )}
              </Label>
              <Select
                value={form.watch("topic") || "NONE"}
                onValueChange={(val) =>
                  form.setValue("topic", val === "NONE" ? "" : val, {
                    shouldValidate: true,
                  })
                }
                disabled={!topicEnabled}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedLesson
                        ? "Önce ders seçin"
                        : topicRequired
                        ? "Konu seçin"
                        : "Tüm Konular (Genel)"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {!topicRequired && (
                    <SelectItem value="NONE">Tüm Konular (Genel)</SelectItem>
                  )}
                  {availableTopics.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.topic && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.topic.message}
                </p>
              )}
            </div>
          )}

          {/* Yayın Evi / Kurum */}
          <div className="space-y-1.5">
            <Label htmlFor="publisher">Yayın Evi / Kurum</Label>
            <Input
              id="publisher"
              placeholder="ör. 3D Yayınları, Apotemi, Palme..."
              {...form.register("publisher")}
            />
          </div>

          {/* Kaynak Adı */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Kaynak Adı</Label>
            <Input
              id="name"
              placeholder={suggestedName || "ör. 3D TYT Matematik Soru Bankası"}
              {...form.register("name")}
            />
            <p className="text-[11px] text-muted-foreground">
              Boş bırakırsanız otomatik isim önerisi kullanılır:{" "}
              <strong>{suggestedName || "Genel Kaynak"}</strong>
            </p>
          </div>

          {/* Kapak Fotoğrafı (Kütüphane Görünümü) */}
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="coverImageUrl" className="flex items-center justify-between text-xs font-semibold">
              <span>📚 Kapak Fotoğrafı (Kütüphane Görünümü)</span>
              <span className="text-[11px] text-muted-foreground font-normal">İsteğe Bağlı</span>
            </Label>

            <div className="flex gap-2 items-center">
              <Input
                id="coverImageUrl"
                placeholder="Görsel URL yapıştırın (https://...)"
                {...form.register("coverImageUrl")}
                className="h-9 text-xs flex-1"
              />
              <label className="cursor-pointer">
                <Input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const { base64Data, mimeType } = await prepareCoverImage(file);
                      const res = await uploadCoverMutation.mutateAsync({
                        data: { imageData: base64Data, mimeType },
                      });
                      form.setValue("coverImageUrl", res.url, { shouldDirty: true });
                    } catch (err: any) {
                      toast({
                        title: "Görsel yüklenemedi",
                        description: err?.message || "Görsel işlenirken bir hata oluştu.",
                        variant: "destructive",
                      });
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs px-2.5 shrink-0" disabled={uploadCoverMutation.isPending} asChild>
                  <span>{uploadCoverMutation.isPending ? "⏳ Yükleniyor..." : "📁 Görsel Yükle"}</span>
                </Button>
              </label>
            </div>

            {/* Önizleme veya kaldır */}
            {form.watch("coverImageUrl") && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted/40 border text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <img
                    src={form.watch("coverImageUrl")}
                    alt="Kapak Önizleme"
                    className="h-10 w-8 object-cover rounded shadow-sm border shrink-0"
                    onError={(e) => { (e.target as any).style.display = "none"; }}
                  />
                  <span className="truncate text-muted-foreground text-[11px]">Kapak Görseli Ekli</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => form.setValue("coverImageUrl", "", { shouldDirty: true })}
                  className="h-7 text-[11px] text-destructive hover:text-destructive"
                >
                  Kaldır
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending || uploadCoverMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Kaydediliyor..."
                : uploadCoverMutation.isPending
                ? "Görsel yükleniyor..."
                : isEditing
                ? "Güncelle"
                : "Kaynak Oluştur"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
