'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from "next/navigation"
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-react'
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons"
import { AuthLayout } from "@/components/auth/auth-layout"
import { AuthFormCard } from "@/components/auth/auth-form-card"
import { FormField } from "@/components/forms/form-field"
import { learnerAuthService } from "@/services"

export default function SignUpPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) return
    setIsLoading(true)
    try {
      await learnerAuthService.signup({
        name: formData.name,
        email: formData.email,
        password: formData.password
      })
      router.push("/language-selection")
    } catch (error) {
      console.error("Signup failed", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join thousands learning Nigerian languages"
      footerText="Already have an account?"
      footerLink={{ text: 'Sign in', href: '/auth/login' }}
    >
      <AuthFormCard>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name Field */}
          <FormField
            label="Full Name"
            name="name"
            type="text"
            placeholder="John Doe"
            value={formData.name}
            onChange={handleChange}
            required
          />

          {/* Email Field */}
          <FormField
            label="Email Address"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={formData.email}
            onChange={handleChange}
            required
          />

          {/* Password Field */}
          <FormField
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Create a strong password"
            value={formData.password}
            onChange={handleChange}
            toggleIcon={showPassword ? EyeOff : Eye}
            onToggle={() => setShowPassword(!showPassword)}
            required
          />

          {/* Confirm Password Field */}
          <FormField
            label="Confirm Password"
            name="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />

          {/* Terms checkbox */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="terms"
              className="h-4 w-4 rounded border-border/50 text-primary focus:ring-primary"
              required
            />
            <label htmlFor="terms" className="text-sm text-foreground/70">
              I agree to the{' '}
              <a href="#" className="font-medium text-primary hover:underline">
                Terms of Service
              </a>
            </label>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            disabled={isLoading}
            className="w-full font-semibold shadow-lg transition-all duration-200 hover:shadow-xl"
          >
            {isLoading ? "Creating..." : "Create Account"}
          </Button>
        </form>

        <SocialAuthButtons />
      </AuthFormCard>
    </AuthLayout>
  )
}
