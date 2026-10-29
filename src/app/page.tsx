import type { ReactNode } from "react";
import { loadHome, type HomeContent, type Project } from "@/lib/content";
import { inline } from "@/lib/inline";
import IdeaForm from "./idea-form";
import LibraryTable from "./library-table";
import s from "./home.module.css";

// Content is edited in Supabase, so refresh the cached page every minute.
export const revalidate = 60;

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

// A link that opens in a new tab only when it leaves the site.
function linkProps(href: string) {
  return href.startsWith("/") || href.startsWith("#") ? { href } : { href, ...external };
}

type Section = {
  id: string;
  nav: string;
  key: string; // site_text prefix for title / Gujarati word / intro
  tone?: "alt" | "dark";
  split?: boolean; // heading on the left, body in a card on the right
  cta?: boolean; // shown as the highlighted button in the nav
  body: ReactNode;
};

export default async function Home() {
  const c = await loadHome();
  const t = (key: string) => c.text[key]?.en ?? "";
  const g = (key: string) => c.text[key]?.gu ?? "";

  const sections = buildSections(c, t).filter((x): x is Section => x !== null);
  // Alternate backgrounds by position, so hiding an empty section keeps the rhythm.
  let light = true;

  return (
    <>
      <header className={s.header}>
        <nav className={s.nav} aria-label="Main">
          <a href="#top" className={s.logo}>
            jambuch<span>.</span>
          </a>
          <div className={s.navLinks}>
            {sections
              .filter((sec) => !sec.cta)
              .map((sec) => (
                <a key={sec.id} href={`#${sec.id}`}>
                  {sec.nav}
                </a>
              ))}
            {sections
              .filter((sec) => sec.cta)
              .map((sec) => (
                <a key={sec.id} href={`#${sec.id}`} className={s.navCta}>
                  {sec.nav}
                </a>
              ))}
          </div>
        </nav>
      </header>

      <main>
        <section id="top" className={s.hero}>
          <div className={s.heroMain}>
            {g("hero.name") && <p className={`gu ${s.heroGu}`}>{g("hero.name")}</p>}
            <h1 className={s.heroName}>{t("hero.name") || "Jaydeep Buch"}</h1>
            <p className={s.heroIntro}>{inline(t("hero.intro"))}</p>
            <div className={s.buttons}>
              <a href="#projects" className={s.btnDark}>
                See what I build
              </a>
              <a href="#advising" className={s.btnOutline}>
                Study-abroad advising
              </a>
            </div>
          </div>
          {c.desk.length > 0 && (
            <aside className={s.desk}>
              <p className={s.eyebrow}>{t("desk.title") || "On my desk now"}</p>
              <ul className={s.deskList}>
                {c.desk.map((d) => (
                  <li key={d.id}>
                    {d.link ? (
                      <a {...linkProps(d.link)} className={s.deskLink}>
                        {inline(d.text)}
                        <span className={s.deskGo}>{d.link.startsWith("/library/") ? "Read" : "Open"} →</span>
                      </a>
                    ) : (
                      <span>{inline(d.text)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </section>

        {sections.map((sec, i) => {
          const tone = sec.tone ?? (light ? undefined : "alt");
          if (!sec.tone) light = !light;
          const head = (
            <>
              <div className={s.sectionHead}>
                <span className={s.num}>{String(i + 1).padStart(2, "0")}</span>
                <h2>{t(`${sec.key}.title`)}</h2>
                {g(`${sec.key}.title`) && <span className={`gu ${s.sectionGu}`}>{g(`${sec.key}.title`)}</span>}
              </div>
              {t(`${sec.key}.intro`) ? (
                <p className={sec.id === "advising" ? s.introWide : s.intro}>{inline(t(`${sec.key}.intro`))}</p>
              ) : null}
            </>
          );
          return (
            <section
              key={sec.id}
              id={sec.id}
              className={[s.section, tone && s[tone]].filter(Boolean).join(" ")}
            >
              {sec.split ? (
                <div className={`${s.inner} ${s.split}`}>
                  <div className={s.splitText}>{head}</div>
                  <div className={s.splitBody}>{sec.body}</div>
                </div>
              ) : (
                <div className={s.inner}>
                  {head}
                  {sec.body}
                </div>
              )}
            </section>
          );
        })}
      </main>

      <Footer t={t} g={g} />
    </>
  );
}

function buildSections(c: HomeContent, t: (key: string) => string): (Section | null)[] {
  const mine = c.projects.filter((p) => p.project_group === "mine");
  const others = c.projects.filter((p) => p.project_group === "built_for_others");
  const current = c.reading.find((r) => r.is_current);
  const recs = c.reading.filter((r) => !r.is_current);
  const credentials = t("advising.credentials").split("\n").map((x) => x.trim()).filter(Boolean);
  const advice = ["us", "visa", "other"].filter((k) => t(`advising.${k}.title`));

  return [
    c.projects.length
      ? {
          id: "projects",
          nav: "Projects",
          key: "projects",
          body: (
            <>
              {mine.length > 0 && (
                <>
                  <h3 className={s.subhead}>My platforms</h3>
                  <div className={s.gridMine}>
                    {mine.map((p) => (
                      <article key={p.id} className={`${s.card} ${s.cardMine} ${s.branded}`} style={brand(p)}>
                        <div className={s.cardTop}>
                          <div className={s.cardName}>
                            <ProjectMark p={p} size={40} />
                            <h4>{p.name}</h4>
                          </div>
                          {p.status && <span className={s.pill}>{p.status}</span>}
                        </div>
                        <p className={s.cardText}>{inline(p.description)}</p>
                        {p.url && (
                          <a {...linkProps(p.url)} className={s.visit}>
                            Visit {p.domain ?? p.name}
                            <ArrowIcon />
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
              {others.length > 0 && (
                <>
                  <h3 className={`${s.subhead} ${mine.length ? s.gapTop : ""}`}>Built for others</h3>
                  <div className={s.gridOthers}>
                    {others.map((p) => (
                      <article key={p.id} className={`${s.cardOther} ${s.branded}`} style={brand(p)}>
                        <div className={s.cardName}>
                          <ProjectMark p={p} size={32} />
                          <h4>{p.name}</h4>
                        </div>
                        <p>{inline(p.description)}</p>
                        {p.url && (
                          <a {...linkProps(p.url)} className={s.smallLink}>
                            {p.domain ?? p.name} →
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          ),
        }
      : null,

    c.reading.length
      ? {
          id: "reading",
          nav: "Reading",
          key: "reading",
          body: (
            <div className={s.readingRow}>
              {current && (
                <div className={s.current}>
                  <p className={s.eyebrow}>Currently reading</p>
                  {/* Covers come from any host the admin pastes, so a plain img is used. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {current.cover_url && <img src={current.cover_url} alt="" className={s.cover} />}
                  <h3>{current.link ? <a {...linkProps(current.link)}>{current.title}</a> : current.title}</h3>
                  {current.author && <p className={s.currentAuthor}>{current.author}</p>}
                  {current.why && <p className={s.currentWhy}>“{inline(current.why)}”</p>}
                </div>
              )}
              {recs.length > 0 && (
                <div className={s.recs}>
                  <p className={s.subhead}>I recommend</p>
                  {recs.map((r) => (
                    <div key={r.id} className={s.rec}>
                      <span className={s.kind}>{r.type === "article" ? "Article" : "Book"}</span>
                      <h4>
                        {r.link ? <a {...linkProps(r.link)}>{r.title}</a> : r.title}
                        {r.author && ` — ${r.author}`}
                      </h4>
                      {r.why && <p>{inline(r.why)}</p>}
                    </div>
                  ))}
                  {c.books.length > 0 && (
                    <a href="#library" className={s.smallLink}>
                      Browse the whole library →
                    </a>
                  )}
                </div>
              )}
            </div>
          ),
        }
      : null,

    c.works.length
      ? {
          id: "translations",
          nav: "Translations",
          key: "translations",
          body: (
            <div className={s.gridWorks}>
              {c.works.map((w, i) => {
                // Rights rule: a read link is shown only once rights are granted or public domain.
                // Without an explicit link, a work with a slug opens its own book page.
                const href = w.link || (w.slug ? `/library/${w.slug}` : null);
                const showLink = w.readable && href;
                return (
                  <article key={w.id} className={w.upcoming ? `${s.work} ${s.workUpcoming}` : s.work}>
                    {!w.upcoming && <div className={i === 0 ? `${s.workBar} ${s.workBarAccent}` : s.workBar} />}
                    <div className={s.workBody}>
                      {w.title_gu ? (
                        <p className={`gu ${s.workTitle}`} lang="gu">
                          {w.title_gu}
                        </p>
                      ) : (
                        <p className={s.workTitle}>{w.title}</p>
                      )}
                      <p className={s.workDesc}>{inline(w.description)}</p>
                      {showLink ? (
                        <a {...linkProps(href)} className={s.workLink}>
                          {w.link_label || "Read"} →
                        </a>
                      ) : (
                        w.status_label && <span className={s.workStatus}>{w.status_label}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ),
        }
      : null,

    c.workshop.length
      ? {
          id: "workshop",
          nav: "In progress",
          key: "workshop",
          body: (
            <ul className={s.bench}>
              {c.workshop.map((w) => (
                <li key={w.id}>
                  <span className={s.benchKind}>{w.kind}</span>
                  <span className={s.benchTitle}>{inline(w.title)}</span>
                  {w.stage && <span className={s.benchStage}>{w.stage}</span>}
                </li>
              ))}
            </ul>
          ),
        }
      : null,

    {
      id: "advising",
      nav: "Advising",
      key: "advising",
      body: (
        <>
          {credentials.length > 0 && (
            <ul className={s.creds}>
              {credentials.map((cr) => (
                <li key={cr}>{cr}</li>
              ))}
            </ul>
          )}
          <div className={s.gridAdvice}>
            {advice.map((k) => (
              <div key={k} className={s.advice}>
                <AdviceIcon kind={k} />
                <h3>{t(`advising.${k}.title`)}</h3>
                <p>{inline(t(`advising.${k}.body`))}</p>
              </div>
            ))}
          </div>
          {(t("advising.cta_email") || t("advising.fee_note")) && (
            <div className={s.cta}>
              {t("advising.cta_email") && (
                <a href={`mailto:${t("advising.cta_email")}`} className={s.btnAccent}>
                  Book an advising session
                </a>
              )}
              {t("advising.cta_email") && <span>{t("advising.cta_email")}</span>}
              {t("advising.fee_note") && <span>{t("advising.fee_note")}</span>}
            </div>
          )}
        </>
      ),
    },

    c.recordings.length
      ? {
          id: "music",
          nav: "Music",
          key: "music",
          tone: "dark",
          body: (
            <ul className={s.tracks}>
              {c.recordings.map((r) => (
                <li key={r.id}>
                  {r.link ? (
                    <a {...linkProps(r.link)} className={s.play} aria-label={`Listen to ${r.title}`}>
                      <PlayIcon />
                    </a>
                  ) : (
                    <span className={s.play} aria-hidden="true">
                      <PlayIcon />
                    </span>
                  )}
                  <div className={s.trackMain}>
                    <div className={s.trackTitle}>{r.title}</div>
                    {r.details && <div className={s.trackMeta}>{r.details}</div>}
                  </div>
                  {r.duration && <span className={s.trackLen}>{r.duration}</span>}
                </li>
              ))}
            </ul>
          ),
        }
      : null,

    {
      id: "ideas",
      nav: "Share your idea",
      key: "ideas",
      split: true,
      cta: true,
      body: <IdeaForm />,
    },

    c.books.length
      ? {
          id: "library",
          nav: "Library",
          key: "library",
          body: <LibraryTable books={c.books} />,
        }
      : null,

    c.notebook.length
      ? {
          id: "notebook",
          nav: "Notebook",
          key: "notebook",
          body: (
            <>
              <div className={s.gridNotes}>
                {c.notebook.map((n) => {
                  if (n.type === "photo" && n.image_url) {
                    const inner = (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={n.image_url} alt={n.title ?? ""} loading="lazy" />
                        {n.title && <span>{n.title}</span>}
                      </>
                    );
                    return n.link ? (
                      <a key={n.id} {...linkProps(n.link)} className={s.photo}>
                        {inner}
                      </a>
                    ) : (
                      <div key={n.id} className={s.photo}>
                        {inner}
                      </div>
                    );
                  }
                  const gujarati = /[઀-૿]/.test(n.body ?? "");
                  return (
                    <div key={n.id} className={s.note}>
                      <span className={s.kind}>{n.type === "poem" ? "Poem" : n.title || "Note"}</span>
                      {n.body && (
                        <p className={gujarati ? `gu ${s.noteBody}` : s.noteBody} lang={gujarati ? "gu" : undefined}>
                          {inline(n.body)}
                        </p>
                      )}
                      {n.link && (
                        <a {...linkProps(n.link)} className={s.smallLink}>
                          Read more →
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={s.next}>
                <p>The next chapter goes here.</p>
                <span>Space reserved for what comes next</span>
              </div>
            </>
          ),
        }
      : null,
  ];
}

function Footer({ t, g }: { t: (key: string) => string; g: (key: string) => string }) {
  const youtube = t("footer.youtube");
  const linkedin = t("footer.linkedin");
  const email = t("footer.email");
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <span>
          <span className={s.footerName}>jambuch.in</span> · Ahmedabad
        </span>
        <div className={s.footerLinks}>
          {youtube && (
            <a href={youtube} {...external}>
              YouTube{g("footer.youtube") && ` · ${g("footer.youtube")}`}
            </a>
          )}
          {linkedin && (
            <a href={linkedin} {...external}>
              LinkedIn
            </a>
          )}
          {email && <a href={`mailto:${email}`}>{email}</a>}
        </div>
      </div>
    </footer>
  );
}

// The project's brand colour, used for the card's top band and letter badge.
function brand(p: Project) {
  return p.color ? ({ "--brand": p.color } as React.CSSProperties) : undefined;
}

// The project's own logo, or its first letter when there is none.
function ProjectMark({ p, size }: { p: Project; size: number }) {
  if (p.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={p.logo_url} alt="" width={size} height={size} className={s.mark} loading="lazy" />
    );
  }
  return (
    <span className={`${s.mark} ${s.markLetter}`} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {p.name.charAt(0).toUpperCase()}
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function AdviceIcon({ kind }: { kind: string }) {
  const paths: Record<string, ReactNode> = {
    us: (
      <>
        <path d="M22 10L12 5 2 10l10 5 10-5z" />
        <path d="M6 12v5c3 2 9 2 12 0v-5" />
      </>
    ),
    visa: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <circle cx="12" cy="10" r="3" />
        <path d="M8 17h8" />
      </>
    ),
    other: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c3 3 3 15 0 18" />
        <path d="M12 3c-3 3-3 15 0 18" />
      </>
    ),
  };
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[kind]}
    </svg>
  );
}
