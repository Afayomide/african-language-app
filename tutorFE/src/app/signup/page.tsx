'use client'

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { authService } from "@/services/auth";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import type { Language } from "@/types";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [language, setLanguage] = useState<Language>("yoruba");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.signup({
        email,
        password,
        language,
        displayName
      });

      toast.success(response.message || "Signup successful");
      toast.info("Your account is pending admin activation before login.");
      router.push("/login");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 bg-card/80 shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-4 pb-8 pt-10 text-center">
          <div className="mx-auto flex h-16 w-16 rotate-3 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30 transition-transform hover:rotate-0">
            <Settings className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-black tracking-tight text-foreground">Tutor Signup</CardTitle>
            <CardDescription className="text-base font-medium">
              Create your tutor account. Admin activation is required before login.
            </CardDescription>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 px-8">
            <div className="space-y-2">
              <Label htmlFor="displayName" className="ml-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Display Name
              </Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your name"
                className="h-12 rounded-xl border-2 focus-visible:ring-primary"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="ml-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tutor@example.com"
                className="h-12 rounded-xl border-2 focus-visible:ring-primary"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="language" className="ml-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Language
              </Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                <SelectTrigger className="h-12 rounded-xl border-2 focus-visible:ring-primary">
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
              <Label htmlFor="password" className="ml-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                className="h-12 rounded-xl border-2 focus-visible:ring-primary"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="ml-1 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                className="h-12 rounded-xl border-2 focus-visible:ring-primary"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="p-8 pt-4">
            <div className="w-full space-y-4">
              <Button
                className="h-14 w-full rounded-xl text-lg font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Creating account..." : "Create Tutor Account"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
