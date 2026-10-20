import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import "./liira-public.css";
import "./liira-admin.css";
import "./liira-admin-premium.css";
import "./liira-whatsapp-experience.css";
import { siteConfig } from "@/lib/config";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600"],
  display: "swap",
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.title, template: "%s | Liira" },
  description: siteConfig.description,
  applicationName: "Liira",
  alternates: { canonical: "/" },
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    type: "website",
    locale: "es_CO",
    images: [{ url: "/brand/liira-logo.png", width: 1080, height: 1080, alt: "Liira Accesorios" }],
  },
  twitter: { card: "summary_large_image", title: siteConfig.title, description: siteConfig.description },
};

export const viewport: Viewport = {
  themeColor: "#f4eadc",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
