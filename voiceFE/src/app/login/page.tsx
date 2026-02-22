'use client'

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { authService } from "@/services/auth"
import { toast } from "sonner"
import { Settings } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await authService.login(email, password)
      toast.success("Login successful")
      router.push("/dashboard")
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 h-full w-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <Card className="w-full max-w-md border-2 shadow-2xl relative bg-card/80 backdrop-blur-sm rounded-3xl overflow-hidden">
        <CardHeader className="space-y-4 text-center pb-8 pt-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30 rotate-3 transition-transform hover:rotate-0">
            <Settings className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-black tracking-tight text-foreground">Voice Artist Portal</CardTitle>
            <CardDescription className="text-base font-medium">
              Secure access to your content management system
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6 px-8">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-bold uppercase tracking-wider text-muted-foreground ml-1">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="voice@example.com"
                className="h-12 border-2 focus-visible:ring-primary rounded-xl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-bold uppercase tracking-wider text-muted-foreground ml-1">Password</Label>
              <Input
                id="password"
                type="password"
                className="h-12 border-2 focus-visible:ring-primary rounded-xl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-4">
            <div className="w-full space-y-4">
              <Button className="w-full h-14 text-lg font-bold rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]" type="submit" disabled={isLoading}>
                {isLoading ? "Authenticating..." : "Sign In to Voice Dashboard"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Need an account?{" "}
                <Link href="/signup" className="font-semibold text-primary hover:underline">
                  Sign up as voice artist
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
