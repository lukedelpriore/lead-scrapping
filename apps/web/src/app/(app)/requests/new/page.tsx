import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export default function NewRequestPage() {
  return (
    <div>
      <PageHeader title="New request" />
      <EmptyState
        title="Request form arrives next"
        body="The full request form (states, groups, tiers, target, credit cap, reveal mode, schedule) is built in the requests milestone. Searching and dedupe are free, and reveal stays off."
        actionLabel="Back to requests"
        actionHref="/requests"
      />
    </div>
  );
}
