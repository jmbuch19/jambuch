"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// Google Analytics 4. Off until NEXT_PUBLIC_GA_ID is set, and never loaded on
// admin pages so the site owner's own editing isn't counted.
export default function Analytics() {
  const path = usePathname();
  if (!GA_ID || path.startsWith("/admin") || path.startsWith("/auth")) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  );
}
