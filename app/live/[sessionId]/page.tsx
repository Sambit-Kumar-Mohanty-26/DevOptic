export default function LiveSessionPage({ params }: { params: { sessionId: string } }) {
  return (
    <div className="flex h-screen items-center justify-center text-white bg-slate-950">
      <h1 className="text-2xl font-bold">Session ID: {params.sessionId}</h1>
      <p className="text-slate-500 ml-4">(Live Engine Loading...)</p>
    </div>
  )
}