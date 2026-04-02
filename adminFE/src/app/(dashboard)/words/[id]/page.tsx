
'use client'

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { wordService, lessonService, imageService } from "@/services";
import type { Lesson, Language, Word, ImageAsset } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Volume2, CheckCircle, ImagePlus, Trash2 } from "lucide-react";
import { workflowStatusBadgeClass } from "@/lib/status-badge";

function isLanguage(value: string | null): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function WordFormContent({ mode, id }: { mode: "new" | "edit"; id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const languageParam = searchParams.get("language");
  const lessonIdParam = searchParams.get("lessonId");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [word, setWord] = useState<Partial<Word>>({
    text: "",
    translations: [],
    pronunciation: "",
    explanation: "",
    difficulty: 1,
    lemma: "",
    partOfSpeech: "",
    lessonIds: lessonIdParam ? [lessonIdParam] : [],
    language: isLanguage(languageParam) ? languageParam : undefined,
    status: "draft"
  });
  const [translationsText, setTranslationsText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [libraryImages, setLibraryImages] = useState<ImageAsset[]>([]);
  const [selectedImageAssetId, setSelectedImageAssetId] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImageAltText, setNewImageAltText] = useState("");
  const [newImageDescription, setNewImageDescription] = useState("");
  const [newImageTagsText, setNewImageTagsText] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (mode === "edit") void loadLessons();
    if (mode === "edit" && id) void loadWord(id);
    void loadLibraryImages();
  }, [mode, id]);

  async function loadLessons() {
    try {
      const data = await lessonService.listLessons(undefined, isLanguage(languageParam) ? languageParam : undefined);
      setLessons(data.filter((lesson) => !word.language || lesson.language === word.language).sort((a, b) => a.orderIndex - b.orderIndex));
    } catch {
      toast.error("Failed to load lessons");
    }
  }

  async function loadWord(wordId: string) {
    try {
      const data = await wordService.getWord(wordId);
      setWord(data);
      setTranslationsText(data.translations.join("\n"));
    } catch {
      toast.error("Failed to load word");
      router.push("/words");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadLibraryImages() {
    try {
      const data = await imageService.listImagesPage({ page: 1, limit: 50 });
      setLibraryImages(data.items);
    } catch {
      toast.error("Failed to load image library");
    }
  }

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") return reject(new Error("file_read_failed"));
        const [, base64] = result.split(",");
        resolve(base64 || result);
      };
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  function applyImageAsset(asset: ImageAsset) {
    setWord((current) => ({
      ...current,
      image: {
        imageAssetId: asset._id,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl || "",
        altText: asset.altText || ""
      }
    }));
  }

  async function handleAttachExistingImage() {
    if (!selectedImageAssetId) {
      toast.error("Select an existing image");
      return;
    }
    const asset = libraryImages.find((image) => image._id === selectedImageAssetId);
    if (!asset) {
      toast.error("Selected image not found");
      return;
    }
    applyImageAsset(asset);
    setSelectedImageAssetId("");
    toast.success("Image attached to word");
  }

  async function handleUploadNewImage() {
    if (!newImageFile) {
      toast.error("Choose an image to upload");
      return;
    }
    if (!newImageAltText.trim()) {
      toast.error("Alt text is required");
      return;
    }
    setIsUploadingImage(true);
    try {
      const image = await imageService.createImage({
        altText: newImageAltText.trim(),
        description: newImageDescription.trim() || newImageAltText.trim(),
        tags: newImageTagsText.split(",").map((item) => item.trim()).filter(Boolean),
        status: "approved",
        imageUpload: {
          base64: await fileToBase64(newImageFile),
          mimeType: newImageFile.type || undefined,
          fileName: newImageFile.name
        }
      });
      await loadLibraryImages();
      applyImageAsset(image);
      setNewImageFile(null);
      setNewImageAltText("");
      setNewImageDescription("");
      setNewImageTagsText("");
      toast.success("Image uploaded and attached");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to upload image");
    } finally {
      setIsUploadingImage(false);
    }
  }

  function handleClearImage() {
    setWord((current) => ({ ...current, image: null }));
    toast.success("Word image cleared");
  }

  function toggleLesson(lessonId: string, checked: boolean) {
    setWord((current) => {
      const lessonIds = Array.isArray(current.lessonIds) ? current.lessonIds : [];
      return {
        ...current,
        lessonIds: checked ? Array.from(new Set([...lessonIds, lessonId])) : lessonIds.filter((item) => item !== lessonId)
      };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!word.language || !word.text || !translationsText.trim()) {
      toast.error("Language, text, and translations are required");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        language: word.language,
        lessonIds: mode === "edit" ? word.lessonIds : undefined,
        text: word.text,
        translations: translationsText.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
        pronunciation: word.pronunciation || "",
        explanation: word.explanation || "",
        difficulty: Number(word.difficulty || 1),
        lemma: word.lemma || "",
        partOfSpeech: word.partOfSpeech || "",
        image:
          word.image?.url || word.image?.thumbnailUrl || word.image?.altText
            ? {
                imageAssetId: word.image?.imageAssetId,
                url: word.image?.url || "",
                thumbnailUrl: word.image?.thumbnailUrl || "",
                altText: word.image?.altText || ""
              }
            : null,
        audioUpload: audioFile ? { base64: await fileToBase64(audioFile), mimeType: audioFile.type || undefined, fileName: audioFile.name } : undefined
      };
      const saved = mode === "edit" && id
        ? await wordService.updateWord(id, payload)
        : await wordService.createWord(payload);
      toast.success(`Word ${mode === "edit" ? "updated" : "created"}`);
      router.push(mode === "edit" ? `/words/lang/${saved.language}` : `/words/${saved._id}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save word");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusAction() {
    if (!id) return;
    try {
      await wordService.publishWord(id);
      toast.success("Word published");
      await loadWord(id);
    } catch {
      toast.error("Failed to publish word");
    }
  }

  async function handleGenerateAudio() {
    if (!id) return;
    try {
      await wordService.generateWordAudio(id);
      toast.success("Audio generated");
      await loadWord(id);
    } catch {
      toast.error("Failed to generate audio");
    }
  }

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{mode === "edit" ? "Edit Word" : "New Word"}</h1>
            {mode === "edit" && word.status ? <Badge className={workflowStatusBadgeClass(word.status)}>{word.status}</Badge> : null}
          </div>
        </div>
        {mode === "edit" && id ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateAudio}><Volume2 className="mr-2 h-4 w-4" />Generate Audio</Button>
            {word.status === "finished" ? <Button variant="outline" onClick={handleStatusAction}><CheckCircle className="mr-2 h-4 w-4" />Publish</Button> : null}
          </div>
        ) : null}
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Word Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={word.language} onValueChange={(value) => setWord((current) => ({ ...current, language: value as Language, lessonIds: [] }))} disabled={mode === "edit"}>
                  <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yoruba">Yoruba</SelectItem>
                    <SelectItem value="igbo">Igbo</SelectItem>
                    <SelectItem value="hausa">Hausa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select value={String(word.difficulty || 1)} onValueChange={(value) => setWord((current) => ({ ...current, difficulty: Number(value) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {mode === "edit" ? (
              <div className="space-y-2">
                <Label>Lessons</Label>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-3">
                  {lessons.filter((lesson) => !word.language || lesson.language === word.language).map((lesson) => (
                    <label key={lesson._id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={word.lessonIds?.includes(lesson._id) || false} onChange={(event) => toggleLesson(lesson._id, event.target.checked)} />
                      <span>{lesson.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                This word will be created without lesson assignment. Attach it from the edit page when you are ready.
              </div>
            )}

            <div className="space-y-2">
              <Label>Text</Label>
              <Input value={word.text || ""} onChange={(event) => setWord((current) => ({ ...current, text: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Translations</Label>
              <Textarea value={translationsText} onChange={(event) => setTranslationsText(event.target.value)} rows={4} required />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Lemma</Label>
                <Input value={word.lemma || ""} onChange={(event) => setWord((current) => ({ ...current, lemma: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Part of Speech</Label>
                <Input value={word.partOfSpeech || ""} onChange={(event) => setWord((current) => ({ ...current, partOfSpeech: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pronunciation</Label>
              <Input value={word.pronunciation || ""} onChange={(event) => setWord((current) => ({ ...current, pronunciation: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Explanation</Label>
              <Textarea value={word.explanation || ""} onChange={(event) => setWord((current) => ({ ...current, explanation: event.target.value }))} rows={4} />
            </div>
            <div className="space-y-4 rounded-xl border border-primary/10 bg-primary/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Word Image</Label>
                  <p className="text-sm text-muted-foreground">Select an existing library image or upload a new one.</p>
                </div>
                {word.image ? (
                  <Button type="button" variant="outline" size="sm" onClick={handleClearImage}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                ) : null}
              </div>

              {word.image ? (
                <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                  <div className="overflow-hidden rounded-lg border bg-background">
                    {word.image.url ? (
                      <img src={word.image.url} alt={word.image.altText || word.text || "Word image"} className="h-48 w-full object-cover" />
                    ) : (
                      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Image unavailable</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{word.image.altText || "Untitled image"}</p>
                    <p className="text-xs text-muted-foreground break-all">{word.image.url}</p>
                    {word.image.thumbnailUrl ? <p className="text-xs text-muted-foreground break-all">Thumbnail: {word.image.thumbnailUrl}</p> : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Select Existing Image</Label>
                  <Select value={selectedImageAssetId} onValueChange={setSelectedImageAssetId}>
                    <SelectTrigger><SelectValue placeholder="Choose an uploaded image" /></SelectTrigger>
                    <SelectContent>
                      {libraryImages.map((image) => (
                        <SelectItem key={image._id} value={image._id}>{image.altText}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={handleAttachExistingImage} disabled={!selectedImageAssetId}>
                    <ImagePlus className="mr-2 h-4 w-4" />
                    Attach Existing
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Upload New Image</Label>
                  <Input type="file" accept="image/*" onChange={(event) => setNewImageFile(event.target.files?.[0] || null)} />
                  <Input value={newImageAltText} onChange={(event) => setNewImageAltText(event.target.value)} placeholder="Alt text" />
                  <Textarea value={newImageDescription} onChange={(event) => setNewImageDescription(event.target.value)} rows={2} placeholder="Optional description" />
                  <Input value={newImageTagsText} onChange={(event) => setNewImageTagsText(event.target.value)} placeholder="Tags, comma separated" />
                  <Button type="button" variant="outline" onClick={handleUploadNewImage} disabled={isUploadingImage || !newImageFile}>
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {isUploadingImage ? "Uploading..." : "Upload and Attach"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Image URL</Label>
                <Input
                  value={word.image?.url || ""}
                  placeholder="https://..."
                  onChange={(event) =>
                    setWord((current) => ({
                      ...current,
                      image: {
                        imageAssetId: current.image?.imageAssetId,
                        url: event.target.value,
                        thumbnailUrl: current.image?.thumbnailUrl || "",
                        altText: current.image?.altText || ""
                      }
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Image Alt Text</Label>
                <Input
                  value={word.image?.altText || ""}
                  placeholder="Describe the image"
                  onChange={(event) =>
                    setWord((current) => ({
                      ...current,
                      image: {
                        imageAssetId: current.image?.imageAssetId,
                        url: current.image?.url || "",
                        thumbnailUrl: current.image?.thumbnailUrl || "",
                        altText: event.target.value
                      }
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Thumbnail URL</Label>
              <Input
                value={word.image?.thumbnailUrl || ""}
                placeholder="Optional thumbnail URL"
                onChange={(event) =>
                  setWord((current) => ({
                    ...current,
                    image: {
                      imageAssetId: current.image?.imageAssetId,
                      url: current.image?.url || "",
                      thumbnailUrl: event.target.value,
                      altText: current.image?.altText || ""
                    }
                  }))
                }
              />
            </div>
            {word.image?.url ? (
              <div className="space-y-2">
                <Label>Image Preview</Label>
                <div className="overflow-hidden rounded-lg border bg-muted/30 p-2">
                  <img src={word.image.url} alt={word.image.altText || word.text || "Word image"} className="max-h-48 rounded-md object-cover" />
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Audio Upload</Label>
              <Input type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Word"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}


export default function EditWordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WordFormContent mode="edit" id={id} />
    </Suspense>
  );
}
