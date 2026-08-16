import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use | Heritage Chili Cookoff",
  description: "Terms for using the Heritage Chili Cookoff fundraiser website.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Keep it kind. Keep it honest."
      title="Terms of Use"
      summary="These terms keep the fundraiser fair, useful, and pleasantly low on nonsense. By using the site, you agree to the rules below."
    >
      <section>
        <h2>Purpose of the site</h2>
        <p>
          This site supports a community chili cookoff and adoption fundraiser. It provides RSVP,
          chili-entry, check-in, pledge, voting, results, and organizer tools. It is not an online
          store, payment processor, or professional fundraising service.
        </p>
      </section>

      <section>
        <h2>Your account and information</h2>
        <p>
          Provide accurate information, use an account you are authorized to use, and keep your
          sign-in secure. Do not impersonate another participant, manipulate another person&apos;s
          entry, or attempt to access organizer features without permission.
        </p>
      </section>

      <section>
        <h2>Entries, images, and conduct</h2>
        <p>
          Only submit chili information and images you have the right to share. Keep names,
          descriptions, and images appropriate for a family and community event. Organizers may edit,
          hide, deactivate, or remove content or participation when needed to operate the event or
          protect its participants.
        </p>
      </section>

      <section>
        <h2>Voting and results</h2>
        <p>
          Use only the votes assigned to your party or granted by an organizer. Do not automate,
          duplicate, interfere with, or otherwise manipulate voting. Organizers may correct obvious
          errors, disqualify entries, pause voting, reopen voting, or finalize results. Their
          reasonable decisions about event administration are final.
        </p>
      </section>

      <section>
        <h2>Pledges and donations</h2>
        <p>
          Pledges made on this site are voluntary statements of intent and are not payments or
          legally binding purchase commitments. Donations are handled separately by GoFundMe and are
          subject to GoFundMe&apos;s terms. Participation is not conditioned on making a donation.
        </p>
      </section>

      <section>
        <h2>Availability and responsibility</h2>
        <p>
          We aim to keep the site accurate and available, but a small community event site may
          experience interruptions, mistakes, or last-minute changes. Use of the site is at your own
          risk. To the extent permitted by law, the organizers are not responsible for indirect or
          unexpected losses arising from use of the site.
        </p>
      </section>

      <section>
        <h2>Changes and questions</h2>
        <p>
          We may update these terms when the event or site changes. The date below shows the latest
          revision. Questions can be sent to the organizer through the Heritage Family Adoption Fund
          campaign linked from this site.
        </p>
      </section>
    </LegalPage>
  );
}
