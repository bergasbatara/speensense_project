/**
 * Landing page — a STATIC page.
 *
 * It lives at the top level of src/pages/ (not under (app)/), so it renders
 * with no DeepSpace providers: no auth session fetch, no records WebSocket.
 * That makes it cheap to serve and safe for logged-out / crawler traffic.
 *
 * The sidebar's logo mark links back here from inside the app; the button
 * below returns to the app — users move between the two freely.
 *
 * Need live data or auth here? Move this file to src/pages/(app)/index.tsx
 * and it becomes a dynamic page. Conversely, any page you want to keep static
 * (marketing, docs, legal) belongs at this top level.
 *
 * Top-level pages are also prerendered to static HTML at build
 * (prerender.ts, via vite.config.ts) so crawlers read real content.
 * Keep them renderable without a browser: no window/document during render,
 * prose in HTML text, reveal animations in CSS keyframes rather than JS-driven
 * initial states. `<Seo>` comes first and reads src/seo.ts.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { APP_NAME } from '../constants'
import { seo } from '../seo'

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div
        data-testid="static-landing"
        className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <p className="text-sm uppercase tracking-widest text-muted-foreground">{APP_NAME}</p>
        <h1 className="max-w-2xl text-5xl font-semibold leading-tight tracking-tight text-foreground sm:text-6xl">Know where your money goes.</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Import a transaction CSV, explore your spending, and organize purchases with category changes you review and approve.
        </p>
        <Link
          to="/home"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Open SpendSense
        </Link>
        <a href="/demo-transactions.csv" download className="text-sm text-primary hover:underline">Download synthetic demo CSV</a>
        <section aria-label="Demo workflow" className="mt-8 w-full max-w-2xl rounded-lg border border-border bg-card p-6 text-left">
          <h2 className="text-lg font-semibold">From transactions to decisions</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-muted-foreground">
            <li>Map CSV columns, review the transactions, and save the rows you choose.</li>
            <li>Explore spending, income, and category totals in your private dashboard.</li>
            <li>Review category changes, approve or cancel, and keep a history of your decisions.</li>
          </ol>
          <p className="mt-5 border-t border-border pt-4 text-sm">The demo CSV contains $96.25 in expenses and $2,500.00 in income. All records are invented.</p>
        </section>
        <p className="mt-6 max-w-xl text-xs leading-relaxed text-muted-foreground">Built on DeepSpace. AI questions and proposals require account credits. CSV import, dashboard, and manual reviews work without AI credits.</p>
      </div>
    </>
  )
}
