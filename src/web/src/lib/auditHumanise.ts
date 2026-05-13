/**
 * Humanise audit log rows for display. The server records bare enum-like action names and
 * raw JSON payloads (e.g. "SetMessage" + `{"length":8}`); this module converts those into
 * a sentence-cased verb + a short detail string the audit screen renders.
 *
 * Unknown actions fall back to the raw action name so the log never goes blank when a
 * new server-side event is added before the client is updated.
 */

export interface HumanisedAudit {
  /** Sentence-cased verb, e.g. "Set message", "Started session", "Updated door layout". */
  verb: string;
  /** Optional one-line context, e.g. "8-character message" or "+60 sec". Null if no detail. */
  detail: string | null;
}

interface ParsedDetails {
  scheduleItemId?: string;
  trigger?: string;
  nextItemId?: string;
  deltaSec?: number;
  remainingSec?: number;
  length?: number;
  targetUserId?: string;
}

function parseDetails(raw: string | null | undefined): ParsedDetails {
  if (!raw || raw === "{}") return {};
  try {
    return JSON.parse(raw) as ParsedDetails;
  } catch {
    return {};
  }
}

export function humaniseAudit(action: string, detailsJson: string | null | undefined): HumanisedAudit {
  const d = parseDetails(detailsJson);
  switch (action) {
    // Timer lifecycle
    case "Start":
      return { verb: "Started session", detail: d.trigger ? `(${d.trigger.toLowerCase()})` : null };
    case "AutoStart":
      return { verb: "Auto-started session", detail: "by scheduler" };
    case "Pause":
      return { verb: "Paused session", detail: null };
    case "Resume":
      return { verb: "Resumed session", detail: null };
    case "Stop":
      return { verb: "Stopped session", detail: null };
    case "Reset":
      return { verb: "Reset to idle", detail: null };
    case "SkipNext":
      return { verb: "Skipped to next item", detail: null };
    case "AdjustTime": {
      const ds = d.deltaSec ?? 0;
      const sign = ds > 0 ? "+" : "";
      return { verb: "Adjusted time", detail: ds ? `${sign}${ds} sec` : null };
    }
    case "SetExactRemaining":
      return { verb: "Set remaining time", detail: d.remainingSec != null ? `${d.remainingSec} sec` : null };
    case "PreRollExpired":
      return { verb: "Pre-roll expired", detail: "session auto-armed" };

    // Messages
    case "SetMessage":
      return { verb: "Set message", detail: d.length != null ? `${d.length}-char message` : null };
    case "ClearMessage":
      return { verb: "Cleared message", detail: null };

    // Room admin
    case "RegenerateAccessCode":
      return { verb: "Reset room access code", detail: null };
    case "Room.DoorConfigUpdated":
      return { verb: "Updated door display layout", detail: null };
    case "RegenerateLobbyAccessCode":
      return { verb: "Reset lobby access code", detail: null };

    // Member admin
    case "Member.PasswordResetLink":
      return { verb: "Sent password reset link", detail: null };
    case "Member.PasswordSetByAdmin":
      return { verb: "Set temporary password", detail: null };
    case "Member.ProfileUpdated":
      return { verb: "Updated member profile", detail: null };
    case "Member.AccountLocked":
      return { verb: "Locked member account", detail: null };
    case "Member.AccountUnlocked":
      return { verb: "Unlocked member account", detail: null };

    // Auth
    case "Auth.PasswordResetCompleted":
      return { verb: "Reset own password", detail: null };

    default:
      return { verb: action, detail: null };
  }
}
