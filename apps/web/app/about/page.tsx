import Link from "next/link";

export default function AboutPage() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
      <section style={{ width: "min(720px, 100%)", display: "grid", gap: "0.8rem" }}>
        <h1>About Skull King v2 migration</h1>
        <p>
          This page exists for E2E smoke coverage and will later host full migration notes directly in the app.
        </p>
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
