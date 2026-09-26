import MapView from "@/components/MapView";
import { getCards } from "@/lib/programs";

export default function MapPage() {
  return <MapView programs={getCards()} />;
}
