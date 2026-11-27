import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./theme-dark.css";
import { themeBootScript } from "@/lib/theme";
export const metadata: Metadata = {
  title: { default: "RoleFoundry — Your next chapter in AI", template: "%s | RoleFoundry" },
  description:
    "Discover AI roles, explore your skill gaps, and build a learning path with curated DeepLearning.AI resources. An open-source career workspace.",
  applicationName: "RoleFoundry",
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icon.svg` },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
