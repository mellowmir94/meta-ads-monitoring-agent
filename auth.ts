import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const authProviderCatalog = [
  {
    id: "github",
    label: "GitHub",
    enabled: Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)
  },
  {
    id: "google",
    label: "Google",
    enabled: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)
  }
] as const;

const providers = [
  authProviderCatalog[0].enabled
    ? GitHub({
        clientId: process.env.AUTH_GITHUB_ID,
        clientSecret: process.env.AUTH_GITHUB_SECRET
      })
    : null,
  authProviderCatalog[1].enabled
    ? Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET
      })
    : null
].filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  trustHost: true,
  callbacks: {
    signIn({ user }) {
      return Boolean(user.email);
    }
  }
});
