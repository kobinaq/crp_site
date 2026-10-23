import { Button } from "@/components/admin/Button";
import { card } from "@/components/admin/marks";
import { AREA_HREF, consoleAreas, type ConsoleArea } from "@/lib/admin/access";
import { currentStaff } from "@/lib/staff/gate";

const LINKS: readonly { readonly area: ConsoleArea; readonly label: string }[] = [
  { area: "records", label: "Records" },
  { area: "dashboard", label: "Dashboard" },
  { area: "copy", label: "Website text" },
];

// Shown for missing records and for pages a role cannot open. Only links the
// signed-in role can actually use are offered.
export default async function AdminNotFound() {
  const staff = await currentStaff();
  const areas = staff ? consoleAreas(staff.role) : [];
  const links = LINKS.filter((link) => areas.includes(link.area));
  return (
    <div className={card} role="alert">
      <h1 className="text-xl font-semibold">That page is not here</h1>
      <p className="mt-2 text-sm text-black/70">It may have moved, or your role does not include it.</p>
      {links.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {links.map((link, index) => (
            <Button key={link.area} href={AREA_HREF[link.area]} variant={index === 0 ? "solid" : "outline"}>{link.label}</Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
