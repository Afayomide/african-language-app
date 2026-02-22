'use client'

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { phraseService } from "@/services";
import { Mic2, CheckCircle, Clock3, XCircle } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    queueCount: 0,
    accepted: 0,
    pending: 0,
    rejected: 0
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const [queue, submissions] = await Promise.all([
          phraseService.getQueue(),
          phraseService.listMySubmissions()
        ]);

        setStats({
          queueCount: queue.length,
          accepted: submissions.filter((item) => item.status === "accepted").length,
          pending: submissions.filter((item) => item.status === "pending").length,
          rejected: submissions.filter((item) => item.status === "rejected").length
        });
      } catch {
        // Keep dashboard resilient.
      }
    }

    fetchStats();
  }, []);

  const cards = [
    { title: "Queue", value: stats.queueCount, icon: Mic2 },
    { title: "Accepted", value: stats.accepted, icon: CheckCircle },
    { title: "Pending Review", value: stats.pending, icon: Clock3 },
    { title: "Rejected", value: stats.rejected, icon: XCircle }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Voice Dashboard</h1>
        <p className="text-muted-foreground mt-2">Track phrase recording progress for your language.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title} className="overflow-hidden border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className="rounded-md bg-secondary p-2">
                <card.icon className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
