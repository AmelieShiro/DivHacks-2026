import ProgramsView from "@/components/ProgramsView";
import { getCards, getSubjectGroups, getZipCentroids } from "@/lib/programs";

export default async function ProgramsPage(props: PageProps<"/programs">) {
  // Read ?zip= on the server so the list arrives rendered and already sorted
  // by distance, rather than as an empty shell filled in after hydration.
  const { zip } = await props.searchParams;
  const cards = getCards();
  return (
    <ProgramsView
      programs={cards}
      subjectGroups={getSubjectGroups(cards)}
      centroids={getZipCentroids()}
      zip={typeof zip === "string" ? zip : ""}
    />
  );
}
