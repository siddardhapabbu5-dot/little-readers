import { PortalShell } from "@/components/PortalShell";

export default function SchoolAdminPortalPage() {
  return (
    <PortalShell
      portalLabel="School Admin portal"
      title="School operations"
      phaseReady="Classes, sections, teachers and students start in Phase 4."
    >
      <ul>
        <li>Academic year, classes, sections</li>
        <li>Teacher & student allocation</li>
        <li>School subscription & renewal details</li>
        <li>Class and student reports</li>
      </ul>
    </PortalShell>
  );
}
