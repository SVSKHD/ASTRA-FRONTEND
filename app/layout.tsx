import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { DialogProvider } from "@/context/DialogContext";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Astra-Hawk",
  description: "A minimal, customizable dashboard application ",
};

export const viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} antialiased font-mono`}>
        <UserProvider>
          <CurrencyProvider>
            <DialogProvider>{children}</DialogProvider>
          </CurrencyProvider>
        </UserProvider>
      </body>
    </html>
  );
}
