import { auth, authProviderCatalog, signIn, signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { resolveAdminAuthorizationForScope } from "@/lib/admin-authorization";
import type { ApplySharpUserScope } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  const configuredProviders = authProviderCatalog.filter((provider) => provider.enabled);
  const userScope: ApplySharpUserScope | null = session?.user?.email
    ? {
        email: session.user.email.toLowerCase(),
        name: session.user.name ?? undefined,
        source: "authjs-session"
      }
    : null;
  const adminAuthorization = resolveAdminAuthorizationForScope(userScope);

  return (
    <AppShell activePath="/account">
      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-line bg-ink p-6 text-white shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-skyglass">Account</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold leading-tight">Sign in before storing resumes, applications, and subscription data.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
            Auth.js is wired with the Prisma adapter. Configure GitHub or Google OAuth env vars to enable production sign-in buttons.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-panel">
          {session?.user ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">Signed in</p>
              <h2 className="mt-2 text-2xl font-semibold">{session.user.name ?? session.user.email}</h2>
              <p className="mt-2 text-sm text-ink/60">{session.user.email}</p>
              <p className="mt-4 rounded-md border border-line bg-field p-3 text-sm text-ink/65">
                Admin: {adminAuthorization.authorized ? `${adminAuthorization.role} access granted` : "not authorized"}
              </p>
              <form action={signOutAction} className="mt-5">
                <button className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-field" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">Sign in</p>
              <h2 className="mt-2 text-2xl font-semibold">Choose a provider</h2>
              <div className="mt-5 grid gap-3">
                {configuredProviders.length ? (
                  configuredProviders.map((provider) => (
                    <form key={provider.id} action={signInAction}>
                      <input type="hidden" name="provider" value={provider.id} />
                      <button className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white" type="submit">
                        Continue with {provider.label}
                      </button>
                    </form>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-line bg-field p-4 text-sm leading-6 text-ink/65">
                    No OAuth provider is configured yet. Set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`, or `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, then restart the app.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

async function signInAction(formData: FormData) {
  "use server";

  const provider = String(formData.get("provider") ?? "");

  if (provider) {
    await signIn(provider, { redirectTo: "/dashboard" });
  }
}

async function signOutAction() {
  "use server";

  await signOut({ redirectTo: "/account" });
}
