import type { BusinessDetails as Details } from "@/lib/public-data";

export function BusinessDetails({ details }: { details: Details }) {
  return (
    <address style={{ fontStyle: "normal", lineHeight: 1.7 }}>
      <strong>{details.legalName}</strong> (operator of LEARN WISE)
      <br />
      {details.address ? (
        <>
          <span style={{ whiteSpace: "pre-wrap" }}>{details.address}</span>
          <br />
        </>
      ) : null}
      {details.country && details.country !== details.address ? (
        <>
          {details.country}
          <br />
        </>
      ) : null}
      Email: <a href={`mailto:${details.email}`}>{details.email}</a>
      <br />
      {details.phone ? (
        <>
          Phone: <a href={`tel:${details.phone.replace(/\s+/g, "")}`}>{details.phone}</a>
          <br />
        </>
      ) : null}
      Website: <a href={details.website}>{details.website}</a>
    </address>
  );
}
