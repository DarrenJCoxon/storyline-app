import Image from 'next/image'
import DownloadCard from './DownloadCard'
import InvitedBanner from './InvitedBanner'
import { getDownloads } from './getDownloads'
import styles from './page.module.css'

export default async function HomePage() {
  const downloads = await getDownloads()
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
          A complete environment for writing books — fiction or non-fiction. Plan with
          proven structure, draft in a distraction-free editor, generate covers and
          interior images, and compile to professional EPUB and PDF. From first idea
          to finished book, in one place.
        </p>

        <div className={styles.heroCta}>
          <InvitedBanner />
          <DownloadCard downloads={downloads} />
        </div>

        <div className={styles.heroShot} aria-hidden="true">
          <Image
            src="/hero.png"
            alt="Storyline running on desktop — manuscript chapter open in the rich editor on the left, planning chat in the middle, and a live print preview of the typeset chapter on the right."
            width={3400}
            height={1844}
            priority
            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 90vw, 1080px"
            className={styles.heroShotImg}
          />
          <p className={styles.heroShotCaption}>
            The full Storyline workspace — manuscript, planning chat and typeset preview, side by side.
          </p>
        </div>
      </section>

      {/* ── End-to-end column flow ───────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>From blank page to finished book</h2>
        <p className={styles.sectionLede}>
          Most writers juggle four or five tools — a planning doc, a writing app, an
          image generator, an EPUB converter. Storyline replaces all of them with one
          environment built around the way books are actually made.
        </p>
        <div className={styles.flowGrid}>
          <article className={styles.flowCard}>
            <span className={styles.flowNum}>01</span>
            <h3 className={styles.flowTitle}>Plan</h3>
            <p>
              Conversational planning with an AI partner trained on Save the Cat for
              fiction, and structured frameworks for memoir, how-to, history,
              textbooks, study guides and other non-fiction.
            </p>
          </article>
          <article className={styles.flowCard}>
            <span className={styles.flowNum}>02</span>
            <h3 className={styles.flowTitle}>Write</h3>
            <p>
              Draft chapters in a distraction-free rich editor. Files stay as plain
              markdown on your disk — yours forever.
            </p>
          </article>
          <article className={styles.flowCard}>
            <span className={styles.flowNum}>03</span>
            <h3 className={styles.flowTitle}>Illustrate</h3>
            <p>
              Generate book covers and interior illustrations with AI, styled to match
              your story or subject.
            </p>
          </article>
          <article className={styles.flowCard}>
            <span className={styles.flowNum}>04</span>
            <h3 className={styles.flowTitle}>Compile</h3>
            <p>
              Export a professional-grade EPUB or print-ready PDF, with live preview as
              paperback, iPad and Kindle.
            </p>
          </article>
        </div>
      </section>

      {/* ── Pillar 1: Plan ───────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Plan with proven structure</h2>
        <p className={styles.sectionLede}>
          Whether you’re writing a novel, a memoir, a how-to, narrative non-fiction,
          a textbook or a study guide, Storyline gives you a structured planning
          conversation matched to your form — never a blank template.
        </p>
        <div className={styles.twoCol}>
          <div className={styles.colCard}>
            <h3 className={styles.colCardTitle}>Fiction</h3>
            <ul className={styles.featureList}>
              <li>
                <strong>Save the Cat 15-beat structure</strong> — the framework behind
                countless bestselling novels and screenplays.
              </li>
              <li>
                <strong>Genre variants</strong> — Buddy Love, Whydunit, Golden Fleece
                and seven more, each tuned to genre conventions.
              </li>
              <li>
                <strong>Character-first</strong> — protagonist and supporting cast
                built before the beat sheet, so plot serves character.
              </li>
              <li>
                <strong>Two-pass scene outline</strong> — high-level approved first,
                then chapter-by-chapter with goal, obstacle, stakes and turn.
              </li>
            </ul>
          </div>
          <div className={styles.colCard}>
            <h3 className={styles.colCardTitle}>Non-fiction</h3>
            <ul className={styles.featureList}>
              <li>
                <strong>Book DNA</strong> — premise, audience, promise and through-line
                defined before you write a word.
              </li>
              <li>
                <strong>Form-aware pipelines</strong> — different planning paths for
                memoir, how-to, history, textbooks and study guides — each tuned to
                its conventions.
              </li>
              <li>
                <strong>Sourcing register</strong> — track every claim back to its
                source, with a verification status on each one.
              </li>
              <li>
                <strong>Skill trees and learning objectives</strong> — for textbooks
                and study guides, plan progression, prerequisites and assessment
                points before a single chapter is drafted.
              </li>
              <li>
                <strong>Timeline tools</strong> — chronologies and progression
                structures for memoir, history and biography.
              </li>
            </ul>
          </div>
        </div>
        <p className={styles.featureFooter}>
          AI critique runs at every stage — flagging structural issues, pacing risks
          and consistency drift before they reach the page.
        </p>
      </section>

      {/* ── Pillar 2: Write ──────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>A writing surface built for books</h2>
        <p className={styles.sectionLede}>
          Markdown on disk, rich-text experience on screen. Your prose lives in plain
          files you own forever, edited through an interface designed for long-form
          writing — fiction or non-fiction.
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
            <strong>Research panel</strong> — capture sources, link them to chapters
            and scenes, see what backs every claim.
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
          plan and write — covers, chapter art, diagrams, character portraits — all
          grounded in the work you’ve already defined.
        </p>
        <ul className={styles.featureList}>
          <li>
            <strong>Book covers</strong> — front, back and spine with title, author and
            blurb, generated from your premise and genre or subject.
          </li>
          <li>
            <strong>Chapter illustrations</strong> — visualise key scenes or concepts
            with prompts that draw automatically from your outline.
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
              No exporting an outline from one app and pasting it into another. The
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
          <DownloadCard downloads={downloads} />
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
        <a href="mailto:darren@coxon.ai" className={styles.termsLink}>
          darren@coxon.ai
        </a>
        .
      </p>
    </main>
  )
}
