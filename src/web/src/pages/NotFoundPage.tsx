import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";

export default function NotFoundPage() {
  return (
    <div className="p-10 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">We can't find that page</h1>
      <p className="mt-2 text-sm text-zinc-500">
        The link you followed might be out of date.
      </p>
      <div className="mt-6">
        <Link to="/"><Button>Back to events</Button></Link>
      </div>
    </div>
  );
}
