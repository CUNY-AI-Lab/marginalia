import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marginalia",
  description: "Read with your sources as conversational agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var shouldBeDark = stored === 'dark' || (stored !== 'light' && prefersDark);
                  if (shouldBeDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {
                  console.error('Theme init error:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased bg-stone-50 dark:bg-gray-900 transition-colors">
        {children}
      </body>
    </html>
  );
}
