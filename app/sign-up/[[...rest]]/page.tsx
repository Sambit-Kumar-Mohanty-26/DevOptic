"use client"
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-white relative overflow-hidden">
      <div className="absolute top-0 z-[-2] h-screen w-screen bg-zinc-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
      
      <div className="z-10 flex flex-col items-center gap-8">
        <SignUp 
          appearance={{
            elements: {
              formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-sm normal-case",
              card: "bg-zinc-900 border border-zinc-800 shadow-xl",
              headerTitle: "hidden", 
              headerSubtitle: "hidden",
              socialButtonsBlockButton: "bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-white",
              formFieldLabel: "text-zinc-400",
              formFieldInput: "bg-zinc-950 border-zinc-800 text-white",
              footerActionLink: "text-blue-400 hover:text-blue-300"
            }
          }}
        />
      </div>
    </div>
  );
}