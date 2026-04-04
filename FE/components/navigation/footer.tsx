interface FooterProps {
  year?: number
}
import { siteName } from '../../lib/seo'

export function Footer({ year = new Date().getFullYear() }: FooterProps) {
  return (
    <footer className="border-t border-border/20 bg-foreground/5 px-4 py-8">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-sm text-foreground/60">
          © {year} {siteName} . Learn. Connect. Celebrate African Languages.
        </p>
      </div>
    </footer>
  )
}
