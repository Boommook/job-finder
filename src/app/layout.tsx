import type{Metadata}from"next";import"./globals.css";import{AppFrame}from"@/components/app-frame";
export const metadata:Metadata={title:"Job Finder",description:"Personal job opportunity dashboard"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body><AppFrame>{children}</AppFrame></body></html>}
