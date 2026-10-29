import Link from "next/link";
import l from "./library.module.css";

export default function LibraryHeader() {
  return (
    <header className={l.header}>
      <nav className={l.nav} aria-label="Main">
        <Link href="/" className={l.logo}>
          jambuch<span>.</span>
        </Link>
        <div className={l.navLinks}>
          <Link href="/#translations">All translations</Link>
          <Link href="/#ideas" className={l.navCta}>
            Share your idea
          </Link>
        </div>
      </nav>
    </header>
  );
}
