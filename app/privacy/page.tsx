import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | Heritage Chili Cookoff",
  description: "How the Heritage Chili Cookoff uses and protects attendee information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="The plain-language version"
      title="Privacy Policy"
      summary="We collect only what we need to organize the cookoff, run voting, and support the Heritage family adoption fundraiser. We do not sell your information."
    >
      <section>
        <h2>Information we collect</h2>
        <p>
          When you sign in or participate, we may collect your username, email address,
          party size, RSVP selections, chili entry details and images, check-in status, pledges, and
          votes. We do not ask for children&apos;s names or other information about individual members
          of your party.
        </p>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>
          We use this information to manage attendance, identify contestants, operate check-in and
          voting, display cookoff entries and results, track fundraiser pledges, prevent misuse, and
          communicate about the event when necessary.
        </p>
      </section>

      <section>
        <h2>Pledges and donations</h2>
        <p>
          A pledge recorded on this site is an expression of intent, not a payment. Donations are
          completed through GoFundMe. We do not collect or store credit-card, bank-account, or other
          payment information. GoFundMe handles donations under its own privacy policy and terms.
        </p>
      </section>

      <section>
        <h2>Services that help run the site</h2>
        <p>
          We use Clerk for sign-in and identity services, ChatGPT Sites and its hosting providers to
          operate the application, and GoFundMe for donations. Those providers may process limited
          information as needed to provide their services and apply their own privacy practices.
        </p>
      </section>

      <section>
        <h2>Sharing and selling</h2>
        <p>
          We do not sell, rent, or trade personal information. Event organizers can access the
          information needed to operate the cookoff. We may also disclose information when required
          by law or when reasonably necessary to protect participants, the fundraiser, or the site.
        </p>
      </section>

      <section>
        <h2>Retention and your choices</h2>
        <p>
          We keep event information only as long as it remains useful for administering the
          fundraiser, maintaining its records, or resolving a problem. To ask about, correct, or
          request deletion of your information, contact the organizer through the Heritage Family
          Adoption Fund campaign linked from this site.
        </p>
      </section>
    </LegalPage>
  );
}
