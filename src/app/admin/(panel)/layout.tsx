import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { TABLES } from "@/lib/admin-tables";
import LogoMark from "../../logo-mark";
import { signOut } from "../login/actions";
import a from "../admin.module.css";

export const metadata: Metadata = { title: "Admin · jambuch.in", robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className={a.shell}>
      <aside className={a.side}>
        <Link href="/admin" className={a.logo}>
          <LogoMark size={26} />
          <span className={a.word}>
            jambuch<span>.</span> admin
          </span>
        </Link>
        <nav className={a.sideNav} aria-label="Admin">
          {TABLES.filter((t) => !t.ownPage).map((t) => (
            <Link key={t.table} href={`/admin/${t.table}`}>
              {t.label}
            </Link>
          ))}
          <Link href="/admin/courtyard">Courtyard invites</Link>
          <Link href="/admin/audio">Listening</Link>
          <span className={a.navGap} />
          <Link href="/admin/readers">Readers</Link>
          <Link href="/admin/listeners">Listeners</Link>
          <Link href="/admin/trash">Trash</Link>
          <Link href="/admin/log">Delete log</Link>
        </nav>
        <div className={a.sideFoot}>
          <a href="/" target="_blank" rel="noopener noreferrer">
            View site ↗
          </a>
          <span>{user.email}</span>
          <form action={signOut}>
            <button type="submit" className={a.linkButton}>
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className={a.main}>{children}</main>
    </div>
  );
}
