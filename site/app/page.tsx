import DownloadCard from './DownloadCard'
import styles from './page.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Storyline</h1>
        <p className={styles.tagline}>
          Plan your novel from premise to chapter outline, then write it — all in one place.
        </p>
      </header>

      <DownloadCard />

      <section className={styles.steps}>
        <h2 className={styles.sectionTitle}>What happens when you install</h2>
        <ol className={styles.stepList}>
          <li>
            <strong>Run the installer</strong> — it sets up Storyline and opens VS Code with a starter project ready to go.
          </li>
          <li>
            <strong>Activate your licence key</strong> — paste it in once when prompted, and the workspace is ready.
          </li>
          <li>
            <strong>Start planning</strong> — chat with the planning AI, write your beats, draft your chapters.
          </li>
        </ol>
      </section>

      <footer className={styles.footer}>
        <p>
          Need help? Email{' '}
          <a href="mailto:coxondj@gmail.com" className={styles.link}>
            coxondj@gmail.com
          </a>
          .
        </p>
      </footer>
    </main>
  )
}
