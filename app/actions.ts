"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function getSessionRole(sessionId: string) {
  const { userId } = await auth();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    select: { hostId: true, active: true },
  });

  if (!session) {
    return { error: "Session not found" };
  }

  if (!session.active) {
    return { error: "This session has ended." };
  }

  return {
    role: session.hostId === userId ? "host" : "guest",
    userId,
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

export async function getUserStats() {
  const { userId } = await auth();
  if (!userId) return null;

  const totalSessions = await prisma.liveSession.count({
    where: { hostId: userId },
  });

  const activeSessions = await prisma.liveSession.count({
    where: { hostId: userId, active: true },
  });

  return { totalSessions, activeSessions };
}

export async function getUserSessions() {
  const { userId } = await auth();
  if (!userId) return [];

  return await prisma.liveSession.findMany({
    where: { hostId: userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function getRecentSessions(page = 1, limit = 10) {
  const { userId } = await auth();
  if (!userId) return { sessions: [], total: 0 };

  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    prisma.liveSession.findMany({
      where: { hostId: userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: skip,
    }),
    prisma.liveSession.count({
      where: { hostId: userId },
    }),
  ]);

  return { sessions, total };
}

export async function deleteSession(sessionId: string) {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  try {
    await prisma.liveSession.update({
      where: { id: sessionId, hostId: userId },
      data: { active: false },
    });

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return { error: "Failed to delete session" };
  }
}
