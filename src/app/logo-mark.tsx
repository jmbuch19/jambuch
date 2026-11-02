import m from "./logo-mark.module.css";

// The round J. The letter is Newsreader Bold (the heading font), drawn as a
// path so it looks the same before fonts load and in any size.
const J =
  "M39.31 35.56Q39.31 38.34 38.06 40.77Q36.8 43.21 34.71 45.06Q32.61 46.91 30.07 47.96Q27.52 49 24.94 49Q23.65 49 22.78 48.62Q21.91 48.25 21.47 47.56Q21.04 46.87 21.04 45.96Q21.04 44.74 21.8 43.94Q22.57 43.15 23.54 43.15Q23.82 43.15 24.27 43.54Q24.72 43.93 25.3 44.44Q25.88 44.95 26.59 45.34Q27.3 45.72 28.08 45.72Q28.97 45.72 29.44 45.24Q29.91 44.75 29.91 43.44V16.87L26.26 15.83V15H42.96V15.83L39.31 16.87Z";

export default function LogoMark({ size = 28, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={`${m.mark} ${animate ? m.animate : ""}`}
    >
      <circle cx="32" cy="32" r="29.5" fill="#fff" />
      {/* Starts at the top and runs clockwise when it draws itself. */}
      <circle
        cx="32"
        cy="32"
        r="29.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        pathLength={1}
        transform="rotate(-90 32 32)"
        className={m.ring}
      />
      <path d={J} transform="translate(-1 0)" fill="currentColor" className={m.letter} />
    </svg>
  );
}

// Homepage: the mark draws itself once, then the motto appears beside it.
export function LogoIntro() {
  return (
    <div className={m.intro}>
      <LogoMark size={72} animate />
      <p className={m.motto}>Publish. Connect. Belong.</p>
    </div>
  );
}
