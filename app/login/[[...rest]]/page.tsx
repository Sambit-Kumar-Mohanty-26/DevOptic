"use client"
import { SignIn } from "@clerk/nextjs";
import { InteractiveGrid } from "@/components/ui/InteractiveGrid";

export default function LoginPage() {
  return (
    <InteractiveGrid>
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="z-10 flex flex-col items-center gap-6 p-8 border border-slate-800 bg-slate-950/80 backdrop-blur-xl rounded-2xl shadow-2xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">Access Terminal</h1>
            <p className="text-slate-500 text-xs mt-2 font-mono">IDENTIFY YOURSELF</p>
          </div>
          <SignIn 
            appearance={{
              elements: {
                formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-sm normal-case rounded-sm",
                card: "bg-transparent shadow-none p-0",
                headerTitle: "hidden", 
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white rounded-sm",
                formFieldLabel: "text-slate-400 font-mono text-xs uppercase",
                formFieldInput: "bg-slate-950 border-slate-800 text-white rounded-sm focus:border-blue-500",
                footerActionLink: "text-blue-400 hover:text-blue-300"
              }
            }}
          />
        </div>
      </div>
    </InteractiveGrid>
  );
}