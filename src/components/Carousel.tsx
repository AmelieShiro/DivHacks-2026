import type { CardProgram } from "@/lib/types";
import CarouselControls from "./CarouselControls";
import FeaturedCard from "./FeaturedCard";

export default function Carousel({ programs }: { programs: CardProgram[] }) {
  return (
    <CarouselControls>
      {programs.map((p) => (
        <div key={p.id} className="snap-start shrink-0 w-[300px]">
          <FeaturedCard program={p} />
        </div>
      ))}
    </CarouselControls>
  );
}
