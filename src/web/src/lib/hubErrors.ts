export function humaniseHubError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/VersionMismatch|StaleVersion/i.test(msg)) {
    return "Your view was out of date — another operator just changed something. Refreshing now.";
  }
  if (/InvalidPhase/i.test(msg)) {
    return "That's not the right time for that action. The timer state has moved on.";
  }
  if (/NoNextItem/i.test(msg)) {
    return "Nothing to skip — this is the last item in the schedule.";
  }
  if (/NotFound/i.test(msg)) {
    return "We couldn't find that. It may have been removed.";
  }
  if (/Forbidden|Unauthorized/i.test(msg)) {
    return "You don't have permission to do that.";
  }
  return "Something went wrong. The system has been notified.";
}
