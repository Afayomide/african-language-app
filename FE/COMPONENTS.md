# Component Library Documentation

This document outlines the reusable component structure for the LinguaHub Nigerian Language Learning App.

## Quick Start

Import components from the centralized index:

```tsx
import {
  Logo,
  Header,
  LanguageCard,
  StatsCard,
  ProgressCircle,
  AchievementBadge,
} from '@/components'
```

## Component Categories

### Branding Components

#### Logo
Reusable logo component with multiple size variants.

```tsx
import { Logo } from '@/components'

<Logo size="sm" | "md" | "lg" />
```

**Props:**
- `size`: 'sm' | 'md' | 'lg' (default: 'md')

#### LogoShowcase
Premium logo display with animated background effects.

```tsx
import { LogoShowcase } from '@/components'

<LogoShowcase size="sm" | "md" | "lg" />
```

---

### Navigation Components

#### Header
Sticky navigation header with logo, links, and auth buttons.

```tsx
import { Header } from '@/components'

<Header />
```

**Features:**
- Responsive design with mobile menu support
- Links to features and how-it-works sections
- Sign in/Get Started buttons

#### Footer
Simple footer with copyright and branding.

```tsx
import { Footer } from '@/components'

<Footer />
```

---

### Card Components

#### LanguageCard
Displays language information with character illustrations.

```tsx
import { LanguageCard } from '@/components'

<LanguageCard
  id="yoruba"
  name="Yoruba"
  nativeName="Yorùbá"
  description="The language of the Yoruba people..."
  speakers={45000000}
  maleCharacter="/characters/yoruba-man.jpg"
  femaleCharacter="/characters/yoruba-woman.jpg"
  href="/daily-goal?language=yoruba"
/>
```

**Props:**
- `id`: string - Unique language identifier
- `name`: string - English language name
- `nativeName`: string - Native language name
- `description`: string - Language description
- `speakers`: number - Number of speakers
- `maleCharacter`: string - Path to male character image
- `femaleCharacter`: string - Path to female character image
- `href`: string - Navigation link

#### LessonCard
Shows lesson information with progress tracking.

```tsx
import { LessonCard } from '@/components'

<LessonCard
  id="lesson-1"
  title="Basic Greetings"
  description="Learn essential greetings"
  exerciseCount={5}
  status="available" | "locked" | "completed"
  progress={60}
  language="yoruba"
/>
```

**Props:**
- `id`: string - Lesson identifier
- `title`: string - Lesson title
- `description`: string - Brief description
- `exerciseCount`: number - Number of exercises
- `status`: 'locked' | 'available' | 'completed'
- `progress?`: number - Progress percentage (0-100)
- `language`: string - Language ID

#### StatsCard
Displays statistics with icons and trend indicators.

```tsx
import { StatsCard } from '@/components'
import { Flame } from 'lucide-react'

<StatsCard
  icon={Flame}
  label="Current Streak"
  value={7}
  description="days in a row"
  trend={{ direction: 'up', percentage: 20 }}
  color="primary" | "accent" | "success" | "warning"
/>
```

**Props:**
- `icon`: LucideIcon - Icon component
- `label`: string - Stat label
- `value`: string | number - Display value
- `description?`: string - Additional text
- `trend?`: { direction: 'up' | 'down', percentage: number }
- `color?`: 'primary' | 'accent' | 'success' | 'warning'

---

### Progress Components

#### ProgressCircle
Circular progress indicator with percentage display.

```tsx
import { ProgressCircle } from '@/components'

<ProgressCircle
  percentage={75}
  size="sm" | "md" | "lg"
  label="Complete"
  color="primary" | "accent" | "success"
/>
```

**Props:**
- `percentage`: number - Progress percentage (0-100)
- `size?`: 'sm' | 'md' | 'lg' (default: 'md')
- `label?`: string - Display label
- `color?`: 'primary' | 'accent' | 'success'

#### StepIndicator
Linear step progress with labels.

```tsx
import { StepIndicator } from '@/components'

const steps = [
  { number: 1, label: 'Choose', completed: true, active: false },
  { number: 2, label: 'Learn', completed: false, active: true },
  { number: 3, label: 'Practice', completed: false, active: false },
]

<StepIndicator steps={steps} />
```

**Step Props:**
- `number`: number - Step number
- `label`: string - Step label
- `completed`: boolean - Is step completed?
- `active`: boolean - Is step currently active?

---

### Badge Components

#### AchievementBadge
Displays locked/unlocked achievement badges.

```tsx
import { AchievementBadge } from '@/components'
import { Trophy } from 'lucide-react'

<AchievementBadge
  icon={Trophy}
  title="First Lesson"
  description="Complete your first lesson"
  unlocked={true}
  rarity="common" | "rare" | "epic" | "legendary"
/>
```

**Props:**
- `icon`: LucideIcon - Badge icon
- `title`: string - Achievement title
- `description`: string - Achievement description
- `unlocked`: boolean - Is achievement unlocked?
- `rarity?`: 'common' | 'rare' | 'epic' | 'legendary'

---

### Exercise Components

#### ExerciseOption
Interactive exercise type selector.

```tsx
import { ExerciseOption } from '@/components'
import { MessageCircle } from 'lucide-react'

<ExerciseOption
  icon={MessageCircle}
  title="Multiple Choice"
  description="Select the correct answer from options"
  href="/exercise?type=multiple-choice"
  difficulty="easy" | "medium" | "hard"
  estimatedTime={5}
/>
```

**Props:**
- `icon`: LucideIcon - Exercise icon
- `title`: string - Exercise name
- `description`: string - Exercise description
- `href`: string - Navigation link
- `difficulty?`: 'easy' | 'medium' | 'hard'
- `estimatedTime?`: number - Time in minutes

---

### Form Components

#### FormField
Flexible form input with validation and icons.

```tsx
import { FormField } from '@/components'
import { Eye } from 'lucide-react'

<FormField
  label="Email"
  name="email"
  type="email"
  placeholder="you@example.com"
  value={email}
  onChange={handleChange}
  toggleIcon={Eye}
  onToggle={handleToggle}
  hideLabel={false}
  error="Invalid email"
  required
/>
```

**Props:**
- `label?`: string - Field label
- `name`: string - Input name
- `type`: string - Input type
- `placeholder`: string - Placeholder text
- `value`: string - Current value
- `onChange`: function - Change handler
- `toggleIcon?`: LucideIcon - Icon for toggle action
- `onToggle?`: function - Toggle handler
- `hideLabel?`: boolean - Hide label text
- `error?`: string - Error message
- `required?`: boolean

---

### Auth Components

#### AuthLayout
Wrapper for authentication pages with background effects.

```tsx
import { AuthLayout } from '@/components'

<AuthLayout
  title="Create your account"
  subtitle="Join thousands learning Nigerian languages"
  footerText="Already have an account?"
  footerLink={{ text: 'Sign in', href: '/auth/login' }}
>
  {/* Form content */}
</AuthLayout>
```

**Props:**
- `title`: string - Page title
- `subtitle`: string - Page subtitle
- `children`: ReactNode - Page content
- `footerText`: string - Footer text
- `footerLink`: { text: string, href: string }

#### AuthFormCard
Card container for authentication forms.

```tsx
import { AuthFormCard } from '@/components'

<AuthFormCard>
  {/* Form fields and buttons */}
</AuthFormCard>
```

#### SocialAuthButtons
Social authentication button group.

```tsx
import { SocialAuthButtons } from '@/components'

<SocialAuthButtons
  onGoogleClick={() => {}}
  onGithubClick={() => {}}
/>
```

**Props:**
- `onGoogleClick?`: function - Google click handler
- `onGithubClick?`: function - GitHub click handler

---

### Page Sections

#### HeroSection
Large hero banner with background effects.

```tsx
import { HeroSection } from '@/components'

<HeroSection
  title="Master Nigerian Languages"
  subtitle="Learn with AI-powered lessons..."
  trustMetric="Join 10,000+ learners"
>
  {/* Child content (logo, etc) */}
</HeroSection>
```

#### FeaturesSection
Grid display of feature cards.

```tsx
import { FeaturesSection } from '@/components'
import { Zap, Book } from 'lucide-react'

<FeaturesSection
  title="Why Choose LinguaHub?"
  features={[
    {
      icon: Zap,
      title: 'Quick Lessons',
      description: '5-10 minute lessons...',
    },
    // More features
  ]}
/>
```

#### HowItWorksSection
Step-by-step guide display.

```tsx
import { HowItWorksSection } from '@/components'

<HowItWorksSection
  title="How It Works"
  steps={[
    {
      step: '01',
      title: 'Choose Your Language',
      description: 'Pick from Yoruba, Igbo...',
    },
    // More steps
  ]}
/>
```

#### CTASection
Call-to-action banner.

```tsx
import { CTASection } from '@/components'

<CTASection
  title="Ready to Learn?"
  description="Join thousands of learners..."
/>
```

---

## Constants

### Languages

Access language data from the constants:

```tsx
import { LANGUAGES, getLanguageById } from '@/lib/constants'

// Get all languages
LANGUAGES.forEach((lang) => {
  console.log(lang.name, lang.speakers)
})

// Get specific language
const yoruba = getLanguageById('yoruba')
```

**Language Object:**
```tsx
{
  id: string
  name: string
  nativeName: string
  description: string
  speakers: number
  maleCharacter: string
  femaleCharacter: string
  difficulty: 'beginner' | 'intermediate'
  color: string
}
```

---

## Design Tokens

All components use design tokens defined in `globals.css`:

- **Primary Color**: `--primary` (Orange-yellow: 35° 85% 55%)
- **Accent Color**: `--accent` (Purple: 280° 60% 60%)
- **Background**: `--background` (Warm beige: 50° 20% 97%)
- **Foreground**: `--foreground` (Dark brown: 30° 15% 15%)
- **Border Radius**: `--radius` (1rem)

---

## Best Practices

1. **Always use the centralized component index** for imports
2. **Keep components focused** on a single responsibility
3. **Use design tokens** for colors and spacing
4. **Pass data via props** - avoid hardcoding content
5. **Make components responsive** - use Tailwind's responsive prefixes
6. **Use TypeScript** for type safety
7. **Organize by feature** - Group related components together

---

## Adding New Components

1. Create component in appropriate folder: `components/[category]/[name].tsx`
2. Add to `components/index.ts` export list
3. Document in this file with examples
4. Use design tokens and Tailwind CSS
5. Ensure mobile responsiveness

---

## File Structure

```
components/
├── branding/          # Logo components
├── navigation/        # Header, footer
├── cards/            # Reusable card layouts
├── badges/           # Achievement/status badges
├── progress/         # Progress indicators
├── exercises/        # Exercise components
├── forms/            # Form fields and helpers
├── auth/             # Authentication layouts
├── sections/         # Full-width page sections
└── index.ts          # Central export file

lib/
├── constants/
│   ├── languages.ts   # Language data
│   └── index.ts       # Constant exports
└── utils/             # Helper functions
```
