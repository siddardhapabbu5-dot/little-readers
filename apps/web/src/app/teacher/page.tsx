import { PortalShell } from "@/components/PortalShell";

export default function TeacherPortalPage() {
  return (
    <PortalShell
      portalLabel="Teacher portal"
      title="Teaching console"
      phaseReady="Assignments and completion tracking start in Phase 5."
    >
      <ul>
        <li>Assigned classes & student lists</li>
        <li>Individual / group / class assignments</li>
        <li>Reading, spelling, phonics, speaking tasks</li>
        <li>Weak-student identification & remediation</li>
      </ul>
    </PortalShell>
  );
}
