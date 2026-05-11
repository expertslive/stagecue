import { ApiError } from "@/api/client";

type Context = "sign-in" | "default";

export function apiErrorMessage(err: unknown, ctx: Context = "default"): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Can't reach Stagecue. Check your network connection.";
    if (ctx === "sign-in") {
      if (err.status === 401) return "Email or password is incorrect.";
      if (err.status === 423) return "Your account is locked. Try again in a few minutes or contact your administrator.";
      if (err.status === 429) return "Too many sign-in attempts. Please wait a moment and try again.";
    }
    if (err.status === 404) return "We couldn't find what you were looking for.";
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status >= 500) return "Something went wrong on our side. Please try again.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}
