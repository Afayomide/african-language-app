'use client'

import { useEffect, useMemo, useState } from "react";
import { imageService, expressionService } from "@/services";
import type { Expression, ImageAsset, ExpressionImageLink } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ImagePlus, Link2, Trash2, Star } from "lucide-react";

type Props = {
  expression: Expression;
  onImagesChanged?: (images: ExpressionImageLink[]) => void;
};

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("invalid_file_data"));
        return;
      }
      const [, base64] = result.split(",");
      resolve(base64 || result);
    };
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

export function ExpressionImageManager({ expression, onImagesChanged }: Props) {
  const [images, setImages] = useState<ExpressionImageLink[]>(expression.images || []);
  const [libraryImages, setLibraryImages] = useState<ImageAsset[]>([]);
  const [selectedImageAssetId, setSelectedImageAssetId] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [translationIndexValue, setTranslationIndexValue] = useState("all");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setImages(expression.images || []);
  }, [expression.images]);

  useEffect(() => {
    void loadLibraryImages();
  }, []);

  const translationOptions = useMemo(
    () => (Array.isArray(expression.translations) ? expression.translations : []).map((translation, index) => ({ index, translation })),
    [expression.translations]
  );

  async function loadLibraryImages() {
    try {
      const response = await imageService.listImagesPage({ page: 1, limit: 50 });
      setLibraryImages(response.items);
    } catch (error) {
      toast.error("Failed to load image library.");
    }
  }

  function applyImages(nextImages: ExpressionImageLink[]) {
    setImages(nextImages);
    onImagesChanged?.(nextImages);
  }

  async function handleAttachImage() {
    if (!selectedImageAssetId && !newImageFile) {
      toast.error("Select an existing image or upload a new one.");
      return;
    }
    if (!selectedImageAssetId && !altText.trim()) {
      toast.error("Alt text is required when uploading a new image.");
      return;
    }

    setIsSubmitting(true);
    try {
      let imageAssetId = selectedImageAssetId;
      if (!imageAssetId && newImageFile) {
        const image = await imageService.createImage({
          altText: altText.trim(),
          description: description.trim() || altText.trim(),
          tags: tagsText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          status: "approved",
          imageUpload: {
            base64: await fileToBase64(newImageFile),
            mimeType: newImageFile.type || undefined,
            fileName: newImageFile.name
          }
        });
        imageAssetId = image._id;
        await loadLibraryImages();
      }

      const nextImages = await expressionService.linkExpressionImage(expression._id, {
        imageAssetId,
        translationIndex: translationIndexValue === "all" ? null : Number(translationIndexValue),
        isPrimary,
        notes: notes.trim() || undefined
      });
      applyImages(nextImages);
      setSelectedImageAssetId("");
      setNewImageFile(null);
      setAltText("");
      setDescription("");
      setTagsText("");
      setNotes("");
      setTranslationIndexValue("all");
      setIsPrimary(false);
      toast.success("Image linked to expression.");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to attach image.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteImage(linkId: string) {
    try {
      const nextImages = await expressionService.deleteExpressionImageLink(expression._id, linkId);
      applyImages(nextImages);
      toast.success("Expression image removed.");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to remove expression image.");
    }
  }

  async function handleSetPrimary(link: ExpressionImageLink) {
    try {
      const nextImages = await expressionService.updateExpressionImageLink(expression._id, link._id, {
        isPrimary: true,
        translationIndex: link.translationIndex ?? null
      });
      applyImages(nextImages);
      toast.success("Primary image updated.");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to update primary image.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImagePlus className="h-5 w-5" />
          Expression Images
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Linked Images</Label>
          {images.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No images linked yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {images.map((imageLink) => (
                <div key={imageLink._id} className="overflow-hidden rounded-2xl border bg-background">
                  <div className="aspect-video bg-muted">
                    {imageLink.asset?.url ? (
                      <img
                        src={imageLink.asset.url}
                        alt={imageLink.asset.altText}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Image unavailable
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap gap-2">
                      {imageLink.isPrimary && <Badge>Primary</Badge>}
                      <Badge variant="outline">
                        {imageLink.translationIndex === null || imageLink.translationIndex === undefined
                          ? "All translations"
                          : `Translation ${imageLink.translationIndex}`}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{imageLink.asset?.altText || "Untitled image"}</p>
                      {imageLink.asset?.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{imageLink.asset.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleSetPrimary(imageLink)}>
                        <Star className="mr-2 h-4 w-4" />
                        Set Primary
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteImage(imageLink._id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 rounded-2xl border border-primary/10 bg-primary/5 p-4">
          <div className="space-y-2">
            <Label>Select Existing Library Image</Label>
            <Select value={selectedImageAssetId} onValueChange={setSelectedImageAssetId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an uploaded image" />
              </SelectTrigger>
              <SelectContent>
                {libraryImages.map((image) => (
                  <SelectItem key={image._id} value={image._id}>
                    {image.altText}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Or Upload a New Image</Label>
            <Input type="file" accept="image/*" onChange={(event) => setNewImageFile(event.target.files?.[0] || null)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Alt Text</Label>
              <Input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the image" />
            </div>
            <div className="space-y-2">
              <Label>Translation Scope</Label>
              <Select value={translationIndexValue} onValueChange={setTranslationIndexValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All translations</SelectItem>
                  {translationOptions.map((option) => (
                    <SelectItem key={option.index} value={String(option.index)}>
                      {option.index}: {option.translation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional image description"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="person, man, portrait"
              />
            </div>
            <div className="space-y-2">
              <Label>Link Notes</Label>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional note for this phrase link"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
            Set as primary image for this phrase
          </label>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleAttachImage()} disabled={isSubmitting}>
              <Link2 className="mr-2 h-4 w-4" />
              {isSubmitting ? "Linking..." : "Attach Image"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
