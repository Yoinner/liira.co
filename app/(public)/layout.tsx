import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { PrivacyPreferences } from "@/components/public/privacy-preferences";
import { Suspense } from "react";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <Suspense fallback={null}><PrivacyPreferences /></Suspense>
    </>
  );
}
