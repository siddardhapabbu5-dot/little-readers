import type { AgeGroupCode, LearningLevelCode } from "@little-readers/types";

export const APP_NAME = "LEARN WISE";
export const APP_TAGLINE = "Kids Learning Academy";

export const AGE_GROUPS: Record<
  AgeGroupCode,
  { label: string; ageMin: number; ageMax: number }
> = {
  LEVEL_1: { label: "Grade 1", ageMin: 1, ageMax: 3 },
  LEVEL_2: { label: "Grade 2", ageMin: 4, ageMax: 6 },
  LEVEL_3: { label: "Grade 3", ageMin: 7, ageMax: 9 },
  LEVEL_4: { label: "Grade 4", ageMin: 10, ageMax: 12 },
  // Legacy placement codes (kept for older child rows)
  FOUNDATION: { label: "Foundation", ageMin: 3, ageMax: 5 },
  ELEMENTARY: { label: "Elementary", ageMin: 6, ageMax: 8 },
  ADVANCED: { label: "Advanced", ageMin: 9, ageMax: 12 },
};

/** Map birth year → four-grade learning level (LEVEL_1…LEVEL_4). */
export function inferLevelFromBirthYear(
  birthYear: number,
  referenceYear = new Date().getFullYear()
): LearningLevelCode {
  const age = referenceYear - birthYear;
  if (age <= 3) return "LEVEL_1";
  if (age <= 6) return "LEVEL_2";
  if (age <= 9) return "LEVEL_3";
  return "LEVEL_4";
}

export function publicUserFields<T extends { passwordHash?: string }>(
  user: T
): Omit<T, "passwordHash"> {
  const { passwordHash: _removed, ...rest } = user;
  return rest;
}

export type LegalSection = { heading: string; paragraphs: string[] };

/** Published Terms of Service shown in the app and on the website. Keep in sync with the admin PDF. */
export const TERMS_OF_SERVICE: {
  title: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
} = {
  title: "LEARN WISE Terms of Service",
  version: "1.0",
  effectiveDate: "7 November 2026",
  sections: [
    {
      heading: "1. About these Terms",
      paragraphs: [
        "These Terms of Service (“Terms”) govern access to and use of LEARN WISE, a parent-guided learning application operated by SIWI (“LEARN WISE”, “we”, “us” or “our”).",
        "Business address: India\nSupport: littlereaders.otp@gmail.com\nWebsite: https://siwiapp.shop",
      ],
    },
    {
      heading: "2. Acceptance and authority",
      paragraphs: [
        "By creating an account or using the Service, the account holder agrees to these Terms and the published Privacy Policy. A person creating or managing a child profile represents that they are the child's parent or legal guardian, or are otherwise legally authorised to do so.",
        "If you do not agree to these Terms, do not create an account or use the Service.",
      ],
    },
    {
      heading: "3. Accounts and registration",
      paragraphs: [
        "You must provide accurate, current account information and keep your email address secure and accessible. Email verification may be required for registration and password recovery.",
        "You are responsible for activity carried out through your account and must promptly notify us of suspected unauthorised access at littlereaders.otp@gmail.com.",
        "The parent account manages child learning profiles. A child profile is not an independent parent account and does not give the child authority to purchase subscriptions or change parent settings.",
      ],
    },
    {
      heading: "4. Parent and guardian responsibilities",
      paragraphs: [
        "You agree to supervise the child's use of the Service, use age-appropriate settings, keep account credentials private, and ensure information you provide is accurate and appropriate.",
        "Do not enter sensitive information about a child unless it is specifically requested, necessary and covered by the applicable notice.",
      ],
    },
    {
      heading: "5. Learning features and educational purpose",
      paragraphs: [
        "The Service may provide listening, spelling, matching, quizzes, revision, learning progress, rewards, stars, points and daily goals. These features are intended as educational practice and are not a guarantee of academic results, school admission, certification or a particular learning outcome.",
        "Content and features may be updated, changed or discontinued. Parents should use their own judgement in selecting activities appropriate for their child.",
      ],
    },
    {
      heading: "6. Acceptable use",
      paragraphs: [
        "You must not misuse the Service, attempt unauthorised access, interfere with its operation, upload unlawful or harmful material, infringe another person's rights, reverse engineer or disrupt the Service except where applicable law permits, or use the Service to harm or exploit a child.",
        "We may investigate suspected misuse and take proportionate action, including restricting access, where reasonably necessary and lawful.",
      ],
    },
    {
      heading: "7. Subscriptions, fees and payments",
      paragraphs: [
        "Any paid features, prices, billing periods, taxes, renewal terms, cancellation rules and refund conditions will be shown before purchase in the applicable offer or checkout.",
        "Payment processing may be handled by a third-party payment provider. We may receive transaction references and subscription status, but payment credentials are handled by the provider.",
        "Paid plans are not currently on sale. Subscription, renewal, cancellation, refund and tax terms will be published before paid plans launch.",
      ],
    },
    {
      heading: "8. Device and child-seat limits",
      paragraphs: [
        "The Service may enforce device registration, device transfer controls and limits on the number of active child profiles or seats included in a subscription. The current limits and transfer procedure are shown in the app and at purchase.",
        "Current product rules: one registered mobile device at a time per subscription/account as configured; up to two active child seats where included in the purchased plan; additional seats or device transfers may require an applicable entitlement or administrator action. The actual plan terms shown at purchase control.",
      ],
    },
    {
      heading: "9. Privacy and child protection",
      paragraphs: [
        "Our collection and use of personal information is described in the published Privacy Policy. A parent or guardian must complete the required consent process before a child profile is created.",
        "Parents can contact littlereaders.otp@gmail.com to ask about access, correction, deletion or withdrawal of consent, subject to applicable law.",
      ],
    },
    {
      heading: "10. Intellectual property and content",
      paragraphs: [
        "The Service, software, branding, design, text, graphics and learning materials are owned by or licensed to LEARN WISE and are protected by applicable intellectual-property laws.",
        "You receive a limited, personal, non-exclusive, non-transferable and revocable permission to use the Service for its intended educational purpose, subject to these Terms. You may not copy, redistribute or commercially exploit our content without permission, except as permitted by law.",
      ],
    },
    {
      heading: "11. Availability, changes and support",
      paragraphs: [
        "We aim to keep the Service available but do not guarantee uninterrupted or error-free operation. Maintenance, outages, network issues, third-party services or security events may affect availability.",
        "We may update features or these Terms. Where a change materially affects users or requires renewed consent, we will provide notice or obtain consent as required by law.",
        "Support contact: littlereaders.otp@gmail.com",
      ],
    },
    {
      heading: "12. Suspension and termination",
      paragraphs: [
        "You may stop using the Service and request account closure through the in-app option Profile > Privacy & data requests (protected by the parent PIN) or by emailing littlereaders.otp@gmail.com.",
        "We may suspend or terminate access where necessary to protect users, address serious misuse, comply with law or enforce these Terms. We will act proportionately and provide notice where appropriate and lawful.",
        "Deletion and retention of personal information will be handled as described in the Privacy Policy and applicable law.",
      ],
    },
    {
      heading: "13. Disclaimers and liability",
      paragraphs: [
        "To the extent permitted by applicable law, the Service is provided on an “as available” basis. Nothing in these Terms excludes a right or remedy that cannot lawfully be excluded.",
        "Any limitation of liability is subject to applicable consumer-protection law and does not exclude liability for matters that cannot legally be excluded, including any non-excludable liability for fraud, wilful misconduct or personal injury where applicable.",
      ],
    },
    {
      heading: "14. Governing law and disputes",
      paragraphs: [
        "These Terms are governed by the laws of India, subject to mandatory consumer and other legal protections. Courts or forums with jurisdiction under applicable law may hear disputes.",
      ],
    },
    {
      heading: "15. Contact and document details",
      paragraphs: [
        "Operator: SIWI\nAddress: India\nSupport: littlereaders.otp@gmail.com\nPrivacy: littlereaders.otp@gmail.com\nVersion: 1.0\nEffective date: 7 November 2026",
      ],
    },
  ],
};
