import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "일룸 LSA 교육 대시보드",
  description: "일룸 신입사원 교육 관리 및 성적 분석 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
