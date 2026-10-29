// Temporary page for step 1: checks that colours and the three fonts load.
// Replaced by the real homepage in step 3.
export default function Home() {
  return (
    <main className="container" style={{ padding: "88px var(--gutter)" }}>
      <p className="gu" style={{ margin: "0 0 12px", fontSize: 20, color: "var(--muted)" }}>
        જયદીપ બૂચ
      </p>
      <h1 style={{ margin: 0, fontSize: "clamp(40px, 9vw, 64px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}>
        Jaydeep Buch
      </h1>
      <p style={{ marginTop: 24, maxWidth: 640, color: "var(--ink-soft)" }}>
        jambuch.in is being built. <span style={{ color: "var(--saffron)" }}>Step 1 of Phase 1.</span>
      </p>
    </main>
  );
}
