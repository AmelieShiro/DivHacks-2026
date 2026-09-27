import MapView from "@/components/MapView";
import { getCards, getSubjectGroups, getZipCentroids } from "@/lib/programs";

export default async function MapPage(props: PageProps<"/map">) {
  // Read ?zip= on the server so a shared link opens on that ZIP's programs
  // rather than on the whole city.
  const { zip } = await props.searchParams;
  const cards = getCards();
  return (
    <MapView
      programs={cards}
      subjectGroups={getSubjectGroups(cards)}
      centroids={getZipCentroids()}
      zip={typeof zip === "string" ? zip : ""}
    />
  );
}
