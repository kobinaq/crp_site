import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requestLocale, requestPath } from "@/lib/request-locale";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ConsentProvider } from "@/components/cookies/ConsentProvider";
import { copyFor } from "@/lib/messages";
import { outfit } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = { title: "Climate Refugee Pavilion", robots: { index: false, follow: false } };

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = await requestLocale();

  return (
    <html lang={locale} className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <LanguageProvider
          initialLocale={locale}
          initialPath={await requestPath()}
          copy={copyFor(locale)}
        >
          <ConsentProvider>{children}</ConsentProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
