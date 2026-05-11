import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { invitations } from "@/api/invitations";
import { ApiError } from "@/api/client";
import SkeletonRow from "@/components/ui/SkeletonRow";
import Button from "@/components/ui/Button";

export default function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const nav = useNavigate();
  const info = useQuery({ queryKey: ["inviteInfo", token], queryFn: () => invitations.info(token!), enabled: !!token, retry: false });
  const accept = useMutation({
    mutationFn: () => invitations.accept(token!),
    onSuccess: (r) => nav(`/events/${r.eventId}`),
  });

  if (!token) return <div className="p-8 text-red-400">Missing token.</div>;
  if (info.isLoading) return <div className="p-8 max-w-md mx-auto"><SkeletonRow count={2} /></div>;
  if (info.error) {
    const err = info.error as ApiError;
    if (err.status === 401) return <div className="p-8">You need to <a href={`/signin`} className="text-blue-400 hover:underline">sign in</a> with the invited email first.</div>;
    if (err.status === 410) return <div className="p-8 text-red-400">This invitation has expired.</div>;
    if (err.status === 409) return <div className="p-8 text-zinc-400">This invitation has already been accepted.</div>;
    return <div className="p-8 text-red-400">Could not load invitation.</div>;
  }

  return (
    <div className="p-8 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Accept invitation</h1>
      <p>You've been invited to <strong>{info.data!.eventName}</strong> as <strong>{info.data!.role}</strong>.</p>
      {accept.error && <p className="text-red-400">Acceptance failed. The signed-in account may not match the invited email.</p>}
      <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
        {accept.isPending ? "Accepting…" : "Accept invitation"}
      </Button>
    </div>
  );
}
