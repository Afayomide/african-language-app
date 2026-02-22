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

  useEffect(() => {
    async function fetchStats() {
      try {
        const lessons = await lessonService.listLessons()
        const phrases = await phraseService.listPhrases()
        
        setStats({
          totalLessons: lessons.length,
          publishedLessons: lessons.filter(l => l.status === 'published').length,
          totalPhrases: phrases.length,
          publishedPhrases: phrases.filter(p => p.status === 'published').length,
        })
      } catch (error) {
        console.error("Failed to fetch stats", error)
      }
    }
    fetchStats()
  }, [])

  const cards = [
    { 
      title: "Total Lessons", 
      value: stats.totalLessons, 
      icon: BookOpen, 
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      borderColor: "border-orange-200"
    },
    { 
      title: "Published Lessons", 
      value: stats.publishedLessons, 
      icon: CheckCircle, 
      color: "text-green-600",
      bgColor: "bg-green-100",
      borderColor: "border-green-200"
    },
    { 
      title: "Total Phrases", 
      value: stats.totalPhrases, 
      icon: MessageSquare, 
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      borderColor: "border-purple-200"
    },
    { 
      title: "Published Phrases", 
      value: stats.publishedPhrases, 
      icon: Clock, 
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      borderColor: "border-blue-200"
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of your language learning content.</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className={`overflow-hidden border-2 ${card.borderColor} shadow-sm transition-all hover:shadow-md`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{card.title}</CardTitle>
              <div className={`rounded-lg p-2 ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{card.value}</div>
              <div className="mt-1 text-xs text-muted-foreground font-medium">Updated just now</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-2 border-accent/20">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-accent">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-4 rounded-xl border p-4 hover:bg-secondary/50 cursor-pointer transition-colors">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Create New Lesson</p>
                <p className="text-sm text-muted-foreground">Add a new lesson to the curriculum</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border p-4 hover:bg-secondary/50 cursor-pointer transition-colors">
              <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="font-semibold">Add New Phrases</p>
                <p className="text-sm text-muted-foreground">Expand the vocabulary database</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-primary">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Database Connection</span>
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">AI Service</span>
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Storage Service</span>
                <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
