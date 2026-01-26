"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

async function prismaWithRetry<T>(
  fn: () => Promise<T>,
  retries = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const message = error?.message ?? "";

    if (
      retries > 0 &&
      message.includes("Can't reach database server")
    ) {
      try {
        await prisma.$disconnect();
      } catch {}

      await new Promise(res => setTimeout(res, 1500));

      return prismaWithRetry(fn, retries - 1);
    }

    throw error;
  }
}

export async function getSessionRole(sessionId: string) {
  const { userId } = await auth();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  const session = await prismaWithRetry(() =>
    prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { hostId: true, active: true },
    })
  );

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

  const session = await prismaWithRetry(() =>
    prisma.liveSession.create({
      data: {
        type: "DEBUG",
        url: "https://nextjs.org",
        hostId: userId,
        active: true,
      },
    })
  );

  redirect(`/live/${session.id}`);
}
