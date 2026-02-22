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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border bg-card shadow-md">
        <CardHeader className="space-y-4 pb-6 pt-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Settings className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight text-foreground">Voice Artist Portal</CardTitle>
            <CardDescription className="text-sm">
              Secure access to your content management system
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-8">
            <div className="space-y-2">
              <Label htmlFor="email" className="ml-1 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="voice@example.com"
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="ml-1 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Password</Label>
              <Input
                id="password"
                type="password"
                className="h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-2">
            <div className="w-full space-y-4">
              <Button className="h-11 w-full text-sm font-medium" type="submit" disabled={isLoading}>
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
