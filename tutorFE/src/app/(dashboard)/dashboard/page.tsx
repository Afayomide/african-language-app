'use client'

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { lessonService, phraseService } from "@/services"
import { BookOpen, MessageSquare, CheckCircle, Clock } from "lucide-react"

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalLessons: 0,
    publishedLessons: 0,
    totalPhrases: 0,
    publishedPhrases: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const [lessonsTotal, lessonsPublished, phrasesTotal, phrasesPublished] = await Promise.all([
          lessonService.listLessonsPage({ page: 1, limit: 1 }),
          lessonService.listLessonsPage({ status: "published", page: 1, limit: 1 }),
          phraseService.listPhrasesPage({ page: 1, limit: 1 }),
          phraseService.listPhrasesPage({ status: "published", page: 1, limit: 1 }),
        ])
        
        setStats({
          totalLessons: lessonsTotal.total,
          publishedLessons: lessonsPublished.total,
          totalPhrases: phrasesTotal.total,
          publishedPhrases: phrasesPublished.total,
        })
      } catch (error) {
        console.error("Failed to fetch stats", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchStats()
  }, [])

  const cards = [
    { 
      title: "Total Lessons", 
      value: stats.totalLessons, 
      icon: BookOpen, 
      color: "text-primary",
      bgColor: "bg-secondary",
      borderColor: "border-border"
    },
    { 
      title: "Published Lessons", 
      value: stats.publishedLessons, 
      icon: CheckCircle, 
      color: "text-primary",
      bgColor: "bg-secondary",
      borderColor: "border-border"
    },
    { 
      title: "Total Phrases", 
      value: stats.totalPhrases, 
      icon: MessageSquare, 
      color: "text-primary",
      bgColor: "bg-secondary",
      borderColor: "border-border"
    },
    { 
      title: "Published Phrases", 
      value: stats.publishedPhrases, 
      icon: Clock, 
      color: "text-primary",
      bgColor: "bg-secondary",
      borderColor: "border-border"
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your language learning content.</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className={`overflow-hidden border ${card.borderColor}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{card.title}</CardTitle>
              <div className={`rounded-md p-2 ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{isLoading ? "..." : card.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">Updated just now</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-secondary/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Create New Lesson</p>
                <p className="text-sm text-muted-foreground">Add a new lesson to the curriculum</p>
              </div>
            </div>
            <div className="flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-secondary/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Add New Phrases</p>
                <p className="text-sm text-muted-foreground">Expand the vocabulary database</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-secondary/20">
          <CardHeader>
            <CardTitle className="text-xl font-semibold text-primary">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Database Connection</span>
                <span className="h-2.5 w-2.5 rounded-full bg-primary"></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">AI Service</span>
                <span className="h-2.5 w-2.5 rounded-full bg-primary"></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Storage Service</span>
                <span className="h-2.5 w-2.5 rounded-full bg-primary"></span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
