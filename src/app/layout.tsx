import type { Metadata } from "next";
import "./globals.css";
import "./solid-surfaces.css";
import { AppProviders } from "@/components/layout/AppProviders";

export const metadata: Metadata = {
  title: "FLORZY B2B | Lead-to-Store Geo-Assignment & Ground Team Funnel",
  description:
    "FLORZY B2B Lead Geo-Assignment tool: Ingest leads, geocode, plot on interactive map, auto-suggest nearest store, and bulk-assign to ground reps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full light">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="florzy-app min-h-full flex flex-col bg-white text-slate-900 antialiased selection:bg-[#ff4500] selection:text-white">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
