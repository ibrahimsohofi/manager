import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function StatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={`skeleton-card-${index + 1}`} className="border-2 shadow-lg border-blue-800 dark:border-blue-400">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-[120px]" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-[100px] mb-1" />
            <Skeleton className="h-3 w-[180px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
