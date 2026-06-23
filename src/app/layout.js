import { Geist, Geist_Mono } from "next/font/google";
import ThemeProvider from "@/components/theme/ThemeProvider";
import ThemeScript from "@/components/theme/ThemeScript";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "ScrappyAI",
  description: "App Store ve Google Play yorum kazıma ve AI analiz paneli",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
