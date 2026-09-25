import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NIVRA — Indian Market Intelligence",
  description:
    "Understand the setup. See the risk. Decide with clarity. Research NSE and BSE stocks with transparent technical evidence, watchlists and price alerts.",
  applicationName: "NIVRA",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/brand/apple-touch-icon.png", sizes: "180x180" },
  },
  // Makes "Add to Home Screen" open a full-screen, chromeless app on iOS with a
  // dark, translucent status bar (content draws under it; the header pads for it).
  appleWebApp: {
    capable: true,
    title: "NIVRA",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#101714",
  colorScheme: "dark" as const,
  width: "device-width",
  initialScale: 1,
  // Draw into the notch/safe areas so the dark UI is edge-to-edge; components
  // pad with env(safe-area-inset-*) so nothing hides under the notch/home bar.
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
