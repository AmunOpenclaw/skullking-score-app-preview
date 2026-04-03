import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Skull King v2</p>
        <h1>Next.js bootstrap is ready.</h1>
        <p>
          This app is the new foundation for the upcoming framework migration.
          Current phase: architecture + CI + domain extraction + interactive parity slice.
        </p>
        <div className={styles.actions}>
          <Link className={styles.link} href="/about">
            About this migration
          </Link>
          <Link className={styles.link} href="/setup">
            Setup shell
          </Link>
          <Link className={styles.link} href="/game">
            Game shell
          </Link>
          <Link className={styles.link} href="/history">
            History shell
          </Link>
        </div>
      </section>
    </main>
  );
}
