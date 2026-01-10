"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

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