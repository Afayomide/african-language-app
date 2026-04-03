'use client'

import { useEffect, useState } from "react";
import { imageService } from "@/services";
import type { ImageAsset, Word } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ImagePlus, Link2, Trash2 } from "lucide-react";

type WordImage = Word["image"];

type Props = {
  word: Partial<Word>;
  onImageChanged?: (image: WordImage) => void;
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

export function WordImageManager({ word, onImageChanged }: Props) {
  const [image, setImage] = useState<WordImage>(word.image || null);
  const [libraryImages, setLibraryImages] = useState<ImageAsset[]>([]);
  const [selectedImageAssetId, setSelectedImageAssetId] = useState("");
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setImage(word.image || null);
  }, [word.image]);

  useEffect(() => {
    void loadLibraryImages();
  }, []);

  async function loadLibraryImages() {
    try {
      const response = await imageService.listImagesPage({ page: 1, limit: 50 });
      setLibraryImages(response.items);
    } catch {
      toast.error("Failed to load image library.");
    }
  }

  function applyImage(nextImage: WordImage) {
    setImage(nextImage);
    onImageChanged?.(nextImage);
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
      let asset: ImageAsset | undefined = libraryImages.find((item) => item._id === selectedImageAssetId);
      if (!asset && newImageFile) {
        asset = await imageService.createImage({
          altText: altText.trim(),
          description: description.trim() || altText.trim(),
          tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean),
                    imageUpload: {
            base64: await fileToBase64(newImageFile),
            mimeType: newImageFile.type || undefined,
            fileName: newImageFile.name
          }
        });
        await loadLibraryImages();
      }

      if (!asset) {
        toast.error("Selected image not found.");
        return;
      }

      applyImage({
        imageAssetId: asset._id,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl || "",
        altText: asset.altText || altText.trim()
      });
      setSelectedImageAssetId("");
      setNewImageFile(null);
      setAltText("");
      setDescription("");
      setTagsText("");
      toast.success("Image attached to word.");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to attach image.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDeleteImage() {
    applyImage(null);
    toast.success("Word image removed.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImagePlus className="h-5 w-5" />
          Word Image
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Linked Image</Label>
          {!image ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No image linked yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-background">
              <div className="aspect-video bg-muted">
                {image.url ? (
                  <img src={image.url} alt={image.altText || word.text || "Word image"} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Image unavailable</div>
                )}
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>Linked</Badge>
                  {image.imageAssetId ? <Badge variant="outline">Library asset</Badge> : null}
                </div>
                <div>
                  <p className="text-sm font-semibold">{image.altText || "Untitled image"}</p>
                  {image.url ? <p className="mt-1 break-all text-xs text-muted-foreground">{image.url}</p> : null}
                  {image.thumbnailUrl ? <p className="mt-1 break-all text-xs text-muted-foreground">Thumbnail: {image.thumbnailUrl}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleDeleteImage}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
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
                {libraryImages.map((libraryImage) => (
                  <SelectItem key={libraryImage._id} value={libraryImage._id}>
                    {libraryImage.altText}
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
              <Label>Tags</Label>
              <Input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="person, object, place" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional image description" />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => void handleAttachImage()} disabled={isSubmitting}>
              <Link2 className="mr-2 h-4 w-4" />
              {isSubmitting ? "Attaching..." : "Attach Image"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
