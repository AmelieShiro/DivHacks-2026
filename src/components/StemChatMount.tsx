import StemChat from "@/components/StemChat";
import { getChatCatalog } from "@/lib/chat/catalog";

export default function StemChatMount() {
  return <StemChat catalog={getChatCatalog()} />;
}
