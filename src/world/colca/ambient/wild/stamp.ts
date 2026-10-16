/**
 * Bonus wildlife stamps of the Kuntisuyu (`colca:fauna:<id>`, CATALOG in src/lib/passport.ts): emits the
 * stamp once per page view; the passport dedupes across visits.
 */
import { CATALOG } from "../../../../lib/passport";
import { emit } from "../../../events";

export function faunaStamp(id: string): () => void {
  const sid = `colca:fauna:${id}`;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const entry = CATALOG.find((s) => s.id === sid);
    if (entry) emit("world:stamp", { id: sid, kind: "fauna", label: entry.label });
  };
}
