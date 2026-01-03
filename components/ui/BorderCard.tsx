export const BorderCard = ({ children, className }: any) => {
  return (
    <div className={`relative p-px overflow-hidden rounded-xl ${className}`}>
      <div className="absolute inset-0 bg-linear-to-r from-cyan-500 via-purple-500 to-cyan-500 animate-[spin_4s_linear_infinite] opacity-50" />
      <div className="relative h-full bg-slate-950 rounded-xl p-6">
        {children}
      </div>
    </div>
  )
}