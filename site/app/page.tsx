import DownloadCard from './DownloadCard'
import styles from './page.module.css'

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>
          <span className={styles.wordmarkStory}>story</span>
          <span className={styles.wordmarkLine}>line</span>
        </h1>
        <p className={styles.tagline}>Plan your book. Write your story.</p>
      </header>

      <DownloadCard />

      <p className={styles.terms}>
        By downloading you accept our{' '}
        <a href="https://api.storyline.my/terms" className={styles.termsLink}>
          Terms
        </a>{' '}
        and{' '}
        <a href="https://api.storyline.my/privacy" className={styles.termsLink}>
          Privacy Policy
        </a>
        .
      </p>
    </main>
  )
}
