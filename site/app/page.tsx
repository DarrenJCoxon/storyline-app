import DownloadCard from './DownloadCard'
import styles from './page.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <h1 className={styles.wordmark}>
          <span className={styles.wordmarkStory}>story</span>
          <span className={styles.wordmarkLine}>line</span>
        </h1>
        <p className={styles.tagline}>Plan your book. Write your story.</p>
        <p className={styles.heroLede}>
          Storyline is a complete environment for novelists — from your first idea to a
          finished, illustrated book. Plan with proven story structure, draft in a
          distraction-free editor, generate covers and interior images, and compile to
          professional EPUB and PDF. All in one place.
        </p>

        <div className={styles.heroCta}>
          <DownloadCard />
        </div>
      </section>

      {/* ── End-to-end pitch ─────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>From blank page to finished book</h2>
        <p className={styles.sectionLede}>
          Most novelists juggle four or five tools — a planning doc, a writing app, an
          image generator, an EPUB converter. Storyline replaces all of them with a
          single environment built around the way novels are actually made.
        </p>
        <ol className={styles.flow}>
          <li>
            <span className={styles.flowNum}>01</span>
            <div>
              <strong>Plan</strong> — work through 14 conversational stages with an AI
              planning partner trained on Save the Cat story structure.
            </div>
          </li>
          <li>
            <span className={styles.flowNum}>02</span>
            <div>
              <strong>Write</strong> — draft chapters in a distraction-free rich editor.
              Files stay as plain markdown on your disk.
            </div>
          </li>
          <li>
            <span className={styles.flowNum}>03</span>
            <div>
              <strong>Illustrate</strong> — generate book covers and interior
              illustrations with AI, styled to your story.
            </div>
          </li>
          <li>
            <span className={styles.flowNum}>04</span>
            <div>
              <strong>Compile</strong> — export a professional-grade EPUB or print-ready
              PDF, with live preview as paperback, iPad and Kindle.
            </div>
          </li>
        </ol>
      </section>

      {/* ── Pillar 1: Plan ───────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plan with Save the Cat</h2>
        <p className={styles.sectionLede}>
          Storyline uses Blake Snyder’s 15-beat structure — the same framework behind
          countless bestselling novels and screenplays. You walk through 14 planning
          stages in conversation, never staring at a blank template.
        </p>
        <ul className={styles.featureList}>
          <li>
            <strong>Genre-aware variants</strong> — Buddy Love, Whydunit, Golden Fleece,
            and seven more, each with structure tuned to its conventions.
          </li>
          <li>
            <strong>Character-first</strong> — protagonist and supporting cast built
            before the beat sheet, so plot serves character, not the other way round.
          </li>
          <li>
            <strong>AI critique at every stage</strong> — flags structural issues,
            pacing risks and consistency drift before they reach the page.
          </li>
          <li>
            <strong>Two-pass scene outline</strong> — high-level approved first, then
            chapter-by-chapter flesh-out with goal, obstacle, stakes and turn.
          </li>
        </ul>
      </section>

      {/* ── Pillar 2: Write ──────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>A writing surface built for novelists</h2>
        <p className={styles.sectionLede}>
          Markdown on disk, rich-text experience on screen. Your prose lives in plain
          files you own forever, edited through an interface designed for long-form
          fiction.
        </p>
        <ul className={styles.featureList}>
          <li>
            <strong>Live word counts</strong> — per chapter, per session, against your
            target. Always visible, never in the way.
          </li>
          <li>
            <strong>Inline notes</strong> — leave yourself reminders that travel with
            the text and surface in a single Notes view.
          </li>
          <li>
            <strong>Plan-vs-draft drift detection</strong> — when your draft diverges
            from the plan, Storyline tells you where and why.
          </li>
          <li>
            <strong>Research panel</strong> — capture sources, link them to scenes and
            chapters, see what backs every claim.
          </li>
          <li>
            <strong>GitHub auto-sync</strong> — every save is backed up to a private
            repository you control.
          </li>
        </ul>
      </section>

      {/* ── Pillar 3: Illustrate ─────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Illustrate without leaving the app</h2>
        <p className={styles.sectionLede}>
          Generate the visual layer of your book inside the same workspace where you
          plan and write — book covers and interior illustrations, both grounded in the
          characters and scenes you’ve already defined.
        </p>
        <ul className={styles.featureList}>
          <li>
            <strong>Book covers</strong> — front, back and spine with title, author and
            blurb, generated from your premise and genre.
          </li>
          <li>
            <strong>Chapter illustrations</strong> — visualise key scenes with prompts
            that draw automatically from your scene outline.
          </li>
          <li>
            <strong>Style-locked output</strong> — keep visual consistency across every
            illustration in the book.
          </li>
        </ul>
      </section>

      {/* ── Pillar 4: Compile ────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Package and publish</h2>
        <p className={styles.sectionLede}>
          When the manuscript is done, Storyline assembles a publish-ready book — front
          matter, table of contents, chapter breaks, illustrations, cover — and outputs
          the formats you need.
        </p>
        <ul className={styles.featureList}>
          <li>
            <strong>Professional EPUB</strong> — typography-aware, validated, ready for
            Kindle Direct Publishing, Apple Books and Kobo.
          </li>
          <li>
            <strong>Print-ready PDF</strong> — proper margins, page numbers, running
            heads, drop caps. Upload straight to a print-on-demand service.
          </li>
          <li>
            <strong>Live preview in three formats</strong> — see your manuscript as it
            will appear in paperback, on iPad and on Kindle, before you export.
          </li>
        </ul>
      </section>

      {/* ── Differentiators ──────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Why Storyline</h2>
        <div className={styles.diffGrid}>
          <div className={styles.diff}>
            <h3 className={styles.diffTitle}>Plan and write in one place</h3>
            <p>
              No exporting a beat sheet from one app and pasting it into another. The
              plan is right next to the draft, always.
            </p>
          </div>
          <div className={styles.diff}>
            <h3 className={styles.diffTitle}>Your prose stays yours</h3>
            <p>
              Storyline’s AI helps with structure and critique. It never reads your
              chapter prose, and never trains on it.
            </p>
          </div>
          <div className={styles.diff}>
            <h3 className={styles.diffTitle}>Open files, no lock-in</h3>
            <p>
              Your manuscript is plain markdown on your disk. If you ever leave
              Storyline, every word goes with you.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing intel ────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Free to start</h2>
        <p className={styles.sectionLede}>
          Plan an entire book with AI on the free plan — no card required. Image
          generation, EPUB compilation and additional book plans use a simple
          pay-as-you-go credit pack.
        </p>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────── */}
      <section className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>Start writing your book today</h2>
        <p className={styles.ctaLede}>
          Free download, free first plan. No subscription.
        </p>
        <div className={styles.ctaBox}>
          <DownloadCard />
        </div>
      </section>

      <p className={styles.terms}>
        By downloading you accept our{' '}
        <a href="https://api.storyline.my/terms" className={styles.termsLink}>
          Terms
        </a>{' '}
        and{' '}
        <a href="https://api.storyline.my/privacy" className={styles.termsLink}>
          Privacy Policy
        </a>
        . Need help? Email{' '}
        <a href="mailto:coxondj@gmail.com" className={styles.termsLink}>
          coxondj@gmail.com
        </a>
        .
      </p>
    </main>
  )
}
