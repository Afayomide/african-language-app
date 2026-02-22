'use client'

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { lessonService, aiService } from "@/services"
import { Language, Level } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { Sparkles, ArrowLeft } from "lucide-react"

export default function NewLessonPage() {
  const searchParams = useSearchParams()
  const initialLanguage = searchParams.get("language")
  const [title, setTitle] = useState("")
  const [language, setLanguage] = useState<Language>(
    initialLanguage === "igbo" || initialLanguage === "hausa" || initialLanguage === "yoruba"
      ? initialLanguage
      : "yoruba"
  )
  const [level, setLevel] = useState<Level>("beginner")
  const [description, setDescription] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const topics = topicsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
      await lessonService.createLesson({ title, language, level, description, topics })
      toast.success("Lesson created")
      router.push(`/lessons/lang/${language}`)
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create lesson")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAISuggest = async () => {
    if (!title) {
      toast.error("Please enter a title first")
      return
    }
    setIsSuggesting(true)
    try {
      const suggestion = await aiService.suggestLesson(title, language, level)
      if (suggestion.title) setTitle(suggestion.title)
      if (suggestion.description) setDescription(suggestion.description)
      toast.success("AI suggestion applied")
    } catch (error) {
      toast.error("AI suggestion failed")
    } finally {
      setIsSuggesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">New Lesson</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Title</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAISuggest}
                  disabled={isSuggesting}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
                  AI Suggest
                </Button>
              </div>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Greeting and Introductions"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yoruba">Yoruba</SelectItem>
                    <SelectItem value="igbo">Igbo</SelectItem>
                    <SelectItem value="hausa">Hausa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topics">Topics (comma-separated)</Label>
              <Input
                id="topics"
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                placeholder="greetings, introductions"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will students learn in this lesson?"
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Lesson"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
