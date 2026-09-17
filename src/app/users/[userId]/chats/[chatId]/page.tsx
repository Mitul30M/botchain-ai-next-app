import { Skeleton } from "@/components/ui/skeleton";

export default function ChatPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-16 w-3/4 self-start" />
        <Skeleton className="h-16 w-2/3 self-end" />
        <Skeleton className="h-16 w-3/4 self-start" />
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
