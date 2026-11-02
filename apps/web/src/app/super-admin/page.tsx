import { PortalShell } from "@/components/PortalShell";

export default function SuperAdminPortalPage() {
  return (
    <PortalShell
      tone="dark"
      portalLabel="Super Admin portal"
      title="Platform control"
      phaseReady="School registration, licenses, packages and audit logs start in Phase 3."
    >
      <ul>
        <li>School registration / verification / activation</li>
        <li>Annual license & capacity management</li>
        <li>Package pricing (Starter → Enterprise)</li>
        <li>Curriculum approval & analytics</li>
      </ul>
    </PortalShell>
  );
}
