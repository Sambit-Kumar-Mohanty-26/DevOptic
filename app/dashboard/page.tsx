import { currentUser } from "@clerk/nextjs/server";
import { getUserStats, getRecentSessions } from "@/app/actions";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const user = await currentUser();

  if (!user) {
    redirect("/");
  }

  const stats = await getUserStats();
  const { sessions, total } = await getRecentSessions();

  return (
    <DashboardClient
      user={JSON.parse(JSON.stringify(user))}
      stats={stats}
      initialSessions={sessions}
      totalSessions={total}
    />
  );
}