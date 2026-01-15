"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db"; 
import { redirect } from "next/navigation";

export async function getSessionRole(sessionId: string) {
  const { userId } = await auth();
  
  if (!userId) {
    return { error: "Unauthorized" };
  }

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { hostId: true, active: true }
  });

  if (!session) {
    return { error: "Session not found" };
  }

  if (!session.active) {
      return { error: "This session has ended." };
  }

  const isHost = session.hostId === userId;

  return { 
    role: isHost ? "host" : "guest",
    userId 
  };
}

export async function createSession() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    throw new Error("Unauthorized");
  }

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