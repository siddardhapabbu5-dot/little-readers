import { PortalShell } from "@/components/PortalShell";

export default function StudentPortalPage() {
  return (
    <PortalShell
      tone="student"
      portalLabel="Student portal"
      title="My learning"
      phaseReady="Daily tasks and lessons open in Phase 6. Colourful Kids Zone remains at /kids."
    >
      <p>
        <a href="/kids" style={{ fontWeight: 800 }}>
          Open Kids Zone →
        </a>
      </p>
      <ul>
        <li>Daily tasks & my lessons</li>
        <li>Alphabet, phonics, reading, spelling</li>
        <li>Quizzes, challenge zone, revision</li>
        <li>Rewards & certificates</li>
      </ul>
    </PortalShell>
  );
}
