import { ApiError } from "@/api/client";

type Context = "sign-in" | "default";

interface IdentityError { code?: string; description?: string }

export function apiErrorMessage(err: unknown, ctx: Context = "default"): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "Can't reach Stagecue. Check your network connection.";
    if (ctx === "sign-in") {
      if (err.status === 401) return "Email or password is incorrect.";
      if (err.status === 423) return "Your account is locked. Try again in a few minutes or contact your administrator.";
      if (err.status === 429) return "Too many sign-in attempts. Please wait a moment and try again.";
    }
    // Surface structured validation messages from the response body before falling back to status copy.
    const detail = extractValidationDetail(err.body);
    if (detail) return detail;
    if (err.status === 404) return "We couldn't find what you were looking for.";
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status >= 500) return "Something went wrong on our side. Please try again.";
    if (err.status === 400) return "We couldn't process that. Check the form and try again.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

/** Parse Identity errors (array of {code, description}) or ASP.NET ModelState ({errors: {field: [msg]}}) into a sentence. */
function extractValidationDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;

  // Identity shape: { errors: [{ code, description }, ...] }
  if (Array.isArray(obj.errors)) {
    const msgs = (obj.errors as IdentityError[])
      .map((e) => e.description)
      .filter((s): s is string => typeof s === "string" && s.length > 0);
    if (msgs.length) return msgs.join(" ");
  }

  // ASP.NET ModelState shape: { errors: { field: ["msg1", "msg2"] }, ... }
  if (obj.errors && typeof obj.errors === "object" && !Array.isArray(obj.errors)) {
    const buckets = obj.errors as Record<string, unknown>;
    const flat: string[] = [];
    for (const v of Object.values(buckets)) {
      if (Array.isArray(v)) for (const m of v) if (typeof m === "string") flat.push(m);
    }
    if (flat.length) return flat.join(" ");
  }

  // Endpoints that return a short code: { error: "AlreadyInitialized" }.
  if (typeof obj.error === "string") return humaniseCode(obj.error);

  return null;
}

function humaniseCode(code: string): string {
  const spaced = code.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() + ".";
}
