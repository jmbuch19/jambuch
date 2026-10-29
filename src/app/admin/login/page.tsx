import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "./actions";
import LoginForm from "./login-form";
import a from "../admin.module.css";

export const metadata: Metadata = { title: "Sign in · jambuch.in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Ask for a new one.",
  "not-allowed": "This address isn’t allowed into the admin.",
  "no-role":
    "You’re signed in, but your account doesn’t have the admin role yet. Grant it once in the Supabase SQL editor (see the README), then reload this page.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;
  const signedIn = error === "not-allowed" || error === "no-role";

  return (
    <main className={a.loginWrap}>
      <div className={a.loginCard}>
        <Link href="/" className={a.logo}>
          jambuch<span>.</span>
        </Link>
        <h1 className={a.loginTitle}>Admin</h1>
        {message && (
          <p className={a.error} role="alert">
            {message}
          </p>
        )}
        {signedIn ? (
          <form action={signOut}>
            <button type="submit" className={a.secondary}>
              Sign out
            </button>
          </form>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
