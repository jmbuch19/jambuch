import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "jambuch", robots: { index: false } };

// The home-screen icon opens here (manifest start_url): straight on to the
// chapter and paragraph the reader was on, or the moving library if none.
// A plain inline script, not React, so it works at once and offline even
// before the site's scripts are stored. A signed-in member's account may know
// a newer place from another device; the reader never waits more than 1.5 s
// for it. (Keys and shapes as in library/bookmarks.ts.)
const SCRIPT = `(function(){
var done=false;
function list(){try{var l=JSON.parse(localStorage.getItem("reader-positions")||"[]");return Array.isArray(l)?l:[]}catch(e){return[]}}
function go(){if(done)return;done=true;
var best=null;list().forEach(function(p){if(p&&typeof p.path==="string"&&p.path.indexOf("/library/")===0&&(!best||p.at>best.at))best=p});
location.replace(best?(best.para>0?best.path+"#p-"+(best.para+1):best.path):"/#translations")}
if(/(?:^|;\\s*)sb-[^=]*auth-token/.test(document.cookie)&&window.fetch){
fetch("/api/position",{cache:"no-store"}).then(function(r){return r.ok?r.json():[]}).then(function(remote){
var mine=list(),by={};mine.forEach(function(p){by[p.work]=p});
(remote||[]).forEach(function(r){if(!by[r.work]||r.at>by[r.work].at)by[r.work]=r});
var out=Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return b.at-a.at});
try{localStorage.setItem("reader-positions",JSON.stringify(out.slice(0,50)))}catch(e){}
go()}).catch(go);setTimeout(go,1500)}else go()})()`;

export default function ContinuePage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p className="gu" style={{ fontSize: 20, color: "var(--muted)" }}>
        વાંચન ચાલુ થાય છે…
      </p>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      <noscript>
        <Link href="/#translations">Open the library</Link>
      </noscript>
    </main>
  );
}
