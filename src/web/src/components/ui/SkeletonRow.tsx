import Skeleton from "./Skeleton";

interface Props {
  /** Number of rows to render. Default 3. */
  count?: number;
}

export default function SkeletonRow({ count = 3 }: Props) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
