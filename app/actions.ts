"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db"; // <--- Import from lib/db, DO NOT use new PrismaClient() here
import { redirect } from "next/navigation";

export async function createSession() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    throw new Error("Unauthorized");
  }

  // Create a new session in Postgres
  const session = await prisma.liveSession.create({
    data: {
      type: "DEBUG",
      url: "https://nextjs.org",
      hostId: userId,
      active: true,
    },
  });

  redirect(`/live/${session.id}`);
}