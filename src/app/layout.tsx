import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Startup HQ", template: "%s · Startup HQ" },
  description: "Tasks, meeting notes, decisions and Drive for the founders, run together with your AI.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${plexSans.variable} ${plexMono.variable} font-sans`}>
        {children}
        <Toaster
          position="bottom-left"
          toastOptions={{ classNames: { toast: "!bg-surface !text-ink !border-line-strong !font-sans !text-sm !rounded-md" } }}
        />
      </body>
    </html>
  );
}
