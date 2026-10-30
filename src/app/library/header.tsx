import Link from "next/link";
import l from "./library.module.css";

// Header for the inner pages. The highlighted button defaults to the ideas
// form; the Courtyard swaps it for its own "Contribute".
export default function LibraryHeader({
  cta = { href: "/#ideas", label: "Share your idea" },
  current,
}: {
  cta?: { href: string; label: string };
  current?: "courtyard";
}) {
  return (
    <header className={l.header}>
      <nav className={l.nav} aria-label="Main">
        <Link href="/" className={l.logo}>
          jambuch<span>.</span>
        </Link>
        <div className={l.navLinks}>
          <Link href="/#translations">All translations</Link>
          <Link href="/courtyard" aria-current={current === "courtyard" ? "page" : undefined} className={current === "courtyard" ? l.navCurrent : undefined}>
            Courtyard
          </Link>
          <Link href={cta.href} className={l.navCta}>
            {cta.label}
          </Link>
        </div>
      </nav>
    </header>
  );
}
