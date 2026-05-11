import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { useAuthStore } from "@/state/authStore";
import { apiErrorMessage } from "@/lib/apiErrors";

export default function SignInPage() {
  const nav = useNavigate();
  const setSignedIn = useAuthStore((s) => s.setSignedIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await auth.signIn(email, password);
      setSignedIn(email);
      nav("/");
    } catch (err) {
      setError(apiErrorMessage(err, "sign-in"));
    }
  }

  return (
    <div className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:outline-none focus:border-blue-500" />
        </label>
        <label className="block">
          <span className="block text-sm text-zinc-400 mb-1">Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-800 focus:outline-none focus:border-blue-500" />
        </label>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" className="w-full py-2 px-4 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium">
          Sign in
        </button>
      </form>
    </div>
  );
}
