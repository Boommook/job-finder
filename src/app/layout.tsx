import type{Metadata}from"next";import"./globals.css";import{AppSidebar}from"@/components/app-sidebar";
export const metadata:Metadata={title:"Job Finder",description:"Personal job opportunity dashboard"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body><div className="min-h-screen md:grid md:grid-cols-[232px_1fr]"><AppSidebar/><main className="min-w-0 px-4 pb-24 pt-6 sm:px-6 md:px-8 md:pb-8 md:pt-8">{children}</main></div></body></html>}
