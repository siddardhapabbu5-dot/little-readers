/**
 * Left-side kids artwork on the login page.
 * Classroom kids photo from /public/images.
 */
export function LoginIllustration() {
  return (
    <div className="lr-kids-art">
      <img
        src="/images/kids-readers-classroom.png?v=2"
        alt="Happy children reading books together"
        className="lr-kids-photo"
        width={640}
        height={420}
        decoding="async"
      />
    </div>
  );
}
